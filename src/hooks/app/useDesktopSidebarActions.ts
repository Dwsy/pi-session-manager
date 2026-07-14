import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AppSidebarViewMode } from "./useSidebarSessions";

export interface UseDesktopSidebarActionsOptions {
  setViewMode: Dispatch<SetStateAction<AppSidebarViewMode>>;
  setActiveAppViewId: Dispatch<SetStateAction<string | null>>;
  setSelectedProject: Dispatch<SetStateAction<string | null>>;
  setShowTerminal: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  navigateToSessions: () => void;
  navigateToProjects: () => void;
  navigateToProject: (path: string) => void;
}

export interface UseDesktopSidebarActionsReturn {
  onSelectListView: () => void;
  onSelectProjectView: () => void;
  onOpenCommandPalette: () => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
}

export function useDesktopSidebarActions({
  setViewMode,
  setActiveAppViewId,
  setSelectedProject,
  setShowTerminal,
  setShowSettings,
  navigateToSessions,
  navigateToProjects,
}: UseDesktopSidebarActionsOptions): UseDesktopSidebarActionsReturn {
  const onSelectListView = useCallback(() => {
    setViewMode("list");
    setActiveAppViewId(null);
    setSelectedProject(null);
    navigateToSessions();
  }, [setActiveAppViewId, setSelectedProject, setViewMode, navigateToSessions]);

  const onSelectProjectView = useCallback(() => {
    setViewMode("project");
    setActiveAppViewId(null);
    setSelectedProject(null);
    navigateToProjects();
  }, [setActiveAppViewId, setSelectedProject, setViewMode, navigateToProjects]);

  const onOpenCommandPalette = useCallback(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "p", metaKey: true }),
    );
  }, []);

  const onToggleTerminal = useCallback(() => {
    setShowTerminal((prev) => !prev);
  }, [setShowTerminal]);

  const onOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, [setShowSettings]);

  return {
    onSelectListView,
    onSelectProjectView,
    onOpenCommandPalette,
    onToggleTerminal,
    onOpenSettings,
  };
}
