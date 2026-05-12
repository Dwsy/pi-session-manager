import { useMemo } from "react";
import type { ComponentProps, RefObject } from "react";
import { useTranslation } from "react-i18next";

import FavoritesPanel from "@/components/FavoritesPanel";
import ProjectFilterList from "@/components/project/ProjectFilterList";
import ProjectList from "@/components/project/ProjectList";
import SessionList from "@/components/session-list/SessionList";
import SelectedProjectHeader from "@/components/project/SelectedProjectHeader";
import WorkspacePanel from "@/components/kanban/WorkspacePanel";
import type { FavoriteItem, SessionInfo } from "@/types";
import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import type { KanbanWorkspace } from "@/hooks/useWorkspaces";

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
  | "onResumeSession"
  | "onCopyResumeSession"
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
  onSelectKanbanFilterProject: ProjectFilterListProps["onSelectProject"];
  onSelectFavoriteProject: NonNullable<FavoritesPanelProps["onSelectProject"]>;
  onSelectSession: SessionListProps["onSelectSession"];
  onSelectProject: NonNullable<ProjectListProps["onSelectProject"]>;
  onRemoveFavorite: FavoritesPanelProps["onRemoveFavorite"];
  onToggleFavorite: NonNullable<ProjectListProps["onToggleFavorite"]>;
  liveSessionIds?: Set<string>;
  workspaces: KanbanWorkspace[];
  activeWorkspace: KanbanWorkspace;
  activeWorkspaceId: string;
  workspaceSessions?: SessionInfo[];
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (w: KanbanWorkspace) => void;
  onDeleteWorkspace: (id: string) => void;
}

function AppDesktopSidebarContent({
  showFavorites,
  sidebarMode,
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
  onSelectKanbanFilterProject,
  onSelectFavoriteProject,
  onSelectSession,
  onSelectProject,
  onRemoveFavorite,
  onToggleFavorite,
  liveSessionIds,
  workspaces,
  activeWorkspace,
  activeWorkspaceId,
  workspaceSessions,
  onSelectWorkspace,
  onCreateWorkspace,
  onEditWorkspace,
  onDeleteWorkspace,
}: AppDesktopSidebarContentProps) {
  const { t } = useTranslation();

  const selectedProjectLiveCount = useMemo(() => {
    if (!selectedProject) return 0;
    return filteredSessions.filter(
      (s) => s.cwd === selectedProject && (s.isLive || (liveSessionIds?.has(s.id) ?? false)),
    ).length;
  }, [selectedProject, filteredSessions, liveSessionIds]);

  return (
    <>
      {!showFavorites && sidebarMode === "kanban" && (
        <WorkspacePanel
          sessions={sessions}
          workspaceSessions={workspaceSessions}
          selectedProject={selectedProject}
          onSelectProject={onSelectKanbanFilterProject}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onCreateWorkspace={onCreateWorkspace}
          onEditWorkspace={onEditWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
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
          liveSessionIds={liveSessionIds}
        />
      ) : sidebarMode === "kanban" ? null : sidebarMode === "project" &&
        selectedProject &&
        selectedProjectSummary ? (
        <div className="flex flex-col">
          <SelectedProjectHeader
            projectName={selectedProjectSummary.projectName}
            sessionCount={selectedProjectSummary.sessionCount}
            liveCount={selectedProjectLiveCount}
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
