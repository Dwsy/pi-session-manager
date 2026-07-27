import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type RefObject,
} from "react";
import { X } from "lucide-react";

import SessionTree, { type SessionTreeRef } from "@/components/session-tree/SessionTree";
import { getRuntimeSessionLabels } from "@/runtime-data/sessionSource";

import type { PsmSessionTreeViewRuntimeRegistration } from "@/plugins/runtime-host/types";
import type { SessionEntry } from "@/types";

interface SessionLabelState {
  sessionPath: string;
  labels: Record<string, string>;
}

export interface SessionViewerSidebarProps {
  showSidebar: boolean;
  open?: boolean;
  isMobile: boolean;
  placement?: "overlay" | "embedded";
  sidebarWidth: number;
  sidebarMinWidth: number;
  sidebarMaxWidth: number;
  isResizing: boolean;
  entries: SessionEntry[];
  sessionPath: string;
  hasMoreHistory?: boolean;
  pluginViews?: PsmSessionTreeViewRuntimeRegistration[];
  activeEntryId: string | null;
  onCloseSidebar: () => void;
  onNodeClick: (leafId: string, targetId: string) => void;
  onResizeMouseDown: MouseEventHandler<HTMLDivElement>;
  onResizeKeyDown: KeyboardEventHandler<HTMLDivElement>;
  treeRef: RefObject<SessionTreeRef>;
  sidebarRef: RefObject<HTMLElement>;
  resizeHandleRef: RefObject<HTMLDivElement>;
  outlineTitle: string;
  hideSidebarTitle: string;
}

export default function SessionViewerSidebar({
  showSidebar,
  open = showSidebar,
  isMobile,
  placement = "overlay",
  sidebarWidth,
  sidebarMinWidth,
  sidebarMaxWidth,
  isResizing,
  entries,
  sessionPath,
  hasMoreHistory = false,
  pluginViews = [],
  activeEntryId,
  onCloseSidebar,
  onNodeClick,
  onResizeMouseDown,
  onResizeKeyDown,
  treeRef,
  sidebarRef,
  resizeHandleRef,
  outlineTitle,
  hideSidebarTitle,
}: SessionViewerSidebarProps) {
  const [labelState, setLabelState] = useState<SessionLabelState>({
    sessionPath,
    labels: {},
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    void getRuntimeSessionLabels(sessionPath)
      .then((labels) => {
        if (!cancelled) {
          setLabelState({ sessionPath, labels });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("[SessionViewerSidebar] Failed to load session labels:", error);
          setLabelState({ sessionPath, labels: {} });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, sessionPath, entries.length]);

  const resolvedLabelsByTargetId = useMemo(
    () => (labelState.sessionPath === sessionPath ? labelState.labels : {}),
    [labelState, sessionPath],
  );

  if (!showSidebar) {
    return null;
  }

  const isEmbedded = placement === "embedded" && !isMobile;

  const mobileSidebarStyle: CSSProperties = {
    width: "min(88vw, 420px)",
    maxWidth: "420px",
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 70,
  };

  const desktopSidebarStyle: CSSProperties = isEmbedded
    ? {
        width: open ? `${sidebarWidth}px` : 0,
        borderRightWidth: open ? undefined : 0,
      }
    : { width: `${sidebarWidth}px` };

  return (
    <>
      {isMobile && (
        <button
          type="button"
          onClick={onCloseSidebar}
          className="session-sidebar-backdrop"
          aria-label={hideSidebarTitle}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`session-sidebar ${open ? "session-sidebar--open" : "session-sidebar--closed"} ${isMobile ? "safe-area-top session-sidebar--mobile" : isEmbedded ? "session-sidebar--embedded" : "session-sidebar--overlay"}`}
        style={isMobile ? mobileSidebarStyle : desktopSidebarStyle}
        aria-hidden={!open}
        aria-labelledby="session-sidebar-title"
      >
        <header className="session-sidebar-header">
          <div className="session-sidebar-heading">
            <h2 id="session-sidebar-title" className="session-sidebar-title">
              {outlineTitle}
            </h2>
            <div className="session-sidebar-subtitle">
              {entries.length} entries{pluginViews.length > 0 ? ` · ${pluginViews.length} views` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseSidebar}
            className="session-sidebar-close"
            title={hideSidebarTitle}
            aria-label={hideSidebarTitle}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="session-sidebar-body">
          <SessionTree
            ref={treeRef}
            entries={entries}
            activeLeafId={activeEntryId ?? undefined}
            onNodeClick={onNodeClick}
            resolvedLabelsByTargetId={resolvedLabelsByTargetId}
            pluginViews={pluginViews}
            sessionPath={sessionPath}
            hasMoreHistory={hasMoreHistory}
          />
        </div>
      </aside>

      {!isMobile && open && (
        <div
          ref={resizeHandleRef}
          className={`sidebar-resize-handle ${isEmbedded ? "sidebar-resize-handle--embedded" : "absolute z-30"} ${isResizing ? "resizing" : ""}`}
          style={isEmbedded ? undefined : { left: `${sidebarWidth}px` }}
          role="separator"
          aria-orientation="vertical"
          aria-label={`${outlineTitle} width`}
          aria-valuemin={sidebarMinWidth}
          aria-valuemax={sidebarMaxWidth}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          onMouseDown={onResizeMouseDown}
          onKeyDown={onResizeKeyDown}
        >
          <div className="sidebar-resize-handle-inner" />
        </div>
      )}
    </>
  );
}
