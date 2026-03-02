import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEventHandler } from "react";

export interface UseResizableSidebarOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export interface UseResizableSidebarResult {
  sidebarWidth: number;
  isResizing: boolean;
  handleMouseDown: MouseEventHandler<HTMLElement>;
}

function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  if (minWidth > maxWidth) {
    return width;
  }

  return Math.min(Math.max(width, minWidth), maxWidth);
}

function getInitialSidebarWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: UseResizableSidebarOptions): number {
  const fallbackWidth = clampWidth(defaultWidth, minWidth, maxWidth);

  try {
    const savedWidth = localStorage.getItem(storageKey);
    if (!savedWidth) {
      return fallbackWidth;
    }

    const parsedWidth = Number.parseInt(savedWidth, 10);
    if (Number.isNaN(parsedWidth)) {
      return fallbackWidth;
    }

    return clampWidth(parsedWidth, minWidth, maxWidth);
  } catch {
    return fallbackWidth;
  }
}

export function useResizableSidebar(
  options: UseResizableSidebarOptions,
): UseResizableSidebarResult {
  const { storageKey, defaultWidth, minWidth, maxWidth } = options;

  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    getInitialSidebarWidth({
      storageKey,
      defaultWidth,
      minWidth,
      maxWidth,
    }),
  );
  const [isResizing, setIsResizing] = useState(false);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const clampedWidth = clampWidth(sidebarWidthRef.current, minWidth, maxWidth);
    if (clampedWidth !== sidebarWidthRef.current) {
      sidebarWidthRef.current = clampedWidth;
      setSidebarWidth(clampedWidth);
    }
  }, [minWidth, maxWidth]);

  const handleMouseDown = useCallback<MouseEventHandler<HTMLElement>>((event) => {
    event.preventDefault();
    setIsResizing(true);
    startXRef.current = event.clientX;
    startWidthRef.current = sidebarWidthRef.current;
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - startXRef.current;
      const nextWidth = clampWidth(
        startWidthRef.current + deltaX,
        minWidth,
        maxWidth,
      );

      setSidebarWidth(nextWidth);
      sidebarWidthRef.current = nextWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);

      try {
        localStorage.setItem(storageKey, String(sidebarWidthRef.current));
      } catch {
        // Ignore storage write errors and keep UI responsive.
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, maxWidth, minWidth, storageKey]);

  return {
    sidebarWidth,
    isResizing,
    handleMouseDown,
  };
}
