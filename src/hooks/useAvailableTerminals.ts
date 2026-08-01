import { useState, useEffect } from "react";
import { invoke } from "@/transport";

let cachedTerminals: string[] | null = null;
let pendingTerminalScan: Promise<string[]> | null = null;

function loadAvailableTerminals(): Promise<string[]> {
  if (cachedTerminals) {
    return Promise.resolve(cachedTerminals);
  }

  if (!pendingTerminalScan) {
    pendingTerminalScan = invoke<string[]>("list_available_terminals")
      .then((list) => {
        cachedTerminals = Array.isArray(list) ? list : [];
        return cachedTerminals;
      })
      .catch(() => {
        // Keep the existing fallback behaviour and allow a later mount to retry.
        pendingTerminalScan = null;
        return [];
      });
  }

  return pendingTerminalScan;
}

/**
 * Fetch the list of terminal emulator IDs installed on this machine.
 * A completed scan is shared for the lifetime of the app so opening the
 * terminal settings again does not repeat system-level probing.
 */
export function useAvailableTerminals(): string[] {
  const [terminals, setTerminals] = useState<string[]>(
    () => cachedTerminals ?? [],
  );

  useEffect(() => {
    let cancelled = false;

    void loadAvailableTerminals().then((list) => {
      if (!cancelled) {
        setTerminals(list);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return terminals;
}
