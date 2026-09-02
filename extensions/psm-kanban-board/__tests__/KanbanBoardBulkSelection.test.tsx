// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo, Tag } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: { count?: number }) =>
      (fallback ?? _key).replace('{{count}}', String(options?.count ?? '')),
  }),
}))
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ getSessionSetting: () => true }) }))
vi.mock('@/utils/sessionResume', () => ({ buildCopyResumeCommand: () => '', openSessionInTerminalDirect: vi.fn() }))
vi.mock('@/components/search/SearchFilterBar', () => ({ default: () => <div data-testid="search-filter" /> }))
vi.mock('@/components/session-preview/SessionPreviewModal', () => ({ default: () => null }))

import KanbanBoard from '../board/KanbanBoard'

const session = (id: string): SessionInfo => ({
  id,
  path: `/tmp/${id}.jsonl`,
  cwd: '/tmp/project',
  created: '2026-04-15T12:00:00.000Z',
  modified: '2026-04-15T12:00:00.000Z',
  message_count: 1,
  first_message: id,
  last_message: id,
  last_message_role: 'assistant',
})

const status = (id: string, name: string): Tag => ({
  id,
  name,
  color: 'info',
  sortOrder: 0,
  isBuiltin: false,
  createdAt: '2026-04-15T12:00:00.000Z',
})

const commonProps = {
  labels: [],
  labelAssignments: [],
  selectedSession: null,
  onSelectSession: () => {},
  onMoveSession: () => {},
  onToggleTag: () => {},
  onToggleLabel: () => {},
  onCreateLabel: async (input: any) => ({ id: 'new', ...input, createdAt: 'now', updatedAt: 'now' }),
  onUpdateLabel: async () => {},
  onDeleteLabel: async () => {},
}

describe('KanbanBoard status and bulk selection', () => {
  afterEach(() => cleanup())

  it('renders a legacy multi-status session only once in its newest status', () => {
    const { container } = render(
      <KanbanBoard
        {...commonProps}
        sessions={[session('a')]}
        statuses={[status('todo', 'Todo'), status('done', 'Done')]}
        statusAssignments={[
          { sessionId: 'a', tagId: 'todo', position: 0, assignedAt: '2026-04-15T10:00:00.000Z' },
          { sessionId: 'a', tagId: 'done', position: 0, assignedAt: '2026-04-15T11:00:00.000Z' },
        ]}
      />,
    )

    const cards = [...container.querySelectorAll<HTMLElement>('[data-session-id="a"]')]
    expect(cards).toHaveLength(1)
    expect(cards[0]?.dataset.sortableId).toBe('card:done:a')
  })

  it('shows the bulk toolbar after selecting multiple cards', () => {
    render(
      <KanbanBoard
        {...commonProps}
        sessions={[session('a'), session('b')]}
        statuses={[status('todo', 'Todo')]}
        statusAssignments={[]}
      />,
    )

    const selectButtons = screen.getAllByRole('button', { name: 'Select session' })
    fireEvent.click(selectButtons[0])
    fireEvent.click(selectButtons[1])
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.getByLabelText('Move selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy()
  })
})

describe('KanbanBoard view modes', () => {
  afterEach(() => cleanup())

  it('renders alternate views and reports view mode changes', () => {
    const onViewModeChange = vi.fn()
    const { rerender } = render(
      <KanbanBoard
        {...commonProps}
        sessions={[session('a')]}
        statuses={[status('todo', 'Todo')]}
        statusAssignments={[]}
        viewMode="table"
        onViewModeChange={onViewModeChange}
      />,
    )

    expect(screen.getByTestId('kanban-table-view')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Roadmap' }))
    expect(onViewModeChange).toHaveBeenCalledWith('roadmap')

    rerender(
      <KanbanBoard
        {...commonProps}
        sessions={[session('a')]}
        statuses={[status('todo', 'Todo')]}
        statusAssignments={[]}
        viewMode="roadmap"
        onViewModeChange={onViewModeChange}
      />,
    )
    expect(screen.getByTestId('kanban-roadmap-view')).toBeTruthy()
  })

  it('passes filtered sessions to table view and opens the selected session', () => {
    const onSelectSession = vi.fn()
    render(
      <KanbanBoard
        {...commonProps}
        sessions={[session('keep'), { ...session('drop'), cwd: '/tmp/other' }]}
        statuses={[]}
        statusAssignments={[]}
        onSelectSession={onSelectSession}
        projectFilter="/tmp/project"
        viewMode="table"
      />,
    )

    const rows = screen.getAllByTestId('kanban-table-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].getAttribute('data-session-id')).toBe('keep')
    fireEvent.click(rows[0])
    expect(onSelectSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'keep' }))
  })
})
