import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import KbdTooltip from "./ui/KbdTooltip";
import OpenInTerminalButton from "./OpenInTerminalButton";
import ChatInput from "./pi-live/PiLiveChatInput";
import SystemPromptDialog from "./messages/SystemPromptDialog";
import { type SessionTreeRef } from "./session-tree/SessionTree";
import SessionViewerMessages, {
  type SessionViewerMessagesRef,
} from "./session-viewer/SessionViewerMessages";
import SessionViewerSearchBar from "./session-viewer/SessionViewerSearchBar";
import SessionViewerSidebar from "./session-viewer/SessionViewerSidebar";
import SessionViewerToolbar from "./session-viewer/SessionViewerToolbar";

import {
  SessionViewProvider,
  useSessionView,
} from "@/contexts/SessionViewContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";
import { useSessionScrollMarkers } from "@/hooks/useSessionScrollMarkers";
import { useSessionViewerData } from "@/hooks/useSessionViewerData";
import { useSessionViewerDerivedData } from "@/hooks/useSessionViewerDerivedData";
import { useSessionViewerHotkeys } from "@/hooks/useSessionViewerHotkeys";
import { useSessionViewerInMessageSearch } from "@/hooks/useSessionViewerInMessageSearch";
import { useSettings } from "@/hooks/useSettings";
import { usePiLiveSessions } from "@/hooks/usePiLiveSessions";

import { getPlatformDefaults } from "./settings/types";
import type { SessionInfo } from "@/types";
import type { TerminalType } from "./settings/types";

interface SessionViewerProps {
  session: SessionInfo;
  onExport: () => void;
  onRename: () => void;
  onFork?: () => void;
  onBack?: () => void;
  onWebResume?: () => void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  initialEntryId?: string;
}

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_WIDTH_KEY = "pi-session-manager-sidebar-width";

function SessionViewerContent({
  session,
  onExport,
  onRename,
  onFork,
  onBack,
  onWebResume,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  resumeCommand,
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
    restoreSearchExpandedTools,
  } = useSessionView();
  const isMobile = useIsMobile();
  const { getSessionSetting } = useSettings();
  const cmdFBehavior = getSessionSetting('cmdFBehavior') ?? 'inSessionSearch';
  const scrollMarkersEnabled = getSessionSetting('scrollMarkersEnabled') ?? true;

  const { sessions: liveSessions } = usePiLiveSessions()
  const liveSession = liveSessions.find(s => s.session_id.includes(session.id)) || null
  const isLive = Boolean(liveSession)

  const [showSidebar, setShowSidebar] = useState(false);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
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
    streamingId,
    pendingScrollToBottomRef,
    hasMoreHistory,
    loadMoreHistory,
  } = useSessionViewerData({
    sessionPath: session.path,
    initialEntryId,
    loadErrorMessage: t("session.loadError"),
    isAtBottomRef: sessionDataIsAtBottomRef,
    isLive,
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

  const {
    renderableEntries,
    toolResultByCallId,
    stats,
    headerEntry,
    messageEntries,
  } = useSessionViewerDerivedData(entries, activeEntryId, isLive);

  const {
    isSearchOpen,
    searchQuery,
    searchScope,
    totalMatches,
    currentMatchNumber,
    currentTarget,
    openSearch,
    closeSearch,
    setSearchQuery,
    setSearchScope,
    goToNextMatch,
    goToPreviousMatch,
  } = useSessionViewerInMessageSearch({
    renderableEntries,
    toolResultByCallId,
    showThinking,
    sessionPath: session.path,
  });

  const handleOpenSearch = useCallback(() => {
    setShowMobileMenu(false);
    openSearch();
    setSearchFocusKey((value) => value + 1);
  }, [openSearch]);

  const handleCloseSearch = useCallback(() => {
    restoreSearchExpandedTools();
    closeSearch();
  }, [closeSearch, restoreSearchExpandedTools]);

  useSessionViewerHotkeys({
    enabled: !showSystemPromptDialog && !showMobileMenu,
    isSearchOpen,
    cmdFBehavior,
    onToggleThinking: toggleThinking,
    onToggleToolsExpanded: toggleToolsExpanded,
    onToggleSidebar: handleToggleSidebar,
    onOpenSearch: handleOpenSearch,
    onCloseSearch: handleCloseSearch,
    onNextSearchMatch: goToNextMatch,
    onPreviousSearchMatch: goToPreviousMatch,
  });

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
    enabled: scrollMarkersEnabled,
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
        outlineTitle={t("session.toolbar.outline", "Outline")}
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
          isScrollMarkersFeatureEnabled={scrollMarkersEnabled}
          isSearchOpen={isSearchOpen}
          onBack={onBack}
          onToggleSidebar={handleToggleSidebar}
          onToggleThinking={toggleThinking}
          onToggleToolsExpanded={toggleToolsExpanded}
          onToggleScrollMarkers={toggleScrollMarkers}
          onOpenSearch={handleOpenSearch}
          onMobileMenuOpenChange={setShowMobileMenu}
          onOpenSystemPromptDialog={() => setShowSystemPromptDialog(true)}
          onScrollToTop={handleScrollToTop}
          onScrollToBottom={handleScrollToBottom}
          onRename={onRename}
          onFork={onFork}
          onExport={onExport}
          onResume={onWebResume}
          liveSession={liveSession}
          desktopResumeButton={
            <KbdTooltip shortcut="Cmd+R">
              <OpenInTerminalButton
                session={session}
                terminal={terminal}
                piPath={piPath}
                customCommand={customCommand}
                resumeCommand={resumeCommand}
                size="sm"
                variant="ghost"
                label={t("session.resume", "Resume")}
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

        {session.parent_session_path && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-secondary/30 flex items-center gap-1.5">
            <span className="text-muted-foreground/60">↩️</span>
            <span>{t("session.forkedFrom")}:</span>
            <span className="truncate max-w-[200px]" title={session.parent_session_path}>
              {session.parent_session_path.split("/").pop()?.replace(/\.jsonl$/, "") || session.parent_session_path}
            </span>
          </div>
        )}

        {isSearchOpen && (
          <SessionViewerSearchBar
            searchQuery={searchQuery}
            searchScope={searchScope}
            totalMatches={totalMatches}
            currentMatchNumber={currentMatchNumber}
            focusKey={searchFocusKey}
            onSearchChange={setSearchQuery}
            onSearchScopeChange={setSearchScope}
            onPrevious={goToPreviousMatch}
            onNext={goToNextMatch}
            onClose={handleCloseSearch}
          />
        )}

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
          searchQuery={searchQuery}
          currentSearchTarget={currentTarget}
          scrollTargetId={scrollTargetId}
          setScrollTargetId={setScrollTargetId}
          setHasNewMessages={setHasNewMessages}
          streamingId={streamingId}
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
          isScrollMarkersFeatureEnabled={scrollMarkersEnabled}
        />

        <ChatInput
          sessionId={session.id}
          isLive={isLive}
          onSent={() => setHasNewMessages(false)}
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
