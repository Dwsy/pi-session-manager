import type { RefObject } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen } from "lucide-react";

export type ProjectListSortMode = "recent" | "sessions" | "messages" | "name";

import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { ProjectListSkeleton } from "@/components/ui/Skeleton";
import { usePsmPluginUi, PluginContributionBoundary, PluginContributionSlot } from "@/plugins/runtime-host";
import type { SessionInfo } from "@/types";
import {
  formatDirectory,
  formatShortTime,
  getDirectoryName,
} from "@/utils/sessionDisplay";
import { getPathComparisonKey } from "@/utils/path";

interface ProjectListProps {
  sessions: SessionInfo[];
  onSelectProject?: (project: string | null) => void;
  loading: boolean;
  scrollParentRef?: RefObject<HTMLDivElement>;
  liveSessionIds?: Set<string>;
  selectedProject?: string | null;
  searchQuery?: string;
  sortMode?: ProjectListSortMode;
}

interface Project {
  dir: string;
  dirName: string;
  sessionCount: number;
  messageCount: number;
  lastModified: number;
  liveCount: number;
}

export default function ProjectList({
  sessions,
  onSelectProject,
  loading,
  scrollParentRef,
  liveSessionIds,
  selectedProject = null,
  searchQuery = "",
  sortMode = "recent",
}: ProjectListProps) {
  const { t } = useTranslation();
  const { projectListActions = [] } = usePsmPluginUi();

  const projects: Project[] = useMemo(() => {
    const projectMap = sessions.reduce((acc, session) => {
      const dir = session.cwd || t("common.unknown");
      const key = getPathComparisonKey(dir);
      const existingProject = acc.get(key);
      if (existingProject) {
        existingProject.sessions.push(session);
      } else {
        acc.set(key, { dir, sessions: [session] });
      }
      return acc;
    }, new Map<string, { dir: string; sessions: SessionInfo[] }>());

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const list = Array.from(projectMap.values()).map(({ dir, sessions: dirSessions }) => {
      const liveCount = dirSessions.filter(
        (s) => s.isLive || (liveSessionIds?.has(s.id) ?? false),
      ).length;
      return {
        dir,
        dirName: getDirectoryName(dir),
        sessionCount: dirSessions.length,
        messageCount: dirSessions.reduce((sum, s) => sum + s.message_count, 0),
        lastModified: Math.max(
          ...dirSessions.map((s) => new Date(s.modified).getTime()),
        ),
        liveCount,
      };
    });
    const filteredList = normalizedQuery
      ? list.filter((project) => {
          const haystack = `${project.dirName}\n${project.dir}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : list;

    filteredList.sort((a, b) => {
      if (sortMode === "sessions") return b.sessionCount - a.sessionCount || b.lastModified - a.lastModified;
      if (sortMode === "messages") return b.messageCount - a.messageCount || b.lastModified - a.lastModified;
      if (sortMode === "name") return a.dirName.localeCompare(b.dirName) || a.dir.localeCompare(b.dir);
      return b.lastModified - a.lastModified;
    });
    return filteredList;
  }, [sessions, t, liveSessionIds, searchQuery, sortMode]);

  const projectsVirtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 68,
    overscan: 8,
  });

  const showDelayedLoading = useDelayedLoading(loading);

  if (showDelayedLoading) {
    return <ProjectListSkeleton />;
  }

  if (loading) {
    return <div className="flex-1 min-h-[120px]" aria-hidden="true" />;
  }

  if (projects.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">{t("project.list.empty")}</p>
      </div>
    );
  }

  const virtualItems = projectsVirtualizer.getVirtualItems();

  return (
    <div className="min-h-0">
      <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border/10">
        {t("project.list.count", { count: projects.length })}
      </div>
      <div
        className="relative w-full"
        style={{ height: `${projectsVirtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const project = projects[virtualRow.index];
          if (!project) return null;
          const projectActions = projectListActions.map((action) => (
            <PluginContributionBoundary key={action.id} pluginId={action.pluginId} contributionId={action.id} title={action.title}>
              <PluginContributionSlot render={() => action.render({
                project: {
                  path: project.dir,
                  name: project.dirName,
                  sessionCount: project.sessionCount,
                  messageCount: project.messageCount,
                  lastModified: project.lastModified,
                  liveCount: project.liveCount,
                },
                onActivate: () => {},
              })} />
            </PluginContributionBoundary>
          ));
          const isSelected = selectedProject === project.dir;
          return (
            <div
              key={project.dir}
              data-index={virtualRow.index}
              ref={projectsVirtualizer.measureElement}
              className={`px-3 py-2 motion-surface motion-color border-b border-border/10 group select-none cursor-pointer ${isSelected ? "bg-info/10" : "hover:bg-background"}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-start gap-2">
                <div
                  className="min-w-0 flex-1"
                  onClick={() => onSelectProject?.(project.dir)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <div className="p-0.5 rounded flex-shrink-0">
                        <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-400" />
                      </div>
                      <div className="text-[13px] sm:text-sm font-medium truncate leading-tight">
                        {project.dirName}
                      </div>
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground flex-shrink-0 pt-0.5 whitespace-nowrap">
                      {formatShortTime(
                        new Date(project.lastModified).toISOString(),
                        t,
                      )}
                    </div>
                  </div>

                  <div
                    className="text-[11px] sm:text-xs text-muted-foreground/80 truncate mb-2 font-mono"
                    title={project.dir}
                  >
                    {formatDirectory(project.dir)}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-muted-foreground tabular-nums font-medium">
                    <span className="px-1.5 py-0.5 rounded bg-muted/40">
                      {project.sessionCount} {t("project.list.sessions")}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-muted/40">
                      {project.messageCount} {t("session.list.messages")}
                    </span>
                    {project.liveCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        {project.liveCount}
                      </span>
                    )}
                  </div>
                </div>
                {projectActions}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
