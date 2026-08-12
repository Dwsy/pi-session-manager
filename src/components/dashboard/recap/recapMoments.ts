import type { HeatmapPoint, SessionInfo, TimeDistributionPoint } from '@/types'

import type {
  RecapInput,
  RecapMoment,
  RecapMomentIcon,
  RecapMomentId,
  RecapMomentRarity,
} from './recapTypes'

const DAY_MS = 24 * 60 * 60 * 1000

const RARITY_WEIGHT: Record<RecapMomentRarity, number> = {
  legendary: 3,
  rare: 2,
  common: 1,
}

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/**
 * Heatmap keys are local calendar days. `new Date('2026-03-05')` parses as UTC
 * midnight, which lands on the previous day for anyone west of Greenwich.
 */
function parseLocalDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed
}

function makeMoment(
  id: RecapMomentId,
  rarity: RecapMomentRarity,
  icon: RecapMomentIcon,
  titleFallback: string,
  detailFallback: string,
  values: Record<string, string | number>,
): RecapMoment {
  return {
    id,
    rarity,
    icon,
    title: { key: `dashboard.recap.moment.${id}.title`, fallback: titleFallback },
    detail: { key: `dashboard.recap.moment.${id}.detail`, fallback: detailFallback, values },
  }
}

/** Local-midnight timestamps of every day with recorded activity, ascending. */
function activeDayTimes(points: HeatmapPoint[]): number[] {
  const times = new Set<number>()
  for (const point of points) {
    if (point.level <= 0) continue
    const date = parseLocalDate(point.date)
    if (!date) continue
    times.add(date.getTime())
  }
  return [...times].sort((left, right) => left - right)
}

/** Whole days between two local midnights; rounded so 23h/25h DST days still count as one. */
function daysBetween(earlier: number, later: number): number {
  return Math.round((later - earlier) / DAY_MS)
}

function sessionTime(session: SessionInfo): number | null {
  const created = Date.parse(session.created)
  if (Number.isFinite(created)) return created
  const modified = Date.parse(session.modified)
  return Number.isFinite(modified) ? modified : null
}

function earliestSessionDate(sessions: SessionInfo[]): Date | null {
  let earliest: number | null = null
  for (const session of sessions) {
    const time = sessionTime(session)
    if (time === null) continue
    if (earliest === null || time < earliest) earliest = time
  }
  return earliest === null ? null : new Date(earliest)
}

interface HourWindow {
  messages: number
  share: number
  peakHour: number
}

/** Aggregates an inclusive local-hour window against the whole day's traffic. */
function summarizeHours(
  distribution: TimeDistributionPoint[],
  from: number,
  to: number,
): HourWindow | null {
  const total = distribution.reduce((sum, point) => sum + point.message_count, 0)
  if (total <= 0) return null

  // Sorted so ties on the peak resolve to the earlier hour regardless of input order.
  const inWindow = distribution
    .filter((point) => point.hour >= from && point.hour <= to)
    .sort((left, right) => left.hour - right.hour)

  let messages = 0
  let peakHour = from
  let peakMessages = -1
  for (const point of inWindow) {
    messages += point.message_count
    if (point.message_count > peakMessages) {
      peakMessages = point.message_count
      peakHour = point.hour
    }
  }

  if (messages <= 0) return null
  return { messages, share: messages / total, peakHour }
}

/* ------------------------------------------------------------------ *
 * Detectors — each returns the earned badge or null
 * ------------------------------------------------------------------ */

const HOUR_WINDOW_SHARE = 0.05

function detectNightOwl(input: RecapInput): RecapMoment | null {
  const window = summarizeHours(input.stats.time_distribution, 0, 4)
  if (!window || window.share < HOUR_WINDOW_SHARE) return null
  return makeMoment(
    'nightOwl',
    'rare',
    'moon',
    'The midnight shift',
    '{{count}} messages between midnight and 5am. {{hour}}:00 was your darkest hour.',
    { count: window.messages, hour: String(window.peakHour).padStart(2, '0') },
  )
}

function detectDawnBreaker(input: RecapInput): RecapMoment | null {
  const window = summarizeHours(input.stats.time_distribution, 5, 7)
  if (!window || window.share < HOUR_WINDOW_SHARE) return null
  return makeMoment(
    'dawnBreaker',
    'rare',
    'sunrise',
    'Up before the sun',
    '{{count}} messages before 8am. {{hour}}:00 was where your day kept starting.',
    { count: window.messages, hour: String(window.peakHour).padStart(2, '0') },
  )
}

function detectIronStreak(input: RecapInput): RecapMoment | null {
  const times = activeDayTimes(input.stats.heatmap_data)
  let longest = 0
  let run = 0
  let previous: number | null = null
  for (const time of times) {
    run = previous !== null && daysBetween(previous, time) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = time
  }

  if (longest < 7) return null
  const rarity: RecapMomentRarity = longest >= 30 ? 'legendary' : longest >= 14 ? 'rare' : 'common'
  return makeMoment(
    'ironStreak',
    rarity,
    'flame',
    'Day after day',
    '{{days}} days in a row. Not one of them skipped.',
    { days: longest },
  )
}

function detectMarathon(input: RecapInput): RecapMoment | null {
  const deepest = input.sessions.reduce<SessionInfo | null>(
    (best, session) => (!best || session.message_count > best.message_count ? session : best),
    null,
  )
  if (!deepest || deepest.message_count < 150) return null

  const rarity: RecapMomentRarity = deepest.message_count >= 300 ? 'legendary' : 'rare'
  const label = deepest.name?.trim() || basename(deepest.cwd)
  return makeMoment(
    'marathon',
    rarity,
    'mountain',
    'The long haul',
    '"{{session}}" ran {{count}} messages deep without ever losing the thread.',
    { session: label, count: deepest.message_count },
  )
}

function detectPolyglot(input: RecapInput): RecapMoment | null {
  const models = Object.values(input.stats.sessions_by_model).filter((count) => count > 0).length
  if (models < 3) return null
  return makeMoment(
    'polyglot',
    models >= 5 ? 'rare' : 'common',
    'compass',
    'Many voices',
    'You worked with {{count}} different models and kept your own voice throughout.',
    { count: models },
  )
}

function detectOneTrueProject(input: RecapInput): RecapMoment | null {
  const entries = Object.entries(input.stats.sessions_by_project).filter(([, count]) => count > 0)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  // A dominant share is only meaningful once there is enough history behind it.
  if (total < 10) return null

  const top = entries.reduce<[string, number] | null>(
    (best, entry) => (!best || entry[1] > best[1] ? entry : best),
    null,
  )
  if (!top) return null

  const share = top[1] / total
  if (share < 0.5) return null
  return makeMoment(
    'oneTrueProject',
    share >= 0.7 ? 'rare' : 'common',
    'anchor',
    'One true project',
    '{{share}}% of your sessions lived inside {{project}}. It had your attention.',
    { share: percent(top[1], total), project: basename(top[0]) },
  )
}

function detectComeback(input: RecapInput): RecapMoment | null {
  const times = activeDayTimes(input.stats.heatmap_data)
  let longestGap = 0
  for (let index = 1; index < times.length; index += 1) {
    const quietDays = daysBetween(times[index - 1], times[index]) - 1
    if (quietDays < 21) continue
    // A return only counts as a comeback once it actually stuck.
    const activeDaysAfter = times.length - index
    if (activeDaysAfter < 3) continue
    longestGap = Math.max(longestGap, quietDays)
  }

  if (longestGap === 0) return null
  return makeMoment(
    'comeback',
    'rare',
    'heart',
    'You came back',
    '{{days}} quiet days, and then you picked it up again like nothing happened.',
    { days: longestGap },
  )
}

function detectWeekendBuilder(input: RecapInput): RecapMoment | null {
  const times = activeDayTimes(input.stats.heatmap_data)
  if (times.length === 0) return null

  const weekendDays = times.filter((time) => {
    const day = new Date(time).getDay()
    return day === 0 || day === 6
  }).length

  if (weekendDays < 4 || weekendDays / times.length < 0.25) return null
  return makeMoment(
    'weekendBuilder',
    'common',
    'clover',
    'Weekend builder',
    '{{days}} of your {{activeDays}} active days were Saturdays and Sundays.',
    { days: weekendDays, activeDays: times.length },
  )
}

function detectAnniversary(input: RecapInput): RecapMoment | null {
  const first = earliestSessionDate(input.allSessions)
  if (!first) return null

  const firstAnniversary = new Date(first.getFullYear() + 1, first.getMonth(), first.getDate())
  if (firstAnniversary.getTime() > input.now.getTime()) return null

  const periodStart = input.period.start.getTime()
  const periodEnd = input.period.end.getTime()
  for (let years = 1; ; years += 1) {
    const anniversary = new Date(first.getFullYear() + years, first.getMonth(), first.getDate())
    if (anniversary.getTime() > periodEnd) return null
    // A Feb 29 start has no true anniversary in a common year; Date rolls it to Mar 1.
    if (anniversary.getDate() !== first.getDate()) continue
    if (anniversary.getTime() < periodStart) continue
    return makeMoment(
      'anniversary',
      'legendary',
      'sparkles',
      'Another year together',
      '{{years}} years to the day since your first session, and the date falls right here.',
      { years },
    )
  }
}

function detectFirstLight(input: RecapInput): RecapMoment | null {
  const first = earliestSessionDate(input.allSessions)
  if (!first) return null

  const time = first.getTime()
  if (time < input.period.start.getTime() || time > input.period.end.getTime()) return null
  return makeMoment(
    'firstLight',
    'legendary',
    'trophy',
    'First light',
    'It all began on {{date}}. This one covers the very first day.',
    { date: formatLocalDate(first) },
  )
}

function detectCacheWhisperer(input: RecapInput): RecapMoment | null {
  const tokens = input.stats.token_details
  const cache = tokens.total_cache_read + tokens.total_cache_write
  const measured = tokens.total_input + tokens.total_output + cache
  // Below a million tokens the ratio swings wildly on a single long session.
  if (measured < 1_000_000 || cache / measured < 0.6) return null
  return makeMoment(
    'cacheWhisperer',
    'rare',
    'infinity',
    'Cache whisperer',
    '{{share}}% of your tokens came straight from cache. You barely paid for context.',
    { share: percent(cache, measured) },
  )
}

function detectQuietCraft(input: RecapInput): RecapMoment | null {
  if (input.sessions.length < 30) return null

  const depths = input.sessions.map((session) => session.message_count).sort((a, b) => a - b)
  const middle = depths.length / 2
  const median = depths.length % 2 === 0
    ? (depths[middle - 1] + depths[middle]) / 2
    : depths[Math.floor(middle)]

  if (median > 6) return null
  return makeMoment(
    'quietCraft',
    'common',
    'ghost',
    'Short and sharp',
    '{{sessions}} sessions at a median of {{median}} messages. You ask, you get it, you go.',
    { sessions: depths.length, median: Math.round(median * 10) / 10 },
  )
}

const DETECTORS: ((input: RecapInput) => RecapMoment | null)[] = [
  detectNightOwl,
  detectDawnBreaker,
  detectIronStreak,
  detectMarathon,
  detectPolyglot,
  detectOneTrueProject,
  detectComeback,
  detectWeekendBuilder,
  detectAnniversary,
  detectFirstLight,
  detectCacheWhisperer,
  detectQuietCraft,
]

/**
 * Every badge the period actually earned, rarest first. Thin data yields few or
 * no moments on purpose — a badge nobody can miss is worth nothing.
 */
export function detectRecapMoments(input: RecapInput): RecapMoment[] {
  const earned: RecapMoment[] = []
  for (const detect of DETECTORS) {
    const moment = detect(input)
    if (moment) earned.push(moment)
  }

  return earned.sort((left, right) => {
    const byRarity = RARITY_WEIGHT[right.rarity] - RARITY_WEIGHT[left.rarity]
    if (byRarity !== 0) return byRarity
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}
