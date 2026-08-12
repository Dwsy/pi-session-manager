import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { NavigateOptions } from 'react-router-dom';
import {
  buildFeatureUrl,
  buildProjectUrl,
  buildProjectsUrl,
  buildSessionUrl,
  parseRoute,
} from '../router/config';
import { getRuntimeSessionById } from '../runtime-data/sessionSource';
import type { SessionInfo } from '../types';
import type { AppMainView } from '../types/mainView';
import type { AppSidebarViewMode } from './app/useSidebarSessions';
import {
  beginRouteTransition,
  canApplyRouteState,
  IDLE_ROUTE_TRANSITION,
  normalizeRouteTransitionPath,
  settleRouteTransition,
} from './app/routeTransitionMachine';

interface RouteSyncOptions {
  setSelectedSession: (session: SessionInfo | null) => void;
  selectedSession: SessionInfo | null;
  sessions: SessionInfo[];
  sessionsLoading: boolean;
  viewMode: AppSidebarViewMode;
  setViewMode: (mode: AppSidebarViewMode) => void;
  setSelectedProject: (project: string | null) => void;
  setMainView: (view: AppMainView) => void;
  setShowSettings: (show: boolean) => void;
  setShowTerminal: (show: boolean) => void;
  setActiveAppViewId: (viewId: string | null) => void;
  appRoutes: Array<{ id: string; route?: string }>;
  appRoutesReady: boolean;
}

function normalizeRoutePath(path?: string) {
  if (!path) return null;
  const [pathname] = path.split(/[?#]/);
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, '') || '/';
}

function fallbackAppRoute(viewId: string) {
  return `/app/${encodeURIComponent(viewId)}`;
}

export function useRouteSync({
  setSelectedSession,
  selectedSession,
  sessions,
  sessionsLoading,
  viewMode,
  setViewMode,
  setSelectedProject,
  setMainView,
  setShowSettings,
  setShowTerminal,
  setActiveAppViewId,
  appRoutes,
  appRoutesReady,
}: RouteSyncOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const parsedRoute = useMemo(
    () => parseRoute(location.pathname),
    [location.pathname],
  );
  // Only block the main pane when the URL names a session we have not selected yet.
  // If the user already picked a session in the sidebar (state ahead of URL), keep showing the viewer.
  const pendingSessionRoute =
    parsedRoute.route === 'session' &&
    selectedSession == null;
  const matchingAppRoute = useMemo(() => {
    if (parsedRoute.route !== 'app') return null;
    const routePath = normalizeRoutePath(parsedRoute.path);
    return appRoutes.find((view) => {
      const viewRoute = normalizeRoutePath(view.route) ?? fallbackAppRoute(view.id);
      return viewRoute === routePath;
    }) ?? null;
  }, [appRoutes, parsedRoute]);
  const pendingAppRoute =
    parsedRoute.route === 'app' && (!appRoutesReady || !matchingAppRoute);
  const prevPathnameRef = useRef(location.pathname);
  const currentPathRef = useRef(normalizeRouteTransitionPath(location.pathname));
  const routeTransitionRef = useRef(IDLE_ROUTE_TRANSITION);
  currentPathRef.current = normalizeRouteTransitionPath(location.pathname);
  const canSyncCurrentRoute = canApplyRouteState(
    routeTransitionRef.current,
    location.pathname,
  );

  const navigateToPath = useCallback(
    (path: string, options?: NavigateOptions) => {
      routeTransitionRef.current = beginRouteTransition(
        currentPathRef.current,
        path,
      );
      navigate(path, options);
    },
    [navigate],
  );

  // ─── URL → State (single source of truth) ─────────────
  // This effect syncs ALL app state from the URL.
  // No circular deps: we read selectedSession but only write when mismatch.
  useEffect(() => {
    if (!canSyncCurrentRoute) {
      return;
    }

    let cancelled = false;
    routeTransitionRef.current = settleRouteTransition(
      routeTransitionRef.current,
      location.pathname,
    );
    const routeChanged = prevPathnameRef.current !== location.pathname;
    prevPathnameRef.current = location.pathname;

    switch (parsedRoute.route) {
      case 'session': {
        setActiveAppViewId(null);
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
              navigateToPath('/', { replace: true });
            }
          }).catch(() => {
            if (!cancelled) {
              navigateToPath('/', { replace: true });
            }
          });
        }
        // else: session list still loading, or selectedSession already set — wait
        break;
      }

      case 'project': {
        // Sync project view
        setSelectedSession(null);
        setActiveAppViewId(null);
        setSelectedProject(parsedRoute.projectPath);
        setViewMode('project');
        if (routeChanged) {
          setShowSettings(false);
        }
        setShowTerminal(false);
        break;
      }

      case 'feature': {
        // Clear session selection for feature pages
        setSelectedSession(null);
        setActiveAppViewId(null);
        if (routeChanged) {
          setShowSettings(false);
        }
        setShowTerminal(false);

        switch (parsedRoute.feature) {
          case 'dashboard':
            // viewMode controls sidebar content only; main content shows the
            // dashboard when no session is selected (see resolveDesktopMainContent)
            setMainView('dashboard');
            setViewMode('list');
            setSelectedProject(null);
            break;
          case 'explorer':
            setMainView('explorer');
            setViewMode('list');
            setSelectedProject(null);
            break;
          case 'settings':
            setShowSettings(true);
            break;
          case 'terminal':
            setShowTerminal(true);
            break;
        }
        break;
      }

      case 'app': {
        if (!appRoutesReady) {
          break;
        }
        if (!matchingAppRoute) {
          navigateToPath('/', { replace: true });
          break;
        }

        setSelectedSession(null);
        setSelectedProject(null);
        setActiveAppViewId(matchingAppRoute.id);
        setViewMode('app');
        if (routeChanged) {
          setShowSettings(false);
        }
        setShowTerminal(false);
        break;
      }

      case 'root': {
        // Home: clear session, keep current viewMode unless it's a feature-specific one
        setSelectedSession(null);
        setActiveAppViewId(null);
        if (viewMode === 'app') {
          setViewMode('list');
        }
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
  }, [canSyncCurrentRoute, location.pathname, parsedRoute, sessions, sessionsLoading, navigateToPath, appRoutesReady, matchingAppRoute, viewMode]);

  // ─── Navigation helpers ───────────────────────────────────
  const navigateToSession = useCallback(
    (id: string) => navigateToPath(buildSessionUrl(id)),
    [navigateToPath],
  );
  const navigateToSessions = useCallback(() => navigateToPath('/'), [navigateToPath]);
  const navigateToProjects = useCallback(
    () => navigateToPath(buildProjectsUrl()),
    [navigateToPath],
  );
  const navigateToProject = useCallback(
    (projectPath: string) => navigateToPath(buildProjectUrl(projectPath)),
    [navigateToPath],
  );
  const navigateToFeature = useCallback(
    (feature: string) => navigateToPath(buildFeatureUrl(feature)),
    [navigateToPath],
  );

  return {
    navigateToSession,
    navigateToSessions,
    navigateToProjects,
    navigateToProject,
    navigateToFeature,
    navigateToPath,
    pendingSessionRoute,
    pendingAppRoute,
  };
}
