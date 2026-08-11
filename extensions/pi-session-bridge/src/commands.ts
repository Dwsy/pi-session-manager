/**
 * Commands — single entry point: /psm
 *
 * All operations through one interactive panel.
 * No other slash commands — no fragmentation.
 * Single action per invocation (no blocking while loop).
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as connMgr from "./connection-manager.js";
import * as kanbanStore from "./kanban-store.js";
import { openPsmSession } from "./open-psm.js";
import type { TagItem } from "./types.js";

export type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>;

interface CommandDef { name: string; description: string; handler: CommandHandler }
const commandDefs: CommandDef[] = [];

function register(name: string, description: string, handler: CommandHandler) {
  commandDefs.push({ name, description, handler });
}

export function registerAll(pi: ExtensionAPI) {
  for (const def of commandDefs) {
    pi.registerCommand(def.name, {
      description: def.description,
      handler: def.handler,
    });
  }
}

// ── Helpers ───────────────────────────────────────────

function statusLines(): string[] {
  const conn = connMgr.getConnection();
  const state = conn?.state ?? "disconnected";
  const live = connMgr.isLiveEnabled();
  const sid = connMgr.getSessionId();
  const icon = state === "connected" ? "●" : state === "reconnecting" ? "◐" : "○";
  return [
    `  Status:    ${icon} ${state}`,
    `  Live Mode: ${live ? "ON" : "OFF"}`,
    `  Session:   ${sid ? sid.slice(0, 12) + "..." : "none"}`,
  ];
}

async function getTagsWithStatus(sid: string): Promise<{ tag: TagItem; assigned: boolean }[]> {
  const [allTags, allSessionTags] = await Promise.all([
    kanbanStore.getAllTags(),
    kanbanStore.getAllSessionTags(),
  ]);
  const assignedIds = new Set(
    allSessionTags.filter((st) => st.session_id === sid).map((st) => st.tag_id),
  );
  return allTags.map((tag) => ({ tag, assigned: assignedIds.has(tag.id) }));
}

function getActiveSessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager?.getSessionId?.() || connMgr.getSessionId();
}

// ── /open-in-pms — Open current session in PSM ───────

async function openInPsmCommand(args: string, ctx: ExtensionContext) {
  const sid = getActiveSessionId(ctx);
  if (!sid) {
    ctx.ui.notify("No session", "error");
    return;
  }

  try {
    const result = await openPsmSession(sid, args);
    ctx.ui.notify(result.mode === "cli" || result.mode === "web" ? "Opened PSM web session" : "Opened PSM desktop session", "info");
  } catch (err) {
    ctx.ui.notify(`Failed to open PSM: ${err}`, "error");
  }
}

register("open-in-psm", "Open current session in Pi Session Manager", openInPsmCommand);

// ── /psm — Single-action panel ────────────────────────

register("psm", "PSM bridge panel", async (_args, ctx) => {
  const conn = connMgr.getConnection();
  const state = conn?.state ?? "disconnected";
  const live = connMgr.isLiveEnabled();
  const connected = state === "connected";

  const connLabel = connected ? "○ Disconnect" : "● Connect";
  const liveLabel = live ? "● Live: ON  (toggle off)" : "○ Live: OFF (toggle on)";

  const choice = await ctx.ui.select(
    `PSM Bridge\n${statusLines().join("\n")}`,
    [connLabel, liveLabel, "─── Tags ───", "  Manage Tags...", "  Clear All Tags", "───", "  Close"],
  );

  if (!choice || choice.includes("Close")) return;

  // ── Connect / Disconnect ──
  if (choice.includes("Connect") || choice.includes("Disconnect")) {
    if (connected) {
      connMgr.doDisconnect();
      ctx.ui.notify("Disconnected", "info");
    } else {
      connMgr.doConnect();
      ctx.ui.notify("Connecting...", "info");
    }
    return;
  }

  // ── Live toggle ──
  if (choice.includes("Live")) {
    if (live) connMgr.disableLiveMode();
    else connMgr.enableLiveMode(ctx);
    ctx.ui.notify(`Live mode ${live ? "OFF" : "ON"}`, "info");
    return;
  }

  // ── Manage Tags (nested select, has its own loop with break) ──
  if (choice.includes("Manage Tags")) {
    const sid = getActiveSessionId(ctx);
    if (!sid) { ctx.ui.notify("No session", "error"); return; }

    while (true) {
      const tagsWithStatus = await getTagsWithStatus(sid);
      const tagOptions = tagsWithStatus.map(
        ({ tag, assigned }) => `${assigned ? "●" : "○"} ${tag.name}`,
      );
      tagOptions.push("← Back");

      const tagChoice = await ctx.ui.select("Session Tags", tagOptions);
      if (!tagChoice || tagChoice.includes("Back")) break;

      const tagName = tagChoice.replace(/^[●○]\s*/, "");
      const entry = tagsWithStatus.find((t) => t.tag.name === tagName);
      if (!entry) continue;

      try {
        if (entry.assigned) {
          await kanbanStore.removeTagFromSession(sid, entry.tag.id);
          ctx.ui.notify(`Removed: ${tagName}`, "info");
        } else {
          await kanbanStore.moveSessionTag(sid, null, entry.tag.id, 0);
          ctx.ui.notify(`Set: ${tagName}`, "info");
        }
        connMgr.notifyPsmTagChange(sid, []);
      } catch (err) {
        ctx.ui.notify(`Error: ${err}`, "error");
      }
    }
    return;
  }

  // ── Clear All Tags ──
  if (choice.includes("Clear All")) {
    const sid = getActiveSessionId(ctx);
    if (!sid) { ctx.ui.notify("No session", "error"); return; }
    const tagsWithStatus = await getTagsWithStatus(sid);
    const assigned = tagsWithStatus.filter((t) => t.assigned);
    if (assigned.length === 0) { ctx.ui.notify("No tags to clear", "info"); return; }
    const ok = await ctx.ui.confirm("Clear Tags", `Remove ${assigned.length} tag(s)?`);
    if (ok) {
      for (const { tag } of assigned) {
        await kanbanStore.removeTagFromSession(sid, tag.id);
      }
      connMgr.notifyPsmTagChange(sid, []);
      ctx.ui.notify(`Cleared ${assigned.length} tags`, "info");
    }
    return;
  }
});
