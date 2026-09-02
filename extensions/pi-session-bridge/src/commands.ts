/**
 * Commands — bridge control plus Kanban Status / Labels.
 *
 * /psm owns connection/liveness. /kanban owns workflow metadata.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import * as connMgr from "./connection-manager.js";
import * as kanbanStore from "./kanban-store.js";
import { openPsmSession } from "./open-psm.js";
import type { LabelItem, StatusItem } from "./types.js";

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
type KanbanAction = "up" | "down" | "toggle" | "clear-status" | "new-status" | "new-label" | "refresh" | "close";
type KanbanPanelResult = "new-status" | "new-label" | undefined;
type KanbanItem =
  | { kind: "status"; status: StatusItem; active: boolean }
  | { kind: "label"; label: LabelItem; assigned: boolean };

const KANBAN_POPUP_WIDTH = 76;

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
  if (data === "c" || data === "C") return "clear-status";
  if (data === "s" || data === "S") return "new-status";
  if (data === "l" || data === "L") return "new-label";
  if (data === "r" || data === "R") return "refresh";
  if (data === "q" || data === "Q" || data === "\u001b") return "close";
  return null;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function color(theme: CustomTheme, name: ThemeColor, text: string): string {
  return theme.fg(name, text);
}

function bold(theme: CustomTheme, text: string): string {
  return theme.bold(text);
}

/** Host status colors are business/UI tokens, not Pi theme tokens. */
export function mapKanbanStatusColorToTheme(statusColor: string | null | undefined): ThemeColor {
  switch (statusColor) {
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

function statusThemeColor(status: StatusItem): ThemeColor {
  return mapKanbanStatusColorToTheme(status.color);
}

function renderStatusLine(entry: Extract<KanbanItem, { kind: "status" }>, selected: boolean, theme: CustomTheme): string {
  const cursor = selected ? color(theme, "accent", ">") : " ";
  const marker = entry.active
    ? color(theme, statusThemeColor(entry.status), "(●)")
    : color(theme, "dim", "( )");
  const name = selected
    ? color(theme, "accent", bold(theme, entry.status.name))
    : color(theme, statusThemeColor(entry.status), entry.status.name);
  const builtin = entry.status.is_builtin ? ` ${color(theme, "dim", "builtin")}` : "";
  return `${cursor} ${marker} ${name}${builtin}`;
}

function renderLabelLine(entry: Extract<KanbanItem, { kind: "label" }>, selected: boolean, theme: CustomTheme): string {
  const cursor = selected ? color(theme, "accent", ">") : " ";
  const marker = entry.assigned ? color(theme, "accent", "[x]") : color(theme, "dim", "[ ]");
  const name = selected ? color(theme, "accent", bold(theme, entry.label.name)) : entry.label.name;
  const description = entry.label.description ? ` ${color(theme, "dim", `— ${entry.label.description}`)}` : "";
  return `${cursor} ${marker} ${name} ${color(theme, "dim", entry.label.color)}${description}`;
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

async function loadKanbanItems(sid: string): Promise<{ items: KanbanItem[]; statusName: string; labelNames: string[] }> {
  const [statuses, currentStatus, labels, labelAssignments] = await Promise.all([
    kanbanStore.getAllStatuses(),
    kanbanStore.getSessionStatus(sid),
    kanbanStore.getAllLabels(),
    kanbanStore.getAllSessionLabels(),
  ]);
  const assignedLabelIds = new Set(
    labelAssignments.filter((assignment) => assignment.session_id === sid).map((assignment) => assignment.label_id),
  );
  const statusItems: KanbanItem[] = statuses.map((status) => ({
    kind: "status",
    status,
    active: currentStatus?.id === status.id,
  }));
  const labelItems: KanbanItem[] = labels.map((label) => ({
    kind: "label",
    label,
    assigned: assignedLabelIds.has(label.id),
  }));
  return {
    items: [...statusItems, ...labelItems],
    statusName: currentStatus?.name ?? "none",
    labelNames: labels.filter((label) => assignedLabelIds.has(label.id)).map((label) => label.name),
  };
}

async function showKanbanPanel(ctx: ExtensionContext, sid: string): Promise<KanbanPanelResult> {
  let snapshot = await loadKanbanItems(sid);
  let selected = clampIndex(0, snapshot.items.length);
  let message = "Enter/Space set/toggle · c clear status · s new status · l new label · r refresh · q close";
  let busy = false;

  async function refresh(): Promise<void> {
    snapshot = await loadKanbanItems(sid);
    selected = clampIndex(selected, snapshot.items.length);
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
      if (action === "new-status") {
        done("new-status");
        return;
      }
      if (action === "new-label") {
        done("new-label");
        return;
      }
      if (action === "up") {
        selected = clampIndex(selected - 1, snapshot.items.length);
        tui.requestRender();
        return;
      }
      if (action === "down") {
        selected = clampIndex(selected + 1, snapshot.items.length);
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
        if (action === "clear-status") {
          await kanbanStore.clearSessionStatus(sid);
          connMgr.notifyPsmStatusChange(sid);
          await refresh();
          message = "Status cleared";
          return;
        }

        const entry = snapshot.items[selected];
        if (!entry) {
          message = "No Status or Labels yet. Press s or l to create one.";
          return;
        }
        if (entry.kind === "status") {
          await kanbanStore.setSessionStatus(sid, entry.status.id, 0);
          connMgr.notifyPsmStatusChange(sid);
          message = `Status: ${entry.status.name}`;
        } else if (entry.assigned) {
          await kanbanStore.removeLabel(sid, entry.label.id);
          message = `Label removed: ${entry.label.name}`;
        } else {
          await kanbanStore.assignLabel(sid, entry.label.id);
          message = `Label added: ${entry.label.name}`;
        }
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
        const title = `Kanban — session ${shortSessionId(sid)}`;
        const statuses = snapshot.items.filter((item): item is Extract<KanbanItem, { kind: "status" }> => item.kind === "status");
        const labels = snapshot.items.filter((item): item is Extract<KanbanItem, { kind: "label" }> => item.kind === "label");
        let itemIndex = 0;
        const statusLines = statuses.length > 0
          ? statuses.map((entry) => renderStatusLine(entry, itemIndex++ === selected, theme))
          : [color(theme, "dim", "  No statuses yet. Press s to create one.")];
        const labelLines = labels.length > 0
          ? labels.map((entry) => renderLabelLine(entry, itemIndex++ === selected, theme))
          : [color(theme, "dim", "  No labels yet. Press l to create one.")];
        const state = busy
          ? color(theme, "warning", "Working...")
          : color(theme, message.startsWith("Error:") ? "error" : "dim", message);
        const lines = [
          ` ${color(theme, "accent", bold(theme, title))}`,
          ` ${color(theme, "dim", "Status:")} ${color(theme, "accent", snapshot.statusName)}`,
          ` ${color(theme, "dim", "Labels:")} ${color(theme, "accent", snapshot.labelNames.join(", ") || "none")}`,
          "",
          ` ${bold(theme, "Status")}`,
          ...statusLines,
          "",
          ` ${bold(theme, "Labels")}`,
          ...labelLines,
          "",
          ` ${state}`,
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

register("psm", "PSM bridge connection panel", async (_args, ctx) => {
  const conn = connMgr.getConnection();
  const state = conn?.state ?? "disconnected";
  const live = connMgr.isLiveEnabled();
  const connected = state === "connected";
  const connLabel = connected ? "○ Disconnect" : "● Connect";
  const liveLabel = live ? "● Live: ON  (toggle off)" : "○ Live: OFF (toggle on)";
  const choice = await ctx.ui.select(`PSM Bridge\n${statusLines().join("\n")}`, [connLabel, liveLabel, "  Close"]);
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

register("kanban", "Manage current session Kanban Status and Labels", async (_args, ctx) => {
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
    if (!result) return;

    if (result === "new-status") {
      const name = (await ctx.ui.input("New Kanban status name"))?.trim();
      if (!name) continue;
      try {
        const status = await kanbanStore.createStatus(name, "info");
        await kanbanStore.setSessionStatus(sid, status.id, 0);
        connMgr.notifyPsmStatusChange(sid);
        ctx.ui.notify(`Created status: ${status.name}`, "info");
      } catch (err) {
        ctx.ui.notify(`Failed to create status: ${err}`, "error");
        return;
      }
      continue;
    }

    const name = (await ctx.ui.input("New label name"))?.trim();
    if (!name) continue;
    const colorValue = (await ctx.ui.input("Label color (#RRGGBB)", "#0969da"))?.trim() || "#0969da";
    const description = (await ctx.ui.input("Label description (optional)"))?.trim() || "";
    try {
      const label = await kanbanStore.createLabel(name, colorValue, description);
      await kanbanStore.assignLabel(sid, label.id);
      ctx.ui.notify(`Created label: ${label.name}`, "info");
    } catch (err) {
      ctx.ui.notify(`Failed to create label: ${err}`, "error");
      return;
    }
  }
});
