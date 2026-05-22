/**
 * PSM HTTP Client — thin wrapper over fetch for PSM's POST /api dispatch.
 *
 * Search/session commands go through the unified dispatch table:
 *   POST /api  { command, payload }  ->  { success, data, error }
 *
 * Kanban tag operations intentionally live in kanban-store.ts and read/write
 * PSM JSON files directly, so they do not require the PSM HTTP server.
 */
import { HTTP_BASE, AUTH_TOKEN } from "./config.js";
import type {
  ApiResponse,
  SessionInfo,
  SessionEntry,
  FullTextSearchResponse,
} from "./types.js";

// ── HTTP primitives ──────────────────────────────────

async function request<T = unknown>(
  pathname: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${HTTP_BASE}${pathname}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    throw new Error(`Failed to reach PSM API at ${url}: ${error}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

async function command<T = unknown>(
  name: string,
  payload: unknown = {},
): Promise<T> {
  const resp = await request<ApiResponse<T>>("/api", {
    method: "POST",
    body: JSON.stringify({ command: name, payload }),
  });
  if (!resp.success) throw new Error(resp.error || `PSM command failed: ${name}`);
  return resp.data as T;
}

// ── Session commands ──────────────────────────────────

export async function scanSessions(): Promise<SessionInfo[]> {
  return command<SessionInfo[]>("scan_sessions");
}

export async function getSessionEntries(sessionPath: string): Promise<SessionEntry[]> {
  return command<SessionEntry[]>("get_session_entries", { path: sessionPath });
}

// ── Search commands ───────────────────────────────────

export async function fullTextSearch(params: {
  query: string;
  role_filter?: string;
  match_mode?: string;
  page_size?: number;
  sort_order?: string;
  source_filter?: string;
}): Promise<FullTextSearchResponse> {
  return command<FullTextSearchResponse>("full_text_search", {
    role_filter: "all",
    glob_pattern: null,
    project_path: null,
    page: 0,
    match_mode: "any",
    sort_order: "relevance",
    ...params,
  });
}
