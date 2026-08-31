/**
 * Commands — bridge control plus Kanban tags.
 *
 * Keep connection/liveness under /psm and session tagging under /kanban.
 * Stuffing both into one tiny select menu was not UX, it was archaeology.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import * as connMgr from "./connection-manager.js";
import * as kanbanStore from "./kanban-store.js";
import { openPsmSession } from "./open-psm.js";
import type { TagItem } from "./types.js";

export type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>;

type CustomTui = { requestRender: (force?: boolean) => void };
type CustomTheme = {
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
};
type CustomComponent = {
  readonly width?: number;
  render(width: number): string[];
  invalidate(): void;
  handleInput?(data: string): void;
};
type KanbanAction = "up" | "down" | "toggle" | "clear" | "new" | "refresh" | "close";
type KanbanPanelResult = "new" | undefined;

type TagStatus = { tag: TagItem; assigned: boolean };

const KANBAN_POPUP_WIDTH = 70;

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

async function getTagsWithStatus(sid: string): Promise<TagStatus[]> {
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
  const manager = ctx.sessionManager as { getSessionId?: () => string | undefined } | undefined;
  return manager?.getSessionId?.() || connMgr.getSessionId();
}

function shortSessionId(sid: string): string {
  return sid ? `${sid.slice(0, 12)}...` : "none";
}

export function parseKanbanInput(data: string): KanbanAction | null {
  if (data === "\u001b[A" || data === "k") return "up";
  if (data === "\u001b[B" || data === "j") return "down";
  if (data === "\r" || data === "\n" || data === " ") return "toggle";
  if (data === "c" || data === "C") return "clear";
  if (data === "n" || data === "N") return "new";
  if (data === "r" || data === "R") return "refresh";
  if (data === "q" || data === "Q" || data === "\u001b") return "close";
  return null;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function formatAssigned(tags: TagStatus[]): string {
  const assigned = tags.filter((entry) => entry.assigned).map((entry) => entry.tag.name);
  return assigned.length > 0 ? assigned.join(", ") : "none";
}

function color(theme: CustomTheme, name: ThemeColor, text: string): string {
  return theme.fg(name, text);
}

function bold(theme: CustomTheme, text: string): string {
  return theme.bold(text);
}

/**
 * PSM tag colors are business/UI tokens, not Pi theme tokens.
 * Never pass a persisted tag color directly to theme.fg(): Theme throws on unknown names.
 */
export function mapKanbanTagColorToTheme(tagColor: string | null | undefined): ThemeColor {
  switch (tagColor) {
    case "success":
    case "emerald":
      return "success";
    case "warning":
    case "amber":
      return "warning";
    case "destructive":
      return "error";
    case "slate":
      return "muted";
    case "info":
    case "purple":
    case "pink":
    case "indigo":
    case "cyan":
    case "ring":
    default:
      return "accent";
  }
}

function tagColor(tag: TagItem): ThemeColor {
  return mapKanbanTagColorToTheme(tag.color);
}

function renderTagLine(entry: TagStatus, selected: boolean, theme: CustomTheme): string {
  const cursor = selected ? color(theme, "accent", ">") : " ";
  const checked = entry.assigned
    ? color(theme, tagColor(entry.tag), "[x]")
    : color(theme, "dim", "[ ]");
  const name = selected
    ? color(theme, "accent", bold(theme, entry.tag.name))
    : color(theme, tagColor(entry.tag), entry.tag.name);
  const builtin = entry.tag.is_builtin ? ` ${color(theme, "dim", "builtin")}` : "";
  return `${cursor} ${checked} ${name}${builtin}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function truncatePlainLine(line: string, width: number): string {
  const plain = stripAnsi(line);
  let out = "";
  let used = 0;
  for (const char of Array.from(plain)) {
    const next = visibleWidth(char);
    if (used + next > Math.max(0, width - 1)) return `${out}…`;
    out += char;
    used += next;
  }
  return out;
}

function fitLine(line: string, width: number): string {
  return visibleWidth(line) > width ? truncatePlainLine(line, width) : line;
}

function frameLine(line: string, width: number, theme: CustomTheme): string {
  const innerWidth = Math.max(1, width - 2);
  const clipped = fitLine(line, innerWidth);
  const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
  return `${color(theme, "border", "│")}${clipped}${padding}${color(theme, "border", "│")}`;
}

function renderPopup(lines: string[], width: number, theme: CustomTheme): string[] {
  const safeWidth = Math.max(32, width);
  const innerWidth = safeWidth - 2;
  return [
    color(theme, "border", `╭${"─".repeat(innerWidth)}╮`),
    ...lines.map((line) => frameLine(line, safeWidth, theme)),
    color(theme, "border", `╰${"─".repeat(innerWidth)}╯`),
  ];
}

async function showKanbanPanel(ctx: ExtensionContext, sid: string): Promise<KanbanPanelResult> {
  let tags = await getTagsWithStatus(sid);
  let selected = clampIndex(0, tags.length);
  let message = "Enter/Space toggle · c clear · n new tag · r refresh · q close";
  let busy = false;

  async function refresh(): Promise<void> {
    tags = await getTagsWithStatus(sid);
    selected = clampIndex(selected, tags.length);
  }

  return ctx.ui.custom((tuiUnknown, themeUnknown, _kb, done) => {
    const tui = tuiUnknown as CustomTui;
    const theme = themeUnknown as CustomTheme;

    async function run(action: KanbanAction): Promise<void> {
      if (busy) return;

      if (action === "close") {
        done(undefined);
        return;
      }

      if (action === "new") {
        done("new");
        return;
      }

      if (action === "up") {
        selected = clampIndex(selected - 1, tags.length);
        tui.requestRender();
        return;
      }

      if (action === "down") {
        selected = clampIndex(selected + 1, tags.length);
        tui.requestRender();
        return;
      }

      busy = true;
      try {
        if (action === "refresh") {
          await refresh();
          message = "Refreshed";
          return;
        }

        if (action === "clear") {
          const assigned = tags.filter((entry) => entry.assigned);
          for (const entry of assigned) {
            await kanbanStore.removeTagFromSession(sid, entry.tag.id);
          }
          connMgr.notifyPsmTagChange(sid, []);
          await refresh();
          message = assigned.length > 0 ? `Cleared ${assigned.length} tag(s)` : "No tags to clear";
          return;
        }

        const entry = tags[selected];
        if (!entry) {
          message = "No tags yet. Press n to create one.";
          return;
        }

        if (entry.assigned) {
          await kanbanStore.removeTagFromSession(sid, entry.tag.id);
          message = `Removed: ${entry.tag.name}`;
        } else {
          await kanbanStore.moveSessionTag(sid, null, entry.tag.id, 0);
          message = `Set: ${entry.tag.name}`;
        }
        connMgr.notifyPsmTagChange(sid, []);
        await refresh();
      } catch (err) {
        message = `Error: ${err}`;
      } finally {
        busy = false;
        tui.requestRender();
      }
    }

    const component: CustomComponent = {
      width: KANBAN_POPUP_WIDTH,
      render(width: number) {
        const popupWidth = Math.min(KANBAN_POPUP_WIDTH, Math.max(32, width || KANBAN_POPUP_WIDTH));
        const title = `Kanban Tags — session ${shortSessionId(sid)}`;
        const body = tags.length > 0
          ? tags.map((entry, index) => renderTagLine(entry, index === selected, theme))
          : [color(theme, "dim", "  No tags yet. Press n to create one.")];
        const status = busy
          ? color(theme, "warning", "Working...")
          : color(theme, message.startsWith("Error:") ? "error" : "dim", message);
        const lines = [
          ` ${color(theme, "accent", bold(theme, title))}`,
          ` ${color(theme, "dim", "Assigned:")} ${color(theme, "accent", formatAssigned(tags))}`,
          "",
          ...body,
          "",
          ` ${status}`,
        ];
        return renderPopup(lines, popupWidth, theme);
      },
      invalidate() {},
      handleInput(data: string) {
        const action = parseKanbanInput(data);
        if (!action) return;
        void run(action);
      },
    };

    return component;
  }, { overlay: true }) as Promise<KanbanPanelResult>;
}

// ── /open-in-psm — Open current session in PSM ───────

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

// ── /psm — Bridge connection panel ───────────────────

register("psm", "PSM bridge connection panel", async (_args, ctx) => {
  const conn = connMgr.getConnection();
  const state = conn?.state ?? "disconnected";
  const live = connMgr.isLiveEnabled();
  const connected = state === "connected";

  const connLabel = connected ? "○ Disconnect" : "● Connect";
  const liveLabel = live ? "● Live: ON  (toggle off)" : "○ Live: OFF (toggle on)";

  const choice = await ctx.ui.select(
    `PSM Bridge\n${statusLines().join("\n")}`,
    [connLabel, liveLabel, "  Close"],
  );

  if (!choice || choice.includes("Close")) return;

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

  if (choice.includes("Live")) {
    if (live) connMgr.disableLiveMode();
    else connMgr.enableLiveMode(ctx);
    ctx.ui.notify(`Live mode ${live ? "OFF" : "ON"}`, "info");
  }
});

// ── /kanban — Custom TUI tag popup ───────────────────

register("kanban", "Manage current session Kanban tags", async (_args, ctx) => {
  const sid = getActiveSessionId(ctx);
  if (!sid) {
    ctx.ui.notify("No session", "error");
    return;
  }

  if ((ctx as { mode?: string }).mode !== "tui") {
    ctx.ui.notify("/kanban requires TUI mode", "error");
    return;
  }

  while (true) {
    const result = await showKanbanPanel(ctx, sid);
    if (result !== "new") return;

    const name = (await ctx.ui.input("New Kanban tag name"))?.trim();
    if (!name) return;

    try {
      const tag = await kanbanStore.createTag(name, "info");
      await kanbanStore.moveSessionTag(sid, null, tag.id, 0);
      connMgr.notifyPsmTagChange(sid, []);
      ctx.ui.notify(`Created and set: ${tag.name}`, "info");
    } catch (err) {
      ctx.ui.notify(`Failed to create tag: ${err}`, "error");
      return;
    }
  }
});
