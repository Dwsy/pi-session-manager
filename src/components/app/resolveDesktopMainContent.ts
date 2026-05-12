import type { ReactNode } from "react";

import type { AppDesktopSidebarMode } from "./AppDesktopSidebar";
import type { SessionInfo } from "@/types";

export interface ResolveDesktopMainContentOptions {
  selectedSession: SessionInfo | null;
  sidebarMode: AppDesktopSidebarMode;
  standaloneDatasetRuntime: boolean;
  renderSessionViewer: () => ReactNode;
  renderKanban: () => ReactNode;
  renderStandaloneDatasetOverview: () => ReactNode;
  renderDashboard: () => ReactNode;
}

export function resolveDesktopMainContent({
  selectedSession,
  sidebarMode,
  standaloneDatasetRuntime,
  renderSessionViewer,
  renderKanban,
  renderStandaloneDatasetOverview,
  renderDashboard,
}: ResolveDesktopMainContentOptions): ReactNode {
  if (selectedSession) return renderSessionViewer();
  if (sidebarMode === "kanban") return renderKanban();
  if (standaloneDatasetRuntime) return renderStandaloneDatasetOverview();
  return renderDashboard();
}
