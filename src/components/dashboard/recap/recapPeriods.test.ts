import { describe, expect, it } from 'vitest'

import {
  formatRecapRange,
  getAutomaticRecapPeriod,
  getRecapPeriod,
  listManualRecapPeriods,
} from './recapPeriods'

/** Local-time stamp so boundary assertions stay readable and timezone-agnostic. */
function stamp(date: Date): string {
  const parts = [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':')
  return `${parts} ${time}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

describe('getRecapPeriod week', () => {
  it('anchors a Sunday to the Monday that opens its ISO week', () => {
    // 2026-03-15 is a Sunday, the last day of the Mar 9 – Mar 15 week.
    const period = getRecapPeriod('week', new Date(2026, 2, 15, 21, 30))
    expect(stamp(period.start)).toBe('2026-03-09 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-03-15 23:59:59.999')
    expect(period.cycleKey).toBe('week:2026-W11')
    expect(period.year).toBe(2026)
  })

  it('returns the same window when the anchor is that week Monday', () => {
    const period = getRecapPeriod('week', new Date(2026, 2, 9, 0, 0, 0, 0))
    expect(stamp(period.start)).toBe('2026-03-09 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-03-15 23:59:59.999')
    expect(period.cycleKey).toBe('week:2026-W11')
  })

  it('labels the week with a padded number and its ISO year', () => {
    const period = getRecapPeriod('week', new Date(2026, 0, 8))
    expect(period.cycleKey).toBe('week:2026-W02')
    expect(period.label).toEqual({
      key: 'dashboard.recap.period.week',
      fallback: 'Week {{week}}, {{year}}',
      values: { week: 2, year: 2026 },
    })
  })

  it('keeps early January in week 53 of the previous ISO year', () => {
    // Fri 2027-01-01 belongs to the Dec 28 2026 – Jan 3 2027 week, whose
    // Thursday (Dec 31) sits in 2026 — a 53-week ISO year.
    const period = getRecapPeriod('week', new Date(2027, 0, 1))
    expect(period.cycleKey).toBe('week:2026-W53')
    expect(period.year).toBe(2026)
    expect(stamp(period.start)).toBe('2026-12-28 00:00:00.000')
    expect(stamp(period.end)).toBe('2027-01-03 23:59:59.999')
  })

  it('promotes a late-December week to week 1 of the next ISO year', () => {
    // Mon 2024-12-30 opens a week whose Thursday (2025-01-02) is in 2025.
    const period = getRecapPeriod('week', new Date(2024, 11, 31))
    expect(period.cycleKey).toBe('week:2025-W01')
    expect(period.year).toBe(2025)
    expect(stamp(period.start)).toBe('2024-12-30 00:00:00.000')
    expect(stamp(period.end)).toBe('2025-01-05 23:59:59.999')
  })
})

describe('getRecapPeriod calendar windows', () => {
  it('spans the whole month down to the last millisecond', () => {
    const period = getRecapPeriod('month', new Date(2026, 1, 14, 8, 15))
    expect(stamp(period.start)).toBe('2026-02-01 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-02-28 23:59:59.999')
    expect(period.cycleKey).toBe('month:2026-02')
    expect(period.year).toBe(2026)
    expect(period.label).toEqual({
      key: 'dashboard.recap.period.month',
      fallback: '{{month}} {{year}}',
      values: { month: 'February', monthIndex: 1, monthNumber: 2, year: 2026 },
    })
  })

  it('includes the leap day when February has 29 days', () => {
    const period = getRecapPeriod('month', new Date(2024, 1, 10))
    expect(stamp(period.end)).toBe('2024-02-29 23:59:59.999')
  })

  it('spans the calendar quarter containing the anchor', () => {
    const period = getRecapPeriod('quarter', new Date(2026, 7, 20))
    expect(stamp(period.start)).toBe('2026-07-01 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-09-30 23:59:59.999')
    expect(period.cycleKey).toBe('quarter:2026-Q3')
    expect(period.label.values).toEqual({ quarter: 3, year: 2026 })
  })

  it('maps December onto the fourth quarter', () => {
    const period = getRecapPeriod('quarter', new Date(2026, 11, 31, 23, 59))
    expect(stamp(period.start)).toBe('2026-10-01 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-12-31 23:59:59.999')
    expect(period.cycleKey).toBe('quarter:2026-Q4')
  })

  it('spans January through June for midyear', () => {
    const period = getRecapPeriod('midyear', new Date(2026, 3, 3))
    expect(stamp(period.start)).toBe('2026-01-01 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-06-30 23:59:59.999')
    expect(period.cycleKey).toBe('midyear:2026')
    expect(period.label).toEqual({
      key: 'dashboard.recap.period.midyear',
      fallback: 'First half of {{year}}',
      values: { year: 2026 },
    })
  })

  it('spans the whole calendar year', () => {
    const period = getRecapPeriod('year', new Date(2026, 3, 3))
    expect(stamp(period.start)).toBe('2026-01-01 00:00:00.000')
    expect(stamp(period.end)).toBe('2026-12-31 23:59:59.999')
    expect(period.cycleKey).toBe('year:2026')
    expect(period.label).toEqual({
      key: 'dashboard.recap.period.year',
      fallback: '{{year}}',
      values: { year: 2026 },
    })
  })

  it('leaves the anchor untouched', () => {
    const anchor = new Date(2026, 2, 15, 21, 30, 15, 250)
    const before = anchor.getTime()
    getRecapPeriod('week', anchor)
    getRecapPeriod('month', anchor)
    getRecapPeriod('quarter', anchor)
    getRecapPeriod('midyear', anchor)
    getRecapPeriod('year', anchor)
    expect(anchor.getTime()).toBe(before)
  })
})

describe('getAutomaticRecapPeriod', () => {
  it('opens the current year from December 20 onwards', () => {
    expect(getAutomaticRecapPeriod(new Date(2026, 11, 20))?.cycleKey).toBe('year:2026')
    expect(getAutomaticRecapPeriod(new Date(2026, 11, 31, 23, 59))?.cycleKey).toBe('year:2026')
  })

  it('opens the year that just ended during the first half of January', () => {
    expect(getAutomaticRecapPeriod(new Date(2027, 0, 1))?.cycleKey).toBe('year:2026')
    expect(getAutomaticRecapPeriod(new Date(2027, 0, 14))?.cycleKey).toBe('year:2026')
  })

  it('prefers the previous year over the previous month on January 1', () => {
    const period = getAutomaticRecapPeriod(new Date(2027, 0, 1))
    expect(period?.kind).toBe('year')
    expect(period?.year).toBe(2026)
  })

  it('opens midyear across the June 25 – July 10 window', () => {
    expect(getAutomaticRecapPeriod(new Date(2026, 5, 25))?.cycleKey).toBe('midyear:2026')
    expect(getAutomaticRecapPeriod(new Date(2026, 6, 10))?.cycleKey).toBe('midyear:2026')
  })

  it('prefers midyear over the previous month on July 1', () => {
    expect(getAutomaticRecapPeriod(new Date(2026, 6, 1))?.kind).toBe('midyear')
  })

  it('opens the previous month during the first three days', () => {
    expect(getAutomaticRecapPeriod(new Date(2026, 2, 1))?.cycleKey).toBe('month:2026-02')
    expect(getAutomaticRecapPeriod(new Date(2026, 2, 3, 23, 0))?.cycleKey).toBe('month:2026-02')
  })

  it('prefers the previous month over the previous week on a first-of-month Monday', () => {
    // 2026-06-01 is a Monday, so both rules would fire.
    expect(getAutomaticRecapPeriod(new Date(2026, 5, 1))?.cycleKey).toBe('month:2026-05')
  })

  it('opens the previous week on an ordinary Monday', () => {
    // Mon 2026-03-09 → the Mar 2 – Mar 8 week.
    const period = getAutomaticRecapPeriod(new Date(2026, 2, 9, 9, 0))
    expect(period?.cycleKey).toBe('week:2026-W10')
    expect(stamp(period!.start)).toBe('2026-03-02 00:00:00.000')
    expect(stamp(period!.end)).toBe('2026-03-08 23:59:59.999')
  })

  it('returns null when no rule applies', () => {
    expect(getAutomaticRecapPeriod(new Date(2026, 2, 11))).toBeNull()
    expect(getAutomaticRecapPeriod(new Date(2026, 0, 15))).toBeNull()
    expect(getAutomaticRecapPeriod(new Date(2026, 6, 11))).toBeNull()
    expect(getAutomaticRecapPeriod(new Date(2026, 11, 19))).toBeNull()
  })

  it('leaves the now argument untouched', () => {
    const now = new Date(2026, 2, 9, 9, 0, 0, 0)
    const before = now.getTime()
    getAutomaticRecapPeriod(now)
    expect(now.getTime()).toBe(before)
  })
})

describe('formatRecapRange', () => {
  it('omits the year on the start side when both ends share a year', () => {
    const period = getRecapPeriod('month', new Date(2026, 2, 15))
    expect(formatRecapRange(period, 'en-US')).toBe('Mar 01 – Mar 31, 2026')
  })

  it('keeps both years when the period straddles New Year', () => {
    const period = getRecapPeriod('week', new Date(2027, 0, 1))
    expect(formatRecapRange(period, 'en-US')).toBe('Dec 28, 2026 – Jan 03, 2027')
  })

  it('falls back to the default locale instead of throwing on a bad tag', () => {
    const period = getRecapPeriod('year', new Date(2026, 5, 1))
    expect(() => formatRecapRange(period, 'not a locale')).not.toThrow()
    expect(formatRecapRange(period, 'not a locale')).toContain('–')
  })
})

describe('listManualRecapPeriods', () => {
  it('offers the current week, month, quarter, midyear and the last two years', () => {
    const periods = listManualRecapPeriods(new Date(2026, 7, 20))
    expect(periods.map((period) => period.cycleKey)).toEqual([
      'week:2026-W34',
      'month:2026-08',
      'quarter:2026-Q3',
      'midyear:2026',
      'year:2026',
      'year:2025',
    ])
  })

  it('never repeats a cycle key', () => {
    const periods = listManualRecapPeriods(new Date(2026, 0, 1))
    const keys = periods.map((period) => period.cycleKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
