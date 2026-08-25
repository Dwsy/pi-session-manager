import type {
  DaySession,
  DayStats,
  HeatmapPoint,
  ModelTokenStats,
  SessionInfo,
  SessionStats,
} from "@/types";
import { getPathBasename } from "@/utils/path";
import { loadDatasetCache } from "./core";

interface TokenAggregate {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function emptyTokenAggregate(): TokenAggregate {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

function readUsageNumber(usage: any, keys: string[]): number {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (value !== undefined && value !== null) {
      return Number(value) || 0;
    }
  }
  return 0;
}

function addUsage(target: TokenAggregate, usage: any): void {
  if (!usage) return;
  target.input += readUsageNumber(usage, ["input", "input_tokens", "inputTokens"]);
  target.output += readUsageNumber(usage, ["output", "output_tokens", "outputTokens"]);
  target.cacheRead += readUsageNumber(usage, [
    "cacheRead",
    "cache_read",
    "cache_read_tokens",
    "cacheReadTokens",
  ]);
  target.cacheWrite += readUsageNumber(usage, [
    "cacheWrite",
    "cache_write",
    "cache_creation_input_tokens",
    "cache_write_tokens",
    "cacheWriteTokens",
  ]);
}

function usageToCost(usage: any): number {
  if (!usage?.cost) return 0;
  if (typeof usage.cost === "number") {
    return Number(usage.cost) || 0;
  }
  return (
    readUsageNumber(usage.cost, ["total"]) ||
    readUsageNumber(usage.cost, ["input", "input_cost"]) +
      readUsageNumber(usage.cost, ["output", "output_cost"]) +
      readUsageNumber(usage.cost, ["cacheRead", "cache_read", "cache_read_cost"]) +
      readUsageNumber(usage.cost, ["cacheWrite", "cache_write", "cache_write_cost"])
  );
}

function getSessionTokenAggregate(entries: any[]): TokenAggregate {
  const total = emptyTokenAggregate();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "assistant")
      continue;
    addUsage(total, entry.message?.usage);
  }
  return total;
}

function getSessionCost(entries: any[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.type !== "message" || entry.message?.role !== "assistant") {
      return sum;
    }
    return sum + usageToCost(entry.message?.usage);
  }, 0);
}

function getSessionModels(entries: any[]): Set<string> {
  const models = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "assistant")
      continue;
    const model = entry.message?.model || "unknown";
    models.add(model);
  }
  return models;
}

export async function getBrowserDatasetStats(
  scopedSessions?: SessionInfo[],
): Promise<SessionStats> {
  const cache = await loadDatasetCache();
  const scopedSet = scopedSessions
    ? new Set(scopedSessions.map((session) => session.path))
    : null;
  const targetSessions = scopedSet
    ? cache.sessions.filter((session) => scopedSet.has(session.info.path))
    : cache.sessions;
  const sessionsByProject: Record<string, number> = {};
  const sessionsByModel: Record<string, number> = {};
  const modelUsageByProject: Record<string, Record<string, number>> = {};
  const tokenByModel: Record<string, ModelTokenStats> = {};
  const messagesByDate: Record<string, number> = {};
  const messagesByHour: Record<string, number> = {};
  const messagesByDayOfWeek: Record<string, number> = {};
  const heatmapDateTokens = new Map<string, number>();
  const heatmapDateCost = new Map<string, number>();
  const heatmapDateSessions = new Map<string, Set<string>>();
  const heatmapTopProject = new Map<string, Map<string, number>>();

  let totalMessages = 0;
  let userMessages = 0;
  let assistantMessages = 0;

  for (let hour = 0; hour < 24; hour += 1) {
    messagesByHour[String(hour)] = 0;
  }

  for (const session of targetSessions) {
    const project = getPathBasename(session.info.cwd);
    sessionsByProject[project] = (sessionsByProject[project] || 0) + 1;

    const sessionModels = getSessionModels(session.entries);
    for (const model of sessionModels) {
      sessionsByModel[model] = (sessionsByModel[model] || 0) + 1;
      if (!modelUsageByProject[model]) {
        modelUsageByProject[model] = {};
      }
      modelUsageByProject[model][project] =
        (modelUsageByProject[model][project] || 0) + 1;
    }

    const sessionTokens = getSessionTokenAggregate(session.entries);
    const sessionTotalTokens =
      sessionTokens.input +
      sessionTokens.output +
      sessionTokens.cacheRead +
      sessionTokens.cacheWrite;
    const sessionTotalCost = getSessionCost(session.entries);

    const msgCount = session.info.message_count;
    totalMessages += msgCount;

    for (const entry of session.entries) {
      if (entry.type !== "message" || !entry.message) continue;
      const role = entry.message.role;
      if (role !== "user" && role !== "assistant") continue;

      if (role === "user") userMessages += 1;
      if (role === "assistant") assistantMessages += 1;

      if (role === "assistant") {
        const model = entry.message.model || "unknown";
        if (!tokenByModel[model]) {
          tokenByModel[model] = {
            messages: 0,
            input: 0,
            output: 0,
            cache_read: 0,
            cache_write: 0,
            cost: 0,
          };
        }
        const usage = emptyTokenAggregate();
        addUsage(usage, entry.message.usage);
        tokenByModel[model].messages += 1;
        tokenByModel[model].input += usage.input;
        tokenByModel[model].output += usage.output;
        tokenByModel[model].cache_read += usage.cacheRead;
        tokenByModel[model].cache_write += usage.cacheWrite;
        tokenByModel[model].cost += usageToCost(entry.message.usage);
      }
    }

    const sessionDate = session.info.modified.slice(0, 10);
    messagesByDate[sessionDate] = (messagesByDate[sessionDate] || 0) + msgCount;

    const sessionHour = new Date(session.info.modified).getUTCHours();
    if (sessionHour >= 0 && sessionHour <= 23) {
      messagesByHour[String(sessionHour)] =
        (messagesByHour[String(sessionHour)] || 0) + msgCount;
    }

    const sessionDayName = new Date(
      `${sessionDate}T00:00:00Z`,
    ).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
    messagesByDayOfWeek[sessionDayName] =
      (messagesByDayOfWeek[sessionDayName] || 0) + msgCount;

    heatmapDateTokens.set(
      sessionDate,
      (heatmapDateTokens.get(sessionDate) || 0) + sessionTotalTokens,
    );
    heatmapDateCost.set(
      sessionDate,
      (heatmapDateCost.get(sessionDate) || 0) + sessionTotalCost,
    );
    if (!heatmapDateSessions.has(sessionDate)) {
      heatmapDateSessions.set(sessionDate, new Set());
    }
    heatmapDateSessions.get(sessionDate)!.add(session.info.path);
    if (!heatmapTopProject.has(sessionDate)) {
      heatmapTopProject.set(sessionDate, new Map());
    }
    const topProjectMap = heatmapTopProject.get(sessionDate)!;
    topProjectMap.set(project, (topProjectMap.get(project) || 0) + msgCount);
  }

  const heatmapData: HeatmapPoint[] = [];
  // Relative intensity: level scales with the day's token share of the busiest day
  const maxDayTokens = Math.max(0, ...heatmapDateTokens.values());
  for (let index = 364; index >= 0; index -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - index);
    const dateKey = date.toISOString().slice(0, 10);
    const totalMessagesForDay = messagesByDate[dateKey] || 0;
    const dayTokens = heatmapDateTokens.get(dateKey) || 0;
    const level =
      dayTokens <= 0 || maxDayTokens <= 0
        ? 0
        : Math.min(5, Math.max(1, Math.ceil((dayTokens / maxDayTokens) * 5)));

    const projectMap = heatmapTopProject.get(dateKey) || new Map();
    const topProject = [...projectMap.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    heatmapData.push({
      date: dateKey,
      level,
      total_messages: totalMessagesForDay,
      total_tokens: heatmapDateTokens.get(dateKey) || 0,
      total_cost: heatmapDateCost.get(dateKey) || 0,
      session_count: heatmapDateSessions.get(dateKey)?.size || 0,
      top_project: topProject,
    });
  }

  const totalInput = Object.values(tokenByModel).reduce(
    (sum, item) => sum + item.input,
    0,
  );
  const totalOutput = Object.values(tokenByModel).reduce(
    (sum, item) => sum + item.output,
    0,
  );
  const totalCacheRead = Object.values(tokenByModel).reduce(
    (sum, item) => sum + item.cache_read,
    0,
  );
  const totalCacheWrite = Object.values(tokenByModel).reduce(
    (sum, item) => sum + item.cache_write,
    0,
  );
  const totalCost = Object.values(tokenByModel).reduce(
    (sum, item) => sum + item.cost,
    0,
  );

  return {
    total_sessions: targetSessions.length,
    total_messages: totalMessages,
    user_messages: userMessages,
    assistant_messages: assistantMessages,
    total_tokens: totalInput + totalOutput,
    sessions_by_project: sessionsByProject,
    sessions_by_model: sessionsByModel,
    model_usage_by_project: modelUsageByProject,
    messages_by_date: messagesByDate,
    messages_by_hour: messagesByHour,
    messages_by_day_of_week: messagesByDayOfWeek,
    average_messages_per_session:
      targetSessions.length > 0 ? totalMessages / targetSessions.length : 0,
    heatmap_data: heatmapData,
    time_distribution: Object.entries(messagesByHour).map(([hour, count]) => ({
      hour: Number(hour),
      message_count: count,
    })),
    token_details: {
      total_input: totalInput,
      total_output: totalOutput,
      total_cache_read: totalCacheRead,
      total_cache_write: totalCacheWrite,
      total_cost: totalCost,
      tokens_by_model: tokenByModel,
    },
    subagent_summary: {
      total_cost: 0,
      total_runs: 0,
      total_tokens: 0,
      runs_by_agent: {},
      runs_by_model: {},
    },
  };
}

export async function getBrowserDatasetDayStats(
  date: string,
  scopedSessions?: SessionInfo[],
): Promise<DayStats> {
  const cache = await loadDatasetCache();
  const scopedSet = scopedSessions
    ? new Set(scopedSessions.map((session) => session.path))
    : null;

  const daySessions = cache.sessions.filter((session) => {
    const inScope = !scopedSet || scopedSet.has(session.info.path);
    return inScope && session.info.modified.slice(0, 10) === date;
  });

  const projectMap = new Map<
    string,
    {
      project_path: string;
      project_name: string;
      session_count: number;
      message_count: number;
      token_count: number;
    }
  >();
  const modelsUsed: Record<string, number> = {};
  const hourlyDistribution = Array.from({ length: 24 }, () => 0);
  const sessionsDetail: DaySession[] = [];
  const dayTokens = emptyTokenAggregate();
  let dayCost = 0;

  for (const session of daySessions) {
    const projectPath = session.info.cwd;
    const projectName = getPathBasename(projectPath);
    const sessionTokens = getSessionTokenAggregate(session.entries);
    const tokenCount =
      sessionTokens.input +
      sessionTokens.output +
      sessionTokens.cacheRead +
      sessionTokens.cacheWrite;
    dayTokens.input += sessionTokens.input;
    dayTokens.output += sessionTokens.output;
    dayTokens.cacheRead += sessionTokens.cacheRead;
    dayTokens.cacheWrite += sessionTokens.cacheWrite;
    dayCost += getSessionCost(session.entries);

    if (!projectMap.has(projectPath)) {
      projectMap.set(projectPath, {
        project_path: projectPath,
        project_name: projectName,
        session_count: 0,
        message_count: 0,
        token_count: 0,
      });
    }
    const bucket = projectMap.get(projectPath)!;
    bucket.session_count += 1;
    bucket.message_count += session.info.message_count;
    bucket.token_count += tokenCount;

    const sessionModels = getSessionModels(session.entries);
    for (const model of sessionModels.size
      ? sessionModels
      : new Set(["unknown"])) {
      modelsUsed[model] = (modelsUsed[model] || 0) + 1;
    }

    sessionsDetail.push({
      path: session.info.path,
      cwd: session.info.cwd,
      name: session.info.name,
      first_message: session.info.first_message,
      message_count: session.info.message_count,
      token_count: tokenCount,
      model: [...sessionModels][0] || "unknown",
      timestamp: session.info.modified,
    });

    for (const entry of session.entries) {
      if (entry.type !== "message" || !entry.message) continue;
      if (entry.message.role !== "user" && entry.message.role !== "assistant")
        continue;
      if (!entry.timestamp.startsWith(date)) continue;
      const hour = new Date(entry.timestamp).getUTCHours();
      if (hour >= 0 && hour <= 23) {
        hourlyDistribution[hour] += 1;
      }
    }
  }

  sessionsDetail.sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );
  const projectBreakdown = [...projectMap.values()].sort(
    (left, right) => right.message_count - left.message_count,
  );
  const totalMessages = daySessions.reduce(
    (sum, session) => sum + session.info.message_count,
    0,
  );
  const totalTokens = sessionsDetail.reduce(
    (sum, session) => sum + session.token_count,
    0,
  );

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
    token_details: {
      total_input: dayTokens.input,
      total_output: dayTokens.output,
      total_cache_read: dayTokens.cacheRead,
      total_cache_write: dayTokens.cacheWrite,
      total_cost: dayCost,
      tokens_by_model: {},
    },
  };
}
