import { useState, useEffect } from "react";
import { invoke } from "@/transport";

/**
 * Fetch the list of terminal emulator IDs installed on this machine.
 * Calls the Tauri/CLI `list_available_terminals` command once on mount.
 */
export function useAvailableTerminals(): string[] {
  const [terminals, setTerminals] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("list_available_terminals")
      .then((list) => {
        if (Array.isArray(list)) {
          setTerminals(list);
        }
      })
      .catch(() => {
        // Silently fail — fall back to showing all options
      });
  }, []);

  return terminals;
}
