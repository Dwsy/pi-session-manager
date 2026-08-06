import type { SessionEntry, LegacySessionStats, Content, Message } from '@/types'
import { parseQuotedQuery } from './search'
import { applySessionEntryTransformers } from '@/plugins/runtime-host/sessionEntryTransformers'

export const SHORT_SESSION_ID_LENGTH = 12
export const MIN_SESSION_ID_PREFIX_LENGTH = 3

// Parent links are structural facts in Pi JSONL. Keep source provenance outside
// persisted entry data so provider-specific display grouping cannot collapse a Pi
// branch anchor.
const claudeConvertedEntries = new WeakSet<SessionEntry>()
const codexConvertedEntries = new WeakSet<SessionEntry>()

export function isTauriReady(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined
}

export function parseSessionEntries(jsonlContent: string): SessionEntry[] {
  return parseSessionEntriesWithLineCount(jsonlContent).entries
}

export function parseSessionEntriesWithLineCount(jsonlContent: string): {
  entries: SessionEntry[]
  lineCount: number
} {
  const trimmed = jsonlContent.trim()
  if (trimmed.startsWith('[')) {
    try {
      const rawItems = JSON.parse(trimmed)
      if (Array.isArray(rawItems)) {
        const entries: SessionEntry[] = []
        const seenIds = new Map<string, number>()

        for (const raw of rawItems) {
          const normalized = normalizeSessionEntry(raw)
          if (!normalized) continue

          if (
            normalized.type === 'message' &&
            !normalized.parentId &&
            entries.length > 0
          ) {
            const previous = entries[entries.length - 1]
            if (previous?.id && previous.id !== normalized.id) {
              normalized.parentId = previous.id
            }
          }

          const baseId = ensureEntryId(normalized)
          const existing = seenIds.get(baseId) || 0
          if (existing > 0) {
            normalized.id = `${baseId}__dup_${existing}`
          }
          seenIds.set(baseId, existing + 1)
          entries.push(normalized)
        }

        return { entries: applySessionEntryTransformers(groupProviderAssistantFragments(entries)), lineCount: rawItems.length }
      }
    } catch {
      // Fall through to line-based parsing.
    }
  }

  const entries: SessionEntry[] = []
  const lines = jsonlContent.split('\n')
  const seenIds = new Map<string, number>()
  let lineCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    lineCount++

    try {
      const raw = JSON.parse(line)
      const normalized = normalizeSessionEntry(raw)
      if (!normalized) {
        continue
      }

      if (
        normalized.type === 'message' &&
        !normalized.parentId &&
        entries.length > 0
      ) {
        const previous = entries[entries.length - 1]
        if (previous?.id && previous.id !== normalized.id) {
          normalized.parentId = previous.id
        }
      }

      const baseId = ensureEntryId(normalized)
      const existing = seenIds.get(baseId) || 0
      if (existing > 0) {
        normalized.id = `${baseId}__dup_${existing}`
      }
      seenIds.set(baseId, existing + 1)
      entries.push(normalized)
    } catch (_error) {
      // Skip malformed lines silently to avoid noisy console churn on large sessions.
    }
  }

  return { entries: applySessionEntryTransformers(groupProviderAssistantFragments(entries)), lineCount }
}

/**
 * Apply per-provider assistant-fragment grouping. Claude Code fragments share
 * a response id; Codex fragments are role-adjacent. Each helper is a no-op for
 * the other provider's shapes, so running both is safe and idempotent.
 */
function groupProviderAssistantFragments(entries: SessionEntry[]): SessionEntry[] {
  return groupCodexAssistantFragments(groupClaudeAssistantFragments(entries))
}

export function computeStats(entries: SessionEntry[]): LegacySessionStats {
  const stats: LegacySessionStats = {
    userMessages: 0,
    assistantMessages: 0,
    toolResults: 0,
    customMessages: 0,
    compactions: 0,
    branchSummaries: 0,
    toolCalls: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    models: [],
  }

  const modelSet = new Set<string>()

  for (const entry of entries) {
    if (entry.type === 'message') {
      const msg = entry.message
      if (!msg) continue

      if (msg.role === 'user') stats.userMessages++
      if (msg.role === 'assistant') {
        stats.assistantMessages++
        const model = msg.model || entry.modelId
        const provider = msg.provider || entry.provider
        if (model) {
          const modelName = provider ? `${provider}/${model}` : model
          modelSet.add(modelName)
        }
        if (msg.usage) {
          stats.tokens.input += msg.usage.input || 0
          stats.tokens.output += msg.usage.output || 0
          stats.tokens.cacheRead += msg.usage.cacheRead || 0
          stats.tokens.cacheWrite += msg.usage.cacheWrite || 0
          if (msg.usage.cost) {
            stats.cost.input += msg.usage.cost.input || 0
            stats.cost.output += msg.usage.cost.output || 0
            stats.cost.cacheRead += msg.usage.cost.cacheRead || 0
            stats.cost.cacheWrite += msg.usage.cost.cacheWrite || 0
          }
        }
        stats.toolCalls += msg.content.filter(c => c.type === 'toolCall').length
      }
      if (msg.role === 'toolResult') stats.toolResults++
    } else if (entry.type === 'model_change') {
      // Preview mode: model_change entries carry provider/modelId from JSONL first line
      if (entry.modelId) {
        const modelName = entry.provider ? `${entry.provider}/${entry.modelId}` : entry.modelId
        modelSet.add(modelName)
      }
    } else if (entry.type === 'compaction') {
      stats.compactions++
    } else if (entry.type === 'branch_summary') {
      stats.branchSummaries++
    } else if (entry.type === 'custom_message') {
      stats.customMessages++
    }
  }

  stats.models = Array.from(modelSet)
  return stats
}

export function findToolResult(
  entries: SessionEntry[],
  toolCallId: string
): SessionEntry | null {
  return entries.find(
    e => e.type === 'message' &&
    e.message?.role === 'toolResult' &&
    e.message?.content.some((c: any) => c.id === toolCallId)
  ) || null
}

function ensureEntryId(entry: SessionEntry): string {
  if (entry.id && entry.id.trim()) {
    return entry.id
  }
  entry.id = generateFallbackId('session-entry')
  return entry.id
}

function generateFallbackId(prefix: string): string {
  const base =
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${base}`
}

function normalizeSessionEntry(raw: any): SessionEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const type = typeof raw.type === 'string' ? raw.type : undefined

  if (type === 'user' || type === 'assistant' || type === 'tool_result') {
    const entry = convertClaudeLineToSessionEntry(raw)
    if (entry) claudeConvertedEntries.add(entry)
    return entry
  }

  if (type === 'response_item') {
    const entry = convertCodexResponseItem(raw)
    if (entry) codexConvertedEntries.add(entry)
    return entry
  }

  if (type === 'event_msg') {
    const entry = convertCodexEventMsg(raw)
    if (entry) codexConvertedEntries.add(entry)
    return entry
  }

  if (type === 'message') {
    return raw as SessionEntry
  }

  if (
    type === 'session' ||
    type === 'session_info' ||
    type === 'label' ||
    type === 'model_change' ||
    type === 'thinking_level_change' ||
    type === 'toolCall' ||
    type === 'custom' ||
    type === 'custom_message' ||
    type === 'compaction' ||
    type === 'branch_summary' ||
    type === 'label'
  ) {
    return raw as SessionEntry
  }

  return null
}

function convertClaudeLineToSessionEntry(line: any): SessionEntry | null {
  const message = line?.message
  if (!message) return null

  const roleCandidate =
    typeof message.role === 'string'
      ? message.role
      : line.type === 'assistant'
        ? 'assistant'
        : 'user'

  const role =
    roleCandidate === 'assistant'
      ? 'assistant'
      : roleCandidate === 'toolResult'
        ? 'toolResult'
        : 'user'

  const toolResult = extractClaudeToolResult(message.content)
  const content = toolResult
    ? [{ type: 'text' as const, text: toolResult.text }]
    : normalizeClaudeContent(message.content)
  const timestamp =
    typeof line.timestamp === 'string' ? line.timestamp : new Date().toISOString()
  const resolvedRole = toolResult ? 'toolResult' : role

  const responseId =
    typeof message.id === 'string' && message.id ? message.id : undefined

  return {
    type: 'message',
    id: (line.uuid as string) || generateFallbackId('claude-entry'),
    parentId: line.parentUuid || undefined,
    timestamp,
    message: {
      role: resolvedRole,
      content,
      toolCallId: toolResult?.toolCallId,
      isError: toolResult?.isError,
      model: resolvedRole === 'assistant' && typeof message.model === 'string' ? message.model : undefined,
      provider: resolvedRole === 'assistant' ? 'anthropic' : undefined,
      usage: normalizeTokenUsage(message.usage),
      stopReason:
        typeof message.stop_reason === 'string' ? message.stop_reason : undefined,
      responseId: resolvedRole === 'assistant' ? responseId : undefined,
    },
  }
}

/**
 * Claude Code writes a single assistant turn (thinking + text + multiple
 * tool_use blocks) as several consecutive JSONL lines, each with its own
 * `uuid` but sharing the same response id (`message.id`). Without grouping,
 * every fragment is rendered as a standalone message, so a turn shows up as
 * one thinking message, one text message, and one message per tool call.
 *
 * This merges consecutive `assistant` entries that share the same `responseId`
 * back into a single message whose `content` carries all blocks — matching the
 * shape Pi already uses. `user`/`toolResult` entries are left untouched.
 *
 * Safe to run on any provider: it only acts on adjacent assistant entries with
 * a populated `responseId`, which Pi/Codex/etc. never produce.
 */
function groupClaudeAssistantFragments(entries: SessionEntry[]): SessionEntry[] {
  if (entries.length < 2) return entries

  const merged: SessionEntry[] = []
  let current: SessionEntry | null = null
  let currentResponseId: string | undefined

  const flushCurrent = () => {
    if (current) {
      merged.push(current)
      current = null
      currentResponseId = undefined
    }
  }

  for (const entry of entries) {
    const isAssistant = entry.type === 'message' && entry.message?.role === 'assistant'
    const responseId = claudeConvertedEntries.has(entry)
      ? entry.message?.responseId
      : undefined

    if (isAssistant && responseId && responseId === currentResponseId && current) {
      current = mergeAssistantInto(current, entry)
      continue
    }

    flushCurrent()

    if (isAssistant && responseId) {
      current = entry
      currentResponseId = responseId
    } else {
      merged.push(entry)
    }
  }

  flushCurrent()
  return merged
}

function mergeAssistantInto(head: SessionEntry, fragment: SessionEntry): SessionEntry {
  const headMsg = head.message!
  const fragMsg = fragment.message!
  const content = [...(headMsg.content ?? []), ...(fragMsg.content ?? [])]

  return {
    ...head,
    message: {
      ...headMsg,
      content,
      model: fragMsg.model || headMsg.model,
      usage: mergeUsage(headMsg.usage, fragMsg.usage),
      stopReason: fragMsg.stopReason ?? headMsg.stopReason,
    },
  }
}

function mergeUsage(
  a: Message['usage'] | undefined,
  b: Message['usage'] | undefined,
): Message['usage'] | undefined {
  if (!a) return b
  if (!b) return a
  // Streaming fragments accumulate usage; take the max per field to reflect
  // the final totals rather than double-counting partial deltas.
  return {
    input: Math.max(a.input, b.input),
    output: Math.max(a.output, b.output),
    cacheRead: Math.max(a.cacheRead, b.cacheRead),
    cacheWrite: Math.max(a.cacheWrite, b.cacheWrite),
  }
}

/**
 * Classify an assistant entry by what it carries. Codex writes a single
 * assistant mini-turn as several consecutive entries: one per tool call, plus
 * a final `message[assistant]` carrying the answer text. Each piece on its own
 * renders as a standalone message, so we collapse them into one.
 */
type AssistantFragmentKind = 'toolCalls' | 'thinking' | 'text' | 'other'

function classifyAssistantEntry(entry: SessionEntry): AssistantFragmentKind {
  const content = entry.message?.content ?? []
  const hasText = content.some((c) => c.type === 'text' && (c.text ?? '').trim().length > 0)
  const hasToolCall = content.some((c) => c.type === 'toolCall')
  const hasThinking = content.some((c) => c.type === 'thinking')
  if (hasToolCall && !hasText && !hasThinking) return 'toolCalls'
  if (hasThinking && !hasText && !hasToolCall) return 'thinking'
  if (hasText && !hasToolCall) return 'text'
  return 'other'
}

/**
 * Codex spreads one assistant turn across several lines: a series of
 * `function_call` entries (each a lone toolCall), the matching
 * `function_call_output` toolResult entries, optionally a reasoning/thinking
 * entry, and a final `message[assistant]` with the answer text. Group these
 * assistant fragments into a single assistant message whose `content` holds
 * every block — matching Pi/Claude's one-message-per-turn shape.
 *
 * Group boundaries:
 *  - A user message always flushes the current group.
 *  - toolResult entries between assistant fragments are absorbed positionally
 *    (the turn is still in progress) but emitted as their own entries so they
 *    keep linking to toolCalls via toolCallId.
 *  - The group closes when an assistant *text* fragment (the finalized answer)
 *    is appended, or when a non-absorbable entry arrives.
 *  - Already-complete turns (text+toolCall in one entry) are left untouched.
 *
 * Safe for other providers: it only acts on adjacent assistant/toolResult
 * sequences where assistant entries are pure toolCall/thinking/text fragments.
 */
function groupCodexAssistantFragments(entries: SessionEntry[]): SessionEntry[] {
  if (entries.length < 2) return entries

  const result: SessionEntry[] = []
  // Each pending item is either an assistant fragment to merge or a toolResult
  // entry to re-emit in place.
  let assistantFrags: SessionEntry[] = []
  let pending: SessionEntry[] = []

  const flushGroup = () => {
    if (assistantFrags.length === 0) {
      // Only toolResults were pending (no open turn) — emit them as-is.
      for (const e of pending) result.push(e)
    } else if (assistantFrags.length === 1) {
      result.push(assistantFrags[0])
      for (const e of pending) result.push(e)
    } else {
      result.push(mergeCodexAssistantGroup(assistantFrags))
      for (const e of pending) result.push(e)
    }
    assistantFrags = []
    pending = []
  }

  for (const entry of entries) {
    if (!codexConvertedEntries.has(entry)) {
      flushGroup()
      result.push(entry)
      continue
    }

    const role = entry.type === 'message' ? entry.message?.role : undefined

    if (role === 'user') {
      // A new user turn always starts fresh.
      flushGroup()
      result.push(entry)
      continue
    }

    if (role === 'toolResult') {
      // toolResults between assistant fragments belong to the same turn; hold
      // them to re-emit after the merged assistant message.
      if (assistantFrags.length > 0) {
        pending.push(entry)
      } else {
        result.push(entry)
      }
      continue
    }

    if (role !== 'assistant') {
      flushGroup()
      result.push(entry)
      continue
    }

    const kind = classifyAssistantEntry(entry)
    // An already-complete turn (text + toolCall together, or unrecognised mix)
    // is its own message.
    if (kind === 'other') {
      flushGroup()
      result.push(entry)
      continue
    }

    // Thinking fragments stay as their own messages — folding reasoning into a
    // turn would merge it with the answer text and lose the distinction.
    if (kind === 'thinking') {
      flushGroup()
      result.push(entry)
      continue
    }

    const hasText = assistantFrags.some((e) => classifyAssistantEntry(e) === 'text')
    // A second text fragment means a new turn started (previous turn had no
    // trailing non-text fragment to close it).
    if (kind === 'text' && hasText) {
      flushGroup()
    }

    assistantFrags.push(entry)

    // The finalized answer text closes the turn.
    if (kind === 'text') {
      flushGroup()
    }
  }

  flushGroup()
  return result
}

function mergeCodexAssistantGroup(fragments: SessionEntry[]): SessionEntry {
  // Groups only ever contain tool-call fragments and the final answer text
  // (thinking fragments stay separate — see groupCodexAssistantFragments).
  const head = fragments[0]
  const content: Content[] = []
  let model: string | undefined
  let usage: Message['usage'] | undefined
  let stopReason: string | undefined

  // Preserve a natural reading order: toolCalls → text.
  const ordered = [
    ...fragments.filter((f) => classifyAssistantEntry(f) === 'toolCalls'),
    ...fragments.filter((f) => classifyAssistantEntry(f) === 'text'),
  ]

  for (const frag of ordered) {
    const msg = frag.message!
    for (const block of msg.content ?? []) content.push(block)
    model = msg.model || model
    usage = mergeUsage(usage, msg.usage)
    stopReason = msg.stopReason ?? stopReason
  }

  return {
    ...head,
    message: {
      ...head.message!,
      content,
      model,
      usage,
      stopReason,
    },
  }
}

function extractClaudeToolResult(value: unknown): { toolCallId: string; text: string; isError?: boolean } | null {
  const items = Array.isArray(value) ? value : [value]
  const toolResults = items
    .filter((item): item is Record<string, any> =>
      Boolean(item && typeof item === 'object' && (item as Record<string, any>).type === 'tool_result')
    )
  if (toolResults.length === 0 || toolResults.length !== items.length) return null

  const first = toolResults[0]
  const toolCallId = typeof first.tool_use_id === 'string' ? first.tool_use_id : ''
  if (!toolCallId) return null

  return {
    toolCallId,
    text: toolResults.map(item => stringifyClaudeToolResultContent(item.content)).join('\n\n'),
    isError: typeof first.is_error === 'boolean' ? first.is_error : undefined,
  }
}

function stringifyClaudeToolResultContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (item && typeof item === 'object' && typeof (item as Record<string, any>).text === 'string') {
          return (item as Record<string, any>).text
        }
        return JSON.stringify(item)
      })
      .join('\n')
  }
  return JSON.stringify(value)
}

function normalizeTokenUsage(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const usage = value as Record<string, any>
  const input =
    Number(usage.input ?? usage.input_tokens ?? usage.inputTokens ?? 0) || 0
  const output =
    Number(usage.output ?? usage.output_tokens ?? usage.outputTokens ?? 0) || 0
  const cacheRead =
    Number(
      usage.cacheRead ?? usage.cache_read_tokens ?? usage.cacheReadTokens ?? 0
    ) || 0
  const cacheWrite =
    Number(
      usage.cacheWrite ??
        usage.cache_creation_input_tokens ??
        usage.cacheWriteTokens ??
        0
    ) || 0

  return { input, output, cacheRead, cacheWrite }
}

function normalizeClaudeContent(value: unknown): Content[] {
  if (!value) return []
  if (typeof value === 'string') {
    return [{ type: 'text', text: value }]
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => convertClaudeContentItem(item))
  }

  return convertClaudeContentItem(value)
}

function convertClaudeContentItem(item: any): Content[] {
  if (!item || typeof item !== 'object') return []
  const type = typeof item.type === 'string' ? item.type : 'text'

  switch (type) {
    case 'text':
      return typeof item.text === 'string'
        ? [{ type: 'text', text: item.text }]
        : []
    case 'thinking':
      return typeof item.thinking === 'string'
        ? [{ type: 'thinking', thinking: item.thinking }]
        : []
    case 'tool_use':
      return [
        {
          type: 'toolCall',
          id: item.id,
          name: item.name,
          arguments: item.input,
          text: item.name || 'tool call',
        },
      ]
    case 'tool_result':
      return [
        {
          type: 'text',
          text:
            typeof item.content === 'string'
              ? item.content
              : JSON.stringify(item.content),
        },
      ]
    default:
      return [{ type: 'text', text: JSON.stringify(item) }]
  }
}

function convertCodexEventMsg(envelope: any): SessionEntry | null {
  const payload = envelope?.payload
  if (!payload || typeof payload !== 'object') return null

  const timestamp = normalizeCodexTimestamp(envelope.timestamp)
  const payloadType = payload.type as string | undefined

  if (payloadType === 'user_message') {
    const text = typeof payload.message === 'string' ? payload.message : ''
    if (!text.trim() || isCodexBootstrapText(text)) return null
    return {
      type: 'message',
      id: payload.id || generateFallbackId('codex-user'),
      timestamp,
      message: {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    }
  }

  if (payloadType === 'agent_reasoning') {
    const thinking = typeof payload.text === 'string' ? payload.text : ''
    if (!thinking.trim()) return null
    return {
      type: 'message',
      id: payload.id || generateFallbackId('codex-reasoning'),
      timestamp,
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking }],
        provider: 'openai-codex',
      },
    }
  }

  return null
}

function convertCodexResponseItem(envelope: any): SessionEntry | null {
  const payload = envelope?.payload
  if (!payload || typeof payload !== 'object') return null
  const payloadType = payload.type as string | undefined
  const timestamp = normalizeCodexTimestamp(envelope.timestamp ?? payload.timestamp)

  if (payloadType === 'message' || (!payloadType && (payload.role || payload.content))) {
    const rawRole = typeof payload.role === 'string' ? payload.role : 'assistant'
    if (rawRole === 'developer' || rawRole === 'system') {
      return null
    }
    const role = rawRole === 'assistant' ? 'assistant' : 'user'
    const content = normalizeCodexContent(payload.content ?? [])
    const visibleText = content
      .filter(item => item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text!.trim())
      .filter(Boolean)
      .join('\n')
    if (role === 'user' && isCodexBootstrapText(visibleText)) {
      return null
    }
    return {
      type: 'message',
      id: payload.id || generateFallbackId('codex-entry'),
      timestamp,
      message: {
        role,
        content,
        model: role === 'assistant' ? payload.model : undefined,
        provider: role === 'assistant' ? 'openai-codex' : undefined,
      },
    }
  }

  if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
    return {
      type: 'message',
      id: payload.call_id || payload.id || generateFallbackId('codex-tool'),
      timestamp,
      message: {
        role: 'toolResult',
        toolCallId: payload.call_id || payload.tool_use_id || payload.id,
        isError: typeof payload.is_error === 'boolean' ? payload.is_error : undefined,
        content: [
          {
            type: 'text',
            text: stringifyCodexOutput(payload.output ?? payload.content ?? payload.result),
          },
        ],
      },
    }
  }

  if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
    return {
      type: 'message',
      id: payload.id || payload.call_id || generateFallbackId('codex-tool-call'),
      timestamp,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: payload.call_id || payload.id,
            name: payload.name,
            arguments: normalizeCodexArguments(payload.arguments ?? payload.input ?? payload.args),
            text: payload.name || 'function call',
          },
        ],
        provider: 'openai-codex',
      },
    }
  }

  return null
}

function normalizeCodexContent(value: unknown): Content[] {
  const items = Array.isArray(value) ? value : [value]
  const content: Content[] = []
  for (const item of items) {
    if (typeof item === 'string') {
      content.push({ type: 'text', text: item })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, any>
    const type = candidate.type as string | undefined
    switch (type) {
      case 'text':
      case 'input_text':
      case 'output_text':
        if (typeof candidate.text === 'string') {
          content.push({ type: 'text', text: candidate.text })
        }
        break
      case 'reasoning':
        if (typeof candidate.text === 'string') {
          content.push({ type: 'thinking', thinking: candidate.text })
        }
        break
      case 'function_call':
      case 'custom_tool_call':
      case 'tool_use':
        content.push({
          type: 'toolCall',
          id: candidate.call_id || candidate.id,
          name: candidate.name,
          arguments: normalizeCodexArguments(candidate.arguments ?? candidate.input ?? candidate.args),
          text: candidate.name || 'function call',
        })
        break
      case 'tool_result':
        content.push({
          type: 'text',
          text: stringifyCodexOutput(candidate.content ?? candidate.output ?? candidate.result),
        })
        break
      case 'input_image':
        if (typeof candidate.data === 'string') {
          content.push({ type: 'image', data: candidate.data, mimeType: candidate.mimeType })
        }
        break
      default:
        if (typeof candidate.text === 'string') {
          content.push({ type: 'text', text: candidate.text })
        }
        break
    }
  }
  return content
}

function normalizeCodexTimestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 100_000_000_000 ? value * 1000 : value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return new Date(numeric < 100_000_000_000 ? numeric * 1000 : numeric).toISOString()
    }
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString()
    }
  }
  return new Date().toISOString()
}

function normalizeCodexArguments(value: unknown): Record<string, any> | undefined {
  if (value === undefined || value === null) return undefined

  let parsed = value
  if (typeof value === 'string') {
    if (!value.trim()) return undefined
    try {
      parsed = JSON.parse(value)
    } catch {
      return { value }
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, any>
  }

  return { value: parsed }
}

function stringifyCodexOutput(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? '')
}

function isCodexBootstrapText(text: string): boolean {
  const normalized = text.trimStart()
  return [
    '<permissions instructions>',
    '<app-context>',
    '<collaboration_mode>',
    '<skills_instructions>',
    '<plugins_instructions>',
    '# AGENTS.md instructions for ',
    '<environment_context>',
    '<turn_aborted>',
  ].some(prefix => normalized.startsWith(prefix))
}
export function getSessionSourceTag(sessionPath: string): string | null {
  const slug = getSessionSourceSlug(sessionPath)
  if (!slug) return null

  switch (slug) {
    case 'pi':
      return 'Pi'
    case 'omp':
      return 'OMP'
    case 'claude-code':
      return 'Claude Code'
    case 'codex':
      return 'Codex'
    case 'opencode':
      return 'OpenCode'
    case 'gemini':
      return 'Gemini CLI'
    case 'factory':
      return 'Factory'
    case 'clawdbot':
      return 'ClawdBot'
    case 'cursor':
      return 'Cursor'
    case 'antigravity':
      return 'Antigravity'
    default:
      return slug
  }
}

export function getSessionSourceSlug(sessionPath: string): string | null {
  if (!sessionPath) return null

  const normalized = sessionPath.replace(/\\/g, '/')

  if (normalized.includes('/.pi/agent/sessions')) {
    return 'pi'
  }

  if (normalized.includes('/.omp/agent/sessions')) {
    return 'omp'
  }

  if (normalized.includes('/.claude/projects')) {
    return 'claude-code'
  }

  if (normalized.includes('/.codex/sessions')) {
    return 'codex'
  }

  if (normalized.includes('/.opencode/') || normalized.includes('/opencode.db')) {
    return 'opencode'
  }

  // Antigravity lives under ~/.gemini/antigravity-cli, so check it before Gemini tmp.
  if (
    normalized.includes('/antigravity-cli/')
    || (normalized.includes('/.system_generated/logs/transcript.jsonl')
      && normalized.includes('antigravity'))
  ) {
    return 'antigravity'
  }

  if (normalized.includes('/.gemini/tmp/')) {
    return 'gemini'
  }

  if (normalized.includes('/.factory/sessions/')) {
    return 'factory'
  }

  if (normalized.includes('/.clawdbot/sessions/')) {
    return 'clawdbot'
  }

  if (
    normalized.endsWith('/state.vscdb')
    || normalized.includes('/state.vscdb/')
    || normalized.includes('/Cursor/User/globalStorage/')
    || normalized.includes('/Cursor/User/workspaceStorage/')
  ) {
    return 'cursor'
  }

  const parts = normalized.split('/').filter(Boolean)
  const sessionsIndex = parts.lastIndexOf('sessions')
  if (sessionsIndex > 0) {
    const sourceDir = parts[sessionsIndex - 1]
    if (sourceDir !== 'agent') {
      return sourceDir
    }
  }

  return null
}

export function formatShortSessionId(
  sessionId: string | undefined,
  length = SHORT_SESSION_ID_LENGTH,
): string {
  if (!sessionId) {
    return ''
  }

  return sessionId.length <= length ? sessionId : sessionId.slice(0, length)
}

export function isExactSessionIdQuery(rawQuery: string): boolean {
  const query = rawQuery.trim()
  if (!query) {
    return false
  }

  const parsedQuery = parseQuotedQuery(query)
  return parsedQuery.hasPhrases && parsedQuery.phrases.length === 1 && parsedQuery.remainderTokens.length === 0
}

export function normalizeSessionIdQuery(rawQuery: string): string {
  const query = rawQuery.trim()
  if (!query) {
    return ''
  }

  if (isExactSessionIdQuery(query)) {
    return parseQuotedQuery(query).phrases[0].trim().toLowerCase()
  }

  return query.toLowerCase()
}

export function getSessionIdMatchKind(
  sessionId: string | undefined,
  rawQuery: string,
): 'exact' | 'prefix' | null {
  const normalizedSessionId = (sessionId || '').toLowerCase()
  const normalizedQuery = normalizeSessionIdQuery(rawQuery)
  const exactOnly = isExactSessionIdQuery(rawQuery)

  if (!normalizedSessionId || !normalizedQuery) {
    return null
  }

  if (normalizedSessionId === normalizedQuery) {
    return 'exact'
  }

  if (
    !exactOnly &&
    normalizedQuery.length >= MIN_SESSION_ID_PREFIX_LENGTH &&
    normalizedSessionId.startsWith(normalizedQuery)
  ) {
    return 'prefix'
  }

  return null
}
