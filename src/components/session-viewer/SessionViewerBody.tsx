import type {
  Dispatch,
  KeyboardEventHandler,
  MouseEventHandler,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";

import { CornerDownLeft } from "lucide-react";

import SystemPromptDialog from "@/components/messages/SystemPromptDialog";
import ChatInput from "@/components/pi-live/PiLiveChatInput";
import type { SessionTreeRef } from "@/components/session-tree/SessionTree";
import SessionViewerMessages, {
  type SessionViewerMessagesRef,
  type SessionViewerRevealTarget,
} from "@/components/session-viewer/SessionViewerMessages";
import SessionViewerSearchBar, {
  type SessionViewerSearchBarProps,
} from "@/components/session-viewer/SessionViewerSearchBar";
import SessionViewerSidebar from "@/components/session-viewer/SessionViewerSidebar";
import SessionViewerToolbar from "@/components/session-viewer/SessionViewerToolbar";
import type { SessionViewerToolbarProps, SessionViewerLayoutSlots } from "@/components/session-viewer/SessionViewerToolbarTypes";
import type { SessionPreviewVariant } from "@/components/session-viewer/previewTypes";
import type { ScrollMarker } from "@/hooks/useSessionScrollMarkers";
import { useDeferredPresence } from "@/hooks/useDeferredPresence";
import type { PsmSessionTreeViewRuntimeRegistration } from "@/plugins/runtime-host/types";
import type { SessionSearchTarget } from "@/hooks/useSessionViewerInMessageSearch";
import type { LegacySessionStats, SessionEntry, SessionInfo } from "@/types";
import { getPathBasename, stripJsonlExt } from "@/utils/path";

export interface SessionViewerBodySidebarProps {
  showSidebar: boolean;
  sidebarWidth: number;
  sidebarMinWidth: number;
  sidebarMaxWidth: number;
  isResizing: boolean;
  activeEntryId: string | null;
  hasMoreHistory?: boolean;
  pluginViews?: PsmSessionTreeViewRuntimeRegistration[];
  onCloseSidebar: () => void;
  onNodeClick: (leafId: string, targetId: string) => void;
  onResizeMouseDown: MouseEventHandler<HTMLDivElement>;
  onResizeKeyDown: KeyboardEventHandler<HTMLDivElement>;
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
  externalRevealTarget: SessionViewerRevealTarget | null;
  onExternalRevealHandled: () => void;
}

export interface SessionViewerBodyScrollMarkersProps {
  showScrollMarkers: boolean;
  scrollMarkers: ScrollMarker[];
  activeMarkerId: string | null;
  markersPanelRef: RefObject<HTMLDivElement>;
  scrollContainerRef: RefObject<HTMLDivElement>;
  scrollContentRef: RefObject<HTMLDivElement>;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerLeave: (event: ReactPointerEvent) => void;
  scrollMarkersEnabled: boolean;
}

export interface SessionViewerBodyPanelsProps {
  showSystemPromptDialog: boolean;
  onCloseSystemPromptDialog: () => void;
}

export interface SessionViewerBodyProps {
  showToolExpandIndicator: boolean;
  previewMode: boolean;
  previewVariant: SessionPreviewVariant;
  isMobile: boolean;
  session: SessionInfo;
  entries: SessionEntry[];
  toolbarProps: SessionViewerToolbarProps;
  layoutSlots?: SessionViewerLayoutSlots;
  mainViewSlot?: ReactNode;
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
  previewVariant,
  isMobile,
  session,
  entries,
  toolbarProps,
  layoutSlots,
  mainViewSlot,
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
  const {
    scrollContainerRef,
    scrollContentRef,
  } = scrollMarkers;
  const shouldShowSidebar = !previewMode && sidebar.showSidebar;
  const shouldMountSidebar = useDeferredPresence(shouldShowSidebar);
  const sidebarNode = shouldMountSidebar ? (
    <SessionViewerSidebar
      showSidebar={shouldMountSidebar}
      open={shouldShowSidebar}
      isMobile={isMobile}
      placement={isMobile ? "overlay" : "embedded"}
      sidebarWidth={sidebar.sidebarWidth}
      sidebarMinWidth={sidebar.sidebarMinWidth}
      sidebarMaxWidth={sidebar.sidebarMaxWidth}
      isResizing={sidebar.isResizing}
      entries={entries}
      sessionPath={session.path}
      pluginViews={sidebar.pluginViews}
      activeEntryId={sidebar.activeEntryId}
      hasMoreHistory={sidebar.hasMoreHistory ?? false}
      onCloseSidebar={sidebar.onCloseSidebar}
      onNodeClick={sidebar.onNodeClick}
      onResizeMouseDown={sidebar.onResizeMouseDown}
      onResizeKeyDown={sidebar.onResizeKeyDown}
      treeRef={sidebar.treeRef}
      sidebarRef={sidebar.sidebarRef}
      resizeHandleRef={sidebar.resizeHandleRef}
      outlineTitle={sidebar.outlineTitle}
      hideSidebarTitle={sidebar.hideSidebarTitle}
    />
  ) : null;

  return (
    <div
      className={`h-full flex relative ${showToolExpandIndicator ? "" : "tool-expand-indicators-hidden"} ${previewMode ? "session-viewer-preview" : ""}`}
    >
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {layoutSlots?.top}
        <SessionViewerToolbar {...toolbarProps} />

        {session.parent_session_path && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-secondary/30 flex items-center gap-1.5">
            <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
            <span>{forkedFromLabel}:</span>
            <span className="truncate max-w-[200px]" title={session.parent_session_path}>
              {stripJsonlExt(getPathBasename(session.parent_session_path)) || session.parent_session_path}
            </span>
          </div>
        )}

        {isSearchOpen && <SessionViewerSearchBar {...searchBarProps} />}

        <div className="session-viewer-stage flex min-h-0 flex-1 min-w-0">
          {sidebarNode}
          {layoutSlots?.left}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {mainViewSlot ? (
              mainViewSlot
            ) : (
              <>
                <SessionViewerMessages
                  ref={messages.messagesRef}
                  loading={messages.loading}
                  error={messages.error}
                  hasNewMessages={messages.hasNewMessages}
                  session={session}
                  timestamp={messages.headerEntry?.timestamp || session.created}
                  stats={messages.stats}
                  isLive={isLive}
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
                  externalRevealTarget={messages.externalRevealTarget}
                  onExternalRevealHandled={messages.onExternalRevealHandled}
                  showScrollMarkers={previewMode ? false : scrollMarkers.showScrollMarkers}
                  isMobile={isMobile}
                  scrollMarkers={scrollMarkers.scrollMarkers}
                  activeMarkerId={scrollMarkers.activeMarkerId}
                  markersPanelRef={scrollMarkers.markersPanelRef}
                  scrollContainerRef={scrollContainerRef}
                  scrollContentRef={scrollContentRef}
                  onMarkerClick={messages.setScrollTargetId}
                  onPointerDown={scrollMarkers.onPointerDown}
                  onPointerMove={scrollMarkers.onPointerMove}
                  onPointerUp={scrollMarkers.onPointerUp}
                  onPointerLeave={scrollMarkers.onPointerLeave}
                  isScrollMarkersFeatureEnabled={previewMode ? false : scrollMarkers.scrollMarkersEnabled}
                  previewMode={previewMode}
                  previewVariant={previewVariant}
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
          {layoutSlots?.right}
        </div>
        {layoutSlots?.bottom}
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
