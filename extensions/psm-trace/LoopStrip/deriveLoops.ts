import type { TraceEvent, TraceTokens, TraceCost } from '@/types/trace'

export interface LoopPhases {
  thinkingMs: number
  toolCallsMs: number
  responseMs: number
}

export interface AgentLoop {
  index: number
  startMs: number
  endMs: number
  durationMs: number
  events: TraceEvent[]
  phases: LoopPhases
  toolCount: number
  toolNames: string[]
  hasError: boolean
  tokens: TraceTokens | null
  cost: TraceCost | null
  summary: string
}

function buildLoop(index: number, events: TraceEvent[]): AgentLoop {
  const startMs = events[0].offset_ms
  const lastEvt = events[events.length - 1]
  const endMs = lastEvt.offset_ms + Math.max(lastEvt.duration_ms, 0)
  const durationMs = Math.max(endMs - startMs, 0)

  let thinkingMs = 0
  let toolCallsMs = 0
  let responseMs = 0
  let toolCount = 0
  const toolNames: string[] = []
  let hasError = false
  const tokenAcc: TraceTokens = { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 }
  const costAcc: TraceCost = { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 }
  let hasTokens = false
  let summary = ''

  for (const evt of events) {
    const dur = Math.max(evt.duration_ms, 0)

    if (evt.is_error) hasError = true

    if (evt.thinking) thinkingMs += dur

    if (evt.tool_calls.length > 0) {
      toolCallsMs += dur
      for (const tc of evt.tool_calls) {
        toolCount++
        toolNames.push(tc.name)
      }
    } else if (evt.event_type === 'assistant_response') {
      responseMs += dur
    }

    if (evt.tokens) {
      hasTokens = true
      tokenAcc.input += evt.tokens.input
      tokenAcc.output += evt.tokens.output
      tokenAcc.cache_read += evt.tokens.cache_read
      tokenAcc.cache_write += evt.tokens.cache_write
      tokenAcc.total += evt.tokens.total
    }

    if (evt.cost) {
      costAcc.input += evt.cost.input
      costAcc.output += evt.cost.output
      costAcc.cache_read += evt.cost.cache_read
      costAcc.cache_write += evt.cost.cache_write
      costAcc.total += evt.cost.total
    }

    if (!summary && evt.content_preview) {
      summary = evt.content_preview.slice(0, 80)
    }
  }

  // If no explicit thinking/tool/response phases, distribute proportionally
  const accounted = thinkingMs + toolCallsMs + responseMs
  if (accounted === 0 && durationMs > 0) {
    responseMs = durationMs
  }

  return {
    index,
    startMs,
    endMs,
    durationMs,
    events,
    phases: { thinkingMs, toolCallsMs, responseMs },
    toolCount,
    toolNames: [...new Set(toolNames)],
    hasError,
    tokens: hasTokens ? tokenAcc : null,
    cost: costAcc.total > 0 ? costAcc : null,
    summary,
  }
}

export function deriveLoops(events: TraceEvent[]): AgentLoop[] {
  if (events.length === 0) return []

  const loops: AgentLoop[] = []
  let current: TraceEvent[] = []

  for (const evt of events) {
    if (evt.event_type === 'user_prompt' && current.length > 0) {
      loops.push(buildLoop(loops.length + 1, current))
      current = []
    }
    current.push(evt)
  }

  if (current.length > 0) {
    loops.push(buildLoop(loops.length + 1, current))
  }

  return loops
}
