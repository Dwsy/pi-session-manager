import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { SessionInfo, FavoriteItem, Tag } from "../types";
import { CheckSquare2, Search, Square, Star, Tags, Trash2 } from "lucide-react";
import { SessionListSkeleton } from "./Skeleton";
import OpenInBrowserButton from "./OpenInBrowserButton";
import OpenInTerminalButton from "./OpenInTerminalButton";
import { SessionBadge } from "./SessionBadge";
import TagBadge from "./TagBadge";
import TagPicker from "./TagPicker";
import SessionContextMenu from "./SessionContextMenu";
import { getSessionSourceTag } from "../utils/session";
import { formatDirectory, formatShortTime } from "../utils/sessionDisplay";
import type { TerminalType } from "./settings/types";
import { getPlatformDefaults } from "./settings/types";
import { invoke, isTauri } from "../transport";
import { useIsMobile } from "../hooks/useIsMobile";

const LOAD_BATCH_SIZE = 100;

interface SessionListProps {
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  onSelectSession: (session: SessionInfo) => void;
  onDeleteSession?: (session: SessionInfo) => void;
  onDeleteSessions?: (sessions: SessionInfo[]) => void;
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  searchQuery?: string;
  getBadgeType?: (sessionId: string) => "new" | "updated" | null;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
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
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  onDeleteSessions,
  loading,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  getBadgeType,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  scrollParentRef,
  favorites = [],
  onToggleFavorite,
  showDirectory = true,
  tags = [],
  getTagsForSession,
  onToggleTag,
  onCreateTag,
}: SessionListProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const masonryContainerRef = useRef<HTMLDivElement>(null);
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
  const totalBatches = Math.ceil(sessions.length / LOAD_BATCH_SIZE);
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
  const allSessionsSelected =
    sessions.length > 0 && selectedSessionIds.size === sessions.length;
  const rowVirtualizer = useVirtualizer({
    count: totalBatches,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => Math.ceil(LOAD_BATCH_SIZE / Math.max(1, columnCount)) * 94,
    overscan: 2,
  });

  useEffect(() => {
    if (isMobile) {
      setColumnCount(1);
      return;
    }

    const container = masonryContainerRef.current;
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
  }, [columnCount, rowVirtualizer, sessions.length]);
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    setSelectedSessionIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const liveIds = new Set(sessions.map((session) => session.id));
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

    setIsSelectionMode(false);
    setSelectedSessionIds(new Set());
  }, [onDeleteSessions]);

  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    setContextMenu(null);
    setTagPickerSessionId(null);
  }, [isSelectionMode]);

  useEffect(() => {
    if (!hasMore || !onLoadMore || loadingMore || totalBatches === 0) {
      return;
    }

    const lastVisibleRow = virtualRows[virtualRows.length - 1];
    if (!lastVisibleRow) {
      return;
    }

    const prefetchThreshold = Math.max(0, totalBatches - 2);
    if (lastVisibleRow.index >= prefetchThreshold) {
      void onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore, totalBatches, virtualRows]);

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
      {onDeleteSessions && !isSelectionMode && (
        <div className="pointer-events-none absolute right-2 top-2 z-20">
          <button
            type="button"
            onClick={() => setIsSelectionMode(true)}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-background/70 text-muted-foreground/80 backdrop-blur motion-color motion-press focus-ring hover:text-foreground"
            aria-label={t("session.list.selectMode", { defaultValue: "Select mode" })}
            title={t("session.list.selectMode", { defaultValue: "Select mode" })}
          >
            <CheckSquare2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {onDeleteSessions && isSelectionMode && (
        <div className="sticky top-0 z-20 border-b border-border/40 bg-background/95 px-2 pb-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/40 px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground">
              {t("session.list.selectedCount", {
                count: selectedSessionIds.size,
                defaultValue: "{{count}} selected",
              })}
            </div>
            <div className="flex items-center gap-1.5">
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
                  ? t("common.clear", { defaultValue: "Clear" })
                  : t("common.selectAll", { defaultValue: "Select all" })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedSessionIds(new Set());
                }}
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground motion-color motion-press focus-ring"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={selectedSessions.length === 0}
                onClick={() => {
                  onDeleteSessions(selectedSessions);
                  setIsSelectionMode(false);
                  setSelectedSessionIds(new Set());
                }}
                className="rounded bg-red-600 px-2 py-1 text-[11px] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 motion-color motion-press focus-ring"
              >
                {t("session.list.deleteSelected", {
                  count: selectedSessions.length,
                  defaultValue: "Delete ({{count}})",
                })}
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={masonryContainerRef} className="relative w-full">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {virtualRows.map((virtualRow) => {
            const startIndex = virtualRow.index * LOAD_BATCH_SIZE;
            const batchSessions = sessions.slice(
              startIndex,
              startIndex + LOAD_BATCH_SIZE,
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
                  className="px-2 py-2 motion-opacity"
                  style={{ columnCount, columnGap: "10px" }}
                >
                  {batchSessions.map((session) => {
                    const isFavorite = favoriteSessionIds.has(session.id);
                    const updatedLabel = formatShortTime(session.modified, t);
                    const isSelected = isSelectionMode
                      ? selectedSessionIds.has(session.id)
                      : selectedSession?.id === session.id;
                    const hasPreview =
                      session.last_message || (session.first_message && !session.name);
                    const sourceTag = getSessionSourceTag(session.path);
                    const sessionTags = getTagsForSession
                      ? getTagsForSession(session.id)
                      : [];
                    const badgeType = getBadgeType ? getBadgeType(session.id) : null;

                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          if (isSelectionMode) {
                            setSelectedSessionIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(session.id)) {
                                next.delete(session.id);
                              } else {
                                next.add(session.id);
                              }
                              return next;
                            });
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
                        className={`relative mb-2 break-inside-avoid px-3 py-2.5 cursor-pointer motion-surface motion-color group rounded-lg border ${
                          isSelected
                            ? "border-transparent bg-surface/60"
                            : "border-transparent hover:bg-surface/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {isSelectionMode && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedSessionIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(session.id)) {
                                      next.delete(session.id);
                                    } else {
                                      next.add(session.id);
                                    }
                                    return next;
                                  });
                                }}
                                className="mt-0.5 text-muted-foreground/70 hover:text-foreground motion-color motion-press focus-ring rounded"
                                aria-label={t("session.list.toggleSelection", {
                                  defaultValue: "Toggle selection",
                                })}
                              >
                                {isSelected ? (
                                  <CheckSquare2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Square className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <h3 className="font-medium text-[13px] sm:text-sm text-foreground leading-tight line-clamp-1 flex-1 min-w-0">
                              {session.name ||
                                session.first_message ||
                                t("session.list.untitled")}
                            </h3>
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
                            <span className="px-1.5 py-0.5 rounded bg-muted/40 text-[9px] sm:text-[10px] tabular-nums font-medium text-muted-foreground flex-shrink-0">
                              {session.message_count}
                            </span>

                            {sourceTag && (
                              <span className="px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10 text-[9px] sm:text-[10px] text-blue-500/90 font-medium flex-shrink-0 flex items-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 mr-1"></div>
                                {sourceTag}
                              </span>
                            )}

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
                                size="sm"
                                variant="ghost"
                                onError={(error) =>
                                  console.error("Failed to open in terminal:", error)
                                }
                              />
                            )}
                            {!isSelectionMode && (
                              <OpenInBrowserButton
                                session={session}
                                size="sm"
                                variant="ghost"
                                onError={(error) =>
                                  console.error("Failed to open in browser:", error)
                                }
                              />
                            )}
                            {!isSelectionMode && onDeleteSession && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(session);
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
            const assigned = tagPickerSessionTags.some((tag) => tag.id === tagId);
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
            isTauri()
              ? () => {
                  invoke("open_session_in_terminal", {
                    path: contextMenuSession.path,
                    cwd: contextMenuSession.cwd,
                    terminal: terminal === "custom" ? customCommand : terminal,
                    pi_path: piPath || null,
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
          isFavorite={favoriteSessionIds.has(contextMenuSession.id)}
          onDelete={
            onDeleteSession ? () => onDeleteSession(contextMenuSession) : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
