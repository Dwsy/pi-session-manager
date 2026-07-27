// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({

    t: (key: string, options?: Record<string, unknown>) => {
      const fallback = typeof options?.defaultValue === 'string' ? options.defaultValue : key
      return fallback.replace('{{count}}', String(options?.count ?? ''))
    },
  }),
}))

vi.mock('@/hooks/useDelayedLoading', () => ({
  useDelayedLoading: () => false,
}))

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    getSessionSetting: () => true,
  }),
}))

vi.mock('@/transport', () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}))

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copyText: vi.fn() }),
}))

vi.mock('@/components/OpenInBrowserButton', () => ({
  default: () => null,
}))

vi.mock('@/components/OpenInTerminalButton', () => ({
  default: () => null,
}))

vi.mock('@/components/tags/TagPicker', () => ({
  default: () => null,
}))

vi.mock('@/components/session-viewer/SessionContextMenu', () => ({
  default: () => null,
}))

vi.mock('@/components/session-preview/SessionPreviewModal', () => ({
  default: () => null,
}))

vi.mock('@/components/session-viewer/SessionBadge', () => ({
  SessionBadge: ({ label }: { label?: string }) => (label ? <span>{label}</span> : null),
}))

import SessionList from '../SessionList'
import type { SessionInfo } from '@/types'

const session: SessionInfo = {
  id: 'session-1',
  path: '/tmp/session-1.jsonl',
  name: 'Session 1',
  cwd: '/tmp',
  modified: '2026-04-15T12:00:00.000Z',
  message_count: 1,
  first_message: 'hello',
  last_message: 'world',
}

describe('SessionList selectionModeTrigger', () => {
  it('toggles selection mode off on repeated select triggers', async () => {
    const props = {
      sessions: [session],
      selectedSession: session,
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onDeleteSessions: vi.fn(),
      loading: false,
      selectionModeTrigger: 0,
    }

    const { rerender } = render(<SessionList {...props} />)

    rerender(<SessionList {...props} selectionModeTrigger={1} />)
    expect(await screen.findByText('1 selected')).toBeTruthy()

    rerender(<SessionList {...props} selectionModeTrigger={2} />)
    expect(screen.queryByText('1 selected')).toBeNull()
  })
})
