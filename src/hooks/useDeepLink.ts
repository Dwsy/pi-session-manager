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
    // Guard: skip in non-Tauri environments (browser dev)
    if (!(window as any).__TAURI_INTERNALS__) return;

    let unlisten: (() => void) | undefined;

    listen<string>('deep-link://navigate', (event) => {
      const url = event.payload;
      if (!url) return;

      try {
        onNavigateRef.current(deepLinkUrlToRoute(url));
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

export function deepLinkUrlToRoute(url: string): string {
  const parsed = new URL(url);
  const parts = [
    ...(parsed.protocol === 'pi-session:' && parsed.hostname ? [parsed.hostname] : []),
    ...parsed.pathname.split('/').filter(Boolean),
  ];

  if (parts.length === 0) return '/';

  if (parts[0] === 'sessions' && parts[1]) {
    return '/sessions/' + encodeURIComponent(decodeURIComponent(parts[1]));
  }

  if (parts[0] === 'projects' && parts[1]) {
    return '/projects/' + encodeURIComponent(decodeURIComponent(parts[1]));
  }

  const FEATURES = new Set(['kanban', 'dashboard', 'settings', 'terminal', 'favorites']);
  if (parts[0] && FEATURES.has(parts[0])) {
    return '/' + parts[0];
  }

  return '/';
}
