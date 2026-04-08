import { Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

import ExportDialog from "@/components/dialogs/ExportDialog";
import ConvertSessionDialog from "@/components/dialogs/ConvertSessionDialog";
import ConvertSessionResultDialog from "@/components/dialogs/ConvertSessionResultDialog";
import ResumeSessionDialog from "@/components/dialogs/ResumeSessionDialog";
import RenameDialog from "@/components/dialogs/RenameDialog";
import ForkDialog from "@/components/dialogs/ForkDialog";
import Onboarding from "@/components/Onboarding";
import type { SearchContext } from "@/plugins/types";
import type {
  SessionConvertResult,
  SessionConvertTarget,
  SessionInfo,
} from "@/types";

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
  showConvertDialog: boolean;
  showResumeDialog: boolean;
  resumeDialogMode?: "resume" | "copy";
  convertResult: SessionConvertResult | null;
  showRenameDialog: boolean;
  showForkDialog: boolean;
  showSettings: boolean;
  showOnboarding: boolean;
  selectedSession: SessionInfo | null;
  commandContext: SearchContext;
  onExportSession: (format: ExportFormat) => Promise<void> | void;
  onConvertSession: (
    target: SessionConvertTarget,
    options: { dryRun: boolean; force: boolean }
  ) => Promise<void> | void;
  onResumeToTarget: (target: SessionConvertTarget) => Promise<void> | void;
  onRenameSession: (newName: string) => Promise<void> | void;
  onForkSession: (targetName?: string) => Promise<void> | void;
  onCloseExportDialog: () => void;
  onCloseConvertDialog: () => void;
  onCloseResumeDialog: () => void;
  onCloseConvertResultDialog: () => void;
  onCloseRenameDialog: () => void;
  onCloseForkDialog: () => void;
  onCloseSettings: () => void;
  onCompleteOnboarding: () => void;
  onOpenConvertedPath: (path: string) => Promise<void> | void;
  onRunConvertedResume: (command: string) => Promise<void> | void;
  onConvertAgain: () => void;
  resumeDefaultTarget: SessionConvertTarget;
  SettingsPanel: LazyExoticComponent<ComponentType<SettingsPanelOverlayProps>>;
  CommandPalette: LazyExoticComponent<ComponentType<CommandPaletteOverlayProps>>;
}

function AppOverlays({
  showExportDialog,
  showConvertDialog,
  showResumeDialog,
  resumeDialogMode = "resume",
  convertResult,
  showRenameDialog,
  showForkDialog,
  showSettings,
  showOnboarding,
  selectedSession,
  commandContext,
  onExportSession,
  onConvertSession,
  onResumeToTarget,
  onRenameSession,
  onForkSession,
  onCloseExportDialog,
  onCloseConvertDialog,
  onCloseResumeDialog,
  onCloseConvertResultDialog,
  onCloseRenameDialog,
  onCloseForkDialog,
  onCloseSettings,
  onCompleteOnboarding,
  onOpenConvertedPath,
  onRunConvertedResume,
  onConvertAgain,
  resumeDefaultTarget,
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
      {showConvertDialog && selectedSession && (
        <ConvertSessionDialog
          session={selectedSession}
          onConvert={onConvertSession}
          onClose={onCloseConvertDialog}
        />
      )}
      {showResumeDialog && selectedSession && (
        <ResumeSessionDialog
          session={selectedSession}
          defaultTarget={resumeDefaultTarget}
          mode={resumeDialogMode}
          onResume={onResumeToTarget}
          onClose={onCloseResumeDialog}
        />
      )}
      {convertResult && (
        <ConvertSessionResultDialog
          result={convertResult}
          onClose={onCloseConvertResultDialog}
          onOpenTargetPath={onOpenConvertedPath}
          onRunResumeCommand={onRunConvertedResume}
          onConvertAgain={onConvertAgain}
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
