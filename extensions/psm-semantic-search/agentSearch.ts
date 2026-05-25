import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

export interface SemanticSearchToolResult {
  tool?: string
  ok?: boolean
  isError?: boolean
  result?: unknown
  error?: unknown
  message?: unknown
}

export interface SemanticSearchAgentSuccess {
  success: true
  sessionId: string
  storageKey?: string
  model?: unknown
  answer: string
  toolResults: SemanticSearchToolResult[]
}

export interface SemanticSearchAgentFailure {
  success: false
  message: string
  results: []
}

export type SemanticSearchAgentResponse = SemanticSearchAgentSuccess | SemanticSearchAgentFailure

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function buildAgentPrompt(args: Record<string, unknown>) {
  const query = optionalString(args.query) ?? ''
  const scope = optionalString(args.scope) ?? 'project'
  const roleFilter = optionalString(args.roleFilter) ?? 'all'
  const timeRange = optionalString(args.timeRange) ?? 'any'
  const maxResults = Math.min(Math.max(optionalNumber(args.maxResults, 10), 1), 50)

  return [
    'Use the available PSM tools to find relevant past sessions.',
    'Search first, inspect the strongest sessions when useful, then return concise ranked results.',
    'Prefer exact session paths from tool results. Do not invent paths.',
    '',
    `Query: ${query}`,
    `Scope: ${scope}`,
    `Role filter: ${roleFilter}`,
    `Time range: ${timeRange}`,
    `Max results: ${maxResults}`,
    '',
    'Return:',
    '1. A one-line answer summary.',
    '2. Ranked matches with session path, matching reason, and why it is relevant.',
    '3. A short next action only when opening a session would be useful.',
  ].join('\n')
}

export function configuredAgentModel(ctx: PsmPluginHostContext) {
  const provider = optionalString(ctx.settings.get('provider', ''))
  const id = optionalString(ctx.settings.get('model', ''))
  return provider && id ? { provider, id } : 'host-default'
}

export async function runSemanticSearchAgent(
  ctx: PsmPluginHostContext,
  args: Record<string, unknown>,
): Promise<SemanticSearchAgentResponse> {
  const query = optionalString(args.query)
  if (!query) {
    return {
      success: false,
      message: 'Query is required',
      results: [],
    }
  }

  const session = await ctx.psm.agent.createSession({
    purpose: 'semantic-search',
    cwd: optionalString(args.cwd),
    model: configuredAgentModel(ctx),
    thinkingLevel: 'medium',
    tools: [
      { name: 'psm.search.fulltext', permission: 'search:read' },
      { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
      { name: 'psm.sessions.open', permission: 'sessions:read' },
    ],
    storage: { scope: 'plugin', key: 'semantic-search' },
  })

  const response = await ctx.psm.agent.run({
    sessionId: session.sessionId,
    prompt: buildAgentPrompt(args),
  })

  return {
    success: true,
    sessionId: session.sessionId,
    storageKey: session.storageKey,
    model: session.model,
    answer: response.text,
    toolResults: response.toolResults ?? [],
  }
}
