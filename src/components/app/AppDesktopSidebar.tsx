import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Columns3, LayoutDashboard, Search, Settings, Star, Terminal } from "lucide-react";

import KbdTooltip from "@/components/ui/KbdTooltip";

export type AppDesktopSidebarViewMode = "list" | "project" | "kanban" | "pi-live";

export interface AppDesktopSidebarProps {
  isTauriRuntime: boolean;
  startDragging: () => void;
  viewMode: AppDesktopSidebarViewMode;
  showFavorites: boolean;
  terminalEnabled: boolean;
  showTerminal: boolean;
  onShowDashboard: () => void;
  onSelectListView: () => void;
  onSelectProjectView: () => void;
  onSelectKanbanView: () => void;
  onToggleFavorites: () => void;
  onOpenCommandPalette: () => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
  searchBar: ReactNode;
  content: ReactNode;
  listScrollRef: RefObject<HTMLDivElement>;
}

function AppDesktopSidebar({
  isTauriRuntime,
  startDragging,
  viewMode,
  showFavorites,
  terminalEnabled,
  showTerminal,
  onShowDashboard,
  onSelectListView,
  onSelectProjectView,
  onSelectKanbanView,
  onToggleFavorites,
  onOpenCommandPalette,
  onToggleTerminal,
  onOpenSettings,
  searchBar,
  content,
  listScrollRef,
}: AppDesktopSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="w-80 border-r border-border flex flex-col">
      <div
        className={`${isTauriRuntime ? "h-8" : ""} border-b border-border flex items-center px-3 ${isTauriRuntime ? "py-0" : "py-1.5"} select-none`}
        {...(isTauriRuntime
          ? { "data-tauri-drag-region": true, onMouseDown: startDragging }
          : {})}
      >
        <div className="flex items-center gap-0.5 ml-auto no-drag">
          <button
            onClick={onShowDashboard}
            className="p-1 rounded motion-color motion-press focus-ring mr-1 text-muted-foreground hover:text-foreground hover:bg-secondary"
            title={t("dashboard.title")}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center bg-surface rounded-lg p-0.5 mr-1">
            <KbdTooltip shortcut="Cmd+L" label={t("app.viewMode.list")}>
              <button
                onClick={onSelectListView}
                className={`p-1 rounded motion-color motion-press focus-ring ${viewMode === "list" && !showFavorites ? "text-blue-400 bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                title={t("app.viewMode.list")}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
              </button>
            </KbdTooltip>
            <KbdTooltip shortcut="Cmd+P" label={t("app.viewMode.project")}>
              <button
                onClick={onSelectProjectView}
                className={`p-1 rounded motion-color motion-press focus-ring ${viewMode === "project" && !showFavorites ? "text-blue-400 bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                title={t("app.viewMode.project")}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </button>
            </KbdTooltip>
            <KbdTooltip shortcut="Cmd+B" label={t("tags.kanban.title")}>
              <button
                onClick={onSelectKanbanView}
                className={`p-1 rounded motion-color motion-press focus-ring ${viewMode === "kanban" && !showFavorites ? "text-blue-400 bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                title={t("tags.kanban.title")}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
            </KbdTooltip>
          </div>
          <button
            onClick={onToggleFavorites}
            className={`p-1 rounded motion-color motion-press focus-ring ml-0.5 ${showFavorites ? "text-yellow-400 bg-secondary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            title={showFavorites ? t("favorites.back") : t("favorites.title")}
          >
            <Star className="h-3.5 w-3.5" />
          </button>
          <KbdTooltip shortcut="Cmd+K">
            <button
              onClick={onOpenCommandPalette}
              className="p-1 rounded motion-color motion-press focus-ring ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary group relative"
              title={t("app.shortcuts.searchAll", "Search all sessions") + " (Cmd+K)"}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </KbdTooltip>
          {terminalEnabled && (
            <KbdTooltip shortcut="Ctrl+`">
              <button
                onClick={onToggleTerminal}
                className={`p-1 rounded motion-color motion-press focus-ring ml-0.5 ${
                  showTerminal
                    ? "text-green-400 bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
                title={
                  showTerminal
                    ? "Close terminal (Ctrl+`)"
                    : "Open terminal (Ctrl+`)"
                }
              >
                <Terminal className="h-3.5 w-3.5" />
              </button>
            </KbdTooltip>
          )}
          <KbdTooltip shortcut="Cmd+,">
            <button
              onClick={onOpenSettings}
              className="p-1 rounded motion-color motion-press focus-ring ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary"
              title={t("settings.title")}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </KbdTooltip>
        </div>
      </div>

      {!showFavorites && (
        <div className="px-3 py-1.5 border-b border-border/50">{searchBar}</div>
      )}

      <div className="flex-1 overflow-y-auto" ref={listScrollRef}>
        {content}
      </div>
    </div>
  );
}

export default AppDesktopSidebar;
