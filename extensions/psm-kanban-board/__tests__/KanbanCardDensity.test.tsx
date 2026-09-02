// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/types'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    getSessionSetting: () => true,
  }),
}))

import KanbanCard from '../board/KanbanCard'

const session: SessionInfo = {
  id: 'session-1',
  path: '/tmp/session-1.jsonl',
  cwd: '/tmp/project',
  created: '2026-04-15T12:00:00.000Z',
  modified: '2026-04-15T12:00:00.000Z',
  message_count: 3,
  first_message: 'First message',
  last_message: 'Detailed last message',
  last_message_role: 'assistant',
}

describe('KanbanCard density', () => {
  afterEach(() => cleanup())

  it('renders compact cards with tighter spacing and hides preview text', () => {
    const { rerender } = render(
      <KanbanCard
        session={session}
        labels={[]}
        isSelected={false}
        density="comfortable"
        onSelect={() => {}}
      />,
    )

    expect(screen.getByTestId('kanban-card').getAttribute('data-density')).toBe('comfortable')
    expect(screen.getByText('Detailed last message')).toBeTruthy()

    rerender(
      <KanbanCard
        session={session}
        labels={[]}
        isSelected={false}
        density="compact"
        onSelect={() => {}}
      />,
    )

    expect(screen.getByTestId('kanban-card').getAttribute('data-density')).toBe('compact')
    expect(screen.queryByText('Detailed last message')).toBeNull()
  })
})
