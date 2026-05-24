import { invoke } from "@/transport";
import type {
  DayStats,
  FullTextSearchResponse,
  FullTextSearchSourceFilter,
  SearchResult,
  SessionChunk,
  SessionEntry,
  SessionInfo,
  SessionStats,
} from "@/types";
import {
  canForkRuntimeSessions,
  canMutateRuntimeSessions,
  deleteRuntimeSessions,
  forkRuntimeSession,
  renameRuntimeSession,
  resolveSessionProvider,
  supportsRuntimeSessionEvents,
} from "./providers";
import type { RuntimeSessionListResponse } from "./providers";
import { getRuntimeMode, type RuntimeMode } from "./runtimeMode";

export type SessionRuntimeMode = RuntimeMode;

export function getSessionRuntimeMode(): SessionRuntimeMode {
  return getRuntimeMode();
}

export async function loadRuntimeSessionList(): Promise<
  RuntimeSessionListResponse
> {
  const provider = resolveSessionProvider();
  if (provider.loadSessionList) {
    return provider.loadSessionList();
  }
  return {
    sessions: await provider.loadSessions(),
    isComplete: true,
  };
}

export async function loadRuntimeSessions(): Promise<SessionInfo[]> {
  return (await loadRuntimeSessionList()).sessions;
}

export async function getRuntimeSessionByPath(
  path: string,
): Promise<SessionInfo | null> {
  return resolveSessionProvider().getSessionByPath(path);
}

export async function getRuntimeSessionById(
  id: string,
): Promise<SessionInfo | null> {
  return resolveSessionProvider().getSessionById?.(id) ?? null;
}

export async function canResolveRuntimeSession(path: string): Promise<boolean> {
  return resolveSessionProvider().canResolveSession(path);
}

export async function readRuntimeSessionChunk(
  path: string,
  offset = 0,
  maxBytes = 384 * 1024,
): Promise<SessionChunk> {
  return resolveSessionProvider().readSessionChunk(path, offset, maxBytes);
}

export async function searchRuntimeSessions(
  query: string,
  sessions: SessionInfo[],
): Promise<SearchResult[]> {
  return resolveSessionProvider().searchSessions(query, sessions);
}

export async function fullTextSearchRuntime(options: {
  query: string;
  roleFilter: "all" | "user" | "assistant";
  sourceFilter?: FullTextSearchSourceFilter;
  globPattern?: string | null;
  projectPath?: string | null;
  page: number;
  pageSize: number;
  matchMode?: "smart" | "any" | "all" | "phrase";
  sortOrder?: "score" | "newest" | "oldest";
  from?: string | null;
  to?: string | null;
}): Promise<FullTextSearchResponse> {
  return resolveSessionProvider().fullTextSearch(options);
}

export async function getRuntimeSessionLabels(
  path: string,
): Promise<Record<string, string>> {
  return resolveSessionProvider().getSessionLabels(path);
}

/**
 * Preview mode: read user/assistant messages from SQLite.
 * Skips JSONL parsing, tool calls, thinking blocks, and non-message entries.
 * Only works in Tauri/CLI mode (not demo/browser-dataset).
 */
export async function getPreviewEntriesFromDB(
  sessionPath: string,
): Promise<SessionEntry[]> {
  return invoke<SessionEntry[]>("get_session_preview_entries", { sessionPath });
}

export async function getRuntimeStats(
  sessions: SessionInfo[],
): Promise<SessionStats> {
  return resolveSessionProvider().getStats(sessions);
}

export async function getRuntimeDayStats(
  date: string,
  sessions: SessionInfo[],
): Promise<DayStats> {
  return resolveSessionProvider().getDayStats(date, sessions);
}

export function shouldListenRuntimeSessionEvents(): boolean {
  return supportsRuntimeSessionEvents();
}

export function canDeleteRuntimeSessions(): boolean {
  return (
    canMutateRuntimeSessions() && resolveSessionProvider().canDeleteSessions
  );
}

export function canRenameRuntimeSessions(): boolean {
  return (
    canMutateRuntimeSessions() && resolveSessionProvider().canRenameSessions
  );
}

export function canForkRuntimeSessionItems(): boolean {
  return canForkRuntimeSessions();
}

export type RuntimeSessionOperation = "delete" | "rename" | "fork";

export interface RuntimeSessionOperationCapability {
  supported: boolean;
  fallbackMessage: string;
}

export function getRuntimeSessionOperationCapability(
  operation: RuntimeSessionOperation,
): RuntimeSessionOperationCapability {
  switch (operation) {
    case "delete":
      return {
        supported: canDeleteRuntimeSessions(),
        fallbackMessage: "Deleting dataset sessions is not supported here.",
      };
    case "rename":
      return {
        supported: canRenameRuntimeSessions(),
        fallbackMessage: "Renaming dataset sessions is not supported here.",
      };
    case "fork":
      return {
        supported: canForkRuntimeSessionItems(),
        fallbackMessage: "Forking sessions is not supported here.",
      };
    default:
      return {
        supported: false,
        fallbackMessage: "This action is not supported in the current runtime.",
      };
  }
}

export async function deleteRuntimeSessionItems(paths: string[]) {
  return deleteRuntimeSessions(paths);
}

export async function renameRuntimeSessionItem(path: string, newName: string) {
  return renameRuntimeSession(path, newName);
}

export async function forkRuntimeSessionItem(
  sourcePath: string,
  targetName?: string,
) {
  return forkRuntimeSession(sourcePath, targetName);
}
