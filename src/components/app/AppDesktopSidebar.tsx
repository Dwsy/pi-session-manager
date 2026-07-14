import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, FolderOpen, LayoutDashboard, List, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Search, Settings, Star, Terminal, Wifi } from "lucide-react";

import KbdTooltip from "@/components/ui/KbdTooltip";
import {
  ensureOrderContains,
  loadAppViewOrderState,
  moveId,
  orderAppViewItems,
  resolvePinnedAppViewIds,
  saveAppViewOrderState,
  sortAppViewsForMenu,
  togglePinnedId,
  type AppViewOrderState,
} from "@/utils/appViewOrder";
import { appendShortcutLabel, shouldUseTauriDragRegion, stripShortcutSuffix } from "@/utils/platformShortcuts";
import { isRemoteMode } from "@/transport";
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
  const [appViewOrder, setAppViewOrder] = useState<AppViewOrderState>(() => loadAppViewOrderState());

  const orderedAppViewItems = useMemo(
    () => orderAppViewItems(appViewItems, appViewOrder),
    [appViewItems, appViewOrder],
  );

  const pinnedAppViewIds = useMemo(
    () => resolvePinnedAppViewIds(orderedAppViewItems, appViewOrder, { maxPinned: 1 }),
    [appViewOrder, orderedAppViewItems],
  );

  // Only explicitly pinned plugin apps appear in the primary toolbar.
  // Activating an unpinned app must not auto-promote it into the toolbar.
  const visibleAppViewItems = useMemo(
    () => orderedAppViewItems.filter((item) => pinnedAppViewIds.includes(item.id)),
    [orderedAppViewItems, pinnedAppViewIds],
  );

  const menuAppViewItems = useMemo(
    () => sortAppViewsForMenu(orderedAppViewItems, pinnedAppViewIds),
    [orderedAppViewItems, pinnedAppViewIds],
  );

  const updateAppViewOrder = (updater: (current: AppViewOrderState) => AppViewOrderState) => {
    setAppViewOrder((current) => {
      const allIds = appViewItems.map((item) => item.id);
      const next = updater({
        pinnedIds: current.pinnedIds.filter((id) => allIds.includes(id)),
        orderIds: ensureOrderContains(current.orderIds, allIds),
      });
      const normalized: AppViewOrderState = {
        pinnedIds: next.pinnedIds.filter((id) => allIds.includes(id)).slice(0, 1),
        orderIds: ensureOrderContains(next.orderIds, allIds),
      };
      saveAppViewOrderState(normalized);
      return normalized;
    });
  };

  const handleTogglePin = (id: string) => {
    updateAppViewOrder((current) => ({
      ...current,
      pinnedIds: togglePinnedId(current.pinnedIds, id, { maxPinned: 1 }),
    }));
  };

  const handleMove = (id: string, direction: -1 | 1) => {
    updateAppViewOrder((current) => ({
      ...current,
      orderIds: moveId(ensureOrderContains(current.orderIds, appViewItems.map((item) => item.id)), id, direction),
    }));
  };

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
      className="app-desktop-sidebar relative w-80 border-r border-border flex flex-col"
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
            <KbdTooltip shortcut="Cmd+Shift+E" label={t("app.viewMode.list")}>
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
            <KbdTooltip shortcut="Cmd+Shift+G" label={t("app.viewMode.project")}>
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
          {orderedAppViewItems.length > 0 && (
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
                  className="absolute left-1/2 top-[calc(100%+0.25rem)] z-50 w-56 max-w-[calc(100vw-1rem)] -translate-x-[42%] rounded-md border border-border/70 bg-background py-1 shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
                  role="menu"
                  aria-label={t("app.sidebar.moreApps", "More apps")}
                >
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                    {t("app.sidebar.pluginApps", "Plugin apps")}
                  </div>
                  {menuAppViewItems.map((item) => {
                    const isPinned = pinnedAppViewIds.includes(item.id);
                    const orderIndex = orderedAppViewItems.findIndex((candidate) => candidate.id === item.id);
                    const canMoveUp = orderIndex > 0;
                    const canMoveDown = orderIndex >= 0 && orderIndex < orderedAppViewItems.length - 1;
                    return (
                      <div
                        key={item.id}
                        className={`group grid h-8 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 px-1.5 ${
                          item.active ? "bg-surface/70" : ""
                        }`}
                        role="menuitem"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setAppMenuOpen(false);
                            item.onSelect();
                          }}
                          className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded px-1 py-1 text-left text-[13px] text-muted-foreground hover:bg-surface/80 hover:text-foreground motion-color motion-press focus-ring"
                          title={item.label}
                        >
                          <AppViewIcon icon={item.icon} />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </button>
                        <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleTogglePin(item.id);
                            }}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded motion-color focus-ring ${
                              isPinned
                                ? "text-blue-400 hover:bg-secondary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                            aria-label={
                              isPinned
                                ? t("app.sidebar.unpinApp", "Unpin from toolbar")
                                : t("app.sidebar.pinApp", "Pin to toolbar")
                            }
                            title={
                              isPinned
                                ? t("app.sidebar.unpinApp", "Unpin from toolbar")
                                : t("app.sidebar.pinApp", "Pin to toolbar")
                            }
                          >
                            {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveUp}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMove(item.id, -1);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground motion-color focus-ring disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={t("app.sidebar.moveAppUp", "Move up")}
                            title={t("app.sidebar.moveAppUp", "Move up")}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveDown}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMove(item.id, 1);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground motion-color focus-ring disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={t("app.sidebar.moveAppDown", "Move down")}
                            title={t("app.sidebar.moveAppDown", "Move down")}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
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
          <KbdTooltip shortcut="Cmd+Shift+F">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label={searchAllLabel}
              className="p-1 rounded motion-color motion-press focus-ring ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary group relative"
              title={appendShortcutLabel(searchAllLabel, "Cmd+Shift+F", { symbolic: true })}
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

      {isRemoteMode() && (
        <div
          className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-info/10 text-info/80 border border-info/15 pointer-events-none select-none"
          title={t("app.sidebar.remoteMode", "Remote server")}
        >
          <Wifi className="h-2.5 w-2.5" aria-hidden="true" />
          {t("app.sidebar.remote", "Remote")}
        </div>
      )}
    </div>
  );
}

export default AppDesktopSidebar;
