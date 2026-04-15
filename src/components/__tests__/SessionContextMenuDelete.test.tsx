// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'tags.contextMenu.delete') return 'Delete'
      return key
    },
  }),
}))

import SessionContextMenu from '../session-viewer/SessionContextMenu'

describe('SessionContextMenu delete action', () => {
  it('passes an anchor point from the delete menu item', () => {
    const onDelete = vi.fn()

    render(
      <SessionContextMenu
        x={1180}
        y={24}
        sessionId="session-1"
        tags={[]}
        sessionTagIds={[]}
        onToggleTag={() => {}}
        onDelete={onDelete}
        onClose={() => {}}
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
