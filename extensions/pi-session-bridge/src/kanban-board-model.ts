/**
 * Pure domain model for the Pi TUI Horizontal Project Kanban Board.
 *
 * Mirrors `extensions/psm-kanban-board/board/kanbanBoardModel.ts` semantics
 * (newest valid status assignment wins, deterministic position ordering) and
 * adds project-level scoping, search/label filtering, and column bucketing.
 */
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { normalizeProjectPath } from "./session-loader.js";
import type { LabelItem, SessionInfo, SessionLabelItem, SessionStatusItem, StatusItem } from "./types.js";

export const NO_STATUS_COLUMN_ID = "__no_status__";

export const STATUS_COLOR_PALETTE = [
  "info",
  "warning",
  "success",
  "destructive",
  "purple",
  "slate",
] as const;

export type ProjectFilter = { kind: "all" } | { kind: "project"; cwd: string };
export type LabelFilter = { kind: "all" } | { kind: "unlabeled" } | { kind: "label"; labelId: string };

export interface KanbanCard {
  session: SessionInfo;
  statusId: string | null;
  position: number;
  labels: LabelItem[];
  isActiveSession: boolean;
}

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  status: StatusItem | null;
  cards: KanbanCard[];
}

export interface KanbanFilterState {
  project: ProjectFilter;
  label: LabelFilter;
  query: string;
  showUnassigned: boolean;
}

/** Map PSM Status color tokens to valid Pi TUI theme tokens. */
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

/** Resolve latest valid single status assignment per session (matches PSM desktop). */
export function resolveLatestAssignments(
  statuses: readonly StatusItem[],
  assignments: readonly SessionStatusItem[],
): Map<string, SessionStatusItem> {
  const validIds = new Set(statuses.map((s) => s.id));
  const resolved = new Map<string, { item: SessionStatusItem; index: number }>();

  assignments.forEach((item, index) => {
    if (!validIds.has(item.status_id)) return;
    const prev = resolved.get(item.session_id);
    if (!prev) {
      resolved.set(item.session_id, { item, index });
      return;
    }
    const prevTime = Date.parse(prev.item.assigned_at) || 0;
    const nextTime = Date.parse(item.assigned_at) || 0;
    if (nextTime > prevTime || (nextTime === prevTime && index > prev.index)) {
      resolved.set(item.session_id, { item, index });
    }
  });

  return new Map([...resolved.entries()].map(([sid, v]) => [sid, v.item]));
}

export function cardTitle(session: SessionInfo): string {
  const name = session.name?.trim();
  if (name) return name;
  const first = session.first_message?.replace(/\s+/g, " ").trim();
  if (first) return first;
  return session.id.slice(0, 12);
}

/** Filter sessions and bucket them into horizontal Kanban columns. */
export function buildBoardColumns(input: {
  sessions: readonly SessionInfo[];
  statuses: readonly StatusItem[];
  statusAssignments: readonly SessionStatusItem[];
  labels: readonly LabelItem[];
  labelAssignments: readonly SessionLabelItem[];
  activeSessionId: string;
  filter: KanbanFilterState;
}): { columns: KanbanColumn[]; totalInProject: number; totalVisible: number } {
  const { sessions, statuses, statusAssignments, labels, labelAssignments, activeSessionId, filter } = input;

  const labelById = new Map(labels.map((l) => [l.id, l]));
  const sessionLabelsMap = new Map<string, LabelItem[]>();
  for (const assignment of labelAssignments) {
    const label = labelById.get(assignment.label_id);
    if (!label) continue;
    const arr = sessionLabelsMap.get(assignment.session_id);
    if (arr) {
      if (!arr.some((x) => x.id === label.id)) arr.push(label);
    } else {
      sessionLabelsMap.set(assignment.session_id, [label]);
    }
  }

  const latestStatus = resolveLatestAssignments(statuses, statusAssignments);

  // 1. Project-level scoping
  const normFilterCwd = filter.project.kind === "project" ? normalizeProjectPath(filter.project.cwd) : "";
  const projectScoped = filter.project.kind === "all"
    ? [...sessions]
    : sessions.filter((s) => normalizeProjectPath(s.cwd) === normFilterCwd);

  // 2. Query + label filtering
  const queryTerms = filter.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const filteredCards: KanbanCard[] = [];
  for (const session of projectScoped) {
    const cardLabels = sessionLabelsMap.get(session.id) ?? [];
    if (filter.label.kind === "unlabeled" && cardLabels.length > 0) continue;
    if (filter.label.kind === "label") {
      const targetLabelId = filter.label.labelId;
      if (!cardLabels.some((l) => l.id === targetLabelId)) continue;
    }

    if (queryTerms.length > 0) {
      const haystack = [
        session.name,
        session.first_message,
        session.last_message,
        session.id,
        session.cwd,
        ...cardLabels.map((l) => l.name),
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      if (!queryTerms.every((term) => haystack.includes(term))) continue;
    }

    const assigned = latestStatus.get(session.id);
    filteredCards.push({
      session,
      statusId: assigned?.status_id ?? null,
      position: assigned?.position ?? Number.MAX_SAFE_INTEGER,
      labels: cardLabels,
      isActiveSession: session.id === activeSessionId,
    });
  }

  // 3. Bucket into columns
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const buckets = new Map<string, KanbanCard[]>();
  buckets.set(NO_STATUS_COLUMN_ID, []);
  for (const status of sortedStatuses) {
    buckets.set(status.id, []);
  }

  for (const card of filteredCards) {
    const bucketId = card.statusId && buckets.has(card.statusId) ? card.statusId : NO_STATUS_COLUMN_ID;
    buckets.get(bucketId)!.push(card);
  }

  const sortCards = (cards: KanbanCard[], isUnassigned: boolean): KanbanCard[] =>
    cards.sort((a, b) => {
      if (!isUnassigned && a.position !== b.position) {
        return a.position - b.position;
      }
      const modA = Date.parse(a.session.modified) || 0;
      const modB = Date.parse(b.session.modified) || 0;
      return modB - modA;
    });

  const columns: KanbanColumn[] = [];
  const unassignedCards = sortCards(buckets.get(NO_STATUS_COLUMN_ID)!, true);
  if (filter.showUnassigned || sortedStatuses.length === 0) {
    columns.push({
      id: NO_STATUS_COLUMN_ID,
      name: "No Status",
      color: "slate",
      status: null,
      cards: unassignedCards,
    });
  }

  for (const status of sortedStatuses) {
    columns.push({
      id: status.id,
      name: status.name,
      color: status.color,
      status,
      cards: sortCards(buckets.get(status.id)!, false),
    });
  }

  const totalVisible = columns.reduce((sum, col) => sum + col.cards.length, 0);
  return { columns, totalInProject: projectScoped.length, totalVisible };
}

/** Cycle to the next PSM status color in the standard palette. */
export function nextStatusColor(current: string): string {
  const idx = STATUS_COLOR_PALETTE.indexOf(current as (typeof STATUS_COLOR_PALETTE)[number]);
  return STATUS_COLOR_PALETTE[(idx + 1) % STATUS_COLOR_PALETTE.length]!;
}
