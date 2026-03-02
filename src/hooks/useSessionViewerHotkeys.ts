import { useEffect } from "react";

export interface UseSessionViewerHotkeysOptions {
  onToggleThinking: () => void;
  onToggleToolsExpanded: () => void;
  onToggleSidebar: () => void;
}

export function useSessionViewerHotkeys({
  onToggleThinking,
  onToggleToolsExpanded,
  onToggleSidebar,
}: UseSessionViewerHotkeysOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (event.key === "t") {
        event.preventDefault();
        event.stopPropagation();
        onToggleThinking();
        return;
      }

      if (event.key === "o") {
        event.preventDefault();
        event.stopPropagation();
        onToggleToolsExpanded();
        return;
      }

      if (event.key === "f") {
        event.preventDefault();
        event.stopPropagation();
        onToggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onToggleThinking, onToggleToolsExpanded, onToggleSidebar]);
}
