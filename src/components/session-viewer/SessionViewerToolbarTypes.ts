import type { ReactNode } from "react";

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
  onBack?: () => void;
  onToggleSidebar: () => void;
  onToggleThinking: () => void;
  onToggleToolsExpanded: () => void;
  onToggleScrollMarkers?: () => void;
  onOpenSearch: () => void;
  onMobileMenuOpenChange: (open: boolean) => void;
  onOpenSystemPromptDialog: () => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  onRename: () => void;
  onExport: () => void;
  onResume?: () => void;
  desktopResumeButton?: ReactNode;
}
