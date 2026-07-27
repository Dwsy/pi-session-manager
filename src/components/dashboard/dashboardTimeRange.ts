import type { HeatmapPoint, SessionInfo, SessionStats } from '@/types'
import { getPathBasename, pathsEqual } from '@/utils/path'

export type DashboardTimeGranularity = 'recent' | 'all' | 'year' | 'month' | 'week' | 'day'

export interface DashboardTimeSelection {
  granularity: DashboardTimeGranularity
  year: number
  month: number
  day: number
}

export interface DashboardDateBounds {
  start: Date | null
  end: Date | null
}

export interface DashboardTimeOptions {
  years: number[]
  months: number[]
  days: number[]
}

export interface DashboardPeriodWindow {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
}

export interface DashboardPeriodComparisonData {
  current: SessionStats
  previous: SessionStats
  window: DashboardPeriodWindow
}

export function createDefaultDashboardTimeSelection(now = new Date()): DashboardTimeSelection {
  return {
    granularity: 'recent',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  }
}

function validSessionDate(session: SessionInfo): Date | null {
  const date = new Date(session.modified)
  return Number.isFinite(date.getTime()) ? date : null
}

export function toDashboardDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function filterDashboardSessionsByProject(
  sessions: SessionInfo[],
  projectPath?: string | null,
): SessionInfo[] {
  if (!projectPath) return sessions
  return sessions.filter((session) => pathsEqual(session.cwd, projectPath))
}

export function getDashboardTimeOptions(
  sessions: SessionInfo[],
  selection: DashboardTimeSelection,
): DashboardTimeOptions {
  const years = new Set<number>()
  for (const session of sessions) {
    const date = validSessionDate(session)
    if (date) years.add(date.getFullYear())
  }

  const fallback = new Date()
  const month = Math.min(12, Math.max(1, selection.month || fallback.getMonth() + 1))
  const daysInMonth = new Date(selection.year, month, 0).getDate()
  return {
    years: years.size ? Array.from(years).sort((a, b) => b - a) : [fallback.getFullYear()],
    months: Array.from({ length: 12 }, (_, index) => index + 1),
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
  }
}

export function normalizeDashboardTimeSelection(
  sessions: SessionInfo[],
  selection: DashboardTimeSelection,
): DashboardTimeSelection {
  if (selection.granularity === 'all' || selection.granularity === 'recent') return selection

  let next = selection
  let options = getDashboardTimeOptions(sessions, next)
  const year = options.years.includes(next.year) ? next.year : options.years[0]
  if (year !== next.year) next = { ...next, year }

  options = getDashboardTimeOptions(sessions, next)
  const month = Math.min(12, Math.max(1, next.month))
  if (month !== next.month) next = { ...next, month }

  options = getDashboardTimeOptions(sessions, next)
  const day = Math.min(options.days.length, Math.max(1, next.day))
  if (day !== next.day) next = { ...next, day }

  return next
}

export function getDashboardDateBounds(selection: DashboardTimeSelection): DashboardDateBounds {
  if (selection.granularity === 'all') return { start: null, end: null }
  if (selection.granularity === 'recent') {
    const end = new Date()
    end.setHours(24, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - 26 * 7)
    return { start, end }
  }
  if (selection.granularity === 'year') {
    return {
      start: new Date(selection.year, 0, 1),
      end: new Date(selection.year + 1, 0, 1),
    }
  }
  if (selection.granularity === 'month') {
    return {
      start: new Date(selection.year, selection.month - 1, 1),
      end: new Date(selection.year, selection.month, 1),
    }
  }
  if (selection.granularity === 'week') {
    const anchor = new Date(selection.year, selection.month - 1, selection.day)
    const start = startOfNaturalWeek(anchor)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  return {
    start: new Date(selection.year, selection.month - 1, selection.day),
    end: new Date(selection.year, selection.month - 1, selection.day + 1),
  }
}

export function filterDashboardSessionsByBounds(
  sessions: SessionInfo[],
  bounds: DashboardDateBounds,
): SessionInfo[] {
  if (!bounds.start || !bounds.end) return sessions
  const start = bounds.start.getTime()
  const end = bounds.end.getTime()
  return sessions.filter((session) => {
    const date = validSessionDate(session)
    if (!date) return false
    const time = date.getTime()
    return time >= start && time < end
  })
}

export function filterDashboardSessionsByWindow(
  sessions: SessionInfo[],
  start: Date,
  end: Date,
): SessionInfo[] {
  return filterDashboardSessionsByBounds(sessions, { start, end })
}

export function getDashboardTimeAnchor(
  bounds: DashboardDateBounds,
  now = new Date(),
): Date {
  if (!bounds.start || !bounds.end) return now
  if (now >= bounds.start && now < bounds.end) return now
  return new Date(bounds.end.getTime() - 1)
}

function startOfNaturalWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

export function getNaturalWeekWindow(anchor: Date): DashboardPeriodWindow {
  const currentStart = startOfNaturalWeek(anchor)
  const currentEnd = new Date(currentStart)
  currentEnd.setDate(currentEnd.getDate() + 7)
  const previousStart = new Date(currentStart)
  previousStart.setDate(previousStart.getDate() - 7)
  return { currentStart, currentEnd, previousStart, previousEnd: currentStart }
}

export function getNaturalMonthWindow(anchor: Date): DashboardPeriodWindow {
  const currentStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const currentEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
  const previousStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
  return { currentStart, currentEnd, previousStart, previousEnd: currentStart }
}

export function dashboardSelectionEquals(
  left: DashboardTimeSelection,
  right: DashboardTimeSelection,
): boolean {
  return left.granularity === right.granularity
    && left.year === right.year
    && left.month === right.month
    && left.day === right.day
}

export function formatDashboardTimeRange(
  selection: DashboardTimeSelection,
  locale?: string,
): string {
  if (selection.granularity === 'all') return ''
  if (selection.granularity === 'recent') {
    return locale?.toLowerCase().startsWith('zh') ? '近 6 个月' : 'Last 6 months'
  }
  const date = new Date(selection.year, selection.month - 1, selection.day)
  if (selection.granularity === 'year') {
    return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(date)
  }
  if (selection.granularity === 'month') {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(date)
  }
  if (selection.granularity === 'week') {
    const { start, end } = getDashboardDateBounds(selection)
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    return start && end ? `${formatter.format(start)} – ${formatter.format(new Date(end.getTime() - 1))}` : ''
  }
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function heatmapLevel(messages: number): number {
  if (messages <= 0) return 0
  if (messages <= 4) return 1
  if (messages <= 12) return 2
  if (messages <= 36) return 3
  if (messages <= 64) return 4
  return 5
}

export function buildDashboardHeatmapData(
  sessions: SessionInfo[],
  stats: SessionStats,
  bounds: DashboardDateBounds,
): HeatmapPoint[] {
  if (!bounds.start || !bounds.end) return stats.heatmap_data

  const existing = new Map(stats.heatmap_data.map((point) => [point.date, point]))
  const sessionCount = new Map<string, number>()
  const projectCounts = new Map<string, Map<string, number>>()

  for (const session of sessions) {
    const date = validSessionDate(session)
    if (!date) continue
    const key = toDashboardDateKey(date)
    sessionCount.set(key, (sessionCount.get(key) || 0) + 1)
    const projects = projectCounts.get(key) || new Map<string, number>()
    const project = getPathBasename(session.cwd) || session.cwd
    projects.set(project, (projects.get(project) || 0) + 1)
    projectCounts.set(key, projects)
  }

  const result: HeatmapPoint[] = []
  for (let cursor = new Date(bounds.start); cursor < bounds.end; cursor.setDate(cursor.getDate() + 1)) {
    const key = toDashboardDateKey(cursor)
    const previous = existing.get(key)
    const totalMessages = stats.messages_by_date[key] || 0
    const topProject = Array.from(projectCounts.get(key)?.entries() || [])
      .sort((left, right) => right[1] - left[1])[0]?.[0]
    result.push({
      date: key,
      level: heatmapLevel(totalMessages),
      total_messages: totalMessages,
      total_tokens: previous?.total_tokens || 0,
      total_cost: previous?.total_cost || 0,
      session_count: sessionCount.get(key) || 0,
      top_project: topProject || undefined,
    })
  }
  return result
}

export function emptyDashboardStats(): SessionStats {
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
    token_details: {
      total_input: 0,
      total_output: 0,
      total_cache_read: 0,
      total_cache_write: 0,
      total_cost: 0,
      tokens_by_model: {},
    },
    subagent_summary: {
      total_cost: 0,
      total_runs: 0,
      total_tokens: 0,
      runs_by_agent: {},
      runs_by_model: {},
    },
  }
}

export function dashboardPercentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export function dashboardCombinedTokens(stats: SessionStats): number {
  return stats.total_tokens + (stats.subagent_summary?.total_tokens || 0)
}

export function dashboardCombinedCost(stats: SessionStats): number {
  return stats.token_details.total_cost + (stats.subagent_summary?.total_cost || 0)
}
