// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback
      if (fallback?.defaultValue) return fallback.defaultValue
      if (key === 'common.delete') return 'Delete'
      if (key === 'common.confirm') return 'Confirm?'
      if (key === 'common.cancel') return 'Cancel'
      if (key === 'favorites.add') return 'Add'
      if (key === 'favorites.remove') return 'Remove'
      if (key === 'session.openInTerminal') return 'Open in Terminal'
      if (key === 'session.openInBrowser') return 'Open in Browser'
      if (key === 'tags.contextMenu.copyResume') return 'Copy resume'
      if (key === 'tags.contextMenu.rename') return 'Rename'
      return key
    },
  }),
}))

import KanbanContextMenu from '../board/KanbanContextMenu'
import type { SessionInfo, Tag } from '@/types'
import type { KanbanLabel } from '../labels/kanbanLabelsStore'

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

const status: Tag = {
  id: 'doing',
  name: 'Doing',
  color: 'blue',
  sortOrder: 0,
  isBuiltin: false,
  createdAt: '2026-04-15T12:00:00.000Z',
}

const label: KanbanLabel = {
  id: 'frontend',
  name: 'Frontend',
  color: '#1f6feb',
  description: 'Frontend work',
  createdAt: '2026-04-15T12:00:00.000Z',
  updatedAt: '2026-04-15T12:00:00.000Z',
}

function baseProps() {
  return {
    session,
    statuses: [status],
    currentStatusId: null,
    labels: [] as KanbanLabel[],
    allLabels: [label],
    favorites: [],
    position: { x: 100, y: 100 },
    onClose: vi.fn(),
    onOpenInTerminal: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSetStatus: vi.fn(),
    onToggleLabel: vi.fn(),
    onDelete: vi.fn(),
  }
}

describe('KanbanContextMenu', () => {
  it('sets one workflow status and toggles labels independently', () => {
    const props = baseProps()
    render(<KanbanContextMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /doing/i }))
    expect(props.onSetStatus).toHaveBeenCalledWith('doing')

    fireEvent.click(screen.getByRole('button', { name: /frontend/i }))
    expect(props.onToggleLabel).toHaveBeenCalledWith('frontend', true)
    expect(props.onSetStatus).toHaveBeenCalledTimes(1)
  })

  it('can clear the current status without affecting labels', () => {
    const props = { ...baseProps(), currentStatusId: 'doing', labels: [label] }
    render(<KanbanContextMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /no status/i }))
    expect(props.onSetStatus).toHaveBeenCalledWith(null)
    expect(props.onToggleLabel).not.toHaveBeenCalled()
  })

  it('invokes onRename when rename item is clicked', () => {
    const props = { ...baseProps(), onRename: vi.fn() }
    render(<KanbanContextMenu {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))
    expect(props.onRename).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('requires a second click before deleting and passes an anchor point', () => {
    const props = baseProps()
    render(<KanbanContextMenu {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(props.onDelete).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
    expect(props.onDelete.mock.calls[0][0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
