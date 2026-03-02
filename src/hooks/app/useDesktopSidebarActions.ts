import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { SessionInfo } from "../../types";
import type { AppSidebarViewMode } from "./useSidebarSessions";

export interface UseDesktopSidebarActionsOptions {
  setViewMode: Dispatch<SetStateAction<AppSidebarViewMode>>;
  setSelectedProject: Dispatch<SetStateAction<string | null>>;
  setSelectedSession: (session: SessionInfo | null) => void;
  setShowFavorites: Dispatch<SetStateAction<boolean>>;
  setShowTerminal: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
}

export interface UseDesktopSidebarActionsReturn {
  onSelectListView: () => void;
  onSelectProjectView: () => void;
  onSelectKanbanView: () => void;
  onToggleFavorites: () => void;
  onOpenCommandPalette: () => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
  onSelectKanbanFilterProject: (project: string | null) => void;
  onSelectFavoriteProject: (path: string) => void;
}

export function useDesktopSidebarActions({
  setViewMode,
  setSelectedProject,
  setSelectedSession,
  setShowFavorites,
  setShowTerminal,
  setShowSettings,
}: UseDesktopSidebarActionsOptions): UseDesktopSidebarActionsReturn {
  const onSelectListView = useCallback(() => {
    setViewMode("list");
    setSelectedProject(null);
    setShowFavorites(false);
  }, [setSelectedProject, setShowFavorites, setViewMode]);

  const onSelectProjectView = useCallback(() => {
    setViewMode("project");
    setSelectedProject(null);
    setShowFavorites(false);
  }, [setSelectedProject, setShowFavorites, setViewMode]);

  const onSelectKanbanView = useCallback(() => {
    setViewMode("kanban");
    setSelectedSession(null);
    setShowFavorites(false);
  }, [setSelectedSession, setShowFavorites, setViewMode]);

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

  const onSelectKanbanFilterProject = useCallback(
    (project: string | null) => {
      setSelectedProject(project);
      setSelectedSession(null);
    },
    [setSelectedProject, setSelectedSession],
  );

  const onSelectFavoriteProject = useCallback(
    (path: string) => {
      setSelectedProject(path);
      setViewMode("project");
      setShowFavorites(false);
    },
    [setSelectedProject, setShowFavorites, setViewMode],
  );

  return {
    onSelectListView,
    onSelectProjectView,
    onSelectKanbanView,
    onToggleFavorites,
    onOpenCommandPalette,
    onToggleTerminal,
    onOpenSettings,
    onSelectKanbanFilterProject,
    onSelectFavoriteProject,
  };
}
