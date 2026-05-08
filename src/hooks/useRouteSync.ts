import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildSessionUrl, buildFeatureUrl, parseRoute } from '../router/config';
import type { SessionInfo } from '../types';
import type { AppSidebarViewMode } from './app/useSidebarSessions';

interface RouteSyncOptions {
  setSelectedSession: (session: SessionInfo | null) => void;
  selectedSession: SessionInfo | null;
  sessions: SessionInfo[];
  setViewMode: (mode: AppSidebarViewMode) => void;
  setSelectedProject: (project: string | null) => void;
  setShowSettings: (show: boolean) => void;
  setShowTerminal: (show: boolean) => void;
  setShowFavorites: (show: boolean) => void;
}

export function useRouteSync({
  setSelectedSession,
  selectedSession,
  sessions,
  setViewMode,
  setSelectedProject,
  setShowSettings,
  setShowTerminal,
  setShowFavorites,
}: RouteSyncOptions) {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── URL → State (single source of truth) ─────────────
  // This effect syncs ALL app state from the URL.
  // No circular deps: we read selectedSession but only write when mismatch.
  useEffect(() => {
    const parsed = parseRoute(location.pathname);

    switch (parsed.route) {
      case 'session': {
        const session = sessions.find(s => s.id === parsed.sessionId);
        if (session) {
          if (selectedSession?.id !== session.id) {
            setSelectedSession(session);
          }
        } else if (!selectedSession && sessions.length > 0) {
          // Deep-link to unknown session with nothing selected — redirect home
          navigate('/', { replace: true });
        }
        // else: session list not loaded yet, or selectedSession already set — wait
        break;
      }

      case 'project': {
        // Sync project view
        setSelectedSession(null);
        setSelectedProject(parsed.projectPath);
        setViewMode('project');
        setShowFavorites(false);
        setShowSettings(false);
        setShowTerminal(false);
        break;
      }

      case 'feature': {
        // Clear session selection for feature pages
        setSelectedSession(null);
        setShowSettings(false);
        setShowTerminal(false);
        setShowFavorites(false);

        switch (parsed.feature) {
          case 'kanban':
            setViewMode('kanban');
            break;
          case 'dashboard':
            // viewMode controls sidebar content only; main content always shows Dashboard
            // when no session is selected (see renderDesktopMainContent)
            setViewMode('list');
            setSelectedProject(null);
            break;
          case 'settings':
            setShowSettings(true);
            break;
          case 'terminal':
            setShowTerminal(true);
            break;
          case 'favorites':
            setShowFavorites(true);
            break;
        }
        break;
      }

      case 'root': {
        // Home: clear session, keep current viewMode unless it's a feature-specific one
        setSelectedSession(null);
        break;
      }
    }
    // selectedSession is intentionally NOT in deps to avoid circular updates.
    // We only read it to check if a sync is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, sessions, navigate]);

  // ─── Navigation helpers ───────────────────────────────────
  const navigateToSession = useCallback(
    (id: string) => navigate(buildSessionUrl(id)),
    [navigate],
  );
  const navigateToSessions = useCallback(() => navigate('/'), [navigate]);
  const navigateToFeature = useCallback(
    (feature: string) => navigate(buildFeatureUrl(feature)),
    [navigate],
  );

  return {
    navigateToSession,
    navigateToSessions,
    navigateToFeature,
  };
}
