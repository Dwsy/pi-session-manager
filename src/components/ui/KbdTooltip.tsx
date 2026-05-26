import { useState, useRef, useEffect, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

const isMac =
  navigator.platform.toUpperCase().includes("MAC") ||
  navigator.userAgent.includes("Macintosh");

interface KbdTooltipProps {
  shortcut: string;
  label?: string;
  children: ReactNode;
  position?: "top" | "bottom" | "right";
  delay?: number;
  className?: string;
}

/**
 * Wraps a button/element and shows a keyboard shortcut tooltip on hover.
 * Hidden on mobile devices. Adapts modifier symbols per platform.
 */
export default function KbdTooltip({
  shortcut,
  label,
  children,
  position = "bottom",
  delay = 400,
  className = "relative inline-flex",
}: KbdTooltipProps) {
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (isMobile) return <>{children}</>;

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  // Platform-aware modifier mapping
  const macMap: Record<string, string> = {
    Cmd: "⌘",
    Ctrl: "⌃",
    Alt: "⌥",
    Shift: "⇧",
  };
  const otherMap: Record<string, string> = {
    Cmd: "Ctrl",
    Ctrl: "Ctrl",
    Alt: "Alt",
    Shift: "Shift",
  };
  const modMap = isMac ? macMap : otherMap;

  const keys = shortcut.split("+").map((k) => modMap[k] ?? k);

  const posClass =
    position === "top"
      ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
      : position === "right"
        ? "left-full top-1/2 ml-1.5 -translate-y-1/2"
        : "left-1/2 top-full mt-1.5 -translate-x-1/2";

  return (
    <div
      ref={ref}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          className={`absolute ${posClass} z-50 pointer-events-none
            flex items-center gap-1 px-1.5 py-0.5 rounded-md
            bg-background border border-[var(--borderMuted)]
            shadow-sm whitespace-nowrap text-[11px] text-[var(--muted)]`}
        >
          {label && <span className="mr-0.5">{label}</span>}
          {keys.map((k, i) => (
            <kbd
              key={i}
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                rounded bg-[var(--body-bg)] border border-[var(--borderMuted)]
                text-[10px] font-mono leading-none text-[var(--text)]"
            >
              {k}
            </kbd>
          ))}
        </div>
      )}
    </div>
  );
}
