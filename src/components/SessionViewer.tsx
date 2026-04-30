import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildCopyResumeCommand } from "@/utils/sessionResume";

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
import TraceView from "./trace/TraceView";

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
import { useClipboard } from "@/hooks/useClipboard";
import { saveAppSettings } from "@/utils/settingsApi";

import { getPlatformDefaults } from "./settings/types";
import type { AppSettings } from "./settings/types";
import type { SessionInfo } from "@/types";
import type { TerminalType } from "./settings/types";
import type { SessionViewerToolbarSlots } from "./session-viewer/SessionViewerToolbarTypes";

interface SessionViewerProps {
  session: SessionInfo;
  onExport: () => void;
  onConvert?: () => void;
  onRename?: () => void;
  onFork?: () => void;
  onBack?: () => void;
  onWebResume?: () => void;
  onResumeSession?: (session: SessionInfo) => Promise<void> | void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  initialEntryId?: string;
  previewMode?: boolean;
  /** Slots for custom content injection into the toolbar */
  slots?: SessionViewerToolbarSlots;
}

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 400;
const SIDEBAR_WIDTH_KEY = "pi-session-manager-sidebar-width";

function SessionViewerContent({
  session,
  onExport,
  onConvert,
  onRename,
  onFork,
  onBack,
  onWebResume,
  onResumeSession,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  resumeCommand,
  initialEntryId,
  previewMode = false,
  slots,
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
  const { getSessionSetting, updateSessionSetting, settings } = useSettings();
  const { copyText } = useClipboard();
  const collapseToolCalls = getSessionSetting('collapseToolCalls') !== false;
  const cmdFBehavior = getSessionSetting('cmdFBehavior') ?? 'inSessionSearch';
  const scrollMarkersEnabledSetting =
    getSessionSetting('scrollMarkersEnabled') ?? false;
  const timelineNavEnabledSetting =
    getSessionSetting('timelineNavEnabled') ?? false;
  const timelineNavEnabled = previewMode ? false : timelineNavEnabledSetting;
  const scrollMarkersEnabled = previewMode
    ? false
    : scrollMarkersEnabledSetting && !timelineNavEnabled;

  const { sessions: liveSessions } = usePiLiveSessions()
  const liveSession = previewMode
    ? null
    : liveSessions.find(s => s.sessionId.includes(session.id)) || null
  const isLive = previewMode ? false : Boolean(liveSession)

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
  const [traceMode, setTraceMode] = useState(false);

  const sessionDataIsAtBottomRef = useRef(true);
  const sidebarRef = useRef<HTMLElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<SessionTreeRef>(null);
  const messagesRef = useRef<SessionViewerMessagesRef>(null);

  const handleResume = useCallback(() => {
    if (onResumeSession) {
      void onResumeSession(session);
      return;
    }
    onWebResume?.();
  }, [onResumeSession, onWebResume, session]);
  const hasResumeAction = Boolean(onResumeSession || onWebResume);

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
    previewMode,
  });

  const handleToggleSidebar = useCallback(() => {
    if (previewMode) {
      return;
    }
    setShowMobileMenu(false);
    setShowSidebar((prev) => {
      const next = !prev;
      if (next && isMobile) {
        setTimeout(() => treeRef.current?.focusSearch(), 100);
      }
      return next;
    });
  }, [isMobile, previewMode]);

  const {
    renderableEntries,
    toolResultByCallId,
    stats,
    headerEntry,
    messageEntries,
  } = useSessionViewerDerivedData(entries, activeEntryId, isLive, previewMode);

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

  const handleCopyResumeCommand = useCallback(async () => {
    try {
      const command = await buildCopyResumeCommand(session, {
        piPath,
        resumeCommand,
      });
      await copyText(command);
    } catch (err) {
      console.error("Failed to copy resume command:", err);
    }
  }, [session, piPath, resumeCommand, copyText]);

  useSessionViewerHotkeys({
    enabled: !previewMode && !showSystemPromptDialog && !showMobileMenu,
    isSearchOpen,
    cmdFBehavior,
    onToggleThinking: toggleThinking,
    onToggleToolsExpanded: toggleToolsExpanded,
    onToggleSidebar: handleToggleSidebar,
    onOpenSearch: handleOpenSearch,
    onCloseSearch: handleCloseSearch,
    onNextSearchMatch: goToNextMatch,
    onPreviousSearchMatch: goToPreviousMatch,
    onCopyResumeCommand: hasResumeAction ? handleCopyResumeCommand : undefined,
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

  const handleToggleCollapseToolCalls = useCallback(() => {
    const next = !collapseToolCalls;
    updateSessionSetting('collapseToolCalls', next);
    const nextSettings: AppSettings = {
      ...settings,
      session: {
        ...settings.session,
        collapseToolCalls: next,
      },
    };
    void saveAppSettings(nextSettings).catch((err) => {
      console.error('Failed to save collapseToolCalls setting:', err);
    });
  }, [collapseToolCalls, updateSessionSetting, settings]);

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
      className={`h-full flex relative ${showToolExpandIndicator ? "" : "tool-expand-indicators-hidden"} ${previewMode ? "session-viewer-preview" : ""}`}
    >
      {!previewMode && !traceMode && (
        <SessionViewerSidebar
          showSidebar={showSidebar}
          isMobile={isMobile}
          sidebarWidth={sidebarWidth}
          isResizing={isResizing}
          entries={entries}
          sessionPath={session.path}
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
      )}

      <div
        className="flex-1 flex flex-col min-w-0 min-h-0"
        style={{
          paddingLeft: !previewMode && !traceMode && showSidebar && !isMobile ? `${sidebarWidth}px` : 0,
        }}
      >
        <SessionViewerToolbar
          isMobile={isMobile}
          title={session.name || t("session.title")}
          messageCount={messageEntries.length}
          showSidebar={previewMode ? false : showSidebar}
          showThinking={showThinking}
          toolsExpanded={toolsExpanded}
          showScrollMarkers={previewMode ? false : showScrollMarkers}
          isMobileMenuOpen={showMobileMenu}
          isScrollMarkersFeatureEnabled={previewMode ? false : scrollMarkersEnabled}
          isSearchOpen={isSearchOpen}
          previewMode={previewMode}
          slots={slots}
          onBack={onBack}
          onToggleSidebar={handleToggleSidebar}
          onToggleThinking={toggleThinking}
          onToggleToolsExpanded={toggleToolsExpanded}
          collapseToolCalls={collapseToolCalls}
          onToggleCollapseToolCalls={handleToggleCollapseToolCalls}
          onToggleScrollMarkers={toggleScrollMarkers}
          onOpenSearch={handleOpenSearch}
          onMobileMenuOpenChange={setShowMobileMenu}
          onOpenSystemPromptDialog={() => setShowSystemPromptDialog(true)}
          onScrollToTop={handleScrollToTop}
          onScrollToBottom={handleScrollToBottom}
          onToggleTraceMode={previewMode ? undefined : () => setTraceMode(prev => !prev)}
          traceModeActive={traceMode}
          onRename={onRename}
          onFork={onFork}
          onExport={onExport}
          onConvert={onConvert}
          onResume={hasResumeAction ? handleResume : undefined}
          liveSession={liveSession}
          desktopResumeButton={
            hasResumeAction ? (
              <KbdTooltip shortcut="Cmd+R">
                <OpenInTerminalButton
                  session={session}
                  terminal={terminal}
                  piPath={piPath}
                  customCommand={customCommand}
                  resumeCommand={resumeCommand}
                  onResumeSession={onResumeSession}
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
            ) : undefined
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

        {traceMode ? (
          <TraceView session={session} onClose={() => setTraceMode(false)} />
        ) : (
          <>
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
          showScrollMarkers={previewMode ? false : showScrollMarkers}
          isMobile={isMobile}
          scrollMarkers={scrollMarkers}
          activeMarkerId={activeMarkerId}
          markersPanelRef={markersPanelRef}
          onMarkerClick={setScrollTargetId}
          onPointerDown={handleMarkersPointerDown}
          onPointerMove={handleMarkersPointerMove}
          onPointerUp={handleMarkersPointerUp}
          onPointerLeave={handleMarkersPointerLeave}
          isScrollMarkersFeatureEnabled={previewMode ? false : scrollMarkersEnabled}
          isTimelineNavEnabled={previewMode ? false : timelineNavEnabled}
          previewMode={previewMode}
        />

        {!previewMode && (
          <ChatInput
            sessionId={session.id}
            isLive={isLive}
            onSent={() => {
              sessionDataIsAtBottomRef.current = true
              pendingScrollToBottomRef.current = true
              setHasNewMessages(false)
              messagesRef.current?.scrollToBottom()
            }}
          />
        )}
          </>
        )}
      </div>
      {!previewMode && (
        <SystemPromptDialog
          isOpen={showSystemPromptDialog}
          onClose={() => setShowSystemPromptDialog(false)}
          entries={entries}
          sessionPath={session.path}
        />
      )}
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
