import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import SessionHeader from "../SessionHeader";
import SessionScrollMarkers from "../SessionScrollMarkers";
import { useSessionView } from "../../contexts/SessionViewContext";
import type { SessionSearchTarget } from "../../hooks/useSessionViewerInMessageSearch";
import { useSessionViewerVirtualScroll } from "../../hooks/useSessionViewerVirtualScroll";
import type { ScrollMarker } from "../../hooks/useSessionScrollMarkers";
import type { LegacySessionStats, SessionEntry } from "../../types";
import SessionEntryRenderer from "./SessionEntryRenderer";

const MESSAGE_ITEM_GAP = 16;
const SEARCH_MATCH_RETRY_COUNT = 8;
const SEARCH_MATCH_RETRY_DELAY_MS = 50;

export interface SessionViewerMessagesRef {
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export interface SessionViewerMessagesProps {
  loading: boolean;
  showLoading: boolean;
  error: string | null;
  hasNewMessages: boolean;
  sessionId: string;
  headerTimestamp?: string;
  stats: LegacySessionStats;
  renderableEntries: SessionEntry[];
  searchQuery: string;
  currentSearchTarget: SessionSearchTarget | null;
  scrollTargetId: string | null;
  setScrollTargetId: Dispatch<SetStateAction<string | null>>;
  setHasNewMessages: Dispatch<SetStateAction<boolean>>;
  streamingId: string | null;
  pendingScrollToBottomRef: MutableRefObject<boolean>;
  expandedToolIds: Set<string>;
  toolsExpanded: boolean;
  sessionPath: string;
  isAtBottomRef: MutableRefObject<boolean>;
  onReachBottom?: () => void;
  toolResultByCallId: Map<string, SessionEntry>;
  showScrollMarkers: boolean;
  isMobile: boolean;
  scrollMarkers: ScrollMarker[];
  activeMarkerId: string | null;
  markersPanelRef: RefObject<HTMLDivElement>;
  onMarkerClick: (entryId: string) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerLeave: (event: ReactPointerEvent) => void;
  isScrollMarkersFeatureEnabled: boolean;
}

const SessionViewerMessages = forwardRef<
  SessionViewerMessagesRef,
  SessionViewerMessagesProps
>(function SessionViewerMessages({
  loading,
  showLoading,
  error,
  hasNewMessages,
  sessionId,
  headerTimestamp,
  stats,
  renderableEntries,
  searchQuery,
  currentSearchTarget,
  scrollTargetId,
  setScrollTargetId,
  setHasNewMessages,
  streamingId,
  pendingScrollToBottomRef,
  expandedToolIds,
  toolsExpanded,
  sessionPath,
  isAtBottomRef,
  onReachBottom,
  toolResultByCallId,
  showScrollMarkers,
  isMobile,
  scrollMarkers,
  activeMarkerId,
  markersPanelRef,
  onMarkerClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  isScrollMarkersFeatureEnabled,
}: SessionViewerMessagesProps, ref) {
  const { t } = useTranslation();
  const { ensureToolExpandedForSearch } = useSessionView();
  const {
    messagesContainerRef,
    messagesWrapperRef,
    rowVirtualizer,
    isAtBottom,
    scrollToTop,
    scrollToBottom,
    scrollToEntryId,
  } = useSessionViewerVirtualScroll({
    renderableEntries,
    loading,
    error,
    scrollTargetId,
    setScrollTargetId,
    setHasNewMessages,
    pendingScrollToBottomRef,
    expandedToolIds,
    toolsExpanded,
    sessionPath,
    isAtBottomRef,
    onReachBottom,
  });

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const clearCurrentHighlight = () => {
      container
        .querySelectorAll<HTMLElement>(".search-highlight.current")
        .forEach((element) => element.classList.remove("current"));
    };

    clearCurrentHighlight();

    if (!searchQuery.trim() || !currentSearchTarget) {
      return;
    }

    scrollToEntryId(currentSearchTarget.rowEntryId, "center");
    if (currentSearchTarget.matchElementId !== currentSearchTarget.rowEntryId) {
      ensureToolExpandedForSearch(currentSearchTarget.matchElementId);
    }

    let animationFrameId = 0;
    let retryTimeoutId: number | null = null;
    let retryCount = 0;

    const tryActivateCurrentMatch = () => {
      const entryElement = container.querySelector<HTMLElement>(
        `#entry-${currentSearchTarget.matchElementId}`,
      );
      const highlights = entryElement?.querySelectorAll<HTMLElement>(
        ".search-highlight",
      );
      const currentHighlight = highlights?.[
        currentSearchTarget.occurrenceIndexInElement
      ];

      if (currentHighlight) {
        clearCurrentHighlight();
        currentHighlight.classList.add("current");
        currentHighlight.scrollIntoView({
          block: "center",
          inline: "nearest",
        });
        return;
      }

      if (retryCount >= SEARCH_MATCH_RETRY_COUNT) {
        return;
      }

      retryCount += 1;
      retryTimeoutId = window.setTimeout(() => {
        animationFrameId = requestAnimationFrame(tryActivateCurrentMatch);
      }, SEARCH_MATCH_RETRY_DELAY_MS);
    };

    animationFrameId = requestAnimationFrame(tryActivateCurrentMatch);

    return () => {
      clearCurrentHighlight();
      cancelAnimationFrame(animationFrameId);
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [
    currentSearchTarget,
    messagesContainerRef,
    renderableEntries,
    searchQuery,
    scrollToEntryId,
    ensureToolExpandedForSearch,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop,
      scrollToBottom: () => {
        scrollToBottom();
      },
    }),
    [scrollToBottom, scrollToTop],
  );

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (showLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("session.loading")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <p className="mb-2">{t("session.error")}</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden">
      {!isAtBottom && hasNewMessages && (
        <button
          onClick={() => {
            scrollToBottom();
            setHasNewMessages(false);
          }}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-secondary hover:bg-secondary-hover text-xs text-foreground px-3 py-2 shadow-lg transition-colors"
          title={t("session.scrollToBottom", "滚动到底部")}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {t("session.newMessages", "有新message")}
        </button>
      )}
      <div
        className="h-full overflow-y-auto session-viewer"
        ref={messagesContainerRef}
      >
        <SessionHeader
          sessionId={sessionId}
          timestamp={headerTimestamp}
          stats={stats}
        />
        <div className="messages" ref={messagesWrapperRef}>
          {renderableEntries.length > 0 ? (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {virtualRows.map((virtualRow) => {
                const entry = renderableEntries[virtualRow.index];
                if (!entry) return null;
                return (
                  <div
                    key={entry.id}
                    data-index={virtualRow.index}
                    data-entry-id={entry.id}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom:
                        virtualRow.index === renderableEntries.length - 1
                          ? 0
                          : MESSAGE_ITEM_GAP,
                    }}
                  >
                    <SessionEntryRenderer
                      entry={entry}
                      toolResultByCallId={toolResultByCallId}
                      searchQuery={searchQuery}
                      isStreaming={entry.id === streamingId}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">{t("session.noMessages")}</div>
          )}
        </div>
      </div>
      {isScrollMarkersFeatureEnabled && (
        <SessionScrollMarkers
          markers={scrollMarkers}
          activeMarkerId={activeMarkerId}
          isMobile={isMobile}
          show={showScrollMarkers}
          panelRef={markersPanelRef}
          onMarkerClick={onMarkerClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
      )}
    </div>
  );
});

SessionViewerMessages.displayName = "SessionViewerMessages";

export default SessionViewerMessages;
