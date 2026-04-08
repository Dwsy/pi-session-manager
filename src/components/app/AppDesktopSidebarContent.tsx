import type { ComponentProps, RefObject } from "react";
import { useTranslation } from "react-i18next";

import FavoritesPanel from "@/components/FavoritesPanel";
import ProjectFilterList from "@/components/project/ProjectFilterList";
import ProjectList from "@/components/project/ProjectList";
import SessionList from "@/components/session-list/SessionList";
import SelectedProjectHeader from "@/components/project/SelectedProjectHeader";
import type { FavoriteItem, SessionInfo } from "@/types";
import type { AppDesktopSidebarViewMode } from "./AppDesktopSidebar";

type SessionListProps = ComponentProps<typeof SessionList>;
type ProjectListProps = ComponentProps<typeof ProjectList>;
type FavoritesPanelProps = ComponentProps<typeof FavoritesPanel>;
type ProjectFilterListProps = ComponentProps<typeof ProjectFilterList>;

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
  viewMode: AppDesktopSidebarViewMode;
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
  terminal?: ProjectListProps["terminal"];
  piPath?: ProjectListProps["piPath"];
  customCommand?: ProjectListProps["customCommand"];
  resumeCommand?: ProjectListProps["resumeCommand"];
  getBadgeType?: SessionListProps["getBadgeType"];
  listScrollRef: RefObject<HTMLDivElement>;
  sessionListCommonProps: AppDesktopSidebarSessionListCommonProps;
  onLoadMoreSidebarSessions: NonNullable<SessionListProps["onLoadMore"]>;
  onSelectKanbanFilterProject: ProjectFilterListProps["onSelectProject"];
  onSelectFavoriteProject: NonNullable<FavoritesPanelProps["onSelectProject"]>;
  onSelectSession: SessionListProps["onSelectSession"];
  onSelectProject: NonNullable<ProjectListProps["onSelectProject"]>;
  onDeleteSession: NonNullable<SessionListProps["onDeleteSession"]>;
  onRemoveFavorite: FavoritesPanelProps["onRemoveFavorite"];
  onToggleFavorite: NonNullable<ProjectListProps["onToggleFavorite"]>;
}

function AppDesktopSidebarContent({
  showFavorites,
  viewMode,
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
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  getBadgeType,
  listScrollRef,
  sessionListCommonProps,
  onLoadMoreSidebarSessions,
  onSelectKanbanFilterProject,
  onSelectFavoriteProject,
  onSelectSession,
  onSelectProject,
  onDeleteSession,
  onRemoveFavorite,
  onToggleFavorite,
}: AppDesktopSidebarContentProps) {
  const { t } = useTranslation();

  return (
    <>
      {!showFavorites && viewMode === "kanban" && (
        <ProjectFilterList
          sessions={sessions}
          selectedProject={selectedProject}
          onSelectProject={onSelectKanbanFilterProject}
          scrollParentRef={listScrollRef}
        />
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
        />
      ) : viewMode === "kanban" ? null : viewMode === "project" &&
        selectedProject &&
        selectedProjectSummary ? (
        <div className="flex flex-col">
          <SelectedProjectHeader
            projectName={selectedProjectSummary.projectName}
            sessionCount={selectedProjectSummary.sessionCount}
            onBack={() => onSelectProject(null)}
            backLabel={t("project.list.back")}
          />
          <div>
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
      ) : viewMode === "project" ? (
        <ProjectList
          sessions={filteredSessions}
          selectedSession={selectedSession}
          selectedProject={selectedProject}
          onSelectSession={onSelectSession}
          onSelectProject={onSelectProject}
          onDeleteSession={onDeleteSession}
          loading={loading}
          terminal={terminal}
          piPath={piPath}
          customCommand={customCommand}
          resumeCommand={resumeCommand}
          getBadgeType={getBadgeType}
          scrollParentRef={listScrollRef}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
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
