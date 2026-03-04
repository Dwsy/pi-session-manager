import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import KbdTooltip from "./KbdTooltip";
import OpenInTerminalButton from "./OpenInTerminalButton";
import SystemPromptDialog from "./SystemPromptDialog";
import { type SessionTreeRef } from "./SessionTree";
import SessionViewerMessages, {
  type SessionViewerMessagesRef,
} from "./session-viewer/SessionViewerMessages";
import SessionViewerSidebar from "./session-viewer/SessionViewerSidebar";
import SessionViewerToolbar from "./session-viewer/SessionViewerToolbar";

import {
  SessionViewProvider,
  useSessionView,
} from "../contexts/SessionViewContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { useResizableSidebar } from "../hooks/useResizableSidebar";
import { useSessionScrollMarkers } from "../hooks/useSessionScrollMarkers";
import { useSessionViewerData } from "../hooks/useSessionViewerData";
import { useSessionViewerDerivedData } from "../hooks/useSessionViewerDerivedData";
import { useSessionViewerHotkeys } from "../hooks/useSessionViewerHotkeys";

import { getPlatformDefaults } from "./settings/types";
import type { SessionInfo } from "../types";
import type { TerminalType } from "./settings/types";
import "../styles/session.css";

interface SessionViewerProps {
  session: SessionInfo;
  onExport: () => void;
  onRename: () => void;
  onBack?: () => void;
  onWebResume?: () => void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  initialEntryId?: string;
}

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_WIDTH_KEY = "pi-session-manager-sidebar-width";

// Temporary debug switch: set true to disable scroll markers for perf comparison.
const DEBUG_DISABLE_SCROLL_MARKERS = false;

function SessionViewerContent({
  session,
  onExport,
  onRename,
  onBack,
  onWebResume,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  initialEntryId,
}: SessionViewerProps) {
  const { t } = useTranslation();
  const {
    showThinking,
    toggleThinking,
    showToolExpandIndicator,
    toolsExpanded,
    toggleToolsExpanded,
    expandedToolIds,
    resetToolExpansionOverrides,
  } = useSessionView();
  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(false);
  const { sidebarWidth, isResizing, handleMouseDown } = useResizableSidebar({
    storageKey: SIDEBAR_WIDTH_KEY,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    maxWidth: SIDEBAR_MAX_WIDTH,
  });
  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const sessionDataIsAtBottomRef = useRef(true);
  const sidebarRef = useRef<HTMLElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<SessionTreeRef>(null);
  const messagesRef = useRef<SessionViewerMessagesRef>(null);

  useEffect(() => {
    resetToolExpansionOverrides();
  }, [resetToolExpansionOverrides, session.path]);

  const {
    entries,
    loading,
    showLoading,
    error,
    activeEntryId,
    setActiveEntryId,
    scrollTargetId,
    setScrollTargetId,
    hasNewMessages,
    setHasNewMessages,
    pendingScrollToBottomRef,
    hasMoreHistory,
    loadMoreHistory,
  } = useSessionViewerData({
    sessionPath: session.path,
    initialEntryId,
    loadErrorMessage: t("session.loadError"),
    isAtBottomRef: sessionDataIsAtBottomRef,
  });

  const handleToggleSidebar = useCallback(() => {
    setShowMobileMenu(false);
    setShowSidebar((prev) => {
      const next = !prev;
      if (next && isMobile) {
        setTimeout(() => treeRef.current?.focusSearch(), 100);
      }
      return next;
    });
  }, [isMobile]);

  const handleToggleSidebarHotkey = useCallback(() => {
    setShowMobileMenu(false);
    setShowSidebar((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => treeRef.current?.focusSearch(), 100);
      }
      return next;
    });
  }, []);

  useSessionViewerHotkeys({
    onToggleThinking: toggleThinking,
    onToggleToolsExpanded: toggleToolsExpanded,
    onToggleSidebar: handleToggleSidebarHotkey,
  });

  const {
    renderableEntries,
    toolResultByCallId,
    stats,
    headerEntry,
    messageEntries,
  } = useSessionViewerDerivedData(entries, activeEntryId);

  const handleReachBottom = useCallback(() => {
    if (hasMoreHistory) {
      void loadMoreHistory();
    }
  }, [hasMoreHistory, loadMoreHistory]);

  const handleScrollToTop = useCallback(() => {
    messagesRef.current?.scrollToTop();
  }, []);

  const handleScrollToBottom = useCallback(() => {
    messagesRef.current?.scrollToBottom();
    setHasNewMessages(false);
  }, [setHasNewMessages]);

  const {
    markers: scrollMarkers,
    showMarkers: showScrollMarkers,
    toggleMarkers: toggleScrollMarkers,
    activeMarkerId,
    markersPanelRef,
    onPointerDown: handleMarkersPointerDown,
    onPointerMove: handleMarkersPointerMove,
    onPointerUp: handleMarkersPointerUp,
    onPointerLeave: handleMarkersPointerLeave,
  } = useSessionScrollMarkers({
    entries: renderableEntries,
    isMobile,
    enabled: !DEBUG_DISABLE_SCROLL_MARKERS,
    onSelectEntry: setScrollTargetId,
    previewFallback: t("session.userMessage", "User message"),
  });

  const handleTreeNodeClick = useCallback(
    (leafId: string, targetId: string) => {
      setActiveEntryId(leafId);
      setScrollTargetId(targetId);
    },
    [],
  );

  return (
    <div
      className={`h-full flex relative ${showToolExpandIndicator ? "" : "tool-expand-indicators-hidden"}`}
    >
      <SessionViewerSidebar
        showSidebar={showSidebar}
        isMobile={isMobile}
        sidebarWidth={sidebarWidth}
        isResizing={isResizing}
        entries={entries}
        activeEntryId={activeEntryId}
        onCloseSidebar={() => setShowSidebar(false)}
        onNodeClick={handleTreeNodeClick}
        onResizeMouseDown={handleMouseDown}
        treeRef={treeRef}
        sidebarRef={sidebarRef}
        resizeHandleRef={resizeHandleRef}
        outlineTitle={t("session.toolbar.outline", "大纲")}
        hideSidebarTitle={t("session.hideSidebar")}
      />

      <div
        className="flex-1 flex flex-col min-w-0 min-h-0"
        style={{
          paddingLeft: showSidebar && !isMobile ? `${sidebarWidth}px` : 0,
        }}
      >
        <SessionViewerToolbar
          isMobile={isMobile}
          title={session.name || t("session.title")}
          messageCount={messageEntries.length}
          showSidebar={showSidebar}
          showThinking={showThinking}
          toolsExpanded={toolsExpanded}
          showScrollMarkers={showScrollMarkers}
          isMobileMenuOpen={showMobileMenu}
          isScrollMarkersFeatureEnabled={!DEBUG_DISABLE_SCROLL_MARKERS}
          onBack={onBack}
          onToggleSidebar={handleToggleSidebar}
          onToggleThinking={toggleThinking}
          onToggleToolsExpanded={toggleToolsExpanded}
          onToggleScrollMarkers={toggleScrollMarkers}
          onMobileMenuOpenChange={setShowMobileMenu}
          onOpenSystemPromptDialog={() => setShowSystemPromptDialog(true)}
          onScrollToTop={handleScrollToTop}
          onScrollToBottom={handleScrollToBottom}
          onRename={onRename}
          onExport={onExport}
          onResume={onWebResume}
          desktopResumeButton={
            <KbdTooltip shortcut="Cmd+R">
              <OpenInTerminalButton
                session={session}
                terminal={terminal}
                piPath={piPath}
                customCommand={customCommand}
                size="sm"
                variant="ghost"
                label={t("session.resume", "恢复")}
                showLabel={true}
                className="px-3 py-1"
                onWebResume={onWebResume}
                onError={(resumeError) =>
                  console.error(
                    "[SessionViewer] Failed to open in terminal:",
                    resumeError,
                  )
                }
              />
            </KbdTooltip>
          }
        />

        <SessionViewerMessages
          ref={messagesRef}
          loading={loading}
          showLoading={showLoading}
          error={error}
          hasNewMessages={hasNewMessages}
          sessionId={headerEntry?.id || session.id}
          headerTimestamp={headerEntry?.timestamp}
          stats={stats}
          renderableEntries={renderableEntries}
          scrollTargetId={scrollTargetId}
          setScrollTargetId={setScrollTargetId}
          setHasNewMessages={setHasNewMessages}
          pendingScrollToBottomRef={pendingScrollToBottomRef}
          expandedToolIds={expandedToolIds}
          toolsExpanded={toolsExpanded}
          sessionPath={session.path}
          isAtBottomRef={sessionDataIsAtBottomRef}
          onReachBottom={handleReachBottom}
          toolResultByCallId={toolResultByCallId}
          showScrollMarkers={showScrollMarkers}
          isMobile={isMobile}
          scrollMarkers={scrollMarkers}
          activeMarkerId={activeMarkerId}
          markersPanelRef={markersPanelRef}
          onMarkerClick={setScrollTargetId}
          onPointerDown={handleMarkersPointerDown}
          onPointerMove={handleMarkersPointerMove}
          onPointerUp={handleMarkersPointerUp}
          onPointerLeave={handleMarkersPointerLeave}
          isScrollMarkersFeatureEnabled={!DEBUG_DISABLE_SCROLL_MARKERS}
        />
      </div>
      <SystemPromptDialog
        isOpen={showSystemPromptDialog}
        onClose={() => setShowSystemPromptDialog(false)}
        entries={entries}
        sessionPath={session.path}
      />
    </div>
  );
}

export default function SessionViewer(props: SessionViewerProps) {
  return (
    <SessionViewProvider>
      <SessionViewerContent {...props} />
    </SessionViewProvider>
  );
}
