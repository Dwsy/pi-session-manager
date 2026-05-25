// @vitest-environment jsdom

import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./host-react', () => ({
  hostReact: () => React,
}))

import { SemanticSearchView } from './SemanticSearchView'

afterEach(() => cleanup())

function createContext() {
  const createSession = vi.fn(async () => ({
    sessionId: 'agent-1',
    storageKey: 'builtin.semantic-search:semantic-search',
    model: { provider: 'openai', id: 'gpt-5.5' },
  }))
  const run = vi.fn(async () => ({
    text: 'Found a matching session:\n/repo/session.jsonl - auth fix',
    toolResults: [
      { tool: 'psm.search.fulltext', ok: true, result: { total_hits: 1 } },
    ],
  }))
  const open = vi.fn()

  return {
    i18n: { t: (_key: string, fallback: string) => fallback },
    settings: {
      get: (key: string, fallback: unknown) => {
        if (key === 'maxResults') return 20
        return fallback
      },
    },
    psm: {
      agent: { createSession, run },
      sessions: { open },
    },
    createSession,
    run,
    open,
  }
}

describe('SemanticSearchView', () => {
  it('runs the app view search through the host-managed agent', async () => {
    const ctx = createContext()

    render(
      <SemanticSearchView
        viewId="builtin.semantic-search.view"
        active
        data={{ selectedSession: { cwd: '/repo' } } as never}
        ctx={ctx as never}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search sessions by meaning...'), {
      target: { value: 'auth bug' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(ctx.createSession).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'semantic-search',
      cwd: '/repo',
      tools: expect.arrayContaining([
        { name: 'psm.search.fulltext', permission: 'search:read' },
      ]),
    })))
    expect(ctx.run).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'agent-1',
      prompt: expect.stringContaining('Query: auth bug'),
    }))
    expect(await screen.findByText(/auth fix/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '/repo/session.jsonl' }))
    expect(ctx.open).toHaveBeenCalledWith('/repo/session.jsonl')
  })
})
