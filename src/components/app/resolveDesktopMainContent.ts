import type { ReactNode } from "react";

import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import type { SessionInfo } from "@/types";
import type { AppMainView } from "@/types/mainView";

export interface ResolveDesktopMainContentOptions {
  selectedSession: SessionInfo | null;
  sidebarMode: AppDesktopSidebarMode;
  standaloneDatasetRuntime: boolean;
  mainView?: AppMainView;
  /** When true, plugin app views should not replace the main pane. */
  keepMainContent?: boolean;
  renderSessionViewer: () => ReactNode;
  renderAppView: () => ReactNode;
  renderStandaloneDatasetOverview: () => ReactNode;
  renderExplorer?: () => ReactNode;
  renderDashboard: () => ReactNode;
}

export function resolveDesktopMainContent({
  selectedSession,
  sidebarMode,
  standaloneDatasetRuntime,
  mainView = "dashboard",
  keepMainContent = false,
  renderSessionViewer,
  renderAppView,
  renderStandaloneDatasetOverview,
  renderExplorer,
  renderDashboard,
}: ResolveDesktopMainContentOptions): ReactNode {
  if (selectedSession) return renderSessionViewer();
  if (sidebarMode === "app" && !keepMainContent) return renderAppView();
  if (mainView === "explorer" && renderExplorer) return renderExplorer();
  if (standaloneDatasetRuntime) return renderStandaloneDatasetOverview();
  return renderDashboard();
}
