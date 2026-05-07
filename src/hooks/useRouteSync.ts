import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildSessionUrl } from '../router/config';
import type { SessionInfo } from '../types';

interface RouteSyncOptions {
  setSelectedSession: (session: SessionInfo | null) => void;
  selectedSession: SessionInfo | null;
  sessions: SessionInfo[];
}

// Parse route: only session and root matter now
function parseRoute(pathname: string):
  | { route: 'session'; sessionId: string }
  | { route: 'root' } {
  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === 'sessions' && parts[1]) {
    return { route: 'session', sessionId: decodeURIComponent(parts[1]) };
  }
  return { route: 'root' };
}

export function useRouteSync({
  setSelectedSession,
  selectedSession,
  sessions,
}: RouteSyncOptions) {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── URL → State (session only) ──────────────────────────
  useEffect(() => {
    const parsed = parseRoute(location.pathname);

    if (parsed.route === 'session') {
      const session = sessions.find(s => s.id === parsed.sessionId);

      if (session) {
        // Session found in list — sync state if needed
        if (selectedSession?.id !== session.id) {
          setSelectedSession(session);
        }
      } else if (selectedSession) {
        // selectedSession already set (user clicked a session), trust it —
        // don't redirect. The session list may use a different data source
        // (usePaginatedSessions) that hasn't synced to `sessions` yet.
      } else if (sessions.length > 0) {
        // Deep-link / initial load: session not in list and nothing selected.
        // Redirect to home once to avoid showing a broken viewer.
        navigate('/', { replace: true });
      }
      // else: sessions not loaded yet, wait for next effect run
      return;
    }

    // root or anything else: clear session
    if (selectedSession) setSelectedSession(null);
  }, [location.pathname, sessions, selectedSession, setSelectedSession, navigate]);

  // ─── Navigation helpers ───────────────────────────────────
  const navigateToSession = useCallback(
    (id: string) => navigate(buildSessionUrl(id)),
    [navigate],
  );
  const navigateToSessions = useCallback(() => navigate('/'), [navigate]);

  return {
    navigateToSession,
    navigateToSessions,
  };
}
