import type { SessionEntry, LegacySessionStats, Content } from '@/types'
import { parseQuotedQuery } from './search'

export const SHORT_SESSION_ID_LENGTH = 12
export const MIN_SESSION_ID_PREFIX_LENGTH = 3

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

        return { entries, lineCount: rawItems.length }
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

  return { entries, lineCount }
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
        if (msg.model) {
          const modelName = msg.provider ? `${msg.provider}/${msg.model}` : msg.model
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
    return convertClaudeLineToSessionEntry(raw)
  }

  if (type === 'response_item') {
    return convertCodexResponseItem(raw.payload)
  }

  if (type === 'message') {
    return raw as SessionEntry
  }

  if (
    type === 'session_info' ||
    type === 'label' ||
    type === 'model_change' ||
    type === 'thinking_level_change' ||
    type === 'toolCall' ||
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

  const content = normalizeClaudeContent(message.content)
  const timestamp =
    typeof line.timestamp === 'string' ? line.timestamp : new Date().toISOString()

  return {
    type: 'message',
    id: (line.uuid as string) || generateFallbackId('claude-entry'),
    parentId: line.parentUuid || undefined,
    timestamp,
    message: {
      role,
      content,
      model: typeof message.model === 'string' ? message.model : undefined,
      provider: role === 'assistant' ? 'anthropic' : undefined,
      usage: normalizeTokenUsage(message.usage),
      stopReason:
        typeof message.stop_reason === 'string' ? message.stop_reason : undefined,
    },
  }
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

function convertCodexResponseItem(payload: any): SessionEntry | null {
  if (!payload || typeof payload !== 'object') return null
  const payloadType = payload.type as string | undefined
  if (!payloadType) return null

  if (payloadType === 'message') {
    const rawRole = typeof payload.role === 'string' ? payload.role : 'user'
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
    const timestamp =
      typeof payload.timestamp === 'string'
        ? payload.timestamp
        : new Date().toISOString()
    return {
      type: 'message',
      id: payload.id || generateFallbackId('codex-entry'),
      timestamp,
      message: {
        role,
        content,
        model: role === 'assistant' ? 'gpt-5.4' : undefined,
        provider: role === 'assistant' ? 'openai-codex' : undefined,
      },
    }
  }

  if (payloadType === 'function_call_output') {
    const timestamp =
      typeof payload.timestamp === 'string'
        ? payload.timestamp
        : new Date().toISOString()
    return {
      type: 'message',
      id: payload.call_id || generateFallbackId('codex-tool'),
      timestamp,
      message: {
        role: 'toolResult',
        content: [
          {
            type: 'text',
            text:
              typeof payload.output === 'string'
                ? payload.output
                : JSON.stringify(payload.output),
          },
        ],
      },
    }
  }

  return null
}

function normalizeCodexContent(items: unknown[]): Content[] {
  const content: Content[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, any>
    const type = candidate.type as string | undefined
    switch (type) {
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
        content.push({
          type: 'toolCall',
          id: candidate.call_id,
          name: candidate.name,
          arguments: candidate.arguments,
          text: candidate.name || 'function call',
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

  if (normalized.includes('/.claude/projects')) {
    return 'claude-code'
  }

  if (normalized.includes('/.codex/sessions')) {
    return 'codex'
  }

  if (normalized.includes('/.opencode/') || normalized.includes('/opencode.db')) {
    return 'opencode'
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
