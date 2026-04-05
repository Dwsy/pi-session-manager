import type { CSSProperties, MouseEventHandler, RefObject } from "react";

import SessionTree, { type SessionTreeRef } from "@/components/session-tree/SessionTree";

import type { SessionEntry } from "@/types";

export interface SessionViewerSidebarProps {
  showSidebar: boolean;
  isMobile: boolean;
  sidebarWidth: number;
  isResizing: boolean;
  entries: SessionEntry[];
  activeEntryId: string | null;
  onCloseSidebar: () => void;
  onNodeClick: (leafId: string, targetId: string) => void;
  onResizeMouseDown: MouseEventHandler<HTMLDivElement>;
  treeRef: RefObject<SessionTreeRef>;
  sidebarRef: RefObject<HTMLElement>;
  resizeHandleRef: RefObject<HTMLDivElement>;
  outlineTitle: string;
  hideSidebarTitle: string;
}

export default function SessionViewerSidebar({
  showSidebar,
  isMobile,
  sidebarWidth,
  isResizing,
  entries,
  activeEntryId,
  onCloseSidebar,
  onNodeClick,
  onResizeMouseDown,
  treeRef,
  sidebarRef,
  resizeHandleRef,
  outlineTitle,
  hideSidebarTitle,
}: SessionViewerSidebarProps) {
  if (!showSidebar) {
    return null;
  }

  const mobileSidebarStyle: CSSProperties = {
    width: "min(88vw, 420px)",
    maxWidth: "420px",
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 70,
    boxShadow: "8px 0 24px rgba(0, 0, 0, 0.22)",
    borderRight: "1px solid rgba(var(--color-border), 0.85)",
  };

  const desktopSidebarStyle: CSSProperties = { width: `${sidebarWidth}px` };

  return (
    <>
      {isMobile && (
        <button
          type="button"
          onClick={onCloseSidebar}
          className="fixed inset-0 z-[60] bg-black/18"
          aria-label={hideSidebarTitle}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`session-sidebar ${isMobile ? "safe-area-top" : "absolute left-0 top-0 bottom-0 z-20 shadow-xl"}`}
        style={isMobile ? mobileSidebarStyle : desktopSidebarStyle}
      >
        {isMobile ? (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur-sm flex-shrink-0">
            <h2 className="text-sm font-semibold text-foreground">
              {outlineTitle}
            </h2>
            <button
              type="button"
              onClick={onCloseSidebar}
              className="h-9 w-9 inline-flex items-center justify-center border border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              title={hideSidebarTitle}
              aria-label={hideSidebarTitle}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="flex-1 min-h-0">
          <SessionTree
            ref={treeRef}
            entries={entries}
            activeLeafId={activeEntryId ?? undefined}
            onNodeClick={onNodeClick}
          />
        </div>
      </aside>

      {!isMobile && (
        <div
          ref={resizeHandleRef}
          className={`sidebar-resize-handle absolute z-30 ${isResizing ? "resizing" : ""}`}
          style={{ left: `${sidebarWidth}px` }}
          onMouseDown={onResizeMouseDown}
        >
          <div className="sidebar-resize-handle-inner" />
        </div>
      )}
    </>
  );
}
