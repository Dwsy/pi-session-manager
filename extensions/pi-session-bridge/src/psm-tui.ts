/**
 * /psm Bridge Control Center TUI — built on the grok-pi UI SDK (`tui-kit.ts`).
 *
 * Replaces the bare `ctx.ui.select()` menu with a rounded two-pane overlay:
 * - Header bar with live connection status pill, Live mode pill, Kanban shortcut, `[✕]`
 * - Left pane: keyboard + mouse-interactive control actions (hover, click, double-click, wheel)
 * - Right pane: real-time Bridge telemetry, endpoints, current session & Kanban metadata
 * - Draggable vertical divider + structured footer hints
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as connMgr from "./connection-manager.js";
import { HTTP_BASE, WS_URL } from "./config.js";
import * as kanbanStore from "./kanban-store.js";
import { openPsmSession } from "./open-psm.js";
import { loadBoardSessions, normalizeProjectPath, projectDisplayName, shortenHomePath } from "./session-loader.js";
import {
  computeSplitGeometry,
  DividerDragController,
  fitWidth,
  hitRegion,
  ListController,
  renderSplitOverlayFrame,
  styleBold,
  type ClickRegion,
  type FooterHintSpec,
  type HeaderPillSpec,
  type SplitFrameGeometry,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  type TuiTheme,
} from "./tui-kit.js";

export type PsmControlResult = "open-kanban" | undefined;

interface PsmActionRow {
  id: "connect" | "live" | "kanban" | "open-desktop" | "open-web" | "refresh" | "close";
  icon: string;
  label: string;
  hint: string;
  color?: string;
}

interface PsmSnapshot {
  state: string;
  live: boolean;
  sessionId: string;
  cwd: string;
  statusName: string;
  labelNames: string[];
  projectSessions: number;
  totalSessions: number;
  source: "psm" | "local";
}

async function loadPsmSnapshot(sid: string, cwd: string): Promise<PsmSnapshot> {
  const conn = connMgr.getConnection();
  const state = conn?.state ?? "disconnected";
  const live = connMgr.isLiveEnabled();
  const [status, labels, labelAssignments, boardData] = await Promise.all([
    sid ? kanbanStore.getSessionStatus(sid).catch(() => null) : Promise.resolve(null),
    kanbanStore.getAllLabels().catch(() => []),
    kanbanStore.getAllSessionLabels().catch(() => []),
    loadBoardSessions(sid ? { id: sid, cwd } : undefined).catch(() => ({ sessions: [], source: "local" as const })),
  ]);
  const assignedIds = new Set(
    labelAssignments.filter((a) => a.session_id === sid).map((a) => a.label_id),
  );
  const normCwd = normalizeProjectPath(cwd);
  const projectSessions = boardData.sessions.filter(
    (s) => normalizeProjectPath(s.cwd) === normCwd,
  ).length;
  return {
    state,
    live,
    sessionId: sid,
    cwd: normCwd,
    statusName: status?.name ?? "No Status",
    labelNames: labels.filter((l) => assignedIds.has(l.id)).map((l) => l.name),
    projectSessions,
    totalSessions: boardData.sessions.length,
    source: boardData.source,
  };
}

export async function showPsmControlPanel(
  ctx: ExtensionContext,
  sid: string,
): Promise<PsmControlResult> {
  const cwd = (ctx as { cwd?: string }).cwd ?? process.cwd();
  let snapshot = await loadPsmSnapshot(sid, cwd);
  let feedback = "";
  let busy = false;
  let hoveredIndex: number | undefined;

  const list = new ListController({ rowsPerItem: 2 });
  const divider = new DividerDragController(0.44);
  let lastGeometry: SplitFrameGeometry | null = null;
  let lastPillRects = new Map<string, ClickRegion>();
  let lastCloseRect: ClickRegion = { x1: -1, x2: -1, y: -1 };

  function buildActions(): PsmActionRow[] {
    const connected = snapshot.state === "connected";
    return [
      {
        id: "connect",
        icon: connected ? "○" : "●",
        label: connected ? "Disconnect Bridge" : "Connect Bridge",
        hint: "c",
        color: connected ? "warning" : "success",
      },
      {
        id: "live",
        icon: snapshot.live ? "●" : "○",
        label: snapshot.live ? "Disable Live Sync" : "Enable Live Sync",
        hint: "l",
        color: snapshot.live ? "success" : "accent",
      },
      {
        id: "kanban",
        icon: "▦",
        label: "Open Kanban Board (↔)",
        hint: "k",
        color: "accent",
      },
      {
        id: "open-desktop",
        icon: "↗",
        label: "Open Session in PSM",
        hint: "o",
        color: "accent",
      },
      {
        id: "open-web",
        icon: "◈",
        label: "Open Session in PSM Web",
        hint: "w",
      },
      {
        id: "refresh",
        icon: "↻",
        label: "Refresh Telemetry",
        hint: "r",
      },
      {
        id: "close",
        icon: "✕",
        label: "Close",
        hint: "q",
        color: "dim",
      },
    ];
  }

  return ctx.ui.custom((tuiUnknown, themeUnknown, _kb, done) => {
    const tui = tuiUnknown as { requestRender: (force?: boolean) => void; terminal?: { rows?: number; columns?: number } };
    const theme = themeUnknown as TuiTheme;

    async function runAction(id: PsmActionRow["id"]): Promise<void> {
      if (busy) return;
      if (id === "close") {
        done(undefined);
        return;
      }
      if (id === "kanban") {
        done("open-kanban");
        return;
      }
      busy = true;
      tui.requestRender();
      try {
        if (id === "connect") {
          if (snapshot.state === "connected") {
            connMgr.doDisconnect();
            feedback = "Disconnected from PSM Bridge";
          } else {
            connMgr.doConnect();
            feedback = "Connecting to PSM Bridge…";
          }
        } else if (id === "live") {
          if (snapshot.live) {
            connMgr.disableLiveMode();
            feedback = "Live sync disabled";
          } else {
            connMgr.enableLiveMode(ctx);
            feedback = "Live sync enabled";
          }
        } else if (id === "open-desktop") {
          if (!sid) throw new Error("No active session");
          const res = await openPsmSession(sid, "");
          feedback = res.mode === "cli" || res.mode === "web" ? "Opened PSM web session" : "Opened PSM desktop session";
        } else if (id === "open-web") {
          if (!sid) throw new Error("No active session");
          await openPsmSession(sid, "web");
          feedback = "Opened PSM web session";
        } else if (id === "refresh") {
          feedback = "Refreshed";
        }
        snapshot = await loadPsmSnapshot(sid, cwd);
      } catch (err) {
        feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        busy = false;
        tui.requestRender();
      }
    }

    return {
      render(width: number): string[] {
        const actions = buildActions();
        const rows = Math.max(16, tui.terminal?.rows || process.stdout.rows || 30);
        const targetWidth = Math.max(58, width || tui.terminal?.columns || process.stdout.columns || 100);
        const g = computeSplitGeometry({
          width: targetWidth,
          rows,
          leftRatio: divider.leftRatio,
          hasSearchBar: false,
          minWidth: 58,
          minLeftWidth: 26,
          minRightWidth: 28,
          heightRatio: 1,
          maxRows: rows,
        });
        list.clamp(actions.length, g.bodyHeight);

        const stateIcon = snapshot.state === "connected" ? "●" : snapshot.state === "reconnecting" ? "◐" : "○";
        const stateColor = snapshot.state === "connected" ? "success" : snapshot.state === "reconnecting" ? "warning" : "dim";
        const pills: HeaderPillSpec[] = [
          { id: "connect", label: `[${stateIcon} ${snapshot.state}]`, active: snapshot.state === "connected", color: stateColor },
          { id: "live", label: `[Live: ${snapshot.live ? "ON" : "OFF"}]`, active: snapshot.live, color: snapshot.live ? "success" : "dim" },
          { id: "kanban", label: "[↔ Kanban]", color: "accent" },
        ];

        const leftLines: string[] = [];
        const perPage = list.itemsPerPage(g.bodyHeight);
        for (let i = list.scroll; i < Math.min(actions.length, list.scroll + perPage); i++) {
          const item = actions[i]!;
          const isSel = i === list.selected;
          const isHov = i === hoveredIndex;
          const cursor = isSel ? theme.fg("accent", "▸") : " ";
          const labelColor = item.color ?? (isSel ? "accent" : "text");
          const labelText = isSel || isHov
            ? styleBold(theme, theme.fg(labelColor, `${item.icon} ${item.label}`))
            : theme.fg(labelColor, `${item.icon} ${item.label}`);
          const hint = theme.fg("dim", `[${item.hint}]`);
          const line1 = ` ${cursor} ${labelText}`;
          const gapW = Math.max(1, g.leftWidth - 2 - (item.hint.length + 2));
          leftLines.push(fitWidth(`${fitWidth(line1, gapW)} ${hint}`, g.leftWidth));
          leftLines.push(fitWidth("", g.leftWidth));
        }

        const rightLines: string[] = [];
        const kv = (k: string, v: string, vColor = "text") =>
          fitWidth(` ${theme.fg("dim", k.padEnd(11))} ${theme.fg(vColor, v)}`, g.rightWidth);
        rightLines.push(fitWidth(` ${styleBold(theme, theme.fg("accent", "Bridge Telemetry"))}`, g.rightWidth));
        rightLines.push(fitWidth(` ${theme.fg("border", "─".repeat(Math.max(4, g.rightWidth - 2)))}`, g.rightWidth));
        rightLines.push(kv("State", `${stateIcon} ${snapshot.state}`, stateColor));
        rightLines.push(kv("Live Sync", snapshot.live ? "ON (streaming)" : "OFF", snapshot.live ? "success" : "dim"));
        rightLines.push(kv("WebSocket", WS_URL, "dim"));
        rightLines.push(kv("HTTP API", HTTP_BASE, "dim"));
        rightLines.push(fitWidth("", g.rightWidth));
        rightLines.push(fitWidth(` ${styleBold(theme, theme.fg("accent", "Active Session"))}`, g.rightWidth));
        rightLines.push(fitWidth(` ${theme.fg("border", "─".repeat(Math.max(4, g.rightWidth - 2)))}`, g.rightWidth));
        rightLines.push(kv("Session", snapshot.sessionId ? `${snapshot.sessionId.slice(0, 14)}…` : "none", "text"));
        rightLines.push(kv("Project", `${projectDisplayName(snapshot.cwd)} (${shortenHomePath(snapshot.cwd)})`, "accent"));
        rightLines.push(kv("Kanban", snapshot.statusName, "accent"));
        rightLines.push(kv("Labels", snapshot.labelNames.join(", ") || "none", snapshot.labelNames.length ? "success" : "dim"));
        rightLines.push(kv("Sessions", `${snapshot.projectSessions} in project · ${snapshot.totalSessions} total (${snapshot.source})`, "dim"));
        if (feedback) {
          rightLines.push(fitWidth("", g.rightWidth));
          rightLines.push(fitWidth(` ${theme.fg(feedback.startsWith("Error:") ? "error" : "success", feedback)}`, g.rightWidth));
        }

        const footerHints: FooterHintSpec[] = [
          { key: "↑↓", label: "nav" },
          { key: "Enter", label: "run" },
          { key: "k", label: "kanban" },
          { key: "c", label: "connect" },
          { key: "l", label: "live" },
          { key: "o", label: "open" },
          { key: "Esc", label: "close" },
        ];

        const frame = renderSplitOverlayFrame({
          geometry: g,
          titlePrefix: ` ${styleBold(theme, theme.fg("accent", "◈ PSM Bridge"))}  `,
          pills,
          leftLines,
          rightLines,
          footerHints: busy ? undefined : footerHints,
          footerCustom: busy ? ` ${theme.fg("warning", "Working…")}` : undefined,
          theme,
        });

        lastGeometry = frame.geometry;
        lastPillRects = frame.pillRects;
        lastCloseRect = frame.closeRect;
        return frame.lines;
      },
      invalidate() {},
      handleInput(data: string) {
        const actions = buildActions();
        const bodyH = lastGeometry?.bodyHeight ?? 14;
        if (data === "\x1b" || data === "q" || data === "Q") {
          done(undefined);
          return;
        }
        if (data === "\x1b[A" || data === "k") {
          if (data === "k") {
            void runAction("kanban");
            return;
          }
          list.move(-1, actions.length, bodyH);
          tui.requestRender();
          return;
        }
        if (data === "\x1b[B" || data === "j") {
          list.move(1, actions.length, bodyH);
          tui.requestRender();
          return;
        }
        if (data === "\r" || data === "\n" || data === " ") {
          const item = actions[list.selected];
          if (item) void runAction(item.id);
          return;
        }
        if (data === "c" || data === "C") { void runAction("connect"); return; }
        if (data === "l" || data === "L") { void runAction("live"); return; }
        if (data === "o" || data === "O") { void runAction("open-desktop"); return; }
        if (data === "w" || data === "W") { void runAction("open-web"); return; }
        if (data === "r" || data === "R") { void runAction("refresh"); return; }
      },
      handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
        const g = lastGeometry;
        if (!g) return undefined;
        const actions = buildActions();

        const dragRes = divider.handleMouse(event, {
          totalWidth: g.totalWidth,
          dividerX: g.dividerX,
          bodyStartY: g.bodyStartY,
          bodyHeight: g.bodyHeight,
        });
        if (dragRes) {
          if (dragRes.render) tui.requestRender();
          return dragRes;
        }

        if (event.type === "wheel" && event.wheelDelta) {
          list.move(event.wheelDelta > 0 ? 1 : -1, actions.length, g.bodyHeight);
          tui.requestRender();
          return { handled: true, render: true };
        }

        if (event.type === "move" && event.button === "none") {
          const inLeft = event.x >= 1 && event.x < g.dividerX && event.y >= g.bodyStartY && event.y < g.bodyStartY + g.bodyHeight;
          const idx = inLeft ? list.indexAtBodyRow(event.y - g.bodyStartY, actions.length) : -1;
          const next = idx >= 0 ? idx : undefined;
          if (next === hoveredIndex) return { handled: true, render: false };
          hoveredIndex = next;
          tui.requestRender();
          return { handled: true, render: true };
        }

        if (event.button === "left" && (event.type === "press" || event.type === "click")) {
          if (hitRegion(lastCloseRect, event.x, event.y)) {
            if (event.type === "click") done(undefined);
            return { handled: true };
          }
          for (const [pillId, rect] of lastPillRects) {
            if (hitRegion(rect, event.x, event.y)) {
              if (event.type === "click") {
                if (pillId === "connect") void runAction("connect");
                else if (pillId === "live") void runAction("live");
                else if (pillId === "kanban") void runAction("kanban");
              }
              return { handled: true };
            }
          }
          const inLeft = event.x >= 1 && event.x < g.dividerX && event.y >= g.bodyStartY && event.y < g.bodyStartY + g.bodyHeight;
          if (!inLeft) return undefined;
          const idx = list.indexAtBodyRow(event.y - g.bodyStartY, actions.length);
          if (idx < 0) return undefined;
          if (event.type === "press") {
            list.select(idx, actions.length, g.bodyHeight);
            tui.requestRender();
            return { handled: true, focus: true, render: true };
          }
          const item = actions[idx];
          if (item) void runAction(item.id);
          return { handled: true };
        }

        return undefined;
      },
    };
  }, {
    overlay: true,
    overlayOptions: {
      width: "100%",
      maxHeight: "100%",
      anchor: "top-left",
    },
  }) as Promise<PsmControlResult>;
}
