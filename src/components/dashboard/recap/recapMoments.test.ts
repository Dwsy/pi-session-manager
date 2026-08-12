import { describe, expect, it } from 'vitest'

import type {
  HeatmapPoint,
  SessionInfo,
  SessionStats,
  TimeDistributionPoint,
  TokenDetails,
} from '@/types'

import { detectRecapMoments } from './recapMoments'
import type {
  RecapInput,
  RecapMoment,
  RecapMomentId,
  RecapMomentRarity,
  RecapPeriod,
} from './recapTypes'

type RarityCase = [number, RecapMomentRarity | undefined]

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** ISO string anchored to a local wall-clock time, so tests are timezone-agnostic. */
function localIso(year: number, month: number, day: number, hour = 10): string {
  return new Date(year, month - 1, day, hour).toISOString()
}

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: 'session-1',
    path: '/sessions/session-1.jsonl',
    cwd: '/projects/pi-session-manager',
    created: localIso(2026, 3, 5),
    modified: localIso(2026, 3, 5, 11),
    message_count: 4,
    first_message: 'Hello',
    last_message: 'Bye',
    last_message_role: 'assistant',
    ...overrides,
  }
}

function makeTokenDetails(overrides: Partial<TokenDetails> = {}): TokenDetails {
  return {
    total_input: 0,
    total_output: 0,
    total_cache_read: 0,
    total_cache_write: 0,
    total_cost: 0,
    tokens_by_model: {},
    ...overrides,
  }
}

function makeStats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    total_sessions: 0,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    total_tokens: 0,
    sessions_by_project: {},
    sessions_by_model: {},
    model_usage_by_project: {},
    messages_by_date: {},
    messages_by_hour: {},
    messages_by_day_of_week: {},
    average_messages_per_session: 0,
    heatmap_data: [],
    time_distribution: [],
    token_details: makeTokenDetails(),
    ...overrides,
  }
}

function makePeriod(overrides: Partial<RecapPeriod> = {}): RecapPeriod {
  return {
    kind: 'month',
    cycleKey: 'month:2026-03',
    start: new Date(2026, 2, 1, 0, 0, 0, 0),
    end: new Date(2026, 2, 31, 23, 59, 59, 999),
    year: 2026,
    label: { key: 'dashboard.recap.period.month', fallback: 'March 2026' },
    ...overrides,
  }
}

function makeInput(overrides: Partial<RecapInput> = {}): RecapInput {
  return {
    period: makePeriod(),
    stats: makeStats(),
    sessions: [],
    allSessions: [],
    now: new Date(2026, 3, 1, 12, 0, 0, 0),
    ...overrides,
  }
}

/** `count` consecutive active local days starting at the given calendar day. */
function activeDays(year: number, month: number, day: number, count: number): HeatmapPoint[] {
  const points: HeatmapPoint[] = []
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(year, month - 1, day + offset)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    points.push({
      date: key,
      level: 3,
      total_messages: 12,
      total_tokens: 4000,
      total_cost: 0.2,
      session_count: 2,
    })
  }
  return points
}

/** A 24-hour distribution where the listed hours carry traffic and the rest are quiet. */
function hourly(load: Record<number, number>): TimeDistributionPoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, message_count: load[hour] ?? 0 }))
}

function findMoment(moments: RecapMoment[], id: RecapMomentId): RecapMoment | undefined {
  return moments.find((moment) => moment.id === id)
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('detectRecapMoments', () => {
  it('returns nothing for an empty period', () => {
    expect(detectRecapMoments(makeInput())).toEqual([])
  })

  it('returns nothing when the user has no history at all', () => {
    const input = makeInput({ sessions: [], allSessions: [], stats: makeStats() })
    expect(detectRecapMoments(input)).toEqual([])
  })

  describe('ironStreak', () => {
    it.each<RarityCase>([
      [6, undefined],
      [7, 'common'],
      [13, 'common'],
      [14, 'rare'],
      [29, 'rare'],
      [30, 'legendary'],
    ])('a %i day streak is %s', (days, rarity) => {
      const input = makeInput({
        stats: makeStats({ heatmap_data: activeDays(2026, 3, 1, days) }),
      })
      expect(findMoment(detectRecapMoments(input), 'ironStreak')?.rarity).toBe(rarity)
    })

    it('does not join runs separated by a quiet day', () => {
      const input = makeInput({
        stats: makeStats({
          heatmap_data: [...activeDays(2026, 3, 1, 5), ...activeDays(2026, 3, 7, 5)],
        }),
      })
      expect(findMoment(detectRecapMoments(input), 'ironStreak')).toBeUndefined()
    })

    it('ignores days recorded with no activity', () => {
      const quiet = activeDays(2026, 3, 6, 1).map((point) => ({ ...point, level: 0 }))
      const input = makeInput({
        stats: makeStats({
          heatmap_data: [...activeDays(2026, 3, 1, 5), ...quiet, ...activeDays(2026, 3, 7, 5)],
        }),
      })
      expect(findMoment(detectRecapMoments(input), 'ironStreak')).toBeUndefined()
    })
  })

  describe('marathon', () => {
    it.each<RarityCase>([
      [149, undefined],
      [150, 'rare'],
      [299, 'rare'],
      [300, 'legendary'],
    ])('a %i message session is %s', (messages, rarity) => {
      const input = makeInput({
        sessions: [makeSession({ message_count: messages })],
      })
      expect(findMoment(detectRecapMoments(input), 'marathon')?.rarity).toBe(rarity)
    })

    it('names the session and falls back to the project folder', () => {
      const named = makeInput({
        sessions: [makeSession({ message_count: 200, name: 'Refactor the parser' })],
      })
      expect(findMoment(detectRecapMoments(named), 'marathon')?.detail.values).toEqual({
        session: 'Refactor the parser',
        count: 200,
      })

      const unnamed = makeInput({
        sessions: [makeSession({ message_count: 200, cwd: '/Users/me/code/pi-session-manager' })],
      })
      expect(findMoment(detectRecapMoments(unnamed), 'marathon')?.detail.values).toEqual({
        session: 'pi-session-manager',
        count: 200,
      })
    })
  })

  describe('nightOwl', () => {
    it('fires at exactly five percent of messages after midnight', () => {
      const input = makeInput({
        stats: makeStats({ time_distribution: hourly({ 1: 2, 2: 3, 14: 95 }) }),
      })
      const moment = findMoment(detectRecapMoments(input), 'nightOwl')
      expect(moment?.rarity).toBe('rare')
      expect(moment?.icon).toBe('moon')
      expect(moment?.detail.values).toEqual({ count: 5, hour: '02' })
      expect(moment?.title.key).toBe('dashboard.recap.moment.nightOwl.title')
      expect(moment?.detail.key).toBe('dashboard.recap.moment.nightOwl.detail')
    })

    it('stays silent at four percent', () => {
      const input = makeInput({
        stats: makeStats({ time_distribution: hourly({ 2: 4, 14: 96 }) }),
      })
      expect(findMoment(detectRecapMoments(input), 'nightOwl')).toBeUndefined()
    })

    it('does not count the 05:00 hour as night', () => {
      const input = makeInput({
        stats: makeStats({ time_distribution: hourly({ 5: 20, 14: 80 }) }),
      })
      const moments = detectRecapMoments(input)
      expect(findMoment(moments, 'nightOwl')).toBeUndefined()
      expect(findMoment(moments, 'dawnBreaker')?.detail.values).toEqual({ count: 20, hour: '05' })
    })
  })

  describe('anniversary and firstLight', () => {
    it('gives firstLight, not anniversary, when the story starts inside the period', () => {
      const input = makeInput({
        allSessions: [makeSession({ created: localIso(2026, 3, 5) })],
      })
      const moments = detectRecapMoments(input)
      expect(findMoment(moments, 'firstLight')?.detail.values).toEqual({ date: '2026-03-05' })
      expect(findMoment(moments, 'anniversary')).toBeUndefined()
    })

    it('gives anniversary, not firstLight, when the period holds the yearly date', () => {
      const input = makeInput({
        allSessions: [makeSession({ created: localIso(2024, 3, 5) })],
      })
      const moments = detectRecapMoments(input)
      expect(findMoment(moments, 'anniversary')?.detail.values).toEqual({ years: 2 })
      expect(findMoment(moments, 'firstLight')).toBeUndefined()
    })

    it('ignores an anniversary that has not happened yet', () => {
      const input = makeInput({
        allSessions: [makeSession({ created: localIso(2025, 3, 5) })],
        now: new Date(2026, 2, 4, 12),
      })
      expect(findMoment(detectRecapMoments(input), 'anniversary')).toBeUndefined()
    })

    it('falls back to modified when created is unusable', () => {
      const input = makeInput({
        allSessions: [makeSession({ created: '', modified: localIso(2026, 3, 9) })],
      })
      expect(findMoment(detectRecapMoments(input), 'firstLight')?.detail.values).toEqual({
        date: '2026-03-09',
      })
    })
  })

  describe('comeback', () => {
    it('fires when a long silence is followed by a real return', () => {
      const input = makeInput({
        stats: makeStats({
          heatmap_data: [...activeDays(2026, 1, 1, 4), ...activeDays(2026, 1, 30, 3)],
        }),
      })
      const moment = findMoment(detectRecapMoments(input), 'comeback')
      expect(moment?.rarity).toBe('rare')
      expect(moment?.detail.values).toEqual({ days: 25 })
    })

    it('stays silent when the return does not stick', () => {
      const input = makeInput({
        stats: makeStats({
          heatmap_data: [...activeDays(2026, 1, 1, 4), ...activeDays(2026, 1, 30, 2)],
        }),
      })
      expect(findMoment(detectRecapMoments(input), 'comeback')).toBeUndefined()
    })

    it('stays silent for a gap shorter than three weeks', () => {
      const input = makeInput({
        stats: makeStats({
          heatmap_data: [...activeDays(2026, 1, 1, 4), ...activeDays(2026, 1, 25, 4)],
        }),
      })
      expect(findMoment(detectRecapMoments(input), 'comeback')).toBeUndefined()
    })
  })

  describe('share based moments', () => {
    it('rates oneTrueProject by dominance and requires ten sessions', () => {
      const dominant = makeInput({
        stats: makeStats({
          sessions_by_project: { '/Users/me/code/atlas': 8, '/Users/me/code/misc': 2 },
        }),
      })
      const moment = findMoment(detectRecapMoments(dominant), 'oneTrueProject')
      expect(moment?.rarity).toBe('rare')
      expect(moment?.detail.values).toEqual({ share: 80, project: 'atlas' })

      const split = makeInput({
        stats: makeStats({
          sessions_by_project: { '/Users/me/code/atlas': 6, '/Users/me/code/misc': 4 },
        }),
      })
      expect(findMoment(detectRecapMoments(split), 'oneTrueProject')?.rarity).toBe('common')

      const tiny = makeInput({
        stats: makeStats({ sessions_by_project: { '/Users/me/code/atlas': 9 } }),
      })
      expect(findMoment(detectRecapMoments(tiny), 'oneTrueProject')).toBeUndefined()
    })

    it('rates polyglot by the number of distinct models', () => {
      const many = makeInput({
        stats: makeStats({
          sessions_by_model: { a: 1, b: 1, c: 1, d: 1, e: 1 },
        }),
      })
      expect(findMoment(detectRecapMoments(many), 'polyglot')?.rarity).toBe('rare')

      const few = makeInput({
        stats: makeStats({ sessions_by_model: { a: 1, b: 1, c: 1 } }),
      })
      expect(findMoment(detectRecapMoments(few), 'polyglot')?.rarity).toBe('common')

      const pair = makeInput({ stats: makeStats({ sessions_by_model: { a: 1, b: 1 } }) })
      expect(findMoment(detectRecapMoments(pair), 'polyglot')).toBeUndefined()
    })

    it('requires both a cache share and real volume for cacheWhisperer', () => {
      const heavy = makeInput({
        stats: makeStats({
          token_details: makeTokenDetails({
            total_input: 300_000,
            total_output: 100_000,
            total_cache_read: 500_000,
            total_cache_write: 200_000,
          }),
        }),
      })
      expect(findMoment(detectRecapMoments(heavy), 'cacheWhisperer')?.detail.values).toEqual({
        share: 64,
      })

      const light = makeInput({
        stats: makeStats({
          token_details: makeTokenDetails({
            total_input: 3_000,
            total_output: 1_000,
            total_cache_read: 5_000,
            total_cache_write: 2_000,
          }),
        }),
      })
      expect(findMoment(detectRecapMoments(light), 'cacheWhisperer')).toBeUndefined()
    })
  })

  describe('weekendBuilder and quietCraft', () => {
    it('counts Saturdays and Sundays among active days', () => {
      // Five weekends' worth of Saturdays in March and April 2026.
      const weekends = [
        ...activeDays(2026, 3, 7, 1),
        ...activeDays(2026, 3, 14, 1),
        ...activeDays(2026, 3, 21, 1),
        ...activeDays(2026, 3, 28, 1),
        ...activeDays(2026, 3, 2, 3),
      ]
      const input = makeInput({ stats: makeStats({ heatmap_data: weekends }) })
      const moment = findMoment(detectRecapMoments(input), 'weekendBuilder')
      expect(moment?.rarity).toBe('common')
      expect(moment?.detail.values).toEqual({ days: 4, activeDays: 7 })
    })

    it('needs at least four weekend days', () => {
      const input = makeInput({
        stats: makeStats({
          heatmap_data: [...activeDays(2026, 3, 7, 1), ...activeDays(2026, 3, 14, 1)],
        }),
      })
      expect(findMoment(detectRecapMoments(input), 'weekendBuilder')).toBeUndefined()
    })

    it('rewards many short sessions without mutating the input', () => {
      const sessions = Array.from({ length: 31 }, (_, index) =>
        makeSession({ id: `session-${index}`, message_count: index === 0 ? 40 : 4 }),
      )
      const input = makeInput({ sessions })
      const moment = findMoment(detectRecapMoments(input), 'quietCraft')
      expect(moment?.detail.values).toEqual({ sessions: 31, median: 4 })
      expect(input.sessions[0].message_count).toBe(40)
    })

    it('stays silent when sessions run deep', () => {
      const sessions = Array.from({ length: 31 }, (_, index) =>
        makeSession({ id: `session-${index}`, message_count: 20 }),
      )
      expect(findMoment(detectRecapMoments(makeInput({ sessions })), 'quietCraft')).toBeUndefined()
    })
  })

  it('orders legendary before rare before common, then alphabetically', () => {
    const input = makeInput({
      stats: makeStats({
        heatmap_data: activeDays(2026, 3, 1, 30),
        time_distribution: hourly({ 2: 6, 6: 6, 14: 88 }),
      }),
    })

    const moments = detectRecapMoments(input)
    expect(moments.map((moment) => moment.id)).toEqual([
      'ironStreak',
      'dawnBreaker',
      'nightOwl',
      'weekendBuilder',
    ])
    expect(moments.map((moment) => moment.rarity)).toEqual([
      'legendary',
      'rare',
      'rare',
      'common',
    ])
  })
})
