import type { ComponentProps, ReactNode, RefObject } from "react";

import ProjectList from "@/components/project/ProjectList";
import SessionList from "@/components/session-list/SessionList";
import SelectedProjectHeader from "@/components/project/SelectedProjectHeader";
import type { SessionInfo } from "@/types";

type SessionListProps = ComponentProps<typeof SessionList>;
type ProjectListProps = ComponentProps<typeof ProjectList>;

export interface AppProjectListPaneSelectedProjectSummary {
  projectName: string;
  sessionCount: number;
}

export type AppProjectListPaneSessionListCommonProps = Pick<
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
>;

export interface AppProjectListPaneProps {
  isMobile: boolean;
  mobileFilterBar: ReactNode;
  projectScrollRef: RefObject<HTMLDivElement>;
  selectedProject: string | null;
  selectedProjectSummary: AppProjectListPaneSelectedProjectSummary | null;
  onBackFromProject: () => void;
  backLabel: string;
  sessionListCommonProps: AppProjectListPaneSessionListCommonProps;
  sidebarSessions: SessionInfo[];
  sidebarLoading: boolean;
  sidebarHasMore: boolean;
  sidebarLoadingMore: boolean;
  onLoadMoreSidebarSessions: NonNullable<SessionListProps["onLoadMore"]>;
  filteredSessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  onSelectSession: SessionListProps["onSelectSession"];
  onSelectProject: NonNullable<ProjectListProps["onSelectProject"]>;
  onDeleteSession: NonNullable<SessionListProps["onDeleteSession"]>;
  onConvertSession?: SessionListProps["onConvertSession"];
  loading: boolean;
  terminal?: ProjectListProps["terminal"];
  piPath?: ProjectListProps["piPath"];
  customCommand?: ProjectListProps["customCommand"];
  resumeCommand?: ProjectListProps["resumeCommand"];
  getBadgeType?: SessionListProps["getBadgeType"];
  favorites: NonNullable<ProjectListProps["favorites"]>;
  onToggleFavorite: NonNullable<ProjectListProps["onToggleFavorite"]>;
}

function AppProjectListPane({
  isMobile,
  mobileFilterBar,
  projectScrollRef,
  selectedProject,
  selectedProjectSummary,
  onBackFromProject,
  backLabel,
  sessionListCommonProps,
  sidebarSessions,
  sidebarLoading,
  sidebarHasMore,
  sidebarLoadingMore,
  onLoadMoreSidebarSessions,
  filteredSessions,
  selectedSession,
  onSelectSession,
  onSelectProject,
  onDeleteSession,
  onConvertSession,
  loading,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  getBadgeType,
  favorites,
  onToggleFavorite,
}: AppProjectListPaneProps) {
  return (
    <>
      {isMobile && mobileFilterBar}
      <div className="flex-1 overflow-y-auto" ref={projectScrollRef}>
        {selectedProject && selectedProjectSummary ? (
          <div className="flex flex-col h-full">
            <SelectedProjectHeader
              projectName={selectedProjectSummary.projectName}
              sessionCount={selectedProjectSummary.sessionCount}
              onBack={onBackFromProject}
              backLabel={backLabel}
            />
            <SessionList
              {...sessionListCommonProps}
              sessions={sidebarSessions}
              loading={sidebarLoading}
              hasMore={sidebarHasMore}
              loadingMore={sidebarLoadingMore}
              onLoadMore={onLoadMoreSidebarSessions}
              scrollParentRef={projectScrollRef}
              showDirectory={false}
            />
          </div>
        ) : (
          <ProjectList
            sessions={filteredSessions}
            selectedSession={selectedSession}
            selectedProject={selectedProject}
            onSelectSession={onSelectSession}
            onSelectProject={onSelectProject}
            onDeleteSession={onDeleteSession}
            onConvertSession={onConvertSession}
            loading={loading}
            terminal={terminal}
            piPath={piPath}
            customCommand={customCommand}
            resumeCommand={resumeCommand}
            getBadgeType={getBadgeType}
            scrollParentRef={projectScrollRef}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
          />
        )}
      </div>
    </>
  );
}

export default AppProjectListPane;
