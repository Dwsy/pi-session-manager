import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AppDesktopSidebarSessionListCommonProps } from "@/components/app/AppDesktopSidebarContent";
import type { MobileTab } from "@/components/app/AppMobileLayout";
import type { TerminalType } from "@/components/settings/types";
import type { FavoriteItem, SessionInfo, SessionTag, Tag, DateRange } from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import { filterSessions } from "@/utils/sessionFilters";
import { getDirectoryName } from "@/utils/sessionDisplay";
import { pathsEqual } from "@/utils/path";
import { usePaginatedSessions } from "@/hooks/usePaginatedSessions";

export type AppSidebarViewMode = "list" | "project" | "app";

export interface SidebarSelectedProjectSummary {
  projectName: string;
  sessionCount: number;
}

export interface UseSidebarSessionsOptions {
  sessions: SessionInfo[];
  loading: boolean;
  selectedSession: SessionInfo | null;
  selectedProject: string | null;
  isMobile: boolean;
  mobileTab: MobileTab;
  viewMode: AppSidebarViewMode;
  showFavorites: boolean;
  sidebarSearchQuery: string;
  filterTagIds: string[];
  sourceFilterSlugs?: string[];
  modelFilter?: string;
  dateRange?: DateRange | null;
  sessionTags: SessionTag[];
  getDescendantIds: (tagId: string) => string[];
  onSelectSession: (session: SessionInfo) => void;
  onDeleteSession: (session: SessionInfo) => void | Promise<void>;
  onDeleteSessions: (sessions: SessionInfo[]) => void | Promise<void>;
  onConvertSession: (session: SessionInfo) => void | Promise<void>;
  onResumeSession: (session: SessionInfo) => void | Promise<void>;
  onCopyResumeSession: (session: SessionInfo) => void | Promise<void>;
  onForkSession?: (session: SessionInfo) => void | Promise<void>;
  getBadgeType: (sessionId: string) => "new" | "updated" | null;
  terminal: TerminalType;
  piPath: string;
  customCommand: string;
  sortBy: SessionSortBy;
  sortOrder: SessionSortOrder;
  favorites: FavoriteItem[];
  onToggleFavorite: (item: Omit<FavoriteItem, "addedAt">) => Promise<void>;
  tags: Tag[];
  getTagsForSession: (sessionId: string) => Tag[];
  assignTag: (sessionId: string, tagId: string) => Promise<void>;
  removeTagFromSession: (sessionId: string, tagId: string) => Promise<void>;
  createTag: (
    name: string,
    color: string,
    icon?: string,
    parentId?: string,
  ) => Promise<Tag>;
  selectionModeTrigger?: number;
  selectionModeDismissTrigger?: number;
  liveSessionIds?: Set<string>;
}

export interface UseSidebarSessionsReturn {
  filteredSessions: SessionInfo[];
  sidebarSessions: SessionInfo[];
  sidebarLoading: boolean;
  sidebarLoadingMore: boolean;
  sidebarHasMore: boolean;
  loadMoreSidebarSessions: () => Promise<void>;
  selectedProjectSummary: SidebarSelectedProjectSummary | null;
  sessionListCommonProps: AppDesktopSidebarSessionListCommonProps;
  handleToggleSessionTag: (
    sessionId: string,
    tagId: string,
    assigned: boolean,
  ) => void;
}

export function useSidebarSessions({
  sessions,
  loading,
  selectedSession,
  selectedProject,
  isMobile,
  mobileTab,
  viewMode,
  showFavorites,
  sidebarSearchQuery,
  filterTagIds,
  sourceFilterSlugs = [],
  modelFilter,
  dateRange,
  sessionTags,
  getDescendantIds,
  onSelectSession,
  onDeleteSession,
  onDeleteSessions,
  onConvertSession,
  onResumeSession,
  onCopyResumeSession,
  onForkSession,
  getBadgeType,
  terminal,
  piPath,
  customCommand,
  sortBy,
  sortOrder,
  favorites,
  onToggleFavorite,
  tags,
  getTagsForSession,
  assignTag,
  removeTagFromSession,
  createTag,
  selectionModeTrigger,
  selectionModeDismissTrigger,
  liveSessionIds,
}: UseSidebarSessionsOptions): UseSidebarSessionsReturn {
  const handleToggleSessionTag = useCallback(
    (sessionId: string, tagId: string, assigned: boolean) => {
      if (assigned) {
        void removeTagFromSession(sessionId, tagId);
        return;
      }
      void assignTag(sessionId, tagId);
    },
    [assignTag, removeTagFromSession],
  );

  const filteredSessions = useMemo(() => {
    return filterSessions({
      sessions,
      searchQuery: sidebarSearchQuery,
      filterTagIds,
      sourceFilterSlugs,
      modelFilter,
      dateRange: dateRange ?? undefined,
      sessionTags,
      getDescendantIds,
    });
  }, [
    sessions,
    sessionTags,
    filterTagIds,
    sourceFilterSlugs,
    modelFilter,
    dateRange,
    getDescendantIds,
    sidebarSearchQuery,
  ]);

  const effectiveFilterTagIds = useMemo(() => {
    if (filterTagIds.length === 0) {
      return [] as string[];
    }

    const allFilterIds = new Set(filterTagIds);
    for (const tagId of filterTagIds) {
      for (const descId of getDescendantIds(tagId)) {
        allFilterIds.add(descId);
      }
    }

    return Array.from(allFilterIds);
  }, [filterTagIds, getDescendantIds]);

  const showProjectSessionList = isMobile
    ? mobileTab === "projects" && !!selectedProject
    : viewMode === "project" && !!selectedProject;
  const shouldEnablePagedSidebar =
    !showFavorites &&
    (isMobile
      ? mobileTab === "list" || showProjectSessionList
      : viewMode === "list" || showProjectSessionList);
  const listProjectFilter = showProjectSessionList ? selectedProject : null;

  const {
    sessions: pagedSidebarSessions,
    loading: pagedSidebarLoading,
    loadingMore: pagedSidebarLoadingMore,
    hasMore: pagedSidebarHasMore,
    loadMore: loadMoreSidebarSessions,
    refresh: refreshSidebarSessions,
  } = usePaginatedSessions({
    enabled: shouldEnablePagedSidebar,
    pageSize: 100,
    searchQuery: sidebarSearchQuery,
    projectFilter: listProjectFilter,
    filterTagIds: effectiveFilterTagIds,
    sourceFilterSlugs,
    sortBy,
    sortOrder,
  });

  // Track the last refresh trigger to avoid redundant full refreshes.
  // The file watcher already patches sessions incrementally via patchSessions;
  // we should NOT re-trigger scan_sessions_paginated on every file watcher diff.
  // Only refresh when: (1) first load, (2) filter/sort params change, (3) session count changes (new/deleted).
  const lastRefreshKeyRef = useRef<string>("");
  const lastSessionCountRef = useRef(0);

  useEffect(() => {
    if (!shouldEnablePagedSidebar) {
      lastRefreshKeyRef.current = "";
      lastSessionCountRef.current = 0;
      return;
    }

    // Build a key from the filter/sort params that actually matter for the paginated query.
    const refreshKey = [
      listProjectFilter || "__all__",
      sidebarSearchQuery || "__empty__",
      effectiveFilterTagIds.join(",") || "__no_tags__",
      sourceFilterSlugs.join(",") || "__no_sources__",
      sortBy,
      sortOrder,
    ].join("|");

    const sessionCountChanged = sessions.length !== lastSessionCountRef.current;
    lastSessionCountRef.current = sessions.length;

    // Only refresh when filter/sort params change OR session count changes (new/deleted sessions).
    // Skip refresh when only existing sessions are updated (file watcher metadata changes).
    if (refreshKey === lastRefreshKeyRef.current && !sessionCountChanged) {
      return;
    }

    lastRefreshKeyRef.current = refreshKey;
    void refreshSidebarSessions({ silent: true, preserveCount: true });
  }, [
    shouldEnablePagedSidebar,
    refreshSidebarSessions,
    sessions,
    listProjectFilter,
    sidebarSearchQuery,
    effectiveFilterTagIds,
    sourceFilterSlugs,
    sortBy,
    sortOrder,
  ]);

  const selectedProjectSummary = useMemo(() => {
    if (!selectedProject) {
      return null;
    }

    const matchedSession = sessions.find((session) => pathsEqual(session.cwd, selectedProject));
    const projectName = getDirectoryName(matchedSession?.cwd || selectedProject);
    const sessionCount = sessions.filter(
      (session) => pathsEqual(session.cwd, selectedProject),
    ).length;

    return {
      projectName,
      sessionCount,
    };
  }, [sessions, selectedProject]);

  const sessionListCommonProps = useMemo<AppDesktopSidebarSessionListCommonProps>(
    () => ({
      selectedSession,
      onSelectSession,
      onDeleteSession,
      onDeleteSessions,
      onConvertSession,
      onResumeSession,
      onCopyResumeSession,
      onForkSession,
      loading,
      getBadgeType,
      terminal,
      piPath,
      customCommand,
      favorites,
      onToggleFavorite,
      tags,
      getTagsForSession,
      onToggleTag: handleToggleSessionTag,
      onCreateTag: createTag,
      selectionModeTrigger,
      selectionModeDismissTrigger,
      searchQuery: sidebarSearchQuery,
      liveSessionIds,
    }),
    [
      selectedSession,
      onSelectSession,
      onDeleteSession,
      onDeleteSessions,
      onConvertSession,
      onResumeSession,
      onCopyResumeSession,
      loading,
      getBadgeType,
      terminal,
      piPath,
      customCommand,
      favorites,
      onToggleFavorite,
      tags,
      getTagsForSession,
      handleToggleSessionTag,
      createTag,
      selectionModeTrigger,
      selectionModeDismissTrigger,
      sidebarSearchQuery,
      liveSessionIds,
    ],
  );

  return {
    filteredSessions,
    sidebarSessions: pagedSidebarSessions,
    sidebarLoading:
      loading || (shouldEnablePagedSidebar ? pagedSidebarLoading : false),
    sidebarLoadingMore: pagedSidebarLoadingMore,
    sidebarHasMore: pagedSidebarHasMore,
    loadMoreSidebarSessions,
    selectedProjectSummary,
    sessionListCommonProps,
    handleToggleSessionTag,
  };
}
