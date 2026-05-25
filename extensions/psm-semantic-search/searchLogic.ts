import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

export interface SemanticSearchOptions {
  query: string
  scope: 'project' | 'global'
  projectPath?: string | null
  roleFilter?: 'all' | 'user' | 'assistant'
  timeRange?: 'any' | '24h' | '7d' | '30d'
  maxResults?: number
  enableAiExpansion?: boolean
}

export interface SemanticSearchResult {
  sessionId: string
  sessionPath: string
  sessionName?: string
  entryId: string
  role: string
  content: string
  snippet: string
  timestamp: string
  score: number
  matchReason: string
  projectPath?: string
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[]
  totalHits: number
  expandedQuery?: string
  searchTimeMs: number
}

function buildTimeFilter(range: string): { from?: string; to?: string } {
  if (range === 'any') return {}
  const now = new Date()
  const from = new Date(now)
  switch (range) {
    case '24h':
      from.setDate(now.getDate() - 1)
      break
    case '7d':
      from.setDate(now.getDate() - 7)
      break
    case '30d':
      from.setDate(now.getDate() - 30)
      break
  }
  return { from: from.toISOString() }
}

function truncateSnippet(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

function extractSnippet(content: string, query: string, contextLen = 100): string {
  const lower = content.toLowerCase()
  const queryLower = query.toLowerCase()
  const terms = queryLower.split(/\s+/).filter(Boolean)

  let bestIdx = -1
  let bestScore = 0
  for (const term of terms) {
    const idx = lower.indexOf(term)
    if (idx >= 0) {
      const score = terms.filter(t => lower.substring(Math.max(0, idx - contextLen), idx + contextLen).includes(t)).length
      if (score > bestScore) {
        bestScore = score
        bestIdx = idx
      }
    }
  }

  if (bestIdx < 0) return truncateSnippet(content)

  const start = Math.max(0, bestIdx - contextLen)
  const end = Math.min(content.length, bestIdx + contextLen)
  let snippet = content.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'
  return snippet
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function configuredAgentModel(ctx: PsmPluginHostContext) {
  const provider = optionalString(ctx.settings.get('provider', ''))
  const id = optionalString(ctx.settings.get('model', ''))
  return provider && id ? { provider, id } : 'host-default'
}

export async function expandQueryWithAi(
  ctx: PsmPluginHostContext,
  query: string
): Promise<string[]> {
  let sessionId: string | undefined
  try {
    const session = await ctx.psm.agent.createSession({
      purpose: 'semantic-query-expansion',
      systemPrompt: `You are a search query expansion assistant. Given a user's search query, generate 3-5 related search terms or synonyms that would help find relevant coding session content. Return ONLY a JSON array of strings, nothing else. Example: ["term1", "term2", "term3"]`,
      model: configuredAgentModel(ctx),
      thinkingLevel: 'low',
      tools: [],
      storage: { scope: 'memory' },
    })
    sessionId = session.sessionId
    const response = await ctx.psm.agent.run({
      sessionId,
      prompt: query,
    })
    const text = response.text.trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      return JSON.parse(match[0]) as string[]
    }
  } catch {
    // fallback: use original query
  } finally {
    if (sessionId) await ctx.psm.agent.dispose(sessionId).catch(() => undefined)
  }
  return [query]
}

export async function performSemanticSearch(
  ctx: PsmPluginHostContext,
  options: SemanticSearchOptions
): Promise<SemanticSearchResponse> {
  const startTime = Date.now()
  const {
    query,
    scope,
    projectPath,
    roleFilter = 'all',
    timeRange = 'any',
    maxResults = 20,
    enableAiExpansion = true,
  } = options

  let expandedTerms: string[] = [query]
  let expandedQuery: string | undefined

  if (enableAiExpansion && query.trim().length > 2) {
    const expansions = await expandQueryWithAi(ctx, query)
    if (expansions.length > 1) {
      expandedTerms = expansions
      expandedQuery = expansions.join(', ')
    }
  }

  const timeFilter = buildTimeFilter(timeRange)
  const globPattern = scope === 'project' && projectPath ? `${projectPath}/**` : undefined

  const allHits: SemanticSearchResult[] = []
  const seenKeys = new Set<string>()

  for (const term of expandedTerms) {
    try {
      const response = await ctx.psm.search.fulltext({
        query: term,
        roleFilter,
        globPattern: globPattern ?? undefined,
        projectPath: scope === 'project' ? projectPath ?? undefined : undefined,
        page: 0,
        pageSize: maxResults,
        matchMode: 'smart',
        sortOrder: 'score',
        from: timeFilter.from,
      })

      const hits = (response as { hits?: unknown[] }).hits ?? []
      for (const hit of hits) {
        const h = hit as Record<string, unknown>
        const key = `${h.session_path}:${h.entry_id}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)

        const content = String(h.content ?? '')
        allHits.push({
          sessionId: String(h.session_id ?? ''),
          sessionPath: String(h.session_path ?? ''),
          sessionName: h.session_name ? String(h.session_name) : undefined,
          entryId: String(h.entry_id ?? ''),
          role: String(h.role ?? ''),
          content,
          snippet: extractSnippet(content, query),
          timestamp: String(h.timestamp ?? ''),
          score: Number(h.score ?? 0),
          matchReason: String(h.match_reason ?? 'content'),
          projectPath: h.session_path ? String(h.session_path).split('/').slice(0, -1).join('/') : undefined,
        })
      }
    } catch {
      // continue with next term
    }
  }

  allHits.sort((a, b) => b.score - a.score)
  const results = allHits.slice(0, maxResults)

  return {
    results,
    totalHits: allHits.length,
    expandedQuery,
    searchTimeMs: Date.now() - startTime,
  }
}
