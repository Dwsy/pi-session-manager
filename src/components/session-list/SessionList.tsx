import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { SessionInfo, Tag } from "@/types";
import {
  ArrowRightLeft,
  CheckSquare2,
  Search,
  Square,
  Tags,
  Trash2,
  Zap,
} from "lucide-react";
import { SessionListSkeleton } from "@/components/ui/Skeleton";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import OpenInBrowserButton from "@/components/OpenInBrowserButton";
import OpenInTerminalButton from "@/components/OpenInTerminalButton";
import { SessionBadge } from "@/components/session-viewer/SessionBadge";
import TagBadge from "@/components/tags/TagBadge";
import TagPicker from "@/components/tags/TagPicker";
import SessionContextMenu from "@/components/session-viewer/SessionContextMenu";
import SessionPreviewModal from "@/components/session-preview/SessionPreviewModal";
import { buildSessionPreviewModalActions } from "@/utils/sessionPreviewActions";
import type { DeleteSessionRequestOptions } from "@/components/dialogs/deleteSessionTypes";
import DeleteConfirmButton from "@/components/ui/DeleteConfirmButton";
import {
  formatShortSessionId,
  MIN_SESSION_ID_PREFIX_LENGTH,
  getSessionSourceSlug,
  getSessionSourceTag,
} from "@/utils/session";
import {
  formatDirectory,
  formatShortTime,
  getSessionListDisplayName,
} from "@/utils/sessionDisplay";
import type { TerminalType } from "@/components/settings/types";
import { getPlatformDefaults } from "@/components/settings/types";
import { invoke, isTauri } from "@/transport";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isTextEntryTarget } from "@/hooks/useKeyboardShortcuts";
import { useClipboard } from "@/hooks/useClipboard";
import { useSettings } from "@/hooks/useSettings";
import {
  buildCopyResumeCommand,
  openSessionInTerminalDirect,
} from "@/utils/sessionResume";
import { usePsmPluginSessionUi, PluginContributionBoundary, PluginContributionSlot } from '@/plugins/runtime-host';

const ESTIMATED_ROW_HEIGHT = 122;
const STICKY_SCROLL_TOP_THRESHOLD = 48;



interface SessionListProps {
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  onSelectSession: (session: SessionInfo) => void;
  onDeleteSession?: (
    session: SessionInfo,
    options?: DeleteSessionRequestOptions,
  ) => void;
  onDeleteSessions?: (
    sessions: SessionInfo[],
    options?: DeleteSessionRequestOptions,
  ) => void;
  onConvertSession?: (session: SessionInfo) => void;
  onResumeSession?: (session: SessionInfo) => void | Promise<void>;
  onCopyResumeSession?: (session: SessionInfo) => void | Promise<void>;
  onForkSession?: (session: SessionInfo) => void | Promise<void>;
  onPreviewExportSession?: (session: SessionInfo) => void;
  onOpenPreviewRenameDialog?: (session: SessionInfo) => void;
  onPreviewRenameSession?: (
    session: SessionInfo,
    newName: string,
  ) => void | Promise<void>;
  onPreviewForkSession?: (session: SessionInfo) => void;
  onPreviewConvertSession?: (session: SessionInfo) => void;
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  searchQuery?: string;
  getBadgeType?: (sessionId: string) => "new" | "updated" | null;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  scrollParentRef?: RefObject<HTMLDivElement>;
  showDirectory?: boolean;
  tags?: Tag[];
  getTagsForSession?: (sessionId: string) => Tag[];
  onToggleTag?: (
    sessionId: string,
    tagId: string,
    currentlyAssigned: boolean,
  ) => void;
  onCreateTag?: (name: string, color: string) => void;
  selectionModeTrigger?: number;
  selectionModeDismissTrigger?: number;
  liveSessionIds?: Set<string>;
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  onDeleteSessions,
  onConvertSession,
  onResumeSession,
  onCopyResumeSession,
  onForkSession,
  onPreviewExportSession,
  onOpenPreviewRenameDialog,
  onPreviewRenameSession,
  onPreviewForkSession,
  onPreviewConvertSession,
  loading,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  getBadgeType,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  resumeCommand,
  scrollParentRef,
  showDirectory = true,
  tags = [],
  getTagsForSession,
  onToggleTag,
  onCreateTag,
  selectionModeTrigger,
  selectionModeDismissTrigger,
  searchQuery,
  liveSessionIds,
}: SessionListProps) {
  const { sessionListActions = [], sessionContextMenuActions = [] } = usePsmPluginSessionUi();
  const { t } = useTranslation();
  const { getSessionSetting } = useSettings();
  const isMobile = useIsMobile();
  const { copyText } = useClipboard();
  const showAgentIconInBadge =
    getSessionSetting("showAgentIconInSessionBadge") !== false;
  const showModelIconInBadge =
    getSessionSetting("showModelIconInSessionBadge") === true;
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  const [hoveredCard, setHoveredCard] = useState<{ session: SessionInfo; rect: DOMRect } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [tagPickerSessionId, setTagPickerSessionId] = useState<string | null>(
    null,
  );
  const [tagPickerAnchor, setTagPickerAnchor] = useState<DOMRect | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
  } | null>(null);
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null);
  const [previewClickPoint, setPreviewClickPoint] = useState<{ x: number; y: number } | null>(null);
  const lastSelectedSessionIdRef = useRef<string | null>(null);
  const selectionAnchorSessionIdRef = useRef<string | null>(null);
  const selectedSessionsRef = useRef<SessionInfo[]>([]);
  const lastSelectionModeTriggerRef = useRef(selectionModeTrigger);
  const lastSelectionModeDismissTriggerRef = useRef(
    selectionModeDismissTrigger,
  );
  const scrollAnchorRef = useRef<{
    sessionId: string;
    top: number;
  } | null>(null);
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session] as const)),
    [sessions],
  );
  const sessionIndexById = useMemo(
    () =>
      new Map(sessions.map((session, index) => [session.id, index] as const)),
    [sessions],
  );
  const totalRows = Math.ceil(sessions.length / Math.max(1, columnCount));
  const tagPickerSessionTags = useMemo(() => {
    if (!tagPickerSessionId || !getTagsForSession) {
      return [] as Tag[];
    }
    return getTagsForSession(tagPickerSessionId);
  }, [getTagsForSession, tagPickerSessionId, tags]);
  const contextMenuSession = useMemo(() => {
    if (!contextMenu) {
      return null;
    }
    return sessionsById.get(contextMenu.sessionId) ?? null;
  }, [contextMenu, sessionsById]);
  const contextMenuSessionTags = useMemo(() => {
    if (!contextMenu || !getTagsForSession) {
      return [] as Tag[];
    }
    return getTagsForSession(contextMenu.sessionId);
  }, [contextMenu, getTagsForSession, tags]);
  const selectedSessions = useMemo(
    () => sessions.filter((session) => selectedSessionIds.has(session.id)),
    [sessions, selectedSessionIds],
  );
  const getDeleteRequestOptions = useCallback(
    (
      eventOrPoint:
        | React.MouseEvent<HTMLElement>
        | { x: number; y: number }
        | undefined,
    ): DeleteSessionRequestOptions | undefined => {
      if (!eventOrPoint) {
        return undefined;
      }

      if ("clientX" in eventOrPoint) {
        const rect = eventOrPoint.currentTarget.getBoundingClientRect();
        return {
          anchorPoint: {
            x: rect.left + rect.width / 2,
            y: rect.bottom,
          },
        };
      }

      return { anchorPoint: eventOrPoint };
    },
    [],
  );

  useEffect(() => {
    selectedSessionsRef.current = selectedSessions;
  }, [selectedSessions]);

  /* dismiss hover overlay on scroll/resize */
  useEffect(() => {
    if (!hoveredCard) return;
    const dismiss = () => { clearTimeout(hoverTimerRef.current); setHoveredCard(null); };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [hoveredCard]);

  const renderSessionPluginActions = useCallback((session: SessionInfo) => (
    sessionListActions.map((action) => (
      <PluginContributionBoundary key={action.id} pluginId={action.pluginId} contributionId={action.id} title={action.title}>
        <PluginContributionSlot render={() => action.render({
          session: { path: session.path, id: session.id, name: session.name, cwd: session.cwd },
          onActivate: () => {},
        })} />
      </PluginContributionBoundary>
    ))
  ), [sessionListActions]);

  const renderSessionContextActions = useCallback((session: SessionInfo) => (
    sessionContextMenuActions.map((action) => (
      <PluginContributionBoundary key={action.id} pluginId={action.pluginId} contributionId={action.id} title={action.title}>
        <PluginContributionSlot render={() => action.render({
          session: { path: session.path, id: session.id, name: session.name, cwd: session.cwd },
          close: () => setContextMenu(null),
          onActivate: () => {},
        })} />
      </PluginContributionBoundary>
    ))
  ), [sessionContextMenuActions]);

  const allSessionsSelected =
    sessions.length > 0 && selectedSessionIds.size === sessions.length;
  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedSessionIds(new Set());
    lastSelectedSessionIdRef.current = null;
    selectionAnchorSessionIdRef.current = null;
  }, []);
  const handleEnterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
    if (selectedSession && sessionsById.has(selectedSession.id)) {
      setSelectedSessionIds(new Set([selectedSession.id]));
      lastSelectedSessionIdRef.current = selectedSession.id;
      selectionAnchorSessionIdRef.current = selectedSession.id;
      return;
    }
    setSelectedSessionIds(new Set());
    lastSelectedSessionIdRef.current = null;
    selectionAnchorSessionIdRef.current = null;
  }, [selectedSession, sessionsById]);
  const handleStartSelectionMode = useCallback(
    (sessionId: string, shiftKey: boolean) => {
      if (!onDeleteSessions) {
        return;
      }

      setIsSelectionMode(true);
      setSelectedSessionIds((prev) => {
        const next = new Set(prev);
        const existingAnchorSessionId =
          selectionAnchorSessionIdRef.current ??
          lastSelectedSessionIdRef.current ??
          (selectedSession && sessionsById.has(selectedSession.id)
            ? selectedSession.id
            : null);
        const anchorSessionId = shiftKey
          ? prev.size === 0
            ? sessionId
            : existingAnchorSessionId
          : existingAnchorSessionId;
        const currentIndex = sessionIndexById.get(sessionId);
        const anchorIndex = anchorSessionId
          ? sessionIndexById.get(anchorSessionId)
          : undefined;

        if (
          shiftKey &&
          currentIndex !== undefined &&
          anchorIndex !== undefined &&
          sessions.length > 0
        ) {
          if (anchorSessionId) {
            next.add(anchorSessionId);
          }
          const rangeStart = Math.min(anchorIndex, currentIndex);
          const rangeEnd = Math.max(anchorIndex, currentIndex);
          for (let index = rangeStart; index <= rangeEnd; index += 1) {
            const target = sessions[index];
            if (target) {
              next.add(target.id);
            }
          }
          selectionAnchorSessionIdRef.current = anchorSessionId;
          return next;
        }

        if (existingAnchorSessionId) {
          next.add(existingAnchorSessionId);
        }
        next.add(sessionId);
        selectionAnchorSessionIdRef.current = sessionId;
        return next;
      });
      lastSelectedSessionIdRef.current = sessionId;
    },
    [
      onDeleteSessions,
      selectedSession,
      sessionIndexById,
      sessions,
      sessionsById,
    ],
  );
  const toggleSessionSelection = useCallback(
    (sessionId: string, shiftKey = false) => {
      setSelectedSessionIds((prev) => {
        const next = new Set(prev);
        const currentIndex = sessionIndexById.get(sessionId);
        const anchorSessionId =
          selectionAnchorSessionIdRef.current ??
          lastSelectedSessionIdRef.current;
        const anchorIndex = anchorSessionId
          ? sessionIndexById.get(anchorSessionId)
          : undefined;

        if (
          shiftKey &&
          currentIndex !== undefined &&
          anchorIndex !== undefined &&
          sessions.length > 0
        ) {
          const rangeStart = Math.min(anchorIndex, currentIndex);
          const rangeEnd = Math.max(anchorIndex, currentIndex);
          for (let index = rangeStart; index <= rangeEnd; index += 1) {
            const target = sessions[index];
            if (target) {
              next.add(target.id);
            }
          }
          if (anchorSessionId) {
            selectionAnchorSessionIdRef.current = anchorSessionId;
          }
          return next;
        }

        if (next.has(sessionId)) {
          next.delete(sessionId);
        } else {
          next.add(sessionId);
        }
        selectionAnchorSessionIdRef.current = sessionId;
        return next;
      });
      lastSelectedSessionIdRef.current = sessionId;
    },
    [sessionIndexById, sessions],
  );
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 4,
    measureElement: (element) =>
      (element as HTMLElement).offsetHeight || ESTIMATED_ROW_HEIGHT,
  });

  useEffect(() => {
    if (isMobile) {
      setColumnCount(1);
      return;
    }

    const container = listContainerRef.current;
    if (!container) {
      return;
    }

    const updateColumnCount = () => {
      const width = container.clientWidth;
      if (width >= 1200) {
        setColumnCount(3);
      } else if (width >= 760) {
        setColumnCount(2);
      } else {
        setColumnCount(1);
      }
    };

    updateColumnCount();

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => updateColumnCount());
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateColumnCount);
    return () => window.removeEventListener("resize", updateColumnCount);
  }, [isMobile]);

  useEffect(() => {
    rowVirtualizer.measure();
  }, [
    columnCount,
    isSelectionMode,
    rowVirtualizer,
    sessions.length,
    showDirectory,
  ]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  useLayoutEffect(() => {
    // Keep the first visible card visually anchored across incremental refreshes.
    const scrollElement = scrollParentRef?.current;
    const anchor = scrollAnchorRef.current;

    if (
      scrollElement &&
      anchor &&
      scrollElement.scrollTop > STICKY_SCROLL_TOP_THRESHOLD
    ) {
      const renderedCards =
        scrollElement.querySelectorAll<HTMLElement>("[data-session-id]");
      const anchorElement = Array.from(renderedCards).find(
        (element) => element.dataset.sessionId === anchor.sessionId,
      );

      if (anchorElement) {
        const delta = anchorElement.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 0.5) {
          scrollElement.scrollTop += delta;
        }
      }
    }

    scrollAnchorRef.current = null;

    return () => {
      const container = scrollParentRef?.current;
      if (!container || container.scrollTop <= STICKY_SCROLL_TOP_THRESHOLD) {
        scrollAnchorRef.current = null;
        return;
      }

      const containerTop = container.getBoundingClientRect().top;
      const renderedCards =
        container.querySelectorAll<HTMLElement>("[data-session-id]");
      let firstVisibleCard: HTMLElement | null = null;

      for (const card of renderedCards) {
        const rect = card.getBoundingClientRect();
        if (rect.bottom >= containerTop + 1) {
          firstVisibleCard = card;
          break;
        }
      }

      const sessionId = firstVisibleCard?.dataset.sessionId;
      if (!sessionId || !firstVisibleCard) {
        scrollAnchorRef.current = null;
        return;
      }

      scrollAnchorRef.current = {
        sessionId,
        top: firstVisibleCard.getBoundingClientRect().top,
      };
    };
  }, [sessions, scrollParentRef]);

  // Scroll to top when search query changes
  useEffect(() => {
    const el = scrollParentRef?.current;
    if (el && el.scrollTop > 0) {
      el.scrollTop = 0;
    }
  }, [searchQuery, scrollParentRef]);

  useEffect(() => {
    const liveIds = new Set(sessions.map((session) => session.id));
    if (
      lastSelectedSessionIdRef.current &&
      !liveIds.has(lastSelectedSessionIdRef.current)
    ) {
      lastSelectedSessionIdRef.current = null;
    }
    if (
      selectionAnchorSessionIdRef.current &&
      !liveIds.has(selectionAnchorSessionIdRef.current)
    ) {
      selectionAnchorSessionIdRef.current = null;
    }

    setSelectedSessionIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set<string>();
      let changed = false;

      prev.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [sessions]);

  useEffect(() => {
    if (onDeleteSessions) {
      return;
    }

    handleExitSelectionMode();
  }, [handleExitSelectionMode, onDeleteSessions]);

  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    setContextMenu(null);
    setTagPickerSessionId(null);
  }, [isSelectionMode]);

  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) {
        return;
      }

      if (document.querySelector('[data-delete-session-dialog="true"]')) {
        return;
      }

      const isDeleteShortcut =
        (event.metaKey || event.ctrlKey) && event.key === "Backspace";

      if (isDeleteShortcut) {
        const sessionsToDelete = selectedSessionsRef.current;
        if (!onDeleteSessions || sessionsToDelete.length === 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void onDeleteSessions(sessionsToDelete);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        handleExitSelectionMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleExitSelectionMode, isSelectionMode, onDeleteSessions]);

  useEffect(() => {
    if (selectionModeTrigger === undefined) {
      return;
    }
    if (selectionModeTrigger === lastSelectionModeTriggerRef.current) {
      return;
    }

    lastSelectionModeTriggerRef.current = selectionModeTrigger;
    if (!onDeleteSessions) {
      return;
    }
    if (isSelectionMode) {
      handleExitSelectionMode();
      return;
    }

    handleEnterSelectionMode();
  }, [
    handleExitSelectionMode,
    handleEnterSelectionMode,
    isSelectionMode,
    onDeleteSessions,
    selectionModeTrigger,
  ]);

  useEffect(() => {
    if (selectionModeDismissTrigger === undefined) {
      return;
    }
    if (
      selectionModeDismissTrigger === lastSelectionModeDismissTriggerRef.current
    ) {
      return;
    }

    lastSelectionModeDismissTriggerRef.current = selectionModeDismissTrigger;
    handleExitSelectionMode();
  }, [handleExitSelectionMode, selectionModeDismissTrigger]);

  useEffect(() => {
    if (!hasMore || !onLoadMore || loadingMore || totalRows === 0) {
      return;
    }

    const lastVisibleRow = virtualRows[virtualRows.length - 1];
    if (!lastVisibleRow) {
      return;
    }

    const prefetchThreshold = Math.max(0, totalRows - 2);
    if (lastVisibleRow.index >= prefetchThreshold) {
      void onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore, totalRows, virtualRows]);

  const showDelayedLoading = useDelayedLoading(loading);

  if (showDelayedLoading) {
    return <SessionListSkeleton showDirectory={showDirectory} />;
  }

  if (sessions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 px-8">
        <Search className="h-8 w-8 mb-3 opacity-40" />
        <span className="text-[11px] text-center">
          {t("session.list.empty")}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      {onDeleteSessions && isSelectionMode && (
        <div className="sticky top-0 z-20 border-b border-border/40 bg-background/95 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-2 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium text-foreground/90">
                {t("session.list.selectedCount", {
                  count: selectedSessionIds.size,
                  defaultValue: "{{count}} selected",
                })}
              </div>
              <div className="hidden truncate text-[10px] text-muted-foreground/80 lg:block">
                {t("session.list.selectionHint", {
                  defaultValue: "Click cards to select, Shift+Click for range",
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  setSelectedSessionIds(
                    allSessionsSelected
                      ? new Set()
                      : new Set(sessions.map((session) => session.id)),
                  )
                }
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground motion-color focus-ring"
              >
                {allSessionsSelected
                  ? t("session.list.clearSelection", { defaultValue: "Clear" })
                  : t("session.list.selectAll", { defaultValue: "Select all" })}
              </button>
              <button
                type="button"
                onClick={handleExitSelectionMode}
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground motion-color focus-ring"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={selectedSessions.length === 0}
                onClick={(event) => {
                  onDeleteSessions(selectedSessions, getDeleteRequestOptions(event));
                }}
                className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 motion-color focus-ring"
              >
                <Trash2 className="h-3 w-3" />
                <span>
                  {t("session.list.deleteSelected", {
                    count: selectedSessions.length,
                    defaultValue: "Delete {{count}}",
                  })}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={listContainerRef} className="relative w-full">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {virtualRows.map((virtualRow) => {
            const startIndex = virtualRow.index * columnCount;
            const rowSessions = sessions.slice(
              startIndex,
              startIndex + columnCount,
            );

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="grid cursor-pointer px-2 py-1.5 gap-2.5"
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                >
                  {rowSessions.map((session) => {
                    const pluginSessionActions = renderSessionPluginActions(session);
                    const updatedLabel = formatShortTime(session.modified, t);
                    const isSelectionMarked = selectedSessionIds.has(
                      session.id,
                    );
                    const isSelected = isSelectionMode
                      ? isSelectionMarked
                      : selectedSession?.id === session.id;
                    const hasPreview =
                      session.last_message ||
                      (session.first_message && !session.name);
                    const sourceTag = getSessionSourceTag(session.path);
                    const sourceSlug = getSessionSourceSlug(session.path);
                    const sessionTags = getTagsForSession
                      ? getTagsForSession(session.id)
                      : [];
                    const badgeType = getBadgeType
                      ? getBadgeType(session.id)
                      : null;
                    const topModels = session.models?.length
                      ? session.models.slice(0, 2)
                      : session.model
                      ? [session.model]
                      : [];

                    return (
                      <div
                        key={session.id}
                        data-session-id={session.id}
                        onClick={(event) => {
                          // Option+Click (macOS) / Alt+Click (Windows) → open preview modal
                          if (event.altKey) {
                            event.preventDefault();
                            setPreviewClickPoint({ x: event.clientX, y: event.clientY });
                            setPreviewSession(session);
                            return;
                          }

                          const wantsMultiSelect =
                            !!onDeleteSessions &&
                            (event.metaKey || event.ctrlKey || event.shiftKey);

                          if (!isSelectionMode && wantsMultiSelect) {
                            handleStartSelectionMode(
                              session.id,
                              event.shiftKey,
                            );
                            return;
                          }

                          if (isSelectionMode) {
                            toggleSessionSelection(session.id, event.shiftKey);
                            return;
                          }
                          onSelectSession(session);
                        }}
                        onContextMenu={(e) => {
                          if (isSelectionMode) {
                            e.preventDefault();
                            return;
                          }
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            sessionId: session.id,
                          });
                        }}
                        className={`relative px-3 py-2.5 motion-surface motion-color group rounded-lg overflow-clip border select-none cursor-pointer ${
                          isSelected
                            ? isSelectionMode
                              ? "border-primary/60 bg-primary/10 shadow-lg ring-1 ring-primary/30"
                              : "border-primary/30 bg-surface/75 shadow-lg"
                            : isSelectionMode
                              ? "border-border/70 hover:bg-surface/70"
                              : "border-transparent hover:bg-surface/60"
                        }`}
                        style={{ contain: "layout paint" }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {isSelectionMode && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSessionSelection(
                                    session.id,
                                    event.shiftKey,
                                  );
                                }}
                                className={`mt-0.5 rounded-md p-1 motion-color focus-ring ${
                                  isSelected
                                    ? "bg-destructive/15 text-destructive"
                                    : "text-muted-foreground/70 hover:bg-foreground/5 hover:text-foreground"
                                }`}
                                aria-label={t("session.list.toggleSelection", {
                                  defaultValue: "Toggle selection",
                                })}
                                aria-pressed={isSelected}
                              >
                                {isSelected ? (
                                  <CheckSquare2 className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  {(liveSessionIds?.has(session.id) ||
                                    session.isLive) && (
                                    <div
                                      className="flex items-center justify-center bg-green-500/15 p-0.5 rounded flex-shrink-0"
                                      title={t("session.online", "Online")}
                                    >
                                      <Zap className="h-3 w-3 text-green-500 fill-current" />
                                    </div>
                                  )}
                                  <h3
                                    className="font-medium text-[13px] sm:text-sm text-foreground leading-tight line-clamp-1 flex-1 min-w-0"
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      hoverTimerRef.current = setTimeout(() => {
                                        setHoveredCard({ session, rect });
                                      }, 1000);
                                    }}
                                    onMouseLeave={() => {
                                      clearTimeout(hoverTimerRef.current);
                                      setHoveredCard(null);
                                    }}
                                  >
                                    {getSessionListDisplayName(
                                      session,
                                      t("session.list.untitled"),
                                    )}
                                  </h3>
                                </div>
                                {isSelectionMode && isSelectionMarked && (
                                  <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">
                                    {t("session.list.selectedBadge", {
                                      defaultValue: "Selected",
                                    })}
                                  </span>
                                )}
                              </div>
                              {searchQuery &&
                                searchQuery.trim().length >=
                                  MIN_SESSION_ID_PREFIX_LENGTH &&
                                session.id
                                  .toLowerCase()
                                  .startsWith(
                                    searchQuery.trim().toLowerCase(),
                                  ) && (
                                  <div className="mt-1 flex items-center gap-1.5 min-w-0">
                                    <span
                                      className="inline-flex max-w-full items-center rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                      title={session.id}
                                      aria-label={t("session.header.session", {
                                        defaultValue: "Session",
                                      })}
                                    >
                                      {formatShortSessionId(session.id)}
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground flex-shrink-0 pt-0.5 whitespace-nowrap">
                            {updatedLabel}
                          </div>
                        </div>

                        {hasPreview && (
                          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 leading-relaxed mb-2">
                            {session.last_message || session.first_message}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {liveSessionIds?.has(session.id) && (
                              <span
                                className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"
                                title="Live"
                              />
                            )}

                            {sourceTag && (
                              <SessionBadge
                                label={sourceTag}
                                tone="source"
                                sourceSlug={sourceSlug || undefined}
                                showIcon={showAgentIconInBadge}
                                className="text-[9px] sm:text-[10px]"
                              />
                            )}
                            {showModelIconInBadge &&
                              topModels.map((m) => (
                                <SessionBadge
                                  key={m}
                                  type="model"
                                  model={m}
                                  showIcon={true}
                                  className="text-[9px] sm:text-[10px]"
                                />
                              ))}
                            <span className="px-1.5 py-0.5  text-[9px] sm:text-[10px] tabular-nums font-medium text-muted-foreground flex-shrink-0">
                              {session.message_count}
                            </span>

                            {sessionTags.length > 0 && (
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                {sessionTags.map((tag) => (
                                  <TagBadge key={tag.id} tag={tag} compact />
                                ))}
                              </div>
                            )}

                            {badgeType && (
                              <div className="flex-shrink-0">
                                <SessionBadge type={badgeType} />
                              </div>
                            )}

                            {showDirectory && (
                              <span
                                className="text-[10px] text-muted-foreground/70 font-mono truncate min-w-0 ml-0.5 group-hover:hidden"
                                title={session.cwd || t("session.list.unknownDirectory")}
                              >
                                {formatDirectory(session.cwd) ||
                                  t("session.list.unknownDirectory")}
                              </span>
                            )}
                          </div>

                          <div
                            className={`flex items-center gap-1 transition-all duration-200 ease-out ${isMobile ? "flex-shrink-0" : "w-0 opacity-0 group-hover:w-auto group-hover:opacity-100"}`}
                          >
                            {pluginSessionActions}
                            {!isSelectionMode && onToggleTag && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (
                                    e.currentTarget as HTMLElement
                                  ).getBoundingClientRect();
                                  setTagPickerSessionId((prev) =>
                                    prev === session.id ? null : session.id,
                                  );
                                  setTagPickerAnchor(rect);
                                }}
                                className="p-1 text-muted-foreground/60 hover:text-blue-400 rounded motion-color focus-ring"
                                title={t("tags.assign")}
                              >
                                <Tags className="h-3 w-3" />
                              </button>
                            )}
                            {!isSelectionMode && (
                              <OpenInTerminalButton
                                session={session}
                                terminal={terminal}
                                piPath={piPath}
                                customCommand={customCommand}
                                resumeCommand={resumeCommand}
                                onResumeSession={onResumeSession}
                                size="sm"
                                variant="ghost"
                                onError={(error) =>
                                  console.error(
                                    "Failed to open in terminal:",
                                    error,
                                  )
                                }
                              />
                            )}
                            {!isSelectionMode && (
                              <OpenInBrowserButton
                                session={session}
                                size="sm"
                                variant="ghost"
                                onError={(error) =>
                                  console.error(
                                    "Failed to open in browser:",
                                    error,
                                  )
                                }
                              />
                            )}
                            {!isSelectionMode && onConvertSession && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConvertSession(session);
                                }}
                                className="p-1 text-muted-foreground/60 hover:text-primary rounded motion-color focus-ring"
                                title={t("session.convert.title")}
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                              </button>
                            )}
                            {!isSelectionMode && onDeleteSession && (
                              <DeleteConfirmButton
                                onDelete={() => {
                                  onDeleteSession(session, undefined);
                                }}
                                size="sm"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loadingMore && (
        <div className="px-2 pb-2 text-[11px] text-muted-foreground/80">
          {t("common.loading", { defaultValue: "Loading..." })}
        </div>
      )}

      {tagPickerSessionId && onToggleTag && (
        <TagPicker
          tags={tags}
          selectedTagIds={tagPickerSessionTags.map((tag) => tag.id)}
          onToggle={(tagId) => {
            const assigned = tagPickerSessionTags.some(
              (tag) => tag.id === tagId,
            );
            onToggleTag(tagPickerSessionId, tagId, assigned);
          }}
          onCreateTag={onCreateTag}
          anchorRect={tagPickerAnchor}
          onClose={() => setTagPickerSessionId(null)}
        />
      )}

      {contextMenu && onToggleTag && contextMenuSession && (
        <SessionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sessionId={contextMenu.sessionId}
          tags={tags}
          sessionTagIds={contextMenuSessionTags.map((tag) => tag.id)}
          onToggleTag={(tagId, assigned) =>
            onToggleTag(contextMenu.sessionId, tagId, assigned)
          }
          onOpenTerminal={
            onResumeSession
              ? () => {
                  void onResumeSession(contextMenuSession);
                }
              : isTauri()
              ? () => {
                  openSessionInTerminalDirect(contextMenuSession, {
                    terminal,
                    customCommand,
                    piPath,
                    resumeCommand,
                  }).catch(console.error);
                }
              : undefined
          }
          onOpenBrowser={
            isTauri()
              ? () => {
                  invoke("open_session_in_browser", {
                    path: contextMenuSession.path,
                  }).catch(console.error);
                }
              : undefined
          }
          onConvert={
            onConvertSession
              ? () => {
                  onConvertSession(contextMenuSession);
                }
              : undefined
          }
          pluginActions={renderSessionContextActions(contextMenuSession)}
          onCopyResume={
            onCopyResumeSession
              ? async () => {
                  await onCopyResumeSession(contextMenuSession);
                }
              : isTauri()
              ? () => {
                  void buildCopyResumeCommand(contextMenuSession, {
                    piPath,
                    resumeCommand,
                  }).then((command) => copyText(command).catch(console.error));
                }
              : undefined
          }
          onFork={
            onForkSession
              ? () => {
                  onForkSession(contextMenuSession);
                }
              : undefined
          }
          onRename={
            onOpenPreviewRenameDialog
              ? () => {
                  onOpenPreviewRenameDialog(contextMenuSession);
                }
              : undefined
          }
          onDeleteDirect={
            onDeleteSession
              ? () => {
                  onDeleteSession(
                    contextMenuSession,
                    { skipPopover: true },
                  );
                }
              : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {previewSession && (() => {
        const previewActions =
          onPreviewExportSession &&
          onOpenPreviewRenameDialog &&
          onPreviewRenameSession
            ? buildSessionPreviewModalActions(previewSession, {
                onPreviewExportSession,
                onOpenPreviewRenameDialog,
                onPreviewRenameSession,
                onPreviewForkSession,
                onPreviewConvertSession:
                  onPreviewConvertSession ??
                  (onConvertSession
                    ? (session) => onConvertSession(session)
                    : undefined),
              })
            : null;
        return (
        <SessionPreviewModal
          session={previewSession}
          isOpen={!!previewSession}
          onClose={() => {
            setPreviewSession(null);
            setPreviewClickPoint(null);
          }}
          onExpand={() => {
            if (previewSession) {
              onSelectSession(previewSession);
            }
            setPreviewSession(null);
            setPreviewClickPoint(null);
          }}
          onExport={previewActions?.onExport ?? (() => {})}
          onConvert={previewActions?.onConvert}
          onRename={previewActions?.onRename ?? (() => {})}
          onRenameSession={previewActions?.onRenameSession}
          onFork={previewActions?.onFork}
          onResumeSession={onResumeSession}
          terminal={terminal}
          piPath={piPath}
          customCommand={customCommand}
          resumeCommand={resumeCommand}
          initialClickPoint={previewClickPoint}
          animationMode="origin-point"
        />
        );
      })()}

      {/* ── Hover title overlay ── */}
      {hoveredCard && createPortal(
        <div
          style={{
            position: "fixed",
            top: hoveredCard.rect.top - 4,
            left: hoveredCard.rect.left - 1,
            width: hoveredCard.rect.width + 2,
            padding: "4px 10px",
            zIndex: 50,
            pointerEvents: "none",
            borderRadius: "0.375rem",
            background: "var(--surface, hsl(0 0% 100%))",
            border: "1px solid var(--primary, hsl(217 91% 30% / 0.3))",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            transition: "border-color 150ms ease, box-shadow 150ms ease",
          }}
        >
          <h3 className="font-medium text-[13px] sm:text-sm text-foreground leading-snug" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
            {getSessionListDisplayName(
              hoveredCard.session,
              t("session.list.untitled"),
            )}
          </h3>
        </div>,
        document.body,
      )}

    </div>
  );
}
