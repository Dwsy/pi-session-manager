import type {
  PsmAgentThinkingLevel,
  PsmCapabilityClient,
  PsmSideChatAskParams,
  PsmSideChatCitation,
  PsmSideChatResponse,
  PsmSideChatStreamHandlers,
} from '@pi-session-manager/plugin-sdk'

const DEFAULT_SIDECHAT_LIMIT = 6
const MAX_SIDECHAT_LIMIT = 12
const MAX_SNIPPET_CHARS = 700
const MAX_SIDECHAT_CONTEXT_CHARS = 8000
const THINKING_LEVELS = new Set<PsmAgentThinkingLevel>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])

function configuredAgentModel(provider?: string, model?: string) {
  return provider && model ? { provider, id: model } : 'host-default'
}

function configuredThinkingLevel(value?: string): PsmAgentThinkingLevel {
  return THINKING_LEVELS.has(value as PsmAgentThinkingLevel) ? value as PsmAgentThinkingLevel : 'medium'
}

function extractEntryText(entry: unknown) {
  if (!entry || typeof entry !== 'object') return ''
  const message = (entry as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      const candidate = block as { type?: unknown; text?: unknown }
      return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text.trim() : ''
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

function entryStringField(entry: unknown, key: string) {
  return entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>)[key] === 'string'
    ? String((entry as Record<string, unknown>)[key])
    : undefined
}

function tokenizeQuery(question: string) {
  return Array.from(new Set(question.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []))
}

function truncateSnippet(text: string) {
  return text.length > MAX_SNIPPET_CHARS ? `${text.slice(0, MAX_SNIPPET_CHARS)}...` : text
}

function limitSideChatContext(citations: PsmSideChatCitation[]) {
  let total = 0
  const selected: PsmSideChatCitation[] = []
  for (const citation of citations) {
    if (total >= MAX_SIDECHAT_CONTEXT_CHARS) break
    const remaining = MAX_SIDECHAT_CONTEXT_CHARS - total
    const snippet = citation.snippet.length > remaining ? `${citation.snippet.slice(0, Math.max(0, remaining - 3))}...` : citation.snippet
    selected.push({ ...citation, snippet })
    total += snippet.length
  }
  return selected
}

export function selectSideChatSnippets(entries: unknown[], question: string, limit: number): PsmSideChatCitation[] {
  const terms = tokenizeQuery(question)
  const boundedLimit = Math.max(1, Math.min(MAX_SIDECHAT_LIMIT, limit || DEFAULT_SIDECHAT_LIMIT))
  const candidates = entries
    .map<PsmSideChatCitation | null>((entry, index) => {
      const role = entryRole(entry)
      if (role !== 'user' && role !== 'assistant') return null
      const text = extractEntryText(entry)
      if (!text || text.startsWith('[Tool:') || text.startsWith('[Tool Output]')) return null
      const lower = text.toLowerCase()
      const score = terms.length === 0
        ? 0
        : terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0) / terms.length
      return {
        entryId: entryStringField(entry, 'id') ?? `entry-${index}`,
        role,
        timestamp: entryStringField(entry, 'timestamp'),
        snippet: truncateSnippet(text),
        score,
        source: score > 0 ? 'session-entry' : 'recent',
      }
    })
    .filter((candidate): candidate is PsmSideChatCitation => Boolean(candidate))

  const scored = candidates
    .filter((candidate) => (candidate.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, boundedLimit)

  const selected = scored.length > 0 ? scored : candidates.slice(-boundedLimit)
  return limitSideChatContext(selected)
}

function buildSideChatSystemPrompt(language?: string, thinkingLevel?: string) {
  const languageLine = language ? `Respond in the user's UI language: ${language}.` : 'Respond in the same language as the user when possible.'
  const thinkingLine = thinkingLevel && thinkingLevel !== 'off'
    ? `Use ${thinkingLevel} reasoning internally, but keep the final answer concise and directly useful.`
    : 'Keep the answer concise and directly useful.'
  return [
    'You answer questions about one local coding-agent session.',
    'Use only the provided session snippets as evidence. If the snippets are insufficient, say what is missing.',
    'Prefer concrete decisions, blockers, files, commands, and next steps over generic advice.',
    languageLine,
    thinkingLine,
  ].join('\n')
}

function buildSideChatContext(question: string, citations: PsmSideChatCitation[]) {
  const snippets = citations.map((citation, index) => {
    const role = citation.role || 'context'
    const timestamp = citation.timestamp ? ` @ ${citation.timestamp}` : ''
    return `[${index + 1}] ${role}${timestamp}\n${citation.snippet}`
  })
  return [`Question:\n${question}`, '', 'Relevant session snippets:', snippets.join('\n\n')].join('\n')
}

export async function askSideChatWithAgent(
  client: PsmCapabilityClient,
  params: PsmSideChatAskParams,
  handlers?: PsmSideChatStreamHandlers,
): Promise<PsmSideChatResponse> {
  const entries = await client.sessions.readEntries(params.sessionPath)
  const citations = selectSideChatSnippets(entries, params.question, params.limit ?? DEFAULT_SIDECHAT_LIMIT)
  const session = await client.agent.createSession({
    purpose: 'sidechat',
    systemPrompt: buildSideChatSystemPrompt(params.language, params.thinkingLevel),
    model: configuredAgentModel(params.provider, params.model),
    thinkingLevel: configuredThinkingLevel(params.thinkingLevel),
    tools: [],
    storage: { scope: 'memory' },
  })

  try {
    const result = await client.agent.runStream(
      {
        sessionId: session.sessionId,
        prompt: buildSideChatContext(params.question, citations),
      },
      {
        onDelta: handlers?.onDelta,
        onError: handlers?.onError,
      },
    )
    const response: PsmSideChatResponse = {
      answer: result.text,
      citations,
      provider: session.model?.provider,
      model: session.model?.id,
    }
    handlers?.onDone?.(response)
    return response
  } finally {
    await client.agent.dispose(session.sessionId).catch(() => undefined)
  }
}
