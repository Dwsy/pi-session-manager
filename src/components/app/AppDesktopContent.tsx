import type { ReactNode } from "react";

export interface AppDesktopContentProps {
  isTauriRuntime: boolean;
  showTerminal: boolean;
  terminalMaximized: boolean;
  mainContent: ReactNode;
  terminalPanel?: ReactNode;
}

function AppDesktopContent({
  isTauriRuntime,
  showTerminal,
  terminalMaximized,
  mainContent,
  terminalPanel,
}: AppDesktopContentProps) {
  const hideMainContent = showTerminal && terminalMaximized;

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative">
      {isTauriRuntime && !hideMainContent && (
        <div
          className="absolute top-0 left-0 right-0 h-8 z-10"
          data-tauri-drag-region
        />
      )}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div
          className="flex-1 overflow-hidden"
          style={{ display: hideMainContent ? "none" : undefined }}
        >
          {mainContent}
        </div>
        {terminalPanel}
      </div>
    </div>
  );
}

export default AppDesktopContent;
