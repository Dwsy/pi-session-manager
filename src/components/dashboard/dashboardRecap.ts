import { getAutomaticRecapPeriod, getRecapPeriod } from './recap/recapPeriods'
import type { RecapPeriod, RecapPeriodKind } from './recap/recapTypes'

/**
 * Window-level contract for opening dashboard recaps.
 *
 * Settings, the command palette, and the hidden easter egg all talk to the
 * controller through these events, so none of them need a ref to it. Shown
 * state lives in localStorage: an automatic recap opens once per cycle and
 * closing it counts as seen; manual and easter-egg views never consume a
 * cycle.
 */

export type DashboardRecapSource = 'manual' | 'automatic' | 'easterEgg'

export interface DashboardRecapRequest {
  period: RecapPeriod
  source: DashboardRecapSource
}

export const DASHBOARD_RECAP_EVENT = 'psm-dashboard:recap'
export const DASHBOARD_RECAP_SETTINGS_EVENT = 'psm-dashboard:recap-settings'
export const DASHBOARD_RECAP_AUTO_KEY = 'psm-dashboard-recap:auto-enabled'
const DASHBOARD_RECAP_AUTO_PERIOD_KEY_PREFIX = 'psm-dashboard-recap:auto-enabled:'
const DASHBOARD_RECAP_STATE_KEY = 'psm-dashboard-recap:shown-v2'
/** Cycles are weekly at the fastest, so a year of history is plenty. */
const MAX_REMEMBERED_CYCLES = 60

export type DashboardRecapAutoPeriod = 'week' | 'month' | 'year'

const DASHBOARD_RECAP_AUTO_DEFAULTS: Record<DashboardRecapAutoPeriod, boolean> = {
  week: false,
  month: false,
  year: true,
}

function autoPeriodForRecap(kind: RecapPeriodKind): DashboardRecapAutoPeriod | null {
  if (kind === 'week' || kind === 'month') return kind
  if (kind === 'year' || kind === 'midyear') return 'year'
  return null
}

export function isDashboardRecapAutoEnabled(period: DashboardRecapAutoPeriod): boolean {
  const value = localStorage.getItem(`${DASHBOARD_RECAP_AUTO_PERIOD_KEY_PREFIX}${period}`)
  if (value !== null) return value === 'true'

  // Preserve an explicit opt-out from the former global switch. Otherwise the
  // new per-period defaults take effect for users upgrading from older builds.
  if (localStorage.getItem(DASHBOARD_RECAP_AUTO_KEY) === 'false') return false
  return DASHBOARD_RECAP_AUTO_DEFAULTS[period]
}

export function setDashboardRecapAutoEnabled(period: DashboardRecapAutoPeriod, enabled: boolean): void {
  localStorage.setItem(`${DASHBOARD_RECAP_AUTO_PERIOD_KEY_PREFIX}${period}`, String(enabled))
  window.dispatchEvent(new Event(DASHBOARD_RECAP_SETTINGS_EVENT))
}

export function isDashboardRecapPeriodAutoEnabled(kind: RecapPeriodKind): boolean {
  const period = autoPeriodForRecap(kind)
  return period !== null && isDashboardRecapAutoEnabled(period)
}

function readShownCycles(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_RECAP_STATE_KEY) || '{}')
    return Array.isArray(parsed.shownCycles)
      ? parsed.shownCycles.filter((value: unknown): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

export function hasShownDashboardRecap(cycleKey: string): boolean {
  return readShownCycles().includes(cycleKey)
}

export function markDashboardRecapShown(cycleKey: string): void {
  const cycles = readShownCycles()
  if (cycles.includes(cycleKey)) return
  localStorage.setItem(
    DASHBOARD_RECAP_STATE_KEY,
    JSON.stringify({ shownCycles: [...cycles, cycleKey].slice(-MAX_REMEMBERED_CYCLES) }),
  )
}

export function getAutomaticDashboardRecap(now = new Date()): DashboardRecapRequest | null {
  const period = getAutomaticRecapPeriod(now)
  return period ? { period, source: 'automatic' } : null
}

/**
 * The period the hidden triggers open: whatever season the calendar is in,
 * or the current month when no seasonal window applies.
 */
export function getEasterEggDashboardRecap(now = new Date()): DashboardRecapRequest {
  const period = getAutomaticRecapPeriod(now) ?? getRecapPeriod('month', now)
  return { period, source: 'easterEgg' }
}

export function requestDashboardRecap(kind: RecapPeriodKind, anchor = new Date()): void {
  const request: DashboardRecapRequest = { period: getRecapPeriod(kind, anchor), source: 'manual' }
  window.dispatchEvent(new CustomEvent<DashboardRecapRequest>(DASHBOARD_RECAP_EVENT, { detail: request }))
}
