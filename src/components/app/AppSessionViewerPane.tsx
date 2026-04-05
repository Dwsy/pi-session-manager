import type { ComponentProps } from "react";

import SessionViewer from "@/components/SessionViewer";

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
    />
  );
}

export default AppSessionViewerPane;
