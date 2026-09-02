import { useMemo } from "react";
import type { ComponentProps, RefObject } from "react";
import { useTranslation } from "react-i18next";

import ProjectList from "@/components/project/ProjectList";
import SessionList from "@/components/session-list/SessionList";
import SelectedProjectHeader from "@/components/project/SelectedProjectHeader";
import AppPluginSidebarPane from "./AppPluginSidebarPane";
import type { SessionInfo } from "@/types";
import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import { pathsEqual } from "@/utils/path";

type SessionListProps = ComponentProps<typeof SessionList>;
type ProjectListProps = ComponentProps<typeof ProjectList>;

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
  locateSelectedSessionTrigger?: number;
  loading: boolean;
  getBadgeType?: SessionListProps["getBadgeType"];
  listScrollRef: RefObject<HTMLDivElement>;
  sessionListCommonProps: AppDesktopSidebarSessionListCommonProps;
  onLoadMoreSidebarSessions: NonNullable<SessionListProps["onLoadMore"]>;
  onSelectSession: SessionListProps["onSelectSession"];
  onSelectProject: NonNullable<ProjectListProps["onSelectProject"]>;
  liveSessionIds?: Set<string>;
}

function AppDesktopSidebarContent({
  sidebarMode,
  activeAppViewId,
  selectedProject,
  selectedProjectSummary,
  filteredSessions,
  sidebarSessions,
  sidebarLoading,
  sidebarHasMore,
  sidebarLoadingMore,
  locateSelectedSessionTrigger,
  loading,
  listScrollRef,
  sessionListCommonProps,
  onLoadMoreSidebarSessions,
  onSelectProject,
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
      {sidebarMode === "app" && (
        <AppPluginSidebarPane appViewId={activeAppViewId} />
      )}
      {sidebarMode === "project" &&
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
              locateSelectedSessionTrigger={locateSelectedSessionTrigger}
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
          locateSelectedSessionTrigger={locateSelectedSessionTrigger}
          scrollParentRef={listScrollRef}
        />
      )}
    </>
  );
}

export default AppDesktopSidebarContent;
