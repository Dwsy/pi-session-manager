import { useEffect, useState } from 'react'

export type LayoutMode = "mobile" | "compact" | "desktop";

export function getLayoutMode(width: number): LayoutMode {
  if (width < 768) return "mobile";
  if (width < 1120) return "compact";
  return "desktop";
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState(() => getLayoutMode(typeof window === "undefined" ? 1120 : window.innerWidth));

  useEffect(() => {
    const handleResize = () => setMode(getLayoutMode(window.innerWidth));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return mode;
}

export function useIsMobile(): boolean {
  return useLayoutMode() === "mobile";
}
