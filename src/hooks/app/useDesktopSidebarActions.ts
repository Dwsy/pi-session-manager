import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AppSidebarViewMode } from "./useSidebarSessions";

export interface UseDesktopSidebarActionsOptions {
  setViewMode: Dispatch<SetStateAction<AppSidebarViewMode>>;
  setActiveAppViewId: Dispatch<SetStateAction<string | null>>;
  setSelectedProject: Dispatch<SetStateAction<string | null>>;
  setShowFavorites: Dispatch<SetStateAction<boolean>>;
  setShowTerminal: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  navigateToSessions: () => void;
  navigateToProjects: () => void;
  navigateToProject: (path: string) => void;
}

export interface UseDesktopSidebarActionsReturn {
  onSelectListView: () => void;
  onSelectProjectView: () => void;
  onToggleFavorites: () => void;
  onOpenCommandPalette: () => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
  onSelectFavoriteProject: (path: string) => void;
}

export function useDesktopSidebarActions({
  setViewMode,
  setActiveAppViewId,
  setSelectedProject,
  setShowFavorites,
  setShowTerminal,
  setShowSettings,
  navigateToSessions,
  navigateToProjects,
  navigateToProject,
}: UseDesktopSidebarActionsOptions): UseDesktopSidebarActionsReturn {
  const onSelectListView = useCallback(() => {
    setViewMode("list");
    setActiveAppViewId(null);
    setSelectedProject(null);
    setShowFavorites(false);
    navigateToSessions();
  }, [setActiveAppViewId, setSelectedProject, setShowFavorites, setViewMode, navigateToSessions]);

  const onSelectProjectView = useCallback(() => {
    setViewMode("project");
    setActiveAppViewId(null);
    setSelectedProject(null);
    setShowFavorites(false);
    navigateToProjects();
  }, [setActiveAppViewId, setSelectedProject, setShowFavorites, setViewMode, navigateToProjects]);

  const onToggleFavorites = useCallback(() => {
    setShowFavorites((prev) => !prev);
  }, [setShowFavorites]);

  const onOpenCommandPalette = useCallback(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true }),
    );
  }, []);

  const onToggleTerminal = useCallback(() => {
    setShowTerminal((prev) => !prev);
  }, [setShowTerminal]);

  const onOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, [setShowSettings]);

  const onSelectFavoriteProject = useCallback(
    (path: string) => {
      setSelectedProject(path);
      setActiveAppViewId(null);
      setViewMode("project");
      setShowFavorites(false);
      navigateToProject(path);
    },
    [navigateToProject, setActiveAppViewId, setSelectedProject, setShowFavorites, setViewMode],
  );

  return {
    onSelectListView,
    onSelectProjectView,
    onToggleFavorites,
    onOpenCommandPalette,
    onToggleTerminal,
    onOpenSettings,
    onSelectFavoriteProject,
  };
}
