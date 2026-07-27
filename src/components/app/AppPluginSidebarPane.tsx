import type { ReactNode } from "react";

import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginUi,
} from "@/plugins/runtime-host";
import { useAppPluginSurfaceData } from "./AppPluginSurfaceData";

function normalizeRoute(route?: string) {
  if (!route) return null;
  const [pathname] = route.split(/[?#]/);
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, "") || "/";
}

export interface AppPluginSidebarPaneProps {
  appViewId: string | null;
  fallback?: ReactNode;
}

function AppPluginSidebarPane({
  appViewId,
  fallback = null,
}: AppPluginSidebarPaneProps) {
  const appData = useAppPluginSurfaceData();
  const { ready, appViews, appSidebarViews } = usePsmPluginUi();
  const appView = appViewId ? appViews.find((view) => view.id === appViewId) : null;
  const appViewRoute = normalizeRoute(appView?.route);
  const sidebarView = appView
    ? appSidebarViews.find((view) => {
        if (view.appViewId === appView.id) return true;
        const sidebarRoute = normalizeRoute(view.route);
        return !!appViewRoute && sidebarRoute === appViewRoute;
      })
    : null;

  if (!appView) {
    if (!ready) return <>{fallback}</>;
    return null;
  }

  if (!sidebarView) {
    return null;
  }

  return (
    <div className="app-plugin-sidebar-host" data-plugin-sidebar-id={sidebarView.id}>
      <PluginContributionBoundary
        pluginId={sidebarView.pluginId}
        contributionId={sidebarView.id}
        title={sidebarView.title}
      >
        <PluginContributionSlot
          render={() => sidebarView.render({
            viewId: sidebarView.id,
            active: true,
            data: appData,
          })}
        />
      </PluginContributionBoundary>
    </div>
  );
}

export default AppPluginSidebarPane;
