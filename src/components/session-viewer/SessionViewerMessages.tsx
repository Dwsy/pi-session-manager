import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";

import SessionHeader from "@/components/session-viewer/SessionHeader";
import SessionScrollMarkers from "@/components/session-viewer/SessionScrollMarkers";
import { useSessionView } from "@/contexts/SessionViewContext";
import type { SessionSearchTarget } from "@/hooks/useSessionViewerInMessageSearch";
import {
  SESSION_MESSAGE_ITEM_GAP,
  SESSION_PREVIEW_ITEM_GAP,
  useSessionViewerVirtualScroll,
} from "@/hooks/useSessionViewerVirtualScroll";
import { useSessionViewerSearchHighlight } from "@/hooks/useSessionViewerSearchHighlight";
import type { ScrollMarker } from "@/hooks/useSessionScrollMarkers";
import type { LegacySessionStats, SessionEntry } from "@/types";
import SessionEntryRenderer from "./SessionEntryRenderer";
import ConversationPreviewMessages from "./ConversationPreviewMessages";
import type { SessionPreviewVariant } from "./previewTypes";
import NewMessagesButton from "./NewMessagesButton";
import ScrollToBottomButton from "./ScrollToBottomButton";
import ScrollToTopButton from "./ScrollToTopButton";
import {
  SessionMessagesEmptyState,
  SessionMessagesErrorState,
} from "./SessionMessagesStates";


export interface SessionViewerMessagesRef {
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export interface SessionViewerRevealTarget {
  rowEntryId: string;
  targetEntryId: string;
  expandTool: boolean;
  highlight: boolean;
  align: "auto" | "center" | "start" | "end";
}

export interface SessionViewerMessagesProps {
  loading: boolean;
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
  sessionPath: string;
  isAtBottomRef: MutableRefObject<boolean>;
  onReachBottom?: () => void;
  toolResultByCallId: Map<string, SessionEntry>;
  externalRevealTarget: SessionViewerRevealTarget | null;
  onExternalRevealHandled: () => void;
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
  previewMode?: boolean;
  previewVariant?: SessionPreviewVariant;
}

const SessionViewerMessages = forwardRef<
  SessionViewerMessagesRef,
  SessionViewerMessagesProps
>(function SessionViewerMessages({
  loading,
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
  sessionPath,
  isAtBottomRef,
  onReachBottom,
  toolResultByCallId,
  externalRevealTarget,
  onExternalRevealHandled,
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
  previewMode = false,
  previewVariant = "conversation",
}: SessionViewerMessagesProps, ref) {
  const { t } = useTranslation();
  const { ensureToolExpandedForSearch } = useSessionView();

  const {
    messagesContainerRef,
    messagesWrapperRef,
    rowVirtualizer,
    isAtBottom,
    isAtTop,
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
    sessionPath,
    isAtBottomRef,
    onReachBottom,
    previewMode,
    handlesScrollTarget: previewVariant === "conversation",
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  // Centered scroll affordances.
  // "scroll to bottom" is revealed when the pointer enters the bottom 10% of the visible area (and we're not at bottom).
  // "scroll to top" is revealed when the pointer enters the top 10% of the visible area (and we're not at top).
  // The buttons pin themselves open on hover so they stay clickable.
  const [pointerInBottomZone, setPointerInBottomZone] = useState(false);
  const [pointerInTopZone, setPointerInTopZone] = useState(false);
  const [overScrollToBottomButton, setOverScrollToBottomButton] = useState(false);
  const [overScrollToTopButton, setOverScrollToTopButton] = useState(false);
  const hoverRafRef = useRef<number | null>(null);

  const handleContainerPointerMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const container = messagesContainerRef.current;
        if (!container) {
          setPointerInBottomZone(false);
          setPointerInTopZone(false);
          return;
        }
        const rect = container.getBoundingClientRect();
        const pointerY = event.clientY;

        const zoneHeight = rect.height * 0.1;
        const zoneTop = rect.bottom - zoneHeight;
        const zoneBottomLimit = rect.top + zoneHeight;

        setPointerInBottomZone(pointerY >= zoneTop && pointerY <= rect.bottom);
        setPointerInTopZone(pointerY >= rect.top && pointerY <= zoneBottomLimit);
      });
    },
    [],
  );

  const handleContainerPointerLeave = useCallback(() => {
    setPointerInBottomZone(false);
    setPointerInTopZone(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
      }
    };
  }, []);

  const showScrollToBottomHover =
    !isAtBottom && (pointerInBottomZone || overScrollToBottomButton);

  const showScrollToTopHover =
    !isAtTop && (pointerInTopZone || overScrollToTopButton);

  useSessionViewerSearchHighlight({
    container: messagesContainerRef.current,
    searchQuery,
    currentSearchTarget,
    scrollToEntryId,
    ensureToolExpandedForSearch,
  });

  useEffect(() => {
    if (!externalRevealTarget || !messagesContainerRef.current) {
      return;
    }

    const {
      rowEntryId,
      targetEntryId,
      expandTool,
      highlight,
      align,
    } = externalRevealTarget;

    setScrollTargetId(rowEntryId);
    if (expandTool && targetEntryId !== rowEntryId) {
      ensureToolExpandedForSearch(targetEntryId);
    }

    let animationFrameId = 0;
    let retryTimeoutId: number | null = null;
    let retryCount = 0;
    const maxRetries = 8;

    const clearHighlight = (element: HTMLElement) => {
      window.setTimeout(() => {
        element.classList.remove("highlight");
      }, 2000);
    };

    const tryRevealTarget = () => {
      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }

      if (previewVariant !== "conversation") {
        scrollToEntryId(rowEntryId, align);
      }

      const selector = `#entry-${CSS.escape(targetEntryId)}, [data-entry-id="${CSS.escape(targetEntryId)}"]`;
      const fallbackSelector = `#entry-${CSS.escape(rowEntryId)}, [data-entry-id="${CSS.escape(rowEntryId)}"]`;
      const target = container.querySelector<HTMLElement>(selector)
        ?? container.querySelector<HTMLElement>(fallbackSelector);

      if (target) {
        const block = align === "auto" ? "nearest" : align;
        target.scrollIntoView({ block, inline: "nearest" });
        if (highlight) {
          target.classList.add("highlight");
          clearHighlight(target);
        }
        onExternalRevealHandled();
        return;
      }

      if (retryCount >= maxRetries) {
        onExternalRevealHandled();
        return;
      }

      retryCount += 1;
      retryTimeoutId = window.setTimeout(() => {
        animationFrameId = requestAnimationFrame(tryRevealTarget);
      }, 50);
    };

    animationFrameId = requestAnimationFrame(tryRevealTarget);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (retryTimeoutId) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [
    ensureToolExpandedForSearch,
    externalRevealTarget,
    onExternalRevealHandled,
    previewVariant,
    scrollToEntryId,
    setScrollTargetId,
  ]);

  // Expose methods
  useImperativeHandle(ref, () => ({
    scrollToTop,
    scrollToBottom,
  }));

  // While loading, hold an empty flex-1 placeholder so:
  //   - the spinner never appears (no animation when switching sessions)
  //   - the "no messages" empty state cannot leak through before the new
  //     entries arrive
  //   - layout is preserved (the placeholder fills the same flex slot as
  //     the messages container)
  // On load completion, fall through to render the real messages list or
  // the empty state (only when the session truly has no messages).
  if (loading) {
    return <div className="flex-1" aria-hidden="true" />;
  }

  if (error) {
    return <SessionMessagesErrorState title={t("session.error")} error={error} />;
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden">
      {!isAtBottom && hasNewMessages && (
        <NewMessagesButton
          onClick={() => {
            scrollToBottom();
            setHasNewMessages(false);
          }}
          title={t("session.scrollToBottom", "Scroll to bottom")}
          label={t("session.newMessages", "New messages")}
        />
      )}
      <ScrollToTopButton
        title={t("session.scrollToTop", "Scroll to top")}
        visible={showScrollToTopHover}
        onClick={() => scrollToTop()}
        onMouseEnter={() => setOverScrollToTopButton(true)}
        onMouseLeave={() => setOverScrollToTopButton(false)}
      />
      <ScrollToBottomButton
        title={t("session.scrollToBottom", "Scroll to bottom")}
        visible={showScrollToBottomHover}
        onClick={() => scrollToBottom(true)}
        onMouseEnter={() => setOverScrollToBottomButton(true)}
        onMouseLeave={() => setOverScrollToBottomButton(false)}
      />
      <div
        className="h-full overflow-y-auto session-viewer"
        ref={messagesContainerRef}
        onMouseMove={handleContainerPointerMove}
        onMouseLeave={handleContainerPointerLeave}
      >
        <SessionHeader
          sessionId={sessionId}
          timestamp={headerTimestamp}
          stats={stats}
          previewMode={previewMode}
          sessionPath={sessionPath}
        />
        <div className="messages" ref={messagesWrapperRef}>
          {renderableEntries.length > 0 ? (
            previewVariant === "conversation" ? (
              <ConversationPreviewMessages
                entries={renderableEntries}
                toolResultByCallId={toolResultByCallId}
                searchQuery={searchQuery}
                streamingId={streamingId}
                scrollTargetId={scrollTargetId}
                setScrollTargetId={setScrollTargetId}
              />
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {virtualRows.map((virtualRow) => {
                  const entry = renderableEntries[virtualRow.index];
                  if (!entry) return null;

                  return (
                    <div
                      key={`${entry.id}:${entry.type}:${virtualRow.index}`}
                      data-index={virtualRow.index}
                      data-entry-id={entry.id}
                      ref={rowVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom:
                          virtualRow.index === renderableEntries.length - 1
                            ? 0
                            : previewMode
                              ? SESSION_PREVIEW_ITEM_GAP
                              : SESSION_MESSAGE_ITEM_GAP,
                      }}
                    >
                      <SessionEntryRenderer
                        entry={entry}
                        toolResultByCallId={toolResultByCallId}
                        searchQuery={searchQuery}
                        isStreaming={entry.id === streamingId}
                        previewMode={previewMode}
                      />
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <SessionMessagesEmptyState label={t("session.noMessages")} />
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