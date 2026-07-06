// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SessionIntelligenceToolbarPanel from './SessionIntelligenceToolbarPanel'

const client = {
  records: {
    listForScope: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
  },
  sessions: {
    readEntries: vi.fn(),
  },
  agent: {
    createSession: vi.fn(),
    runStream: vi.fn(),
    dispose: vi.fn(),
  },
  models: {
    listOptions: vi.fn(),
  },
}

const i18n = {
  language: 'en-US',
  t: (_key: string, fallback: string, options?: Record<string, unknown>) => {
    if (!options) return fallback
    return fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ''))
  },
}

describe('SessionIntelligenceToolbarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.records.listForScope.mockResolvedValue([])
    client.records.upsert.mockResolvedValue(undefined)
    client.sessions.readEntries.mockResolvedValue([
      {
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Need to migrate AI plugins.' }],
        },
      },
    ])
    client.agent.createSession.mockResolvedValue({
      sessionId: 'agent-1',
      model: { provider: 'openai', id: 'gpt-5.5' },
    })
    client.agent.runStream.mockImplementation(async (_params, handlers) => {
      handlers?.onDelta?.('{"summary":"Migrated AI plugins')
      handlers?.onDelta?.(' to the agent bridge.","topics":["plugins"],"status":"completed","unresolved_tasks":[]}')
      return {
        sessionId: 'agent-1',
        text: JSON.stringify({
          summary: 'Migrated AI plugins to the agent bridge.',
          topics: ['plugins'],
          status: 'completed',
          unresolved_tasks: [],
        }),
      }
    })
    client.agent.dispose.mockResolvedValue(undefined)
    client.models.listOptions.mockResolvedValue([
      { provider: 'openai', model: 'gpt-5.5' },
      { provider: 'anthropic', model: 'claude-sonnet-4.5' },
    ])
  })

  it('renders a richer empty state with guidance sections', async () => {
    render(
      <SessionIntelligenceToolbarPanel
        client={client as any}
        i18n={i18n as any}
        session={{ path: '/tmp/session.jsonl', name: 'Demo' }}
        open={true}
        onClose={() => {}}
        settings={{
          provider: '',
          model: '',
          language: 'auto',
          autoOpenAfterRefresh: true,
          showMetadata: true,
          showTopics: true,
          showNextSteps: true,
          showUnresolved: true,
        }}
      />,
    )

    await waitFor(() => expect(client.records.listForScope).toHaveBeenCalled())

    expect(screen.getByText('What you will get')).toBeTruthy()
    expect(screen.getByText('Summary')).toBeTruthy()
    expect(screen.getByText('Next steps')).toBeTruthy()
  })

  it('streams session intelligence through the PSM agent bridge and lets user pick model directly', async () => {
    render(
      <SessionIntelligenceToolbarPanel
        client={client as any}
        i18n={i18n as any}
        session={{ path: '/tmp/session.jsonl', name: 'Demo' }}
        open={true}
        onClose={() => {}}
        settings={{
          provider: '',
          model: '',
          language: 'auto',
          autoOpenAfterRefresh: true,
          showMetadata: true,
          showTopics: true,
          showNextSteps: true,
          showUnresolved: true,
        }}
      />,
    )

    const modelButton = screen.getByRole('button', { name: 'Auto' })
    fireEvent.click(modelButton)

    const option = await screen.findByRole('button', { name: 'openai/gpt-5.5' })
    fireEvent.click(option)

    await waitFor(() => expect(screen.queryByRole('button', { name: 'openai/gpt-5.5' })).toBeTruthy())

    const generateButtons = await screen.findAllByRole('button', { name: 'Generate' })
    fireEvent.click(generateButtons[generateButtons.length - 1])

    expect(await screen.findByText(/Migrated AI plugins/)).toBeTruthy()

    await waitFor(() => expect(client.agent.createSession).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'session-summary',
      model: { provider: 'openai', id: 'gpt-5.5' },
    })))
    expect(client.agent.runStream).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'agent-1',
      prompt: expect.stringContaining('Need to migrate AI plugins.'),
    }), expect.any(Object))
    expect(client.records.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'builtin.session-summary:/tmp/session.jsonl',
      pluginId: 'builtin.session-summary',
      recordType: 'session.intelligence',
      payload: expect.objectContaining({ summary: 'Migrated AI plugins to the agent bridge.' }),
    }))
    expect(await screen.findByText('Migrated AI plugins to the agent bridge.')).toBeTruthy()
  })
})
