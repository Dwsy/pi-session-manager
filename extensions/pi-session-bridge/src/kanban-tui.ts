/**
 * Ultimate Project-Level Horizontal Kanban Board TUI for pi-session-bridge.
 *
 * Built on `tui-kit.ts` (grok-pi UI SDK design language):
 * - Default horizontal multi-column layout (`↔ Board`) with responsive column paging
 * - Project-level scope by default (`[Proj: <name> ▾]`) + instant Project Switcher
 * - Mouse Drag & Drop across columns & within columns + Keyboard Grab Mode (`m`) + 1-key Quick Move (`H/L/J/K` or `Shift+Arrows`)
 * - Floating Context Menus (Card menu, Move-to-column submenu, Live multi-select Label submenu, Column management menu, Project & Label filter menus)
 * - Telescope-style live Search bar (`/`) with match highlighting + Label filter (`f`) + Unassigned toggle (`u`)
 * - Dedicated two-pane `⚙ Manage` view for full Status Column & Label CRUD + column reordering
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as connMgr from "./connection-manager.js";
import * as kanbanStore from "./kanban-store.js";
import { openPsmSession } from "./open-psm.js";
import {
  buildBoardColumns,
  cardTitle,
  mapKanbanStatusColorToTheme,
  nextStatusColor,
  NO_STATUS_COLUMN_ID,
  STATUS_COLOR_PALETTE,
  type KanbanCard,
  type KanbanColumn,
  type KanbanFilterState,
} from "./kanban-board-model.js";
import {
  buildProjectSummaries,
  formatRelativeAge,
  loadBoardSessions,
  normalizeProjectPath,
  projectDisplayName,
  shortenHomePath,
  type ProjectSummary,
} from "./session-loader.js";
import {
  compositeFloatingMenu,
  computeSplitGeometry,
  fitWidth,
  highlightTerms,
  hitRect,
  hitRegion,
  ListController,
  renderFooterRow,
  renderHeaderRow,
  renderSearchRow,
  renderSplitOverlayFrame,
  styleBold,
  truncateToWidth,
  visibleWidth,
  wrapTextToWidth,
  type ClickRegion,
  type FloatingMenuItem,
  type FooterHintSpec,
  type HeaderPillSpec,
  type RectRegion,
  type SplitFrameGeometry,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  type TuiTheme,
} from "./tui-kit.js";
import type { LabelItem, SessionInfo, SessionLabelItem, SessionStatusItem, StatusItem } from "./types.js";

export type KanbanViewMode = "board" | "manage";

export type KanbanTuiExitAction =
  | { kind: "close" }
  | { kind: "new-status" }
  | { kind: "rename-status"; statusId: string; currentName: string }
  | { kind: "new-label"; assignToSessionId?: string }
  | { kind: "edit-label"; label: LabelItem };

export interface KanbanBoardSessionState {
  viewMode: KanbanViewMode;
  filter: KanbanFilterState;
  focusedColIdx: number;
  focusedCardIdx: number;
  colViewportStart: number;
  managePane: "statuses" | "labels";
  feedback: string;
}

export function createInitialKanbanState(
  currentCwd: string,
  options?: { initialView?: KanbanViewMode; allProjects?: boolean },
): KanbanBoardSessionState {
  const normCwd = normalizeProjectPath(currentCwd);
  return {
    viewMode: options?.initialView ?? "board",
    filter: {
      project: options?.allProjects || !normCwd ? { kind: "all" } : { kind: "project", cwd: normCwd },
      label: { kind: "all" },
      query: "",
      showUnassigned: true,
    },
    focusedColIdx: 0,
    focusedCardIdx: 0,
    colViewportStart: 0,
    managePane: "statuses",
    feedback: "",
  };
}

interface BoardDataset {
  sessions: SessionInfo[];
  source: "psm" | "local";
  statuses: StatusItem[];
  statusAssignments: SessionStatusItem[];
  labels: LabelItem[];
  labelAssignments: SessionLabelItem[];
  projects: ProjectSummary[];
}

type ActiveMenu =
  | { kind: "card"; sessionId: string; anchorX?: number; anchorY?: number; selected: number; hovered?: number }
  | { kind: "card-move"; sessionId: string; anchorX?: number; anchorY?: number; selected: number; hovered?: number }
  | { kind: "card-labels"; sessionId: string; anchorX?: number; anchorY?: number; selected: number; hovered?: number }
  | { kind: "card-details"; sessionId: string; anchorX?: number; anchorY?: number }
  | { kind: "column"; colId: string; anchorX?: number; anchorY?: number; selected: number; hovered?: number }
  | { kind: "project"; anchorX?: number; anchorY?: number; selected: number; hovered?: number }
  | { kind: "label-filter"; anchorX?: number; anchorY?: number; selected: number; hovered?: number };

interface DragState {
  sourceColIdx: number;
  sourceCardIdx: number;
  sessionId: string;
  title: string;
  targetColIdx: number;
  targetCardIdx: number;
  mode: "keyboard" | "mouse";
  startX: number;
  startY: number;
  moved: boolean;
}

interface RenderedColBounds {
  colIdx: number;
  colId: string;
  x1: number;
  x2: number;
  headerY: number;
  bodyStartY: number;
  bodyEndY: number;
  cardRows: Array<{ cardIdx: number; y1: number; y2: number; sessionId: string }>;
}

const CARD_HEIGHT = 3;
const MIN_COL_WIDTH = 22;

function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, n));
}

function firstSelectableIndex(items: readonly FloatingMenuItem[]): number {
  const idx = items.findIndex((i) => !i.separator && !i.disabled);
  return idx >= 0 ? idx : 0;
}

function stepMenuSelection(items: readonly FloatingMenuItem[], current: number, delta: -1 | 1): number {
  if (items.length === 0) return 0;
  let idx = current;
  for (let i = 0; i < items.length; i++) {
    idx = (idx + delta + items.length) % items.length;
    const candidate = items[idx];
    if (candidate && !candidate.separator && !candidate.disabled) return idx;
  }
  return current;
}

async function loadDataset(sid: string, currentCwd: string): Promise<BoardDataset> {
  const [boardSessions, statuses, statusAssignments, labels, labelAssignments] = await Promise.all([
    loadBoardSessions(sid ? { id: sid, cwd: currentCwd } : undefined),
    kanbanStore.getAllStatuses(),
    kanbanStore.getAllSessionStatuses(),
    kanbanStore.getAllLabels(),
    kanbanStore.getAllSessionLabels(),
  ]);
  const projects = buildProjectSummaries(boardSessions.sessions, currentCwd);
  return {
    sessions: boardSessions.sessions,
    source: boardSessions.source,
    statuses,
    statusAssignments,
    labels,
    labelAssignments,
    projects,
  };
}

export async function showKanbanBoard(
  ctx: ExtensionContext,
  sid: string,
  state: KanbanBoardSessionState,
): Promise<KanbanTuiExitAction> {
  const currentCwd = normalizeProjectPath((ctx as { cwd?: string }).cwd ?? process.cwd());
  let dataset = await loadDataset(sid, currentCwd);
  let busy = false;
  let searchFocused = false;
  let activeMenu: ActiveMenu | null = null;
  let drag: DragState | null = null;
  let hoveredCard: { colIdx: number; cardIdx: number } | null = null;
  let lastClickCard: { sessionId: string; at: number } | null = null;
  const colScroll = new Map<string, number>();

  // Manage-view list controllers
  const statusList = new ListController({ rowsPerItem: 1 });
  const labelList = new ListController({ rowsPerItem: 1 });
  let manageHovered: { pane: "statuses" | "labels"; idx: number } | null = null;
  let lastManageGeo: SplitFrameGeometry | null = null;

  // Hit-testing geometry updated on every render
  let lastFrameWidth = 100;
  let lastPillRects = new Map<string, ClickRegion>();
  let lastCloseRect: ClickRegion = { x1: -1, x2: -1, y: -1 };
  let lastSearchRect: ClickRegion = { x1: -1, x2: -1, y: -1 };
  let lastColBounds: RenderedColBounds[] = [];
  let lastPrevPageRect: ClickRegion | undefined;
  let lastNextPageRect: ClickRegion | undefined;
  let lastMenuBox: RectRegion | undefined;
  let lastMenuItemRows = new Map<number, number>();
  let lastMenuItems: FloatingMenuItem[] = [];

  function computeBoard() {
    return buildBoardColumns({
      sessions: dataset.sessions,
      statuses: dataset.statuses,
      statusAssignments: dataset.statusAssignments,
      labels: dataset.labels,
      labelAssignments: dataset.labelAssignments,
      activeSessionId: sid,
      filter: state.filter,
    });
  }

  function findCardBySessionId(columns: readonly KanbanColumn[], sessionId: string): { colIdx: number; cardIdx: number; card: KanbanCard } | null {
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]!;
      const idx = col.cards.findIndex((card) => card.session.id === sessionId);
      if (idx >= 0) return { colIdx: c, cardIdx: idx, card: col.cards[idx]! };
    }
    return null;
  }

  function getFocusedCard(columns: readonly KanbanColumn[]): KanbanCard | null {
    const col = columns[state.focusedColIdx];
    if (!col || col.cards.length === 0) return null;
    return col.cards[clamp(state.focusedCardIdx, 0, col.cards.length - 1)] ?? null;
  }

  function clampBoardFocus(columns: readonly KanbanColumn[], visibleCols: number, cardsPerCol: number): void {
    if (columns.length === 0) {
      state.focusedColIdx = 0;
      state.focusedCardIdx = 0;
      state.colViewportStart = 0;
      return;
    }
    state.focusedColIdx = clamp(state.focusedColIdx, 0, columns.length - 1);
    const col = columns[state.focusedColIdx]!;
    state.focusedCardIdx = col.cards.length > 0 ? clamp(state.focusedCardIdx, 0, col.cards.length - 1) : 0;

    // Keep focused column within horizontal viewport
    if (state.focusedColIdx < state.colViewportStart) {
      state.colViewportStart = state.focusedColIdx;
    } else if (state.focusedColIdx >= state.colViewportStart + visibleCols) {
      state.colViewportStart = state.focusedColIdx - visibleCols + 1;
    }
    state.colViewportStart = clamp(state.colViewportStart, 0, Math.max(0, columns.length - visibleCols));

    // Keep focused card within vertical column viewport
    const curScroll = colScroll.get(col.id) ?? 0;
    let nextScroll = curScroll;
    if (state.focusedCardIdx < nextScroll) nextScroll = state.focusedCardIdx;
    else if (state.focusedCardIdx >= nextScroll + cardsPerCol) nextScroll = state.focusedCardIdx - cardsPerCol + 1;
    nextScroll = clamp(nextScroll, 0, Math.max(0, col.cards.length - cardsPerCol));
    colScroll.set(col.id, nextScroll);
  }

  function buildMenuItems(menu: ActiveMenu, columns: readonly KanbanColumn[]): { title: string; items: FloatingMenuItem[] } {
    if (menu.kind === "card") {
      const found = findCardBySessionId(columns, menu.sessionId);
      const title = found ? truncateToWidth(cardTitle(found.card.session), 26) : "Card Actions";
      return {
        title: `Card · ${title}`,
        items: [
          { id: "move-to", label: "↔ Move to status column…", hint: "→" },
          { id: "grab", label: "✥ Grab & drag card", hint: "m", color: "warning" },
          { id: "labels", label: "🏷 Toggle labels…", hint: "→", color: "accent" },
          { id: "details", label: "ℹ Session details", hint: "i" },
          { id: "open-psm", label: "↗ Open in PSM", hint: "o", color: "success" },
          { id: "open-web", label: "◈ Open in PSM Web", hint: "w" },
          { id: "sep-1", label: "", separator: true },
          { id: "clear-status", label: "✕ Clear status (Unassigned)", color: "error", disabled: !found?.card.statusId },
        ],
      };
    }

    if (menu.kind === "card-move") {
      const found = findCardBySessionId(columns, menu.sessionId);
      const curStatusId = found?.card.statusId ?? null;
      const items: FloatingMenuItem[] = [
        {
          id: `status:${NO_STATUS_COLUMN_ID}`,
          label: "No Status (Unassigned)",
          checked: curStatusId === null,
          color: "muted",
        },
        ...dataset.statuses.map((s) => ({
          id: `status:${s.id}`,
          label: s.name,
          checked: curStatusId === s.id,
          color: mapKanbanStatusColorToTheme(s.color),
        })),
      ];
      return { title: "Move Card To…", items };
    }

    if (menu.kind === "card-labels") {
      const assignedIds = new Set(
        dataset.labelAssignments.filter((a) => a.session_id === menu.sessionId).map((a) => a.label_id),
      );
      const items: FloatingMenuItem[] = [
        ...dataset.labels.map((l) => ({
          id: `label:${l.id}`,
          label: l.name,
          hint: l.color,
          checked: assignedIds.has(l.id),
          color: "accent",
        })),
        ...(dataset.labels.length > 0 ? [{ id: "sep-l", label: "", separator: true }] : []),
        { id: "new-label", label: "+ Create new label…", color: "success" },
      ];
      return { title: "Toggle Labels (Space/Enter)", items };
    }

    if (menu.kind === "column") {
      const col = columns.find((c) => c.id === menu.colId);
      const status = col?.status ?? null;
      const statusIdx = status ? dataset.statuses.findIndex((s) => s.id === status.id) : -1;
      const items: FloatingMenuItem[] = [
        { id: "col-new", label: "+ New status column…", color: "success" },
        ...(status
          ? [
              { id: "col-rename", label: `✎ Rename "${status.name}"…` },
              { id: "col-color", label: `◈ Cycle color (${status.color})`, color: mapKanbanStatusColorToTheme(status.color) },
              { id: "col-left", label: "◀ Move column left", disabled: statusIdx <= 0 },
              { id: "col-right", label: "▶ Move column right", disabled: statusIdx < 0 || statusIdx >= dataset.statuses.length - 1 },
              { id: "sep-c", label: "", separator: true },
              { id: "col-delete", label: status.is_builtin ? "🔒 Built-in (cannot delete)" : "🗑 Delete column", color: "error", disabled: status.is_builtin },
            ]
          : []),
        { id: "sep-m", label: "", separator: true },
        { id: "open-manage", label: "⚙ Open Status & Label Manager", color: "accent" },
      ];
      return { title: `Column · ${col?.name ?? "Board"}`, items };
    }

    if (menu.kind === "project") {
      const items: FloatingMenuItem[] = [
        {
          id: "proj:__all__",
          label: `◎ All Projects`,
          hint: `${dataset.sessions.length}`,
          checked: state.filter.project.kind === "all",
          color: "accent",
        },
        ...(dataset.projects.length > 0 ? [{ id: "sep-p", label: "", separator: true }] : []),
        ...dataset.projects.map((p) => {
          const isCur = p.cwd === currentCwd;
          const isSelected = state.filter.project.kind === "project" && normalizeProjectPath(state.filter.project.cwd) === p.cwd;
          return {
            id: `proj:${p.cwd}`,
            label: `${isCur ? "★ " : ""}${p.name}`,
            hint: `${p.sessionCount} · ${truncateToWidth(p.shortPath, 16)}`,
            checked: isSelected,
            color: isCur ? "success" : undefined,
          };
        }),
      ];
      return { title: "Project Scope", items };
    }

    if (menu.kind === "label-filter") {
      const counts = new Map<string, number>();
      for (const a of dataset.labelAssignments) {
        counts.set(a.label_id, (counts.get(a.label_id) ?? 0) + 1);
      }
      const items: FloatingMenuItem[] = [
        { id: "lf:all", label: "All labels", checked: state.filter.label.kind === "all" },
        { id: "lf:unlabeled", label: "Unlabeled only", checked: state.filter.label.kind === "unlabeled", color: "dim" },
        ...(dataset.labels.length > 0 ? [{ id: "sep-lf", label: "", separator: true }] : []),
        ...dataset.labels.map((l) => ({
          id: `lf:${l.id}`,
          label: `#${l.name}`,
          hint: `${counts.get(l.id) ?? 0}`,
          checked: state.filter.label.kind === "label" && state.filter.label.labelId === l.id,
          color: "accent",
        })),
      ];
      return { title: "Filter by Label", items };
    }

    return { title: "", items: [] };
  }

  return ctx.ui.custom((tuiUnknown, themeUnknown, _kb, done) => {
    const tui = tuiUnknown as { requestRender: (force?: boolean) => void; terminal?: { rows?: number; columns?: number } };
    const theme = themeUnknown as TuiTheme;

    async function reload(): Promise<void> {
      dataset = await loadDataset(sid, currentCwd);
    }

    async function commitCardMove(sessionId: string, targetCol: KanbanColumn, targetIndex: number): Promise<void> {
      busy = true;
      tui.requestRender();
      try {
        const targetStatusId = targetCol.status ? targetCol.status.id : null;
        await kanbanStore.moveSessionInStatus(sessionId, targetStatusId, targetIndex);
        connMgr.notifyPsmStatusChange(sessionId);
        await reload();
        const { columns } = computeBoard();
        const located = findCardBySessionId(columns, sessionId);
        if (located) {
          state.focusedColIdx = located.colIdx;
          state.focusedCardIdx = located.cardIdx;
        }
        state.feedback = `Moved to ${targetCol.name}`;
      } catch (err) {
        state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        busy = false;
        tui.requestRender();
      }
    }

    async function quickMoveCardHorizontal(delta: -1 | 1): Promise<void> {
      const { columns } = computeBoard();
      const card = getFocusedCard(columns);
      if (!card) return;
      const targetColIdx = state.focusedColIdx + delta;
      if (targetColIdx < 0 || targetColIdx >= columns.length) return;
      const targetCol = columns[targetColIdx]!;
      await commitCardMove(card.session.id, targetCol, 0);
    }

    async function quickMoveCardVertical(delta: -1 | 1): Promise<void> {
      const { columns } = computeBoard();
      const col = columns[state.focusedColIdx];
      if (!col || !col.status || col.cards.length <= 1) return;
      const card = col.cards[state.focusedCardIdx];
      if (!card) return;
      const nextIdx = clamp(state.focusedCardIdx + delta, 0, col.cards.length - 1);
      if (nextIdx === state.focusedCardIdx) return;
      await commitCardMove(card.session.id, col, nextIdx);
    }

    async function reorderColumn(statusId: string, delta: -1 | 1): Promise<void> {
      const idx = dataset.statuses.findIndex((s) => s.id === statusId);
      const nextIdx = idx + delta;
      if (idx < 0 || nextIdx < 0 || nextIdx >= dataset.statuses.length) return;
      const ids = dataset.statuses.map((s) => s.id);
      const [moved] = ids.splice(idx, 1);
      ids.splice(nextIdx, 0, moved!);
      busy = true;
      tui.requestRender();
      try {
        await kanbanStore.reorderStatuses(ids);
        await reload();
        state.feedback = `Reordered column`;
      } catch (err) {
        state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        busy = false;
        tui.requestRender();
      }
    }

    async function executeMenuItem(menu: ActiveMenu, itemId: string): Promise<void> {
      const { columns } = computeBoard();

      if (menu.kind === "card") {
        const found = findCardBySessionId(columns, menu.sessionId);
        if (itemId === "move-to") {
          activeMenu = { kind: "card-move", sessionId: menu.sessionId, anchorX: menu.anchorX, anchorY: menu.anchorY, selected: 0 };
          tui.requestRender();
          return;
        }
        if (itemId === "labels") {
          activeMenu = { kind: "card-labels", sessionId: menu.sessionId, anchorX: menu.anchorX, anchorY: menu.anchorY, selected: 0 };
          tui.requestRender();
          return;
        }
        if (itemId === "details") {
          activeMenu = { kind: "card-details", sessionId: menu.sessionId, anchorX: menu.anchorX, anchorY: menu.anchorY };
          tui.requestRender();
          return;
        }
        if (itemId === "grab" && found) {
          activeMenu = null;
          drag = {
            sourceColIdx: found.colIdx,
            sourceCardIdx: found.cardIdx,
            sessionId: found.card.session.id,
            title: cardTitle(found.card.session),
            targetColIdx: found.colIdx,
            targetCardIdx: found.cardIdx,
            mode: "keyboard",
            startX: 0,
            startY: 0,
            moved: true,
          };
          tui.requestRender();
          return;
        }
        if (itemId === "open-psm" || itemId === "open-web") {
          activeMenu = null;
          busy = true;
          tui.requestRender();
          try {
            const res = await openPsmSession(menu.sessionId, itemId === "open-web" ? "web" : "");
            state.feedback = res.mode === "web" || res.mode === "cli" ? "Opened in PSM Web" : "Opened in PSM Desktop";
          } catch (err) {
            state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
          } finally {
            busy = false;
            tui.requestRender();
          }
          return;
        }
        if (itemId === "clear-status") {
          activeMenu = null;
          const unassignedCol: KanbanColumn = { id: NO_STATUS_COLUMN_ID, name: "No Status", color: "slate", status: null, cards: [] };
          await commitCardMove(menu.sessionId, unassignedCol, 0);
          return;
        }
      }

      if (menu.kind === "card-move" && itemId.startsWith("status:")) {
        const targetId = itemId.slice("status:".length);
        activeMenu = null;
        const targetCol = columns.find((c) => c.id === targetId) ??
          (targetId === NO_STATUS_COLUMN_ID
            ? { id: NO_STATUS_COLUMN_ID, name: "No Status", color: "slate", status: null, cards: [] }
            : null);
        if (targetCol) {
          await commitCardMove(menu.sessionId, targetCol, 0);
        }
        return;
      }

      if (menu.kind === "card-labels") {
        if (itemId === "new-label") {
          activeMenu = null;
          done({ kind: "new-label", assignToSessionId: menu.sessionId });
          return;
        }
        if (itemId.startsWith("label:")) {
          const labelId = itemId.slice("label:".length);
          const assigned = dataset.labelAssignments.some(
            (a) => a.session_id === menu.sessionId && a.label_id === labelId,
          );
          busy = true;
          tui.requestRender();
          try {
            if (assigned) {
              await kanbanStore.removeLabel(menu.sessionId, labelId);
              state.feedback = "Label removed";
            } else {
              await kanbanStore.assignLabel(menu.sessionId, labelId);
              state.feedback = "Label added";
            }
            await reload();
          } catch (err) {
            state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
          } finally {
            busy = false;
            tui.requestRender();
          }
          return;
        }
      }

      if (menu.kind === "column") {
        const col = columns.find((c) => c.id === menu.colId);
        const status = col?.status ?? null;
        activeMenu = null;
        if (itemId === "col-new") {
          done({ kind: "new-status" });
          return;
        }
        if (itemId === "col-rename" && status) {
          done({ kind: "rename-status", statusId: status.id, currentName: status.name });
          return;
        }
        if (itemId === "col-color" && status) {
          busy = true;
          tui.requestRender();
          try {
            const nextColor = nextStatusColor(status.color);
            await kanbanStore.updateStatus(status.id, { color: nextColor });
            await reload();
            state.feedback = `${status.name} color → ${nextColor}`;
          } catch (err) {
            state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
          } finally {
            busy = false;
            tui.requestRender();
          }
          return;
        }
        if (itemId === "col-left" && status) {
          await reorderColumn(status.id, -1);
          return;
        }
        if (itemId === "col-right" && status) {
          await reorderColumn(status.id, 1);
          return;
        }
        if (itemId === "col-delete" && status && !status.is_builtin) {
          busy = true;
          tui.requestRender();
          try {
            await kanbanStore.deleteStatus(status.id);
            await reload();
            state.feedback = `Deleted status "${status.name}"`;
          } catch (err) {
            state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
          } finally {
            busy = false;
            tui.requestRender();
          }
          return;
        }
        if (itemId === "open-manage") {
          state.viewMode = "manage";
          tui.requestRender();
          return;
        }
      }

      if (menu.kind === "project" && itemId.startsWith("proj:")) {
        const val = itemId.slice("proj:".length);
        state.filter.project = val === "__all__" ? { kind: "all" } : { kind: "project", cwd: val };
        state.focusedColIdx = 0;
        state.focusedCardIdx = 0;
        state.colViewportStart = 0;
        activeMenu = null;
        state.feedback = val === "__all__" ? "Scope: All Projects" : `Scope: ${projectDisplayName(val)}`;
        tui.requestRender();
        return;
      }

      if (menu.kind === "label-filter" && itemId.startsWith("lf:")) {
        const val = itemId.slice("lf:".length);
        if (val === "all") state.filter.label = { kind: "all" };
        else if (val === "unlabeled") state.filter.label = { kind: "unlabeled" };
        else state.filter.label = { kind: "label", labelId: val };
        state.focusedCardIdx = 0;
        activeMenu = null;
        tui.requestRender();
        return;
      }
    }

    function openCardMenu(sessionId: string, anchorX?: number, anchorY?: number): void {
      activeMenu = { kind: "card", sessionId, anchorX, anchorY, selected: 0 };
      tui.requestRender();
    }

    function openColumnMenu(colId: string, anchorX?: number, anchorY?: number): void {
      activeMenu = { kind: "column", colId, anchorX, anchorY, selected: 0 };
      tui.requestRender();
    }

    function openProjectMenu(anchorX?: number, anchorY?: number): void {
      activeMenu = { kind: "project", anchorX, anchorY, selected: 0 };
      tui.requestRender();
    }

    function openLabelFilterMenu(anchorX?: number, anchorY?: number): void {
      activeMenu = { kind: "label-filter", anchorX, anchorY, selected: 0 };
      tui.requestRender();
    }

    function jumpToActiveSession(): void {
      const { columns } = computeBoard();
      const found = findCardBySessionId(columns, sid);
      if (found) {
        state.focusedColIdx = found.colIdx;
        state.focusedCardIdx = found.cardIdx;
        state.feedback = "Jumped to active session";
      } else {
        state.feedback = "Active session hidden by current filters";
      }
      tui.requestRender();
    }

    function buildHeaderPills(): HeaderPillSpec[] {
      const projLabel = state.filter.project.kind === "all"
        ? `[Proj: All ▾]`
        : `[Proj: ${truncateToWidth(projectDisplayName(state.filter.project.cwd), 16)} ▾]`;
      let labelFilterText = "[Label: All ▾]";
      let labelFilterActive = false;
      if (state.filter.label.kind === "unlabeled") {
        labelFilterText = "[Label: None ▾]";
        labelFilterActive = true;
      } else if (state.filter.label.kind === "label") {
        const targetLabelId = state.filter.label.labelId;
        const lbl = dataset.labels.find((l) => l.id === targetLabelId);
        labelFilterText = `[#${truncateToWidth(lbl?.name ?? "label", 12)} ▾]`;
        labelFilterActive = true;
      }
      return [
        { id: "mode:board", label: "[↔ Board]", active: state.viewMode === "board", color: state.viewMode === "board" ? "accent" : "dim" },
        { id: "mode:manage", label: "[⚙ Manage]", active: state.viewMode === "manage", color: state.viewMode === "manage" ? "accent" : "dim" },
        { id: "pill:project", label: projLabel, active: state.filter.project.kind === "project", color: state.filter.project.kind === "project" ? "success" : "dim" },
        { id: "pill:label", label: labelFilterText, active: labelFilterActive, color: labelFilterActive ? "warning" : "dim" },
        { id: "pill:unassigned", label: state.filter.showUnassigned ? "[+NoStatus]" : "[-NoStatus]", active: state.filter.showUnassigned, color: state.filter.showUnassigned ? "muted" : "dim" },
      ];
    }

    function renderManageView(totalWidth: number, totalRows: number): string[] {
      const targetRows = Math.max(18, Math.floor(totalRows * 0.9));
      const g = computeSplitGeometry({
        width: totalWidth,
        rows: targetRows,
        leftRatio: 0.5,
        hasSearchBar: false,
        minWidth: 64,
        minLeftWidth: 28,
        minRightWidth: 28,
        heightRatio: 1,
        maxRows: targetRows,
      });
      lastManageGeo = g;
      lastColBounds = [];
      lastPrevPageRect = undefined;
      lastNextPageRect = undefined;
      lastSearchRect = { x1: -1, x2: -1, y: -1 };

      statusList.clamp(dataset.statuses.length, Math.max(1, g.bodyHeight - 2));
      labelList.clamp(dataset.labels.length, Math.max(1, g.bodyHeight - 2));

      const leftActive = state.managePane === "statuses";
      const leftLines: string[] = [];
      leftLines.push(fitWidth(
        ` ${styleBold(theme, theme.fg(leftActive ? "accent" : "dim", `Status Columns (${dataset.statuses.length})`))} ${theme.fg("dim", "[s] new")}`,
        g.leftWidth,
      ));
      leftLines.push(fitWidth(` ${theme.fg("border", "─".repeat(Math.max(4, g.leftWidth - 2)))}`, g.leftWidth));
      if (dataset.statuses.length === 0) {
        leftLines.push(fitWidth(` ${theme.fg("dim", "No status columns. Press s to add.")}`, g.leftWidth));
      } else {
        const perPage = Math.max(1, g.bodyHeight - 2);
        for (let i = statusList.scroll; i < Math.min(dataset.statuses.length, statusList.scroll + perPage); i++) {
          const st = dataset.statuses[i]!;
          const isSel = leftActive && i === statusList.selected;
          const isHov = manageHovered?.pane === "statuses" && manageHovered.idx === i;
          const cursor = isSel ? theme.fg("accent", "▸") : " ";
          const dot = theme.fg(mapKanbanStatusColorToTheme(st.color), "●");
          const name = isSel || isHov
            ? styleBold(theme, theme.fg(isSel ? "accent" : "text", st.name))
            : theme.fg("text", st.name);
          const meta = theme.fg("dim", `${st.color}${st.is_builtin ? " · builtin" : ""}`);
          leftLines.push(fitWidth(` ${cursor} ${dot} ${name} ${meta}`, g.leftWidth));
        }
      }

      const rightActive = state.managePane === "labels";
      const rightLines: string[] = [];
      rightLines.push(fitWidth(
        ` ${styleBold(theme, theme.fg(rightActive ? "accent" : "dim", `Labels (${dataset.labels.length})`))} ${theme.fg("dim", "[l] new")}`,
        g.rightWidth,
      ));
      rightLines.push(fitWidth(` ${theme.fg("border", "─".repeat(Math.max(4, g.rightWidth - 2)))}`, g.rightWidth));
      if (dataset.labels.length === 0) {
        rightLines.push(fitWidth(` ${theme.fg("dim", "No labels yet. Press l to add.")}`, g.rightWidth));
      } else {
        const perPage = Math.max(1, g.bodyHeight - 2);
        for (let i = labelList.scroll; i < Math.min(dataset.labels.length, labelList.scroll + perPage); i++) {
          const lb = dataset.labels[i]!;
          const isSel = rightActive && i === labelList.selected;
          const isHov = manageHovered?.pane === "labels" && manageHovered.idx === i;
          const cursor = isSel ? theme.fg("accent", "▸") : " ";
          const name = isSel || isHov
            ? styleBold(theme, theme.fg("accent", `#${lb.name}`))
            : theme.fg("accent", `#${lb.name}`);
          const desc = lb.description ? ` — ${lb.description}` : "";
          rightLines.push(fitWidth(` ${cursor} ${name} ${theme.fg("dim", `${lb.color}${desc}`)}`, g.rightWidth));
        }
      }

      const footerHints: FooterHintSpec[] = leftActive
        ? [
            { key: "Tab", label: "labels" },
            { key: "s", label: "new" },
            { key: "e", label: "rename" },
            { key: "c", label: "color" },
            { key: "K/J", label: "reorder" },
            { key: "d", label: "delete" },
            { key: "v", label: "board" },
            { key: "Esc", label: "close" },
          ]
        : [
            { key: "Tab", label: "statuses" },
            { key: "l", label: "new" },
            { key: "e", label: "edit" },
            { key: "d", label: "delete" },
            { key: "v", label: "board" },
            { key: "Esc", label: "close" },
          ];

      const frame = renderSplitOverlayFrame({
        geometry: g,
        titlePrefix: ` ${styleBold(theme, theme.fg("accent", "▦ Kanban"))} `,
        pills: buildHeaderPills(),
        leftLines,
        rightLines,
        footerHints: state.feedback ? undefined : footerHints,
        footerCustom: state.feedback
          ? ` ${theme.fg(state.feedback.startsWith("Error:") ? "error" : "success", state.feedback)}  ${theme.fg("dim", "(v:board  Esc:close)")}`
          : undefined,
        theme,
      });
      lastPillRects = frame.pillRects;
      lastCloseRect = frame.closeRect;
      return frame.lines;
    }

    function renderBoardView(totalWidth: number, totalRows: number): string[] {
      const innerWidth = totalWidth - 2;
      const b = (s: string) => theme.fg("border", s);
      const { columns, totalInProject, totalVisible } = computeBoard();

      // Chrome rows: top(0) + header(1) + rule(2) + search(3) + colTop(4) + colHeader(5) + colRule(6) + body(bodyH) + colBottom + footer + bottom
      const maxTotalRows = Math.max(18, Math.floor(totalRows * 0.9));
      const bodyHeight = Math.max(CARD_HEIGHT * 2 + 1, maxTotalRows - 10);
      const cardsPerCol = Math.max(1, Math.floor((bodyHeight - 1) / CARD_HEIGHT));

      // Compute visible horizontal columns
      const maxColsFit = Math.max(1, Math.floor((innerWidth + 1) / (MIN_COL_WIDTH + 1)));
      const visibleCount = Math.max(1, Math.min(columns.length, maxColsFit));
      clampBoardFocus(columns, visibleCount, cardsPerCol);

      const startIdx = state.colViewportStart;
      const visibleCols = columns.slice(startIdx, startIdx + visibleCount);
      const separators = Math.max(0, visibleCols.length - 1);
      const baseColW = Math.floor((innerWidth - separators) / Math.max(1, visibleCols.length));
      const extraCols = innerWidth - separators - baseColW * visibleCols.length;
      const colWidths = visibleCols.map((_, i) => baseColW + (i < extraCols ? 1 : 0));

      const topBorder = b(`╭${"─".repeat(innerWidth)}╮`);
      const midRule = b(`├${"─".repeat(innerWidth)}┤`);
      const colTopRule = b(`├${colWidths.map((w) => "─".repeat(w)).join("┬")}┤`);
      const colMidRule = b(`├${colWidths.map((w) => "─".repeat(w)).join("┼")}┤`);
      const colBottomRule = b(`├${colWidths.map((w) => "─".repeat(w)).join("┴")}┤`);
      const bottomBorder = b(`╰${"─".repeat(innerWidth)}╯`);

      const headerRes = renderHeaderRow({
        innerWidth,
        titlePrefix: ` ${styleBold(theme, theme.fg("accent", "▦ Kanban"))} `,
        pills: buildHeaderPills(),
        theme,
        y: 1,
      });
      lastPillRects = headerRes.pillRects;
      lastCloseRect = headerRes.closeRect;

      // Search & filter status row (y = 3)
      const hiddenLeft = startIdx;
      const hiddenRight = Math.max(0, columns.length - (startIdx + visibleCols.length));
      const pagerInfo = hiddenLeft > 0 || hiddenRight > 0
        ? ` ${hiddenLeft > 0 ? `◀${hiddenLeft}` : ""}${hiddenLeft > 0 && hiddenRight > 0 ? " " : ""}${hiddenRight > 0 ? `${hiddenRight}▶` : ""}`
        : "";
      const rightLabel = `${totalVisible}/${totalInProject} cards · ${dataset.source}${pagerInfo}`;
      const searchLine = renderSearchRow({
        innerWidth,
        promptPrefix: searchFocused ? ` ${theme.fg("accent", "/")} ` : ` ${theme.fg("dim", "/")} `,
        query: state.filter.query,
        placeholder: searchFocused ? "Type to filter cards…" : "Press / to filter · p project · f label · m drag · Enter menu",
        rightLabel,
        active: searchFocused,
        theme,
      });
      lastSearchRect = { x1: 1, x2: innerWidth, y: 3 };

      // Column headers row (y = 5)
      lastPrevPageRect = undefined;
      lastNextPageRect = undefined;
      const colHeaderCells: string[] = [];
      const colBounds: RenderedColBounds[] = [];
      let cursorX = 1;

      for (let vi = 0; vi < visibleCols.length; vi++) {
        const col = visibleCols[vi]!;
        const colIdx = startIdx + vi;
        const w = colWidths[vi]!;
        const isFocusedCol = colIdx === state.focusedColIdx;
        const isDropTargetCol = Boolean(drag?.moved && drag.targetColIdx === colIdx);
        const dotColor = mapKanbanStatusColorToTheme(col.color);
        const dot = theme.fg(dotColor, "●");
        const prefix = vi === 0 && hiddenLeft > 0 ? `${theme.fg("accent", "◀")} ` : " ";
        const suffix = vi === visibleCols.length - 1 && hiddenRight > 0 ? ` ${theme.fg("accent", "▶")}` : "";
        if (vi === 0 && hiddenLeft > 0) {
          lastPrevPageRect = { x1: cursorX, x2: cursorX + 2, y: 5 };
        }
        if (vi === visibleCols.length - 1 && hiddenRight > 0) {
          lastNextPageRect = { x1: cursorX + w - 3, x2: cursorX + w - 1, y: 5 };
        }
        const countBadge = theme.fg(isDropTargetCol ? "warning" : "dim", `(${col.cards.length})`);
        const titleColor = isDropTargetCol ? "warning" : isFocusedCol ? "accent" : "text";
        const colName = isFocusedCol || isDropTargetCol
          ? styleBold(theme, theme.fg(titleColor, col.name))
          : theme.fg(titleColor, col.name);
        const dropTag = isDropTargetCol ? ` ${theme.fg("warning", "⇣")}` : "";
        colHeaderCells.push(fitWidth(`${prefix}${dot} ${colName} ${countBadge}${dropTag}${suffix}`, w));

        colBounds.push({
          colIdx,
          colId: col.id,
          x1: cursorX,
          x2: cursorX + w - 1,
          headerY: 5,
          bodyStartY: 7,
          bodyEndY: 7 + bodyHeight - 1,
          cardRows: [],
        });
        cursorX += w + 1;
      }
      const colHeaderLine = `${b("│")}${colHeaderCells.join(b("│"))}${b("│")}`;

      // Render each column's card stack
      const colLines: string[][] = visibleCols.map((col, vi) => {
        const colIdx = startIdx + vi;
        const w = colWidths[vi]!;
        const bounds = colBounds[vi]!;
        const scroll = clamp(colScroll.get(col.id) ?? 0, 0, Math.max(0, col.cards.length - cardsPerCol));
        const lines: string[] = [];

        if (col.cards.length === 0) {
          if (drag?.moved && drag.targetColIdx === colIdx) {
            lines.push(fitWidth(` ${theme.fg("warning", "━━ drop here ━━")}`, w));
          } else {
            lines.push(fitWidth(` ${theme.fg("dim", "(empty)")}`, w));
          }
          while (lines.length < bodyHeight) lines.push(" ".repeat(w));
          return lines;
        }

        const endCard = Math.min(col.cards.length, scroll + cardsPerCol);
        for (let ci = scroll; ci < endCard; ci++) {
          const card = col.cards[ci]!;
          const isSel = colIdx === state.focusedColIdx && ci === state.focusedCardIdx;
          const isGrabbed = Boolean(drag?.moved && drag.sessionId === card.session.id);
          const isHov = hoveredCard?.colIdx === colIdx && hoveredCard.cardIdx === ci;
          const isDropBefore = Boolean(drag?.moved && drag.targetColIdx === colIdx && drag.targetCardIdx === ci);

          const cardStartY = 7 + lines.length;
          bounds.cardRows.push({
            cardIdx: ci,
            y1: cardStartY,
            y2: cardStartY + CARD_HEIGHT - 1,
            sessionId: card.session.id,
          });

          // Line 1: cursor + active star + title
          const cursorGlyph = isGrabbed
            ? theme.fg("warning", "✥")
            : isSel
              ? theme.fg("accent", "▸")
              : " ";
          const activeStar = card.isActiveSession ? `${theme.fg("success", "★")} ` : "";
          const rawTitle = cardTitle(card.session);
          const highlightedTitle = state.filter.query ? highlightTerms(rawTitle, state.filter.query) : rawTitle;
          const styledTitle = isGrabbed
            ? styleBold(theme, theme.fg("warning", highlightedTitle))
            : isSel
              ? styleBold(theme, theme.fg("accent", highlightedTitle))
              : isHov
                ? styleBold(theme, theme.fg("text", highlightedTitle))
                : theme.fg("text", highlightedTitle);
          lines.push(fitWidth(` ${cursorGlyph} ${activeStar}${styledTitle}`, w));

          // Line 2: age + messages + project (when viewing All Projects)
          const age = formatRelativeAge(card.session.modified);
          const msgs = card.session.message_count > 0 ? `${card.session.message_count}m` : "";
          const proj = state.filter.project.kind === "all" && card.session.cwd
            ? projectDisplayName(card.session.cwd)
            : "";
          const metaParts = [age, msgs, proj].filter(Boolean).join(" · ");
          lines.push(fitWidth(`   ${theme.fg("dim", metaParts || card.session.id.slice(0, 10))}`, w));

          // Line 3: drop marker OR label chips OR subtle divider
          if (isDropBefore) {
            lines.push(fitWidth(` ${theme.fg("warning", "━━ drop here ━━")}`, w));
          } else if (card.labels.length > 0) {
            const chips = card.labels
              .slice(0, 3)
              .map((l) => theme.fg("accent", `#${l.name}`))
              .join(" ");
            const more = card.labels.length > 3 ? theme.fg("dim", ` +${card.labels.length - 3}`) : "";
            lines.push(fitWidth(`   ${chips}${more}`, w));
          } else {
            lines.push(fitWidth(`   ${theme.fg("border", "─".repeat(Math.max(4, w - 5)))}`, w));
          }
        }

        // Drop indicator at bottom of column
        if (drag?.moved && drag.targetColIdx === colIdx && drag.targetCardIdx >= endCard && lines.length < bodyHeight) {
          lines.push(fitWidth(` ${theme.fg("warning", "━━ drop here ━━")}`, w));
        }

        // Scroll hint on last row if needed
        const remainingBelow = col.cards.length - endCard;
        while (lines.length < bodyHeight - 1) lines.push(" ".repeat(w));
        if (lines.length < bodyHeight) {
          const scrollHint = [
            scroll > 0 ? `▲${scroll}` : "",
            remainingBelow > 0 ? `▼${remainingBelow}` : "",
          ].filter(Boolean).join(" ");
          lines.push(fitWidth(scrollHint ? ` ${theme.fg("dim", scrollHint)}` : "", w));
        }
        return lines;
      });

      lastColBounds = colBounds;

      const bodyRows: string[] = [];
      for (let r = 0; r < bodyHeight; r++) {
        const rowCells = colLines.map((c, idx) => c[r] ?? " ".repeat(colWidths[idx]!));
        bodyRows.push(`${b("│")}${rowCells.join(b("│"))}${b("│")}`);
      }

      // Footer
      let footerCustom: string | undefined;
      let footerHints: FooterHintSpec[] | undefined;
      if (busy) {
        footerCustom = ` ${theme.fg("warning", "Saving…")}`;
      } else if (drag?.moved) {
        const targetCol = columns[drag.targetColIdx];
        footerCustom = ` ${styleBold(theme, theme.fg("warning", "✥ MOVING"))} ${truncateToWidth(drag.title, 26)} → ${theme.fg("accent", targetCol?.name ?? "")} #${drag.targetCardIdx + 1}  ${theme.fg("dim", "(←→↑↓:target  Enter:drop  Esc:cancel)")}`;
      } else if (searchFocused) {
        footerCustom = ` ${theme.fg("accent", "Search:")} type to filter  ${theme.fg("dim", "(Enter/Esc:done  Ctrl+U:clear)")}`;
      } else if (state.feedback) {
        footerCustom = ` ${theme.fg(state.feedback.startsWith("Error:") ? "error" : "success", state.feedback)}  ${theme.fg("dim", "(←→↑↓:nav  m/H/L:move  Enter:menu  /:search  p:proj)")}`;
      } else {
        footerHints = [
          { key: "←→↑↓", label: "nav" },
          { key: "m/H/L", label: "drag/move" },
          { key: "Enter", label: "menu" },
          { key: "/", label: "search" },
          { key: "p", label: "proj" },
          { key: "f", label: "label" },
          { key: "C", label: "col" },
          { key: "M", label: "manage" },
          { key: "q", label: "close" },
        ];
      }

      const footerLine = renderFooterRow({
        innerWidth,
        hints: footerHints,
        customContent: footerCustom,
        theme,
      });

      return [
        topBorder,
        headerRes.line,
        midRule,
        searchLine,
        colTopRule,
        colHeaderLine,
        colMidRule,
        ...bodyRows,
        colBottomRule,
        footerLine,
        bottomBorder,
      ];
    }

    function compositeDetailOverlay(baseLines: string[], frameWidth: number, sessionId: string): string[] {
      const { columns } = computeBoard();
      const found = findCardBySessionId(columns, sessionId);
      const session = found?.card.session ?? dataset.sessions.find((s) => s.id === sessionId);
      if (!session) return baseLines;

      const statusName = found ? columns[found.colIdx]?.name ?? "No Status" : "No Status";
      const labelNames = found?.card.labels.map((l) => `#${l.name}`).join(" ") || "none";
      const items: FloatingMenuItem[] = [
        { id: "d:title", label: `Title: ${cardTitle(session)}`, disabled: true },
        { id: "d:id", label: `ID: ${session.id}`, disabled: true },
        { id: "d:proj", label: `Project: ${shortenHomePath(session.cwd)}`, disabled: true },
        { id: "d:status", label: `Status: ${statusName}`, color: "accent", disabled: true },
        { id: "d:labels", label: `Labels: ${labelNames}`, color: "success", disabled: true },
        { id: "d:msgs", label: `Messages: ${session.message_count} · Updated: ${formatRelativeAge(session.modified) || session.modified}`, disabled: true },
        { id: "d:sep", label: "", separator: true },
        ...wrapTextToWidth(session.first_message || "(no first message)", 36)
          .slice(0, 3)
          .map((line, i) => ({ id: `d:first:${i}`, label: line, disabled: true })),
        { id: "d:sep2", label: "", separator: true },
        { id: "d:close", label: "Press Esc / Enter to close", color: "accent" },
      ];
      const res = compositeFloatingMenu({
        baseLines,
        frameWidth,
        title: "Session Details",
        items,
        selectedIndex: items.length - 1,
        maxWidth: Math.min(58, frameWidth - 6),
        minWidth: 42,
        theme,
      });
      lastMenuBox = res.box;
      lastMenuItemRows = res.itemRows;
      lastMenuItems = items;
      return res.lines;
    }

    return {
      render(width: number): string[] {
        const fallbackCols = Math.floor((tui.terminal?.columns || process.stdout.columns || 120) * 0.9);
        const totalWidth = Math.max(64, width || fallbackCols);
        const totalRows = Math.max(20, tui.terminal?.rows || process.stdout.rows || 32);
        lastFrameWidth = totalWidth;

        let lines = state.viewMode === "manage"
          ? renderManageView(totalWidth, totalRows)
          : renderBoardView(totalWidth, totalRows);

        lastMenuBox = undefined;
        lastMenuItemRows = new Map();
        lastMenuItems = [];

        if (activeMenu) {
          if (activeMenu.kind === "card-details") {
            lines = compositeDetailOverlay(lines, totalWidth, activeMenu.sessionId);
          } else {
            const { columns } = computeBoard();
            const { title, items } = buildMenuItems(activeMenu, columns);
            if (items.length > 0) {
              if (!items[activeMenu.selected] || items[activeMenu.selected]!.separator || items[activeMenu.selected]!.disabled) {
                activeMenu.selected = firstSelectableIndex(items);
              }
              const res = compositeFloatingMenu({
                baseLines: lines,
                frameWidth: totalWidth,
                title,
                items,
                selectedIndex: activeMenu.selected,
                hoveredIndex: activeMenu.hovered,
                anchorX: activeMenu.anchorX,
                anchorY: activeMenu.anchorY,
                theme,
              });
              lines = res.lines;
              lastMenuBox = res.box;
              lastMenuItemRows = res.itemRows;
              lastMenuItems = items;
            }
          }
        }

        return lines;
      },
      invalidate() {},
      handleInput(data: string) {
        if (busy) return;
        state.feedback = "";

        // 1. Active floating menu captures keyboard first
        if (activeMenu) {
          if (activeMenu.kind === "card-details") {
            if (data === "\x1b" || data === "\r" || data === "\n" || data === "q" || data === " ") {
              activeMenu = null;
              tui.requestRender();
            }
            return;
          }
          if (data === "\x1b" || data === "q") {
            activeMenu = null;
            tui.requestRender();
            return;
          }
          if (data === "\x1b[A" || data === "k") {
            activeMenu.selected = stepMenuSelection(lastMenuItems, activeMenu.selected, -1);
            tui.requestRender();
            return;
          }
          if (data === "\x1b[B" || data === "j") {
            activeMenu.selected = stepMenuSelection(lastMenuItems, activeMenu.selected, 1);
            tui.requestRender();
            return;
          }
          if (data === "\r" || data === "\n" || data === " ") {
            const item = lastMenuItems[activeMenu.selected];
            if (item && !item.separator && !item.disabled) {
              void executeMenuItem(activeMenu, item.id);
            }
            return;
          }
          return;
        }

        // 2. Live search input mode
        if (searchFocused) {
          if (data === "\x1b" || data === "\r" || data === "\n") {
            searchFocused = false;
            tui.requestRender();
            return;
          }
          if (data === "\x15") { // Ctrl+U
            state.filter.query = "";
            tui.requestRender();
            return;
          }
          if (data === "\x7f" || data === "\b") {
            state.filter.query = state.filter.query.slice(0, -1);
            tui.requestRender();
            return;
          }
          if (data.length === 1 && data >= " " && data <= "~" || data.charCodeAt(0) >= 0x80) {
            state.filter.query += data;
            state.focusedCardIdx = 0;
            tui.requestRender();
          }
          return;
        }

        // 3. Keyboard Grab Mode (live drag preview)
        if (drag && drag.mode === "keyboard") {
          const { columns } = computeBoard();
          if (data === "\x1b" || data === "q") {
            drag = null;
            state.feedback = "Move cancelled";
            tui.requestRender();
            return;
          }
          if (data === "\r" || data === "\n" || data === "m" || data === " ") {
            const d = drag;
            drag = null;
            const targetCol = columns[d.targetColIdx];
            if (targetCol) {
              void commitCardMove(d.sessionId, targetCol, d.targetCardIdx);
            }
            return;
          }
          if (data === "\x1b[D" || data === "h") {
            drag.targetColIdx = clamp(drag.targetColIdx - 1, 0, Math.max(0, columns.length - 1));
            const targetLen = columns[drag.targetColIdx]?.cards.length ?? 0;
            drag.targetCardIdx = clamp(drag.targetCardIdx, 0, targetLen);
            state.focusedColIdx = drag.targetColIdx;
            tui.requestRender();
            return;
          }
          if (data === "\x1b[C" || data === "l") {
            drag.targetColIdx = clamp(drag.targetColIdx + 1, 0, Math.max(0, columns.length - 1));
            const targetLen = columns[drag.targetColIdx]?.cards.length ?? 0;
            drag.targetCardIdx = clamp(drag.targetCardIdx, 0, targetLen);
            state.focusedColIdx = drag.targetColIdx;
            tui.requestRender();
            return;
          }
          if (data === "\x1b[A" || data === "k") {
            const targetLen = columns[drag.targetColIdx]?.cards.length ?? 0;
            drag.targetCardIdx = clamp(drag.targetCardIdx - 1, 0, targetLen);
            tui.requestRender();
            return;
          }
          if (data === "\x1b[B" || data === "j") {
            const targetLen = columns[drag.targetColIdx]?.cards.length ?? 0;
            drag.targetCardIdx = clamp(drag.targetCardIdx + 1, 0, targetLen);
            tui.requestRender();
            return;
          }
          return;
        }

        // 4. Manage View shortcuts
        if (state.viewMode === "manage") {
          const bodyH = Math.max(4, (lastManageGeo?.bodyHeight ?? 14) - 2);
          if (data === "\x1b" || data === "q" || data === "Q") {
            done({ kind: "close" });
            return;
          }
          if (data === "v" || data === "V") {
            state.viewMode = "board";
            tui.requestRender();
            return;
          }
          if (data === "\t" || data === "\x1b[D" || data === "\x1b[C" || data === "h" || data === "l") {
            if (data === "l") {
              done({ kind: "new-label" });
              return;
            }
            state.managePane = state.managePane === "statuses" ? "labels" : "statuses";
            tui.requestRender();
            return;
          }
          if (data === "s" || data === "S") {
            done({ kind: "new-status" });
            return;
          }
          if (data === "L") {
            done({ kind: "new-label" });
            return;
          }
          if (state.managePane === "statuses") {
            if (data === "\x1b[A" || data === "k") { statusList.move(-1, dataset.statuses.length, bodyH); tui.requestRender(); return; }
            if (data === "\x1b[B" || data === "j") { statusList.move(1, dataset.statuses.length, bodyH); tui.requestRender(); return; }
            const st = dataset.statuses[statusList.selected];
            if (!st) return;
            if (data === "e" || data === "E" || data === "\r") {
              done({ kind: "rename-status", statusId: st.id, currentName: st.name });
              return;
            }
            if (data === "c" || data === "C") {
              void (async () => {
                busy = true;
                tui.requestRender();
                try {
                  const nextColor = nextStatusColor(st.color);
                  await kanbanStore.updateStatus(st.id, { color: nextColor });
                  await reload();
                  state.feedback = `${st.name} color → ${nextColor}`;
                } finally {
                  busy = false;
                  tui.requestRender();
                }
              })();
              return;
            }
            if (data === "K" || data === "\x1b[1;2A") { void reorderColumn(st.id, -1); statusList.move(-1, dataset.statuses.length, bodyH); return; }
            if (data === "J" || data === "\x1b[1;2B") { void reorderColumn(st.id, 1); statusList.move(1, dataset.statuses.length, bodyH); return; }
            if (data === "d" || data === "D") {
              if (st.is_builtin) { state.feedback = "Error: Built-in status cannot be deleted"; tui.requestRender(); return; }
              void (async () => {
                busy = true;
                tui.requestRender();
                try {
                  await kanbanStore.deleteStatus(st.id);
                  await reload();
                  state.feedback = `Deleted "${st.name}"`;
                } finally {
                  busy = false;
                  tui.requestRender();
                }
              })();
              return;
            }
          } else {
            if (data === "\x1b[A" || data === "k") { labelList.move(-1, dataset.labels.length, bodyH); tui.requestRender(); return; }
            if (data === "\x1b[B" || data === "j") { labelList.move(1, dataset.labels.length, bodyH); tui.requestRender(); return; }
            const lb = dataset.labels[labelList.selected];
            if (!lb) return;
            if (data === "e" || data === "E" || data === "\r") {
              done({ kind: "edit-label", label: lb });
              return;
            }
            if (data === "d" || data === "D") {
              void (async () => {
                busy = true;
                tui.requestRender();
                try {
                  await kanbanStore.deleteLabel(lb.id);
                  await reload();
                  state.feedback = `Deleted label "#${lb.name}"`;
                } finally {
                  busy = false;
                  tui.requestRender();
                }
              })();
              return;
            }
          }
          return;
        }

        // 5. Horizontal Board View shortcuts
        const { columns } = computeBoard();
        if (data === "\x1b") {
          if (state.filter.query || state.filter.label.kind !== "all") {
            state.filter.query = "";
            state.filter.label = { kind: "all" };
            state.feedback = "Filters cleared";
            tui.requestRender();
            return;
          }
          done({ kind: "close" });
          return;
        }
        if (data === "q" || data === "Q") { done({ kind: "close" }); return; }
        if (data === "/") { searchFocused = true; tui.requestRender(); return; }
        if (data === "x" || data === "X") {
          state.filter.query = "";
          state.filter.label = { kind: "all" };
          state.feedback = "Filters cleared";
          tui.requestRender();
          return;
        }
        if (data === "p" || data === "P") { openProjectMenu(20, 2); return; }
        if (data === "f" || data === "F") { openLabelFilterMenu(36, 2); return; }
        if (data === "u" || data === "U") {
          state.filter.showUnassigned = !state.filter.showUnassigned;
          state.focusedColIdx = 0;
          state.focusedCardIdx = 0;
          tui.requestRender();
          return;
        }
        if (data === "M" || data === "v") { state.viewMode = "manage"; tui.requestRender(); return; }
        if (data === "s") { done({ kind: "new-status" }); return; }
        if (data === "g" || data === "G") { jumpToActiveSession(); return; }
        if (data === "r" || data === "R") {
          void (async () => {
            busy = true;
            tui.requestRender();
            try { await reload(); state.feedback = "Refreshed"; } finally { busy = false; tui.requestRender(); }
          })();
          return;
        }

        // Column & card navigation
        if (data === "\x1b[D" || data === "h") {
          state.focusedColIdx = clamp(state.focusedColIdx - 1, 0, Math.max(0, columns.length - 1));
          const col = columns[state.focusedColIdx];
          state.focusedCardIdx = col && col.cards.length > 0 ? clamp(state.focusedCardIdx, 0, col.cards.length - 1) : 0;
          tui.requestRender();
          return;
        }
        if (data === "\x1b[C" || data === "l") {
          state.focusedColIdx = clamp(state.focusedColIdx + 1, 0, Math.max(0, columns.length - 1));
          const col = columns[state.focusedColIdx];
          state.focusedCardIdx = col && col.cards.length > 0 ? clamp(state.focusedCardIdx, 0, col.cards.length - 1) : 0;
          tui.requestRender();
          return;
        }
        if (data === "\x1b[A" || data === "k") {
          const col = columns[state.focusedColIdx];
          if (col && col.cards.length > 0) {
            state.focusedCardIdx = clamp(state.focusedCardIdx - 1, 0, col.cards.length - 1);
            tui.requestRender();
          }
          return;
        }
        if (data === "\x1b[B" || data === "j") {
          const col = columns[state.focusedColIdx];
          if (col && col.cards.length > 0) {
            state.focusedCardIdx = clamp(state.focusedCardIdx + 1, 0, col.cards.length - 1);
            tui.requestRender();
          }
          return;
        }

        // 1-key Quick Move: H/L or Shift+Left/Right (across columns), K/J or Shift+Up/Down (within column)
        if (data === "H" || data === "\x1b[1;2D") { void quickMoveCardHorizontal(-1); return; }
        if (data === "L" || data === "\x1b[1;2C") { void quickMoveCardHorizontal(1); return; }
        if (data === "K" || data === "\x1b[1;2A") { void quickMoveCardVertical(-1); return; }
        if (data === "J" || data === "\x1b[1;2B") { void quickMoveCardVertical(1); return; }

        // Keyboard Grab Mode (`m` or `Space`)
        if (data === "m" || data === " ") {
          const card = getFocusedCard(columns);
          if (!card) return;
          drag = {
            sourceColIdx: state.focusedColIdx,
            sourceCardIdx: state.focusedCardIdx,
            sessionId: card.session.id,
            title: cardTitle(card.session),
            targetColIdx: state.focusedColIdx,
            targetCardIdx: state.focusedCardIdx,
            mode: "keyboard",
            startX: 0,
            startY: 0,
            moved: true,
          };
          tui.requestRender();
          return;
        }

        // Card context menu (`Enter` or `.`)
        if (data === "\r" || data === "\n" || data === ".") {
          const card = getFocusedCard(columns);
          if (!card) return;
          const colBound = lastColBounds.find((cb) => cb.colIdx === state.focusedColIdx);
          openCardMenu(card.session.id, colBound ? colBound.x1 + 2 : undefined, 8);
          return;
        }

        // Column context menu (`C`)
        if (data === "C") {
          const col = columns[state.focusedColIdx];
          if (!col) return;
          const colBound = lastColBounds.find((cb) => cb.colIdx === state.focusedColIdx);
          openColumnMenu(col.id, colBound ? colBound.x1 + 1 : undefined, 6);
          return;
        }

        // Quick open in PSM (`o`)
        if (data === "o" || data === "O") {
          const card = getFocusedCard(columns);
          if (!card) return;
          void (async () => {
            busy = true;
            tui.requestRender();
            try {
              await openPsmSession(card.session.id, "");
              state.feedback = "Opened in PSM";
            } catch (err) {
              state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
              busy = false;
              tui.requestRender();
            }
          })();
        }
      },
      handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
        if (busy) return { handled: true, render: false };

        // 1. Active floating menu handles all mouse events
        if (activeMenu) {
          if (activeMenu.kind === "card-details") {
            if (event.type === "click" && event.button === "left") {
              activeMenu = null;
              tui.requestRender();
              return { handled: true, render: true };
            }
            return { handled: true, render: false };
          }
          if (event.type === "move" && event.button === "none") {
            const idx = hitRect(lastMenuBox, event.x, event.y) ? lastMenuItemRows.get(event.y) : undefined;
            if (idx === activeMenu.hovered) return { handled: true, render: false };
            activeMenu.hovered = idx;
            tui.requestRender();
            return { handled: true, render: true };
          }
          if (event.type === "press" && event.button === "left") {
            if (!hitRect(lastMenuBox, event.x, event.y)) {
              activeMenu = null;
              tui.requestRender();
              return { handled: true, render: true };
            }
            const idx = lastMenuItemRows.get(event.y);
            if (idx !== undefined) {
              activeMenu.selected = idx;
              tui.requestRender();
              return { handled: true, focus: true, render: true };
            }
            return { handled: true, render: false };
          }
          if (event.type === "click" && event.button === "left") {
            if (!hitRect(lastMenuBox, event.x, event.y)) {
              activeMenu = null;
              tui.requestRender();
              return { handled: true, render: true };
            }
            const idx = lastMenuItemRows.get(event.y);
            if (idx !== undefined) {
              const item = lastMenuItems[idx];
              if (item && !item.separator && !item.disabled) {
                void executeMenuItem(activeMenu, item.id);
              }
            }
            return { handled: true };
          }
          return { handled: true, render: false };
        }

        // 2. Active mouse drag in progress
        if (drag && drag.mode === "mouse") {
          const { columns } = computeBoard();
          if (event.type === "drag") {
            if (!drag.moved && (Math.abs(event.x - drag.startX) >= 2 || Math.abs(event.y - drag.startY) >= 1)) {
              drag.moved = true;
            }
            if (drag.moved) {
              const overCol = lastColBounds.find((cb) => event.x >= cb.x1 && event.x <= cb.x2);
              if (overCol) {
                drag.targetColIdx = overCol.colIdx;
                const col = columns[overCol.colIdx];
                const hitCard = overCol.cardRows.find((cr) => event.y >= cr.y1 && event.y <= cr.y2);
                if (hitCard) {
                  drag.targetCardIdx = hitCard.cardIdx;
                } else if (col) {
                  drag.targetCardIdx = event.y <= overCol.bodyStartY ? 0 : col.cards.length;
                }
              }
              tui.requestRender();
            }
            return { handled: true, capture: true, render: drag.moved };
          }
          if (event.type === "release") {
            const d = drag;
            drag = null;
            if (d.moved) {
              const targetCol = columns[d.targetColIdx];
              const sameSlot = d.targetColIdx === d.sourceColIdx && d.targetCardIdx === d.sourceCardIdx;
              if (targetCol && !sameSlot) {
                void commitCardMove(d.sessionId, targetCol, d.targetCardIdx);
              } else {
                tui.requestRender();
              }
              return { handled: true, render: true };
            }
            return { handled: true, render: false };
          }
        }

        // 3. Header close & pills
        if (event.button === "left" && (event.type === "press" || event.type === "click")) {
          if (hitRegion(lastCloseRect, event.x, event.y)) {
            if (event.type === "click") done({ kind: "close" });
            return { handled: true };
          }
          for (const [pillId, rect] of lastPillRects) {
            if (hitRegion(rect, event.x, event.y)) {
              if (event.type === "click") {
                if (pillId === "mode:board") { state.viewMode = "board"; tui.requestRender(); }
                else if (pillId === "mode:manage") { state.viewMode = "manage"; tui.requestRender(); }
                else if (pillId === "pill:project") { openProjectMenu(rect.x1, 2); }
                else if (pillId === "pill:label") { openLabelFilterMenu(rect.x1, 2); }
                else if (pillId === "pill:unassigned") { state.filter.showUnassigned = !state.filter.showUnassigned; tui.requestRender(); }
              }
              return { handled: true };
            }
          }
          if (hitRegion(lastSearchRect, event.x, event.y)) {
            if (event.type === "click") {
              searchFocused = true;
              tui.requestRender();
            }
            return { handled: true, focus: true };
          }
          if (hitRegion(lastPrevPageRect, event.x, event.y)) {
            if (event.type === "click") {
              state.colViewportStart = Math.max(0, state.colViewportStart - 1);
              state.focusedColIdx = Math.max(0, state.focusedColIdx - 1);
              tui.requestRender();
            }
            return { handled: true };
          }
          if (hitRegion(lastNextPageRect, event.x, event.y)) {
            if (event.type === "click") {
              state.colViewportStart += 1;
              state.focusedColIdx += 1;
              tui.requestRender();
            }
            return { handled: true };
          }
        }

        // 4. Manage view mouse interaction
        if (state.viewMode === "manage" && lastManageGeo) {
          const g = lastManageGeo;
          const relY = event.y - g.bodyStartY - 2;
          if (event.type === "move" && event.button === "none") {
            const inLeft = event.x >= 1 && event.x < g.dividerX && relY >= 0;
            const inRight = event.x > g.dividerX && event.x < g.totalWidth - 1 && relY >= 0;
            const next = inLeft
              ? { pane: "statuses" as const, idx: statusList.scroll + relY }
              : inRight
                ? { pane: "labels" as const, idx: labelList.scroll + relY }
                : null;
            if (next?.pane === manageHovered?.pane && next?.idx === manageHovered?.idx) return { handled: true, render: false };
            manageHovered = next;
            tui.requestRender();
            return { handled: true, render: true };
          }
          if (event.button === "left" && (event.type === "press" || event.type === "click") && relY >= 0) {
            if (event.x >= 1 && event.x < g.dividerX) {
              const idx = statusList.scroll + relY;
              if (idx >= 0 && idx < dataset.statuses.length) {
                state.managePane = "statuses";
                statusList.select(idx, dataset.statuses.length, Math.max(1, g.bodyHeight - 2));
                tui.requestRender();
                return { handled: true, focus: true, render: true };
              }
            } else if (event.x > g.dividerX && event.x < g.totalWidth - 1) {
              const idx = labelList.scroll + relY;
              if (idx >= 0 && idx < dataset.labels.length) {
                state.managePane = "labels";
                labelList.select(idx, dataset.labels.length, Math.max(1, g.bodyHeight - 2));
                tui.requestRender();
                return { handled: true, focus: true, render: true };
              }
            }
          }
          return undefined;
        }

        // 5. Horizontal Board mouse hover, wheel, right-click menu, left-press drag/select
        const overCol = lastColBounds.find((cb) => event.x >= cb.x1 && event.x <= cb.x2);
        if (!overCol) return undefined;

        if (event.type === "wheel" && event.wheelDelta) {
          const { columns } = computeBoard();
          const col = columns[overCol.colIdx];
          if (!col || col.cards.length === 0) return { handled: true, render: false };
          state.focusedColIdx = overCol.colIdx;
          const delta = event.wheelDelta > 0 ? 1 : -1;
          state.focusedCardIdx = clamp(state.focusedCardIdx + delta, 0, col.cards.length - 1);
          tui.requestRender();
          return { handled: true, render: true };
        }

        if (event.type === "move" && event.button === "none") {
          const hitCard = overCol.cardRows.find((cr) => event.y >= cr.y1 && event.y <= cr.y2);
          const next = hitCard ? { colIdx: overCol.colIdx, cardIdx: hitCard.cardIdx } : null;
          if (next?.colIdx === hoveredCard?.colIdx && next?.cardIdx === hoveredCard?.cardIdx) {
            return { handled: true, render: false };
          }
          hoveredCard = next;
          tui.requestRender();
          return { handled: true, render: true };
        }

        // Right-click on column header or card -> floating context menu
        if (event.button === "right" && (event.type === "press" || event.type === "click")) {
          if (event.y === overCol.headerY) {
            state.focusedColIdx = overCol.colIdx;
            openColumnMenu(overCol.colId, event.x, event.y + 1);
            return { handled: true };
          }
          const hitCard = overCol.cardRows.find((cr) => event.y >= cr.y1 && event.y <= cr.y2);
          if (hitCard) {
            state.focusedColIdx = overCol.colIdx;
            state.focusedCardIdx = hitCard.cardIdx;
            openCardMenu(hitCard.sessionId, event.x, event.y);
            return { handled: true };
          }
          return undefined;
        }

        // Left-click on column header -> focus column (or open column menu on second click)
        if (event.button === "left" && event.y === overCol.headerY) {
          if (event.type === "click") {
            if (state.focusedColIdx === overCol.colIdx) {
              openColumnMenu(overCol.colId, event.x, event.y + 1);
            } else {
              state.focusedColIdx = overCol.colIdx;
              state.focusedCardIdx = 0;
              tui.requestRender();
            }
          }
          return { handled: true };
        }

        // Left-press on card -> select + arm mouse drag
        if (event.button === "left" && event.type === "press") {
          searchFocused = false;
          const hitCard = overCol.cardRows.find((cr) => event.y >= cr.y1 && event.y <= cr.y2);
          if (!hitCard) {
            state.focusedColIdx = overCol.colIdx;
            tui.requestRender();
            return { handled: true, focus: true, render: true };
          }
          state.focusedColIdx = overCol.colIdx;
          state.focusedCardIdx = hitCard.cardIdx;
          const { columns } = computeBoard();
          const card = columns[overCol.colIdx]?.cards[hitCard.cardIdx];
          if (card) {
            drag = {
              sourceColIdx: overCol.colIdx,
              sourceCardIdx: hitCard.cardIdx,
              sessionId: card.session.id,
              title: cardTitle(card.session),
              targetColIdx: overCol.colIdx,
              targetCardIdx: hitCard.cardIdx,
              mode: "mouse",
              startX: event.x,
              startY: event.y,
              moved: false,
            };
          }
          tui.requestRender();
          return { handled: true, focus: true, capture: true, render: true };
        }

        // Left-click on card (without drag): double-click opens Card Context Menu
        if (event.button === "left" && event.type === "click") {
          const hitCard = overCol.cardRows.find((cr) => event.y >= cr.y1 && event.y <= cr.y2);
          if (!hitCard) return undefined;
          const nowMs = Date.now();
          if (lastClickCard && lastClickCard.sessionId === hitCard.sessionId && nowMs - lastClickCard.at <= 450) {
            lastClickCard = null;
            openCardMenu(hitCard.sessionId, event.x, event.y);
          } else {
            lastClickCard = { sessionId: hitCard.sessionId, at: nowMs };
          }
          return { handled: true };
        }

        return undefined;
      },
    };
  }, {
    overlay: true,
    overlayOptions: {
      width: "90%",
      maxHeight: "90%",
      anchor: "center",
    },
  }) as Promise<KanbanTuiExitAction>;
}

/** Interactive Kanban command loop handling inline TUI modals + `ctx.ui.input` forms. */
export async function runKanbanTuiLoop(
  ctx: ExtensionContext,
  sid: string,
  options?: { initialView?: KanbanViewMode; allProjects?: boolean; onMutate?: () => void },
): Promise<void> {
  const currentCwd = (ctx as { cwd?: string }).cwd ?? process.cwd();
  const state = createInitialKanbanState(currentCwd, options);

  while (true) {
    const action = await showKanbanBoard(ctx, sid, state);
    if (!action || action.kind === "close") return;

    if (action.kind === "new-status") {
      const name = (await ctx.ui.input("New Kanban status column name"))?.trim();
      if (!name) continue;
      const colorChoice = (await ctx.ui.input(
        `Status color (${STATUS_COLOR_PALETTE.join(" | ")})`,
        "info",
      ))?.trim() || "info";
      try {
        const status = await kanbanStore.createStatus(name, colorChoice);
        options?.onMutate?.();
        state.feedback = `Created column "${status.name}"`;
      } catch (err) {
        state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      continue;
    }

    if (action.kind === "rename-status") {
      const name = (await ctx.ui.input("Rename status column", action.currentName))?.trim();
      if (!name || name === action.currentName) continue;
      try {
        await kanbanStore.updateStatus(action.statusId, { name });
        options?.onMutate?.();
        state.feedback = `Renamed column → "${name}"`;
      } catch (err) {
        state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      continue;
    }

    if (action.kind === "new-label") {
      const name = (await ctx.ui.input("New label name"))?.trim();
      if (!name) continue;
      const colorValue = (await ctx.ui.input("Label color (#RRGGBB)", "#0969da"))?.trim() || "#0969da";
      const description = (await ctx.ui.input("Label description (optional)"))?.trim() || "";
      try {
        const label = await kanbanStore.createLabel(name, colorValue, description);
        if (action.assignToSessionId) {
          await kanbanStore.assignLabel(action.assignToSessionId, label.id);
        }
        options?.onMutate?.();
        state.feedback = `Created label "#${label.name}"`;
      } catch (err) {
        state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      continue;
    }

    if (action.kind === "edit-label") {
      const name = (await ctx.ui.input("Label name", action.label.name))?.trim();
      if (!name) continue;
      const colorValue = (await ctx.ui.input("Label color (#RRGGBB)", action.label.color))?.trim() || action.label.color;
      const description = (await ctx.ui.input("Label description", action.label.description))?.trim() ?? action.label.description;
      try {
        await kanbanStore.updateLabel(action.label.id, { name, color: colorValue, description });
        options?.onMutate?.();
        state.feedback = `Updated label "#${name}"`;
      } catch (err) {
        state.feedback = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      continue;
    }
  }
}
