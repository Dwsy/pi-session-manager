import { createAssistantMessageEventStream, type AssistantMessage, type Usage } from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { describe, expect, it, vi } from 'vitest'

import {
  createPsmAgentBridge,
  createPsmAgentHostModelResolver,
} from '../agentBridge'
import type { PsmTransport } from '@pi-session-manager/plugin-sdk'

const usage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function assistant(content: AssistantMessage['content'], stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'test',
    provider: 'openai',
    model: 'gpt-5.5',
    usage,
    stopReason,
    timestamp: Date.now(),
  }
}

function streamDone(message: AssistantMessage, reason: 'stop' | 'toolUse' = 'stop') {
  const stream = createAssistantMessageEventStream()
  stream.push({ type: 'done', reason, message })
  return stream
}

function streamTextDelta(text: string) {
  const stream = createAssistantMessageEventStream()
  const empty = assistant([{ type: 'text', text: '' }])
  const full = assistant([{ type: 'text', text }])
  stream.push({ type: 'start', partial: empty })
  stream.push({ type: 'text_start', contentIndex: 0, partial: empty })
  stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: full })
  stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: full })
  stream.push({ type: 'done', reason: 'stop', message: full })
  return stream
}

describe('createPsmAgentBridge', () => {
  it('creates a plugin-scoped Pi Agent session with the host-resolved model', async () => {
    const createAgent = vi.fn((options) => ({
      state: {
        messages: [],
        isStreaming: false,
      },
      prompt: vi.fn(),
      steer: vi.fn(),
      followUp: vi.fn(),
      abort: vi.fn(),
      waitForIdle: vi.fn(),
      reset: vi.fn(),
      _options: options,
    } as never))

    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke', 'search:read', 'sessions:read'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn: (() => streamDone(assistant([{ type: 'text', text: 'done' }]))) as StreamFn,
      createAgent,
    })

    const handle = await bridge.createSession({
      purpose: 'semantic-search',
      cwd: '/repo',
      model: 'host-default',
      thinkingLevel: 'medium',
      tools: [
        { name: 'psm.search.fulltext', permission: 'search:read' },
        { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
      ],
      storage: { scope: 'plugin', key: 'semantic-search' },
    })

    expect(handle).toMatchObject({
      storageScope: 'plugin',
      storageKey: 'builtin.semantic-search:semantic-search',
      model: { provider: 'openai', id: 'gpt-5.5' },
    })
    expect(handle.sessionId).toMatch(/^psm-agent:builtin\.semantic-search:/)
    expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: handle.sessionId,
      initialState: expect.objectContaining({
        systemPrompt: '',
        thinkingLevel: 'medium',
        model: expect.objectContaining({ provider: 'openai', id: 'gpt-5.5' }),
      }),
    }))
  })

  it('uses an explicit provider/model before consulting host defaults', async () => {
    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke'],
      resolveHostModel: async () => {
        throw new Error('should not resolve host model')
      },
      streamFn: (() => streamDone(assistant([{ type: 'text', text: 'done' }]))) as StreamFn,
    })

    const handle = await bridge.createSession({
      purpose: 'semantic-search',
      model: { provider: 'anthropic', id: 'claude-test' },
      tools: [],
      storage: { scope: 'memory' },
    })

    expect(handle).toMatchObject({
      storageScope: 'memory',
      model: { provider: 'anthropic', id: 'claude-test' },
    })
    expect(handle.storageKey).toBeUndefined()
  })

  it('rejects agent creation without required permissions', async () => {
    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['model:invoke', 'search:read'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn: (() => streamDone(assistant([{ type: 'text', text: 'done' }]))) as StreamFn,
    })

    await expect(bridge.createSession({
      purpose: 'semantic-search',
      tools: [{ name: 'psm.search.fulltext', permission: 'search:read' }],
      storage: { scope: 'plugin' },
    })).rejects.toThrow('Plugin permission denied')
  })

  it('rejects tools whose required permission is missing', async () => {
    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn: (() => streamDone(assistant([{ type: 'text', text: 'done' }]))) as StreamFn,
    })

    await expect(bridge.createSession({
      purpose: 'semantic-search',
      tools: [{ name: 'psm.search.fulltext', permission: 'search:read' }],
      storage: { scope: 'plugin' },
    })).rejects.toThrow('missing tool permission')
  })

  it('runs the upstream Pi Agent and returns controlled tool results', async () => {
    const fulltext = vi.fn(async () => ({
      hits: [{ session_path: '/repo/session.jsonl', entry_id: 'entry-1' }],
      total_hits: 1,
      has_more: false,
    }))
    const readEntries = vi.fn(async () => [{ id: 'entry-1', content: 'auth fix' }])
    const streamFn = vi.fn((_model, context) => {
      const hasToolResult = context.messages.some((message) => message.role === 'toolResult')
      if (hasToolResult) {
        return streamDone(assistant([{ type: 'text', text: '1. /repo/session.jsonl - auth fix' }]))
      }
      return streamDone(assistant([
        {
          type: 'toolCall',
          id: 'call-search',
          name: 'psm.search.fulltext',
          arguments: { query: 'auth', pageSize: 5 },
        },
        {
          type: 'toolCall',
          id: 'call-read',
          name: 'psm.sessions.readEntries',
          arguments: { sessionPath: '/repo/session.jsonl', limit: 1 },
        },
      ], 'toolUse'), 'toolUse')
    }) as StreamFn

    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke', 'search:read', 'sessions:read'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn,
      capabilities: {
        search: { fulltext },
        sessions: {
          readEntries,
          open: async () => {},
        },
      },
    })

    const handle = await bridge.createSession({
      purpose: 'semantic-search',
      tools: [
        { name: 'psm.search.fulltext', permission: 'search:read' },
        { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
      ],
      storage: { scope: 'plugin' },
    })
    const result = await bridge.run({ sessionId: handle.sessionId, prompt: 'find auth sessions' })

    expect(fulltext).toHaveBeenCalledWith(expect.objectContaining({ query: 'auth', pageSize: 5 }))
    expect(readEntries).toHaveBeenCalledWith('/repo/session.jsonl', { limit: 1 })
    expect(result).toMatchObject({
      sessionId: handle.sessionId,
      text: '1. /repo/session.jsonl - auth fix',
      toolResults: [
        { tool: 'psm.search.fulltext', ok: true, result: { total_hits: 1 } },
        { tool: 'psm.sessions.readEntries', ok: true, result: [{ id: 'entry-1', content: 'auth fix' }] },
      ],
    })
  })

  it('returns Pi tool errors when a controlled tool fails validation', async () => {
    const streamFn = vi.fn((_model, context) => {
      const hasToolResult = context.messages.some((message) => message.role === 'toolResult')
      if (hasToolResult) {
        return streamDone(assistant([{ type: 'text', text: 'no results' }]))
      }
      return streamDone(assistant([
        {
          type: 'toolCall',
          id: 'call-search',
          name: 'psm.search.fulltext',
          arguments: { query: '' },
        },
      ], 'toolUse'), 'toolUse')
    }) as StreamFn

    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke', 'search:read'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn,
      capabilities: {
        search: {
          fulltext: async () => ({ hits: [], total_hits: 0, has_more: false }),
        },
      },
    })

    const handle = await bridge.createSession({
      purpose: 'semantic-search',
      tools: [{ name: 'psm.search.fulltext', permission: 'search:read' }],
      storage: { scope: 'plugin' },
    })
    const result = await bridge.run({ sessionId: handle.sessionId, prompt: 'find sessions' })

    expect(result.toolResults?.[0]).toMatchObject({
      tool: 'psm.search.fulltext',
      ok: false,
      isError: true,
    })
  })

  it('adapts the PSM model stream transport when no test streamFn is injected', async () => {
    const stream = vi.fn((_command, payload, handlers) => {
      handlers.onEvent?.({
        type: 'done',
        response: { text: 'transport done', provider: 'openai', model: 'gpt-5.5' },
      })
      return Promise.resolve({ text: 'transport done' })
    })
    const transport: PsmTransport = {
      invoke: vi.fn(),
      stream,
    }

    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke'],
      transport,
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
    })

    const handle = await bridge.createSession({ purpose: 'semantic-search', tools: [], storage: { scope: 'plugin' } })
    const result = await bridge.run({ sessionId: handle.sessionId, prompt: 'hello' })

    expect(result.text).toBe('transport done')
    expect(stream).toHaveBeenCalledWith(
      'invoke_model_text_stream',
      expect.objectContaining({
        protocol: 'pi-agent',
        provider: 'openai',
        model: 'gpt-5.5',
        prompt: 'hello',
      }),
      expect.any(Object),
    )
  })

  it('streams text deltas from the upstream Pi Agent run', async () => {
    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.sidechat',
      permissions: ['agent:invoke', 'model:invoke'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn: (() => streamTextDelta('hello from agent')) as StreamFn,
    })

    const handle = await bridge.createSession({ purpose: 'sidechat', tools: [], storage: { scope: 'memory' } })
    const deltas: string[] = []
    const result = await bridge.runStream(
      { sessionId: handle.sessionId, prompt: 'hello' },
      { onDelta: (delta) => deltas.push(delta) },
    )

    expect(result.text).toBe('hello from agent')
    expect(deltas).toEqual(['hello from agent'])
  })

  it('delegates abort and dispose to the upstream Agent instance', async () => {
    const runtime = {
      state: {
        messages: [],
        isStreaming: false,
      },
      prompt: vi.fn(),
      steer: vi.fn(),
      followUp: vi.fn(),
      abort: vi.fn(),
      waitForIdle: vi.fn(),
      reset: vi.fn(),
    }
    const bridge = createPsmAgentBridge({
      pluginId: 'builtin.semantic-search',
      permissions: ['agent:invoke', 'model:invoke'],
      resolveHostModel: async () => ({ provider: 'openai', id: 'gpt-5.5' }),
      streamFn: (() => streamDone(assistant([{ type: 'text', text: 'done' }]))) as StreamFn,
      createAgent: () => runtime as never,
    })

    const handle = await bridge.createSession({ purpose: 'semantic-search', tools: [], storage: { scope: 'plugin' } })
    await bridge.abort(handle.sessionId)
    await bridge.dispose(handle.sessionId)
    await bridge.dispose(handle.sessionId)

    expect(runtime.abort).toHaveBeenCalledTimes(2)
    expect(runtime.waitForIdle).toHaveBeenCalledTimes(2)
    expect(runtime.reset).toHaveBeenCalledTimes(1)
  })
})

describe('createPsmAgentHostModelResolver', () => {
  it('uses load_pi_settings_full defaultProvider/defaultModel first', async () => {
    const transport: PsmTransport = {
      invoke: vi.fn(async (command) => {
        if (command === 'load_pi_settings_full') return { defaultProvider: 'anthropic', defaultModel: 'claude-test' }
        throw new Error('should not list models')
      }),
    }

    await expect(createPsmAgentHostModelResolver(transport)()).resolves.toEqual({
      provider: 'anthropic',
      id: 'claude-test',
    })
  })

  it('falls back to list_model_options_fast and returns undefined when no model exists', async () => {
    const transport: PsmTransport = {
      invoke: vi.fn(async (command) => {
        if (command === 'load_pi_settings_full') return {}
        if (command === 'list_model_options_fast') return [{ provider: 'openai', model: 'gpt-5.5' }]
        throw new Error(`unexpected command: ${command}`)
      }),
    }
    await expect(createPsmAgentHostModelResolver(transport)()).resolves.toEqual({ provider: 'openai', id: 'gpt-5.5' })

    const emptyTransport: PsmTransport = {
      invoke: vi.fn(async () => []),
    }
    await expect(createPsmAgentHostModelResolver(emptyTransport)()).resolves.toBeUndefined()
  })
})
