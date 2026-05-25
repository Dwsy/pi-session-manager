import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentOptions,
  type AgentTool,
  type StreamFn,
  type ThinkingLevel,
} from '@earendil-works/pi-agent-core'
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Message,
  type Model,
  type TextContent,
  type ToolResultMessage,
  type Usage,
} from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'
import type {
  PsmAgentCreateSessionParams,
  PsmAgentRunParams,
  PsmAgentRunResult,
  PsmAgentRunStreamHandlers,
  PsmAgentSessionHandle,
  PsmAgentStorageScope,
  PsmAiTextResponse,
  PsmFullTextSearchParams,
  PsmPermission,
  PsmSessionOpenOptions,
  PsmTransport,
} from '@pi-session-manager/plugin-sdk'

export interface PsmAgentModelRef {
  provider?: string
  id?: string
}

export interface PsmAgentRuntimeTool {
  name: string
  description: string
  parameters?: Record<string, unknown>
  run(args: Record<string, unknown>): Promise<PsmAgentToolRunResult>
}

export interface PsmAgentToolRunResult {
  ok: boolean
  result?: unknown
  error?: {
    code: string
    message: string
  }
}

export interface PsmAgentBridgeCapabilities {
  search?: {
    fulltext(params: PsmFullTextSearchParams): Promise<unknown>
  }
  sessions?: {
    readEntries(sessionPath: string, options?: { limit?: number }): Promise<unknown>
    open(sessionPath: string, options?: PsmSessionOpenOptions): Promise<void>
  }
}

type PsmAgentRuntime = Pick<Agent, 'prompt' | 'steer' | 'followUp' | 'abort' | 'waitForIdle' | 'reset' | 'subscribe'> & {
  state: Agent['state']
}

export interface PsmAgentBridgeOptions {
  pluginId: string
  permissions: PsmPermission[]
  transport?: PsmTransport
  resolveHostModel?: () => Promise<PsmAgentModelRef | undefined>
  createAgent?: (options: AgentOptions) => PsmAgentRuntime
  streamFn?: StreamFn
  capabilities?: PsmAgentBridgeCapabilities
}

export interface PsmAgentBridge {
  createSession(params: PsmAgentCreateSessionParams): Promise<PsmAgentSessionHandle>
  run(params: PsmAgentRunParams): Promise<PsmAgentRunResult>
  runStream(params: PsmAgentRunParams, handlers?: PsmAgentRunStreamHandlers): Promise<PsmAgentRunResult>
  abort(sessionId: string): Promise<void>
  dispose(sessionId: string): Promise<void>
}

interface ActiveAgentSession {
  sessionId: string
  agent: PsmAgentRuntime
  model: PsmAgentModelRef
  storageScope: PsmAgentStorageScope
  storageKey?: string
}

interface PiSettingsLike {
  defaultProvider?: string
  defaultModel?: string
}

interface ModelOptionLike {
  provider?: string
  model?: string
}

type LegacyModelStreamEvent =
  | { type: 'delta'; delta?: string }
  | { type: 'done'; response?: PsmAiTextResponse }
  | { type: 'error'; error?: string }

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function assertPermission(pluginId: string, permissions: Set<PsmPermission>, required: PsmPermission, reason = 'permission') {
  if (permissions.has(required)) return
  throw new Error(`Plugin permission denied: ${pluginId} missing ${reason} ${required}`)
}

function pluginStorageKey(pluginId: string, params: PsmAgentCreateSessionParams) {
  const key = params.storage?.key || params.purpose
  return `${pluginId}:${key}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireModelPart(value: unknown, part: 'provider' | 'id') {
  const text = optionalString(value)
  if (!text) {
    throw new Error(`PSM agent model requires ${part}`)
  }
  return text
}

export function createPsmAgentHostModelResolver(transport: PsmTransport): () => Promise<PsmAgentModelRef | undefined> {
  return async () => {
    const settings = await transport.invoke<PiSettingsLike>('load_pi_settings_full').catch(() => undefined)
    const defaultProvider = optionalString(settings?.defaultProvider)
    const defaultModel = optionalString(settings?.defaultModel)
    if (defaultProvider && defaultModel) {
      return { provider: defaultProvider, id: defaultModel }
    }

    const options = await transport.invoke<ModelOptionLike[]>('list_model_options_fast').catch(() => [])
    const first = options.find((option) => optionalString(option.provider) && optionalString(option.model))
    if (first) {
      return { provider: first.provider, id: first.model }
    }

    return undefined
  }
}

async function resolveModel(
  requested: PsmAgentCreateSessionParams['model'],
  resolveHostModel: () => Promise<PsmAgentModelRef | undefined>,
): Promise<PsmAgentModelRef> {
  if (requested && requested !== 'host-default') {
    return {
      provider: requireModelPart(requested.provider, 'provider'),
      id: requireModelPart(requested.id, 'id'),
    }
  }

  const model = await resolveHostModel()
  const provider = optionalString(model?.provider)
  const id = optionalString(model?.id)
  if (provider && id) {
    return { provider, id }
  }

  throw new Error('No Pi model is configured for PSM agent. Configure a default model or select one in the plugin settings.')
}

function ok(result: unknown): PsmAgentToolRunResult {
  return { ok: true, result }
}

function invalid(message: string): PsmAgentToolRunResult {
  return { ok: false, error: { code: 'invalid_arguments', message } }
}

function unavailable(name: string): PsmAgentToolRunResult {
  return { ok: false, error: { code: 'capability_unavailable', message: `${name} is not available` } }
}

function createSearchTool(capabilities?: PsmAgentBridgeCapabilities): PsmAgentRuntimeTool {
  return {
    name: 'psm.search.fulltext',
    description: 'Search PSM session content with full-text relevance ranking.',
    parameters: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        roleFilter: { type: 'string' },
        globPattern: { type: 'string' },
        projectPath: { type: 'string' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        matchMode: { type: 'string' },
        sortOrder: { type: 'string' },
        sourceFilter: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
    async run(args) {
      const query = optionalString(args.query)
      if (!query) return invalid('query is required')
      if (!capabilities?.search?.fulltext) return unavailable('psm.search.fulltext')
      const result = await capabilities.search.fulltext({
        query,
        roleFilter: optionalString(args.roleFilter),
        globPattern: optionalString(args.globPattern),
        projectPath: optionalString(args.projectPath),
        page: optionalNumber(args.page),
        pageSize: optionalNumber(args.pageSize),
        matchMode: optionalString(args.matchMode) ?? 'smart',
        sortOrder: optionalString(args.sortOrder) ?? 'score',
        sourceFilter: optionalString(args.sourceFilter),
        from: optionalString(args.from),
        to: optionalString(args.to),
      })
      return ok(result)
    },
  }
}

function createReadEntriesTool(capabilities?: PsmAgentBridgeCapabilities): PsmAgentRuntimeTool {
  return {
    name: 'psm.sessions.readEntries',
    description: 'Read entries from a PSM session file.',
    parameters: {
      type: 'object',
      required: ['sessionPath'],
      additionalProperties: false,
      properties: {
        sessionPath: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    async run(args) {
      const sessionPath = optionalString(args.sessionPath)
      if (!sessionPath) return invalid('sessionPath is required')
      if (!capabilities?.sessions?.readEntries) return unavailable('psm.sessions.readEntries')
      return ok(await capabilities.sessions.readEntries(sessionPath, { limit: optionalNumber(args.limit) }))
    },
  }
}

function createOpenSessionTool(capabilities?: PsmAgentBridgeCapabilities): PsmAgentRuntimeTool {
  return {
    name: 'psm.sessions.open',
    description: 'Open a PSM session in the application or terminal.',
    parameters: {
      type: 'object',
      required: ['sessionPath'],
      additionalProperties: false,
      properties: {
        sessionPath: { type: 'string' },
        target: { type: 'string', enum: ['browser', 'terminal'] },
      },
    },
    async run(args) {
      const sessionPath = optionalString(args.sessionPath)
      if (!sessionPath) return invalid('sessionPath is required')
      if (!capabilities?.sessions?.open) return unavailable('psm.sessions.open')
      const target = args.target === 'terminal' ? 'terminal' : 'browser'
      await capabilities.sessions.open(sessionPath, { target })
      return ok({ opened: true })
    },
  }
}

function createRuntimeTools(params: PsmAgentCreateSessionParams, capabilities?: PsmAgentBridgeCapabilities): PsmAgentRuntimeTool[] {
  const byName: Record<string, () => PsmAgentRuntimeTool> = {
    'psm.search.fulltext': () => createSearchTool(capabilities),
    'psm.sessions.readEntries': () => createReadEntriesTool(capabilities),
    'psm.sessions.open': () => createOpenSessionTool(capabilities),
  }
  return params.tools.map((tool) => byName[tool.name]?.()).filter((tool): tool is PsmAgentRuntimeTool => Boolean(tool))
}

function stringifyToolResult(result: unknown) {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

function toAgentTool(tool: PsmAgentRuntimeTool): AgentTool<TSchema, PsmAgentToolRunResult> {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: (tool.parameters ?? { type: 'object', additionalProperties: true }) as TSchema,
    prepareArguments(args) {
      return (isRecord(args) ? args : {}) as never
    },
    async execute(_toolCallId, args) {
      const result = await tool.run(isRecord(args) ? args : {})
      if (!result.ok) {
        const error = result.error
        throw new Error(error ? `${error.code}: ${error.message}` : `${tool.name} failed`)
      }
      return {
        content: [{ type: 'text', text: stringifyToolResult(result.result) }],
        details: {
          tool: tool.name,
          ok: true,
          result: result.result,
        },
      }
    },
  }
}

function toPiAgentTools(tools: PsmAgentRuntimeTool[]): AgentTool<TSchema, PsmAgentToolRunResult>[] {
  return tools.map(toAgentTool)
}

function toPiModel(model: PsmAgentModelRef): Model<string> {
  const id = requireModelPart(model.id, 'id')
  const provider = requireModelPart(model.provider, 'provider')
  return {
    id,
    name: id,
    api: 'psm-agent',
    provider,
    baseUrl: '',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 0,
    maxTokens: 0,
  }
}

function normalizeThinkingLevel(value: PsmAgentCreateSessionParams['thinkingLevel']): ThinkingLevel {
  return value ?? 'off'
}

function sessionIdFor(pluginId: string) {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `psm-agent:${pluginId}:${randomId}`
}

function textContent(content: Message['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((part): part is TextContent => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function promptFromContext(context: Context): string {
  const lastUser = [...context.messages].reverse().find((message) => message.role === 'user')
  if (lastUser) return textContent(lastUser.content)
  return context.messages.map((message) => `${message.role}: ${textContent(message.content)}`).join('\n\n')
}

function createAssistantMessage(model: PsmAgentModelRef, text: string, stopReason: AssistantMessage['stopReason'] = 'stop', errorMessage?: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'psm-agent',
    provider: requireModelPart(model.provider, 'provider'),
    model: requireModelPart(model.id, 'id'),
    usage: EMPTY_USAGE,
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  }
}

function isAssistantStreamEvent(event: unknown): event is AssistantMessageEvent {
  if (!isRecord(event) || typeof event.type !== 'string') return false
  if (event.type === 'done') return isRecord(event.message)
  if (event.type === 'error') return isRecord(event.error)
  return ['start', 'text_start', 'text_delta', 'text_end', 'thinking_start', 'thinking_delta', 'thinking_end', 'toolcall_start', 'toolcall_delta', 'toolcall_end'].includes(event.type)
}

function isLegacyStreamEvent(event: unknown): event is LegacyModelStreamEvent {
  return isRecord(event)
    && (
      event.type === 'delta'
      || (event.type === 'done' && 'response' in event)
      || (event.type === 'error' && typeof event.error === 'string')
    )
}

function pushLegacyStreamEvent(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: PsmAgentModelRef,
  event: LegacyModelStreamEvent,
  state: { text: string; started: boolean },
) {
  if (event.type === 'delta') {
    const delta = event.delta ?? ''
    if (!state.started) {
      const partial = createAssistantMessage(model, '')
      stream.push({ type: 'start', partial })
      stream.push({ type: 'text_start', contentIndex: 0, partial })
      state.started = true
    }
    state.text += delta
    const partial = createAssistantMessage(model, state.text)
    stream.push({ type: 'text_delta', contentIndex: 0, delta, partial })
    return
  }

  if (event.type === 'done') {
    const response = event.response
    const text = response?.text ?? state.text
    const finalModel = {
      provider: optionalString(response?.provider) ?? model.provider,
      id: optionalString(response?.model) ?? model.id,
    }
    if (state.started) {
      stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: createAssistantMessage(finalModel, text) })
    }
    stream.push({ type: 'done', reason: 'stop', message: createAssistantMessage(finalModel, text) })
    return
  }

  const message = event.error || 'PSM agent model stream failed'
  stream.push({ type: 'error', reason: 'error', error: createAssistantMessage(model, '', 'error', message) })
}

function pushStreamError(stream: ReturnType<typeof createAssistantMessageEventStream>, model: PsmAgentModelRef, message: string, aborted = false) {
  stream.push({
    type: 'error',
    reason: aborted ? 'aborted' : 'error',
    error: createAssistantMessage(model, '', aborted ? 'aborted' : 'error', message),
  })
}

function createPsmStreamFn(transport: PsmTransport, modelRef: PsmAgentModelRef): StreamFn {
  return (_model, context, options) => {
    const stream = createAssistantMessageEventStream()
    const legacyState = { text: '', started: false }
    let complete = false
    const finish = () => {
      complete = true
      options?.signal?.removeEventListener('abort', abortListener)
    }
    const abortListener = () => {
      if (!complete) {
        finish()
        pushStreamError(stream, modelRef, 'Operation aborted', true)
      }
    }

    if (options?.signal?.aborted) {
      pushStreamError(stream, modelRef, 'Operation aborted', true)
      return stream
    }
    options?.signal?.addEventListener('abort', abortListener, { once: true })

    const payload = {
      protocol: 'pi-agent',
      systemPrompt: context.systemPrompt ?? '',
      prompt: promptFromContext(context),
      provider: modelRef.provider,
      model: modelRef.id,
      reasoning: options?.reasoning,
      messages: context.messages,
      tools: context.tools,
    }

    const streamed = transport.stream?.<AssistantMessageEvent | LegacyModelStreamEvent, unknown>('invoke_model_text_stream', payload, {
      onEvent(event) {
        if (complete) return
        if (isLegacyStreamEvent(event)) {
          pushLegacyStreamEvent(stream, modelRef, event, legacyState)
          if (event.type === 'done' || event.type === 'error') finish()
          return
        }
        if (isAssistantStreamEvent(event)) {
          stream.push(event)
          if (event.type === 'done' || event.type === 'error') finish()
        }
      },
      onError(error) {
        if (complete) return
        finish()
        pushStreamError(stream, modelRef, error)
      },
    })

    if (streamed) {
      void streamed.catch((error) => {
        if (complete) return
        finish()
        pushStreamError(stream, modelRef, error instanceof Error ? error.message : String(error))
      })
      return stream
    }

    void transport.invoke<PsmAiTextResponse>('invoke_model_text', payload).then((response) => {
      if (complete) return
      pushLegacyStreamEvent(stream, modelRef, { type: 'done', response }, legacyState)
      finish()
    }).catch((error) => {
      if (complete) return
      finish()
      pushStreamError(stream, modelRef, error instanceof Error ? error.message : String(error))
    })

    return stream
  }
}

function assistantText(message: AgentMessage): string {
  if (!isRecord(message) || message.role !== 'assistant') return ''
  return message.content
    .filter((part): part is TextContent => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function toolResultText(message: ToolResultMessage): string {
  return message.content
    .filter((part): part is TextContent => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function toolResultSummary(message: ToolResultMessage) {
  const details = isRecord(message.details) ? message.details : {}
  return {
    tool: message.toolName,
    toolCallId: message.toolCallId,
    ok: !message.isError,
    content: toolResultText(message),
    ...details,
    isError: message.isError,
  }
}

function runResult(sessionId: string, messages: AgentMessage[]): PsmAgentRunResult {
  const assistantMessages = messages.filter((message) => isRecord(message) && message.role === 'assistant')
  const lastAssistant = assistantMessages[assistantMessages.length - 1]
  const toolResults = messages
    .filter((message): message is ToolResultMessage => isRecord(message) && message.role === 'toolResult')
    .map(toolResultSummary)

  return {
    sessionId,
    text: lastAssistant ? assistantText(lastAssistant) : assistantMessages.map(assistantText).filter(Boolean).join('\n\n'),
    toolResults,
  }
}

function createUserMessage(text: string): Extract<Message, { role: 'user' }> {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
  }
}

function agentEventTextDelta(event: AgentEvent): string | undefined {
  if (event.type !== 'message_update') return undefined
  const messageEvent = event.assistantMessageEvent
  return messageEvent.type === 'text_delta' ? messageEvent.delta : undefined
}

async function runAgentSession(session: ActiveAgentSession, params: PsmAgentRunParams) {
  const before = session.agent.state.messages.length
  if (session.agent.state.isStreaming) {
    const message = createUserMessage(params.prompt)
    if (params.streamingBehavior === 'followUp') {
      session.agent.followUp(message)
    } else {
      session.agent.steer(message)
    }
    await session.agent.waitForIdle()
  } else {
    await session.agent.prompt(params.prompt)
  }

  return session.agent.state.messages.slice(before)
}

export function createPsmAgentBridgeCapabilities(transport: PsmTransport): PsmAgentBridgeCapabilities {
  return {
    search: {
      fulltext(params) {
        return transport.invoke('full_text_search', {
          query: params.query,
          roleFilter: params.roleFilter ?? 'all',
          globPattern: params.globPattern,
          projectPath: params.projectPath,
          page: params.page ?? 0,
          pageSize: params.pageSize ?? 20,
          matchMode: params.matchMode,
          sortOrder: params.sortOrder,
          sourceFilter: params.sourceFilter,
          from: params.from,
          to: params.to,
        })
      },
    },
    sessions: {
      async readEntries(sessionPath, options) {
        const entries = await transport.invoke<unknown[]>('get_session_entries', { path: sessionPath })
        return options?.limit === undefined ? entries : entries.slice(0, options.limit)
      },
      async open(sessionPath, options) {
        if (options?.target === 'terminal') {
          await transport.invoke('open_session_in_terminal', { path: sessionPath })
          return
        }
        await transport.invoke('open_session_in_browser', { path: sessionPath })
      },
    },
  }
}

export function createPsmAgentBridge(options: PsmAgentBridgeOptions): PsmAgentBridge {
  const permissions = new Set(options.permissions)
  const sessions = new Map<string, ActiveAgentSession>()
  const createAgent = options.createAgent ?? ((agentOptions: AgentOptions) => new Agent(agentOptions))

  return {
    async createSession(params) {
      assertPermission(options.pluginId, permissions, 'agent:invoke')
      assertPermission(options.pluginId, permissions, 'model:invoke')
      for (const tool of params.tools) {
        assertPermission(options.pluginId, permissions, tool.permission, 'tool permission')
      }

      const resolveHostModel = options.resolveHostModel ?? (
        options.transport ? createPsmAgentHostModelResolver(options.transport) : async () => undefined
      )
      const model = await resolveModel(params.model, resolveHostModel)
      const storageScope = params.storage?.scope ?? 'plugin'
      const storageKey = storageScope === 'plugin' ? pluginStorageKey(options.pluginId, params) : undefined
      const sessionId = sessionIdFor(options.pluginId)
      const streamFn = options.streamFn ?? (
        options.transport ? createPsmStreamFn(options.transport, model) : undefined
      )

      if (!streamFn) {
        throw new Error('PSM agent bridge requires a model stream transport')
      }

      const agent = createAgent({
        sessionId,
        streamFn,
        initialState: {
          systemPrompt: params.systemPrompt ?? '',
          model: toPiModel(model),
          thinkingLevel: normalizeThinkingLevel(params.thinkingLevel),
          tools: toPiAgentTools(createRuntimeTools(params, options.capabilities)),
        },
      })

      sessions.set(sessionId, {
        sessionId,
        agent,
        model,
        storageScope,
        storageKey,
      })

      return {
        sessionId,
        storageScope,
        storageKey,
        model,
      }
    },

    async run(params) {
      const session = sessions.get(params.sessionId)
      if (!session) throw new Error(`PSM agent session not found: ${params.sessionId}`)

      const messages = await runAgentSession(session, params)
      return runResult(session.sessionId, messages)
    },

    async runStream(params, handlers) {
      const session = sessions.get(params.sessionId)
      if (!session) throw new Error(`PSM agent session not found: ${params.sessionId}`)

      let receivedDelta = false
      const unsubscribe = session.agent.subscribe((event) => {
        const delta = agentEventTextDelta(event)
        if (!delta) return
        receivedDelta = true
        handlers?.onDelta?.(delta)
      })

      try {
        const messages = await runAgentSession(session, params)
        const result = runResult(session.sessionId, messages)
        if (!receivedDelta && result.text) handlers?.onDelta?.(result.text)
        handlers?.onDone?.(result)
        return result
      } catch (error) {
        handlers?.onError?.(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        unsubscribe()
      }
    },

    async abort(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`PSM agent session not found: ${sessionId}`)
      session.agent.abort()
      await session.agent.waitForIdle()
    },

    async dispose(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) return
      sessions.delete(sessionId)
      session.agent.abort()
      await session.agent.waitForIdle()
      session.agent.reset()
    },
  }
}
