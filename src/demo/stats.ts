import { format, subDays } from 'date-fns'

import type {
  DaySession,
  DayStats,
  HeatmapPoint,
  ModelTokenStats,
  SessionInfo,
  SessionStats,
  TimeDistributionPoint,
} from '@/types'
import { getPathBasename } from '@/utils/path'

import { estimateCost } from './content'
import type { DemoStore } from './types'

interface DemoDailyAggregate {
  date: string
  totalMessages: number
  totalTokens: number
  sessions: SessionInfo[]
  topProject?: string
}

function buildDailyAggregate(state: DemoStore): Map<string, DemoDailyAggregate> {
  const map = new Map<string, DemoDailyAggregate>()

  for (const session of state.sessions) {
    const date = session.modified.slice(0, 10)
    const seed = state.seedByPath.get(session.path)
    const totalTokens = seed ? seed.tokenUsage.input + seed.tokenUsage.output : session.message_count * 180
    const existing = map.get(date)

    if (!existing) {
      map.set(date, {
        date,
        totalMessages: session.message_count,
        totalTokens,
        sessions: [session],
        topProject: getPathBasename(session.cwd),
      })
      continue
    }

    existing.totalMessages += session.message_count
    existing.totalTokens += totalTokens
    existing.sessions.push(session)

    const projectCounter = new Map<string, number>()
    for (const item of existing.sessions) {
      const project = getPathBasename(item.cwd)
      projectCounter.set(project, (projectCounter.get(project) || 0) + 1)
    }

    const topProject = [...projectCounter.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0]

    existing.topProject = topProject || existing.topProject
  }

  return map
}

function buildSessionTokenMap(state: DemoStore): Map<string, number> {
  const map = new Map<string, number>()
  for (const session of state.sessions) {
    const seed = state.seedByPath.get(session.path)
    if (!seed) {
      map.set(session.path, session.message_count * 180)
      continue
    }
    map.set(session.path, seed.tokenUsage.input + seed.tokenUsage.output)
  }
  return map
}

function buildTokenByModel(state: DemoStore): Record<string, ModelTokenStats> {
  const result: Record<string, ModelTokenStats> = {}

  for (const session of state.sessions) {
    const seed = state.seedByPath.get(session.path)
    if (!seed) continue

    if (!result[seed.model]) {
      result[seed.model] = {
        messages: 0,
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        cost: 0,
      }
    }

    const bucket = result[seed.model]
    bucket.messages += session.message_count
    bucket.input += seed.tokenUsage.input
    bucket.output += seed.tokenUsage.output
    bucket.cache_read += seed.tokenUsage.cacheRead
    bucket.cache_write += seed.tokenUsage.cacheWrite
    bucket.cost += estimateCost(seed)
  }

  return result
}

function buildMessagesByHour(state: DemoStore): Record<string, number> {
  const hourly = Array.from({ length: 24 }, () => 0)

  for (const entries of state.entriesByPath.values()) {
    for (const entry of entries) {
      if (entry.type !== 'message') continue
      if (entry.message?.role !== 'user' && entry.message?.role !== 'assistant') continue
      const date = new Date(entry.timestamp)
      if (Number.isNaN(date.getTime())) continue
      hourly[date.getUTCHours()] += 1
    }
  }

  const result: Record<string, number> = {}
  for (let hour = 0; hour < 24; hour += 1) {
    result[String(hour)] = hourly[hour]
  }
  return result
}

function buildMessagesByDayOfWeek(messagesByDate: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [date, count] of Object.entries(messagesByDate)) {
    const day = format(new Date(`${date}T00:00:00Z`), 'EEEE')
    result[day] = (result[day] || 0) + count
  }
  return result
}

function buildModelUsageByProject(state: DemoStore): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}

  for (const session of state.sessions) {
    const seed = state.seedByPath.get(session.path)
    if (!seed) continue

    const model = seed.model
    const project = getPathBasename(session.cwd)

    if (!result[model]) {
      result[model] = {}
    }

    result[model][project] = (result[model][project] || 0) + 1
  }

  return result
}

function buildTimeDistribution(messagesByHour: Record<string, number>): TimeDistributionPoint[] {
  return Object.entries(messagesByHour)
    .map(([hour, count]) => ({
      hour: Number.parseInt(hour, 10),
      message_count: count,
    }))
    .sort((left, right) => left.hour - right.hour)
}

function buildHeatmapData(state: DemoStore): HeatmapPoint[] {
  const aggregateMap = buildDailyAggregate(state)
  const result: HeatmapPoint[] = []

  for (let index = 29; index >= 0; index -= 1) {
    const date = subDays(new Date(), index)
    const dateKey = format(date, 'yyyy-MM-dd')
    const aggregate = aggregateMap.get(dateKey)

    const totalMessages = aggregate?.totalMessages || 0
    const level = totalMessages >= 45
      ? 5
      : totalMessages >= 30
        ? 4
        : totalMessages >= 20
          ? 3
          : totalMessages >= 10
            ? 2
            : totalMessages > 0
              ? 1
              : 0

    result.push({
      date: dateKey,
      level,
      total_messages: totalMessages,
      total_tokens: aggregate?.totalTokens || 0,
      session_count: aggregate?.sessions.length || 0,
      top_project: aggregate?.topProject,
    })
  }

  return result
}

function toSubagentSummary(state: DemoStore) {
  let totalCost = 0
  let totalRuns = 0
  let totalTokens = 0
  const runsByAgent: Record<string, { runs: number; cost: number; tokens: number }> = {}
  const runsByModel: Record<string, number> = {}

  for (const seed of state.seedByPath.values()) {
    if (!seed.subagent) continue

    totalCost += seed.subagent.cost
    totalRuns += seed.subagent.runs
    totalTokens += seed.subagent.tokens

    if (!runsByAgent[seed.subagent.agent]) {
      runsByAgent[seed.subagent.agent] = {
        runs: 0,
        cost: 0,
        tokens: 0,
      }
    }

    runsByAgent[seed.subagent.agent].runs += seed.subagent.runs
    runsByAgent[seed.subagent.agent].cost += seed.subagent.cost
    runsByAgent[seed.subagent.agent].tokens += seed.subagent.tokens

    runsByModel[seed.subagent.model] = (runsByModel[seed.subagent.model] || 0) + seed.subagent.runs
  }

  return {
    total_cost: totalCost,
    total_runs: totalRuns,
    total_tokens: totalTokens,
    runs_by_agent: runsByAgent,
    runs_by_model: runsByModel,
  }
}

export function getDemoStatsFromStore(state: DemoStore): SessionStats {
  const sessions = state.sessions

  const sessionsByProject: Record<string, number> = {}
  const sessionsByModel: Record<string, number> = {}
  let totalMessages = 0

  for (const session of sessions) {
    const project = getPathBasename(session.cwd)
    sessionsByProject[project] = (sessionsByProject[project] || 0) + 1

    const seed = state.seedByPath.get(session.path)
    if (seed) {
      sessionsByModel[seed.model] = (sessionsByModel[seed.model] || 0) + 1
    }

    totalMessages += session.message_count
  }

  const tokenByModel = buildTokenByModel(state)
  const tokenValues = Object.values(tokenByModel)

  const totalInput = tokenValues.reduce((sum, item) => sum + item.input, 0)
  const totalOutput = tokenValues.reduce((sum, item) => sum + item.output, 0)
  const totalCacheRead = tokenValues.reduce((sum, item) => sum + item.cache_read, 0)
  const totalCacheWrite = tokenValues.reduce((sum, item) => sum + item.cache_write, 0)
  const totalCost = tokenValues.reduce((sum, item) => sum + item.cost, 0)

  const totalTokens = totalInput + totalOutput

  const heatmapData = buildHeatmapData(state)
  const messagesByDate = heatmapData.reduce<Record<string, number>>((acc, item) => {
    acc[item.date] = item.total_messages
    return acc
  }, {})

  const messagesByHour = buildMessagesByHour(state)
  const messagesByDayOfWeek = buildMessagesByDayOfWeek(messagesByDate)

  const modelUsageByProject = buildModelUsageByProject(state)
  const timeDistribution = buildTimeDistribution(messagesByHour)
  const subagentSummary = toSubagentSummary(state)

  const userMessages = Math.floor(totalMessages * 0.46)
  const assistantMessages = totalMessages - userMessages

  return {
    total_sessions: sessions.length,
    total_messages: totalMessages,
    user_messages: userMessages,
    assistant_messages: assistantMessages,
    total_tokens: totalTokens,
    sessions_by_project: sessionsByProject,
    sessions_by_model: sessionsByModel,
    model_usage_by_project: modelUsageByProject,
    messages_by_date: messagesByDate,
    messages_by_hour: messagesByHour,
    messages_by_day_of_week: messagesByDayOfWeek,
    average_messages_per_session: sessions.length > 0 ? totalMessages / sessions.length : 0,
    heatmap_data: heatmapData,
    time_distribution: timeDistribution,
    token_details: {
      total_input: totalInput,
      total_output: totalOutput,
      total_cache_read: totalCacheRead,
      total_cache_write: totalCacheWrite,
      total_cost: totalCost,
      tokens_by_model: tokenByModel,
    },
    subagent_summary: subagentSummary,
  }
}

export function getDemoDayStatsFromStore(state: DemoStore, date: string, scopedSessions?: SessionInfo[]): DayStats {
  const scopedPathSet = scopedSessions
    ? new Set(scopedSessions.map((session) => session.path))
    : null

  const daySessions = state.sessions.filter((session) => {
    if (session.modified.slice(0, 10) !== date) {
      return false
    }
    if (!scopedPathSet) {
      return true
    }
    return scopedPathSet.has(session.path)
  })

  const projectMap = new Map<string, {
    project_path: string
    project_name: string
    session_count: number
    message_count: number
    token_count: number
  }>()

  const modelsUsed: Record<string, number> = {}
  const sessionTokenMap = buildSessionTokenMap(state)
  const sessionsDetail: DaySession[] = []
  const hourlyDistribution = Array.from({ length: 24 }, () => 0)

  for (const session of daySessions) {
    const seed = state.seedByPath.get(session.path)
    const projectPath = session.cwd
    const projectName = getPathBasename(projectPath)
    const tokenCount = sessionTokenMap.get(session.path) || session.message_count * 180
    const model = seed?.model || 'unknown'

    if (!projectMap.has(projectPath)) {
      projectMap.set(projectPath, {
        project_path: projectPath,
        project_name: projectName,
        session_count: 0,
        message_count: 0,
        token_count: 0,
      })
    }

    const bucket = projectMap.get(projectPath)!
    bucket.session_count += 1
    bucket.message_count += session.message_count
    bucket.token_count += tokenCount

    modelsUsed[model] = (modelsUsed[model] || 0) + 1

    sessionsDetail.push({
      path: session.path,
      cwd: session.cwd,
      name: session.name,
      first_message: session.first_message,
      message_count: session.message_count,
      token_count: tokenCount,
      model,
      timestamp: session.modified,
    })

    const entries = state.entriesByPath.get(session.path) || []
    for (const entry of entries) {
      if (entry.type !== 'message') continue
      if (entry.message?.role !== 'user' && entry.message?.role !== 'assistant') continue
      if (!entry.timestamp.startsWith(date)) continue
      const hour = new Date(entry.timestamp).getUTCHours()
      if (hour >= 0 && hour <= 23) {
        hourlyDistribution[hour] += 1
      }
    }
  }

  sessionsDetail.sort((left, right) => right.timestamp.localeCompare(left.timestamp))

  const projectBreakdown = [...projectMap.values()]
    .sort((left, right) => right.message_count - left.message_count)

  const totalMessages = daySessions.reduce((sum, session) => sum + session.message_count, 0)
  const totalTokens = daySessions.reduce((sum, session) => sum + (sessionTokenMap.get(session.path) || session.message_count * 180), 0)

  return {
    date,
    total_messages: totalMessages,
    total_tokens: totalTokens,
    session_count: daySessions.length,
    project_count: projectBreakdown.length,
    project_breakdown: projectBreakdown,
    sessions: sessionsDetail,
    hourly_distribution: hourlyDistribution,
    models_used: modelsUsed,
  }
}
