import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HeatmapPoint,
  SessionInfo,
  SessionStats,
  TimeDistributionPoint,
  TokenDetails,
} from '@/types'
import type { RecapInput, RecapMoment, RecapPeriod, RecapSceneId } from './recapTypes'

const momentsStub = vi.hoisted(() => ({ current: [] as RecapMoment[] }))

vi.mock('./recapMoments', () => ({
  detectRecapMoments: () => momentsStub.current,
}))

const { buildRecapStory } = await import('./recapStory')

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const NOW = new Date(2026, 2, 31, 12, 0, 0)

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    path: '/home/me/.pi/agent/sessions/atlas/a.jsonl',
    id: 'a',
    cwd: '/home/me/code/atlas',
    created: '2026-03-01T09:00:00.000Z',
    modified: '2026-03-01T10:00:00.000Z',
    message_count: 5,
    first_message: 'Set up the project skeleton',
    last_message: 'Done',
    last_message_role: 'assistant',
    ...overrides,
  }
}

function makeTokenDetails(overrides: Partial<TokenDetails> = {}): TokenDetails {
  return {
    total_input: 400_000,
    total_output: 120_000,
    total_cache_read: 700_000,
    total_cache_write: 30_000,
    total_cost: 12.3,
    tokens_by_model: {},
    ...overrides,
  }
}

function makeHeatmapPoint(date: string, messages: number, sessions = 1): HeatmapPoint {
  return {
    date,
    level: messages > 0 ? Math.min(5, Math.ceil(messages / 25)) : 0,
    total_messages: messages,
    total_tokens: messages * 900,
    total_cost: messages * 0.02,
    session_count: sessions,
  }
}

function makeHourly(peakHour: number): TimeDistributionPoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    message_count: hour === peakHour ? 120 : 4,
  }))
}

function makeStats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    total_sessions: 2,
    total_messages: 150,
    user_messages: 70,
    assistant_messages: 80,
    total_tokens: 1_250_000,
    sessions_by_project: { '/home/me/code/atlas': 2 },
    sessions_by_model: { 'claude-sonnet-4': 2 },
    model_usage_by_project: {},
    messages_by_date: {},
    messages_by_hour: {},
    messages_by_day_of_week: {},
    average_messages_per_session: 75,
    heatmap_data: [
      makeHeatmapPoint('2026-03-01', 10),
      makeHeatmapPoint('2026-03-02', 10),
      makeHeatmapPoint('2026-03-03', 10),
      makeHeatmapPoint('2026-03-04', 10),
      makeHeatmapPoint('2026-03-05', 110, 2),
    ],
    time_distribution: makeHourly(23),
    token_details: makeTokenDetails(),
    ...overrides,
  }
}

function makePeriod(overrides: Partial<RecapPeriod> = {}): RecapPeriod {
  return {
    kind: 'month',
    cycleKey: 'month:2026-03',
    start: new Date(2026, 2, 1, 0, 0, 0),
    end: new Date(2026, 2, 31, 23, 59, 59, 999),
    year: 2026,
    label: { key: 'dashboard.recap.period.month', fallback: 'March 2026' },
    ...overrides,
  }
}

const SHALLOW_SESSION = makeSession({
  path: '/home/me/.pi/agent/sessions/atlas/shallow.jsonl',
  id: 'shallow',
  created: '2026-03-01T09:00:00.000Z',
  message_count: 5,
  first_message: 'Set up the project skeleton',
})

const DEEP_SESSION = makeSession({
  path: '/home/me/.pi/agent/sessions/atlas/deep.jsonl',
  id: 'deep',
  created: '2026-03-05T14:00:00.000Z',
  modified: '2026-03-05T20:00:00.000Z',
  message_count: 42,
  first_message: 'The websocket keeps dropping after about ninety seconds. Where do I even start?',
})

function makeInput(overrides: Partial<RecapInput> = {}): RecapInput {
  const sessions = overrides.sessions ?? [SHALLOW_SESSION, DEEP_SESSION]
  return {
    period: makePeriod(),
    stats: makeStats(),
    sessions,
    allSessions: sessions,
    now: NOW,
    ...overrides,
  }
}

function sceneIds(scenes: { id: RecapSceneId }[]): RecapSceneId[] {
  return scenes.map((scene) => scene.id)
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

beforeEach(() => {
  momentsStub.current = []
})

describe('buildRecapStory — empty period', () => {
  it('returns a two-scene, metric-free story', () => {
    const story = buildRecapStory(
      makeInput({
        sessions: [],
        allSessions: [],
        stats: makeStats({
          total_sessions: 0,
          total_messages: 0,
          total_tokens: 0,
          sessions_by_project: {},
          sessions_by_model: {},
          heatmap_data: [],
          time_distribution: [],
          token_details: makeTokenDetails({ total_cost: 0 }),
        }),
      }),
    )

    expect(story.isEmpty).toBe(true)
    expect(sceneIds(story.scenes)).toEqual(['opening', 'closing'])
    expect(story.scenes.every((scene) => scene.metrics.length === 0)).toBe(true)
    expect(story.moments).toEqual([])
  })

  it('does not scold the reader for being away', () => {
    const story = buildRecapStory(makeInput({ sessions: [], allSessions: [] }))
    const copy = story.scenes
      .flatMap((scene) => [scene.eyebrow, scene.title, scene.body, scene.footnote])
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => entry.fallback)
      .join(' ')

    expect(copy).not.toMatch(/!/)
    expect(copy.toLowerCase()).not.toMatch(/congratulation|amazing|crushed/)
  })
})

describe('buildRecapStory — scene skipping', () => {
  it('omits `voice` when there is no model data', () => {
    const story = buildRecapStory(
      makeInput({ stats: makeStats({ sessions_by_model: {} }) }),
    )

    expect(sceneIds(story.scenes)).not.toContain('voice')
    expect(sceneIds(story.scenes)).toContain('companion')
  })

  it('omits `deepDive` when the deepest session is one message long', () => {
    const tiny = makeSession({ id: 'tiny', path: '/tmp/tiny.jsonl', message_count: 1 })
    const story = buildRecapStory(makeInput({ sessions: [tiny], allSessions: [tiny] }))

    expect(sceneIds(story.scenes)).not.toContain('deepDive')
    expect(sceneIds(story.scenes)).toContain('firstWords')
  })

  it('omits `rhythm` when no messages carry an hour', () => {
    const silentDial: TimeDistributionPoint[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      message_count: 0,
    }))
    const story = buildRecapStory(
      makeInput({ stats: makeStats({ time_distribution: silentDial }) }),
    )

    expect(sceneIds(story.scenes)).not.toContain('rhythm')
    expect(sceneIds(buildRecapStory(makeInput()).scenes)).toContain('rhythm')
  })

  it('omits `busiestDay` when the heaviest day is not twice a normal one', () => {
    const flat = makeStats({
      heatmap_data: [
        makeHeatmapPoint('2026-03-01', 10),
        makeHeatmapPoint('2026-03-02', 11),
        makeHeatmapPoint('2026-03-03', 12),
      ],
    })
    const story = buildRecapStory(makeInput({ stats: flat }))

    expect(sceneIds(story.scenes)).not.toContain('busiestDay')
  })

  it('omits `streak` when the longest run is under three days', () => {
    const gappy = makeStats({
      heatmap_data: [
        makeHeatmapPoint('2026-03-01', 10),
        makeHeatmapPoint('2026-03-03', 10),
        makeHeatmapPoint('2026-03-05', 110, 2),
      ],
    })
    const story = buildRecapStory(makeInput({ stats: gappy }))

    expect(sceneIds(story.scenes)).not.toContain('streak')
  })
})

describe('buildRecapStory — scene cap', () => {
  it('keeps every qualifying scene when there are ten or fewer', () => {
    // A gappy heatmap kills `streak`; with no moments that leaves exactly ten.
    const story = buildRecapStory(
      makeInput({
        stats: makeStats({
          heatmap_data: [
            makeHeatmapPoint('2026-03-01', 10),
            makeHeatmapPoint('2026-03-03', 10),
            makeHeatmapPoint('2026-03-05', 110, 2),
            makeHeatmapPoint('2026-03-07', 10),
          ],
        }),
      }),
    )

    expect(sceneIds(story.scenes)).toEqual([
      'opening',
      'volume',
      'busiestDay',
      'rhythm',
      'companion',
      'voice',
      'deepDive',
      'firstWords',
      'closing',
      'summary',
    ])
  })

  it('drops `voice` first when exactly one scene is over the cap', () => {
    // The same gappy heatmap plus a moment pushes the count to eleven.
    momentsStub.current = [
      {
        id: 'nightOwl',
        rarity: 'rare',
        icon: 'moon',
        title: { key: 'dashboard.recap.moment.nightOwl.title', fallback: 'Night owl' },
        detail: { key: 'dashboard.recap.moment.nightOwl.detail', fallback: 'Mostly after dark' },
      },
    ]
    const story = buildRecapStory(
      makeInput({
        stats: makeStats({
          heatmap_data: [
            makeHeatmapPoint('2026-03-01', 10),
            makeHeatmapPoint('2026-03-03', 10),
            makeHeatmapPoint('2026-03-05', 110, 2),
            makeHeatmapPoint('2026-03-07', 10),
          ],
        }),
      }),
    )

    expect(sceneIds(story.scenes)).toEqual([
      'opening',
      'volume',
      'busiestDay',
      'rhythm',
      'companion',
      'deepDive',
      'firstWords',
      'moments',
      'closing',
      'summary',
    ])
  })

  it('drops `voice` then `companion` when all twelve scenes qualify', () => {
    momentsStub.current = [
      {
        id: 'ironStreak',
        rarity: 'legendary',
        icon: 'flame',
        title: { key: 'dashboard.recap.moment.ironStreak.title', fallback: 'Iron streak' },
        detail: { key: 'dashboard.recap.moment.ironStreak.detail', fallback: 'Five days running' },
      },
    ]
    const story = buildRecapStory(makeInput())

    expect(story.scenes).toHaveLength(10)
    expect(sceneIds(story.scenes)).toEqual([
      'opening',
      'volume',
      'busiestDay',
      'rhythm',
      'streak',
      'deepDive',
      'firstWords',
      'moments',
      'closing',
      'summary',
    ])
    expect(story.scenes[0].id).toBe('opening')
    expect(story.scenes[story.scenes.length - 1].id).toBe('summary')
  })
})

describe('buildRecapStory — determinism', () => {
  it('produces deeply equal stories for the same input', () => {
    const input = makeInput()

    expect(buildRecapStory(input)).toEqual(buildRecapStory(input))
  })

  it('derives a stable accent hue inside 0..359', () => {
    const first = buildRecapStory(makeInput())
    const second = buildRecapStory(makeInput())

    expect(first.accentHue).toBe(second.accentHue)
    expect(Number.isInteger(first.accentHue)).toBe(true)
    expect(first.accentHue).toBeGreaterThanOrEqual(0)
    expect(first.accentHue).toBeLessThanOrEqual(359)
  })

  it('changes the accent hue when the top project changes', () => {
    const atlas = buildRecapStory(makeInput())
    const beacon = buildRecapStory(
      makeInput({ stats: makeStats({ sessions_by_project: { '/home/me/code/beacon': 2 } }) }),
    )

    expect(atlas.accentHue).not.toBe(beacon.accentHue)
  })

  it('falls back to the model, then the cycle key, for the hue seed', () => {
    const modelSeeded = buildRecapStory(
      makeInput({ stats: makeStats({ sessions_by_project: {} }) }),
    )
    const keySeeded = buildRecapStory(
      makeInput({
        stats: makeStats({ sessions_by_project: {}, sessions_by_model: {} }),
      }),
    )

    expect(modelSeeded.accentHue).toBeGreaterThanOrEqual(0)
    expect(keySeeded.accentHue).toBeGreaterThanOrEqual(0)
    expect(modelSeeded.accentHue).not.toBe(keySeeded.accentHue)
  })
})

describe('buildRecapStory — quotes', () => {
  it('skips `firstWords` when it would repeat the deepDive quote', () => {
    const only = makeSession({
      id: 'only',
      path: '/tmp/only.jsonl',
      message_count: 64,
      first_message: 'Trace the render loop and tell me where the frame budget goes',
    })
    const story = buildRecapStory(makeInput({ sessions: [only], allSessions: [only] }))

    expect(sceneIds(story.scenes)).toContain('deepDive')
    expect(sceneIds(story.scenes)).not.toContain('firstWords')
  })

  it('keeps `firstWords` when the earliest session is not the deepest', () => {
    const story = buildRecapStory(makeInput())
    const firstWords = story.scenes.find((scene) => scene.id === 'firstWords')

    expect(firstWords?.visual).toEqual({
      type: 'quote',
      text: SHALLOW_SESSION.first_message,
      caption: {
        key: 'dashboard.recap.scene.firstWords.footnote',
        fallback: 'Your own words, {{date}}',
        values: { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      },
    })
  })

  it('cuts a 400-character opener to 180 characters on a word boundary', () => {
    const raw = Array.from({ length: 100 }, (_, index) => `alpha${index % 10}`)
      .join(' ')
      .slice(0, 400)
    expect(raw).toHaveLength(400)

    const long = makeSession({
      id: 'long',
      path: '/tmp/long.jsonl',
      message_count: 51,
      first_message: raw,
    })
    const story = buildRecapStory(makeInput({ sessions: [long], allSessions: [long] }))
    const deepDive = story.scenes.find((scene) => scene.id === 'deepDive')

    if (deepDive?.visual.type !== 'quote') throw new Error('expected a quote visual')
    const quote = deepDive.visual.text
    expect(quote.length).toBeLessThanOrEqual(180)
    expect(quote.endsWith('…')).toBe(true)

    const body = quote.slice(0, -1)
    expect(raw.startsWith(body)).toBe(true)
    expect(raw[body.length]).toBe(' ')
  })

  it('leaves a short opener untouched and collapses its whitespace', () => {
    const messy = makeSession({
      id: 'messy',
      path: '/tmp/messy.jsonl',
      message_count: 33,
      first_message: '  Why   does\n\nthe cache miss   ?  ',
    })
    const story = buildRecapStory(makeInput({ sessions: [messy], allSessions: [messy] }))
    const deepDive = story.scenes.find((scene) => scene.id === 'deepDive')

    if (deepDive?.visual.type !== 'quote') throw new Error('expected a quote visual')
    expect(deepDive.visual.text).toBe('Why does the cache miss ?')
  })
})

describe('buildRecapStory — closing', () => {
  function lifetimeSessions(count: number, firstCreated: string): SessionInfo[] {
    return Array.from({ length: count }, (_, index) =>
      makeSession({
        id: `life-${index}`,
        path: `/tmp/life-${index}.jsonl`,
        created: index === 0 ? firstCreated : '2025-06-01T09:00:00.000Z',
        modified: index === 0 ? firstCreated : '2025-06-01T10:00:00.000Z',
      }),
    )
  }

  it('reads the period as quiet when it runs below the lifetime pace', () => {
    const story = buildRecapStory(
      makeInput({
        sessions: [SHALLOW_SESSION, DEEP_SESSION],
        allSessions: [
          ...lifetimeSessions(400, '2025-01-01T09:00:00.000Z'),
          SHALLOW_SESSION,
          DEEP_SESSION,
        ],
      }),
    )
    const closing = story.scenes.find((scene) => scene.id === 'closing')

    expect(closing?.body?.key).toBe('dashboard.recap.scene.closing.quiet.body')
    expect(closing?.metrics.map((entry) => entry.key)).toEqual([
      'daysTogether',
      'lifetimeSessions',
    ])
  })

  it('reads the period as the busiest when it runs above the lifetime pace', () => {
    const period = Array.from({ length: 24 }, (_, index) =>
      makeSession({
        id: `burst-${index}`,
        path: `/tmp/burst-${index}.jsonl`,
        created: '2026-03-05T09:00:00.000Z',
        modified: '2026-03-05T10:00:00.000Z',
        message_count: 30,
      }),
    )
    const story = buildRecapStory(
      makeInput({
        sessions: period,
        allSessions: [...lifetimeSessions(10, '2025-01-01T09:00:00.000Z'), ...period],
      }),
    )
    const closing = story.scenes.find((scene) => scene.id === 'closing')

    expect(closing?.body?.key).toBe('dashboard.recap.scene.closing.busiest.body')
  })
})

describe('buildRecapStory — copy contract', () => {
  it('namespaces every translation key and keeps metrics to three or fewer', () => {
    momentsStub.current = []
    const story = buildRecapStory(makeInput())

    for (const scene of story.scenes) {
      const texts = [scene.eyebrow, scene.title, scene.body, scene.footnote].filter(
        (entry): entry is NonNullable<typeof entry> => Boolean(entry),
      )
      for (const entry of texts) {
        expect(entry.key.startsWith(`dashboard.recap.scene.${scene.id}.`)).toBe(true)
        expect(entry.key).toMatch(/\.(eyebrow|title|body|footnote)$/)
        expect(entry.fallback.length).toBeGreaterThan(0)
      }
      for (const entry of scene.metrics) {
        expect(entry.label.key).toMatch(/^dashboard\.recap\.metric\.[A-Za-z]+$/)
      }
      expect(scene.metrics.length).toBeLessThanOrEqual(3)
    }
  })

  it('formats the volume footnote cost as a plain dollar amount', () => {
    const story = buildRecapStory(makeInput())
    const volume = story.scenes.find((scene) => scene.id === 'volume')

    expect(volume?.footnote?.values?.cost).toBe('$12.30')
    expect(volume?.metrics.find((entry) => entry.key === 'tokens')?.display).toBe('1.3M')
  })

  it('renders the clock dial with 24 normalized hours', () => {
    const story = buildRecapStory(makeInput())
    const rhythm = story.scenes.find((scene) => scene.id === 'rhythm')

    if (rhythm?.visual.type !== 'clockDial') throw new Error('expected a clock dial visual')
    expect(rhythm.visual.hours).toHaveLength(24)
    expect(rhythm.visual.peakHour).toBe(23)
    expect(Math.max(...rhythm.visual.hours)).toBe(1)
    expect(Math.min(...rhythm.visual.hours)).toBeGreaterThanOrEqual(0)
  })

  it('caps the streak ribbon at 84 days, oldest first', () => {
    const story = buildRecapStory(makeInput())
    const streak = story.scenes.find((scene) => scene.id === 'streak')

    if (streak?.visual.type !== 'streakRibbon') throw new Error('expected a streak ribbon visual')
    expect(streak.visual.days.length).toBeLessThanOrEqual(84)
    expect(streak.visual.days.slice(0, 5)).toEqual([true, true, true, true, true])
  })

  it('never mutates the input', () => {
    const input = makeInput()
    const snapshot = JSON.stringify({
      sessions: input.sessions,
      allSessions: input.allSessions,
      stats: input.stats,
    })

    buildRecapStory(input)

    expect(
      JSON.stringify({
        sessions: input.sessions,
        allSessions: input.allSessions,
        stats: input.stats,
      }),
    ).toBe(snapshot)
  })
})

describe('buildRecapStory — summary', () => {
  beforeEach(() => {
    momentsStub.current = []
  })

  it('always headlines exactly four stats, ending on spend', () => {
    const { summary } = buildRecapStory(makeInput())

    expect(summary.headline.map((entry) => entry.key)).toEqual([
      'sessions',
      'messages',
      'tokens',
      'cost',
    ])
    expect(summary.headline[2].display).toBe('1.3M')
    expect(summary.headline[3].display).toBe('$12.30')
  })

  it('headlines messages per session when the period cost nothing', () => {
    const { summary } = buildRecapStory(
      makeInput({
        stats: makeStats({ token_details: makeTokenDetails({ total_cost: 0 }) }),
      }),
    )

    expect(summary.headline.map((entry) => entry.key)).toEqual([
      'sessions',
      'messages',
      'tokens',
      'averageMessages',
    ])
    // Promoted to the headline, so it must not be repeated below it.
    expect(summary.detail.map((entry) => entry.key)).not.toContain('averageMessages')
  })

  it('skips detail stats whose source is empty', () => {
    const { summary } = buildRecapStory(
      makeInput({
        stats: makeStats({
          sessions_by_model: {},
          token_details: makeTokenDetails({ total_cache_read: 0 }),
        }),
      }),
    )
    const keys = summary.detail.map((entry) => entry.key)

    expect(keys).not.toContain('topModel')
    expect(keys).not.toContain('cacheRead')
    expect(keys).not.toContain('subagentRuns')
    expect(keys).toContain('topProject')
  })

  it('caps detail at eight stats', () => {
    const { summary } = buildRecapStory(
      makeInput({
        stats: makeStats({
          subagent_summary: {
            total_cost: 1,
            total_runs: 9,
            total_tokens: 100,
            runs_by_agent: {},
            runs_by_model: {},
          },
        }),
      }),
    )

    expect(summary.detail).toHaveLength(8)
  })

  it('normalizes the pulse to 0..1 across the period window, in date order', () => {
    const { summary } = buildRecapStory(makeInput())

    // March 1 through the `now` of March 31, not just the days with data.
    expect(summary.pulse).toHaveLength(31)
    expect(summary.pulse.slice(0, 6)).toEqual([0.091, 0.091, 0.091, 0.091, 1, 0])
    expect(Math.max(...summary.pulse)).toBe(1)
    expect(Math.min(...summary.pulse)).toBe(0)
  })

  it('hands the cover and the finale the same stats', () => {
    const story = buildRecapStory(makeInput())
    const opening = story.scenes[0]
    const finale = story.scenes[story.scenes.length - 1]

    if (opening.visual.type !== 'overview') throw new Error('expected an overview visual')
    if (finale.visual.type !== 'summaryGrid') throw new Error('expected a summary grid visual')
    expect(opening.visual.stats).toEqual(story.summary.headline)
    expect(opening.visual.pulse).toEqual(story.summary.pulse)
    expect(finale.visual.headline).toEqual(story.summary.headline)
    expect(finale.visual.detail).toEqual(story.summary.detail)
  })

  it('leaves an empty period without a summary card', () => {
    const story = buildRecapStory(
      makeInput({ sessions: [], allSessions: [], stats: makeStats({ total_messages: 0 }) }),
    )

    expect(story.summary).toEqual({ headline: [], detail: [], pulse: [] })
    expect(sceneIds(story.scenes)).not.toContain('summary')
  })
})
