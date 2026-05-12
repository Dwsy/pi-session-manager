import type {
  Dispatch,
  MouseEventHandler,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from "react";

import SystemPromptDialog from "@/components/messages/SystemPromptDialog";
import ChatInput from "@/components/pi-live/PiLiveChatInput";
import type { SessionTreeRef } from "@/components/session-tree/SessionTree";
import SessionViewerMessages, {
  type SessionViewerMessagesRef,
} from "@/components/session-viewer/SessionViewerMessages";
import SessionViewerSearchBar, {
  type SessionViewerSearchBarProps,
} from "@/components/session-viewer/SessionViewerSearchBar";
import SessionViewerSidebar from "@/components/session-viewer/SessionViewerSidebar";
import SessionViewerToolbar from "@/components/session-viewer/SessionViewerToolbar";
import type { SessionViewerToolbarProps } from "@/components/session-viewer/SessionViewerToolbarTypes";
import TraceView from "@/components/trace/TraceView";
import type { ScrollMarker } from "@/hooks/useSessionScrollMarkers";
import type { SessionSearchTarget } from "@/hooks/useSessionViewerInMessageSearch";
import type { LegacySessionStats, SessionEntry, SessionInfo } from "@/types";

export interface SessionViewerBodySidebarProps {
  showSidebar: boolean;
  sidebarWidth: number;
  isResizing: boolean;
  activeEntryId: string | null;
  onCloseSidebar: () => void;
  onNodeClick: (leafId: string, targetId: string) => void;
  onResizeMouseDown: MouseEventHandler<HTMLDivElement>;
  treeRef: RefObject<SessionTreeRef>;
  sidebarRef: RefObject<HTMLElement>;
  resizeHandleRef: RefObject<HTMLDivElement>;
  outlineTitle: string;
  hideSidebarTitle: string;
  contentPaddingLeft: string | number;
}

export interface SessionViewerBodyMessagesProps {
  messagesRef: RefObject<SessionViewerMessagesRef>;
  loading: boolean;
  showLoading: boolean;
  error: string | null;
  hasNewMessages: boolean;
  headerEntry: SessionEntry | undefined;
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
  sessionDataIsAtBottomRef: MutableRefObject<boolean>;
  onReachBottom: () => void;
  toolResultByCallId: Map<string, SessionEntry>;
}

export interface SessionViewerBodyScrollMarkersProps {
  showScrollMarkers: boolean;
  scrollMarkers: ScrollMarker[];
  activeMarkerId: string | null;
  markersPanelRef: RefObject<HTMLDivElement>;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerLeave: (event: ReactPointerEvent) => void;
  scrollMarkersEnabled: boolean;
}

export interface SessionViewerBodyPanelsProps {
  traceMode: boolean;
  onCloseTraceMode: () => void;
  showSystemPromptDialog: boolean;
  onCloseSystemPromptDialog: () => void;
}

export interface SessionViewerBodyProps {
  showToolExpandIndicator: boolean;
  previewMode: boolean;
  isMobile: boolean;
  session: SessionInfo;
  entries: SessionEntry[];
  toolbarProps: SessionViewerToolbarProps;
  forkedFromLabel: string;
  isSearchOpen: boolean;
  searchBarProps: SessionViewerSearchBarProps;
  sidebar: SessionViewerBodySidebarProps;
  messages: SessionViewerBodyMessagesProps;
  scrollMarkers: SessionViewerBodyScrollMarkersProps;
  panels: SessionViewerBodyPanelsProps;
  isLive: boolean;
  onChatSent: () => void;
}

export default function SessionViewerBody({
  showToolExpandIndicator,
  previewMode,
  isMobile,
  session,
  entries,
  toolbarProps,
  forkedFromLabel,
  isSearchOpen,
  searchBarProps,
  sidebar,
  messages,
  scrollMarkers,
  panels,
  isLive,
  onChatSent,
}: SessionViewerBodyProps) {
  return (
    <div
      className={`h-full flex relative ${showToolExpandIndicator ? "" : "tool-expand-indicators-hidden"} ${previewMode ? "session-viewer-preview" : ""}`}
    >
      {!previewMode && !panels.traceMode && (
        <SessionViewerSidebar
          showSidebar={sidebar.showSidebar}
          isMobile={isMobile}
          sidebarWidth={sidebar.sidebarWidth}
          isResizing={sidebar.isResizing}
          entries={entries}
          sessionPath={session.path}
          activeEntryId={sidebar.activeEntryId}
          onCloseSidebar={sidebar.onCloseSidebar}
          onNodeClick={sidebar.onNodeClick}
          onResizeMouseDown={sidebar.onResizeMouseDown}
          treeRef={sidebar.treeRef}
          sidebarRef={sidebar.sidebarRef}
          resizeHandleRef={sidebar.resizeHandleRef}
          outlineTitle={sidebar.outlineTitle}
          hideSidebarTitle={sidebar.hideSidebarTitle}
        />
      )}

      <div
        className="flex-1 flex flex-col min-w-0 min-h-0"
        style={{ paddingLeft: sidebar.contentPaddingLeft }}
      >
        <SessionViewerToolbar {...toolbarProps} />

        {session.parent_session_path && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-secondary/30 flex items-center gap-1.5">
            <span className="text-muted-foreground/60">↩️</span>
            <span>{forkedFromLabel}:</span>
            <span className="truncate max-w-[200px]" title={session.parent_session_path}>
              {session.parent_session_path.split("/").pop()?.replace(/\.jsonl$/, "") || session.parent_session_path}
            </span>
          </div>
        )}

        {isSearchOpen && <SessionViewerSearchBar {...searchBarProps} />}

        {panels.traceMode ? (
          <TraceView session={session} onClose={panels.onCloseTraceMode} />
        ) : (
          <>
            <SessionViewerMessages
              ref={messages.messagesRef}
              loading={messages.loading}
              showLoading={messages.showLoading}
              error={messages.error}
              hasNewMessages={messages.hasNewMessages}
              sessionId={messages.headerEntry?.id || session.id}
              headerTimestamp={messages.headerEntry?.timestamp || session.created}
              stats={messages.stats}
              renderableEntries={messages.renderableEntries}
              searchQuery={messages.searchQuery}
              currentSearchTarget={messages.currentSearchTarget}
              scrollTargetId={messages.scrollTargetId}
              setScrollTargetId={messages.setScrollTargetId}
              setHasNewMessages={messages.setHasNewMessages}
              streamingId={messages.streamingId}
              pendingScrollToBottomRef={messages.pendingScrollToBottomRef}
              expandedToolIds={messages.expandedToolIds}
              sessionPath={session.path}
              isAtBottomRef={messages.sessionDataIsAtBottomRef}
              onReachBottom={messages.onReachBottom}
              toolResultByCallId={messages.toolResultByCallId}
              showScrollMarkers={previewMode ? false : scrollMarkers.showScrollMarkers}
              isMobile={isMobile}
              scrollMarkers={scrollMarkers.scrollMarkers}
              activeMarkerId={scrollMarkers.activeMarkerId}
              markersPanelRef={scrollMarkers.markersPanelRef}
              onMarkerClick={messages.setScrollTargetId}
              onPointerDown={scrollMarkers.onPointerDown}
              onPointerMove={scrollMarkers.onPointerMove}
              onPointerUp={scrollMarkers.onPointerUp}
              onPointerLeave={scrollMarkers.onPointerLeave}
              isScrollMarkersFeatureEnabled={previewMode ? false : scrollMarkers.scrollMarkersEnabled}
              previewMode={previewMode}
            />

            {!previewMode && (
              <ChatInput
                sessionId={session.id}
                isLive={isLive}
                onSent={onChatSent}
              />
            )}
          </>
        )}
      </div>
      {!previewMode && (
        <SystemPromptDialog
          isOpen={panels.showSystemPromptDialog}
          onClose={panels.onCloseSystemPromptDialog}
          entries={entries}
          sessionPath={session.path}
        />
      )}
    </div>
  );
}
