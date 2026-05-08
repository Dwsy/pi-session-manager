import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Listen for pi-session:// deep link events from Tauri and navigate.
 *
 * Supported routes:
 *   pi-session://                          → /#/  (home)
 *   pi-session://sessions/{sessionId}      → /#/sessions/{sessionId}
 *   pi-session://kanban                    → /#/kanban
 *   pi-session://dashboard                 → /#/dashboard
 *   pi-session://settings                  → /#/settings
 *   pi-session://terminal                  → /#/terminal
 *   pi-session://favorites                 → /#/favorites
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

        const parts = routePath.split('/').filter(Boolean);

        // /sessions/:id
        if (parts[0] === 'sessions' && parts[1]) {
          onNavigateRef.current('/sessions/' + encodeURIComponent(decodeURIComponent(parts[1])));
          return;
        }

        // /projects/:path
        if (parts[0] === 'projects' && parts[1]) {
          onNavigateRef.current('/projects/' + encodeURIComponent(decodeURIComponent(parts[1])));
          return;
        }

        // Feature routes: /kanban, /dashboard, /settings, /terminal, /favorites
        const FEATURES = new Set(['kanban', 'dashboard', 'settings', 'terminal', 'favorites']);
        if (parts[0] && FEATURES.has(parts[0])) {
          onNavigateRef.current('/' + parts[0]);
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
