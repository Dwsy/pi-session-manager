import { useRef } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, MessageSquare, Search, Zap } from "lucide-react";

import TagBadge from "@/components/tags/TagBadge";
import { SessionBadge } from "@/components/session-viewer/SessionBadge";
import { SessionListSkeleton } from "@/components/ui/Skeleton";
import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginSessionUi,
} from "@/plugins/runtime-host";
import type { SessionInfo, Tag } from "@/types";
import { getSessionSourceSlug, getSessionSourceTag } from "@/utils/session";
import {
  formatShortTime,
  getDirectoryName,
  getSessionListDisplayName,
} from "@/utils/sessionDisplay";
import type { ExplorerSessionSortKey, ExplorerSortDirection } from "./explorerModel";

const ESTIMATED_ROW_HEIGHT = 46;
const DEFAULT_PLUGIN_COLUMN_WIDTH = 150;
const SESSION_COLUMN_MIN_WIDTH = 300;
const TAGS_COLUMN_WIDTH = 170;
const PROJECT_COLUMN_WIDTH = 170;
const SOURCE_COLUMN_WIDTH = 150;
const MESSAGES_COLUMN_WIDTH = 86;
const UPDATED_COLUMN_WIDTH = 104;
const ACTIONS_COLUMN_WIDTH = 104;

export interface ExplorerSessionTableProps {
  sessions: SessionInfo[];
  loading: boolean;
  selectedSession: SessionInfo | null;
  onSelectSession: (session: SessionInfo) => void;
  onSelectProject?: (projectPath: string) => void;
  onContextMenu?: (session: SessionInfo, point: { x: number; y: number }) => void;
  getTagsForSession?: (sessionId: string) => Tag[];
  liveSessionIds?: Set<string>;
  showProjectColumn?: boolean;
  sortKey: ExplorerSessionSortKey;
  sortDirection: ExplorerSortDirection;
  onSortChange: (key: ExplorerSessionSortKey) => void;
  renderRowActions?: (session: SessionInfo) => ReactNode;
}

export default function ExplorerSessionTable({
  sessions,
  loading,
  selectedSession,
  onSelectSession,
  onSelectProject,
  onContextMenu,
  getTagsForSession,
  liveSessionIds,
  showProjectColumn = true,
  sortKey,
  sortDirection,
  onSortChange,
  renderRowActions,
}: ExplorerSessionTableProps) {
  const { t } = useTranslation();
  const { sessionListColumns = [], sessionListActions = [] } = usePsmPluginSessionUi();
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => sessions[index]?.id ?? index,
    overscan: 8,
    measureElement: (element) =>
      Math.ceil((element as HTMLElement).getBoundingClientRect().height) || ESTIMATED_ROW_HEIGHT,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const lastRow = virtualRows[virtualRows.length - 1];
  const bottomPadding = lastRow ? Math.max(0, virtualizer.getTotalSize() - lastRow.end) : 0;
  const columnCount = 6 + sessionListColumns.length + (showProjectColumn ? 1 : 0);
  // Fixed layout keeps every column readable; the session column absorbs the rest.
  const tableMinWidth =
    SESSION_COLUMN_MIN_WIDTH +
    TAGS_COLUMN_WIDTH +
    SOURCE_COLUMN_WIDTH +
    MESSAGES_COLUMN_WIDTH +
    UPDATED_COLUMN_WIDTH +
    ACTIONS_COLUMN_WIDTH +
    (showProjectColumn ? PROJECT_COLUMN_WIDTH : 0) +
    sessionListColumns.reduce(
      (total, column) => total + (column.width ?? DEFAULT_PLUGIN_COLUMN_WIDTH),
      0,
    );

  const ariaSort = (key: ExplorerSessionSortKey) => {
    if (sortKey !== key) return "none" as const;
    return sortDirection === "asc" ? ("ascending" as const) : ("descending" as const);
  };

  const sortIcon = (key: ExplorerSessionSortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden="true" />
    );
  };

  const sortButton = (key: ExplorerSessionSortKey, label: string, alignRight = false) => (
    <button
      type="button"
      onClick={() => onSortChange(key)}
      className={`inline-flex items-center gap-1 rounded px-0.5 hover:text-foreground motion-color focus-ring ${
        alignRight ? "ml-auto" : ""
      } ${sortKey === key ? "text-foreground" : ""}`}
    >
      {label}
      {sortIcon(key)}
    </button>
  );

  if (loading && sessions.length === 0) {
    return <SessionListSkeleton />;
  }

  if (sessions.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 px-8 text-muted-foreground/60"
        role="status"
      >
        <Search className="h-8 w-8 opacity-40" aria-hidden="true" />
        <span className="text-xs">{t("session.list.empty")}</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto" data-testid="explorer-session-table">
      <table
        className="w-full table-fixed border-collapse text-left text-[11px]"
        style={{ minWidth: tableMinWidth }}
      >
        <thead className="sticky top-0 z-10 bg-background/95 text-[10px] uppercase tracking-wide text-muted-foreground/80 backdrop-blur-sm">
          <tr className="border-b border-border/40">
            <th className="px-3 py-2 font-medium" aria-sort={ariaSort("title")}>
              {sortButton("title", t("explorer.columns.session", "Session"))}
            </th>
            {sessionListColumns.map((column) => (
              <th
                key={column.id}
                className="px-3 py-2 font-medium"
                style={{ width: column.width ?? DEFAULT_PLUGIN_COLUMN_WIDTH }}
              >
                <span className="truncate">{column.title}</span>
              </th>
            ))}
            <th className="px-3 py-2 font-medium" style={{ width: TAGS_COLUMN_WIDTH }}>
              {t("explorer.columns.tags", "Tags")}
            </th>
            {showProjectColumn && (
              <th
                className="px-3 py-2 font-medium"
                style={{ width: PROJECT_COLUMN_WIDTH }}
                aria-sort={ariaSort("project")}
              >
                {sortButton("project", t("explorer.columns.project", "Project"))}
              </th>
            )}
            <th className="px-3 py-2 font-medium" style={{ width: SOURCE_COLUMN_WIDTH }}>
              {t("explorer.columns.sourceModel", "Source / model")}
            </th>
            <th
              className="px-3 py-2 text-right font-medium"
              style={{ width: MESSAGES_COLUMN_WIDTH }}
              aria-sort={ariaSort("messages")}
            >
              {sortButton("messages", t("explorer.columns.messages", "Messages"), true)}
            </th>
            <th
              className="px-3 py-2 text-right font-medium"
              style={{ width: UPDATED_COLUMN_WIDTH }}
              aria-sort={ariaSort("updated")}
            >
              {sortButton("updated", t("explorer.columns.updated", "Updated"), true)}
            </th>
            <th className="px-2 py-2 font-medium" style={{ width: ACTIONS_COLUMN_WIDTH }}>
              <span className="sr-only">{t("explorer.columns.actions", "Actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {topPadding > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columnCount} style={{ height: topPadding, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const session = sessions[virtualRow.index];
            if (!session) return null;
            const sessionTags = getTagsForSession?.(session.id) ?? [];
            const sourceTag = getSessionSourceTag(session.path);
            const sourceSlug = getSessionSourceSlug(session.path);
            const live = Boolean(session.isLive) || (liveSessionIds?.has(session.id) ?? false);
            const isSelected = selectedSession?.id === session.id;
            const pluginReference = {
              path: session.path,
              id: session.id,
              name: session.name,
              cwd: session.cwd,
            };

            return (
              <tr
                key={session.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-session-id={session.id}
                data-testid="explorer-session-row"
                tabIndex={0}
                className={`group border-b border-border/20 last:border-b-0 motion-color hover:bg-surface/60 ${
                  isSelected ? "bg-primary/8" : ""
                }`}
                onClick={() => onSelectSession(session)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectSession(session);
                }}
                onContextMenu={(event) => {
                  if (!onContextMenu) return;
                  event.preventDefault();
                  onContextMenu(session, { x: event.clientX, y: event.clientY });
                }}
              >
                <td className="px-3 py-2 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    {live ? (
                      <span
                        className="flex h-4 w-4 flex-none items-center justify-center rounded bg-green-500/15"
                        title={t("session.online", "Online")}
                      >
                        <Zap className="h-2.5 w-2.5 fill-current text-green-500" aria-hidden="true" />
                      </span>
                    ) : (
                      <span
                        className="h-1.5 w-1.5 flex-none rounded-full bg-muted-foreground/25"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-foreground">
                        {getSessionListDisplayName(session, t("session.list.untitled"))}
                      </div>
                      {session.last_message && (
                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground/65">
                          {session.last_message}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {sessionListColumns.map((column) => (
                  <td
                    key={column.id}
                    className={`px-3 py-2 align-middle ${
                      column.align === "right"
                        ? "text-right"
                        : column.align === "center"
                          ? "text-center"
                          : ""
                    }`}
                  >
                    <PluginContributionBoundary
                      pluginId={column.pluginId}
                      contributionId={column.id}
                      title={column.title}
                    >
                      <PluginContributionSlot
                        render={() =>
                          column.render({
                            session: pluginReference,
                            onOpenSession: () => onSelectSession(session),
                          })
                        }
                      />
                    </PluginContributionBoundary>
                  </td>
                ))}
                <td className="px-3 py-2 align-middle">
                  {sessionTags.length > 0 ? (
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                      {sessionTags.slice(0, 2).map((tag) => (
                        <TagBadge key={tag.id} tag={tag} compact={false} />
                      ))}
                      {sessionTags.length > 2 && (
                        <span className="text-[9px] text-muted-foreground">
                          +{sessionTags.length - 2}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground/45">—</span>
                  )}
                </td>
                {showProjectColumn && (
                  <td className="px-3 py-2 align-middle">
                    <button
                      type="button"
                      className="max-w-full truncate rounded px-1 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground motion-color focus-ring"
                      title={session.cwd || t("session.list.unknownDirectory")}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (session.cwd) onSelectProject?.(session.cwd);
                      }}
                    >
                      {session.cwd
                        ? getDirectoryName(session.cwd)
                        : t("session.list.unknownDirectory")}
                    </button>
                  </td>
                )}
                <td className="px-3 py-2 align-middle">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {sourceTag ? (
                      <SessionBadge
                        label={sourceTag}
                        tone="source"
                        sourceSlug={sourceSlug || undefined}
                        className="w-fit text-[9px]"
                      />
                    ) : (
                      <span className="text-muted-foreground/45">—</span>
                    )}
                    {session.model && (
                      <span className="truncate text-[9px] text-muted-foreground/55">
                        {session.model}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
                    {session.message_count}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                  {formatShortTime(session.modified, t)}
                </td>
                <td className="px-2 py-2 align-middle">
                  <div
                    className="flex items-center justify-end gap-0.5 opacity-0 motion-color group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {sessionListActions.map((action) => (
                      <PluginContributionBoundary
                        key={action.id}
                        pluginId={action.pluginId}
                        contributionId={action.id}
                        title={action.title}
                      >
                        <PluginContributionSlot
                          render={() =>
                            action.render({
                              session: pluginReference,
                              onActivate: () => onSelectSession(session),
                            })
                          }
                        />
                      </PluginContributionBoundary>
                    ))}
                    {renderRowActions?.(session)}
                  </div>
                </td>
              </tr>
            );
          })}
          {bottomPadding > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columnCount} style={{ height: bottomPadding, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
