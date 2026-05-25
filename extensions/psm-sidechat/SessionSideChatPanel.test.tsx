// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SessionSideChatPanel from './SessionSideChatPanel'

const mocks = {
  listOptions: vi.fn(),
  readEntries: vi.fn(),
  createSession: vi.fn(),
  runStream: vi.fn(),
  dispose: vi.fn(),
  listForScope: vi.fn(),
  upsert: vi.fn(),
}

const client = {
  models: {
    listOptions: mocks.listOptions,
  },
  sessions: {
    readEntries: mocks.readEntries,
  },
  agent: {
    createSession: mocks.createSession,
    runStream: mocks.runStream,
    dispose: mocks.dispose,
  },
  records: {
    listForScope: mocks.listForScope,
    upsert: mocks.upsert,
  },
}

const i18n = {
  language: 'en-US',
  t: (_key: string, fallback: string, options?: Record<string, unknown>) => {
    if (!options) return fallback
    return fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ''))
  },
}

const defaultSettings = {
  provider: '',
  model: '',
  thinkingLevel: 'medium',
  snippetLimit: 8,
  panelWidth: 380,
  optionsExpanded: false,
  showQuickPrompts: true,
}

function renderPanel() {
  return render(
    <SessionSideChatPanel
      client={client as any}
      i18n={i18n as any}
      session={{ path: '/tmp/session.jsonl', name: 'Demo' }}
      open={true}
      onClose={() => {}}
      settings={defaultSettings}
    />,
  )
}

describe('SessionSideChatPanel', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
    vi.clearAllMocks()
    mocks.listOptions.mockResolvedValue([{ provider: 'anthropic', model: 'claude-4-sonnet' }])
    mocks.readEntries.mockResolvedValue([
      {
        id: 'entry-1',
        timestamp: '2026-05-24T00:00:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'This session is focused on sidechat context.' }],
        },
      },
    ])
    mocks.createSession.mockResolvedValue({
      sessionId: 'agent-1',
      model: { provider: 'anthropic', id: 'claude-4-sonnet' },
    })
    mocks.listForScope.mockResolvedValue([])
    mocks.upsert.mockResolvedValue(undefined)
    mocks.dispose.mockResolvedValue(undefined)
    mocks.runStream.mockImplementation(async (_params, handlers) => {
      handlers?.onDelta?.('The session is focused on sidechat.')
      return {
        sessionId: 'agent-1',
        text: 'The session is focused on sidechat.',
        toolResults: [],
      }
    })
  })

  it('loads model options and existing thread history when opened', async () => {
    mocks.listForScope.mockResolvedValue([
      {
        payload: {
          messages: [
            {
              id: 'assistant-history',
              role: 'assistant',
              createdAt: '2026-05-24T00:00:00Z',
              status: 'done',
              parts: [{ type: 'text', text: 'Previously answered context.' }],
            },
          ],
        },
      },
    ])

    renderPanel()

    await waitFor(() => expect(mocks.listOptions).toHaveBeenCalledTimes(1))
    expect(mocks.listForScope).toHaveBeenCalledWith(expect.objectContaining({
      scopeType: 'session',
      scopeId: '/tmp/session.jsonl',
      recordType: 'sidechat.thread',
    }))
    expect(await screen.findByText('Previously answered context.')).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('appends a user message, streams the assistant answer, and persists history', async () => {
    renderPanel()

    await waitFor(() => expect(mocks.listForScope).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByPlaceholderText(/Ask about decisions/i), {
      target: { value: 'What changed?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('What changed?')).toBeTruthy()
    expect(await screen.findByText('The session is focused on sidechat.')).toBeTruthy()
    expect(screen.getByText('1 snippets')).toBeTruthy()
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'sidechat',
      model: 'host-default',
    }))
    expect(mocks.runStream).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'agent-1',
      prompt: expect.stringContaining('sidechat context'),
    }), expect.any(Object))
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'builtin.sidechat',
      recordType: 'sidechat.thread',
      payload: expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
          expect.objectContaining({ role: 'assistant' }),
        ]),
      }),
    })))
  })
})
