import { invoke } from "@/transport";
import type {
  DayStats,
  FullTextSearchResponse,
  SearchResult,
  SessionChunk,
  SessionInfo,
  SessionStats,
  SessionStatsInput,
  Tag,
} from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import {
  deleteDemoSessions,
  fullTextSearchDemo,
  getDemoDayStats,
  getDemoSessionByPath,
  getDemoSessionLabels,
  getDemoSessions,
  getDemoStats,
  listDemoSessionsPaginated,
  readDemoSessionChunk,
  renameDemoSession,
  searchDemoSessions,
} from "@/demo";
import {
  fullTextSearchBrowserDataset,
  getBrowserDatasetDayStats,
  getBrowserDatasetSessionByPath,
  getBrowserDatasetSessionLabels,
  getBrowserDatasetSessions,
  getBrowserDatasetStats,
  readBrowserDatasetChunk,
  searchBrowserDatasetSessions,
} from "@/browser-dataset";
import { getCachedSettings } from "@/utils/settingsApi";
import { filterSessions } from "@/utils/sessionFilters";
import { getSessionSourceSlug } from "@/utils/session";
import { getRuntimeMode } from "../runtimeMode";
import { browserTagsProvider } from "./tagsProviders";
import type {
  RuntimePaginatedSessionsResponse,
  SessionProvider,
} from "./types";

function mergeBackendLiveSessions(
  scanned: SessionInfo[],
  live: Array<{
    sessionId: string
    sessionPath?: string
    lastSeen: string
    entryCount: number
    pid?: number
    cwd?: string
  }>,
): SessionInfo[] {
  const liveMap = new Map(live.map((item) => [item.sessionId, item]));
  const visitedLiveIds = new Set<string>();

  const merged = scanned.map((session) => {
    const liveInfo = liveMap.get(session.id);
    if (liveInfo) {
      visitedLiveIds.add(session.id);
      return { ...session, isLive: true, pid: liveInfo.pid };
    }
    return session;
  });

  for (const liveInfo of live) {
    if (!visitedLiveIds.has(liveInfo.sessionId)) {
      merged.push({
        id: liveInfo.sessionId,
        path: liveInfo.sessionPath || liveInfo.sessionId,
        name: liveInfo.sessionId,
        modified: liveInfo.lastSeen,
        message_count: liveInfo.entryCount,
        last_message: "",
        last_message_role: "assistant",
        isLive: true,
        pid: liveInfo.pid,
        cwd: liveInfo.cwd || "",
        first_message: "",
        created: "",
      });
    }
  }

  merged.sort((left, right) => right.modified.localeCompare(left.modified));
  return merged;
}

function sortSessions(
  sessions: SessionInfo[],
  sortBy: SessionSortBy,
  sortOrder: SessionSortOrder,
): SessionInfo[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...sessions].sort((left, right) => {
    if (sortBy === "created") {
      return left.created.localeCompare(right.created) * direction;
    }
    if (sortBy === "name") {
      const leftName = (left.name || left.first_message || "").toLowerCase();
      const rightName = (right.name || right.first_message || "").toLowerCase();
      return leftName.localeCompare(rightName) * direction;
    }
    return left.modified.localeCompare(right.modified) * direction;
  });
}

function filterSessionsForExternalAnalytics(
  sessions: SessionInfo[],
  includeExternal: boolean,
): SessionInfo[] {
  if (includeExternal) {
    return sessions;
  }
  return sessions.filter((session) => {
    const slug = getSessionSourceSlug(session.path);
    return !slug || slug === "pi";
  });
}

function getDescendantIds(tags: Tag[], tagId: string): string[] {
  const descendants: string[] = [];
  const walk = (currentId: string) => {
    const children = tags.filter((tag) => tag.parentId === currentId);
    for (const child of children) {
      descendants.push(child.id);
      walk(child.id);
    }
  };
  walk(tagId);
  return descendants;
}

export const backendSessionProvider: SessionProvider = {
  mode: "backend",
  supportsLiveEvents: true,
  canDeleteSessions: true,
  canRenameSessions: true,
  canForkSessions: true,
  async loadSessions() {
    const [scanned, live] = await Promise.all([
      invoke<SessionInfo[]>("scan_sessions"),
      invoke<any[]>("get_pi_live_sessions"),
    ]);
    return mergeBackendLiveSessions(scanned, live);
  },
  async getSessionByPath(path) {
    return invoke<SessionInfo>("get_session_by_path", { path });
  },
  async canResolveSession(path) {
    await invoke("read_session_file", { path });
    return true;
  },
  async readSessionChunk(path, offset, maxBytes) {
    return invoke<SessionChunk>("read_session_file_chunk", {
      path,
      offset,
      maxBytes,
    });
  },
  async searchSessions(query, sessions) {
    const searchPrefs = getCachedSettings().search;
    return invoke<SearchResult[]>("search_sessions", {
      sessions,
      query,
      search_mode: searchPrefs.defaultSearchMode || "content",
      role_filter: "all",
      include_tools: searchPrefs.includeToolCalls ?? false,
    });
  },
  async fullTextSearch(options) {
    return invoke<FullTextSearchResponse>("full_text_search", {
      query: options.query,
      roleFilter: options.roleFilter,
      sourceFilter: options.sourceFilter || "all",
      globPattern: options.globPattern || null,
      projectPath: options.projectPath || null,
      includeThinking: getCachedSettings().search.includeThinkingInSearch,
      page: options.page,
      pageSize: options.pageSize,
      matchMode: options.matchMode || "any",
      sortOrder: options.sortOrder || "newest",
    });
  },
  async getSessionLabels(path) {
    return invoke<Record<string, string>>("get_session_labels", { path });
  },
  async getStats(sessions) {
    const includeExternal =
      getCachedSettings().session?.externalSessionsIncludeInStats === true;
    const filteredSessions = filterSessionsForExternalAnalytics(
      sessions,
      includeExternal,
    );
    const filteredStatsInputs: SessionStatsInput[] = filteredSessions.map((session) => ({
      path: session.path,
      cwd: session.cwd,
      modified: session.modified,
      message_count: session.message_count,
    }));

    try {
      return await invoke<SessionStats>("get_session_stats_light", {
        sessions: filteredStatsInputs,
      });
    } catch (error: any) {
      const message = typeof error === "string" ? error : error?.message;
      if (message && String(message).includes("get_session_stats_light")) {
        return invoke<SessionStats>("get_session_stats", {
          sessions: filteredSessions,
        });
      }
      throw error;
    }
  },
  async getDayStats(date, sessions) {
    const includeExternal =
      getCachedSettings().session?.externalSessionsIncludeInStats === true;
    const filteredSessions = filterSessionsForExternalAnalytics(
      sessions,
      includeExternal,
    );
    return invoke<DayStats>("get_day_stats", { date, sessions: filteredSessions });
  },
  async paginateSessions(options) {
    const normalizedSortKey = `${options.sortBy}_${options.sortOrder}`;
    return invoke<RuntimePaginatedSessionsResponse>("scan_sessions_paginated", {
      offset: options.offset,
      limit: options.limit,
      searchQuery: options.searchQuery || null,
      projectFilter: options.projectFilter || null,
      filterTagIds:
        options.filterTagIds && options.filterTagIds.length > 0
          ? options.filterTagIds
          : null,
      sourceFilterSlugs:
        options.sourceFilterSlugs && options.sourceFilterSlugs.length > 0
          ? options.sourceFilterSlugs
          : null,
      sortBy: normalizedSortKey,
      sort_by: normalizedSortKey,
    });
  },
  async deleteSessions(paths) {
    return invoke<{
      deleted_count: number;
      failed: Array<{ path: string; error: string }>;
    }>("delete_sessions", { paths });
  },
  async renameSession(path, newName) {
    await invoke("rename_session", {
      path,
      new_name: newName,
    });
    return null;
  },
  async forkSession(sourcePath, targetName) {
    return invoke<SessionInfo>("fork_session", {
      source_path: sourcePath,
      target_name: targetName || null,
    });
  },
};

export const demoSessionProvider: SessionProvider = {
  mode: "demo",
  supportsLiveEvents: false,
  canDeleteSessions: true,
  canRenameSessions: true,
  canForkSessions: false,
  loadSessions: async () => getDemoSessions(),
  getSessionByPath: async (path) => getDemoSessionByPath(path),
  canResolveSession: async () => true,
  readSessionChunk: async (path, offset, maxBytes) =>
    readDemoSessionChunk(path, offset, maxBytes),
  searchSessions: async (query, sessions) =>
    searchDemoSessions({ query, sessions }),
  fullTextSearch: async (options) =>
    fullTextSearchDemo({
      includeThinking: getCachedSettings().search.includeThinkingInSearch,
      query: options.query,
      roleFilter: options.roleFilter,
      sourceFilter: options.sourceFilter,
      globPattern: options.globPattern,
      projectPath: options.projectPath,
      page: options.page,
      pageSize: options.pageSize,
      matchMode: options.matchMode === "all" ? "all" : "any",
      sortOrder: options.sortOrder,
    }),
  getSessionLabels: async (path) => getDemoSessionLabels(path),
  getStats: async () => getDemoStats(),
  getDayStats: async (date, sessions) => getDemoDayStats(date, sessions),
  paginateSessions: async (options) =>
    listDemoSessionsPaginated({
      offset: options.offset,
      limit: options.limit,
      searchQuery: options.searchQuery || null,
      projectFilter: options.projectFilter || null,
      filterTagIds: options.filterTagIds || null,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
    }),
  deleteSessions: async (paths) => deleteDemoSessions(paths),
  renameSession: async (path, newName) => renameDemoSession(path, newName),
};

export const browserSessionProvider: SessionProvider = {
  mode: "browser-dataset",
  supportsLiveEvents: false,
  canDeleteSessions: false,
  canRenameSessions: false,
  canForkSessions: false,
  loadSessions: async () => getBrowserDatasetSessions(),
  getSessionByPath: async (path) => getBrowserDatasetSessionByPath(path),
  canResolveSession: async (path) =>
    Boolean(await getBrowserDatasetSessionByPath(path)),
  readSessionChunk: async (path, offset, maxBytes) =>
    readBrowserDatasetChunk(path, offset, maxBytes),
  searchSessions: async (query, sessions) =>
    searchBrowserDatasetSessions(query, sessions),
  fullTextSearch: async (options) => fullTextSearchBrowserDataset(options),
  getSessionLabels: async (path) => getBrowserDatasetSessionLabels(path),
  getStats: async (sessions) => getBrowserDatasetStats(sessions),
  getDayStats: async (date, sessions) =>
    getBrowserDatasetDayStats(date, sessions),
  paginateSessions: async (options) => {
    const sessions = await browserSessionProvider.loadSessions();
    const tagsState = await browserTagsProvider.loadTags();
    const filtered = filterSessions({
      sessions,
      searchQuery: options.searchQuery || "",
      projectFilter: options.projectFilter || null,
      filterTagIds: options.filterTagIds || [],
      sourceFilterSlugs: options.sourceFilterSlugs || [],
      sessionTags: tagsState.sessionTags,
      getDescendantIds: (tagId) => getDescendantIds(tagsState.tags, tagId),
    });
    const sorted = sortSessions(filtered, options.sortBy, options.sortOrder);
    const sliced = sorted.slice(options.offset, options.offset + options.limit);
    return {
      sessions: sliced,
      total: sorted.length,
      offset: options.offset,
      limit: options.limit,
      has_more: options.offset + options.limit < sorted.length,
    };
  },
};

export function resolveSessionProvider(): SessionProvider {
  switch (getRuntimeMode()) {
    case "demo":
      return demoSessionProvider;
    case "browser-dataset":
      return browserSessionProvider;
    default:
      return backendSessionProvider;
  }
}
