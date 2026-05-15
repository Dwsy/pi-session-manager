import { useEffect } from 'react';

/**
 * Keep WebView warm when hidden to prevent WebKit throttling.
 * Without this, requestAnimationFrame drops to 1Hz when window is occluded.
 */
export function useKeepWarm(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let animationId: number;
    const keepWarm = () => {
      animationId = requestAnimationFrame(keepWarm);
    };
    keepWarm();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [enabled]);
}
