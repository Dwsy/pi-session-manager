import type { RecapPeriod, RecapPeriodKind } from './recapTypes'

/**
 * Period math for the dashboard recap. Every boundary is local time: `start`
 * is 00:00:00.000 and `end` is the inclusive 23:59:59.999 of the last day.
 * All functions are pure and never mutate their arguments.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Locale-independent names so the fallback label reads correctly without a locale file. */
const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function startOfIsoWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday)
}

function endOfDay(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 23, 59, 59, 999)
}

interface IsoWeekNumber {
  year: number
  week: number
}

function getIsoWeekNumber(weekStart: Date): IsoWeekNumber {
  // A week belongs to the ISO year owning its Thursday, i.e. the year holding
  // at least four of its days. January 4 is always inside ISO week 1, so the
  // Monday of its week anchors the week count for that ISO year.
  const thursday = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 3)
  const year = thursday.getFullYear()
  const firstWeekStart = startOfIsoWeek(new Date(year, 0, 4))
  // Rounding absorbs the ±1h a DST transition adds between the two Mondays.
  const week = 1 + Math.round((weekStart.getTime() - firstWeekStart.getTime()) / WEEK_MS)
  return { year, week }
}

function buildWeekPeriod(anchor: Date): RecapPeriod {
  const start = startOfIsoWeek(anchor)
  const { year, week } = getIsoWeekNumber(start)
  return {
    kind: 'week',
    cycleKey: `week:${year}-W${String(week).padStart(2, '0')}`,
    start,
    end: endOfDay(start.getFullYear(), start.getMonth(), start.getDate() + 6),
    year,
    label: {
      key: 'dashboard.recap.period.week',
      fallback: 'Week {{week}}, {{year}}',
      values: { week, year },
    },
  }
}

function buildMonthPeriod(anchor: Date): RecapPeriod {
  const year = anchor.getFullYear()
  const monthIndex = anchor.getMonth()
  return {
    kind: 'month',
    cycleKey: `month:${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    start: new Date(year, monthIndex, 1),
    // Day 0 of the next month is the last day of this one.
    end: endOfDay(year, monthIndex + 1, 0),
    year,
    label: {
      key: 'dashboard.recap.period.month',
      fallback: '{{month}} {{year}}',
      // `monthNumber` is 1-based for locales that write months as numerals.
      values: { month: ENGLISH_MONTHS[monthIndex], monthIndex, monthNumber: monthIndex + 1, year },
    },
  }
}

function buildQuarterPeriod(anchor: Date): RecapPeriod {
  const year = anchor.getFullYear()
  const quarter = Math.floor(anchor.getMonth() / 3) + 1
  const firstMonthIndex = (quarter - 1) * 3
  return {
    kind: 'quarter',
    cycleKey: `quarter:${year}-Q${quarter}`,
    start: new Date(year, firstMonthIndex, 1),
    end: endOfDay(year, firstMonthIndex + 3, 0),
    year,
    label: {
      key: 'dashboard.recap.period.quarter',
      fallback: 'Q{{quarter}} {{year}}',
      values: { quarter, year },
    },
  }
}

function buildMidyearPeriod(anchor: Date): RecapPeriod {
  const year = anchor.getFullYear()
  return {
    kind: 'midyear',
    cycleKey: `midyear:${year}`,
    start: new Date(year, 0, 1),
    end: endOfDay(year, 5, 30),
    year,
    label: {
      key: 'dashboard.recap.period.midyear',
      fallback: 'First half of {{year}}',
      values: { year },
    },
  }
}

function buildYearPeriod(anchor: Date): RecapPeriod {
  const year = anchor.getFullYear()
  return {
    kind: 'year',
    cycleKey: `year:${year}`,
    start: new Date(year, 0, 1),
    end: endOfDay(year, 11, 31),
    year,
    label: {
      key: 'dashboard.recap.period.year',
      fallback: '{{year}}',
      values: { year },
    },
  }
}

export function getRecapPeriod(kind: RecapPeriodKind, anchor: Date): RecapPeriod {
  if (kind === 'week') return buildWeekPeriod(anchor)
  if (kind === 'month') return buildMonthPeriod(anchor)
  if (kind === 'quarter') return buildQuarterPeriod(anchor)
  if (kind === 'midyear') return buildMidyearPeriod(anchor)
  return buildYearPeriod(anchor)
}

export function getAutomaticRecapPeriod(now: Date): RecapPeriod | null {
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const day = now.getDate()

  if (monthIndex === 11 && day >= 20) return getRecapPeriod('year', now)
  if (monthIndex === 0 && day <= 14) return getRecapPeriod('year', new Date(year - 1, 0, 1))
  if (monthIndex === 5 && day >= 25) return getRecapPeriod('midyear', now)
  if (monthIndex === 6 && day <= 10) return getRecapPeriod('midyear', now)
  if (day <= 3) return getRecapPeriod('month', new Date(year, monthIndex - 1, 1))
  // Calendar arithmetic rather than a millisecond offset, so a DST weekend
  // still lands on the previous Monday.
  if (now.getDay() === 1) return getRecapPeriod('week', new Date(year, monthIndex, day - 7))
  return null
}

function createRangeFormatter(locale: string | undefined, withYear: boolean): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = withYear
    ? { year: 'numeric', month: 'short', day: '2-digit' }
    : { month: 'short', day: '2-digit' }
  try {
    return new Intl.DateTimeFormat(locale, options)
  } catch {
    // A malformed locale tag must never break the recap header.
    return new Intl.DateTimeFormat(undefined, options)
  }
}

export function formatRecapRange(period: RecapPeriod, locale?: string): string {
  const sameYear = period.start.getFullYear() === period.end.getFullYear()
  const startText = createRangeFormatter(locale, !sameYear).format(period.start)
  const endText = createRangeFormatter(locale, true).format(period.end)
  return `${startText} – ${endText}`
}

export function listManualRecapPeriods(now: Date): RecapPeriod[] {
  const candidates = [
    getRecapPeriod('week', now),
    getRecapPeriod('month', now),
    getRecapPeriod('quarter', now),
    getRecapPeriod('midyear', now),
    getRecapPeriod('year', now),
    getRecapPeriod('year', new Date(now.getFullYear() - 1, 0, 1)),
  ]

  const seen = new Set<string>()
  return candidates.filter((period) => {
    if (seen.has(period.cycleKey)) return false
    seen.add(period.cycleKey)
    return true
  })
}
