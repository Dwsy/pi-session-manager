import { useEffect } from 'react';
import { isTauri } from '../transport';

/**
 * Override WebKit's default context menu with a minimal native-feel version.
 * Prevents the browser-style "Inspect Element", "Save Image As", etc. from appearing.
 */
export function useContextMenuOverride() {
  useEffect(() => {
    if (!isTauri()) return;

    const handleContextMenu = (e: MouseEvent) => {
      // Allow context menu on editable elements (inputs, textareas, contentEditable)
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return; // Allow native context menu for text editing
      }

      // Preserve the WebView's native image actions for embedded message images.
      if (target.closest('img[src^="data:image/"]')) {
        return;
      }

      // Prevent default context menu for all other elements
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
}
