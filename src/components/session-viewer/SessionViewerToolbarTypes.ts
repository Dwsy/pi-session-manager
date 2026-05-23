import type { ReactNode } from "react";
import type { LiveSessionInfo } from "@/hooks/usePiLiveSessions";

export interface SessionViewerToolbarSlots {
  /** Custom content rendered on the left side of the toolbar, after the title */
  left?: ReactNode;
  /** Custom content rendered on the right side of the toolbar, before action buttons */
  right?: ReactNode;
}

export interface SessionViewerLayoutSlots {
  top?: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
  left?: ReactNode;
}

export interface SessionViewerToolbarProps {
  isMobile: boolean;
  title: string;
  messageCount: number;
  showSidebar: boolean;
  showThinking: boolean;
  toolsExpanded: boolean;
  showScrollMarkers: boolean;
  isMobileMenuOpen: boolean;
  isScrollMarkersFeatureEnabled: boolean;
  isSearchOpen: boolean;
  previewMode?: boolean;
  /** Slots for custom content injection */
  slots?: SessionViewerToolbarSlots;
  onBack?: () => void;
  onToggleSidebar: () => void;
  onToggleThinking: () => void;
  onToggleToolsExpanded: () => void;
  onToggleScrollMarkers?: () => void;
  onToggleTraceMode?: () => void;
  traceModeActive?: boolean;
  onOpenSearch: () => void;
  onMobileMenuOpenChange: (open: boolean) => void;
  onOpenSystemPromptDialog: () => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  onRename?: () => void;
  onFork?: () => void;
  onExport: () => void;
  onConvert?: () => void;
  onResume?: () => void;
  desktopResumeButton?: ReactNode;
  liveSession?: LiveSessionInfo | null;
}
