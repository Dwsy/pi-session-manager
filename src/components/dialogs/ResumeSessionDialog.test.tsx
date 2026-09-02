// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ResumeSessionDialog from './ResumeSessionDialog'
import { listSupportedSessionProviders } from '@/utils/sessionProvidersApi'
import type { SessionInfo, SessionProviderInfo } from '@/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/components/session-viewer/AgentIcon', () => ({
  AgentIcon: ({ source }: { source: string }) => <span data-testid={`agent-${source}`} />,
}))

vi.mock('@/utils/sessionProvidersApi', () => ({
  listSupportedSessionProviders: vi.fn(),
}))

const providers: SessionProviderInfo[] = [
  {
    slug: 'pi',
    display_name: 'Pi',
    capabilities: { canScan: true, canConvertTarget: true },
    detected: true,
    roots: ['/home/demo/.pi/agent/sessions'],
  },
  {
    slug: 'codex',
    display_name: 'Codex',
    capabilities: { canScan: true, canConvertTarget: true },
    detected: false,
    roots: [],
  },
]

const session: SessionInfo = {
  path: '/tmp/session.jsonl',
  id: 'session-1',
  cwd: '/tmp',
  created: '2026-05-24T00:00:00Z',
  modified: '2026-05-24T00:00:00Z',
  message_count: 1,
  first_message: 'First message',
  last_message: 'Last message',
  last_message_role: 'assistant',
}

describe('ResumeSessionDialog', () => {
  beforeEach(() => {
    vi.mocked(listSupportedSessionProviders).mockResolvedValue(providers)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('runs resume immediately when a provider is clicked', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(
      <ResumeSessionDialog
        session={session}
        defaultTarget="pi"
        onResume={onResume}
        onClose={onClose}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Codex/ }))

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledWith('codex')
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render a separate resume confirmation button', async () => {
    const onResume = vi.fn()
    const onClose = vi.fn()

    render(
      <ResumeSessionDialog
        session={session}
        defaultTarget="pi"
        onResume={onResume}
        onClose={onClose}
      />,
    )

    await screen.findByRole('button', { name: /Codex/ })

    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('supports arrow selection and Enter in copy mode', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(
      <ResumeSessionDialog
        session={session}
        defaultTarget="pi"
        mode="copy"
        onResume={onResume}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog')
    await screen.findByRole('button', { name: /Codex/ })

    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: /Codex/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.keyDown(dialog, { key: 'Enter' })

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledWith('codex')
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
