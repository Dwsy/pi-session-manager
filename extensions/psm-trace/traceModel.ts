import {
  buildPath,
  extractContentText,
  getToolCalls,
  normalizeInline,
  truncate,
  type JsonObject,
  type SessionModel,
  type SessionNode,
} from "@/utils/session-branch";

/** Which slice of the active path the workbench renders. */
export type TraceLens = "duration" | "turns" | "calls" | "errors";

/** Horizontal band of the timeline strip. Mirrors where latency is spent. */
export type TraceLane = "input" | "model" | "tools";

export type TraceBadge =
  | "USER"
  | "ASSISTANT"
  | "TOOL"
  | "CONTEXT"
  | "COMPACT"
  | "BRANCH"
  | "SYSTEM";

export interface TraceToolFrame {
  callId: string | null;
  name: string;
  args: JsonObject;
  argsPreview: string;
  result: string;
  hasResult: boolean;
  isError: boolean;
  /** Assistant message that issued the call, when it is on the same path. */
  callerUid: string | null;
  callerSummary: string;
}

export interface TraceStep {
  uid: string;
  node: SessionNode;
  badge: TraceBadge;
  lane: TraceLane;
  /** 1-based conversation turn. 0 covers entries before the first user prompt. */
  turn: number;
  /** 1-based position inside the turn. */
  step: number;
  /** Wall-clock window: work started when the previous path entry landed. */
  startMs: number;
  endMs: number;
  durationMs: number;
  title: string;
  /** Right-hand column of a tool row: the result preview. */
  detail: string | null;
  isError: boolean;
  tool: TraceToolFrame | null;
  searchText: string;
}

export interface TraceLaneBlock {
  uid: string;
  lane: TraceLane;
  /** Fractions of the session window, 0–1. */
  offset: number;
  size: number;
  isError: boolean;
}

export interface TraceStats {
  turns: number;
  steps: number;
  modelMs: number;
  toolMs: number;
  wallMs: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  errors: number;
  /** Cached prompt tokens over all prompt tokens. */
  cacheHitRate: number;
  /** Output tokens per second of model time. */
  outputPerSecond: number;
  /** Mean model latency per assistant step. */
  msPerModelStep: number;
}

export interface TraceTimeline {
  steps: TraceStep[];
  blocks: TraceLaneBlock[];
  stats: TraceStats;
  minMs: number;
  maxMs: number;
}

/** Observed call signature for a tool, aggregated over the whole session. */
export interface TraceToolSignature {
  name: string;
  calls: number;
  failures: number;
  parameters: Array<{ key: string; types: string[]; presence: number }>;
}

const ARGS_PREVIEW_LIMIT = 44;
const TITLE_LIMIT = 240;
const DETAIL_LIMIT = 240;

export function buildTraceTimeline(
  model: SessionModel,
  activeLeafUid: string,
): TraceTimeline {
  const path = buildPath(model, activeLeafUid);
  const steps: TraceStep[] = [];

  let turn = 0;
  let step = 0;
  let previousMs = path[0]?.timestampMs ?? model.minTime;

  for (const node of path) {
    const isUser = node.entry.type === "message" && node.entry.message?.role === "user";
    if (isUser) {
      turn += 1;
      step = 0;
    }
    step += 1;

    const endMs = Number.isFinite(node.timestampMs) ? node.timestampMs : previousMs;
    const startMs = Math.min(previousMs, endMs);
    const tool = toolFrame(model, node);
    const badge = badgeOf(node);

    steps.push({
      uid: node.uid,
      node,
      badge,
      lane: laneOf(badge),
      turn,
      step,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      title: tool ? toolTitle(tool) : truncate(node.summary, TITLE_LIMIT),
      detail: tool ? truncate(tool.result, DETAIL_LIMIT) || null : null,
      isError: isErrorStep(node, tool),
      tool,
      searchText: node.searchText,
    });
    previousMs = endMs;
  }

  const minMs = steps[0]?.startMs ?? model.minTime;
  const maxMs = steps[steps.length - 1]?.endMs ?? model.maxTime;
  return {
    steps,
    blocks: buildLaneBlocks(steps, minMs, maxMs),
    stats: buildStats(steps, minMs, maxMs),
    minMs,
    maxMs,
  };
}

export function filterTraceSteps(
  steps: TraceStep[],
  lens: TraceLens,
  search: string,
): TraceStep[] {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  return steps.filter((item) => {
    if (!passesLens(item, lens)) return false;
    if (!tokens.length) return true;
    return tokens.every((token) => item.searchText.includes(token));
  });
}

function passesLens(item: TraceStep, lens: TraceLens): boolean {
  if (lens === "errors") return item.isError;
  if (lens === "calls") return item.badge === "TOOL";
  if (lens === "turns") {
    if (item.badge === "USER") return true;
    if (item.badge !== "ASSISTANT") return false;
    return hasAssistantText(item.node);
  }
  return true;
}

/**
 * Tool rows are keyed on the result entry so a single row can show the call
 * arguments next to what came back. Assistant tool-call messages stay as
 * their own model-lane row because that is where LLM latency accrues.
 */
function toolFrame(model: SessionModel, node: SessionNode): TraceToolFrame | null {
  const message = node.entry.message;
  if (!message) return null;

  if (message.role === "bashExecution") {
    const args: JsonObject = { command: String(message.command ?? "") };
    return {
      callId: null,
      name: "bash",
      args,
      argsPreview: previewArgs(args),
      result: normalizeInline(extractContentText(message.content)),
      hasResult: true,
      isError: message.exitCode != null && message.exitCode !== 0,
      callerUid: node.parent?.uid ?? null,
      callerSummary: node.parent ? truncate(node.parent.summary, 80) : "",
    };
  }

  if (message.role !== "toolResult") return null;

  const callId = message.toolCallId ? String(message.toolCallId) : null;
  const call = callId ? model.toolCallMap.get(callId) : undefined;
  const args = call?.arguments ?? {};
  return {
    callId,
    name: call?.name || String(message.toolName || "tool"),
    args,
    argsPreview: previewArgs(args),
    result: normalizeInline(extractContentText(message.content)),
    hasResult: true,
    isError: Boolean(message.isError),
    callerUid: call?.node.uid ?? null,
    callerSummary: call ? truncate(call.node.summary, 80) : "",
  };
}

function toolTitle(tool: TraceToolFrame): string {
  return tool.argsPreview ? `${tool.name} ${tool.argsPreview}` : tool.name;
}

function isErrorStep(node: SessionNode, tool: TraceToolFrame | null): boolean {
  if (tool?.isError) return true;
  if (node.kind === "error") return true;
  return node.entry.message?.stopReason === "aborted";
}

function badgeOf(node: SessionNode): TraceBadge {
  const role = node.entry.type === "message" ? node.entry.message?.role : undefined;
  if (role === "user") return "USER";
  if (role === "assistant") return "ASSISTANT";
  if (role === "toolResult" || role === "bashExecution") return "TOOL";
  if (node.kind === "compaction") return "COMPACT";
  if (node.kind === "branch") return "BRANCH";
  if (node.kind === "custom") return "CONTEXT";
  return "SYSTEM";
}

function laneOf(badge: TraceBadge): TraceLane {
  if (badge === "ASSISTANT") return "model";
  if (badge === "TOOL") return "tools";
  return "input";
}

function hasAssistantText(node: SessionNode): boolean {
  const message = node.entry.message;
  if (!message) return false;
  if (message.errorMessage || message.stopReason === "aborted") return true;
  return extractContentText(message.content).trim().length > 0;
}

/**
 * Zero-length entries still need a visible block, so every block claims a
 * minimum slice of the strip instead of collapsing to a hairline.
 */
function buildLaneBlocks(
  steps: TraceStep[],
  minMs: number,
  maxMs: number,
): TraceLaneBlock[] {
  const span = Math.max(1, maxMs - minMs);
  const minSize = 0.004;
  return steps.map((item) => {
    const offset = Math.min(clamp01((item.startMs - minMs) / span), 1 - minSize);
    const size = clamp01((item.endMs - item.startMs) / span);
    return {
      uid: item.uid,
      lane: item.lane,
      offset,
      size: Math.min(Math.max(minSize, size), 1 - offset),
      isError: item.isError,
    };
  });
}

function buildStats(steps: TraceStep[], minMs: number, maxMs: number): TraceStats {
  const stats: TraceStats = {
    turns: 0,
    steps: steps.length,
    modelMs: 0,
    toolMs: 0,
    wallMs: Math.max(0, maxMs - minMs),
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
    errors: 0,
    cacheHitRate: 0,
    outputPerSecond: 0,
    msPerModelStep: 0,
  };

  let modelSteps = 0;
  for (const item of steps) {
    stats.turns = Math.max(stats.turns, item.turn);
    if (item.lane === "model") {
      stats.modelMs += item.durationMs;
      modelSteps += 1;
    }
    if (item.lane === "tools") stats.toolMs += item.durationMs;
    if (item.isError) stats.errors += 1;

    const delta = item.node.delta;
    stats.input += delta.input;
    stats.output += delta.output;
    stats.cacheRead += delta.cacheRead;
    stats.cacheWrite += delta.cacheWrite;
    stats.totalTokens += delta.totalTokens;
    stats.cost += delta.cost;
  }

  const promptTokens = stats.input + stats.cacheRead;
  stats.cacheHitRate = promptTokens > 0 ? stats.cacheRead / promptTokens : 0;
  stats.outputPerSecond =
    stats.modelMs > 0 ? stats.output / (stats.modelMs / 1000) : 0;
  stats.msPerModelStep = modelSteps > 0 ? stats.modelMs / modelSteps : 0;
  return stats;
}

/**
 * Pi sessions never carry tool JSON schemas, so the inspector shows the
 * signature actually observed in this session instead of pretending to know
 * the declared contract.
 */
export function observedToolSignature(
  model: SessionModel,
  name: string,
): TraceToolSignature {
  const types = new Map<string, Set<string>>();
  const presence = new Map<string, number>();
  let calls = 0;
  let failures = 0;

  for (const call of model.toolCallMap.values()) {
    if (call.name !== name) continue;
    calls += 1;
    for (const [key, value] of Object.entries(call.arguments ?? {})) {
      if (!types.has(key)) types.set(key, new Set());
      types.get(key)?.add(jsonTypeOf(value));
      presence.set(key, (presence.get(key) ?? 0) + 1);
    }
    const result = call.block.id
      ? model.toolResultByCallId.get(String(call.block.id))?.[0]
      : undefined;
    if (result?.entry.message?.isError) failures += 1;
  }

  const parameters = [...types.entries()]
    .map(([key, set]) => ({
      key,
      types: [...set].sort(),
      presence: calls > 0 ? (presence.get(key) ?? 0) / calls : 0,
    }))
    .sort((a, b) => b.presence - a.presence || a.key.localeCompare(b.key));

  return { name, calls, failures, parameters };
}

/** Tool calls issued by an assistant message, for the inspector hierarchy. */
export function assistantToolCallNames(node: SessionNode): string[] {
  if (node.entry.message?.role !== "assistant") return [];
  return getToolCalls(node.entry.message.content).map(
    (block) => block.name || "tool",
  );
}

export function previewArgs(args: JsonObject): string {
  const entries = Object.entries(args ?? {});
  if (!entries.length) return "{}";
  const parts = entries.map(
    ([key, value]) => `${key}: ${truncate(compactValue(value), 24)}`,
  );
  return truncate(`{${parts.join(", ")}}`, ARGS_PREVIEW_LIMIT);
}

function compactValue(value: unknown): string {
  if (typeof value === "string") return normalizeInline(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as JsonObject).length}}`;
  }
  return String(value);
}

function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  return `${Math.round(ratio * 100)}%`;
}
