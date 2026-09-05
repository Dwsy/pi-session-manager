import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AppPluginSurfaceData } from "@/components/app/AppPluginSurfaceData";
import type { SessionInfo } from "@/types";
import {
  formatDirectory,
  formatShortTime,
  getSessionListDisplayName,
} from "@/utils/sessionDisplay";
import TagBadge from "@/components/tags/TagBadge";
import { getSessionStatusId } from "../board/kanbanBoardModel";
import KanbanSessionContextMenu from "../board/KanbanSessionContextMenu";
import KanbanLabelBadge from "../labels/KanbanLabelBadge";
import {
  labelsForSession,
  type KanbanLabelsStore,
  useKanbanLabelsSnapshot,
} from "../labels/kanbanLabelsStore";

export type KanbanSessionTreeMode = "day" | "status" | "label";

type SidebarData = Pick<
  AppPluginSurfaceData,
  | "sessions"
  | "tags"
  | "sessionTags"
  | "selectedSession"
  | "onSelectSession"
  | "onMoveSession"
  | "onClearSessionStatus"
  | "onDeleteSession"
  | "onResumeSession"
  | "onCopyResumeSession"
  | "onOpenPreviewRenameDialog"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
>;

interface KanbanSessionTreeProps {
  data: SidebarData;
  labelsStore: KanbanLabelsStore;
  sessionIds: string[];
  mode: KanbanSessionTreeMode;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
}

interface SessionGroup {
  id: string;
  label: string;
  sessions: SessionInfo[];
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayKey(session: SessionInfo): string {
  const date = new Date(session.modified);
  return Number.isNaN(date.getTime()) ? "unknown" : localDayKey(date);
}

function formatHourMinute(date: string): string {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "--:--";
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function groupExpansionKey(mode: KanbanSessionTreeMode, groupId: string): string {
  return `${mode}:${groupId}`;
}

export function isKanbanSessionTreeMode(value: string): value is KanbanSessionTreeMode {
  return value === "day" || value === "status" || value === "label";
}

export default function KanbanSessionTree({
  data,
  labelsStore,
  sessionIds,
  mode,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}: KanbanSessionTreeProps) {
  const { t } = useTranslation();
  const labelsSnapshot = useKanbanLabelsSnapshot(labelsStore);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set([groupExpansionKey("day", localDayKey(new Date()))]),
  );
  const [contextMenu, setContextMenu] = useState<{
    session: SessionInfo;
    position: { x: number; y: number };
  } | null>(null);

  const sessions = useMemo(() => {
    const sessionsById = new Map(data.sessions.map((session) => [session.id, session] as const));
    return sessionIds
      .map((sessionId) => sessionsById.get(sessionId))
      .filter((session): session is SessionInfo => Boolean(session));
  }, [data.sessions, sessionIds]);

  const groups = useMemo<SessionGroup[]>(() => {
    if (mode === "status") {
      const statusMap = new Map(data.tags.map((status) => [status.id, status.name]));
      const grouped = new Map<string, SessionInfo[]>();
      for (const session of sessions) {
        const statusId = getSessionStatusId(data.tags, data.sessionTags, session.id);
        const key = statusId ?? "__none__";
        const group = grouped.get(key);
        if (group) group.push(session);
        else grouped.set(key, [session]);
      }
      return Array.from(grouped.entries()).map(([id, groupedSessions]) => ({
        id,
        label:
          id === "__none__"
            ? t("plugins.kanbanBoard.noStatus", "No status")
            : (statusMap.get(id) ?? id),
        sessions: groupedSessions,
      }));
    }

    if (mode === "label") {
      const groupedByLabel = labelsSnapshot.labels
        .map((label) => ({
          id: label.id,
          label: label.name,
          sessions: sessions.filter((session) =>
            labelsForSession(
              labelsSnapshot.labels,
              labelsSnapshot.assignments,
              session.id,
            ).some((item) => item.id === label.id),
          ),
        }))
        .filter((group) => group.sessions.length > 0);
      const unlabeled = sessions.filter(
        (session) =>
          labelsForSession(
            labelsSnapshot.labels,
            labelsSnapshot.assignments,
            session.id,
          ).length === 0,
      );
      if (unlabeled.length > 0) {
        groupedByLabel.push({
          id: "__none__",
          label: t("plugins.kanbanBoard.noLabels", "No labels"),
          sessions: unlabeled,
        });
      }
      return groupedByLabel;
    }

    const grouped = new Map<string, SessionInfo[]>();
    for (const session of sessions) {
      const key = dayKey(session);
      const group = grouped.get(key);
      if (group) group.push(session);
      else grouped.set(key, [session]);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([id, groupedSessions]) => ({ id, label: id, sessions: groupedSessions }));
  }, [
    data.sessionTags,
    data.tags,
    labelsSnapshot.assignments,
    labelsSnapshot.labels,
    mode,
    sessions,
    t,
  ]);

  const hasExpandedGroup = groups.some((group) =>
    expandedGroups.has(groupExpansionKey(mode, group.id)),
  );

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !hasMore ||
      loadingMore ||
      !onLoadMore ||
      !hasExpandedGroup ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void onLoadMore();
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasExpandedGroup, hasMore, loadingMore, onLoadMore]);

  if (loading && sessions.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center px-6 text-center text-[11px] text-muted-foreground/60" role="status">
        {t("common.loading", "Loading…")}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center px-6 text-center text-[11px] text-muted-foreground/60">
        {t("session.list.empty")}
      </div>
    );
  }

  const contextMenuCurrentStatusId = contextMenu
    ? getSessionStatusId(data.tags, data.sessionTags, contextMenu.session.id)
    : null;
  const contextMenuLabels = contextMenu
    ? labelsForSession(
        labelsSnapshot.labels,
        labelsSnapshot.assignments,
        contextMenu.session.id,
      )
    : [];

  return (
    <div className="py-1">
      {groups.map((group) => {
        const expansionKey = groupExpansionKey(mode, group.id);
        const expanded = expandedGroups.has(expansionKey);
        return (
          <div key={group.id} className="mb-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setExpandedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(expansionKey)) next.delete(expansionKey);
                  else next.add(expansionKey);
                  return next;
                })
              }
              className="flex w-full items-center gap-1.5 bg-card/70 px-3 py-1 text-left text-[10px] font-medium text-muted-foreground hover:bg-secondary/30 focus-ring"
            >
              <ChevronRight
                className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                aria-hidden="true"
              />
              <span className="truncate">{group.label}</span>
              <span className="ml-auto tabular-nums opacity-70">{group.sessions.length}</span>
            </button>
            {expanded
              ? group.sessions.map((session) => {
                  const sessionLabels = labelsForSession(
                    labelsSnapshot.labels,
                    labelsSnapshot.assignments,
                    session.id,
                  );
                  const statusId = getSessionStatusId(data.tags, data.sessionTags, session.id);
                  const status = data.tags.find((item) => item.id === statusId);
                  const selected = data.selectedSession?.id === session.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => data.onSelectSession(session)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({
                          session,
                          position: { x: event.clientX, y: event.clientY },
                        });
                      }}
                      aria-current={selected ? "true" : undefined}
                      className={`group mx-1 flex w-[calc(100%-0.5rem)] min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left focus-ring ${
                        selected ? "bg-secondary/60" : "hover:bg-secondary/50"
                      }`}
                      title={session.last_message || session.first_message || session.path}
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/90">
                        {getSessionListDisplayName(session, t("session.list.untitled"))}
                      </span>
                      <span className="hidden min-w-0 items-center gap-1.5 text-[9px] text-muted-foreground group-hover:flex group-focus:flex">
                        {status ? <TagBadge tag={status} compact /> : null}
                        {sessionLabels.slice(0, 2).map((label) => (
                          <KanbanLabelBadge key={label.id} label={label} compact />
                        ))}
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {session.message_count}
                        </span>
                        <span className="max-w-20 truncate font-mono" title={session.cwd}>
                          {formatDirectory(session.cwd)}
                        </span>
                        <span className="whitespace-nowrap tabular-nums">
                          {mode === "day"
                            ? formatHourMinute(session.modified)
                            : formatShortTime(session.modified, t)}
                        </span>
                      </span>
                    </button>
                  );
                })
              : null}
          </div>
        );
      })}
      {hasMore && onLoadMore ? (
        <div ref={loadMoreRef} className="flex justify-center px-3 py-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary/40 hover:text-foreground focus-ring disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore
              ? t("common.loading", "Loading…")
              : t("session.list.loadMore", "Load more")}
          </button>
        </div>
      ) : null}

      {contextMenu ? (
        <KanbanSessionContextMenu
          session={contextMenu.session}
          position={contextMenu.position}
          statuses={data.tags}
          currentStatusId={contextMenuCurrentStatusId}
          labels={contextMenuLabels}
          allLabels={labelsSnapshot.labels}
          onClose={() => setContextMenu(null)}
          onSetStatus={(statusId) => {
            if (statusId === contextMenuCurrentStatusId) return;
            if (statusId === null) {
              if (contextMenuCurrentStatusId) {
                data.onClearSessionStatus(contextMenu.session.id, contextMenuCurrentStatusId);
              }
              return;
            }
            data.onMoveSession(
              contextMenu.session.id,
              contextMenuCurrentStatusId,
              statusId,
              0,
            );
          }}
          onToggleLabel={(labelId, assigned) => {
            void labelsStore.toggleLabel(contextMenu.session.id, labelId, assigned);
          }}
          onDeleteSession={data.onDeleteSession}
          onResumeSession={data.onResumeSession}
          onCopyResumeSession={data.onCopyResumeSession}
          onOpenPreviewRenameDialog={data.onOpenPreviewRenameDialog}
          terminal={data.terminal}
          piPath={data.piPath}
          customCommand={data.customCommand}
          resumeCommand={data.resumeCommand}
        />
      ) : null}
    </div>
  );
}
