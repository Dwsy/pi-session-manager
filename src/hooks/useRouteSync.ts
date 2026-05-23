import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildSessionUrl, buildFeatureUrl, parseRoute } from '../router/config';
import { getRuntimeSessionById } from '../runtime-data/sessionSource';
import type { SessionInfo } from '../types';
import type { AppSidebarViewMode } from './app/useSidebarSessions';

interface RouteSyncOptions {
  setSelectedSession: (session: SessionInfo | null) => void;
  selectedSession: SessionInfo | null;
  sessions: SessionInfo[];
  sessionsLoading: boolean;
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
  sessionsLoading,
  setViewMode,
  setSelectedProject,
  setShowSettings,
  setShowTerminal,
  setShowFavorites,
}: RouteSyncOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const parsedRoute = useMemo(
    () => parseRoute(location.pathname),
    [location.pathname],
  );
  const pendingSessionRoute =
    parsedRoute.route === 'session' &&
    selectedSession?.id !== parsedRoute.sessionId;
  const prevPathnameRef = useRef(location.pathname);

  // ─── URL → State (single source of truth) ─────────────
  // This effect syncs ALL app state from the URL.
  // No circular deps: we read selectedSession but only write when mismatch.
  useEffect(() => {
    let cancelled = false;
    const routeChanged = prevPathnameRef.current !== location.pathname;
    prevPathnameRef.current = location.pathname;

    switch (parsedRoute.route) {
      case 'session': {
        const session = sessions.find(s => s.id === parsedRoute.sessionId);
        if (session) {
          if (selectedSession?.id !== session.id) {
            setSelectedSession(session);
          }
        } else if (
          !sessionsLoading &&
          selectedSession?.id !== parsedRoute.sessionId
        ) {
          void getRuntimeSessionById(parsedRoute.sessionId).then((resolved) => {
            if (cancelled) return;
            if (resolved) {
              setSelectedSession(resolved);
            } else {
              navigate('/', { replace: true });
            }
          }).catch(() => {
            if (!cancelled) {
              navigate('/', { replace: true });
            }
          });
        }
        // else: session list still loading, or selectedSession already set — wait
        break;
      }

      case 'project': {
        // Sync project view
        setSelectedSession(null);
        setSelectedProject(parsedRoute.projectPath);
        setViewMode('project');
        setShowFavorites(false);
        if (routeChanged) {
          setShowSettings(false);
        }
        setShowTerminal(false);
        break;
      }

      case 'feature': {
        // Clear session selection for feature pages
        setSelectedSession(null);
        if (routeChanged) {
          setShowSettings(false);
        }
        setShowTerminal(false);
        setShowFavorites(false);

        switch (parsedRoute.feature) {
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
        if (routeChanged) {
          setShowSettings(false);
        }
        break;
      }
    }
    return () => {
      cancelled = true;
    };
    // selectedSession is intentionally NOT in deps to avoid circular updates.
    // We only read it to check if a sync is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, parsedRoute, sessions, sessionsLoading, navigate]);

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
    pendingSessionRoute,
  };
}
