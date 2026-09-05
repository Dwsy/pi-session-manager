import { useMemo, useState } from "react";
import type { ComponentProps, RefObject } from "react";
import { useTranslation } from "react-i18next";

import ProjectList from "@/components/project/ProjectList";
import SessionList from "@/components/session-list/SessionList";
import SelectedProjectHeader from "@/components/project/SelectedProjectHeader";
import AppPluginSidebarPane from "./AppPluginSidebarPane";
import { useOptionalAppPluginSurfaceData } from "./AppPluginSurfaceData";
import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginUi,
} from "@/plugins/runtime-host";
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
  const pluginSurfaceData = useOptionalAppPluginSurfaceData();
  const { projectSessionViews } = usePsmPluginUi();
  const projectSessionView = pluginSurfaceData ? (projectSessionViews[0] ?? null) : null;
  const [projectSessionMode, setProjectSessionMode] = useState<string | null>(null);
  const projectSessionModes = projectSessionView?.modes ?? [];
  const fallbackProjectSessionMode =
    projectSessionView?.defaultMode &&
    projectSessionModes.some((mode) => mode.id === projectSessionView.defaultMode)
      ? projectSessionView.defaultMode
      : (projectSessionModes[0]?.id ?? null);
  const activeProjectSessionMode =
    projectSessionMode && projectSessionModes.some((mode) => mode.id === projectSessionMode)
      ? projectSessionMode
      : fallbackProjectSessionMode;

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
            trailing={
              projectSessionView && activeProjectSessionMode ? (
                <select
                  aria-label={t("project.sessionView.mode", "Project session view")}
                  value={activeProjectSessionMode}
                  onChange={(event) => setProjectSessionMode(event.target.value)}
                  className="h-7 max-w-28 rounded-md border border-border/50 bg-background px-2 text-[11px] text-muted-foreground motion-color focus-ring hover:text-foreground"
                  title={projectSessionView.title}
                >
                  {projectSessionModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.title}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
          <div className="min-h-0">
            {projectSessionView && activeProjectSessionMode && pluginSurfaceData ? (
              <PluginContributionBoundary
                pluginId={projectSessionView.pluginId}
                contributionId={projectSessionView.id}
                title={projectSessionView.title}
              >
                <PluginContributionSlot
                  render={() =>
                    projectSessionView.render({
                      projectPath: selectedProject,
                      sessionIds: sidebarSessions.map((session) => session.id),
                      mode: activeProjectSessionMode,
                      loading: sidebarLoading,
                      loadingMore: sidebarLoadingMore,
                      hasMore: sidebarHasMore,
                      onLoadMore: onLoadMoreSidebarSessions,
                      data: { ...pluginSurfaceData, sessions: sidebarSessions },
                    })
                  }
                />
              </PluginContributionBoundary>
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
                showDirectory={false}
              />
            )}
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
