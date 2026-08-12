import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, FolderOpen } from "lucide-react";

import { ProjectListSkeleton } from "@/components/ui/Skeleton";
import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginSessionUi,
} from "@/plugins/runtime-host";
import { formatShortTime } from "@/utils/sessionDisplay";
import type { ExplorerProject, ExplorerProjectSortKey, ExplorerSortDirection } from "./explorerModel";

const ESTIMATED_ROW_HEIGHT = 44;

export interface ExplorerProjectTableProps {
  projects: ExplorerProject[];
  loading: boolean;
  selectedProject: string | null;
  onSelectProject: (projectPath: string) => void;
  sortKey: ExplorerProjectSortKey;
  sortDirection: ExplorerSortDirection;
  onSortChange: (key: ExplorerProjectSortKey) => void;
}

export default function ExplorerProjectTable({
  projects,
  loading,
  selectedProject,
  onSelectProject,
  sortKey,
  sortDirection,
  onSortChange,
}: ExplorerProjectTableProps) {
  const { t } = useTranslation();
  const { projectListActions = [] } = usePsmPluginSessionUi();
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => projects[index]?.path ?? index,
    overscan: 8,
    measureElement: (element) =>
      Math.ceil((element as HTMLElement).getBoundingClientRect().height) || ESTIMATED_ROW_HEIGHT,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const lastRow = virtualRows[virtualRows.length - 1];
  const bottomPadding = lastRow ? Math.max(0, virtualizer.getTotalSize() - lastRow.end) : 0;

  const ariaSort = (key: ExplorerProjectSortKey) => {
    if (sortKey !== key) return "none" as const;
    return sortDirection === "asc" ? ("ascending" as const) : ("descending" as const);
  };

  const sortButton = (key: ExplorerProjectSortKey, label: string, alignRight = false) => (
    <button
      type="button"
      onClick={() => onSortChange(key)}
      className={`inline-flex items-center gap-1 rounded px-0.5 hover:text-foreground motion-color focus-ring ${
        alignRight ? "ml-auto" : ""
      } ${sortKey === key ? "text-foreground" : ""}`}
    >
      {label}
      {sortKey === key ? (
        sortDirection === "asc" ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        )
      ) : null}
    </button>
  );

  if (loading && projects.length === 0) {
    return <ProjectListSkeleton />;
  }

  if (projects.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 px-8 text-muted-foreground/60"
        role="status"
      >
        <FolderOpen className="h-8 w-8 opacity-40" aria-hidden="true" />
        <span className="text-xs">{t("project.list.empty")}</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto" data-testid="explorer-project-table">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[11px]">
        <thead className="sticky top-0 z-10 bg-background/95 text-[10px] uppercase tracking-wide text-muted-foreground/80 backdrop-blur-sm">
          <tr className="border-b border-border/40">
            <th className="w-[34%] px-3 py-2 font-medium" aria-sort={ariaSort("name")}>
              {sortButton("name", t("explorer.columns.project", "Project"))}
            </th>
            <th className="px-3 py-2 font-medium">{t("explorer.columns.path", "Path")}</th>
            <th className="w-[100px] px-3 py-2 text-right font-medium" aria-sort={ariaSort("sessions")}>
              {sortButton("sessions", t("explorer.columns.sessions", "Sessions"), true)}
            </th>
            <th className="w-[100px] px-3 py-2 text-right font-medium" aria-sort={ariaSort("messages")}>
              {sortButton("messages", t("explorer.columns.messages", "Messages"), true)}
            </th>
            <th className="w-[104px] px-3 py-2 text-right font-medium" aria-sort={ariaSort("updated")}>
              {sortButton("updated", t("explorer.columns.lastActive", "Last active"), true)}
            </th>
            <th className="w-[80px] px-2 py-2 font-medium">
              <span className="sr-only">{t("explorer.columns.actions", "Actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {topPadding > 0 && (
            <tr aria-hidden="true">
              <td colSpan={6} style={{ height: topPadding, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const project = projects[virtualRow.index];
            if (!project) return null;
            const projectLabel = project.name || t("session.list.unknownDirectory");
            const isSelected = selectedProject === project.path;

            return (
              <tr
                key={project.path || "__unknown__"}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-testid="explorer-project-row"
                tabIndex={0}
                className={`group border-b border-border/20 last:border-b-0 motion-color hover:bg-surface/60 ${
                  isSelected ? "bg-primary/8" : ""
                }`}
                onClick={() => onSelectProject(project.path)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectProject(project.path);
                }}
              >
                <td className="px-3 py-2 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5 flex-none text-blue-400" aria-hidden="true" />
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {projectLabel}
                    </span>
                    {project.liveCount > 0 && (
                      <span className="inline-flex flex-none items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[9px] text-success">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                        {project.liveCount}
                      </span>
                    )}
                  </div>
                </td>
                <td
                  className="px-3 py-2 align-middle font-mono text-[10px] text-muted-foreground/70"
                  title={project.path}
                >
                  <div className="truncate">{project.path || "—"}</div>
                </td>
                <td className="px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                  {project.sessionCount}
                </td>
                <td className="px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                  {project.messageCount}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                  {formatShortTime(new Date(project.lastModified).toISOString(), t)}
                </td>
                <td className="px-2 py-2 align-middle">
                  <div
                    className="flex items-center justify-end gap-0.5 opacity-0 motion-color group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {projectListActions.map((action) => (
                      <PluginContributionBoundary
                        key={action.id}
                        pluginId={action.pluginId}
                        contributionId={action.id}
                        title={action.title}
                      >
                        <PluginContributionSlot
                          render={() =>
                            action.render({
                              project: {
                                path: project.path,
                                name: projectLabel,
                                sessionCount: project.sessionCount,
                                messageCount: project.messageCount,
                                lastModified: project.lastModified,
                                liveCount: project.liveCount,
                              },
                              onActivate: () => onSelectProject(project.path),
                            })
                          }
                        />
                      </PluginContributionBoundary>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
          {bottomPadding > 0 && (
            <tr aria-hidden="true">
              <td colSpan={6} style={{ height: bottomPadding, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
