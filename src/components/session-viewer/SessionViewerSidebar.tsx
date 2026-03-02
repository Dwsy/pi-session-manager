import type { MouseEventHandler, RefObject } from "react";

import SessionTree, { type SessionTreeRef } from "../SessionTree";

import type { SessionEntry } from "../../types";

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
  hideSidebarTitle,
}: SessionViewerSidebarProps) {
  if (!showSidebar) {
    return null;
  }

  return (
    <>
      <aside
        ref={sidebarRef}
        className="session-sidebar absolute left-0 top-0 bottom-0 z-20 shadow-xl"
        style={{ width: isMobile ? "100vw" : `${sidebarWidth}px` }}
      >
        {isMobile && (
          <button
            type="button"
            onClick={onCloseSidebar}
            className="absolute top-2 right-2 z-30 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
            title={hideSidebarTitle}
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
        )}
        <SessionTree
          ref={treeRef}
          entries={entries}
          activeLeafId={activeEntryId ?? undefined}
          onNodeClick={onNodeClick}
        />
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
