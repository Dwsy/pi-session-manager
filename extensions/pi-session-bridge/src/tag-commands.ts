import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { BridgeConnection } from "./ws-bridge.ts";
import {
  getTagsForSession, refreshTagCache, getCachedTags, getOrCreateTag,
  moveSessionTag, removeTag, BUILTIN_TAG_MAP, TAG_NAMES,
} from "./tag-db.ts";
import type { Tag } from "./types.ts";

function getSessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId() || "";
}

function notifyPsmTagChange(sessionId: string, conn: BridgeConnection | null) {
  if (!conn?.state || conn.state !== "connected") return;
  const tagsResult = getTagsForSession(sessionId);
  const tags = tagsResult.success ? (tagsResult.data || []) : [];
  conn.send({ type: "session_tag_changed", payload: { sessionId, tags } });
}

export function registerTagCommands(pi: ExtensionAPI, sessionId: () => string, conn: () => BridgeConnection | null) {
  pi.registerCommand("state", {
    description: "Show current session tag status",
    handler: async (_args, ctx) => {
      const sid = getSessionId(ctx);
      if (!sid) { ctx.ui.notify("❌ Cannot get session ID", "error"); return; }
      const [tagsResult] = await Promise.all([getTagsForSession(sid), refreshTagCache()]);
      const currentTags = tagsResult.success ? (tagsResult.data || []) : [];
      const lines = [
        `📋 Session: ${sid.slice(0, 8)}...`,
        `🎯 Active: ${currentTags.length > 0 ? currentTags.map((t: Tag) => t.name).join(", ") : "none"}`,
        "", "📚 Available:",
        ...getCachedTags().map((t: Tag) => `  ${currentTags.some((ct: Tag) => ct.id === t.id) ? "✓" : "○"} ${t.name}`),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("state-set", {
    description: "Set session status tag",
    getArgumentCompletions: (prefix: string) =>
      ["todo", "wip", "done", "important", "archive"]
        .filter(t => t.includes(prefix.toLowerCase()))
        .map(t => ({ value: t, label: t })),
    handler: async (args: string, ctx) => {
      const tagName = args.trim();
      if (!tagName) { ctx.ui.notify("❌ Specify a tag: /state-set wip", "error"); return; }
      const sid = getSessionId(ctx);
      if (!sid) { ctx.ui.notify("❌ Cannot get session ID", "error"); return; }
      const normalized = tagName.toLowerCase();
      const builtinId = BUILTIN_TAG_MAP[normalized];
      await refreshTagCache();
      let targetTag = getCachedTags().find((t: Tag) => t.id === builtinId || t.name.toLowerCase() === normalized);
      if (!targetTag) {
        const created = getOrCreateTag(tagName, "info");
        if (!created.success) { ctx.ui.notify(`❌ Creation failed: ${created.error}`, "error"); return; }
        targetTag = created.data!;
      }
      const result = moveSessionTag(sid, null, targetTag.id);
      if (result.success) notifyPsmTagChange(sid, conn());
      ctx.ui.notify(result.success ? `✅ ${targetTag.name}` : `❌ ${result.error}`, result.success ? "info" : "error");
    },
  });

  pi.registerCommand("state-list", {
    description: "List all available status tags",
    handler: async (_args, ctx) => {
      await refreshTagCache();
      const builtin = getCachedTags().filter((t: Tag) => t.isBuiltin);
      const custom = getCachedTags().filter((t: Tag) => !t.isBuiltin);
      ctx.ui.notify([
        "📚 Available Tags",
        `🔧 System: ${builtin.map((t: Tag) => t.name).join(", ")}`,
        `🏷️ Custom: ${custom.length > 0 ? custom.map((t: Tag) => t.name).join(", ") : "none"}`,
      ].join("\n"), "info");
    },
  });

  pi.registerCommand("state-clear", {
    description: "Clear all tags from current session",
    handler: async (_args, ctx) => {
      const sid = getSessionId(ctx);
      if (!sid) { ctx.ui.notify("❌ Cannot get session ID", "error"); return; }
      const current = getTagsForSession(sid);
      const tags = current.success ? (current.data || []) : [];
      if (tags.length === 0) { ctx.ui.notify("ℹ️ No active tags", "info"); return; }
      for (const tag of tags) removeTag(sid, tag.id);
      notifyPsmTagChange(sid, conn());
      ctx.ui.notify(`✅ Cleared ${tags.length} tags`, "info");
    },
  });

  pi.registerCommand("flow", {
    description: "Quick transitions: start(wip) / done / hold(todo) / important / archive",
    getArgumentCompletions: () => [
      { value: "start", label: "Start (→ WIP)" },
      { value: "done", label: "Done (→ Complete)" },
      { value: "hold", label: "Hold (→ Todo)" },
    ],
    handler: async (args: string, ctx) => {
      const action = args.trim().toLowerCase();
      const sid = getSessionId(ctx);
      if (!sid) { ctx.ui.notify("❌ Cannot get session ID", "error"); return; }
      const transitions: Record<string, { from: string | null; to: string }> = {
        "start": { from: "builtin-todo", to: "builtin-wip" },
        "wip": { from: null, to: "builtin-wip" },
        "done": { from: "builtin-wip", to: "builtin-done" },
        "hold": { from: "builtin-wip", to: "builtin-todo" },
        "todo": { from: null, to: "builtin-todo" },
        "important": { from: null, to: "builtin-important" },
        "archive": { from: null, to: "builtin-archive" },
      };
      const transition = transitions[action];
      if (!transition) { ctx.ui.notify("❌ Unknown action: start/done/hold/todo/important/archive", "error"); return; }
      const result = moveSessionTag(sid, transition.from, transition.to);
      if (result.success) notifyPsmTagChange(sid, conn());
      const fromName = transition.from ? (TAG_NAMES[transition.from] || transition.from) : "none";
      const toName = TAG_NAMES[transition.to] || transition.to;
      ctx.ui.notify(result.success ? `✅ ${fromName} → ${toName}` : `❌ ${result.error}`, result.success ? "info" : "error");
    },
  });
}
