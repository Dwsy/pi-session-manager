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
  onSelectProject: NonNullable<ProjectListProps["onSelectProject"]>;
  loading: boolean;
  liveSessionIds?: Set<string>;
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
  onSelectProject,
  loading,
  liveSessionIds,
}: AppProjectListPaneProps) {
  return (
    <>
      {isMobile && mobileFilterBar}
      <div className="flex-1 min-h-0 overflow-y-auto" ref={projectScrollRef}>
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
            onSelectProject={onSelectProject}
            loading={loading}
            scrollParentRef={projectScrollRef}
            liveSessionIds={liveSessionIds}
          />
        )}
      </div>
    </>
  );
}

export default AppProjectListPane;
