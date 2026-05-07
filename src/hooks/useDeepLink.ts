import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Listen for pi-session:// deep link events from Tauri and navigate.
 *
 * URL format maps directly to internal HashRouter paths:
 *   pi-session://                          → /#/  (home)
 *   pi-session://sessions/{sessionId}      → /#/sessions/{sessionId}
 *   pi-session://projects/{encodedPath}    → /#/projects/{encodedPath}
 *   pi-session://kanban                    → /#/kanban
 *   pi-session://dashboard                 → /#/dashboard
 *   pi-session://settings                  → /#/settings
 */
export function useDeepLink({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>('deep-link://navigate', (event) => {
      const url = event.payload;
      if (!url) return;

      try {
        const parsed = new URL(url);
        // pi-session://sessions/abc123 → pathname = "/sessions/abc123"
        const routePath = parsed.pathname;

        if (!routePath || routePath === '/') {
          onNavigate('/');
          return;
        }

        // Strip leading slash: "/sessions/abc" → "sessions/abc"
        const path = routePath.startsWith('/') ? routePath.slice(1) : routePath;
        onNavigate('/' + path);
      } catch {
        // Invalid URL, ignore
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [onNavigate]);
}
