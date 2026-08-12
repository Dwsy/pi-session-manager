import type { HeatmapPoint, SessionInfo, SessionStats, TimeDistributionPoint } from '@/types'
import { formatTokens } from '@/utils/format'
import { getPathBasename } from '@/utils/path'
import { detectRecapMoments } from './recapMoments'
import type {
  RecapInput,
  RecapMetric,
  RecapMoment,
  RecapScene,
  RecapSceneId,
  RecapStat,
  RecapStatIcon,
  RecapStory,
  RecapSummary,
  RecapText,
} from './recapTypes'

/**
 * Narrative composer for the dashboard recap.
 *
 * Turns a period's statistics into an ordered list of scenes. Pure and
 * deterministic: the only clock it reads is `input.now`. All copy is emitted as
 * translation descriptors, so nothing here formats dates or numbers for a
 * locale — the sole exceptions are the compact token string and the plain
 * `$x.xx` cost, which are stable across locales by construction.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SCENES = 10
/** More than this and the summary card stops being scannable. */
const MAX_DETAIL_STATS = 8
const QUOTE_LIMIT = 180
const QUOTE_ELLIPSIS = '…'
/** A quote must keep at least this much text after the word-boundary cut. */
const QUOTE_MIN_BODY = 40
const SPARKLINE_WINDOW = 30
const STREAK_RIBBON_DAYS = 84
const MIN_STREAK = 3
const MIN_DEEP_DIVE_MESSAGES = 20
/** A day only reads as "the busiest" when it clears this multiple of a normal one. */
const BUSIEST_DAY_FACTOR = 2

/** Lowest-priority first; scenes are dropped from the front of this list. */
const SCENE_DROP_ORDER: RecapSceneId[] = ['voice', 'companion', 'busiestDay', 'streak']

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

type TextValues = Record<string, string | number>

function text(key: string, fallback: string, values?: TextValues): RecapText {
  return values ? { key, fallback, values } : { key, fallback }
}

/**
 * `slot` is the trailing part of the key, e.g. `title` or `nightOwl.body`.
 * Variant slots keep one stable key per wording so translators never have to
 * cover two different sentences with a single entry.
 */
function sceneText(
  scene: RecapSceneId,
  slot: string,
  fallback: string,
  values?: TextValues,
): RecapText {
  return text(`dashboard.recap.scene.${scene}.${slot}`, fallback, values)
}

function metric(
  key: string,
  labelFallback: string,
  value: number | string,
  display?: string,
): RecapMetric {
  const label = text(`dashboard.recap.metric.${key}`, labelFallback)
  return display === undefined ? { key, label, value } : { key, label, value, display }
}

interface StatOptions {
  display?: string
  hint?: RecapText
}

function stat(
  key: string,
  icon: RecapStatIcon,
  labelFallback: string,
  value: number | string,
  options: StatOptions = {},
): RecapStat {
  const entry: RecapStat = {
    key,
    icon,
    label: text(`dashboard.recap.stat.${key}`, labelFallback),
    value,
  }
  if (options.display !== undefined) entry.display = options.display
  if (options.hint !== undefined) entry.hint = options.hint
  return entry
}

function statHint(slot: string, fallback: string, values?: TextValues): RecapText {
  return text(`dashboard.recap.stat.hint.${slot}`, fallback, values)
}

/* ------------------------------------------------------------------ *
 * Date helpers — must match the local-date conventions in dashboardInsights.ts
 * ------------------------------------------------------------------ */

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function localDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / DAY_MS)
}

function sessionTimestamp(session: SessionInfo): number {
  const created = Date.parse(session.created)
  if (Number.isFinite(created)) return created
  const modified = Date.parse(session.modified)
  return Number.isFinite(modified) ? modified : Number.POSITIVE_INFINITY
}

/* ------------------------------------------------------------------ *
 * Numeric helpers
 * ------------------------------------------------------------------ */

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalize(values: number[]): number[] {
  const max = values.reduce((best, value) => (value > best ? value : best), 0)
  if (max <= 0) return values.map(() => 0)
  return values.map((value) => round(Math.max(0, value) / max, 3))
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** FNV-1a, so the same project name always tints the recap the same way. */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/* ------------------------------------------------------------------ *
 * Derivations
 * ------------------------------------------------------------------ */

interface RankedEntry {
  name: string
  count: number
  share: number
}

function rankEntries(source: Record<string, number>): RankedEntry[] {
  const entries = Object.entries(source).filter(([name, count]) => name.length > 0 && count > 0)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  return entries
    .slice()
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
    .map(([name, count]) => ({ name, count, share: total > 0 ? count / total : 0 }))
}

function trimQuote(raw: string | undefined): string {
  const collapsed = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (collapsed.length <= QUOTE_LIMIT) return collapsed

  const window = collapsed.slice(0, QUOTE_LIMIT - QUOTE_ELLIPSIS.length)
  const lastSpace = window.lastIndexOf(' ')
  const cut = lastSpace >= QUOTE_MIN_BODY ? window.slice(0, lastSpace) : window
  return `${cut.replace(/[\s,.;:!?—-]+$/, '')}${QUOTE_ELLIPSIS}`
}

function buildHourBuckets(points: TimeDistributionPoint[]): number[] {
  const buckets = new Array<number>(24).fill(0)
  for (const point of points) {
    if (!Number.isInteger(point.hour) || point.hour < 0 || point.hour > 23) continue
    buckets[point.hour] += Math.max(0, point.message_count)
  }
  return buckets
}

function peakIndex(values: number[]): number {
  let peak = 0
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[peak]) peak = index
  }
  return peak
}

type RhythmShape = 'nightOwl' | 'earlyRiser' | 'officeHours' | 'evening'

function rhythmShape(hour: number): RhythmShape {
  if (hour >= 22 || hour < 5) return 'nightOwl'
  if (hour < 9) return 'earlyRiser'
  if (hour < 18) return 'officeHours'
  return 'evening'
}

/** Inclusive local dates across the period, oldest first, clamped to `now`. */
function periodDateKeys(input: RecapInput): string[] {
  const start = startOfLocalDay(input.period.start)
  const endSource = input.period.end.getTime() < input.now.getTime() ? input.period.end : input.now
  const span = localDaysBetween(start, endSource)
  if (span < 0) return []

  const keys: string[] = []
  for (let offset = 0; offset <= span; offset += 1) {
    keys.push(toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)))
  }
  return keys
}

function buildPeriodDays(input: RecapInput): boolean[] {
  const activity = new Map<string, boolean>()
  for (const point of input.stats.heatmap_data) {
    activity.set(point.date, point.level > 0 || point.total_messages > 0)
  }
  return periodDateKeys(input).map((key) => activity.get(key) === true)
}

/**
 * Normalized per-day message counts across the period. Scoped to the period
 * window rather than the raw heatmap, which can span far more days than the
 * period and would squeeze the cover strip into a corner.
 */
function buildPeriodPulse(input: RecapInput): number[] {
  const messages = new Map<string, number>()
  for (const point of input.stats.heatmap_data) {
    messages.set(point.date, Math.max(0, point.total_messages))
  }
  return normalize(periodDateKeys(input).map((key) => messages.get(key) ?? 0))
}

function longestRun(days: boolean[]): number {
  let longest = 0
  let running = 0
  for (const active of days) {
    running = active ? running + 1 : 0
    if (running > longest) longest = running
  }
  return longest
}

function earliestSession(sessions: SessionInfo[]): SessionInfo | null {
  return sessions.reduce<SessionInfo | null>((earliest, session) => {
    if (!earliest) return session
    const candidate = sessionTimestamp(session)
    const incumbent = sessionTimestamp(earliest)
    if (candidate < incumbent) return session
    if (candidate === incumbent && session.path < earliest.path) return session
    return earliest
  }, null)
}

function deepestSession(sessions: SessionInfo[]): SessionInfo | null {
  return sessions.reduce<SessionInfo | null>((deepest, session) => {
    if (!deepest) return session
    if (session.message_count > deepest.message_count) return session
    if (session.message_count === deepest.message_count && session.path < deepest.path) return session
    return deepest
  }, null)
}

function resolveAccentHue(stats: SessionStats, cycleKey: string): number {
  const project = rankEntries(stats.sessions_by_project)[0]
  const model = rankEntries(stats.sessions_by_model)[0]
  const seed = project?.name ?? model?.name ?? cycleKey
  return hashString(seed) % 360
}

function byDate(left: HeatmapPoint, right: HeatmapPoint): number {
  return left.date < right.date ? -1 : left.date > right.date ? 1 : 0
}

/** Ties go to the earlier date, so the pick is stable across renders. */
function busiestDay(points: HeatmapPoint[]): HeatmapPoint | null {
  const active = points.filter((point) => point.total_messages > 0)
  if (active.length === 0) return null
  return active.reduce<HeatmapPoint>(
    (best, point) =>
      point.total_messages > best.total_messages ||
      (point.total_messages === best.total_messages && point.date < best.date)
        ? point
        : best,
    active[0],
  )
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

function emptySummary(): RecapSummary {
  return { headline: [], detail: [], pulse: [] }
}

/**
 * The whole period reduced to one card. Derived once so the opening cover,
 * the closing card, and the exported image can never disagree.
 */
function buildSummary(input: RecapInput, periodDays: boolean[]): RecapSummary {
  const { stats } = input
  const sessionCount = input.sessions.length
  const cost = stats.token_details.total_cost
  const averageMessages = sessionCount > 0 ? round(stats.total_messages / sessionCount, 1) : 0

  const headline: RecapStat[] = [
    stat('sessions', 'sessions', 'Sessions', sessionCount),
    stat('messages', 'messages', 'Messages', stats.total_messages),
    stat('tokens', 'tokens', 'Tokens', stats.total_tokens, {
      display: formatTokens(stats.total_tokens),
    }),
    // A free period has no spend to headline, so the fourth tile earns its place.
    cost > 0
      ? stat('cost', 'cost', 'Model spend', cost, { display: formatCost(cost) })
      : stat('averageMessages', 'average', 'Messages per session', averageMessages),
  ]

  const hourBuckets = buildHourBuckets(stats.time_distribution)
  const hourTotal = hourBuckets.reduce((sum, value) => sum + value, 0)
  const peakHour = peakIndex(hourBuckets)
  const activeDays = periodDays.filter(Boolean).length
  const longestStreak = longestRun(periodDays)
  const [topProject] = rankEntries(stats.sessions_by_project)
  const [topModel] = rankEntries(stats.sessions_by_model)
  const cacheRead = stats.token_details.total_cache_read
  const busiest = busiestDay(stats.heatmap_data)
  const subagentRuns = stats.subagent_summary?.total_runs ?? 0

  const shareHint = (share: number): RecapText =>
    statHint('shareOfSessions', '{{share}}% of sessions', { share: Math.round(share * 100) })

  const detail: (RecapStat | null)[] = [
    activeDays > 0
      ? stat('activeDays', 'days', 'Active days', activeDays, {
          hint: statHint('ofDays', 'out of {{total}}', { total: periodDays.length }),
        })
      : null,
    longestStreak > 1
      ? stat('longestStreak', 'streak', 'Longest run', longestStreak, {
          hint: statHint('consecutiveDays', 'consecutive days'),
        })
      : null,
    hourTotal > 0
      ? stat('peakHour', 'clock', 'Busiest hour', peakHour, {
          display: formatHourLabel(peakHour),
        })
      : null,
    topProject
      ? stat('topProject', 'project', 'Main project', getPathBasename(topProject.name), {
          hint: shareHint(topProject.share),
        })
      : null,
    topModel
      ? stat('topModel', 'model', 'Main model', topModel.name, { hint: shareHint(topModel.share) })
      : null,
    busiest
      ? stat('busiestDay', 'days', 'Busiest day', busiest.date, {
          hint: statHint('messagesThatDay', '{{messages}} messages', {
            messages: busiest.total_messages,
          }),
        })
      : null,
    // Already headlined when there was no spend to show there.
    cost > 0 && sessionCount > 0
      ? stat('averageMessages', 'average', 'Messages per session', averageMessages)
      : null,
    cacheRead > 0
      ? stat('cacheRead', 'cache', 'Cache reads', cacheRead, { display: formatTokens(cacheRead) })
      : null,
    subagentRuns > 0 ? stat('subagentRuns', 'subagent', 'Subagent runs', subagentRuns) : null,
  ]

  return {
    headline,
    detail: detail
      .filter((entry): entry is RecapStat => entry !== null)
      .slice(0, MAX_DETAIL_STATS),
    pulse: buildPeriodPulse(input),
  }
}

/* ------------------------------------------------------------------ *
 * Scenes
 * ------------------------------------------------------------------ */

function buildOpening(
  input: RecapInput,
  periodLabel: string,
  daysCovered: number,
  summary: RecapSummary,
): RecapScene {
  return {
    id: 'opening',
    tone: 'calm',
    eyebrow: sceneText('opening', 'eyebrow', 'A look back'),
    title: sceneText('opening', 'title', '{{period}}', { period: periodLabel }),
    // The headline tiles below carry the numbers; a lone metric would repeat them.
    metrics: [],
    body: sceneText(
      'opening',
      'body',
      '{{period}} holds {{sessions}} sessions, all of it recorded on this machine and nowhere else. Here is how it went.',
      { period: periodLabel, sessions: input.sessions.length },
    ),
    footnote:
      daysCovered > 0
        ? sceneText('opening', 'footnote', '{{days}} days covered.', { days: daysCovered })
        : undefined,
    visual: { type: 'overview', stats: summary.headline, pulse: summary.pulse },
  }
}

function buildVolume(input: RecapInput): RecapScene | null {
  const { stats } = input
  if (stats.total_messages <= 0 && stats.total_tokens <= 0) return null

  const cost = stats.token_details.total_cost
  return {
    id: 'volume',
    tone: 'bright',
    eyebrow: sceneText('volume', 'eyebrow', 'The size of it'),
    title: sceneText('volume', 'title', 'What it came to'),
    metrics: [
      metric('sessions', 'Sessions', input.sessions.length),
      metric('messages', 'Messages', stats.total_messages),
      metric('tokens', 'Tokens', stats.total_tokens, formatTokens(stats.total_tokens)),
    ],
    body: sceneText(
      'volume',
      'body',
      '{{messages}} messages went back and forth, carrying {{tokens}} tokens with them. Every one of them was your idea first.',
      { messages: stats.total_messages, tokens: formatTokens(stats.total_tokens) },
    ),
    footnote:
      cost > 0
        ? sceneText('volume', 'footnote', 'Around {{cost}} of model usage, by this machine’s own count.', {
            cost: formatCost(cost),
          })
        : undefined,
    visual: { type: 'none' },
  }
}

function buildBusiestDay(input: RecapInput): RecapScene | null {
  const busiest = busiestDay(input.stats.heatmap_data)
  if (!busiest) return null

  const active = input.stats.heatmap_data.filter((point) => point.total_messages > 0)
  const typicalDay = median([...active.map((point) => point.total_messages)].sort((a, b) => a - b))
  if (typicalDay <= 0) return null
  if (busiest.total_messages < typicalDay * BUSIEST_DAY_FACTOR) return null

  const ordered = [...input.stats.heatmap_data].sort(byDate)
  const center = Math.max(0, ordered.findIndex((point) => point.date === busiest.date))
  const windowEnd = Math.min(
    ordered.length,
    Math.max(0, center - Math.floor(SPARKLINE_WINDOW / 2)) + SPARKLINE_WINDOW,
  )
  const windowStart = Math.max(0, windowEnd - SPARKLINE_WINDOW)
  const points = normalize(
    ordered.slice(windowStart, windowEnd).map((point) => point.total_messages),
  )

  const multiple = round(busiest.total_messages / typicalDay, 1)
  return {
    id: 'busiestDay',
    tone: 'warm',
    eyebrow: sceneText('busiestDay', 'eyebrow', 'One day ran away with it'),
    title: sceneText('busiestDay', 'title', '{{date}}', { date: busiest.date }),
    metrics: [
      metric('messagesThatDay', 'Messages that day', busiest.total_messages),
      metric('sessionsThatDay', 'Sessions that day', busiest.session_count),
    ],
    body: sceneText(
      'busiestDay',
      'body',
      'On {{date}} you sent {{messages}} messages across {{sessions}} sessions — about {{multiple}} times a normal working day. Something must have been due.',
      {
        date: busiest.date,
        messages: busiest.total_messages,
        sessions: busiest.session_count,
        multiple,
      },
    ),
    visual: { type: 'sparkline', points },
  }
}

function buildRhythm(input: RecapInput): RecapScene | null {
  const buckets = buildHourBuckets(input.stats.time_distribution)
  const total = buckets.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return null

  const hour = peakIndex(buckets)
  const shape = rhythmShape(hour)
  const bodies: Record<RhythmShape, string> = {
    nightOwl:
      'The work drifted late. Most of it landed after the rest of the world had signed off, with {{hour}}:00 your busiest hour.',
    earlyRiser:
      'You got there before the day did. Most of the work happened early, with {{hour}}:00 your busiest hour.',
    officeHours:
      'This kept ordinary hours. The work sat inside the working day, with {{hour}}:00 your busiest hour.',
    evening:
      'The evenings carried it. Most of the work happened once the day job was done, with {{hour}}:00 your busiest hour.',
  }

  return {
    id: 'rhythm',
    tone: 'deep',
    eyebrow: sceneText('rhythm', 'eyebrow', 'When you worked'),
    title: sceneText('rhythm', 'title', '{{hour}}:00 was your hour', { hour }),
    metrics: [metric('peakHour', 'Busiest hour', hour)],
    body: sceneText('rhythm', `${shape}.body`, bodies[shape], { hour }),
    visual: { type: 'clockDial', hours: normalize(buckets), peakHour: hour },
  }
}

function buildStreak(days: boolean[]): RecapScene | null {
  if (days.length === 0) return null
  const longest = longestRun(days)
  if (longest < MIN_STREAK) return null

  const activeDays = days.filter(Boolean).length
  return {
    id: 'streak',
    tone: 'warm',
    eyebrow: sceneText('streak', 'eyebrow', 'Day after day'),
    title: sceneText('streak', 'title', '{{days}} days without a gap', { days: longest }),
    metrics: [
      metric('longestStreak', 'Longest run', longest),
      metric('activeDays', 'Active days', activeDays),
    ],
    body: sceneText(
      'streak',
      'body',
      'Your longest unbroken run was {{longest}} days. Across the whole period, {{active}} of {{total}} days had something in them.',
      { longest, active: activeDays, total: days.length },
    ),
    visual: {
      type: 'streakRibbon',
      days: days.slice(-STREAK_RIBBON_DAYS),
      activeLabel: sceneText('streak', 'footnote', 'A day with work in it'),
    },
  }
}

function buildCompanion(input: RecapInput): RecapScene | null {
  const [top, runnerUp] = rankEntries(input.stats.sessions_by_project)
  if (!top || top.count < 2) return null

  const project = getPathBasename(top.name)
  const share = Math.round(top.share * 100)
  return {
    id: 'companion',
    tone: 'warm',
    eyebrow: sceneText('companion', 'eyebrow', 'The one you kept coming back to'),
    title: sceneText('companion', 'title', '{{project}}', { project }),
    metrics: [
      metric('projectSessions', 'Sessions here', top.count),
      metric('projectShare', 'Share of your work', share, `${share}%`),
    ],
    body: sceneText(
      'companion',
      'body',
      '{{sessions}} sessions were spent in {{project}} — {{share}} percent of everything you opened. Whatever else was going on, you kept returning to this one.',
      { sessions: top.count, project, share },
    ),
    footnote: runnerUp
      ? sceneText('companion', 'footnote', 'Next after that: {{project}}, {{sessions}} sessions.', {
          project: getPathBasename(runnerUp.name),
          sessions: runnerUp.count,
        })
      : undefined,
    visual: { type: 'none' },
  }
}

function buildVoice(input: RecapInput): RecapScene | null {
  const [top, runnerUp] = rankEntries(input.stats.sessions_by_model)
  if (!top) return null

  const share = Math.round(top.share * 100)
  return {
    id: 'voice',
    tone: 'calm',
    eyebrow: sceneText('voice', 'eyebrow', 'Who you worked with'),
    title: sceneText('voice', 'title', '{{model}}', { model: top.name }),
    metrics: [
      metric('modelSessions', 'Sessions', top.count),
      metric('modelShare', 'Share of sessions', share, `${share}%`),
    ],
    body: sceneText(
      'voice',
      'body',
      '{{sessions}} of your sessions ran on {{model}} — {{share}} percent of the period. It is the voice that answered most often.',
      { sessions: top.count, model: top.name, share },
    ),
    footnote: runnerUp
      ? sceneText('voice', 'footnote', 'When you switched, it was usually to {{model}}: {{sessions}} sessions.', {
          model: runnerUp.name,
          sessions: runnerUp.count,
        })
      : undefined,
    visual: { type: 'none' },
  }
}

function buildDeepDive(session: SessionInfo | null): RecapScene | null {
  if (!session || session.message_count < MIN_DEEP_DIVE_MESSAGES) return null
  const quote = trimQuote(session.first_message)
  if (quote.length === 0) return null

  return {
    id: 'deepDive',
    tone: 'deep',
    eyebrow: sceneText('deepDive', 'eyebrow', 'The one that would not end'),
    title: sceneText('deepDive', 'title', '{{messages}} messages, one sitting', {
      messages: session.message_count,
    }),
    metrics: [metric('sessionMessages', 'Messages in that session', session.message_count)],
    body: sceneText(
      'deepDive',
      'body',
      'One conversation ran to {{messages}} messages before you were satisfied with it. This is the line it opened on.',
      { messages: session.message_count },
    ),
    visual: {
      type: 'quote',
      text: quote,
      caption: sceneText('deepDive', 'footnote', 'How that session began'),
    },
  }
}

function buildFirstWords(
  input: RecapInput,
  periodLabel: string,
  deepDiveQuote: string | null,
): RecapScene | null {
  const session = earliestSession(input.sessions)
  if (!session) return null

  const quote = trimQuote(session.first_message)
  if (quote.length === 0) return null
  if (deepDiveQuote !== null && quote === deepDiveQuote) return null

  const timestamp = sessionTimestamp(session)
  if (!Number.isFinite(timestamp)) return null
  const date = toDateKey(new Date(timestamp))

  return {
    id: 'firstWords',
    tone: 'bright',
    eyebrow: sceneText('firstWords', 'eyebrow', 'How it started'),
    title: sceneText('firstWords', 'title', 'The first thing you asked'),
    metrics: [],
    body: sceneText(
      'firstWords',
      'body',
      'On {{date}} this was the first thing you typed in {{period}}. Everything else in this recap came after it.',
      { date, period: periodLabel },
    ),
    visual: {
      type: 'quote',
      text: quote,
      caption: sceneText('firstWords', 'footnote', 'Your own words, {{date}}', { date }),
    },
  }
}

function buildMoments(moments: RecapMoment[]): RecapScene | null {
  if (moments.length === 0) return null

  return {
    id: 'moments',
    tone: 'bright',
    eyebrow: sceneText('moments', 'eyebrow', 'Things worth naming'),
    title: sceneText('moments', 'title', 'What the pattern shows'),
    metrics: [],
    body: sceneText(
      'moments',
      'body',
      'A few habits turned up often enough to have a name. None of them were on purpose.',
    ),
    visual: { type: 'moments', moments },
  }
}

function buildSummaryScene(
  summary: RecapSummary,
  moments: RecapMoment[],
  periodLabel: string,
): RecapScene | null {
  if (summary.headline.length === 0) return null

  return {
    id: 'summary',
    tone: 'bright',
    eyebrow: sceneText('summary', 'eyebrow', 'Everything at a glance'),
    title: sceneText('summary', 'title', '{{period}}, on one card', { period: periodLabel }),
    metrics: [],
    body: sceneText(
      'summary',
      'body',
      'The whole period in one place — the numbers the earlier scenes walked you through, plus the ones they did not have room for.',
    ),
    footnote: sceneText(
      'summary',
      'footnote',
      'Save it as an image if you want to keep it. Nothing here leaves the machine either way.',
    ),
    visual: {
      type: 'summaryGrid',
      headline: summary.headline,
      detail: summary.detail,
      moments,
    },
  }
}

type ClosingShape = 'busiest' | 'steady' | 'quiet'

function buildClosing(input: RecapInput, periodLabel: string, daysCovered: number): RecapScene {
  const lifetimeSessions = input.allSessions.length
  const firstEver = earliestSession(input.allSessions)
  const daysTogether = firstEver
    ? Math.max(1, localDaysBetween(new Date(sessionTimestamp(firstEver)), input.now))
    : Math.max(1, daysCovered)

  // Compare like with like: a period that started before the user's first
  // session ever should not be scored against the days they were not here.
  const comparableDays = Math.max(1, Math.min(Math.max(1, daysCovered), daysTogether))
  const periodRate = input.sessions.length / comparableDays
  const lifetimeRate = lifetimeSessions / daysTogether
  const shape: ClosingShape =
    lifetimeRate <= 0
      ? 'steady'
      : periodRate >= lifetimeRate * 1.25
        ? 'busiest'
        : periodRate <= lifetimeRate * 0.75
          ? 'quiet'
          : 'steady'

  const bodies: Record<ClosingShape, string> = {
    busiest:
      'Day for day, {{period}} was the heaviest stretch you have put in: {{sessions}} sessions, against {{lifetimeSessions}} over the {{days}} days you have been at this. Worth remembering what that pace felt like, in both directions.',
    steady:
      '{{period}} sat close to your usual pace — {{sessions}} sessions, in the same rhythm you have kept for {{days}} days now. Nothing dramatic, which is rather the point.',
    quiet:
      '{{period}} was a lighter stretch than most: {{sessions}} sessions. Quiet periods are part of the record too, and the {{lifetimeSessions}} sessions behind you have not gone anywhere.',
  }

  return {
    id: 'closing',
    tone: 'calm',
    eyebrow: sceneText('closing', 'eyebrow', 'The longer view'),
    title: sceneText('closing', 'title', '{{days}} days of this so far', { days: daysTogether }),
    metrics: [
      metric('daysTogether', 'Days together', daysTogether),
      metric('lifetimeSessions', 'Sessions in all', lifetimeSessions),
    ],
    body: sceneText('closing', `${shape}.body`, bodies[shape], {
      period: periodLabel,
      sessions: input.sessions.length,
      lifetimeSessions,
      days: daysTogether,
    }),
    visual: { type: 'none' },
  }
}

function buildEmptyStory(input: RecapInput, periodLabel: string, accentHue: number): RecapStory {
  const opening: RecapScene = {
    id: 'opening',
    tone: 'calm',
    eyebrow: sceneText('opening', 'eyebrow', 'A look back'),
    title: sceneText('opening', 'title', '{{period}}', { period: periodLabel }),
    metrics: [],
    body: sceneText(
      'opening',
      'empty.body',
      'Nothing was recorded in {{period}}. Some stretches go that way, and the record simply skips over them.',
      { period: periodLabel },
    ),
    visual: { type: 'none' },
  }

  const closing: RecapScene = {
    id: 'closing',
    tone: 'calm',
    eyebrow: sceneText('closing', 'eyebrow', 'The longer view'),
    title: sceneText('closing', 'empty.title', 'Still here'),
    metrics: [],
    body: sceneText(
      'closing',
      'empty.body',
      'Everything you built before this is still on the machine, exactly where you left it. It will keep until you come back.',
    ),
    visual: { type: 'none' },
  }

  return {
    period: input.period,
    scenes: [opening, closing],
    moments: [],
    summary: emptySummary(),
    accentHue,
    isEmpty: true,
  }
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

function applySceneCap(scenes: RecapScene[]): RecapScene[] {
  if (scenes.length <= MAX_SCENES) return scenes

  const dropped = new Set<RecapSceneId>()
  for (const id of SCENE_DROP_ORDER) {
    if (scenes.length - dropped.size <= MAX_SCENES) break
    if (scenes.some((scene) => scene.id === id)) dropped.add(id)
  }
  return scenes.filter((scene) => !dropped.has(scene.id))
}

export function buildRecapStory(input: RecapInput): RecapStory {
  const periodLabel = input.period.label.fallback
  const accentHue = resolveAccentHue(input.stats, input.period.cycleKey)

  if (input.sessions.length === 0) return buildEmptyStory(input, periodLabel, accentHue)

  const periodDays = buildPeriodDays(input)
  const daysCovered = periodDays.length
  const moments = detectRecapMoments(input)
  const summary = buildSummary(input, periodDays)
  const deepDive = buildDeepDive(deepestSession(input.sessions))
  const deepDiveQuote = deepDive?.visual.type === 'quote' ? deepDive.visual.text : null

  // Canonical order; nulls are the scenes whose data did not earn a page.
  const candidates: (RecapScene | null)[] = [
    buildOpening(input, periodLabel, daysCovered, summary),
    buildVolume(input),
    buildBusiestDay(input),
    buildRhythm(input),
    buildStreak(periodDays),
    buildCompanion(input),
    buildVoice(input),
    deepDive,
    buildFirstWords(input, periodLabel, deepDiveQuote),
    buildMoments(moments),
    buildClosing(input, periodLabel, daysCovered),
    buildSummaryScene(summary, moments, periodLabel),
  ]

  const scenes = applySceneCap(candidates.filter((scene): scene is RecapScene => scene !== null))
  return { period: input.period, scenes, moments, summary, accentHue, isEmpty: false }
}
