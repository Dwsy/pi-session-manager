// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DASHBOARD_RECAP_AUTO_KEY,
  isDashboardRecapAutoEnabled,
  isDashboardRecapPeriodAutoEnabled,
  setDashboardRecapAutoEnabled,
} from './dashboardRecap'

describe('dashboard recap automatic preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults weekly and monthly off while annual recaps are on', () => {
    expect(isDashboardRecapAutoEnabled('week')).toBe(false)
    expect(isDashboardRecapAutoEnabled('month')).toBe(false)
    expect(isDashboardRecapAutoEnabled('year')).toBe(true)
  })

  it('maps midyear into the annual preference and never auto-enables quarters', () => {
    expect(isDashboardRecapPeriodAutoEnabled('midyear')).toBe(true)
    expect(isDashboardRecapPeriodAutoEnabled('year')).toBe(true)
    expect(isDashboardRecapPeriodAutoEnabled('quarter')).toBe(false)
  })

  it('persists each period independently and announces settings changes', () => {
    const listener = vi.fn()
    window.addEventListener('psm-dashboard:recap-settings', listener)

    setDashboardRecapAutoEnabled('week', true)
    setDashboardRecapAutoEnabled('year', false)

    expect(isDashboardRecapAutoEnabled('week')).toBe(true)
    expect(isDashboardRecapAutoEnabled('month')).toBe(false)
    expect(isDashboardRecapAutoEnabled('year')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)

    window.removeEventListener('psm-dashboard:recap-settings', listener)
  })

  it('preserves an explicit opt-out from the legacy global switch', () => {
    localStorage.setItem(DASHBOARD_RECAP_AUTO_KEY, 'false')
    expect(isDashboardRecapAutoEnabled('week')).toBe(false)
    expect(isDashboardRecapAutoEnabled('month')).toBe(false)
    expect(isDashboardRecapAutoEnabled('year')).toBe(false)
  })
})
