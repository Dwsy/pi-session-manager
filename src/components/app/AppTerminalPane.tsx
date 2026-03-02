import {
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

interface TerminalPanelRenderProps {
  isOpen: boolean;
  onClose: () => void;
  onMaximizedChange?: (maximized: boolean) => void;
  cwd: string;
  defaultShell?: string;
  fontSize?: number;
  pendingCommand?: string | null;
  onCommandConsumed?: () => void;
}

export interface AppTerminalPaneProps extends TerminalPanelRenderProps {
  enabled: boolean;
  fallback: ReactNode;
  TerminalPanelComponent: LazyExoticComponent<
    ComponentType<TerminalPanelRenderProps>
  >;
}

function AppTerminalPane({
  enabled,
  fallback,
  TerminalPanelComponent,
  isOpen,
  onClose,
  onMaximizedChange,
  cwd,
  defaultShell,
  fontSize,
  pendingCommand,
  onCommandConsumed,
}: AppTerminalPaneProps) {
  if (!enabled) {
    return null;
  }

  return (
    <Suspense fallback={fallback}>
      <TerminalPanelComponent
        isOpen={isOpen}
        onClose={onClose}
        onMaximizedChange={onMaximizedChange}
        cwd={cwd}
        defaultShell={defaultShell}
        fontSize={fontSize}
        pendingCommand={pendingCommand}
        onCommandConsumed={onCommandConsumed}
      />
    </Suspense>
  );
}

export default AppTerminalPane;
