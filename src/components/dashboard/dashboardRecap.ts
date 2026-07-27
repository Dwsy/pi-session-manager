export type DashboardRecapKind = 'midyear' | 'yearend'

export interface DashboardRecapRequest {
  kind: DashboardRecapKind
  source: 'manual' | 'automatic'
  cycleKey: string
  start: Date
  end: Date
  year: number
}

export const DASHBOARD_RECAP_EVENT = 'psm-dashboard:recap'
export const DASHBOARD_RECAP_SETTINGS_EVENT = 'psm-dashboard:recap-settings'
export const DASHBOARD_RECAP_AUTO_KEY = 'psm-dashboard-recap:auto-enabled'
const DASHBOARD_RECAP_STATE_KEY = 'psm-dashboard-recap:shown-v1'

interface DashboardRecapState {
  shownCycles: string[]
}

export function isDashboardRecapAutoEnabled(): boolean {
  return localStorage.getItem(DASHBOARD_RECAP_AUTO_KEY) !== 'false'
}

export function setDashboardRecapAutoEnabled(enabled: boolean): void {
  localStorage.setItem(DASHBOARD_RECAP_AUTO_KEY, String(enabled))
  window.dispatchEvent(new Event(DASHBOARD_RECAP_SETTINGS_EVENT))
}

function readState(): DashboardRecapState {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_RECAP_STATE_KEY) || '{}')
    return {
      shownCycles: Array.isArray(parsed.shownCycles)
        ? parsed.shownCycles.filter((value: unknown): value is string => typeof value === 'string')
        : [],
    }
  } catch {
    return { shownCycles: [] }
  }
}

export function hasShownDashboardRecap(cycleKey: string): boolean {
  return readState().shownCycles.includes(cycleKey)
}

export function markDashboardRecapShown(cycleKey: string): void {
  const state = readState()
  if (state.shownCycles.includes(cycleKey)) return
  localStorage.setItem(
    DASHBOARD_RECAP_STATE_KEY,
    JSON.stringify({ shownCycles: [...state.shownCycles, cycleKey].slice(-12) }),
  )
}

export function getDashboardRecapPeriod(kind: DashboardRecapKind, year: number): DashboardRecapRequest {
  if (kind === 'midyear') {
    return {
      kind,
      source: 'manual',
      cycleKey: `midyear:${year}`,
      start: new Date(year, 0, 1, 0, 0, 0, 0),
      end: new Date(year, 5, 30, 23, 59, 59, 999),
      year,
    }
  }
  return {
    kind,
    source: 'manual',
    cycleKey: `yearend:${year}`,
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
    year,
  }
}

export function getAutomaticDashboardRecap(now = new Date()): DashboardRecapRequest | null {
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  if ((month === 5 && day >= 15) || month === 6) {
    return { ...getDashboardRecapPeriod('midyear', year), source: 'automatic' }
  }

  if (month === 11 && day >= 15) {
    return { ...getDashboardRecapPeriod('yearend', year), source: 'automatic' }
  }

  if (month === 0) {
    return { ...getDashboardRecapPeriod('yearend', year - 1), source: 'automatic' }
  }

  return null
}

export function requestDashboardRecap(kind: DashboardRecapKind): void {
  const request = getDashboardRecapPeriod(kind, new Date().getFullYear())
  window.dispatchEvent(
    new CustomEvent<DashboardRecapRequest>(DASHBOARD_RECAP_EVENT, {
      detail: request,
    }),
  )
}
