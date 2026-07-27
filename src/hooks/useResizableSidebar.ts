import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler, MouseEventHandler } from "react";

export interface UseResizableSidebarOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export interface UseResizableSidebarResult {
  sidebarWidth: number;
  isResizing: boolean;
  minWidth: number;
  maxWidth: number;
  handleMouseDown: MouseEventHandler<HTMLElement>;
  handleKeyDown: KeyboardEventHandler<HTMLElement>;
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

  const persistWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // Ignore storage write errors and keep UI responsive.
    }
  }, [storageKey]);

  const updateWidth = useCallback((width: number, persist = false) => {
    const nextWidth = clampWidth(width, minWidth, maxWidth);
    sidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
    if (persist) persistWidth(nextWidth);
  }, [maxWidth, minWidth, persistWidth]);

  const handleMouseDown = useCallback<MouseEventHandler<HTMLElement>>((event) => {
    event.preventDefault();
    setIsResizing(true);
    startXRef.current = event.clientX;
    startWidthRef.current = sidebarWidthRef.current;
  }, []);

  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLElement>>((event) => {
    const step = event.shiftKey ? 32 : 16;
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = sidebarWidthRef.current - step;
    else if (event.key === "ArrowRight") nextWidth = sidebarWidthRef.current + step;
    else if (event.key === "Home") nextWidth = minWidth;
    else if (event.key === "End") nextWidth = maxWidth;
    if (nextWidth === null) return;
    event.preventDefault();
    updateWidth(nextWidth, true);
  }, [maxWidth, minWidth, updateWidth]);

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

      updateWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);

      persistWidth(sidebarWidthRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, maxWidth, minWidth, persistWidth, updateWidth]);

  return {
    sidebarWidth,
    isResizing,
    minWidth,
    maxWidth,
    handleMouseDown,
    handleKeyDown,
  };
}
