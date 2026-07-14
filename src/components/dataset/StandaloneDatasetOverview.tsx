import { useMemo } from "react";
import {
  CalendarClock,
  Database,
  FolderOpen,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import type { SessionInfo } from "@/types";

interface StandaloneDatasetOverviewProps {
  currentDatasetId: string;
  sessions: SessionInfo[];
  selectedProject?: string | null;
  loading?: boolean;
  onManageDatasets: () => void;
  onSessionSelect?: (session: SessionInfo) => void;
  onProjectSelect?: (projectPath: string) => void;
}

function getDatasetDisplayName(datasetId: string): string {
  return datasetId.split("/").pop() || datasetId;
}

export default function StandaloneDatasetOverview({
  currentDatasetId,
  sessions,
  selectedProject,
  loading = false,
  onManageDatasets,
  onSessionSelect,
  onProjectSelect,
}: StandaloneDatasetOverviewProps) {
  const { t } = useTranslation();
  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((left, right) => right.modified.localeCompare(left.modified))
        .slice(0, 6),
    [sessions],
  );

  const topProjects = useMemo(() => {
    const projects = new Map<
      string,
      { path: string; name: string; sessions: number; messages: number }
    >();

    for (const session of sessions) {
      const path = session.cwd || "/";
      const name = path.split("/").filter(Boolean).pop() || path;
      const current = projects.get(path) || {
        path,
        name,
        sessions: 0,
        messages: 0,
      };
      current.sessions += 1;
      current.messages += session.message_count;
      projects.set(path, current);
    }

    return [...projects.values()]
      .sort(
        (left, right) =>
          right.sessions - left.sessions || right.messages - left.messages,
      )
      .slice(0, 6);
  }, [sessions]);

  const totalMessages = useMemo(
    () => sessions.reduce((sum, session) => sum + session.message_count, 0),
    [sessions],
  );
  const projectCount = topProjects.length;
  const datasetName = getDatasetDisplayName(currentDatasetId);
  const averageMessages =
    sessions.length > 0 ? (totalMessages / sessions.length).toFixed(1) : "0.0";
  const latestTimestamp = recentSessions[0]?.modified;
  const showDelayedLoading = useDelayedLoading(Boolean(loading));

  if (showDelayedLoading) {
    return (
      <div className="h-full overflow-y-auto p-3 md:p-4">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-secondary/30 p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  {t("settings.session.standaloneDataset.badge", "Dataset")}
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {datasetName}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {selectedProject
                    ? t(
                        "settings.session.standaloneDataset.filteredProject",
                        "Filtered by project: {{project}}",
                        { project: selectedProject },
                      )
                    : currentDatasetId}
                </p>
              </div>
              <button
                onClick={onManageDatasets}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-info/40 bg-info/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-info/15"
              >
                <Sparkles className="h-4 w-4" />
                {t(
                  "settings.session.standaloneDataset.manageAction",
                  "Manage datasets",
                )}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border/60 bg-background/70 p-4"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-8 w-16" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-12">
            <section className="min-w-0 rounded-3xl border border-border/70 bg-background/80 p-5 xl:col-span-8">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
                  >
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </section>

            <section className="min-w-0 space-y-3 xl:col-span-4">
              <div className="min-w-0 rounded-3xl border border-border/70 bg-background/80 p-5">
                <Skeleton className="h-5 w-28" />
                <div className="mt-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
                    >
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="mt-2 h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="h-full min-h-0" aria-hidden="true" />;
  }

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-secondary/30 p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                {t("settings.session.standaloneDataset.badge", "Dataset")}
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {datasetName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {selectedProject
                  ? t(
                      "settings.session.standaloneDataset.filteredProject",
                      "Filtered by project: {{project}}",
                      { project: selectedProject },
                    )
                  : currentDatasetId}
              </p>
            </div>
            <button
              onClick={onManageDatasets}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-info/40 bg-info/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-info/15"
            >
              <Sparkles className="h-4 w-4" />
              {t(
                "settings.session.standaloneDataset.manageAction",
                "Manage datasets",
              )}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                {t("settings.session.standaloneDataset.totalSessions", "Sessions")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {sessions.length}
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                {t("settings.session.standaloneDataset.totalMessages", "Messages")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {totalMessages}
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" />
                {t("settings.session.standaloneDataset.totalProjects", "Projects")}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {projectCount}
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                {t(
                  "settings.session.standaloneDataset.averageMessages",
                  "Avg messages",
                )}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {averageMessages}
              </div>
              {latestTimestamp && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "settings.session.standaloneDataset.lastUpdated",
                    "Updated {{time}}",
                    { time: new Date(latestTimestamp).toLocaleString() },
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-12">
          <section className="min-w-0 rounded-3xl border border-border/70 bg-background/80 p-5 xl:col-span-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t(
                    "settings.session.standaloneDataset.recentSessionsTitle",
                    "Recent sessions",
                  )}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "settings.session.standaloneDataset.recentSessionsHelp",
                    "Newest sessions in the current dataset. Click to open.",
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {recentSessions.length > 0 ? (
                recentSessions.map((session) => (
                  <button
                    key={session.path}
                    onClick={() => onSessionSelect?.(session)}
                    className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-left transition-colors hover:border-border hover:bg-secondary/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {session.name || session.first_message || session.id}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {session.cwd ||
                          t("settings.session.standaloneDataset.unknownProject", "Unknown project")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">
                        {new Date(session.modified).toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "settings.session.standaloneDataset.sessionMessages",
                          "{{count}} msgs",
                          { count: session.message_count },
                        )}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  {t(
                    "settings.session.standaloneDataset.emptySessions",
                    "No sessions available in the current dataset.",
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="min-w-0 space-y-3 xl:col-span-4">
            <div className="min-w-0 rounded-3xl border border-border/70 bg-background/80 p-5">
              <h2 className="text-base font-semibold text-foreground">
                {t(
                  "settings.session.standaloneDataset.topProjectsTitle",
                  "Top projects",
                )}
              </h2>
              <div className="mt-4 space-y-2">
                {topProjects.length > 0 ? (
                  topProjects.map((project) => (
                    <button
                      key={project.path}
                      onClick={() => onProjectSelect?.(project.path)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-left transition-colors hover:border-border hover:bg-secondary/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {project.name}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {project.path}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div>
                          {t(
                            "settings.session.standaloneDataset.projectSessions",
                            "{{count}} sessions",
                            { count: project.sessions },
                          )}
                        </div>
                        <div className="mt-1">
                          {t(
                            "settings.session.standaloneDataset.projectMessages",
                            "{{count}} msgs",
                            { count: project.messages },
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {t(
                      "settings.session.standaloneDataset.emptyProjects",
                      "No project stats yet.",
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 rounded-3xl border border-border/70 bg-background/80 p-5">
              <h2 className="text-base font-semibold text-foreground">
                {t(
                  "settings.session.standaloneDataset.tipsTitle",
                  "Browsing tips",
                )}
              </h2>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  {t(
                    "settings.session.standaloneDataset.tipCapabilities",
                    "Standalone dataset mode keeps browsing, search, tags, and favorites, while removing terminal resume, delete, rename, and backend-dependent analytics.",
                  )}
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  {t(
                    "settings.session.standaloneDataset.tipSwitching",
                    "After switching datasets, search, tags, favorites, and session lists all move to the current dataset scope.",
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
