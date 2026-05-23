// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SessionIntelligenceToolbarPanel from './SessionIntelligenceToolbarPanel'

const client = {
  records: {
    listForScope: vi.fn().mockResolvedValue([]),
    refreshSessionIntelligence: vi.fn(),
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
})
