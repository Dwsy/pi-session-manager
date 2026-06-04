import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, LayoutDashboard, List, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Settings, Star, Terminal } from "lucide-react";

import KbdTooltip from "@/components/ui/KbdTooltip";
import { appendShortcutLabel, shouldUseTauriDragRegion, stripShortcutSuffix } from "@/utils/platformShortcuts";
import AppViewIcon from "./AppViewIcon";

export type AppDesktopSidebarMode = "list" | "project" | "app" | "pi-live";

export interface AppDesktopSidebarAppViewItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  active: boolean;
  onSelect: () => void;
}

export interface AppDesktopSidebarProps {
  isTauriRuntime: boolean;
  startDragging: () => void;
  sidebarMode: AppDesktopSidebarMode;
  showFavorites: boolean;
  sidebarVisible?: boolean;
  showDashboardButton?: boolean;
  terminalEnabled: boolean;
  showTerminal: boolean;
  onShowDashboard: () => void;
  onSelectListView: () => void;
  onSelectProjectView: () => void;
  appViewItems?: AppDesktopSidebarAppViewItem[];
  onToggleFavorites: () => void;
  onOpenCommandPalette: () => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  settingsLabel?: string;
  settingsIcon?: ReactNode;
  searchBar?: ReactNode;
  content: ReactNode;
  listScrollRef: RefObject<HTMLDivElement>;
}

function AppDesktopSidebar({
  isTauriRuntime,
  startDragging,
  sidebarMode,
  showFavorites,
  sidebarVisible = true,
  showDashboardButton = true,
  terminalEnabled,
  showTerminal,
  onShowDashboard,
  onSelectListView,
  onSelectProjectView,
  appViewItems = [],
  onToggleFavorites,
  onOpenCommandPalette,
  onToggleTerminal,
  onOpenSettings,
  onToggleSidebar,
  settingsLabel,
  settingsIcon,
  searchBar,
  content,
  listScrollRef,
}: AppDesktopSidebarProps) {
  const { t } = useTranslation();
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const { visibleAppViewItems, overflowAppViewItems } = useMemo(() => {
    const visible = new Set<string>();
    const pinned = appViewItems.slice(0, 1);
    for (const item of pinned) visible.add(item.id);
    const activeItem = appViewItems.find((item) => item.active);
    if (activeItem) visible.add(activeItem.id);
    return {
      visibleAppViewItems: appViewItems.filter((item) => visible.has(item.id)),
      overflowAppViewItems: appViewItems.filter((item) => !visible.has(item.id)),
    };
  }, [appViewItems]);

  useEffect(() => {
    if (!appMenuOpen) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (appMenuRef.current?.contains(event.target as Node)) return;
      setAppMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAppMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [appMenuOpen]);

  const enableWindowDrag = isTauriRuntime && shouldUseTauriDragRegion();
  const searchAllLabel = stripShortcutSuffix(
    t("app.shortcuts.searchAll", "Search all sessions"),
  );

  return (
    <div
      className="app-desktop-sidebar w-80 border-r border-border flex flex-col"
      role="navigation"
      aria-label={t("app.sidebar.label", "Primary navigation")}
    >
      <div
        className={`app-desktop-sidebar__chrome ${isTauriRuntime ? "h-10" : ""} border-b border-border flex items-center px-3 ${isTauriRuntime ? "py-0" : "py-1.5"} select-none`}
        {...(enableWindowDrag
          ? { "data-tauri-drag-region": true, onMouseDown: startDragging }
          : {})}
      >

        <div
          className="relative flex min-w-0 items-center gap-0.5 ml-auto no-drag"
          role="toolbar"
          aria-label={t("app.sidebar.toolbar", "App controls")}
        >
          {/* Sidebar toggle button - leftmost */}
          {onToggleSidebar && (
              <div className="no-drag mr-auto">
                <KbdTooltip shortcut="Cmd+B" label={sidebarVisible ? t("app.sidebar.hideSidebar", "Hide sidebar") : t("app.sidebar.showSidebar", "Show sidebar")}>
                  <button
                      type="button"
                      onClick={onToggleSidebar}
                      aria-label={sidebarVisible ? t("app.sidebar.hideSidebar", "Hide sidebar") : t("app.sidebar.showSidebar", "Show sidebar")}
                      className="p-1 rounded motion-color motion-press focus-ring text-muted-foreground hover:text-foreground hover:bg-secondary"
                      title={sidebarVisible ? t("app.sidebar.hideSidebar", "Hide sidebar") : t("app.sidebar.showSidebar", "Show sidebar")}
                  >
                    {sidebarVisible ? (
                        <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                        <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </KbdTooltip>
              </div>
          )}
          {showDashboardButton && (
            <button
              type="button"
              onClick={onShowDashboard}
              aria-label={t("dashboard.title")}
              className="p-1 rounded motion-color motion-press focus-ring mr-1 text-muted-foreground hover:text-foreground hover:bg-secondary"
              title={t("dashboard.title")}
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <div
            className="flex items-center bg-surface rounded-lg p-0.5 mr-1"
            role="radiogroup"
            aria-label={t("app.viewMode.label", "View mode")}
          >
            <KbdTooltip shortcut="Cmd+L" label={t("app.viewMode.list")}>
              <button
                type="button"
                onClick={onSelectListView}
                role="radio"
                aria-checked={sidebarMode === "list" && !showFavorites}
                aria-label={t("app.viewMode.list")}
                className={`p-1 rounded motion-color motion-press focus-ring ${sidebarMode === "list" && !showFavorites ? "text-blue-400 bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                title={t("app.viewMode.list")}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </KbdTooltip>
            <KbdTooltip shortcut="Cmd+P" label={t("app.viewMode.project")}>
              <button
                type="button"
                onClick={onSelectProjectView}
                role="radio"
                aria-checked={sidebarMode === "project" && !showFavorites}
                aria-label={t("app.viewMode.project")}
                className={`p-1 rounded motion-color motion-press focus-ring ${sidebarMode === "project" && !showFavorites ? "text-blue-400 bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                title={t("app.viewMode.project")}
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </KbdTooltip>
            {visibleAppViewItems.map((item) => {
              const button = (
                <button
                  type="button"
                  onClick={item.onSelect}
                  role="radio"
                  aria-checked={item.active && !showFavorites}
                  aria-label={item.label}
                  className={`p-1 rounded motion-color motion-press focus-ring ${item.active && !showFavorites ? "text-blue-400 bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                  title={item.label}
                >
                  <AppViewIcon icon={item.icon} />
                </button>
              );

              return item.shortcut ? (
                <KbdTooltip key={item.id} shortcut={item.shortcut} label={item.label}>
                  {button}
                </KbdTooltip>
              ) : (
                <Fragment key={item.id}>
                  {button}
                </Fragment>
              );
            })}
          </div>
          {overflowAppViewItems.length > 0 && (
            <div className="relative" ref={appMenuRef}>
              <button
                type="button"
                onClick={() => setAppMenuOpen((open) => !open)}
                aria-label={t("app.sidebar.moreApps", "More apps")}
                aria-haspopup="menu"
                aria-expanded={appMenuOpen}
                className={`p-1 rounded motion-color motion-press focus-ring ml-0.5 ${
                  appMenuOpen
                    ? "text-blue-400 bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
                title={t("app.sidebar.moreApps", "More apps")}
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {appMenuOpen && (
                <div
                  className="absolute left-1/2 top-[calc(100%+0.25rem)] z-50 w-44 max-w-[calc(100vw-1rem)] -translate-x-[42%] rounded-md border border-border/70 bg-background py-1 shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
                  role="menu"
                  aria-label={t("app.sidebar.moreApps", "More apps")}
                >
                  {overflowAppViewItems.map((item) => {
                    const menuItem = (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAppMenuOpen(false);
                          item.onSelect();
                        }}
                        className="grid h-8 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 px-2.5 text-left text-[13px] text-muted-foreground hover:bg-surface/80 hover:text-foreground motion-color motion-press focus-ring"
                      >
                        <AppViewIcon icon={item.icon} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </button>
                    );

                    return item.shortcut ? (
                      <KbdTooltip
                        key={item.id}
                        shortcut={item.shortcut}
                        position="right"
                        className="relative flex w-full"
                      >
                        {menuItem}
                      </KbdTooltip>
                    ) : (
                      <Fragment key={item.id}>{menuItem}</Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleFavorites}
            aria-label={showFavorites ? t("favorites.back") : t("favorites.title")}
            aria-pressed={showFavorites}
            className={`p-1 rounded motion-color motion-press focus-ring ml-0.5 ${showFavorites ? "text-yellow-400 bg-secondary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            title={showFavorites ? t("favorites.back") : t("favorites.title")}
          >
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <KbdTooltip shortcut="Cmd+K">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label={searchAllLabel}
              className="p-1 rounded motion-color motion-press focus-ring ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary group relative"
              title={appendShortcutLabel(searchAllLabel, "Cmd+K", { symbolic: true })}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </KbdTooltip>
          {terminalEnabled && (
            <KbdTooltip shortcut="Ctrl+`">
              <button
                type="button"
                onClick={onToggleTerminal}
                aria-label={
                  showTerminal
                    ? t("terminal.close", "Close terminal")
                    : t("terminal.open", "Open terminal")
                }
                aria-pressed={showTerminal}
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
                <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </KbdTooltip>
          )}
          <KbdTooltip shortcut="Cmd+,">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={settingsLabel || t("settings.title")}
              className="p-1 rounded motion-color motion-press focus-ring ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary"
              title={settingsLabel || t("settings.title")}
            >
              {settingsIcon || <Settings className="h-3.5 w-3.5" />}
            </button>
          </KbdTooltip>
        </div>
      </div>

      {!showFavorites && searchBar && (
        <div className="app-desktop-sidebar__search px-3 py-1.5 border-b border-border/50">
          {searchBar}
        </div>
      )}

      <div
        className="app-desktop-sidebar__content flex-1 overflow-y-auto"
        ref={listScrollRef}
        aria-label={t("app.sidebar.content", "Sidebar content")}
      >
        {content}
      </div>
    </div>
  );
}

export default AppDesktopSidebar;
