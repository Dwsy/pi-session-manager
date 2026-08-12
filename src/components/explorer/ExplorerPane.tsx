import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, FolderOpen, List, Tags, X } from "lucide-react";

import type { AppDesktopSidebarSessionListCommonProps } from "@/components/app/AppDesktopSidebarContent";
import OpenInBrowserButton from "@/components/OpenInBrowserButton";
import OpenInTerminalButton from "@/components/OpenInTerminalButton";
import SessionRowContextMenu from "@/components/session-list/SessionRowContextMenu";
import TagPicker from "@/components/tags/TagPicker";
import DeleteConfirmButton from "@/components/ui/DeleteConfirmButton";
import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginSessionUi,
} from "@/plugins/runtime-host";
import type { SessionInfo, Tag } from "@/types";
import { pathsEqual } from "@/utils/path";
import { getDirectoryName } from "@/utils/sessionDisplay";
import ExplorerProjectTable from "./ExplorerProjectTable";
import ExplorerSessionTable from "./ExplorerSessionTable";
import {
  buildExplorerProjects,
  nextExplorerSort,
  sortExplorerProjects,
  sortExplorerSessions,
  type ExplorerProjectSortKey,
  type ExplorerSessionSortKey,
  type ExplorerSortDirection,
  type ExplorerTab,
} from "./explorerModel";

export interface ExplorerPaneProps {
  sessionListCommonProps: AppDesktopSidebarSessionListCommonProps;
  /** Sessions after the app-level search/tag/source/model/date filters. */
  sessions: SessionInfo[];
  totalSessionCount: number;
  loading: boolean;
  selectedProject: string | null;
  onSelectProject: (projectPath: string | null) => void;
  filterBar?: ReactNode;
  onClose: () => void;
}

const naturalSessionDirection = (key: ExplorerSessionSortKey): ExplorerSortDirection =>
  key === "updated" || key === "created" || key === "messages" ? "desc" : "asc";

const naturalProjectDirection = (key: ExplorerProjectSortKey): ExplorerSortDirection =>
  key === "name" ? "asc" : "desc";

export default function ExplorerPane({
  sessionListCommonProps,
  sessions,
  totalSessionCount,
  loading,
  selectedProject,
  onSelectProject,
  filterBar,
  onClose,
}: ExplorerPaneProps) {
  const { t } = useTranslation();
  const { sessionContextMenuActions = [] } = usePsmPluginSessionUi();
  const {
    selectedSession = null,
    onSelectSession,
    onDeleteSession,
    onConvertSession,
    onResumeSession,
    onCopyResumeSession,
    onForkSession,
    onOpenPreviewRenameDialog,
    tags = [],
    getTagsForSession,
    onToggleTag,
    onCreateTag,
    terminal,
    piPath,
    customCommand,
    resumeCommand,
    liveSessionIds,
  } = sessionListCommonProps;

  const [tab, setTab] = useState<ExplorerTab>("sessions");
  const [sessionSort, setSessionSort] = useState<{
    key: ExplorerSessionSortKey;
    direction: ExplorerSortDirection;
  }>({ key: "updated", direction: "desc" });
  const [projectSort, setProjectSort] = useState<{
    key: ExplorerProjectSortKey;
    direction: ExplorerSortDirection;
  }>({ key: "updated", direction: "desc" });
  const [tagPicker, setTagPicker] = useState<{ sessionId: string; anchor: DOMRect } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    session: SessionInfo;
    point: { x: number; y: number };
  } | null>(null);

  const scopedSessions = useMemo(
    () =>
      selectedProject
        ? sessions.filter((session) => pathsEqual(session.cwd, selectedProject))
        : sessions,
    [selectedProject, sessions],
  );

  const visibleSessions = useMemo(
    () =>
      sortExplorerSessions(scopedSessions, sessionSort.key, sessionSort.direction, {
        untitled: t("session.list.untitled"),
        unknownProject: t("session.list.unknownDirectory"),
      }),
    [scopedSessions, sessionSort.direction, sessionSort.key, t],
  );

  const projects = useMemo(
    () =>
      sortExplorerProjects(
        buildExplorerProjects(sessions, liveSessionIds),
        projectSort.key,
        projectSort.direction,
      ),
    [liveSessionIds, projectSort.direction, projectSort.key, sessions],
  );

  const tagPickerTags: Tag[] = useMemo(() => {
    if (!tagPicker || !getTagsForSession) return [];
    return getTagsForSession(tagPicker.sessionId);
  }, [getTagsForSession, tagPicker, tags]);

  const handleSessionSort = useCallback((key: ExplorerSessionSortKey) => {
    setSessionSort((current) => nextExplorerSort(current, key, naturalSessionDirection));
  }, []);

  const handleProjectSort = useCallback((key: ExplorerProjectSortKey) => {
    setProjectSort((current) => nextExplorerSort(current, key, naturalProjectDirection));
  }, []);

  const handleOpenProject = useCallback(
    (projectPath: string) => {
      onSelectProject(projectPath || null);
      setTab("sessions");
    },
    [onSelectProject],
  );

  const renderRowActions = useCallback(
    (session: SessionInfo) => (
      <>
        {onToggleTag && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
              setTagPicker((current) =>
                current?.sessionId === session.id ? null : { sessionId: session.id, anchor },
              );
            }}
            className="rounded p-1 text-muted-foreground/60 hover:text-blue-400 motion-color focus-ring"
            title={t("tags.assign")}
          >
            <Tags className="h-3 w-3" />
          </button>
        )}
        <OpenInTerminalButton
          session={session}
          terminal={terminal}
          piPath={piPath}
          customCommand={customCommand}
          resumeCommand={resumeCommand}
          onResumeSession={onResumeSession}
          size="sm"
          variant="ghost"
          onError={(error) => console.error("Failed to open in terminal:", error)}
        />
        <OpenInBrowserButton
          session={session}
          size="sm"
          variant="ghost"
          onError={(error) => console.error("Failed to open in browser:", error)}
        />
        {onConvertSession && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onConvertSession(session);
            }}
            className="rounded p-1 text-muted-foreground/60 hover:text-primary motion-color focus-ring"
            title={t("session.convert.title")}
          >
            <ArrowRightLeft className="h-3 w-3" />
          </button>
        )}
        {onDeleteSession && (
          <DeleteConfirmButton
            onDelete={() => onDeleteSession(session, { skipPopover: true })}
            size="sm"
          />
        )}
      </>
    ),
    [
      customCommand,
      onConvertSession,
      onDeleteSession,
      onResumeSession,
      onToggleTag,
      piPath,
      resumeCommand,
      t,
      terminal,
    ],
  );

  const tabButton = (value: ExplorerTab, label: string, count: number, icon: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] motion-color focus-ring ${
        tab === value
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="tabular-nums text-[10px] text-muted-foreground/70">{count}</span>
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="explorer-pane">
      <header className="flex flex-col gap-2 border-b border-border/50 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-lg bg-surface/60 p-0.5"
            role="tablist"
            aria-label={t("explorer.title", "Browse")}
          >
            {tabButton(
              "sessions",
              t("explorer.tabs.sessions", "Sessions"),
              visibleSessions.length,
              <List className="h-3.5 w-3.5" aria-hidden="true" />,
            )}
            {tabButton(
              "projects",
              t("explorer.tabs.projects", "Projects"),
              projects.length,
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />,
            )}
          </div>

          {selectedProject && (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              <FolderOpen className="h-3 w-3 flex-none text-blue-400" aria-hidden="true" />
              <span className="truncate" title={selectedProject}>
                {getDirectoryName(selectedProject)}
              </span>
              <button
                type="button"
                onClick={() => onSelectProject(null)}
                className="rounded-full p-0.5 hover:text-foreground motion-color focus-ring"
                aria-label={t("explorer.clearProject", "Show all projects")}
                title={t("explorer.clearProject", "Show all projects")}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}

          <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground/70">
            {t("explorer.sessionCount", {
              count: visibleSessions.length,
              total: totalSessionCount,
              defaultValue: "{{count}} of {{total}} sessions",
            })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground motion-color focus-ring"
            aria-label={t("explorer.close", "Close browser")}
            title={t("explorer.close", "Close browser")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {filterBar}
      </header>

      <div className="min-h-0 flex-1">
        {tab === "sessions" ? (
          <ExplorerSessionTable
            sessions={visibleSessions}
            loading={loading}
            selectedSession={selectedSession}
            onSelectSession={onSelectSession}
            onSelectProject={handleOpenProject}
            onContextMenu={
              onToggleTag ? (session, point) => setContextMenu({ session, point }) : undefined
            }
            getTagsForSession={getTagsForSession}
            liveSessionIds={liveSessionIds}
            showProjectColumn={!selectedProject}
            sortKey={sessionSort.key}
            sortDirection={sessionSort.direction}
            onSortChange={handleSessionSort}
            renderRowActions={renderRowActions}
          />
        ) : (
          <ExplorerProjectTable
            projects={projects}
            loading={loading}
            selectedProject={selectedProject}
            onSelectProject={handleOpenProject}
            sortKey={projectSort.key}
            sortDirection={projectSort.direction}
            onSortChange={handleProjectSort}
          />
        )}
      </div>

      {tagPicker && onToggleTag && (
        <TagPicker
          tags={tags}
          selectedTagIds={tagPickerTags.map((tag) => tag.id)}
          onToggle={(tagId) =>
            onToggleTag(
              tagPicker.sessionId,
              tagId,
              tagPickerTags.some((tag) => tag.id === tagId),
            )
          }
          onCreateTag={onCreateTag}
          anchorRect={tagPicker.anchor}
          onClose={() => setTagPicker(null)}
        />
      )}

      {contextMenu && onToggleTag && (
        <SessionRowContextMenu
          session={contextMenu.session}
          point={contextMenu.point}
          tags={tags}
          sessionTagIds={(getTagsForSession?.(contextMenu.session.id) ?? []).map((tag) => tag.id)}
          onToggleTag={onToggleTag}
          onResumeSession={onResumeSession}
          onCopyResumeSession={onCopyResumeSession}
          onConvertSession={onConvertSession}
          onForkSession={onForkSession}
          onRenameSession={onOpenPreviewRenameDialog}
          onDeleteSession={
            onDeleteSession
              ? (session) => onDeleteSession(session, { skipPopover: true })
              : undefined
          }
          terminal={terminal}
          piPath={piPath}
          customCommand={customCommand}
          resumeCommand={resumeCommand}
          pluginActions={sessionContextMenuActions.map((action) => (
            <PluginContributionBoundary
              key={action.id}
              pluginId={action.pluginId}
              contributionId={action.id}
              title={action.title}
            >
              <PluginContributionSlot
                render={() =>
                  action.render({
                    session: {
                      path: contextMenu.session.path,
                      id: contextMenu.session.id,
                      name: contextMenu.session.name,
                      cwd: contextMenu.session.cwd,
                    },
                    close: () => setContextMenu(null),
                    onActivate: () => {},
                  })
                }
              />
            </PluginContributionBoundary>
          ))}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
