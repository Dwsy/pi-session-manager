import { describe, expect, it, vi } from 'vitest'

import activate, { manifest } from './index'

function createContext() {
  const appViews: unknown[] = []
  const tools = new Map<string, { run(args: Record<string, unknown>): Promise<unknown> | unknown }>()
  const commands = new Map<string, (args: Record<string, unknown>, context?: unknown) => Promise<unknown> | unknown>()
  const createSession = vi.fn(async () => ({
    sessionId: 'agent-1',
    storageScope: 'plugin',
    storageKey: 'builtin.semantic-search:semantic-search',
    model: { provider: 'openai', id: 'gpt-5.5' },
  }))
  const run = vi.fn(async () => ({
    sessionId: 'agent-1',
    text: '1. /repo/session.jsonl - auth fix',
    toolResults: [
      { tool: 'psm.search.fulltext', ok: true, result: { total_hits: 1 } },
      { tool: 'psm.sessions.open', ok: true, result: { opened: true } },
    ],
  }))

  const ctx = {
    i18n: { t: (_key: string, fallback: string) => fallback },
    settings: {
      get: (key: string, fallback: string) => {
        if (key === 'provider') return ''
        if (key === 'model') return ''
        return fallback
      },
    },
    ui: {
      registerAppView: (view: unknown) => appViews.push(view),
    },
    psm: {
      agent: { createSession, run },
    },
    registerTool: (name: string, tool: { run(args: Record<string, unknown>): Promise<unknown> | unknown }) => {
      tools.set(name, tool)
    },
    registerCommand: (name: string, handler: (args: Record<string, unknown>, context?: unknown) => Promise<unknown> | unknown) => {
      commands.set(name, handler)
    },
  }

  activate(ctx as never)
  return { appViews, tools, commands, createSession, run }
}

describe('psm-semantic-search plugin', () => {
  it('declares agent/search/session permissions', () => {
    expect(manifest.permissions).toEqual(['agent:invoke', 'sessions:read', 'search:read', 'model:invoke'])
    expect(manifest.configuration?.properties).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'provider', type: 'model-provider', modelKey: 'model' }),
      expect.objectContaining({ key: 'model', type: 'model-id', providerKey: 'provider' }),
    ]))
  })

  it('registers app view, tool, and commands', () => {
    const { appViews, tools, commands } = createContext()

    expect(appViews).toMatchObject([{ id: 'builtin.semantic-search.view', route: '/semantic-search' }])
    expect([...tools.keys()]).toEqual(['semantic_search'])
    expect([...commands.keys()]).toEqual(['semantic-search.open', 'semantic-search.search'])
  })

  it('runs an end-to-end ReAct search through ctx.psm.agent', async () => {
    const { tools, createSession, run } = createContext()
    const result = await tools.get('semantic_search')?.run({ query: 'auth bug', maxResults: 5 })

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'semantic-search',
      model: 'host-default',
      storage: { scope: 'plugin', key: 'semantic-search' },
      tools: [
        { name: 'psm.search.fulltext', permission: 'search:read' },
        { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
        { name: 'psm.sessions.open', permission: 'sessions:read' },
      ],
    }))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'agent-1',
      prompt: expect.stringContaining('auth bug'),
    }))
    expect(result).toMatchObject({
      success: true,
      sessionId: 'agent-1',
      answer: '1. /repo/session.jsonl - auth fix',
      toolResults: [
        { tool: 'psm.search.fulltext', ok: true },
        { tool: 'psm.sessions.open', ok: true },
      ],
    })
  })

  it('passes configured provider/model settings when both are set', async () => {
    const { tools, createSession } = createContext()
    createSession.mockClear()

    const ctxSettings = {
      get: (key: string, fallback: string) => {
        if (key === 'provider') return 'anthropic'
        if (key === 'model') return 'claude-test'
        return fallback
      },
    }
    const appViews: unknown[] = []
    const toolsWithSettings = new Map<string, { run(args: Record<string, unknown>): Promise<unknown> | unknown }>()
    activate({
      i18n: { t: (_key: string, fallback: string) => fallback },
      settings: ctxSettings,
      ui: { registerAppView: (view: unknown) => appViews.push(view) },
      psm: { agent: { createSession, run: vi.fn(async () => ({ sessionId: 'agent-1', text: 'ok' })) } },
      registerTool: (name: string, tool: { run(args: Record<string, unknown>): Promise<unknown> | unknown }) => {
        toolsWithSettings.set(name, tool)
      },
      registerCommand: vi.fn(),
    } as never)

    await toolsWithSettings.get('semantic_search')?.run({ query: 'auth bug' })

    expect(tools.size).toBe(1)
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: { provider: 'anthropic', id: 'claude-test' },
    }))
  })

  it('returns a structured error for empty query without creating an agent session', async () => {
    const { tools, createSession } = createContext()
    const result = await tools.get('semantic_search')?.run({ query: '   ' })

    expect(createSession).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, message: 'Query is required', results: [] })
  })
})
