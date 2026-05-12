import {
  forwardRef,
  useImperativeHandle,
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
import NewMessagesButton from "./NewMessagesButton";
import {
  SessionMessagesEmptyState,
  SessionMessagesErrorState,
  SessionMessagesLoadingState,
} from "./SessionMessagesStates";


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
  previewMode?: boolean;
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
  previewMode = false,
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
    sessionPath,
    isAtBottomRef,
    onReachBottom,
    previewMode,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  useSessionViewerSearchHighlight({
    container: messagesContainerRef.current,
    searchQuery,
    currentSearchTarget,
    scrollToEntryId,
    ensureToolExpandedForSearch,
  });

  // Expose methods
  useImperativeHandle(ref, () => ({
    scrollToTop,
    scrollToBottom,
  }));

  if (loading && !showLoading) {
    return <SessionMessagesLoadingState />;
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
      <div
        className="h-full overflow-y-auto session-viewer"
        ref={messagesContainerRef}
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