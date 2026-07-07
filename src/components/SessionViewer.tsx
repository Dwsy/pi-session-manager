import type { ReactNode } from "react";
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
import type { PsmSessionTreeViewRuntimeRegistration } from "@/plugins/runtime-host/types";
import type { SessionEntry, SessionInfo } from "@/types";
import type { TerminalType } from "./settings/types";
import type { SessionViewerToolbarSlots, SessionViewerLayoutSlots } from "./session-viewer/SessionViewerToolbarTypes";
import type { SessionPreviewVariant } from "./session-viewer/previewTypes";
import type {
  PsmSessionRevealOptions,
  PsmSessionToolRevealOptions,
  PsmSessionViewerController,
} from "@pi-session-manager/plugin-sdk";

interface SessionViewerProps {
  session: SessionInfo;
  onExport: () => void;
  onConvert?: () => void;
  onRename?: () => void;
  onRenameSession?: (newName: string) => void | Promise<void>;
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
  mainViewSlot?: ReactNode;
  pluginTreeViews?: PsmSessionTreeViewRuntimeRegistration[];
  onActiveEntryIdChange?: (activeEntryId: string | null) => void;
  onViewerControllerChange?: (controller: PsmSessionViewerController | null) => void;
}

interface SessionViewerRevealTarget {
  rowEntryId: string;
  targetEntryId: string;
  expandTool: boolean;
  highlight: boolean;
  align: NonNullable<PsmSessionRevealOptions["align"]>;
}

function findToolCallRowEntryId(entries: SessionEntry[], toolCallId: string): string | null {
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") {
      continue;
    }

    const hasToolCall = entry.message.content?.some(
      (item: any) => item.type === "toolCall" && (item.id === toolCallId || item.toolCallId === toolCallId),
    );
    if (hasToolCall) {
      return entry.id;
    }
  }

  return null;
}

function SessionViewerContent({
  session,
  onExport,
  onConvert,
  onRename,
  onRenameSession,
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
  mainViewSlot,
  pluginTreeViews,
  onActiveEntryIdChange,
  onViewerControllerChange,
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
    sessionPath: session.path,
    previewMode,
  });

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [externalRevealTarget, setExternalRevealTarget] = useState<SessionViewerRevealTarget | null>(null);
  const {
    showSystemPromptDialog,
    openSystemPromptDialog,
    closeSystemPromptDialog,
  } = useSessionViewerPanelController();
  const hasMainView = Boolean(mainViewSlot);

  const sessionDataIsAtBottomRef = useRef(true);
  const messagesRef = useRef<SessionViewerMessagesRef>(null);
  const renderableEntriesRef = useRef<SessionEntry[]>([]);
  const viewerControllerRef = useRef<PsmSessionViewerController | null>(null);

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
    mainViewOpen: hasMainView,
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

  renderableEntriesRef.current = renderableEntries;

  if (!viewerControllerRef.current) {
    viewerControllerRef.current = {
      revealEntry: (entryId: string, options?: PsmSessionRevealOptions) => {
        const align = options?.align ?? "center";
        const highlight = options?.highlight !== false;
        setActiveEntryId(entryId);
        setScrollTargetId(entryId);
        setExternalRevealTarget({
          rowEntryId: entryId,
          targetEntryId: entryId,
          expandTool: false,
          highlight,
          align,
        });
      },
      revealToolCall: (toolCallId: string, options?: PsmSessionToolRevealOptions) => {
        const rowEntryId = findToolCallRowEntryId(renderableEntriesRef.current, toolCallId);
        if (!rowEntryId) {
          return;
        }

        const align = options?.align ?? "center";
        const highlight = options?.highlight !== false;
        setActiveEntryId(rowEntryId);
        setScrollTargetId(rowEntryId);
        setExternalRevealTarget({
          rowEntryId,
          targetEntryId: `tool-result-${toolCallId}`,
          expandTool: options?.expand !== false,
          highlight,
          align,
        });
      },
    };
  }

  useEffect(() => {
    onActiveEntryIdChange?.(activeEntryId);
  }, [activeEntryId, onActiveEntryIdChange]);

  useEffect(() => {
    onViewerControllerChange?.(viewerControllerRef.current);
    return () => {
      onViewerControllerChange?.(null);
    };
  }, [onViewerControllerChange]);

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
    onRenameSession,
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
      mainViewSlot={mainViewSlot}
      forkedFromLabel={t("session.forkedFrom")}
      isSearchOpen={isSearchOpen}
      searchBarProps={searchBarProps}
      sidebar={{
        showSidebar,
        sidebarWidth,
        isResizing,
        activeEntryId,
        pluginViews: pluginTreeViews,
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
        externalRevealTarget,
        onExternalRevealHandled: () => setExternalRevealTarget(null),
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
