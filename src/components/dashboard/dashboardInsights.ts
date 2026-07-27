import type { HeatmapPoint, SessionInfo, SessionStats } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface DashboardWindowSummary {
  messages: number
  sessions: number
  tokens: number
  cost: number
  activeDays: number
}

export interface DashboardInsights {
  recent7: DashboardWindowSummary
  previous7: DashboardWindowSummary
  recent30: DashboardWindowSummary
  previous30: DashboardWindowSummary
  sessionChange7d: number | null
  messageChange7d: number | null
  tokenChange30d: number | null
  costChange30d: number | null
  currentStreak: number
  longestStreak: number
  medianMessagesPerSession: number
  p90MessagesPerSession: number
  deepestSession: SessionInfo | null
  topProject: { name: string; sessions: number; share: number } | null
  topModel: { name: string; sessions: number; share: number } | null
  peakHour: { hour: number; messages: number } | null
  assistantUserRatio: number
  cacheShare: number
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseLocalDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function summarizeWindow(
  points: HeatmapPoint[],
  now: Date,
  startDaysAgo: number,
  endDaysAgo: number,
): DashboardWindowSummary {
  const today = startOfLocalDay(now).getTime()
  return points.reduce<DashboardWindowSummary>(
    (summary, point) => {
      const date = parseLocalDate(point.date)
      if (!date) return summary
      const daysAgo = Math.round((today - date.getTime()) / DAY_MS)
      if (daysAgo < startDaysAgo || daysAgo >= endDaysAgo) return summary
      summary.messages += point.total_messages
      summary.sessions += point.session_count
      summary.tokens += point.total_tokens
      summary.cost += point.total_cost
      if (point.level > 0) summary.activeDays += 1
      return summary
    },
    { messages: 0, sessions: 0, tokens: 0, cost: 0, activeDays: 0 },
  )
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0
  return ((current - previous) / previous) * 100
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function calculateStreaks(points: HeatmapPoint[], now: Date): { current: number; longest: number } {
  const activity = new Map<string, boolean>()
  for (const point of points) activity.set(point.date, point.level > 0)

  const sortedDates = [...activity.keys()].sort()
  let longest = 0
  let running = 0
  let previousTime: number | null = null

  for (const dateKey of sortedDates) {
    const date = parseLocalDate(dateKey)
    if (!date) continue
    const time = date.getTime()
    const consecutive = previousTime !== null && Math.round((time - previousTime) / DAY_MS) === 1
    running = activity.get(dateKey) ? (consecutive ? running + 1 : 1) : 0
    longest = Math.max(longest, running)
    previousTime = time
  }

  const today = startOfLocalDay(now)
  let current = 0
  for (let offset = 0; ; offset += 1) {
    const date = new Date(today.getTime() - offset * DAY_MS)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    if (!activity.get(key)) break
    current += 1
  }

  return { current, longest }
}

function topShare(values: Record<string, number>, total: number) {
  const top = Object.entries(values).sort((left, right) => right[1] - left[1])[0]
  if (!top) return null
  return { name: top[0], sessions: top[1], share: total > 0 ? top[1] / total : 0 }
}

export function deriveDashboardInsights(
  stats: SessionStats,
  sessions: SessionInfo[],
  now = new Date(),
): DashboardInsights {
  const recent7 = summarizeWindow(stats.heatmap_data, now, 0, 7)
  const previous7 = summarizeWindow(stats.heatmap_data, now, 7, 14)
  const recent30 = summarizeWindow(stats.heatmap_data, now, 0, 30)
  const previous30 = summarizeWindow(stats.heatmap_data, now, 30, 60)
  const depths = sessions.map((session) => session.message_count).sort((a, b) => a - b)
  const medianMessagesPerSession = depths.length === 0
    ? 0
    : depths.length % 2 === 0
      ? (depths[depths.length / 2 - 1] + depths[depths.length / 2]) / 2
      : depths[Math.floor(depths.length / 2)]
  const deepestSession = sessions.reduce<SessionInfo | null>(
    (best, session) => (!best || session.message_count > best.message_count ? session : best),
    null,
  )
  const streaks = calculateStreaks(stats.heatmap_data, now)
  const peakHourPoint = stats.time_distribution.reduce<SessionStats['time_distribution'][number] | null>(
    (best, point) => (!best || point.message_count > best.message_count ? point : best),
    null,
  )
  const tokenDetails = stats.token_details
  const cacheTokens = tokenDetails.total_cache_read + tokenDetails.total_cache_write
  const measuredTokens = tokenDetails.total_input + tokenDetails.total_output + cacheTokens

  return {
    recent7,
    previous7,
    recent30,
    previous30,
    sessionChange7d: percentChange(recent7.sessions, previous7.sessions),
    messageChange7d: percentChange(recent7.messages, previous7.messages),
    tokenChange30d: percentChange(recent30.tokens, previous30.tokens),
    costChange30d: percentChange(recent30.cost, previous30.cost),
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    medianMessagesPerSession,
    p90MessagesPerSession: percentile(depths, 0.9),
    deepestSession,
    topProject: topShare(stats.sessions_by_project, stats.total_sessions),
    topModel: topShare(stats.sessions_by_model, stats.total_sessions),
    peakHour: peakHourPoint
      ? { hour: peakHourPoint.hour, messages: peakHourPoint.message_count }
      : null,
    assistantUserRatio: stats.assistant_messages / Math.max(stats.user_messages, 1),
    cacheShare: measuredTokens > 0 ? cacheTokens / measuredTokens : 0,
  }
}

export function filterSessionsByPeriod(
  sessions: SessionInfo[],
  start: Date,
  end: Date,
): SessionInfo[] {
  const startTime = start.getTime()
  const endTime = end.getTime()
  return sessions.filter((session) => {
    const modified = new Date(session.modified).getTime()
    return Number.isFinite(modified) && modified >= startTime && modified <= endTime
  })
}
