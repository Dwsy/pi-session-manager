import type { SessionInfo, SessionStats } from '@/types'
import type { RecapPeriod } from './recapTypes'

/**
 * Pure analytics for the dashboard recap report. Everything is derived from
 * the period-scoped `SessionStats` and session list already loaded by the
 * recap controller — no network, no model call. Boundaries are local time.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DAYS = 370
const LIST_LIMIT = 5

export type RecapBucketUnit = 'day' | 'week' | 'month'
export type RecapDaypartId = 'night' | 'morning' | 'afternoon' | 'evening'
export type RecapTokenKind = 'input' | 'output' | 'cacheRead' | 'cacheWrite'

export interface RecapPreviousData {
  sessions: SessionInfo[]
  stats: SessionStats
}

export interface RecapDaySummary {
  date: Date
  messages: number
  sessions: number
  tokens: number
  cost: number
}

export interface RecapBucket {
  start: Date
  messages: number
  sessions: number
}

export interface RecapRankedItem {
  name: string
  /** 0–1 share of the ranking's denominator. */
  share: number
  sessions?: number
  messages?: number
  tokens?: number
  cost?: number
}

export interface RecapChanges {
  sessions: number | null
  messages: number | null
  tokens: number | null
  cost: number | null
}

export interface RecapReport {
  totals: { sessions: number; messages: number; tokens: number; cost: number }
  /** Percent change against the previous period; null when there is no comparable data. */
  changes: RecapChanges | null
  range: { start: Date; end: Date; elapsedDays: number }
  series: { unit: RecapBucketUnit; buckets: RecapBucket[]; peakIndex: number }
  /** Messages per weekday, Monday first. */
  weekday: { messages: number[]; peakIndex: number }
  /** Messages per local hour, 0–23. */
  hours: { messages: number[]; peakIndex: number }
  dayparts: { id: RecapDaypartId; messages: number; share: number }[]
  activity: {
    activeDays: number
    activeShare: number
    longestRun: number
    firstActiveDay: Date | null
    busiestDay: RecapDaySummary | null
    priciestDay: RecapDaySummary | null
  }
  tokenMix: { kind: RecapTokenKind; value: number; share: number }[]
  efficiency: {
    costPerSession: number
    tokensPerMessage: number
    messagesPerActiveDay: number
    assistantUserRatio: number
  }
  projects: RecapRankedItem[]
  models: { rankedBy: 'cost' | 'tokens'; items: RecapRankedItem[] }
  subagents: { runs: number; cost: number } | null
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

function chooseUnit(elapsedDays: number): RecapBucketUnit {
  if (elapsedDays <= 45) return 'day'
  if (elapsedDays <= 200) return 'week'
  return 'month'
}

function bucketStart(day: Date, unit: RecapBucketUnit): Date {
  if (unit === 'day') return day
  if (unit === 'week') return addDays(day, -((day.getDay() + 6) % 7))
  return new Date(day.getFullYear(), day.getMonth(), 1)
}

function peakIndexOf(values: number[]): number {
  let best = -1
  let bestValue = 0
  values.forEach((value, index) => {
    if (value > bestValue) {
      best = index
      bestValue = value
    }
  })
  return best
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

const DAYPART_HOURS: { id: RecapDaypartId; from: number; to: number }[] = [
  { id: 'night', from: 0, to: 5 },
  { id: 'morning', from: 6, to: 11 },
  { id: 'afternoon', from: 12, to: 17 },
  { id: 'evening', from: 18, to: 23 },
]

export function deriveRecapReport(
  stats: SessionStats,
  sessions: SessionInfo[],
  period: RecapPeriod,
  previous: RecapPreviousData | null = null,
  now: Date = new Date(),
): RecapReport {
  const first = startOfDay(period.start)
  const periodLast = startOfDay(period.end)
  const today = startOfDay(now)
  // An ongoing period only counts the days that have actually happened.
  const last = periodLast.getTime() > today.getTime() ? today : periodLast
  const elapsedDays = Math.min(Math.max(dayDiff(first, last) + 1, 1), MAX_DAYS)

  const points = new Map<string, { messages: number; sessions: number; tokens: number; cost: number }>()
  for (const point of stats.heatmap_data ?? []) {
    points.set(point.date, {
      messages: point.total_messages,
      sessions: point.session_count,
      tokens: point.total_tokens,
      cost: point.total_cost,
    })
  }

  const days: RecapDaySummary[] = []
  for (let offset = 0; offset < elapsedDays; offset += 1) {
    const date = addDays(first, offset)
    const key = toDateKey(date)
    const point = points.get(key)
    days.push({
      date,
      messages: point?.messages ?? stats.messages_by_date?.[key] ?? 0,
      sessions: point?.sessions ?? 0,
      tokens: point?.tokens ?? 0,
      cost: point?.cost ?? 0,
    })
  }

  const isActive = (day: RecapDaySummary) => day.messages > 0 || day.sessions > 0

  // Activity over time, bucketed so a year is 12 bars and a week is 7.
  const unit = chooseUnit(elapsedDays)
  const buckets: RecapBucket[] = []
  const bucketIndex = new Map<string, RecapBucket>()
  for (const day of days) {
    const start = bucketStart(day.date, unit)
    const key = toDateKey(start)
    let bucket = bucketIndex.get(key)
    if (!bucket) {
      bucket = { start: start.getTime() < first.getTime() ? first : start, messages: 0, sessions: 0 }
      bucketIndex.set(key, bucket)
      buckets.push(bucket)
    }
    bucket.messages += day.messages
    bucket.sessions += day.sessions
  }

  const weekdayMessages = [0, 0, 0, 0, 0, 0, 0]
  for (const day of days) weekdayMessages[(day.date.getDay() + 6) % 7] += day.messages

  let activeDays = 0
  let longestRun = 0
  let run = 0
  let firstActiveDay: Date | null = null
  let busiestDay: RecapDaySummary | null = null
  let priciestDay: RecapDaySummary | null = null
  for (const day of days) {
    if (isActive(day)) {
      activeDays += 1
      if (!firstActiveDay) firstActiveDay = day.date
      run += 1
      longestRun = Math.max(longestRun, run)
    } else {
      run = 0
    }
    if (day.messages > 0 && (!busiestDay || day.messages > busiestDay.messages)) busiestDay = day
    if (day.cost > 0 && (!priciestDay || day.cost > priciestDay.cost)) priciestDay = day
  }

  // Rhythm of the day.
  const hourMessages = Array.from({ length: 24 }, () => 0)
  for (const point of stats.time_distribution ?? []) {
    const hour = Math.trunc(point.hour)
    if (hour >= 0 && hour < 24) hourMessages[hour] += point.message_count
  }
  const hourTotal = sum(hourMessages)
  const dayparts = DAYPART_HOURS.map(({ id, from, to }) => {
    const messages = sum(hourMessages.slice(from, to + 1))
    return { id, messages, share: hourTotal > 0 ? messages / hourTotal : 0 }
  })

  // Token composition.
  const details = stats.token_details
  const mixValues: Record<RecapTokenKind, number> = {
    input: details.total_input,
    output: details.total_output,
    cacheRead: details.total_cache_read,
    cacheWrite: details.total_cache_write,
  }
  const mixTotal = sum(Object.values(mixValues))
  const tokenMix = (Object.keys(mixValues) as RecapTokenKind[]).map((kind) => ({
    kind,
    value: mixValues[kind],
    share: mixTotal > 0 ? mixValues[kind] / mixTotal : 0,
  }))

  // Models, ranked by spend (or by tokens when no cost was recorded).
  const modelEntries = Object.entries(details.tokens_by_model ?? {}).map(([name, model]) => ({
    name,
    cost: model.cost,
    tokens: model.input + model.output + model.cache_read + model.cache_write,
    messages: model.messages,
  }))
  const spendTotal = sum(modelEntries.map((model) => model.cost))
  const rankedBy: 'cost' | 'tokens' = spendTotal > 0 ? 'cost' : 'tokens'
  const modelDenominator = rankedBy === 'cost' ? spendTotal : sum(modelEntries.map((model) => model.tokens))
  const models = modelEntries
    .sort((left, right) => (rankedBy === 'cost' ? right.cost - left.cost : right.tokens - left.tokens))
    .slice(0, LIST_LIMIT)
    .map((model) => ({
      ...model,
      share: modelDenominator > 0 ? (rankedBy === 'cost' ? model.cost : model.tokens) / modelDenominator : 0,
    }))

  // Projects by session count.
  const projectEntries = Object.entries(stats.sessions_by_project ?? {})
  const projectTotal = sum(projectEntries.map(([, count]) => count))
  const projects = projectEntries
    .sort((left, right) => right[1] - left[1])
    .slice(0, LIST_LIMIT)
    .map(([name, count]) => ({ name, sessions: count, share: projectTotal > 0 ? count / projectTotal : 0 }))

  const totals = {
    sessions: sessions.length,
    messages: stats.total_messages,
    tokens: stats.total_tokens,
    cost: details.total_cost,
  }

  const changes: RecapChanges | null = previous && previous.sessions.length > 0
    ? {
        sessions: percentChange(totals.sessions, previous.sessions.length),
        messages: percentChange(totals.messages, previous.stats.total_messages),
        tokens: percentChange(totals.tokens, previous.stats.total_tokens),
        cost: percentChange(totals.cost, previous.stats.token_details.total_cost),
      }
    : null

  const subagent = stats.subagent_summary
  return {
    totals,
    changes,
    range: { start: first, end: last, elapsedDays },
    series: { unit, buckets, peakIndex: peakIndexOf(buckets.map((bucket) => bucket.messages)) },
    weekday: { messages: weekdayMessages, peakIndex: peakIndexOf(weekdayMessages) },
    hours: { messages: hourMessages, peakIndex: peakIndexOf(hourMessages) },
    dayparts,
    activity: {
      activeDays,
      activeShare: activeDays / elapsedDays,
      longestRun,
      firstActiveDay,
      busiestDay,
      priciestDay,
    },
    tokenMix,
    efficiency: {
      costPerSession: totals.sessions > 0 ? totals.cost / totals.sessions : 0,
      tokensPerMessage: totals.tokens / Math.max(totals.messages, 1),
      messagesPerActiveDay: totals.messages / Math.max(activeDays, 1),
      assistantUserRatio: stats.assistant_messages / Math.max(stats.user_messages, 1),
    },
    projects,
    models: { rankedBy, items: models },
    subagents: subagent && subagent.total_runs > 0 ? { runs: subagent.total_runs, cost: subagent.total_cost } : null,
  }
}
