import type { CSSProperties } from "react";
import { ArrowDown } from "lucide-react";

export interface ScrollToBottomButtonProps {
  title: string;
  /** When false the button is hidden (faded out) and non-interactive. */
  visible: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: CSSProperties;
}

/**
 * Centered "scroll to bottom" affordance. Unlike {@link NewMessagesButton}
 * (which surfaces new activity in the bottom-right corner), this one is
 * revealed on demand — e.g. when the pointer hovers the bottom portion of the
 * view — and sits in the middle of the stage.
 */
export default function ScrollToBottomButton({
  title,
  visible,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
}: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`absolute left-1/2 bottom-4 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg transition-all duration-150 hover:bg-secondary-hover ${
        visible
          ? "pointer-events-auto opacity-100 translate-y-0"
          : "pointer-events-none opacity-0 translate-y-2"
      }`}
      title={title}
      aria-label={title}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowDown className="h-4 w-4" />
    </button>
  );
}
