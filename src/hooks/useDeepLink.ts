import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Listen for pi-session:// deep link events from Tauri and navigate.
 *
 * Only session routes are supported for bidirectional sync:
 *   pi-session://                          → /#/  (home)
 *   pi-session://sessions/{sessionId}      → /#/sessions/{sessionId}
 *
 * Other paths are ignored — they have no state sync in useRouteSync.
 */
export function useDeepLink({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  // Stabilize callback ref to avoid re-registering listener every render
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>('deep-link://navigate', (event) => {
      const url = event.payload;
      if (!url) return;

      try {
        const parsed = new URL(url);
        const routePath = parsed.pathname;

        if (!routePath || routePath === '/') {
          onNavigateRef.current('/');
          return;
        }

        // Only accept /sessions/:id — ignore unsupported routes
        const parts = routePath.split('/').filter(Boolean);
        if (parts[0] === 'sessions' && parts[1]) {
          onNavigateRef.current('/sessions/' + encodeURIComponent(decodeURIComponent(parts[1])));
          return;
        }

        // Unsupported route: redirect to home
        onNavigateRef.current('/');
      } catch {
        onNavigateRef.current('/');
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);
}
