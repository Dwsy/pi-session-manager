import { useEffect, useRef } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  /**
   * Minimum distance (in pixels) to be considered a swipe
   * @default 50
   */
  threshold?: number;
  /**
   * If true, prevents default touch behavior (e.g. scrolling) when swiping
   * @default false
   */
  preventDefault?: boolean;
  /**
   * Only trigger swipe if the movement happens within this zone from the edge
   * For example, edgeZone: 30 means it only triggers if swipe starts within 30px of the edge.
   */
  edgeZone?: number;
}

/**
 * A custom hook to detect swipe gestures on a specific element or globally on window.
 */
export function useSwipe(
  ref: React.RefObject<HTMLElement | null>,
  options: SwipeOptions,
) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const element = ref.current || window;

    const handleTouchStart = (e: TouchEvent | Event) => {
      const touchEvent = e as TouchEvent;
      if (!touchEvent.touches || touchEvent.touches.length === 0) return;

      const touch = touchEvent.touches[0];
      const edgeZone = optionsRef.current.edgeZone;

      // If edgeZone is set, ignore swipes that don't start near the edge
      if (edgeZone !== undefined && edgeZone > 0) {
        if (
          touch.clientX > edgeZone &&
          touch.clientX < window.innerWidth - edgeZone
        ) {
          return; // Not an edge swipe
        }
      }

      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e: TouchEvent | Event) => {
      const touchEvent = e as TouchEvent;
      if (
        !touchEvent.changedTouches ||
        touchEvent.changedTouches.length === 0 ||
        !touchStart.current
      )
        return;

      const touch = touchEvent.changedTouches[0];
      const endX = touch.clientX;
      const endY = touch.clientY;
      const timeDiff = Date.now() - touchStart.current.time;

      // Ignore swipes that take too long (e.g. holding screen)
      if (timeDiff > 500) {
        touchStart.current = null;
        return;
      }

      const diffX = endX - touchStart.current.x;
      const diffY = endY - touchStart.current.y;

      const absDiffX = Math.abs(diffX);
      const absDiffY = Math.abs(diffY);

      const threshold = optionsRef.current.threshold || 50;

      if (Math.max(absDiffX, absDiffY) > threshold) {
        // Horizontal swipe
        if (absDiffX > absDiffY) {
          if (diffX > 0 && optionsRef.current.onSwipeRight) {
            optionsRef.current.onSwipeRight();
          } else if (diffX < 0 && optionsRef.current.onSwipeLeft) {
            optionsRef.current.onSwipeLeft();
          }
        }
        // Vertical swipe
        else {
          if (diffY > 0 && optionsRef.current.onSwipeDown) {
            optionsRef.current.onSwipeDown();
          } else if (diffY < 0 && optionsRef.current.onSwipeUp) {
            optionsRef.current.onSwipeUp();
          }
        }
      }

      touchStart.current = null;
    };

    const handleTouchMove = (e: TouchEvent | Event) => {
      if (optionsRef.current.preventDefault && touchStart.current) {
        e.preventDefault();
      }
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    if (optionsRef.current.preventDefault) {
      element.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
    }

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
      if (optionsRef.current.preventDefault) {
        element.removeEventListener("touchmove", handleTouchMove);
      }
    };
  }, [ref]);
}
