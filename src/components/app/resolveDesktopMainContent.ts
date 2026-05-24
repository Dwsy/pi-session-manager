import type { ReactNode } from "react";

import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import type { SessionInfo } from "@/types";

export interface ResolveDesktopMainContentOptions {
  selectedSession: SessionInfo | null;
  sidebarMode: AppDesktopSidebarMode;
  standaloneDatasetRuntime: boolean;
  renderSessionViewer: () => ReactNode;
  renderAppView: () => ReactNode;
  renderStandaloneDatasetOverview: () => ReactNode;
  renderDashboard: () => ReactNode;
}

export function resolveDesktopMainContent({
  selectedSession,
  sidebarMode,
  standaloneDatasetRuntime,
  renderSessionViewer,
  renderAppView,
  renderStandaloneDatasetOverview,
  renderDashboard,
}: ResolveDesktopMainContentOptions): ReactNode {
  if (selectedSession) return renderSessionViewer();
  if (sidebarMode === "app") return renderAppView();
  if (standaloneDatasetRuntime) return renderStandaloneDatasetOverview();
  return renderDashboard();
}
