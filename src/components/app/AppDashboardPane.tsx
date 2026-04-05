import { Suspense } from "react";
import type {
  ComponentProps,
  ComponentType,
  LazyExoticComponent,
  ReactNode,
} from "react";
import type Dashboard from "../dashboard/Dashboard";

type DashboardProps = ComponentProps<typeof Dashboard>;

export type AppDashboardPaneProps = Pick<
  DashboardProps,
  "sessions" | "onSessionSelect" | "onProjectSelect" | "projectName" | "loading" | "liveSessionIds"
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
        projectName={projectName}
        loading={loading}
        liveSessionIds={liveSessionIds}
      />
    </Suspense>
  );
}

export default AppDashboardPane;
