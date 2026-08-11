/**
 * PSM HTTP Client — bounded wrapper over PSM's POST /api dispatch.
 *
 * The bridge deliberately consumes PSM as the data/index SSOT. It does not
 * maintain a second catalog or search index.
 */
import {
  AUTH_TOKEN,
  HTTP_BASE,
  HTTP_TIMEOUT_CONTEXT,
  HTTP_TIMEOUT_DEFAULT,
  HTTP_TIMEOUT_FAST,
  HTTP_TIMEOUT_SEARCH,
} from "./config.js";
import type {
  ApiResponse,
  BridgeCapabilities,
  FullTextSearchResponse,
  PaginatedSessionsResult,
  SessionEntry,
  SessionEntryWindow,
  SessionInfo,
  SessionTagItem,
  TagItem,
} from "./types.js";

async function request<T = unknown>(
  pathname: string,
  options: RequestInit = {},
  timeoutMs = HTTP_TIMEOUT_DEFAULT,
): Promise<T> {
  const url = `${HTTP_BASE}${pathname}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || (error as { name?: string })?.name === "AbortError") {
      throw new Error(`PSM request timed out after ${timeoutMs}ms: ${pathname}`);
    }
    throw new Error(`Failed to reach PSM API at ${url}: ${error}`);
  } finally {
    clearTimeout(timer);
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
  timeoutMs = HTTP_TIMEOUT_DEFAULT,
): Promise<T> {
  const resp = await request<ApiResponse<T>>(
    "/api",
    { method: "POST", body: JSON.stringify({ command: name, payload }) },
    timeoutMs,
  );
  if (!resp.success) throw new Error(resp.error || `PSM command failed: ${name}`);
  return resp.data as T;
}

let capabilitiesPromise: Promise<BridgeCapabilities> | null = null;

export function resetCapabilityCacheForTests(): void {
  capabilitiesPromise = null;
}

export async function getBridgeCapabilities(): Promise<BridgeCapabilities> {
  capabilitiesPromise ??= command<BridgeCapabilities>("bridge_capabilities", {}, HTTP_TIMEOUT_FAST).catch((error) => {
    capabilitiesPromise = null;
    throw new Error(`PSM bridge protocol unavailable. Update Pi Session Manager to a version that supports bridge_capabilities. ${error}`);
  });
  return capabilitiesPromise;
}

export async function ensureBridgeCapabilities(required: string[]): Promise<BridgeCapabilities> {
  const info = await getBridgeCapabilities();
  if (info.protocolVersion !== 1) {
    throw new Error(`Unsupported PSM bridge protocol ${info.protocolVersion}; expected protocol 1.`);
  }
  const available = new Set(info.capabilities || []);
  const missing = required.filter((capability) => !available.has(capability));
  if (missing.length > 0) {
    throw new Error(`PSM is missing required bridge capabilities: ${missing.join(", ")}. Update Pi Session Manager.`);
  }
  return info;
}

// ── Session commands ──────────────────────────────────

export async function scanSessions(): Promise<SessionInfo[]> {
  return command<SessionInfo[]>("scan_sessions", {}, HTTP_TIMEOUT_FAST);
}

export async function scanSessionsPaginated(params: {
  offset?: number;
  limit?: number;
  search_query?: string;
  project_filter?: string;
  filter_tag_ids?: string[];
  source_filter_slugs?: string[];
  sort_by?: string;
} = {}): Promise<PaginatedSessionsResult> {
  return command<PaginatedSessionsResult>("scan_sessions_paginated", params, HTTP_TIMEOUT_FAST);
}

export async function getSessionById(id: string): Promise<SessionInfo | null> {
  return command<SessionInfo | null>("get_session_by_id", { id }, HTTP_TIMEOUT_FAST);
}

export async function getSessionEntries(sessionPath: string): Promise<SessionEntry[]> {
  return command<SessionEntry[]>("get_session_entries", { path: sessionPath }, HTTP_TIMEOUT_CONTEXT);
}

export async function getSessionEntryWindow(params: {
  path?: string;
  sessionId?: string;
  anchorEntryId?: string;
  before?: number;
  after?: number;
  includeTools?: boolean;
  maxChars?: number;
}): Promise<SessionEntryWindow> {
  return command<SessionEntryWindow>("get_session_entry_window", params, HTTP_TIMEOUT_CONTEXT);
}

// ── Search commands ───────────────────────────────────

export async function fullTextSearch(params: {
  query: string;
  role_filter?: string;
  match_mode?: string;
  page_size?: number;
  sort_order?: string;
  source_filter?: string;
  project_path?: string | null;
  glob_pattern?: string | null;
  from?: string;
  to?: string;
  max_content_chars?: number;
}): Promise<FullTextSearchResponse> {
  return command<FullTextSearchResponse>(
    "full_text_search",
    {
      role_filter: "all",
      glob_pattern: null,
      project_path: null,
      page: 0,
      match_mode: "any",
      sort_order: "relevance",
      ...params,
    },
    HTTP_TIMEOUT_SEARCH,
  );
}

// ── Tag commands ──────────────────────────────────────

type BackendTag = TagItem & {
  sortOrder?: number;
  isBuiltin?: boolean;
  createdAt?: string;
  parentId?: string | null;
};
type BackendSessionTag = SessionTagItem & {
  sessionId?: string;
  tagId?: string;
  assignedAt?: string;
};

function normalizeTag(tag: BackendTag): TagItem {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    icon: tag.icon,
    sort_order: tag.sort_order ?? tag.sortOrder ?? 0,
    is_builtin: tag.is_builtin ?? tag.isBuiltin ?? false,
    created_at: tag.created_at ?? tag.createdAt ?? "",
    parent_id: tag.parent_id ?? tag.parentId ?? null,
  };
}

function normalizeSessionTag(item: BackendSessionTag): SessionTagItem {
  return {
    session_id: item.session_id ?? item.sessionId ?? "",
    tag_id: item.tag_id ?? item.tagId ?? "",
    position: item.position,
    assigned_at: item.assigned_at ?? item.assignedAt ?? "",
  };
}

export async function getAllTags(): Promise<TagItem[]> {
  const tags = await command<BackendTag[]>("get_all_tags", {}, HTTP_TIMEOUT_FAST);
  return tags.map(normalizeTag);
}

export async function getAllSessionTags(): Promise<SessionTagItem[]> {
  const items = await command<BackendSessionTag[]>("get_all_session_tags", {}, HTTP_TIMEOUT_FAST);
  return items.map(normalizeSessionTag);
}

export async function createTag(name: string, color = "info"): Promise<TagItem> {
  const tag = await command<BackendTag>("create_tag", { name, color, icon: null, parentId: null }, HTTP_TIMEOUT_FAST);
  return normalizeTag(tag);
}

export async function assignTag(sessionId: string, tagId: string): Promise<void> {
  await command("assign_tag", { sessionId, tagId }, HTTP_TIMEOUT_FAST);
}

export async function removeTagFromSession(sessionId: string, tagId: string): Promise<void> {
  await command("remove_tag_from_session", { sessionId, tagId }, HTTP_TIMEOUT_FAST);
}

export async function moveSessionTag(sessionId: string, fromTagId: string | null, toTagId: string, position = 0): Promise<void> {
  await command("move_session_tag", { sessionId, fromTagId, toTagId, position }, HTTP_TIMEOUT_FAST);
}
