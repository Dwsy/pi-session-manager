/**
 * Route configuration for deep linking and URL-based navigation.
 *
 * All pages are URL-routable with stable session IDs.
 * Using HashRouter for Tauri compatibility.
 * URL format: http://localhost:52131/#/sessions/:sessionId
 */

export const ROUTES = {
  // Session views
  SESSIONS: '/',
  SESSION_DETAIL: '/sessions/:sessionId',

  // Project view
  PROJECT: '/projects/:projectPath',

  // Feature views
  KANBAN: '/kanban',
  DASHBOARD: '/dashboard',
  SETTINGS: '/settings',
  TERMINAL: '/terminal',
  FAVORITES: '/favorites',
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Build a session detail URL from a stable session ID.
 */
export function buildSessionUrl(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

/**
 * Build a project view URL from a project path.
 */
export function buildProjectUrl(projectPath: string): string {
  return `/projects/${encodeURIComponent(projectPath)}`;
}
