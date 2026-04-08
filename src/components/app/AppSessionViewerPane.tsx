import type { ComponentProps } from "react";

import SessionViewer from "@/components/SessionViewer";

export interface AppSessionViewerPaneProps extends Pick<
  ComponentProps<typeof SessionViewer>,
  | "session"
  | "onExport"
  | "onConvert"
  | "onRename"
  | "onFork"
  | "onBack"
  | "onWebResume"
  | "onResumeSession"
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
  onConvert,
  onRename,
  onFork,
  onBack,
  onWebResume,
  onResumeSession,
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
      onConvert={onConvert}
      onRename={onRename}
      onFork={onFork}
      onBack={onBack}
      onWebResume={onWebResume}
      onResumeSession={onResumeSession}
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
      initialEntryId={initialEntryId}
    />
  );
}

export default AppSessionViewerPane;
