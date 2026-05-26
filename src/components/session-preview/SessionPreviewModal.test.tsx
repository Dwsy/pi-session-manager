// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}))

vi.mock('@/components/SessionViewer', () => ({
  default: ({ slots }: any) => (
    <div>
      <div data-testid="preview-toolbar">{slots?.right}</div>
      <div>Preview content</div>
    </div>
  ),
}))

import SessionPreviewModal from './SessionPreviewModal'

const session: SessionInfo = {
  id: 'preview-session',
  path: '/tmp/preview-session.jsonl',
  cwd: '/tmp/project',
  created: '2026-05-26T12:00:00.000Z',
  modified: '2026-05-26T12:00:00.000Z',
  message_count: 1,
  first_message: 'hello',
  last_message: 'world',
  last_message_role: 'assistant',
}

describe('SessionPreviewModal native feel', () => {
  afterEach(() => cleanup())

  it('opens without scale or fade animation', () => {
    render(
      <SessionPreviewModal
        session={session}
        isOpen
        onClose={() => {}}
        onExpand={() => {}}
      />,
    )

    const modalSurface = screen.getByRole('dialog').firstElementChild as HTMLElement
    expect(modalSurface.style.transform).toBe('')
    expect(modalSurface.style.opacity).toBe('')
    expect(modalSurface.style.transition).toBe('')
  })
})
