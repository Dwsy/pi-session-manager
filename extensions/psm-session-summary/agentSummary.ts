import type {
  PluginRecord,
  PsmCapabilityClient,
} from '@pi-session-manager/plugin-sdk'

const PLUGIN_ID = 'builtin.session-summary'
const SESSION_INTELLIGENCE_RECORD = 'session.intelligence'
const MAX_CONTEXT_MESSAGES = 60
const MAX_CONTEXT_CHARS = 30000

const SUMMARY_PROMPT = `You are a session analysis assistant. Given a conversation between a user and an AI assistant, produce a JSON object with these fields:

- "summary": A concise 1-3 sentence summary of what was discussed and accomplished
- "topics": An array of 1-5 key topic tags (e.g. "rust", "debugging", "api-design")
- "status": One of "active", "completed", "blocked", "stale", "needs-review"
- "unresolved_tasks": An array of specific tasks/questions that remain unfinished (empty if none)

Respond ONLY with valid JSON, no markdown fences, no explanation.`

interface SessionSummaryResult {
  summary: string
  topics: string[]
  status: string
  unresolved_tasks: string[]
}

export interface RefreshSessionSummaryWithAgentParams {
  path: string
  provider?: string
  model?: string
  language?: string
}

export interface RefreshSessionSummaryStreamHandlers {
  onDelta?: (delta: string) => void
  onDone?: (record: PluginRecord) => void
  onError?: (error: string) => void
}

function configuredAgentModel(provider?: string, model?: string) {
  return provider && model ? { provider, id: model } : 'host-default'
}

function summaryPromptForLanguage(language?: string) {
  const value = language?.trim()
  if (!value) return SUMMARY_PROMPT
  return `${SUMMARY_PROMPT}\n\nWrite all human-readable JSON string values in the user's current UI language: ${value}. Keep JSON field names exactly as specified.`
}

function extractEntryText(entry: unknown) {
  const message = entry && typeof entry === 'object' ? (entry as { message?: unknown }).message : null
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const candidate = part as { text?: unknown }
      const text = typeof candidate.text === 'string' ? candidate.text : ''
      return text.length > 2000 ? `${text.slice(0, 2000)}...[truncated]` : text
    })
    .filter(Boolean)
    .join('\n')
}

function entryRole(entry: unknown) {
  const message = entry && typeof entry === 'object' ? (entry as { message?: unknown }).message : null
  return message && typeof message === 'object' && typeof (message as { role?: unknown }).role === 'string'
    ? (message as { role: string }).role
    : ''
}

function buildSummaryContext(entries: unknown[]) {
  const lines: string[] = []
  let totalChars = 0

  for (const entry of [...entries].reverse()) {
    const role = entryRole(entry)
    if (role !== 'user' && role !== 'assistant') continue

    const text = extractEntryText(entry)
    if (!text) continue

    const line = `${role}: ${text}`
    totalChars += line.length
    if (totalChars > MAX_CONTEXT_CHARS) break
    lines.push(line)

    if (lines.length >= MAX_CONTEXT_MESSAGES) break
  }

  return lines.reverse().join('\n\n')
}

function messageCount(entries: unknown[]) {
  return entries.filter((entry) => entry && typeof entry === 'object' && (entry as { message?: unknown }).message).length
}

function extractJsonPayload(text: string) {
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const start = trimmed.indexOf('\n')
    if (start >= 0) {
      const afterFence = trimmed.slice(start + 1)
      const end = afterFence.lastIndexOf('```')
      return (end >= 0 ? afterFence.slice(0, end) : afterFence).trim()
    }
  }

  if (trimmed.startsWith('{')) return trimmed
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  return start >= 0 && end > start ? trimmed.slice(start, end + 1).trim() : null
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseSummaryResponse(text: string): SessionSummaryResult {
  const json = extractJsonPayload(text)
  if (!json) throw new Error('Session summary response did not contain a JSON object')

  const parsed = JSON.parse(json) as Record<string, unknown>
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const status = typeof parsed.status === 'string' ? parsed.status.trim() : 'needs-review'
  if (!summary) throw new Error('Session summary response did not include summary')

  return {
    summary,
    topics: stringArray(parsed.topics).slice(0, 5),
    status,
    unresolved_tasks: stringArray(parsed.unresolved_tasks),
  }
}

function recordFromSummary(
  path: string,
  summary: SessionSummaryResult,
  provider: string | undefined,
  model: string | undefined,
  count: number,
): PluginRecord {
  const now = new Date().toISOString()
  const payload = {
    summary: summary.summary,
    topics: summary.topics,
    status: summary.status,
    unresolved_tasks: summary.unresolved_tasks,
    unresolvedTasks: summary.unresolved_tasks,
    model_used: model,
    modelUsed: model,
    model,
    provider_used: provider,
    providerUsed: provider,
    provider,
    generated_at: now,
    generatedAt: now,
    message_count: count,
    messageCount: count,
  }

  return {
    id: `${PLUGIN_ID}:${path}`,
    plugin_id: PLUGIN_ID,
    scope_type: 'session',
    scope_id: path,
    record_type: SESSION_INTELLIGENCE_RECORD,
    schema_version: 1,
    payload_json: JSON.stringify(payload),
    payload,
    searchable_text: `${summary.summary} ${summary.topics.join(' ')} ${summary.unresolved_tasks.join(' ')}`,
    created_at: now,
    updated_at: now,
  }
}

export async function refreshSessionSummaryWithAgent(
  client: PsmCapabilityClient,
  params: RefreshSessionSummaryWithAgentParams,
  handlers?: RefreshSessionSummaryStreamHandlers,
): Promise<PluginRecord> {
  const entries = await client.sessions.readEntries(params.path)
  const session = await client.agent.createSession({
    purpose: 'session-summary',
    systemPrompt: summaryPromptForLanguage(params.language),
    model: configuredAgentModel(params.provider, params.model),
    thinkingLevel: 'medium',
    tools: [],
    storage: { scope: 'memory' },
  })

  try {
    const result = await client.agent.runStream(
      {
        sessionId: session.sessionId,
        prompt: buildSummaryContext(entries),
      },
      {
        onDelta: handlers?.onDelta,
      },
    )
    const summary = parseSummaryResponse(result.text)
    const record = recordFromSummary(
      params.path,
      summary,
      session.model?.provider,
      session.model?.id,
      messageCount(entries),
    )
    await client.records.upsert({
      id: record.id,
      pluginId: PLUGIN_ID,
      scopeType: 'session',
      scopeId: params.path,
      recordType: SESSION_INTELLIGENCE_RECORD,
      schemaVersion: 1,
      payload: record.payload,
      searchableText: record.searchable_text ?? undefined,
    })
    handlers?.onDone?.(record)
    return record
  } catch (error) {
    handlers?.onError?.(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    await client.agent.dispose(session.sessionId).catch(() => undefined)
  }
}
