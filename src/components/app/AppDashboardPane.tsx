import { Suspense } from "react";
import type {
  ComponentProps,
  ComponentType,
  LazyExoticComponent,
  ReactNode,
} from "react";
import type Dashboard from "@/components/dashboard/Dashboard";

type DashboardProps = ComponentProps<typeof Dashboard>;

export type AppDashboardPaneProps = Pick<
  DashboardProps,
  | "sessions"
  | "onSessionSelect"
  | "onProjectSelect"
  | "onPreviewExportSession"
  | "onOpenPreviewRenameDialog"
  | "onPreviewRenameSession"
  | "onPreviewForkSession"
  | "onPreviewConvertSession"
  | "onPreviewResumeSession"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
  | "projectName"
  | "loading"
  | "liveSessionIds"
> & {
  DashboardComponent: LazyExoticComponent<ComponentType<DashboardProps>>;
  fallback: ReactNode;
};

function AppDashboardPane({
  DashboardComponent,
  fallback,
  sessions,
  onSessionSelect,
  onProjectSelect,
  onPreviewExportSession,
  onOpenPreviewRenameDialog,
  onPreviewRenameSession,
  onPreviewForkSession,
  onPreviewConvertSession,
  onPreviewResumeSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  projectName,
  loading,
  liveSessionIds,
}: AppDashboardPaneProps) {
  return (
    <Suspense fallback={fallback}>
      <DashboardComponent
        sessions={sessions}
        onSessionSelect={onSessionSelect}
        onProjectSelect={onProjectSelect}
        onPreviewExportSession={onPreviewExportSession}
        onOpenPreviewRenameDialog={onOpenPreviewRenameDialog}
        onPreviewRenameSession={onPreviewRenameSession}
        onPreviewForkSession={onPreviewForkSession}
        onPreviewConvertSession={onPreviewConvertSession}
        onPreviewResumeSession={onPreviewResumeSession}
        terminal={terminal}
        piPath={piPath}
        customCommand={customCommand}
        resumeCommand={resumeCommand}
        projectName={projectName}
        loading={loading}
        liveSessionIds={liveSessionIds}
      />
    </Suspense>
  );
}

export default AppDashboardPane;
