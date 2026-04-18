import type { SessionEntry } from "@/types";
import type {
  BashCommandStat,
  SessionTraceAnalytics,
  TraceCost,
  TraceEvent,
  TraceToolCall,
  TraceTokens,
} from "@/types/trace";
import { loadDatasetCache } from "./core";

const CONTENT_PREVIEW_MAX = 200;
const ARGS_PREVIEW_MAX = 200;
const CMD_PREFIX_MAX = 80;

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function emptyTokens(): TraceTokens {
  return {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    total: 0,
  };
}

function emptyCost(): TraceCost {
  return {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    total: 0,
  };
}

function cloneTokens(tokens: TraceTokens): TraceTokens {
  return { ...tokens };
}

function cloneCost(cost: TraceCost): TraceCost {
  return { ...cost };
}

function addTokens(target: TraceTokens, source: Partial<TraceTokens> | null | undefined): void {
  if (!source) return;
  target.input += Number(source.input || 0);
  target.output += Number(source.output || 0);
  target.cache_read += Number(source.cache_read || 0);
  target.cache_write += Number(source.cache_write || 0);
  target.total += Number(source.total || 0);
}

function addCost(target: TraceCost, source: Partial<TraceCost> | null | undefined): void {
  if (!source) return;
  target.input += Number(source.input || 0);
  target.output += Number(source.output || 0);
  target.cache_read += Number(source.cache_read || 0);
  target.cache_write += Number(source.cache_write || 0);
  target.total += Number(source.total || 0);
}

function extractUsage(message: any): { tokens: TraceTokens | null; cost: TraceCost | null } {
  const usage = message?.usage;
  if (!usage) {
    return { tokens: null, cost: null };
  }

  const tokens: TraceTokens = {
    input: Number(usage.input || 0),
    output: Number(usage.output || 0),
    cache_read: Number(usage.cacheRead || 0),
    cache_write: Number(usage.cacheWrite || 0),
    total:
      Number(usage.totalTokens || 0) ||
      Number(usage.input || 0) +
        Number(usage.output || 0) +
        Number(usage.cacheRead || 0) +
        Number(usage.cacheWrite || 0),
  };

  const rawCost = usage.cost;
  const cost: TraceCost = {
    input: Number(rawCost?.input || 0),
    output: Number(rawCost?.output || 0),
    cache_read: Number(rawCost?.cacheRead || 0),
    cache_write: Number(rawCost?.cacheWrite || 0),
    total: Number(rawCost?.total || 0),
  };

  return { tokens, cost };
}

function extractTextContent(message: any): string | null {
  const content = message?.content;
  if (typeof content === "string") {
    return content || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      if (block.type === "text" && typeof block.text === "string") {
        return [block.text];
      }
      if (block.type === "thinking" && typeof block.thinking === "string") {
        return [block.thinking];
      }
      return [];
    })
    .join("\n")
    .trim();

  return text || null;
}

function extractThinking(message: any): string | null {
  const content = message?.content;
  if (!Array.isArray(content)) {
    return null;
  }

  const thinking = content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      if (block.type === "thinking" && typeof block.thinking === "string") {
        return [block.thinking];
      }
      return [];
    })
    .join("\n")
    .trim();

  return thinking ? truncate(thinking, CONTENT_PREVIEW_MAX) : null;
}

function toToolArgsRaw(argumentsValue: unknown): string | null {
  if (typeof argumentsValue === "string") {
    return argumentsValue;
  }
  if (argumentsValue === null || argumentsValue === undefined) {
    return null;
  }
  try {
    return JSON.stringify(argumentsValue, null, 2);
  } catch {
    return String(argumentsValue);
  }
}

function parseArgumentsValue(argumentsValue: unknown): Record<string, any> | null {
  if (!argumentsValue) return null;
  if (typeof argumentsValue === "string") {
    try {
      const parsed = JSON.parse(argumentsValue);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, any>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof argumentsValue === "object" && !Array.isArray(argumentsValue)) {
    return argumentsValue as Record<string, any>;
  }
  return null;
}

function extractToolCalls(message: any): TraceToolCall[] {
  const content = message?.content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block) => block?.type === "toolCall")
    .map((block: any) => {
      const argsRaw = toToolArgsRaw(block.arguments);
      return {
        id: String(block.id || ""),
        name: String(block.name || "unknown"),
        arguments_preview: argsRaw ? truncate(argsRaw, ARGS_PREVIEW_MAX) : "",
        arguments_raw: argsRaw,
        status: "running",
        result_preview: null,
      };
    });
}

function findPathListFromArgs(args: Record<string, any> | null, key: string): string[] {
  if (!args) return [];
  const value = args[key];
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return [];
}

function collectFileTracking(
  toolCalls: TraceToolCall[],
): {
  filesRead: string[];
  filesWritten: string[];
  filesEdited: string[];
  bashPrefixes: string[];
} {
  const filesRead: string[] = [];
  const filesWritten: string[] = [];
  const filesEdited: string[] = [];
  const bashPrefixes: string[] = [];

  for (const toolCall of toolCalls) {
    const args = parseArgumentsValue(toolCall.arguments_raw);
    switch (toolCall.name) {
      case "read":
        filesRead.push(...findPathListFromArgs(args, "path"));
        break;
      case "write":
        filesWritten.push(...findPathListFromArgs(args, "path"));
        break;
      case "edit":
        filesEdited.push(...findPathListFromArgs(args, "path"));
        break;
      case "bash": {
        const command = typeof args?.command === "string" ? args.command.trim() : "";
        if (command) {
          bashPrefixes.push(truncate(command, CMD_PREFIX_MAX));
        }
        break;
      }
      default:
        break;
    }
  }

  return { filesRead, filesWritten, filesEdited, bashPrefixes };
}

function buildModelKey(message: any): string {
  if (message?.provider && message?.model) {
    return `${message.provider}/${message.model}`;
  }
  return String(message?.model || "unknown");
}

function findToolResultReference(entry: SessionEntry): string | null {
  const direct = entry.message?.toolCallId;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const content = entry.message?.content;
  if (!Array.isArray(content)) {
    return null;
  }

  for (const block of content) {
    const blockId = block?.id;
    if (typeof blockId === "string" && blockId.trim()) {
      return blockId;
    }
  }

  return null;
}

function buildToolResultPreview(entry: SessionEntry): string {
  const text = extractTextContent(entry.message);
  const toolName =
    typeof entry.message?.toolName === "string" && entry.message.toolName.trim()
      ? entry.message.toolName
      : "result";

  if (text) {
    return truncate(text, CONTENT_PREVIEW_MAX);
  }

  return toolName;
}

export async function getBrowserDatasetTraceAnalytics(
  sessionPath: string,
): Promise<SessionTraceAnalytics> {
  const cache = await loadDatasetCache();
  const session = cache.sessionByPath.get(sessionPath);
  if (!session) {
    throw new Error(`Dataset session not found: ${sessionPath}`);
  }

  const headerTimestamp = session.info.created || session.entries[0]?.timestamp || "";
  const headerTimestampMs = parseTimestamp(headerTimestamp);

  const normalizedEntries = session.entries
    .filter((entry) => Boolean(entry?.timestamp))
    .map((entry) => ({
      entry,
      timestampMs: parseTimestamp(entry.timestamp || headerTimestamp),
    }))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  const toolResults = new Map<string, { isError: boolean; preview: string }>();
  const toolCallCounts = new Map<string, number>();
  const bashCommandCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const tokensByModel = new Map<string, TraceTokens>();
  const costByModel = new Map<string, TraceCost>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const filesEdited = new Set<string>();

  let totalUserMessages = 0;
  let totalAssistantMessages = 0;
  let totalToolCalls = 0;
  let totalToolResults = 0;
  let totalErrors = 0;
  let compactionCount = 0;
  let filesReadCount = 0;
  let filesWrittenCount = 0;
  let filesEditedCount = 0;
  let firstUserTimestamp: number | null = null;
  let lastAssistantTimestamp: number | null = null;

  const totalTokens = emptyTokens();
  const totalCost = emptyCost();
  const events: TraceEvent[] = [];

  for (let index = 0; index < normalizedEntries.length; index += 1) {
    const current = normalizedEntries[index];
    const next = normalizedEntries[index + 1];
    const entry = current.entry;
    const offsetMs = Math.max(0, current.timestampMs - headerTimestampMs);
    const durationMs = Math.max(
      0,
      (next?.timestampMs ?? current.timestampMs) - current.timestampMs,
    );
    const baseEvent: Omit<TraceEvent, "event_type"> = {
      id: entry.id,
      parent_id: entry.parentId || null,
      timestamp: entry.timestamp,
      offset_ms: offsetMs,
      duration_ms: durationMs,
      role: null,
      model: null,
      provider: null,
      thinking: null,
      tool_calls: [],
      tokens: null,
      cost: null,
      content_preview: null,
      is_error: false,
      error_message: null,
      files_read: [],
      files_written: [],
      files_edited: [],
    };

    if (entry.type === "message" && entry.message) {
      if (entry.message.role === "user") {
        totalUserMessages += 1;
        if (firstUserTimestamp === null) {
          firstUserTimestamp = current.timestampMs;
        }

        events.push({
          ...baseEvent,
          event_type: "user_prompt",
          role: "user",
          content_preview: extractTextContent(entry.message)
            ? truncate(extractTextContent(entry.message)!, CONTENT_PREVIEW_MAX)
            : null,
        });
        continue;
      }

      if (entry.message.role === "assistant") {
        totalAssistantMessages += 1;
        lastAssistantTimestamp = current.timestampMs;

        const modelKey = buildModelKey(entry.message);
        modelCounts.set(modelKey, (modelCounts.get(modelKey) || 0) + 1);

        const { tokens, cost } = extractUsage(entry.message);
        if (tokens) {
          addTokens(totalTokens, tokens);
          const currentModelTokens = tokensByModel.get(modelKey) || emptyTokens();
          addTokens(currentModelTokens, tokens);
          tokensByModel.set(modelKey, currentModelTokens);
        }
        if (cost) {
          addCost(totalCost, cost);
          const currentModelCost = costByModel.get(modelKey) || emptyCost();
          addCost(currentModelCost, cost);
          costByModel.set(modelKey, currentModelCost);
        }

        const toolCalls = extractToolCalls(entry.message);
        const tracking = collectFileTracking(toolCalls);
        for (const toolCall of toolCalls) {
          totalToolCalls += 1;
          toolCallCounts.set(toolCall.name, (toolCallCounts.get(toolCall.name) || 0) + 1);
        }
        tracking.filesRead.forEach((path) => {
          filesRead.add(path);
          filesReadCount += 1;
        });
        tracking.filesWritten.forEach((path) => {
          filesWritten.add(path);
          filesWrittenCount += 1;
        });
        tracking.filesEdited.forEach((path) => {
          filesEdited.add(path);
          filesEditedCount += 1;
        });
        tracking.bashPrefixes.forEach((prefix) => {
          bashCommandCounts.set(prefix, (bashCommandCounts.get(prefix) || 0) + 1);
        });

        events.push({
          ...baseEvent,
          event_type: "assistant_response",
          role: "assistant",
          model: entry.message.model || null,
          provider: entry.message.provider || null,
          thinking: extractThinking(entry.message),
          tool_calls: toolCalls,
          tokens: tokens ? cloneTokens(tokens) : null,
          cost: cost ? cloneCost(cost) : null,
          content_preview: extractTextContent(entry.message)
            ? truncate(extractTextContent(entry.message)!, CONTENT_PREVIEW_MAX)
            : null,
          files_read: tracking.filesRead,
          files_written: tracking.filesWritten,
          files_edited: tracking.filesEdited,
        });
        continue;
      }

      if (entry.message.role === "toolResult") {
        totalToolResults += 1;
        const isError = Boolean(entry.message.isError);
        if (isError) {
          totalErrors += 1;
        }

        const toolCallId = findToolResultReference(entry);
        const preview = buildToolResultPreview(entry);
        if (toolCallId) {
          toolResults.set(toolCallId, { isError, preview });
        }

        events.push({
          ...baseEvent,
          event_type: "tool_result",
          role: "toolResult",
          content_preview:
            typeof entry.message.toolName === "string" && entry.message.toolName
              ? `${entry.message.toolName}: ${preview}`
              : preview,
          is_error: isError,
          error_message: isError ? preview : null,
        });
        continue;
      }
    }

    if (entry.type === "model_change") {
      events.push({
        ...baseEvent,
        event_type: "model_change",
        model: entry.modelId || null,
        provider: entry.provider || null,
      });
      continue;
    }

    if (entry.type === "thinking_level_change") {
      events.push({
        ...baseEvent,
        event_type: "thinking_level_change",
        thinking: entry.thinkingLevel || null,
      });
      continue;
    }

    if (entry.type === "compaction") {
      compactionCount += 1;
      const summary =
        typeof (entry as any).summary === "string" ? (entry as any).summary : null;
      events.push({
        ...baseEvent,
        event_type: "compaction",
        thinking: summary ? truncate(summary, CONTENT_PREVIEW_MAX) : null,
        content_preview: summary ? truncate(summary, CONTENT_PREVIEW_MAX) : null,
      });
      continue;
    }

    if (entry.type === "custom_message") {
      const content =
        typeof (entry as any).content === "string" ? (entry as any).content : null;
      events.push({
        ...baseEvent,
        event_type: "custom_message",
        content_preview: content ? truncate(content, CONTENT_PREVIEW_MAX) : null,
      });
      continue;
    }

    if (entry.type === "branch_summary" || entry.type === "session_info") {
      const summary =
        typeof (entry as any).summary === "string"
          ? (entry as any).summary
          : typeof (entry as any).name === "string"
            ? (entry as any).name
            : null;
      events.push({
        ...baseEvent,
        event_type: "system_event",
        content_preview: summary ? truncate(summary, CONTENT_PREVIEW_MAX) : entry.type,
      });
    }
  }

  for (const event of events) {
    if (event.tool_calls.length === 0) continue;
    event.tool_calls = event.tool_calls.map((toolCall) => {
      const result = toolResults.get(toolCall.id);
      if (!result) {
        return toolCall;
      }
      return {
        ...toolCall,
        status: result.isError ? "error" : "completed",
        result_preview: result.preview,
      };
    });
  }

  const modelsUsed = [...modelCounts.keys()].sort();
  const primaryModel =
    [...modelCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ||
    "unknown";
  const durationSecs =
    normalizedEntries.length > 0
      ? Math.max(
          0,
          Math.floor(
            (normalizedEntries[normalizedEntries.length - 1].timestampMs -
              headerTimestampMs) /
              1000,
          ),
        )
      : 0;
  const activeSecs =
    firstUserTimestamp !== null && lastAssistantTimestamp !== null
      ? Math.max(0, Math.floor((lastAssistantTimestamp - firstUserTimestamp) / 1000))
      : 0;
  const bashCommands: BashCommandStat[] = [...bashCommandCounts.entries()]
    .map(([command_prefix, count]) => ({ command_prefix, count }))
    .sort((left, right) => right.count - left.count);

  return {
    session_id: session.info.id,
    session_path: session.info.path,
    cwd: session.info.cwd,
    name: session.info.name || null,
    created: session.info.created,
    modified: session.info.modified,
    duration_secs: durationSecs,
    active_secs: activeSecs,
    total_events: events.length,
    total_messages: totalUserMessages + totalAssistantMessages,
    total_user_messages: totalUserMessages,
    total_assistant_messages: totalAssistantMessages,
    total_tool_calls: totalToolCalls,
    total_tool_results: totalToolResults,
    total_errors: totalErrors,
    total_tokens: cloneTokens(totalTokens),
    total_cost: cloneCost(totalCost),
    primary_model: primaryModel,
    models_used: modelsUsed,
    compaction_count: compactionCount,
    tool_call_counts: Object.fromEntries(toolCallCounts),
    files_read: [...filesRead].sort(),
    files_written: [...filesWritten].sort(),
    files_edited: [...filesEdited].sort(),
    files_read_count: filesReadCount,
    files_written_count: filesWrittenCount,
    files_edited_count: filesEditedCount,
    bash_commands: bashCommands,
    events,
    tokens_by_model: Object.fromEntries(
      [...tokensByModel.entries()].map(([key, value]) => [key, cloneTokens(value)]),
    ),
    cost_by_model: Object.fromEntries(
      [...costByModel.entries()].map(([key, value]) => [key, cloneCost(value)]),
    ),
  };
}
