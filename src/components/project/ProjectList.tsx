import type { RefObject } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen, Pin } from "lucide-react";

export type ProjectListSortMode = "recent" | "sessions" | "messages" | "name";

import { ProjectListSkeleton } from "@/components/ui/Skeleton";
import type { SessionInfo, FavoriteItem } from "@/types";
import {
  formatDirectory,
  formatShortTime,
  getDirectoryName,
} from "@/utils/sessionDisplay";

interface ProjectListProps {
  sessions: SessionInfo[];
  onSelectProject?: (project: string | null) => void;
  loading: boolean;
  scrollParentRef?: RefObject<HTMLDivElement>;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, "addedAt">) => void;
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
  favorites = [],
  onToggleFavorite,
  liveSessionIds,
  selectedProject = null,
  searchQuery = "",
  sortMode = "recent",
}: ProjectListProps) {
  const { t } = useTranslation();

  const projects: Project[] = useMemo(() => {
    const projectMap = sessions.reduce(
      (acc, session) => {
        const cwd = session.cwd || t("common.unknown");
        if (!acc[cwd]) {
          acc[cwd] = [];
        }
        acc[cwd].push(session);
        return acc;
      },
      {} as Record<string, SessionInfo[]>,
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const list = Object.entries(projectMap).map(([dir, dirSessions]) => {
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

  if (loading) {
    return <ProjectListSkeleton />;
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
          const isFavorite = favorites.some(
            (f) => f.type === "project" && f.id === project.dir,
          );
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
                        <FolderOpen
                          className={`h-4 w-4 flex-shrink-0 ${
                            isFavorite ? "text-yellow-500" : "text-blue-400"
                          }`}
                        />
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

                  <div className="text-[11px] sm:text-xs text-muted-foreground/80 truncate mb-2 font-mono">
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
                {onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite({
                        type: "project",
                        id: project.dir,
                        name: project.dirName,
                        path: project.dir,
                      });
                    }}
                    className={`p-1 rounded motion-color motion-press focus-ring flex-shrink-0 opacity-0 group-hover:opacity-100 ${
                      isFavorite
                        ? "text-yellow-400 opacity-100"
                        : "text-muted-foreground hover:text-yellow-400"
                    }`}
                    title={
                      isFavorite ? t("favorites.remove") : t("favorites.add")
                    }
                  >
                    <Pin
                      className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
