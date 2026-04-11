import type {
  DayStats,
  FullTextSearchResponse,
  FullTextSearchSourceFilter,
  SearchResult,
  SessionChunk,
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
import { getRuntimeMode, type RuntimeMode } from "./runtimeMode";

export type SessionRuntimeMode = RuntimeMode;

export function getSessionRuntimeMode(): SessionRuntimeMode {
  return getRuntimeMode();
}

export async function loadRuntimeSessions(): Promise<SessionInfo[]> {
  return resolveSessionProvider().loadSessions();
}

export async function getRuntimeSessionByPath(
  path: string,
): Promise<SessionInfo | null> {
  return resolveSessionProvider().getSessionByPath(path);
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
  matchMode?: "any" | "all" | "phrase";
  sortOrder?: "score" | "newest" | "oldest";
}): Promise<FullTextSearchResponse> {
  return resolveSessionProvider().fullTextSearch(options);
}

export async function getRuntimeSessionLabels(
  path: string,
): Promise<Record<string, string>> {
  return resolveSessionProvider().getSessionLabels(path);
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
