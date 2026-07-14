import { describe, expect, it, vi } from 'vitest'

vi.mock('@lobehub/icons', () => {
  const Icon = () => null
  return {
    Amp: Icon,
    Antigravity: Icon,
    ClaudeCode: Icon,
    Codex: Icon,
    Copilot: Icon,
    Cursor: Icon,
    Devin: Icon,
    Grok: Icon,
    Kimi: Icon,
    Minimax: Icon,
    OpenCode: Icon,
    OpenRouter: Icon,
    Zhipu: Icon,
  }
})

import activate, { manifest } from './index'

describe('psm-agent-usage plugin', () => {
  it('is default-off and declares usage:read', () => {
    expect(manifest.id).toBe('builtin.agent-usage')
    expect(manifest.defaultEnabled).toBe(false)
    expect(manifest.permissions).toContain('usage:read')
  })

  it('registers app view, left list sidebar, and open command', () => {
    const registerAppView = vi.fn()
    const registerAppSidebarView = vi.fn()
    const registerCommand = vi.fn()
    const openAppView = vi.fn()

    activate({
      manifest,
      psm: {
        agentUsage: {
          getStatus: vi.fn(),
        },
      },
      permissions: { pluginId: manifest.id, permissions: ['usage:read'] },
      events: { subscribe: vi.fn(() => () => {}) },
      settings: {
        get: (_key: string, fallback: unknown) => fallback,
        all: () => ({}),
      },
      i18n: {
        language: 'en-US',
        t: (_key: string, fallback: string) => fallback,
      },
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      ui: {
        registerAppView,
        registerAppSidebarView,
        registerSessionToolbarItem: vi.fn(),
        registerSessionPanel: vi.fn(),
        registerSessionTreeView: vi.fn(),
        registerSessionMainView: vi.fn(),
        registerToolRenderer: vi.fn(),
      },
      registerCommand,
      registerTool: vi.fn(),
      registerSessionEntryTransformer: vi.fn(),
    } as any)

    expect(registerAppView).toHaveBeenCalledWith(expect.objectContaining({
      id: 'builtin.agent-usage.view',
      route: '/agent-usage',
      mainContent: 'keep',
    }))
    expect(registerAppSidebarView).toHaveBeenCalledWith(expect.objectContaining({
      id: 'builtin.agent-usage.sidebar',
      appViewId: 'builtin.agent-usage.view',
      route: '/agent-usage',
    }))
    expect(registerCommand).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-usage.open',
    }))

    const command = registerCommand.mock.calls[0]?.[0]
    command.run({}, { navigate: { openAppView } })
    expect(openAppView).toHaveBeenCalledWith('builtin.agent-usage.view')
  })
})
