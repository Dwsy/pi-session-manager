import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  Pin,
  PinOff,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";

import { useClipboard } from "@/hooks/useClipboard";
import { isTauri } from "@/transport";
import type { SessionInfo } from "@/types";
import { getPathBasename, stripJsonlExt } from "@/utils/path";
import { shouldUseTauriDragRegion } from "@/utils/platformShortcuts";

const MENU_WIDTH = 220;
const MENU_FALLBACK_HEIGHT = 280;
const VIEWPORT_GUTTER = 8;

export interface SessionViewerTabsProps {
  tabs: SessionInfo[];
  activeTabId: string | null;
  isMobile: boolean;
  pinnedTabIds?: Set<string>;
  canReopenClosedTab?: boolean;
  liveSessionIds?: Set<string>;
  onSelect: (session: SessionInfo) => void;
  onClose: (sessionId: string) => void;
  onCloseOthers?: (sessionId: string) => void;
  onCloseToLeft?: (sessionId: string) => void;
  onCloseToRight?: (sessionId: string) => void;
  onCloseAll?: () => void;
  onTogglePin?: (sessionId: string) => void;
  onReopenClosed?: () => void;
}

interface TabContextMenuState {
  x: number;
  y: number;
  tabId: string | null;
}

function getTabLabel(session: SessionInfo): string {
  return (
    session.name?.trim() ||
    stripJsonlExt(getPathBasename(session.path)) ||
    session.id
  );
}

interface TabMenuActionProps {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

function TabMenuAction({
  icon,
  label,
  disabled = false,
  danger = false,
  onSelect,
}: TabMenuActionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`session-context-menu__item ${danger ? "session-context-menu__item--danger" : ""}`}
      onClick={onSelect}
    >
      <span className="session-context-menu__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="session-context-menu__text">{label}</span>
    </button>
  );
}

/**
 * Tab strip rendered directly below the session toolbar. Switches between
 * sessions kept open by the multi-tab mode. Hidden on mobile and until at
 * least two sessions are open, so the strip never duplicates the toolbar title.
 */
export default function SessionViewerTabs({
  tabs,
  activeTabId,
  isMobile,
  pinnedTabIds,
  canReopenClosedTab = false,
  liveSessionIds,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onCloseAll,
  onTogglePin,
  onReopenClosed,
}: SessionViewerTabsProps) {
  const { t } = useTranslation();
  const { copyText } = useClipboard();
  const stripRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setMenuPos(null);
  }, []);

  // Clamp menu within viewport using real rendered dimensions.
  useLayoutEffect(() => {
    if (!contextMenu) return;
    const menuEl = menuRef.current;
    const width = menuEl?.offsetWidth || MENU_WIDTH;
    const height = menuEl?.offsetHeight || MENU_FALLBACK_HEIGHT;
    const left = Math.max(
      VIEWPORT_GUTTER,
      Math.min(contextMenu.x, window.innerWidth - width - VIEWPORT_GUTTER),
    );
    const top = Math.max(
      VIEWPORT_GUTTER,
      Math.min(contextMenu.y, window.innerHeight - height - VIEWPORT_GUTTER),
    );
    setMenuPos({ left, top });
  }, [contextMenu]);

  // Focus the first enabled item when the context menu opens.
  useEffect(() => {
    if (!contextMenu) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [contextMenu]);

  // Dismiss menu on outside press, window blur, scroll, or resize.
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeContextMenu();
      }
    };
    const handleDismiss = () => closeContextMenu();
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("blur", handleDismiss);
    window.addEventListener("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("blur", handleDismiss);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [contextMenu, closeContextMenu]);

  // Close menu if the targeted tab is no longer present.
  useEffect(() => {
    if (!contextMenu?.tabId) return;
    if (!tabs.some((tab) => tab.id === contextMenu.tabId)) {
      closeContextMenu();
    }
  }, [tabs, contextMenu, closeContextMenu]);

  const focusMenuItem = useCallback(
    (direction: "first" | "last" | "next" | "previous") => {
      const menu = menuRef.current;
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
      );
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex = 0;
      if (direction === "last") nextIndex = items.length - 1;
      else if (direction === "next")
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      else if (direction === "previous")
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      items[nextIndex]?.focus();
    },
    [],
  );

  const runAndClose = useCallback(
    (action: () => void) => {
      action();
      closeContextMenu();
    },
    [closeContextMenu],
  );

  const hasPinnedTabs = (pinnedTabIds?.size ?? 0) > 0;
  if (isMobile || (tabs.length < 2 && !hasPinnedTabs)) {
    return null;
  }

  const enableWindowDrag = shouldUseTauriDragRegion();

  const handleTabsMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!isTauri() || !enableWindowDrag) return;

    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, textarea, select, [role='button'], .no-drag, [data-no-window-drag]",
      )
    ) {
      return;
    }

    void getCurrentWindow().startDragging();
  };

  const handleStripWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      strip.scrollLeft += event.deltaY;
    }
  };

  const handleStripContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, tabId: null });
  };

  const handleTabContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    tabId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, tabId });
  };

  const menuTab = contextMenu?.tabId
    ? tabs.find((tab) => tab.id === contextMenu.tabId) ?? null
    : null;
  const menuTabIndex = menuTab ? tabs.findIndex((tab) => tab.id === menuTab.id) : -1;
  const isMenuTabPinned = menuTab ? (pinnedTabIds?.has(menuTab.id) ?? false) : false;

  const isPinned = (id: string) => pinnedTabIds?.has(id) ?? false;
  const hasUnpinnedOther = menuTab
    ? tabs.some((tab) => tab.id !== menuTab.id && !isPinned(tab.id))
    : false;
  const hasUnpinnedLeft =
    menuTabIndex > 0 &&
    tabs.slice(0, menuTabIndex).some((tab) => !isPinned(tab.id));
  const hasUnpinnedRight =
    menuTabIndex >= 0 &&
    menuTabIndex < tabs.length - 1 &&
    tabs.slice(menuTabIndex + 1).some((tab) => !isPinned(tab.id));
  const hasAnyUnpinned = tabs.some((tab) => !isPinned(tab.id));

  const renderedContextMenu = contextMenu
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("session.tabs.menuAriaLabel", "Tab actions")}
          className="session-context-menu fixed z-[9999]"
          style={{
            left:
              menuPos?.left ??
              Math.max(
                VIEWPORT_GUTTER,
                Math.min(
                  contextMenu.x,
                  window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER,
                ),
              ),
            top:
              menuPos?.top ??
              Math.max(
                VIEWPORT_GUTTER,
                Math.min(
                  contextMenu.y,
                  window.innerHeight - MENU_FALLBACK_HEIGHT - VIEWPORT_GUTTER,
                ),
              ),
          }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusMenuItem("next");
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem("previous");
            } else if (event.key === "Home") {
              event.preventDefault();
              focusMenuItem("first");
            } else if (event.key === "End") {
              event.preventDefault();
              focusMenuItem("last");
            } else if (event.key === "Escape" || event.key === "Tab") {
              event.preventDefault();
              closeContextMenu();
            }
          }}
        >
          {menuTab ? (
            <>
              {onTogglePin ? (
                <TabMenuAction
                  icon={isMenuTabPinned ? <PinOff /> : <Pin />}
                  label={
                    isMenuTabPinned
                      ? t("session.tabs.unpin", "Unpin tab")
                      : t("session.tabs.pin", "Pin tab")
                  }
                  onSelect={() => runAndClose(() => onTogglePin(menuTab.id))}
                />
              ) : null}
              <TabMenuAction
                icon={<Copy />}
                label={t("session.tabs.copyPath", "Copy session path")}
                onSelect={() =>
                  runAndClose(() => {
                    void copyText(menuTab.path);
                  })
                }
              />
              <div className="session-context-menu__separator" role="separator" />
              <TabMenuAction
                icon={<X />}
                label={t("session.tabs.close", "Close tab")}
                onSelect={() => runAndClose(() => onClose(menuTab.id))}
              />
              {onCloseOthers ? (
                <TabMenuAction
                  icon={<XCircle />}
                  label={t("session.tabs.closeOthers", "Close other tabs")}
                  disabled={!hasUnpinnedOther}
                  onSelect={() => runAndClose(() => onCloseOthers(menuTab.id))}
                />
              ) : null}
              {onCloseToLeft ? (
                <TabMenuAction
                  icon={<ArrowLeftToLine />}
                  label={t("session.tabs.closeToLeft", "Close tabs to the left")}
                  disabled={!hasUnpinnedLeft}
                  onSelect={() => runAndClose(() => onCloseToLeft(menuTab.id))}
                />
              ) : null}
              {onCloseToRight ? (
                <TabMenuAction
                  icon={<ArrowRightToLine />}
                  label={t("session.tabs.closeToRight", "Close tabs to the right")}
                  disabled={!hasUnpinnedRight}
                  onSelect={() => runAndClose(() => onCloseToRight(menuTab.id))}
                />
              ) : null}
              {onCloseAll ? (
                <TabMenuAction
                  icon={<XCircle />}
                  label={t("session.tabs.closeAll", "Close all tabs")}
                  disabled={!hasAnyUnpinned}
                  danger={hasAnyUnpinned}
                  onSelect={() => runAndClose(onCloseAll)}
                />
              ) : null}
              {onReopenClosed ? (
                <>
                  <div
                    className="session-context-menu__separator"
                    role="separator"
                  />
                  <TabMenuAction
                    icon={<RotateCcw />}
                    label={t("session.tabs.reopenClosed", "Reopen closed tab")}
                    disabled={!canReopenClosedTab}
                    onSelect={() => runAndClose(onReopenClosed)}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              {onReopenClosed ? (
                <TabMenuAction
                  icon={<RotateCcw />}
                  label={t("session.tabs.reopenClosed", "Reopen closed tab")}
                  disabled={!canReopenClosedTab}
                  onSelect={() => runAndClose(onReopenClosed)}
                />
              ) : null}
              {onCloseAll ? (
                <TabMenuAction
                  icon={<XCircle />}
                  label={t("session.tabs.closeAll", "Close all tabs")}
                  disabled={!hasAnyUnpinned}
                  danger={hasAnyUnpinned}
                  onSelect={() => runAndClose(onCloseAll)}
                />
              ) : null}
            </>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        ref={stripRef}
        className="flex items-center gap-1 px-2 h-9 border-b border-border/30 overflow-x-auto"
        data-session-tabs
        {...(enableWindowDrag ? { "data-tauri-drag-region": true } : {})}
        onMouseDown={handleTabsMouseDown}
        onWheel={handleStripWheel}
        onContextMenu={handleStripContextMenu}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const pinned = isPinned(tab.id);
          const isLive = liveSessionIds?.has(tab.id) ?? false;
          const label = getTabLabel(tab);

          return (
            <div
              key={tab.id}
              data-active={active || undefined}
              data-pinned={pinned || undefined}
              className={`group flex items-center shrink-0 min-w-0 rounded-md ${
                active ? "bg-secondary" : "hover:bg-secondary/60"
              }`}
              onContextMenu={(event) => handleTabContextMenu(event, tab.id)}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  if (!pinned) {
                    onClose(tab.id);
                  }
                }
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(tab)}
                aria-current={active ? "true" : undefined}
                title={label}
                className={`flex items-center gap-1.5 h-7 pl-2 ${
                  pinned ? "pr-2" : "pr-1"
                } rounded-md text-xs min-w-0 outline-none ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {pinned && (
                  <Pin
                    className="h-3 w-3 shrink-0 text-muted-foreground/80"
                    aria-hidden="true"
                  />
                )}
                {isLive && (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0"
                    />
                    <span className="sr-only">
                      {t("session.tabs.live", "Live")}
                    </span>
                  </>
                )}
                <span
                  className={`truncate ${pinned ? "max-w-[120px]" : "max-w-[160px]"}`}
                >
                  {label}
                </span>
              </button>
              {!pinned && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                  title={t("session.tabs.close", "Close tab")}
                  aria-label={t("session.tabs.close", "Close tab")}
                  className={`flex items-center justify-center h-7 w-6 mr-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary-hover focus-visible:opacity-100 ${
                    active ? "" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {renderedContextMenu}
    </>
  );
}
