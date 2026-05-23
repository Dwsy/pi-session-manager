import type { ComponentProps } from "react";

import SessionViewer from "@/components/SessionViewer";
import SessionIntelligenceToolbarPanel from "@/components/session-viewer/SessionIntelligenceToolbarPanel";
import { useSettings } from "@/hooks/useSettings";

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
  | "slots"
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
  slots,
}: AppSessionViewerPaneProps) {
  const { getSessionSetting } = useSettings();
  const conversationModeEnabled = getSessionSetting("conversationModeEnabled") !== false;

  const sessionIntelligenceSlot = (
    <>
      {slots?.right}
      <SessionIntelligenceToolbarPanel session={session} />
    </>
  );

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
      previewVariant={conversationModeEnabled ? "conversation" : "none"}
      slots={{ ...slots, right: sessionIntelligenceSlot }}
    />
  );
}

export default AppSessionViewerPane;
