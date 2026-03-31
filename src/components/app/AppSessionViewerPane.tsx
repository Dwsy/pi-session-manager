import type { ComponentProps } from "react";

import SessionViewer from "../SessionViewer";

export type AppSessionViewerPaneProps = Pick<
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
>;

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
  initialEntryId,
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
      initialEntryId={initialEntryId}
    />
  );
}

export default AppSessionViewerPane;
