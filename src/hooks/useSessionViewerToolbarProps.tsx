import type { Dispatch, SetStateAction } from "react";

import KbdTooltip from "@/components/ui/KbdTooltip";
import OpenInTerminalButton from "@/components/OpenInTerminalButton";
import type { LiveSessionInfo } from "@/hooks/usePiLiveSessions";
import type { SessionInfo } from "@/types";
import type { TerminalType } from "@/components/settings/types";
import type {
  SessionViewerToolbarProps,
  SessionViewerToolbarSlots,
} from "@/components/session-viewer/SessionViewerToolbarTypes";

export interface UseSessionViewerToolbarPropsOptions {
  isMobile: boolean;
  session: SessionInfo;
  title: string;
  messageCount: number;
  showSidebar: boolean;
  showThinking: boolean;
  toolsExpanded: boolean;
  showScrollMarkers: boolean;
  showMobileMenu: boolean;
  scrollMarkersEnabled: boolean;
  isSearchOpen: boolean;
  previewMode: boolean;
  slots?: SessionViewerToolbarSlots;
  onBack?: () => void;
  onToggleSidebar: () => void;
  onToggleThinking: () => void;
  onToggleToolsExpanded: () => void;
  onToggleScrollMarkers: () => void;
  onOpenSearch: () => void;
  onMobileMenuOpenChange: Dispatch<SetStateAction<boolean>>;
  onOpenSystemPromptDialog: () => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  onRenameSession?: (newName: string) => void | Promise<void>;
  onRename?: () => void;
  onFork?: () => void;
  onExport: () => void;
  onConvert?: () => void;
  onResume?: () => void;
  liveSession: LiveSessionInfo | null;
  terminal: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  onResumeSession?: (session: SessionInfo) => Promise<void> | void;
  onWebResume?: () => void;
  resumeLabel: string;
}

export function useSessionViewerToolbarProps({
  isMobile,
  session,
  title,
  messageCount,
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
  onToggleSidebar,
  onToggleThinking,
  onToggleToolsExpanded,
  onToggleScrollMarkers,
  onOpenSearch,
  onMobileMenuOpenChange,
  onOpenSystemPromptDialog,
  onScrollToTop,
  onScrollToBottom,
  onRenameSession,
  onRename,
  onFork,
  onExport,
  onConvert,
  onResume,
  liveSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  onResumeSession,
  onWebResume,
  resumeLabel,
}: UseSessionViewerToolbarPropsOptions): SessionViewerToolbarProps {
  const hasResumeAction = Boolean(onResume);

  return {
    isMobile,
    title,
    messageCount,
    showSidebar: previewMode ? false : showSidebar,
    showThinking,
    toolsExpanded,
    showScrollMarkers: previewMode ? false : showScrollMarkers,
    isMobileMenuOpen: showMobileMenu,
    isScrollMarkersFeatureEnabled: previewMode ? false : scrollMarkersEnabled,
    isSearchOpen,
    previewMode,
    slots,
    onBack,
    onToggleSidebar,
    onToggleThinking,
    onToggleToolsExpanded,
    onToggleScrollMarkers,
    onOpenSearch,
    onMobileMenuOpenChange,
    onOpenSystemPromptDialog,
    onScrollToTop,
    onScrollToBottom,
    onRenameSession,
    onRename,
    onFork,
    onExport,
    onConvert,
    onResume: hasResumeAction ? onResume : undefined,
    liveSession,
    desktopResumeButton: hasResumeAction ? (
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
          label={resumeLabel}
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
    ) : undefined,
  };
}
