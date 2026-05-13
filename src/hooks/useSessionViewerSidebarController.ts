import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { type SessionTreeRef } from "@/components/session-tree/SessionTree";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";

const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 720;
const SIDEBAR_DEFAULT_WIDTH = 520;
const SIDEBAR_WIDTH_KEY = "pi-session-manager-sidebar-width";

export interface UseSessionViewerSidebarControllerOptions {
  isMobile: boolean;
  previewMode: boolean;
  traceMode: boolean;
  setShowMobileMenu: Dispatch<SetStateAction<boolean>>;
  setActiveEntryId: Dispatch<SetStateAction<string | null>>;
  setScrollTargetId: Dispatch<SetStateAction<string | null>>;
}

export function useSessionViewerSidebarController({
  isMobile,
  previewMode,
  traceMode,
  setShowMobileMenu,
  setActiveEntryId,
  setScrollTargetId,
}: UseSessionViewerSidebarControllerOptions) {
  const [showSidebar, setShowSidebar] = useState(false);
  const { sidebarWidth, isResizing, handleMouseDown } = useResizableSidebar({
    storageKey: SIDEBAR_WIDTH_KEY,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    maxWidth: SIDEBAR_MAX_WIDTH,
  });

  const sidebarRef = useRef<HTMLElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<SessionTreeRef>(null);

  const handleToggleSidebar = useCallback(() => {
    if (previewMode) {
      return;
    }
    setShowMobileMenu(false);
    setShowSidebar((prev) => {
      const next = !prev;
      if (next && isMobile) {
        setTimeout(() => treeRef.current?.focusSearch(), 100);
      }
      return next;
    });
  }, [isMobile, previewMode, setShowMobileMenu]);

  const handleTreeNodeClick = useCallback(
    (leafId: string, targetId: string) => {
      setActiveEntryId(leafId);
      setScrollTargetId(targetId);
    },
    [setActiveEntryId, setScrollTargetId],
  );

  const contentPaddingLeft =
    !previewMode && !traceMode && showSidebar && !isMobile
      ? `${sidebarWidth}px`
      : 0;

  return {
    showSidebar,
    setShowSidebar,
    sidebarWidth,
    isResizing,
    handleMouseDown,
    sidebarRef,
    resizeHandleRef,
    treeRef,
    handleToggleSidebar,
    handleTreeNodeClick,
    contentPaddingLeft,
  };
}
