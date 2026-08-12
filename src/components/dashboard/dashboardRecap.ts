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
const DASHBOARD_RECAP_STATE_KEY = 'psm-dashboard-recap:shown-v2'
/** Cycles are weekly at the fastest, so a year of history is plenty. */
const MAX_REMEMBERED_CYCLES = 60

export function isDashboardRecapAutoEnabled(): boolean {
  return localStorage.getItem(DASHBOARD_RECAP_AUTO_KEY) !== 'false'
}

export function setDashboardRecapAutoEnabled(enabled: boolean): void {
  localStorage.setItem(DASHBOARD_RECAP_AUTO_KEY, String(enabled))
  window.dispatchEvent(new Event(DASHBOARD_RECAP_SETTINGS_EVENT))
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
