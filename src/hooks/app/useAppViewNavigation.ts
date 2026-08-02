import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { AppDesktopSidebarAppViewItem } from "@/components/app/AppDesktopSidebar";
import type { MobileTab } from "@/components/app/AppMobileLayout";
import type { PsmAppViewRuntimeRegistration } from "@/plugins/runtime-host";
import type { SessionInfo } from "@/types";
import type { AppSidebarViewMode } from "./useSidebarSessions";

export const GLOBAL_SHORTCUTS_ALLOWED_IN_TEXT_ENTRY = [
  "cmd+1",
  "cmd+2",
  "cmd+shift+e",
  "cmd+shift+g",
  "cmd+shift+p",
  "cmd+p",
  "cmd+,",
  "cmd+`",
  "cmd+j",
  "cmd+shift+f",
  "cmd+shift+i",
  "cmd+alt+i",
  "cmd+shift+r",
  "cmd+alt+b",
  "f12",
] as const;

export function normalizeShortcutKey(shortcut?: string): string | undefined {
  return shortcut
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^command\+/, "cmd+")
    .replace(/^⌘/, "cmd+");
}

export function normalizeAppRoute(route?: string): string | null {
  if (!route) return null;
  const [pathname] = route.split(/[?#]/);
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, "") || "/";
}

export function getAppViewRoute(
  view: Pick<PsmAppViewRuntimeRegistration, "id" | "route">,
): string {
  return normalizeAppRoute(view.route) ?? `/app/${encodeURIComponent(view.id)}`;
}

export function appViewMobileTabId(viewId: string): MobileTab {
  return `app:${viewId}`;
}

export function appViewIdFromMobileTab(tab: MobileTab): string | null {
  return tab.startsWith("app:") ? tab.slice(4) : null;
}

export interface UseAppViewNavigationOptions {
  appViews: PsmAppViewRuntimeRegistration[];
  sidebarMode: AppSidebarViewMode;
  activeAppViewId: string | null;
  isMobile: boolean;
  setSidebarMode: Dispatch<SetStateAction<AppSidebarViewMode>>;
  setActiveAppViewId: Dispatch<SetStateAction<string | null>>;
  setSelectedSession: (session: SessionInfo | null) => void;
  setSelectedProject: Dispatch<SetStateAction<string | null>>;
  setMobileTab: Dispatch<SetStateAction<MobileTab>>;
  navigateToPath: (path: string) => void;
}

export function useAppViewNavigation({
  appViews,
  sidebarMode,
  activeAppViewId,
  isMobile,
  setSidebarMode,
  setActiveAppViewId,
  setSelectedSession,
  setSelectedProject,
  setMobileTab,
  navigateToPath,
}: UseAppViewNavigationOptions) {
  const openPluginAppView = useCallback(
    (view: PsmAppViewRuntimeRegistration) => {
      setSidebarMode("app");
      setActiveAppViewId(view.id);
      setSelectedSession(null);
      setSelectedProject(null);
      navigateToPath(getAppViewRoute(view));
    },
    [
      navigateToPath,
      setActiveAppViewId,
      setSelectedProject,
      setSelectedSession,
      setSidebarMode,
    ],
  );

  const openPluginAppViewById = useCallback(
    (viewId: string) => {
      const view = appViews.find((item) => item.id === viewId);
      if (view) openPluginAppView(view);
    },
    [appViews, openPluginAppView],
  );

  const appViewItems = useMemo<AppDesktopSidebarAppViewItem[]>(
    () =>
      appViews.map((view) => ({
        id: view.id,
        label: view.title,
        icon: view.icon,
        shortcut: view.shortcut,
        active: sidebarMode === "app" && activeAppViewId === view.id,
        onSelect: () => openPluginAppView(view),
      })),
    [activeAppViewId, appViews, openPluginAppView, sidebarMode],
  );

  const mobileAppViewItems = useMemo(
    () =>
      appViews.map((view) => ({
        id: view.id,
        tabId: appViewMobileTabId(view.id),
        label: view.title,
        icon: view.icon,
      })),
    [appViews],
  );

  const handleMobileTabChange = useCallback(
    (tab: MobileTab) => {
      const appViewId = appViewIdFromMobileTab(tab);
      if (appViewId) {
        const appView = appViews.find((view) => view.id === appViewId);
        setMobileTab(tab);
        if (appView) {
          openPluginAppView(appView);
        }
        return;
      }

      setActiveAppViewId(null);
      if (tab === "list") {
        setSidebarMode("list");
      } else if (tab === "projects") {
        setSidebarMode("project");
      }
      setMobileTab(tab);
    },
    [
      appViews,
      openPluginAppView,
      setActiveAppViewId,
      setMobileTab,
      setSidebarMode,
    ],
  );

  useEffect(() => {
    if (!isMobile || sidebarMode !== "app" || !activeAppViewId) return;
    setMobileTab(appViewMobileTabId(activeAppViewId));
  }, [activeAppViewId, isMobile, setMobileTab, sidebarMode]);

  const primaryAppViewShortcutHandler = useMemo(() => {
    const kanbanView = appViewItems.find(
      (item) => item.id === "builtin.kanban-board.view",
    );
    return kanbanView?.onSelect ?? appViewItems[0]?.onSelect ?? null;
  }, [appViewItems]);

  const appViewShortcuts = useMemo<Record<string, () => void>>(
    () =>
      Object.fromEntries(
        appViewItems
          .map(
            (item) =>
              [normalizeShortcutKey(item.shortcut), item.onSelect] as const,
          )
          .filter(
            (entry): entry is readonly [string, () => void] => Boolean(entry[0]),
          ),
      ),
    [appViewItems],
  );

  const shortcutsAllowedInTextEntry = useMemo(
    () => [
      ...GLOBAL_SHORTCUTS_ALLOWED_IN_TEXT_ENTRY,
      ...Object.keys(appViewShortcuts),
    ],
    [appViewShortcuts],
  );

  return {
    openPluginAppViewById,
    appViewItems,
    mobileAppViewItems,
    handleMobileTabChange,
    primaryAppViewShortcutHandler,
    appViewShortcuts,
    shortcutsAllowedInTextEntry,
  };
}
