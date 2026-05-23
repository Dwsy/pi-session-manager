import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildCopyResumeCommand } from "@/utils/sessionResume";

import {
  SessionViewProvider,
  useSessionView,
} from "@/contexts/SessionViewContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSessionScrollMarkers } from "@/hooks/useSessionScrollMarkers";
import { useSessionViewerData } from "@/hooks/useSessionViewerData";
import { useSessionViewerDerivedData } from "@/hooks/useSessionViewerDerivedData";
import { useSessionViewerHotkeys } from "@/hooks/useSessionViewerHotkeys";
import { useSessionViewerSearchController } from "@/hooks/useSessionViewerSearchController";
import { useSessionViewerPanelController } from "@/hooks/useSessionViewerPanelController";
import { useSessionViewerSettingsState } from "@/hooks/useSessionViewerSettingsState";
import { useSessionViewerScrollActions } from "@/hooks/useSessionViewerScrollActions";
import { useClipboard } from "@/hooks/useClipboard";
import { useSessionViewerLiveState } from "@/hooks/useSessionViewerLiveState";
import { useSessionViewerToolbarProps } from "@/hooks/useSessionViewerToolbarProps";
import { useSessionViewerSidebarController } from "@/hooks/useSessionViewerSidebarController";

import SessionViewerBody from "./session-viewer/SessionViewerBody";
import type { SessionViewerMessagesRef } from "./session-viewer/SessionViewerMessages";
import { getPlatformDefaults } from "./settings/types";
import type { SessionInfo } from "@/types";
import type { TerminalType } from "./settings/types";
import type { SessionViewerToolbarSlots, SessionViewerLayoutSlots } from "./session-viewer/SessionViewerToolbarTypes";
import type { SessionPreviewVariant } from "./session-viewer/previewTypes";

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
  previewVariant?: SessionPreviewVariant;
  /** Slots for custom content injection into the toolbar */
  slots?: SessionViewerToolbarSlots;
  /** Layout extension slots around the main session viewer body */
  layoutSlots?: SessionViewerLayoutSlots;
  onActiveEntryIdChange?: (activeEntryId: string | null) => void;
}


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
  previewVariant = "conversation",
  slots,
  layoutSlots,
  onActiveEntryIdChange,
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
  const { copyText } = useClipboard();
  const {
    cmdFBehavior,
    scrollMarkersEnabled,
  } = useSessionViewerSettingsState({ previewMode });

  const { liveSession, isLive } = useSessionViewerLiveState({
    sessionId: session.id,
    previewMode,
  });

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const {
    showSystemPromptDialog,
    traceMode,
    openSystemPromptDialog,
    closeSystemPromptDialog,
    toggleTraceMode,
    closeTraceMode,
  } = useSessionViewerPanelController();

  const sessionDataIsAtBottomRef = useRef(true);
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


  const {
    showSidebar,
    setShowSidebar,
    sidebarWidth,
    isResizing,
    handleMouseDown,
    sidebarRef,
    resizeHandleRef,
    treeRef,
    handleToggleSidebar,
    handleTreeNodeClick,
    contentPaddingLeft,
  } = useSessionViewerSidebarController({
    isMobile,
    previewMode,
    traceMode,
    setShowMobileMenu,
    setActiveEntryId,
    setScrollTargetId,
  });

  const {
    renderableEntries,
    toolResultByCallId,
    stats,
    headerEntry,
    messageEntries,
  } = useSessionViewerDerivedData(entries, activeEntryId, isLive, previewMode);

  useEffect(() => {
    onActiveEntryIdChange?.(activeEntryId);
  }, [activeEntryId, onActiveEntryIdChange]);

  const {
    isSearchOpen,
    searchQuery,
    currentTarget,
    goToNextMatch,
    goToPreviousMatch,
    handleOpenSearch,
    handleCloseSearch,
    searchBarProps,
  } = useSessionViewerSearchController({
    renderableEntries,
    toolResultByCallId,
    showThinking,
    sessionPath: session.path,
    setShowMobileMenu,
    restoreSearchExpandedTools,
  });

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

  const {
    handleReachBottom,
    handleScrollToTop,
    handleScrollToBottom,
    handleChatSent,
  } = useSessionViewerScrollActions({
    hasMoreHistory,
    loadMoreHistory,
    pendingScrollToBottomRef,
    sessionDataIsAtBottomRef,
    messagesRef,
    setHasNewMessages,
  });

  useSessionViewerHotkeys({
    enabled: !showSystemPromptDialog && !showMobileMenu,
    isSearchOpen,
    cmdFBehavior,
    previewMode,
    onToggleThinking: toggleThinking,
    onToggleToolsExpanded: toggleToolsExpanded,
    onToggleSidebar: handleToggleSidebar,
    onOpenSearch: handleOpenSearch,
    onCloseSearch: handleCloseSearch,
    onNextSearchMatch: goToNextMatch,
    onPreviousSearchMatch: goToPreviousMatch,
    onCopyResumeCommand: hasResumeAction ? handleCopyResumeCommand : undefined,
    onResume: hasResumeAction ? handleResume : undefined,
  });


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


  const toolbarProps = useSessionViewerToolbarProps({
    isMobile,
    session,
    title: session.name || t("session.title"),
    messageCount: messageEntries.length,
    showSidebar,
    showThinking,
    toolsExpanded,
    showScrollMarkers,
    showMobileMenu,
    scrollMarkersEnabled,
    isSearchOpen,
    previewMode,
    slots,
    onBack,
    onToggleSidebar: handleToggleSidebar,
    onToggleThinking: toggleThinking,
    onToggleToolsExpanded: toggleToolsExpanded,
    onToggleScrollMarkers: toggleScrollMarkers,
    onOpenSearch: handleOpenSearch,
    onMobileMenuOpenChange: setShowMobileMenu,
    onOpenSystemPromptDialog: openSystemPromptDialog,
    onScrollToTop: handleScrollToTop,
    onScrollToBottom: handleScrollToBottom,
    onToggleTraceMode: toggleTraceMode,
    traceMode,
    onRename,
    onFork,
    onExport,
    onConvert,
    onResume: hasResumeAction ? handleResume : undefined,
    liveSession,
    terminal,
    piPath,
    customCommand,
    resumeCommand,
    onResumeSession,
    onWebResume,
    resumeLabel: t("session.resume", "Resume"),
  });

  return (
    <SessionViewerBody
      showToolExpandIndicator={showToolExpandIndicator}
      previewMode={previewMode}
      previewVariant={previewVariant}
      isMobile={isMobile}
      session={session}
      entries={entries}
      toolbarProps={toolbarProps}
      layoutSlots={layoutSlots}
      forkedFromLabel={t("session.forkedFrom")}
      isSearchOpen={isSearchOpen}
      searchBarProps={searchBarProps}
      sidebar={{
        showSidebar,
        sidebarWidth,
        isResizing,
        activeEntryId,
        onCloseSidebar: () => setShowSidebar(false),
        onNodeClick: handleTreeNodeClick,
        onResizeMouseDown: handleMouseDown,
        treeRef,
        sidebarRef,
        resizeHandleRef,
        outlineTitle: t("session.toolbar.outline", "Outline"),
        hideSidebarTitle: t("session.hideSidebar"),
        contentPaddingLeft,
      }}
      messages={{
        messagesRef,
        loading,
        showLoading,
        error,
        hasNewMessages,
        headerEntry,
        stats,
        renderableEntries,
        searchQuery,
        currentSearchTarget: currentTarget,
        scrollTargetId,
        setScrollTargetId,
        setHasNewMessages,
        streamingId,
        pendingScrollToBottomRef,
        expandedToolIds,
        sessionDataIsAtBottomRef,
        onReachBottom: handleReachBottom,
        toolResultByCallId,
      }}
      scrollMarkers={{
        showScrollMarkers,
        scrollMarkers,
        activeMarkerId,
        markersPanelRef,
        onPointerDown: handleMarkersPointerDown,
        onPointerMove: handleMarkersPointerMove,
        onPointerUp: handleMarkersPointerUp,
        onPointerLeave: handleMarkersPointerLeave,
        scrollMarkersEnabled,
      }}
      panels={{
        traceMode,
        onCloseTraceMode: closeTraceMode,
        showSystemPromptDialog,
        onCloseSystemPromptDialog: closeSystemPromptDialog,
      }}
      isLive={isLive}
      onChatSent={handleChatSent}
    />
  );
}

export default function SessionViewer(props: SessionViewerProps) {
  return (
    <SessionViewProvider>
      <SessionViewerContent {...props} />
    </SessionViewProvider>
  );
}
