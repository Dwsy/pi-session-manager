import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { SessionInfo, FavoriteItem, Tag } from "@/types";
import {
  ArrowRightLeft,
  CheckSquare2,
  Search,
  Square,
  Star,
  Tags,
  Trash2,
  Zap,
} from "lucide-react";
import { SessionListSkeleton } from "@/components/ui/Skeleton";
import OpenInBrowserButton from "@/components/OpenInBrowserButton";
import OpenInTerminalButton from "@/components/OpenInTerminalButton";
import { SessionBadge } from "@/components/session-viewer/SessionBadge";
import TagBadge from "@/components/tags/TagBadge";
import TagPicker from "@/components/tags/TagPicker";
import SessionContextMenu from "@/components/session-viewer/SessionContextMenu";
import DeleteSessionPopover from "@/components/dialogs/DeleteSessionPopover";
import {
  formatShortSessionId,
  MIN_SESSION_ID_PREFIX_LENGTH,
  getSessionSourceSlug,
  getSessionSourceTag,
} from "@/utils/session";
import { formatDirectory, formatShortTime } from "@/utils/sessionDisplay";
import type { TerminalType } from "@/components/settings/types";
import { getPlatformDefaults } from "@/components/settings/types";
import { invoke, isTauri } from "@/transport";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isTextEntryTarget } from "@/hooks/useKeyboardShortcuts";
import { useClipboard } from "@/hooks/useClipboard";
import { getCachedSettings } from "@/utils/settingsApi";
import { useSettings } from "@/hooks/useSettings";

const ESTIMATED_ROW_HEIGHT = 122;
const STICKY_SCROLL_TOP_THRESHOLD = 48;

interface SessionListProps {
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  onSelectSession: (session: SessionInfo) => void;
  onDeleteSession?: (session: SessionInfo) => void;
  onDeleteSessions?: (sessions: SessionInfo[]) => void;
  onConvertSession?: (session: SessionInfo) => void;
  onResumeSession?: (session: SessionInfo) => void | Promise<void>;
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
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, "addedAt">) => void;
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
  favorites = [],
  onToggleFavorite,
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
  const { t } = useTranslation();
  const { getSessionSetting } = useSettings();
  const isMobile = useIsMobile();
  const { copyText } = useClipboard();
  const showAgentIconInBadge =
    getSessionSetting("showAgentIconInSessionBadge") !== false;
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
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
  const [pendingDeleteSession, setPendingDeleteSession] = useState<{
    sessions: SessionInfo[];
    anchorRef: React.RefObject<HTMLElement>;
  } | null>(null);
  const lastSelectedSessionIdRef = useRef<string | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
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
  const favoriteSessionIds = useMemo(
    () =>
      new Set(
        favorites
          .filter((favorite) => favorite.type === "session")
          .map((favorite) => favorite.id),
      ),
    [favorites],
  );
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

  useEffect(() => {
    selectedSessionsRef.current = selectedSessions;
  }, [selectedSessions]);
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

  if (loading) {
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
        <div className="sticky top-0 z-20 border-b border-border/40 bg-background/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground motion-color motion-press focus-ring"
              >
                {allSessionsSelected
                  ? t("session.list.clearSelection", { defaultValue: "Clear" })
                  : t("session.list.selectAll", { defaultValue: "Select all" })}
              </button>
              <button
                type="button"
                onClick={handleExitSelectionMode}
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground motion-color motion-press focus-ring"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={selectedSessions.length === 0}
                onClick={() => {
                  onDeleteSessions(selectedSessions);
                }}
                className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 motion-color motion-press focus-ring"
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
                  className="grid px-2 py-1.5 gap-2.5"
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                >
                  {rowSessions.map((session) => {
                    const isFavorite = favoriteSessionIds.has(session.id);
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

                    return (
                      <div
                        key={session.id}
                        data-session-id={session.id}
                        onClick={(event) => {
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
                        className={`relative px-3 py-2.5 cursor-pointer motion-surface motion-color group rounded-lg border ${
                          isSelected
                            ? isSelectionMode
                              ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.22)] ring-1 ring-primary/30"
                              : "border-primary/30 bg-surface/75 shadow-[0_0_0_1px_rgba(59,130,246,0.12)]"
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
                                className={`mt-0.5 rounded-md p-1 motion-color motion-press focus-ring ${
                                  isSelected
                                    ? "bg-primary/15 text-primary"
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
                                  <h3 className="font-medium text-[13px] sm:text-sm text-foreground leading-tight line-clamp-1 flex-1 min-w-0">
                                    {session.name ||
                                      session.first_message ||
                                      t("session.list.untitled")}
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
                              <span className="text-[10px] text-muted-foreground/70 font-mono truncate min-w-0 ml-0.5">
                                {formatDirectory(session.cwd) ||
                                  t("session.list.unknownDirectory")}
                              </span>
                            )}
                          </div>

                          <div
                            className={`flex items-center gap-1 flex-shrink-0 ${isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"} motion-opacity`}
                          >
                            {!isSelectionMode && onToggleFavorite && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavorite({
                                    type: "session",
                                    id: session.id,
                                    name:
                                      session.name ||
                                      session.first_message ||
                                      t("session.list.untitled"),
                                    path: session.path,
                                  });
                                }}
                                className={`p-1 rounded motion-color motion-press focus-ring ${
                                  isFavorite
                                    ? "text-yellow-400"
                                    : "text-muted-foreground/60 hover:text-yellow-400"
                                }`}
                                title={
                                  isFavorite
                                    ? t("favorites.remove")
                                    : t("favorites.add")
                                }
                              >
                                <Star
                                  className={`h-3 w-3 ${isFavorite ? "fill-current" : ""}`}
                                />
                              </button>
                            )}
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
                                className="p-1 text-muted-foreground/60 hover:text-blue-400 rounded motion-color motion-press focus-ring"
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
                                className="p-1 text-muted-foreground/60 hover:text-primary rounded motion-color motion-press focus-ring"
                                title={t("session.convert.title")}
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                              </button>
                            )}
                            {!isSelectionMode && onDeleteSession && (
                              <button
                                ref={
                                  pendingDeleteSession?.sessions[0].id ===
                                  session.id
                                    ? deleteButtonRef
                                    : null
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDeleteSession({
                                    sessions: [session],
                                    anchorRef: deleteButtonRef,
                                  });
                                }}
                                className="p-1 text-muted-foreground/60 hover:text-red-500 rounded motion-color motion-press focus-ring"
                                title={t("common.deleteSession")}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
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
                  invoke("open_session_in_terminal", {
                    path: contextMenuSession.path,
                    cwd: contextMenuSession.cwd,
                    terminal: terminal === "custom" ? customCommand : terminal,
                    piPath: piPath || null,
                    resumeCommand: resumeCommand || null,
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
          onToggleFavorite={
            onToggleFavorite
              ? () => {
                  onToggleFavorite({
                    type: "session",
                    id: contextMenuSession.id,
                    name:
                      contextMenuSession.name ||
                      contextMenuSession.first_message ||
                      "Untitled",
                    path: contextMenuSession.path,
                  });
                }
              : undefined
          }
          onCopyResume={
            onResumeSession
              ? async () => {
                  const sourceSlug = getSessionSourceSlug(contextMenuSession.path);
                  const settings = getCachedSettings();
                  const defaultTarget =
                    settings.session?.defaultExternalResumeTarget || "pi";
                  if (!sourceSlug || sourceSlug === "pi") {
                    const cmd =
                      settings.terminal?.resumeCommand || resumeCommand || "";
                    const piCmd =
                      settings.terminal?.piCommandPath || piPath || "pi";
                    const hasPlaceholders =
                      cmd.includes("{path}") || cmd.includes("{pi}");
                    let fullCommand = cmd
                      ? cmd
                          .replace(/\{cwd\}/g, contextMenuSession.cwd || "")
                          .replace(/\{path\}/g, contextMenuSession.path)
                          .replace(/\{pi\}/g, piCmd)
                      : `${piCmd} --session ${contextMenuSession.path}`;
                    if (cmd.includes("new-session") && !hasPlaceholders) {
                      const sessionSuffix = contextMenuSession.id
                        ? contextMenuSession.id.slice(0, 4)
                        : "pi";
                      const sessionName = `pi-${sessionSuffix}`;
                      fullCommand = `/opt/homebrew/bin/tmux new-session -A -s ${sessionName} 'cd ${contextMenuSession.cwd || ""} && ${piCmd} --session ${contextMenuSession.path}'`;
                    }
                    copyText(fullCommand).catch(console.error);
                    return;
                  }

                  const result = await invoke<import("@/types").SessionConvertResult>(
                    "convert_session_format",
                    {
                      path: contextMenuSession.path,
                      targetFormat: defaultTarget,
                      dryRun: true,
                      force: false,
                    },
                  );
                  copyText(result.resume_command).catch(console.error);
                }
              : isTauri()
              ? () => {
                  const settings = getCachedSettings();
                  const cmd =
                    settings.terminal?.resumeCommand || resumeCommand || "";
                  const piCmd =
                    settings.terminal?.piCommandPath || piPath || "pi";
                  const hasPlaceholders =
                    cmd.includes("{path}") || cmd.includes("{pi}");
                  let fullCommand = cmd
                    ? cmd
                        .replace(/\{cwd\}/g, contextMenuSession.cwd || "")
                        .replace(/\{path\}/g, contextMenuSession.path)
                        .replace(/\{pi\}/g, piCmd)
                    : `${piCmd} --session ${contextMenuSession.path}`;
                  // tmux setup command (has new-session but no placeholders) → append pi command
                  if (cmd.includes("new-session") && !hasPlaceholders) {
                    const piCmd =
                      settings.terminal?.piCommandPath || piPath || "pi";
                    // Extract session id prefix (first 4 chars of UUID) for tmux session name
                    const sessionSuffix = contextMenuSession.id
                      ? contextMenuSession.id.slice(0, 4)
                      : "pi";
                    const sessionName = `pi-${sessionSuffix}`;
                    fullCommand = `/opt/homebrew/bin/tmux new-session -A -s ${sessionName} 'cd ${contextMenuSession.cwd || ""} && ${piCmd} --session ${contextMenuSession.path}'`;
                  }
                  copyText(fullCommand).catch(console.error);
                }
              : undefined
          }
          isFavorite={favoriteSessionIds.has(contextMenuSession.id)}
          onDelete={
            onDeleteSession
              ? () => {
                  setPendingDeleteSession({
                    sessions: [contextMenuSession],
                    anchorRef: deleteButtonRef,
                  });
                }
              : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {pendingDeleteSession && (
        <DeleteSessionPopover
          sessions={pendingDeleteSession.sessions}
          anchorRef={pendingDeleteSession.anchorRef}
          onConfirm={async () => {
            await onDeleteSession?.(pendingDeleteSession.sessions[0]);
            setPendingDeleteSession(null);
          }}
          onCancel={() => setPendingDeleteSession(null)}
        />
      )}
    </div>
  );
}
