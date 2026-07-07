import { useMemo } from "react";
import type { ComponentProps, RefObject } from "react";
import { useTranslation } from "react-i18next";

import FavoritesPanel from "@/components/FavoritesPanel";
import ProjectList from "@/components/project/ProjectList";
import SessionList from "@/components/session-list/SessionList";
import SelectedProjectHeader from "@/components/project/SelectedProjectHeader";
import AppPluginSidebarPane from "./AppPluginSidebarPane";
import type { FavoriteItem, SessionInfo } from "@/types";
import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import { pathsEqual } from "@/utils/path";

type SessionListProps = ComponentProps<typeof SessionList>;
type ProjectListProps = ComponentProps<typeof ProjectList>;
type FavoritesPanelProps = ComponentProps<typeof FavoritesPanel>;

export interface AppDesktopSelectedProjectSummary {
  projectName: string;
  sessionCount: number;
}

export type AppDesktopSidebarSessionListCommonProps = Pick<
  SessionListProps,
  | "selectedSession"
  | "onSelectSession"
  | "onDeleteSession"
  | "onDeleteSessions"
  | "onConvertSession"
  | "onResumeSession"
  | "onCopyResumeSession"
  | "onForkSession"
  | "onPreviewExportSession"
  | "onOpenPreviewRenameDialog"
  | "onPreviewRenameSession"
  | "onPreviewForkSession"
  | "onPreviewConvertSession"
  | "loading"
  | "getBadgeType"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
  | "favorites"
  | "onToggleFavorite"
  | "tags"
  | "getTagsForSession"
  | "onToggleTag"
  | "onCreateTag"
  | "selectionModeTrigger"
  | "selectionModeDismissTrigger"
  | "searchQuery"
  | "liveSessionIds"
>;

export interface AppDesktopSidebarContentProps {
  showFavorites: boolean;
  sidebarMode: AppDesktopSidebarMode;
  activeAppViewId: string | null;
  sessions: SessionInfo[];
  selectedProject: string | null;
  selectedSession: SessionInfo | null;
  selectedProjectSummary: AppDesktopSelectedProjectSummary | null;
  filteredSessions: SessionInfo[];
  sidebarSessions: SessionInfo[];
  sidebarLoading: boolean;
  sidebarHasMore: boolean;
  sidebarLoadingMore: boolean;
  loading: boolean;
  loadingFavorites: boolean;
  favorites: FavoriteItem[];
  getBadgeType?: SessionListProps["getBadgeType"];
  listScrollRef: RefObject<HTMLDivElement>;
  sessionListCommonProps: AppDesktopSidebarSessionListCommonProps;
  onLoadMoreSidebarSessions: NonNullable<SessionListProps["onLoadMore"]>;
  onSelectFavoriteProject: NonNullable<FavoritesPanelProps["onSelectProject"]>;
  onSelectSession: SessionListProps["onSelectSession"];
  onSelectProject: NonNullable<ProjectListProps["onSelectProject"]>;
  onRemoveFavorite: FavoritesPanelProps["onRemoveFavorite"];
  onToggleFavorite: NonNullable<ProjectListProps["onToggleFavorite"]>;
  liveSessionIds?: Set<string>;
}

function AppDesktopSidebarContent({
  showFavorites,
  sidebarMode,
  activeAppViewId,
  sessions,
  selectedProject,
  selectedSession,
  selectedProjectSummary,
  filteredSessions,
  sidebarSessions,
  sidebarLoading,
  sidebarHasMore,
  sidebarLoadingMore,
  loading,
  loadingFavorites,
  favorites,
  getBadgeType,
  listScrollRef,
  sessionListCommonProps,
  onLoadMoreSidebarSessions,
  onSelectFavoriteProject,
  onSelectSession,
  onSelectProject,
  onRemoveFavorite,
  onToggleFavorite,
  liveSessionIds,
}: AppDesktopSidebarContentProps) {
  const { t } = useTranslation();

  const selectedProjectLiveCount = useMemo(() => {
    if (!selectedProject) return 0;
    return filteredSessions.filter(
      (s) => pathsEqual(s.cwd, selectedProject) && (s.isLive || (liveSessionIds?.has(s.id) ?? false)),
    ).length;
  }, [selectedProject, filteredSessions, liveSessionIds]);

  return (
    <>
      {!showFavorites && sidebarMode === "app" && (
        <AppPluginSidebarPane appViewId={activeAppViewId} />
      )}
      {showFavorites ? (
        <FavoritesPanel
          sessions={sessions}
          favorites={favorites}
          selectedSession={selectedSession}
          onSelectSession={onSelectSession}
          onRemoveFavorite={onRemoveFavorite}
          onSelectProject={onSelectFavoriteProject}
          getBadgeType={getBadgeType}
          loading={loadingFavorites}
          liveSessionIds={liveSessionIds}
        />
      ) : sidebarMode === "app" ? null : sidebarMode === "project" &&
        selectedProject &&
        selectedProjectSummary ? (
        <div className="flex min-h-0 flex-col">
          <SelectedProjectHeader
            projectName={selectedProjectSummary.projectName}
            sessionCount={selectedProjectSummary.sessionCount}
            liveCount={selectedProjectLiveCount}
            onBack={() => onSelectProject(null)}
            backLabel={t("project.list.back")}
          />
          <div className="min-h-0">
            <SessionList
              {...sessionListCommonProps}
              sessions={sidebarSessions}
              loading={sidebarLoading}
              hasMore={sidebarHasMore}
              loadingMore={sidebarLoadingMore}
              onLoadMore={onLoadMoreSidebarSessions}
              scrollParentRef={listScrollRef}
              showDirectory={false}
            />
          </div>
        </div>
      ) : sidebarMode === "project" ? (
        <ProjectList
          sessions={filteredSessions}
          onSelectProject={onSelectProject}
          loading={loading}
          scrollParentRef={listScrollRef}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          liveSessionIds={liveSessionIds}
        />
      ) : (
        <SessionList
          {...sessionListCommonProps}
          sessions={sidebarSessions}
          loading={sidebarLoading}
          hasMore={sidebarHasMore}
          loadingMore={sidebarLoadingMore}
          onLoadMore={onLoadMoreSidebarSessions}
          scrollParentRef={listScrollRef}
        />
      )}
    </>
  );
}

export default AppDesktopSidebarContent;
