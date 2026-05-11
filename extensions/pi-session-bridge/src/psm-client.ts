/**
 * PSM HTTP Client — thin wrapper over fetch for PSM's POST /api dispatch.
 *
 * All PSM commands go through the unified dispatch table:
 *   POST /api  { command, payload }  →  { success, data, error }
 *
 * Tag operations delegate to PSM's SQLite-backed tag system.
 * No local database — PSM is the single source of truth.
 */
import { HTTP_BASE, AUTH_TOKEN } from "./config.js";
import type {
  ApiResponse,
  SessionInfo,
  SessionEntry,
  FullTextSearchResponse,
  TagItem,
  SessionTagItem,
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

  const response = await fetch(url, { ...options, headers });
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

// ── Tag commands (PSM backend — no local SQLite) ──────

export async function getAllTags(): Promise<TagItem[]> {
  return command<TagItem[]>("get_all_tags");
}

export async function getAllSessionTags(): Promise<SessionTagItem[]> {
  return command<SessionTagItem[]>("get_all_session_tags");
}

export async function createTag(
  name: string,
  color = "info",
  icon?: string,
  parentId?: string,
): Promise<TagItem> {
  return command<TagItem>("create_tag", { name, color, icon, parentId });
}

export async function updateTag(
  id: string,
  updates: Partial<Pick<TagItem, "name" | "color" | "icon" | "sort_order" | "parent_id">>,
): Promise<void> {
  await command("update_tag", { id, ...updates });
}

export async function deleteTag(id: string): Promise<void> {
  await command("delete_tag", { id });
}

export async function assignTag(sessionId: string, tagId: string): Promise<void> {
  await command("assign_tag", { sessionId, tagId });
}

export async function removeTagFromSession(
  sessionId: string,
  tagId: string,
): Promise<void> {
  await command("remove_tag_from_session", { sessionId, tagId });
}

export async function moveSessionTag(
  sessionId: string,
  fromTagId: string | null,
  toTagId: string,
  position = 0,
): Promise<void> {
  await command("move_session_tag", { sessionId, fromTagId, toTagId, position });
}

export async function reorderTags(tagIds: string[]): Promise<void> {
  await command("reorder_tags", { tagIds });
}
