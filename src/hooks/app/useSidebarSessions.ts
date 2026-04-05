import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AppDesktopSidebarSessionListCommonProps } from "@/components/app/AppDesktopSidebarContent";
import type { MobileTab } from "@/components/app/AppMobileLayout";
import type { TerminalType } from "@/components/settings/types";
import type { FavoriteItem, SessionInfo, SessionTag, Tag } from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import { filterSessions } from "@/utils/sessionFilters";
import { getDirectoryName } from "@/utils/sessionDisplay";
import { usePaginatedSessions } from "@/hooks/usePaginatedSessions";

export type AppSidebarViewMode = "list" | "project" | "kanban";

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
  sessionTags: SessionTag[];
  getDescendantIds: (tagId: string) => string[];
  onSelectSession: (session: SessionInfo) => void;
  onDeleteSession: (session: SessionInfo) => void | Promise<void>;
  onDeleteSessions: (sessions: SessionInfo[]) => void | Promise<void>;
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
  sessionTags,
  getDescendantIds,
  onSelectSession,
  onDeleteSession,
  onDeleteSessions,
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
      sessionTags,
      getDescendantIds,
    });
  }, [
    sessions,
    sessionTags,
    filterTagIds,
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
    hasLoadedOnce: pagedSidebarLoadedOnce,
    loadMore: loadMoreSidebarSessions,
    refresh: refreshSidebarSessions,
  } = usePaginatedSessions({
    enabled: shouldEnablePagedSidebar,
    pageSize: 100,
    searchQuery: sidebarSearchQuery,
    projectFilter: listProjectFilter,
    filterTagIds: effectiveFilterTagIds,
    sortBy,
    sortOrder,
  });

  const latestSessionsRef = useRef(sessions);
  const latestSessionTagsRef = useRef(sessionTags);

  useEffect(() => {
    if (!shouldEnablePagedSidebar) {
      return;
    }

    if (!pagedSidebarLoadedOnce) {
      latestSessionsRef.current = sessions;
      latestSessionTagsRef.current = sessionTags;
      return;
    }

    const sessionsChanged = latestSessionsRef.current !== sessions;
    const sessionTagsChanged = latestSessionTagsRef.current !== sessionTags;

    if (!sessionsChanged && !sessionTagsChanged) {
      return;
    }

    latestSessionsRef.current = sessions;
    latestSessionTagsRef.current = sessionTags;

    void refreshSidebarSessions({
      silent: true,
      preserveCount: true,
    });
  }, [
    shouldEnablePagedSidebar,
    pagedSidebarLoadedOnce,
    refreshSidebarSessions,
    sessions,
    sessionTags,
  ]);

  const selectedProjectSummary = useMemo(() => {
    if (!selectedProject) {
      return null;
    }

    const matchedSession = sessions.find((session) => session.cwd === selectedProject);
    const projectName = getDirectoryName(matchedSession?.cwd || selectedProject);
    const sessionCount = sessions.filter(
      (session) => session.cwd === selectedProject,
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
    sidebarLoading: shouldEnablePagedSidebar ? pagedSidebarLoading : loading,
    sidebarLoadingMore: pagedSidebarLoadingMore,
    sidebarHasMore: pagedSidebarHasMore,
    loadMoreSidebarSessions,
    selectedProjectSummary,
    sessionListCommonProps,
    handleToggleSessionTag,
  };
}
