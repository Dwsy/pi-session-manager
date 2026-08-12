import type { SessionInfo } from "@/types";
import { getPathComparisonKey } from "@/utils/path";
import { getDirectoryName } from "@/utils/sessionDisplay";

export type ExplorerTab = "sessions" | "projects";

export type ExplorerSortDirection = "asc" | "desc";

export type ExplorerSessionSortKey =
  | "title"
  | "project"
  | "messages"
  | "created"
  | "updated";

export type ExplorerProjectSortKey =
  | "name"
  | "sessions"
  | "messages"
  | "updated";

export interface ExplorerProject {
  path: string;
  name: string;
  sessionCount: number;
  messageCount: number;
  lastModified: number;
  liveCount: number;
}

const UNKNOWN_PROJECT_PATH = "";

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isLiveSession(session: SessionInfo, liveSessionIds?: Set<string>): boolean {
  return Boolean(session.isLive) || (liveSessionIds?.has(session.id) ?? false);
}

export function explorerSessionTitle(session: SessionInfo, untitled: string): string {
  return (session.name || session.first_message || "").trim() || untitled;
}

export function explorerProjectName(session: SessionInfo, unknown: string): string {
  return session.cwd ? getDirectoryName(session.cwd) : unknown;
}

export function buildExplorerProjects(
  sessions: SessionInfo[],
  liveSessionIds?: Set<string>,
): ExplorerProject[] {
  const grouped = new Map<string, ExplorerProject>();

  for (const session of sessions) {
    const path = session.cwd || UNKNOWN_PROJECT_PATH;
    const key = getPathComparisonKey(path);
    const existing = grouped.get(key);
    const modified = timestamp(session.modified);
    const live = isLiveSession(session, liveSessionIds) ? 1 : 0;

    if (existing) {
      existing.sessionCount += 1;
      existing.messageCount += session.message_count;
      existing.lastModified = Math.max(existing.lastModified, modified);
      existing.liveCount += live;
      continue;
    }

    grouped.set(key, {
      path,
      name: path ? getDirectoryName(path) : "",
      sessionCount: 1,
      messageCount: session.message_count,
      lastModified: modified,
      liveCount: live,
    });
  }

  return Array.from(grouped.values());
}

function applyDirection(comparison: number, direction: ExplorerSortDirection): number {
  return direction === "asc" ? comparison : -comparison;
}

export function sortExplorerSessions(
  sessions: SessionInfo[],
  key: ExplorerSessionSortKey,
  direction: ExplorerSortDirection,
  labels: { untitled: string; unknownProject: string },
): SessionInfo[] {
  return [...sessions].sort((left, right) => {
    switch (key) {
      case "title":
        return applyDirection(
          explorerSessionTitle(left, labels.untitled).localeCompare(
            explorerSessionTitle(right, labels.untitled),
          ),
          direction,
        );
      case "project":
        return applyDirection(
          explorerProjectName(left, labels.unknownProject).localeCompare(
            explorerProjectName(right, labels.unknownProject),
          ),
          direction,
        );
      case "messages":
        return applyDirection(left.message_count - right.message_count, direction);
      case "created":
        return applyDirection(timestamp(left.created) - timestamp(right.created), direction);
      case "updated":
      default:
        return applyDirection(timestamp(left.modified) - timestamp(right.modified), direction);
    }
  });
}

export function sortExplorerProjects(
  projects: ExplorerProject[],
  key: ExplorerProjectSortKey,
  direction: ExplorerSortDirection,
): ExplorerProject[] {
  return [...projects].sort((left, right) => {
    switch (key) {
      case "name":
        return applyDirection(left.name.localeCompare(right.name), direction);
      case "sessions":
        return applyDirection(left.sessionCount - right.sessionCount, direction);
      case "messages":
        return applyDirection(left.messageCount - right.messageCount, direction);
      case "updated":
      default:
        return applyDirection(left.lastModified - right.lastModified, direction);
    }
  });
}

/** Header clicks toggle direction on the active key, otherwise adopt the key's natural direction. */
export function nextExplorerSort<TKey extends string>(
  current: { key: TKey; direction: ExplorerSortDirection },
  requestedKey: TKey,
  naturalDirection: (key: TKey) => ExplorerSortDirection,
): { key: TKey; direction: ExplorerSortDirection } {
  if (current.key === requestedKey) {
    return {
      key: requestedKey,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key: requestedKey, direction: naturalDirection(requestedKey) };
}
