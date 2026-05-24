import type { ReactNode } from "react";

import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginUi,
} from "@/plugins/runtime-host";
import { useAppPluginSurfaceData } from "./AppPluginSurfaceData";

export interface AppPluginViewPaneProps {
  viewId: string | null;
  fallback: ReactNode;
}

function AppPluginViewPane({ viewId, fallback }: AppPluginViewPaneProps) {
  const appData = useAppPluginSurfaceData();
  const { ready, appViews } = usePsmPluginUi();
  const appView = viewId ? appViews.find((view) => view.id === viewId) : null;

  if (!appView) {
    if (!ready) return <>{fallback}</>;
    return (
      <div className="h-full flex items-center justify-center px-4 text-sm text-muted-foreground">
        Plugin app view unavailable
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <PluginContributionBoundary
          pluginId={appView.pluginId}
          contributionId={appView.id}
          title={appView.title}
        >
          <PluginContributionSlot
            render={() => appView.render({
              viewId: appView.id,
              active: true,
              data: appData,
            })}
          />
        </PluginContributionBoundary>
      </div>
    </div>
  );
}

export default AppPluginViewPane;
