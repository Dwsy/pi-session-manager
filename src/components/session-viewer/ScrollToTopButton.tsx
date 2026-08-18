import type { CSSProperties } from "react";
import { ArrowUp } from "lucide-react";

export interface ScrollToTopButtonProps {
  title: string;
  /** When false the button is hidden (faded out) and non-interactive. */
  visible: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: CSSProperties;
}

/**
 * Centered "scroll to top" affordance.
 * Revealed on demand — e.g. when the pointer hovers the top portion of the
 * view — and sits near the top of the stage.
 */
export default function ScrollToTopButton({
  title,
  visible,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
}: ScrollToTopButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`fixed left-1/2 top-14 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg transition-all duration-150 hover:bg-secondary-hover ${
        visible
          ? "pointer-events-auto opacity-100 translate-y-0"
          : "pointer-events-none opacity-0 -translate-y-2"
      }`}
      title={title}
      aria-label={title}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
