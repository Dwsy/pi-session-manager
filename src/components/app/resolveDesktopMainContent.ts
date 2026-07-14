import type { ReactNode } from "react";

import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import type { SessionInfo } from "@/types";

export interface ResolveDesktopMainContentOptions {
  selectedSession: SessionInfo | null;
  sidebarMode: AppDesktopSidebarMode;
  standaloneDatasetRuntime: boolean;
  /** When true, plugin app views should not replace the main pane. */
  keepMainContent?: boolean;
  renderSessionViewer: () => ReactNode;
  renderAppView: () => ReactNode;
  renderStandaloneDatasetOverview: () => ReactNode;
  renderDashboard: () => ReactNode;
}

export function resolveDesktopMainContent({
  selectedSession,
  sidebarMode,
  standaloneDatasetRuntime,
  keepMainContent = false,
  renderSessionViewer,
  renderAppView,
  renderStandaloneDatasetOverview,
  renderDashboard,
}: ResolveDesktopMainContentOptions): ReactNode {
  if (selectedSession) return renderSessionViewer();
  if (sidebarMode === "app" && !keepMainContent) return renderAppView();
  if (standaloneDatasetRuntime) return renderStandaloneDatasetOverview();
  return renderDashboard();
}
