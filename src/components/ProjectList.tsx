import type { RefObject } from "react";
import type { SessionInfo, FavoriteItem } from "../types";
import { FolderOpen, Star } from "lucide-react";
import { ProjectListSkeleton } from "./Skeleton";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import SessionList from "./SessionList";
import SelectedProjectHeader from "./project/SelectedProjectHeader";
import type { TerminalType } from "./settings/types";
import { getPlatformDefaults } from "./settings/types";
import { formatDirectory, formatShortTime, getDirectoryName } from "../utils/sessionDisplay";

interface ProjectListProps {
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  selectedProject?: string | null;
  onSelectSession: (session: SessionInfo) => void;
  onSelectProject?: (project: string | null) => void;
  onDeleteSession?: (session: SessionInfo) => void;
  loading: boolean;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  getBadgeType?: (sessionId: string) => "new" | "updated" | null;
  scrollParentRef?: RefObject<HTMLDivElement>;
  showHeader?: boolean;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, "addedAt">) => void;
}

interface Project {
  dir: string;
  dirName: string;
  sessionCount: number;
  messageCount: number;
  lastModified: number;
}

export default function ProjectList({
  sessions,
  selectedSession,
  selectedProject: externalSelectedProject,
  onSelectSession,
  onSelectProject,
  onDeleteSession,
  loading,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  resumeCommand,
  getBadgeType,
  scrollParentRef,
  showHeader = true,
  favorites = [],
  onToggleFavorite,
}: ProjectListProps) {
  const { t } = useTranslation();
  // Use external selectedProject if provided, otherwise use internal state
  const [internalSelectedProject, setInternalSelectedProject] = useState<
    string | null
  >(null);
  const selectedProject =
    externalSelectedProject !== undefined
      ? externalSelectedProject
      : internalSelectedProject;
  const setSelectedProject = onSelectProject || setInternalSelectedProject;

  const projectMap = useMemo(() => {
    return sessions.reduce(
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
  }, [sessions, t]);

  const projects: Project[] = useMemo(() => {
    const list = Object.entries(projectMap).map(([dir, dirSessions]) => ({
      dir,
      dirName: getDirectoryName(dir),
      sessionCount: dirSessions.length,
      messageCount: dirSessions.reduce((sum, s) => sum + s.message_count, 0),
      lastModified: Math.max(
        ...dirSessions.map((s) => new Date(s.modified).getTime()),
      ),
    }));
    list.sort((a, b) => b.lastModified - a.lastModified);
    return list;
  }, [projectMap]);

  const handleBackToProjects = () => {
    setSelectedProject(null);
  };

  const handleSelectProject = (dir: string) => {
    setSelectedProject(dir);
  };

  const projectSessions = selectedProject
    ? projectMap[selectedProject] || []
    : [];
  const projectInfo = selectedProject
    ? projects.find((p) => p.dir === selectedProject)
    : null;

  const projectsVirtualizer = useVirtualizer({
    count: selectedProject ? 0 : projects.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 68,
    overscan: 8,
  });

  if (!selectedProject) {
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
      <div>
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
            return (
              <div
                key={project.dir}
                data-index={virtualRow.index}
                ref={projectsVirtualizer.measureElement}
                className="px-3 py-2 hover:bg-background cursor-pointer motion-surface motion-color border-b border-border/10 group"
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
                    onClick={() => handleSelectProject(project.dir)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <FolderOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
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
                      <Star
                        className={`h-3 w-3 ${isFavorite ? "fill-current" : ""}`}
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

  return (
    <div className="flex flex-col">
      {showHeader && (
        <SelectedProjectHeader
          projectName={projectInfo?.dirName || ""}
          sessionCount={projectSessions.length}
          onBack={handleBackToProjects}
          backLabel={t("project.list.back")}
          nameClassName="text-xs"
        />
      )}

      <SessionList
        sessions={projectSessions}
        selectedSession={selectedSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        loading={loading}
        getBadgeType={getBadgeType}
        terminal={terminal}
        piPath={piPath}
        customCommand={customCommand}
        resumeCommand={resumeCommand}
        scrollParentRef={scrollParentRef}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        showDirectory={false}
      />
    </div>
  );
}
