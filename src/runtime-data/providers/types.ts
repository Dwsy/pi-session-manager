import type {
  DayStats,
  FavoriteItem,
  FullTextSearchResponse,
  FullTextSearchSourceFilter,
  SearchResult,
  SessionChunk,
  SessionInfo,
  SessionStats,
  SessionTag,
  Tag,
} from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import type { RuntimeMode } from "../runtimeMode";

export interface RuntimePaginatedSessionsResponse {
  sessions: SessionInfo[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface SessionProvider {
  mode: RuntimeMode;
  supportsLiveEvents: boolean;
  canDeleteSessions: boolean;
  canRenameSessions: boolean;
  canForkSessions: boolean;
  loadSessions(): Promise<SessionInfo[]>;
  getSessionByPath(path: string): Promise<SessionInfo | null>;
  canResolveSession(path: string): Promise<boolean>;
  readSessionChunk(
    path: string,
    offset: number,
    maxBytes: number,
  ): Promise<SessionChunk>;
  searchSessions(
    query: string,
    sessions: SessionInfo[],
  ): Promise<SearchResult[]>;
  fullTextSearch(options: {
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
  }): Promise<FullTextSearchResponse>;
  getSessionLabels(path: string): Promise<Record<string, string>>;
  getStats(sessions: SessionInfo[]): Promise<SessionStats>;
  getDayStats(date: string, sessions: SessionInfo[]): Promise<DayStats>;
  paginateSessions(options: {
    offset: number;
    limit: number;
    searchQuery?: string | null;
    projectFilter?: string | null;
    filterTagIds?: string[] | null;
    sourceFilterSlugs?: string[] | null;
    sortBy: SessionSortBy;
    sortOrder: SessionSortOrder;
  }): Promise<RuntimePaginatedSessionsResponse>;
  deleteSessions?(paths: string[]): Promise<{
    deleted_count: number;
    failed: Array<{ path: string; error: string }>;
  }>;
  renameSession?(path: string, newName: string): Promise<SessionInfo | null>;
  forkSession?(
    sourcePath: string,
    targetName?: string,
  ): Promise<SessionInfo | null>;
}

export interface FavoritesProvider {
  mode: RuntimeMode;
  loadFavorites(): Promise<FavoriteItem[]>;
  removeFavorite(item: FavoriteItem): Promise<void>;
  toggleFavorite(item: Omit<FavoriteItem, "addedAt">): Promise<void>;
}

export interface TagsProvider {
  mode: RuntimeMode;
  loadTags(): Promise<{ tags: Tag[]; sessionTags: SessionTag[] }>;
  createTag(
    name: string,
    color: string,
    icon?: string,
    parentId?: string,
  ): Promise<Tag>;
  updateTag(
    id: string,
    updates: Partial<Pick<Tag, "name" | "color" | "icon">>,
  ): Promise<void>;
  deleteTag(id: string): Promise<void>;
  assignTag(sessionId: string, tagId: string): Promise<void>;
  removeTagFromSession(sessionId: string, tagId: string): Promise<void>;
  moveSessionTag(
    sessionId: string,
    fromTagId: string | null,
    toTagId: string,
    position: number,
  ): Promise<void>;
  reorderTags(tagIds: string[]): Promise<void>;
  updateTagAutoRules(id: string, rules: string | null): Promise<void>;
  evaluateAutoRules(sessionId: string, text: string): Promise<string[]>;
}
