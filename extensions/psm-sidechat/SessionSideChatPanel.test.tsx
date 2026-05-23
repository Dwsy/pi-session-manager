// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SessionSideChatPanel from './SessionSideChatPanel'

const client = {
  models: {
    listOptions: vi.fn().mockResolvedValue([
      { provider: 'anthropic', model: 'claude-4-sonnet' },
    ]),
  },
  sidechat: {
    ask: vi.fn(),
  },
}

const i18n = {
  language: 'en-US',
  t: (_key: string, fallback: string, options?: Record<string, unknown>) => {
    if (!options) return fallback
    return fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ''))
  },
}

describe('SessionSideChatPanel', () => {
  it('does not load model options until options are expanded', async () => {
    client.models.listOptions.mockClear()

    render(
      <SessionSideChatPanel
        client={client as any}
        i18n={i18n as any}
        session={{ path: '/tmp/session.jsonl', name: 'Demo' }}
        open={true}
        onClose={() => {}}
        settings={{
          provider: '',
          model: '',
          thinkingLevel: 'medium',
          snippetLimit: 8,
          panelWidth: 380,
          optionsExpanded: false,
          showQuickPrompts: true,
        }}
      />,
    )

    expect(client.models.listOptions).not.toHaveBeenCalled()
    expect(screen.queryByText('Loading models...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /options/i }))

    await waitFor(() => expect(client.models.listOptions).toHaveBeenCalledTimes(1))
  })

})
