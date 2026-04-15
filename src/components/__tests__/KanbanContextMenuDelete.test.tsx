// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'common.delete') return 'Delete'
      if (key === 'favorites.add') return 'Add'
      if (key === 'favorites.remove') return 'Remove'
      if (key === 'tags.manage') return 'Manage tags'
      if (key === 'session.openInTerminal') return 'Open in Terminal'
      if (key === 'session.openInBrowser') return 'Open in Browser'
      if (key === 'tags.contextMenu.copyResume') return 'Copy resume'
      if (key === 'common.back') return 'Back'
      if (key === 'tags.empty') return 'Empty'
      return key
    },
  }),
}))

import KanbanContextMenu from '../kanban/KanbanContextMenu'
import type { SessionInfo } from '../../types'

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

describe('KanbanContextMenu delete action', () => {
  it('passes an anchor point from the delete menu item', () => {
    const onDelete = vi.fn()

    render(
      <KanbanContextMenu
        session={session}
        tags={[]}
        allTags={[]}
        favorites={[]}
        position={{ x: 1180, y: 24 }}
        onClose={() => {}}
        onOpenInTerminal={() => {}}
        onOpenInBrowser={() => {}}
        onToggleFavorite={() => {}}
        onToggleTag={() => {}}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete.mock.calls[0][0]).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    })
  })
})
