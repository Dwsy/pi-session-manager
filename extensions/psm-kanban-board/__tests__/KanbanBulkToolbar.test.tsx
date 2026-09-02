// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tag } from '@/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: { count?: number }) =>
      (fallback ?? _key).replace('{{count}}', String(options?.count ?? '')),
  }),
}))

afterEach(() => cleanup())

import KanbanBulkToolbar from '../board/KanbanBulkToolbar'

const tag = (id: string, name: string): Tag => ({
  id,
  name,
  color: 'info',
  sortOrder: 0,
  isBuiltin: false,
  createdAt: '2026-04-15T12:00:00.000Z',
})

describe('KanbanBulkToolbar', () => {
  it('moves selected sessions to a chosen status and can clear selection', () => {
    const onMoveToStatus = vi.fn()
    const onDeleteSelected = vi.fn()
    const onClearSelection = vi.fn()

    render(
      <KanbanBulkToolbar
        selectedCount={2}
        statuses={[tag('todo', 'Todo'), tag('done', 'Done')]}
        onMoveToStatus={onMoveToStatus}
        onDeleteSelected={onDeleteSelected}
        onClearSelection={onClearSelection}
      />,
    )

    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Move selected'), { target: { value: 'done' } })
    expect(onMoveToStatus).toHaveBeenCalledWith('done')

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(onClearSelection).toHaveBeenCalledTimes(1)
    expect(onDeleteSelected).not.toHaveBeenCalled()
  })

  it('runs bulk delete when delete is clicked', () => {
    const onDeleteSelected = vi.fn()

    render(
      <KanbanBulkToolbar
        selectedCount={3}
        statuses={[]}
        onMoveToStatus={() => {}}
        onDeleteSelected={onDeleteSelected}
        onClearSelection={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    expect(onDeleteSelected).toHaveBeenCalledTimes(1)
  })
})
