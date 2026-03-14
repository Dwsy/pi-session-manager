import { Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

import ExportDialog from "../ExportDialog";
import RenameDialog from "../RenameDialog";
import ForkDialog from "../ForkDialog";
import DeleteSessionConfirmDialog from "../DeleteSessionConfirmDialog";
import Onboarding from "../Onboarding";
import type { PendingDeleteSession } from "../../hooks/useSessions";
import type { SearchContext } from "../../plugins/types";
import type { SessionInfo } from "../../types";

type ExportFormat = "html" | "md" | "json";

export interface SettingsPanelOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface CommandPaletteOverlayProps {
  context: SearchContext;
}

export interface FullTextSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (session: SessionInfo, entryId: string) => void;
}

export interface AppOverlaysProps {
  showExportDialog: boolean;
  showRenameDialog: boolean;
  showForkDialog: boolean;
  showSettings: boolean;
  showFullTextSearch: boolean;
  showOnboarding: boolean;
  selectedSession: SessionInfo | null;
  pendingDeleteSession: PendingDeleteSession | null;
  commandContext: SearchContext;
  onExportSession: (format: ExportFormat) => Promise<void> | void;
  onRenameSession: (newName: string) => Promise<void> | void;
  onForkSession: (targetName?: string) => Promise<void> | void;
  onCloseExportDialog: () => void;
  onCloseRenameDialog: () => void;
  onCloseForkDialog: () => void;
  onConfirmDeleteSession: () => Promise<void>;
  onCancelDeleteSession: () => void;
  onDeleteSessionConfirmStart?: () => void;
  onCloseSettings: () => void;
  onCloseFullTextSearch: () => void;
  onSelectFullTextSearchResult: (session: SessionInfo, entryId: string) => void;
  onCompleteOnboarding: () => void;
  SettingsPanel: LazyExoticComponent<ComponentType<SettingsPanelOverlayProps>>;
  CommandPalette: LazyExoticComponent<ComponentType<CommandPaletteOverlayProps>>;
  FullTextSearch: LazyExoticComponent<ComponentType<FullTextSearchOverlayProps>>;
}

function AppOverlays({
  showExportDialog,
  showRenameDialog,
  showForkDialog,
  showSettings,
  showFullTextSearch,
  showOnboarding,
  selectedSession,
  pendingDeleteSession,
  commandContext,
  onExportSession,
  onRenameSession,
  onForkSession,
  onCloseExportDialog,
  onCloseRenameDialog,
  onCloseForkDialog,
  onConfirmDeleteSession,
  onCancelDeleteSession,
  onDeleteSessionConfirmStart,
  onCloseSettings,
  onCloseFullTextSearch,
  onSelectFullTextSearchResult,
  onCompleteOnboarding,
  SettingsPanel,
  CommandPalette,
  FullTextSearch,
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
      {pendingDeleteSession && (
        <DeleteSessionConfirmDialog
          sessions={pendingDeleteSession.sessions}
          onConfirm={onConfirmDeleteSession}
          onCancel={onCancelDeleteSession}
          onConfirmStart={onDeleteSessionConfirmStart}
        />
      )}
      <Suspense fallback={null}>
        <SettingsPanel isOpen={showSettings} onClose={onCloseSettings} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette context={commandContext} />
      </Suspense>
      {showFullTextSearch && (
        <Suspense fallback={null}>
          <FullTextSearch
            isOpen={true}
            onClose={onCloseFullTextSearch}
            onSelectResult={onSelectFullTextSearchResult}
          />
        </Suspense>
      )}
      {showOnboarding && <Onboarding onComplete={onCompleteOnboarding} />}
    </>
  );
}

export default AppOverlays;
