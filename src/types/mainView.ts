/**
 * Desktop main pane mode used when no session is open.
 *
 * `explorer` shows the full-width project/session browser, `dashboard` keeps the
 * default stats overview. The choice is persisted so reloading a session or
 * project URL restores the pane the user was last working in.
 */
export type AppMainView = 'dashboard' | 'explorer'

export const DEFAULT_APP_MAIN_VIEW: AppMainView = 'dashboard'

const STORAGE_KEY = 'psm-main-view'

export function readStoredMainView(): AppMainView {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'explorer' ? 'explorer' : DEFAULT_APP_MAIN_VIEW
  } catch {
    return DEFAULT_APP_MAIN_VIEW
  }
}

export function persistMainView(view: AppMainView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view)
  } catch {}
}
