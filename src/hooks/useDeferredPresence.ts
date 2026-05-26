import { useEffect, useState } from "react";

export function useDeferredPresence(visible: boolean, delayMs = 180) {
  const [present, setPresent] = useState(visible);

  useEffect(() => {
    if (visible) {
      setPresent(true);
      return;
    }

    const timeout = window.setTimeout(() => setPresent(false), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, visible]);

  return present;
}
