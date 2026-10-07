import { describe, expect, it } from 'vitest'

import type { SessionInfo, SessionStats } from '@/types'
import { getPreviousRecapPeriod, getRecapPeriod } from './recapPeriods'
import { deriveRecapReport, percentChange } from './recapReport'

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function point(date: string, messages: number, cost: number, sessions = 1) {
  return {
    date,
    level: 2,
    total_messages: messages,
    total_tokens: messages * 100,
    total_cost: cost,
    session_count: sessions,
  }
}

function makeStats(overrides: Partial<Record<string, unknown>> = {}): SessionStats {
  return {
    total_sessions: 3,
    total_messages: 60,
    user_messages: 20,
    assistant_messages: 40,
    total_tokens: 6000,
    sessions_by_project: { '/a/alpha': 2, '/a/beta': 1 },
    sessions_by_model: {},
    model_usage_by_project: {},
    messages_by_date: {},
    messages_by_hour: {},
    messages_by_day_of_week: {},
    average_messages_per_session: 20,
    heatmap_data: [
      point('2026-03-09', 10, 0.5),
      point('2026-03-10', 30, 1.5),
      point('2026-03-12', 20, 1),
    ],
    time_distribution: [
      { hour: 9, message_count: 30 },
      { hour: 21, message_count: 30 },
    ],
    token_details: {
      total_input: 1000,
      total_output: 500,
      total_cache_read: 3000,
      total_cache_write: 500,
      total_cost: 3,
      tokens_by_model: {
        'model-a': { messages: 40, input: 800, output: 400, cache_read: 2000, cache_write: 300, cost: 2 },
        'model-b': { messages: 20, input: 200, output: 100, cache_read: 1000, cache_write: 200, cost: 1 },
      },
    },
    ...overrides,
  } as unknown as SessionStats
}

const sessions = (count: number) => Array.from({ length: count }, () => ({}) as SessionInfo)

describe('getPreviousRecapPeriod', () => {
  it('steps a week back by seven days', () => {
    const week = getRecapPeriod('week', new Date(2026, 2, 11))
    expect(ymd(getPreviousRecapPeriod(week).start)).toBe('2026-03-02')
  })

  it('steps a month back across a year boundary', () => {
    const january = getRecapPeriod('month', new Date(2026, 0, 15))
    const previous = getPreviousRecapPeriod(january)
    expect(ymd(previous.start)).toBe('2025-12-01')
    expect(ymd(previous.end)).toBe('2025-12-31')
  })

  it('steps a quarter back to the previous quarter', () => {
    const q1 = getRecapPeriod('quarter', new Date(2026, 1, 1))
    const previous = getPreviousRecapPeriod(q1)
    expect(ymd(previous.start)).toBe('2025-10-01')
    expect(ymd(previous.end)).toBe('2025-12-31')
  })

  it('compares a year or midyear with the same span a year earlier', () => {
    expect(getPreviousRecapPeriod(getRecapPeriod('year', new Date(2026, 5, 1))).cycleKey).toBe('year:2025')
    expect(getPreviousRecapPeriod(getRecapPeriod('midyear', new Date(2026, 5, 1))).cycleKey).toBe('midyear:2025')
  })
})

describe('percentChange', () => {
  it('returns null when there is nothing to compare against', () => {
    expect(percentChange(5, 0)).toBeNull()
  })

  it('returns the signed percentage otherwise', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
  })
})

describe('deriveRecapReport', () => {
  const week = getRecapPeriod('week', new Date(2026, 2, 11))
  const after = new Date(2026, 2, 20)

  it('summarises activity, rhythm and rankings for a finished week', () => {
    const report = deriveRecapReport(makeStats(), sessions(3), week, null, after)

    expect(report.range.elapsedDays).toBe(7)
    expect(report.series.unit).toBe('day')
    expect(report.series.buckets).toHaveLength(7)
    expect(report.activity.activeDays).toBe(3)
    expect(report.activity.longestRun).toBe(2)
    expect(report.activity.firstActiveDay?.getDate()).toBe(9)
    expect(report.activity.busiestDay?.date.getDate()).toBe(10)
    expect(report.activity.priciestDay?.date.getDate()).toBe(10)

    // Monday-first weekday series: Mon 10, Tue 30, Thu 20.
    expect(report.weekday.messages).toEqual([10, 30, 0, 20, 0, 0, 0])
    expect(report.weekday.peakIndex).toBe(1)

    expect(report.hours.peakIndex).toBe(9)
    expect(report.dayparts.find((part) => part.id === 'morning')?.share).toBeCloseTo(0.5)
    expect(report.dayparts.find((part) => part.id === 'evening')?.share).toBeCloseTo(0.5)

    expect(report.tokenMix.find((part) => part.kind === 'input')?.share).toBeCloseTo(0.2)
    expect(report.models.rankedBy).toBe('cost')
    expect(report.models.items[0]).toMatchObject({ name: 'model-a' })
    expect(report.models.items[0].share).toBeCloseTo(2 / 3)
    expect(report.projects[0]).toMatchObject({ name: '/a/alpha', sessions: 2 })
    expect(report.efficiency.costPerSession).toBeCloseTo(1)
    expect(report.changes).toBeNull()
  })

  it('only counts days that have happened in an ongoing period', () => {
    const report = deriveRecapReport(makeStats(), sessions(3), week, null, new Date(2026, 2, 11, 15))

    expect(report.range.elapsedDays).toBe(3)
    expect(report.activity.activeDays).toBe(2)
    // Thursday is still in the future, so its data must not leak in.
    expect(report.weekday.messages[3]).toBe(0)
  })

  it('compares against the previous period when data exists', () => {
    const previous = {
      sessions: sessions(1),
      stats: makeStats({
        total_messages: 30,
        total_tokens: 3000,
        token_details: { ...makeStats().token_details, total_cost: 1.5 },
      }),
    }
    const report = deriveRecapReport(makeStats(), sessions(3), week, previous, after)

    expect(report.changes).toEqual({ sessions: 200, messages: 100, tokens: 100, cost: 100 })
  })

  it('buckets a long period so the chart stays readable', () => {
    const year = getRecapPeriod('year', new Date(2025, 5, 1))
    const report = deriveRecapReport(makeStats({ heatmap_data: [point('2025-03-10', 10, 1)] }), sessions(1), year, null, after)

    expect(report.series.unit).toBe('month')
    expect(report.series.buckets).toHaveLength(12)
    expect(report.series.peakIndex).toBe(2)
  })
})
