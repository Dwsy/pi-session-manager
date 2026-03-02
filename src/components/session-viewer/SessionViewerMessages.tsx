import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import SessionHeader from "../SessionHeader";
import SessionScrollMarkers from "../SessionScrollMarkers";
import type { ScrollMarker } from "../../hooks/useSessionScrollMarkers";
import type { LegacySessionStats, SessionEntry } from "../../types";
import SessionEntryRenderer from "./SessionEntryRenderer";

const MESSAGE_ITEM_GAP = 16;

export interface SessionViewerMessagesProps {
  showLoading: boolean;
  error: string | null;
  isAtBottom: boolean;
  hasNewMessages: boolean;
  onNewMessagesClick: () => void;
  sessionId: string;
  headerTimestamp?: string;
  stats: LegacySessionStats;
  renderableEntries: SessionEntry[];
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  messagesContainerRef: RefObject<HTMLDivElement>;
  messagesWrapperRef: RefObject<HTMLDivElement>;
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

export default function SessionViewerMessages({
  showLoading,
  error,
  isAtBottom,
  hasNewMessages,
  onNewMessagesClick,
  sessionId,
  headerTimestamp,
  stats,
  renderableEntries,
  rowVirtualizer,
  messagesContainerRef,
  messagesWrapperRef,
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
}: SessionViewerMessagesProps) {
  const { t } = useTranslation();

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
          onClick={onNewMessagesClick}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-secondary hover:bg-secondary-hover text-xs text-foreground px-3 py-2 shadow-lg transition-colors"
          title={t("session.scrollToBottom", "滚动到底部")}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {t("session.newMessages", "有新消息")}
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
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
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
}
