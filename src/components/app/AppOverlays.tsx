import { Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

import ExportDialog from "@/components/dialogs/ExportDialog";
import RenameDialog from "@/components/dialogs/RenameDialog";
import ForkDialog from "@/components/dialogs/ForkDialog";
import Onboarding from "@/components/Onboarding";
import type { SearchContext } from "@/plugins/types";
import type { SessionInfo } from "@/types";

type ExportFormat = "html" | "md" | "json";

export interface SettingsPanelOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface CommandPaletteOverlayProps {
  context: SearchContext;
}

export interface AppOverlaysProps {
  showExportDialog: boolean;
  showRenameDialog: boolean;
  showForkDialog: boolean;
  showSettings: boolean;
  showOnboarding: boolean;
  selectedSession: SessionInfo | null;
  commandContext: SearchContext;
  onExportSession: (format: ExportFormat) => Promise<void> | void;
  onRenameSession: (newName: string) => Promise<void> | void;
  onForkSession: (targetName?: string) => Promise<void> | void;
  onCloseExportDialog: () => void;
  onCloseRenameDialog: () => void;
  onCloseForkDialog: () => void;
  onCloseSettings: () => void;
  onCompleteOnboarding: () => void;
  SettingsPanel: LazyExoticComponent<ComponentType<SettingsPanelOverlayProps>>;
  CommandPalette: LazyExoticComponent<ComponentType<CommandPaletteOverlayProps>>;
}

function AppOverlays({
  showExportDialog,
  showRenameDialog,
  showForkDialog,
  showSettings,
  showOnboarding,
  selectedSession,
  commandContext,
  onExportSession,
  onRenameSession,
  onForkSession,
  onCloseExportDialog,
  onCloseRenameDialog,
  onCloseForkDialog,
  onCloseSettings,
  onCompleteOnboarding,
  SettingsPanel,
  CommandPalette,
}: AppOverlaysProps) {
  return (
    <>
      {showExportDialog && selectedSession && (
        <ExportDialog
          session={selectedSession}
          onExport={onExportSession}
          onClose={onCloseExportDialog}
        />
      )}
      {showRenameDialog && selectedSession && (
        <RenameDialog
          session={selectedSession}
          onRename={onRenameSession}
          onClose={onCloseRenameDialog}
        />
      )}
      {showForkDialog && selectedSession && (
        <ForkDialog
          session={selectedSession}
          onFork={onForkSession}
          onClose={onCloseForkDialog}
        />
      )}
      <Suspense fallback={null}>
        <SettingsPanel isOpen={showSettings} onClose={onCloseSettings} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette context={commandContext} />
      </Suspense>
      {showOnboarding && <Onboarding onComplete={onCompleteOnboarding} />}
    </>
  );
}

export default AppOverlays;
