import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";

import { isTauri } from "@/transport";
import type { SessionInfo } from "@/types";
import { getPathBasename, stripJsonlExt } from "@/utils/path";
import { shouldUseTauriDragRegion } from "@/utils/platformShortcuts";

export interface SessionViewerTabsProps {
  tabs: SessionInfo[];
  activeTabId: string | null;
  isMobile: boolean;
  liveSessionIds?: Set<string>;
  onSelect: (session: SessionInfo) => void;
  onClose: (sessionId: string) => void;
}

function getTabLabel(session: SessionInfo): string {
  return (
    session.name?.trim() ||
    stripJsonlExt(getPathBasename(session.path)) ||
    session.id
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
  liveSessionIds,
  onSelect,
  onClose,
}: SessionViewerTabsProps) {
  const { t } = useTranslation();

  if (isMobile || tabs.length < 2) {
    return null;
  }

  const enableWindowDrag = shouldUseTauriDragRegion();

  const handleTabsMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
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

  return (
    <div
      className="flex items-center gap-1 px-2 h-9 border-b border-border overflow-x-auto"
      data-session-tabs
      {...(enableWindowDrag ? { "data-tauri-drag-region": true } : {})}
      onMouseDown={handleTabsMouseDown}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const isLive = liveSessionIds?.has(tab.id) ?? false;
        const label = getTabLabel(tab);

        return (
          <div
            key={tab.id}
            data-active={active || undefined}
            className={`group flex items-center shrink-0 min-w-0 rounded-md ${
              active ? "bg-secondary" : "hover:bg-secondary/60"
            }`}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(tab.id);
              }
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(tab)}
              aria-current={active ? "true" : undefined}
              title={label}
              className={`flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md text-xs min-w-0 outline-none ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
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
              <span className="truncate max-w-[160px]">{label}</span>
            </button>
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
          </div>
        );
      })}
    </div>
  );
}
