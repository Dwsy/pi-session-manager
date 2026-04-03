import type { ComponentProps } from "react";

import SessionViewer from "../SessionViewer";

export interface AppSessionViewerPaneProps extends Pick<
  ComponentProps<typeof SessionViewer>,
  | "session"
  | "onExport"
  | "onRename"
  | "onFork"
  | "onBack"
  | "onWebResume"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
  | "initialEntryId"
> {
  liveSessionIds: Set<string>
}

function AppSessionViewerPane({
  session,
  onExport,
  onRename,
  onFork,
  onBack,
  onWebResume,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  initialEntryId,
  liveSessionIds,
}: AppSessionViewerPaneProps) {
  return (
    <SessionViewer
      session={session}
      onExport={onExport}
      onRename={onRename}
      onFork={onFork}
      onBack={onBack}
      onWebResume={onWebResume}
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
      initialEntryId={initialEntryId}
      liveSessionIds={liveSessionIds}
    />
  );
}

export default AppSessionViewerPane;
