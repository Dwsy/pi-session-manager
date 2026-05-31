import type { ReactNode } from "react";
import { Menu } from "lucide-react";

export interface AppDesktopContentProps {
  isTauriRuntime: boolean;
  showTerminal: boolean;
  terminalMaximized: boolean;
  mainContent: ReactNode;
  terminalPanel?: ReactNode;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  toggleSidebarTitle?: string;
}

function AppDesktopContent({
  isTauriRuntime,
  showTerminal,
  terminalMaximized,
  mainContent,
  terminalPanel,
  sidebarVisible = true,
  onToggleSidebar,
  toggleSidebarTitle = "Show sidebar",
}: AppDesktopContentProps) {
  const hideMainContent = showTerminal && terminalMaximized;

  return (
    <div
      className="app-desktop-content flex-1 overflow-hidden flex flex-col relative"
      role="main"
      aria-label="Main workspace"
    >
      {isTauriRuntime && !hideMainContent && (
        <div
          className="absolute top-0 left-0 right-0 h-8 z-10"
          data-tauri-drag-region
        />
      )}
      {/* Sidebar toggle when hidden */}
      {!sidebarVisible && onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={toggleSidebarTitle}
          title={toggleSidebarTitle}
          className={`absolute z-30 p-1 rounded motion-color motion-press focus-ring text-muted-foreground hover:text-foreground hover:bg-secondary no-drag ${
            isTauriRuntime
              ? "top-2 left-[var(--macos-traffic-clearance)]"
              : "top-1 left-1"
          }`}
          data-no-window-drag
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <div className="app-desktop-content__shell flex-1 overflow-hidden flex flex-col">
        <div
          className="app-desktop-content__main flex-1 overflow-hidden"
          style={{ display: hideMainContent ? "none" : undefined }}
          aria-hidden={hideMainContent || undefined}
        >
          {mainContent}
        </div>
        {terminalPanel}
      </div>
    </div>
  );
}

export default AppDesktopContent;
