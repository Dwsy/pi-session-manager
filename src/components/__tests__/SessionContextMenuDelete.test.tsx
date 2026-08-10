// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react'
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
  it('requires a two-step confirm before invoking onDelete', () => {
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

    // First click only arms the confirm state; the destructive action must not fire yet.
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).not.toHaveBeenCalled()

    // Second click on the confirm button performs the delete (no anchor payload).
    fireEvent.click(screen.getByText('common.confirm'))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith()
  })

  it('invokes onRename and closes when rename is chosen', () => {
    const onRename = vi.fn()
    const onClose = vi.fn()

    render(
      <SessionContextMenu
        x={0}
        y={0}
        sessionId="session-1"
        tags={[]}
        sessionTagIds={[]}
        onToggleTag={() => {}}
        onRename={onRename}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText('tags.contextMenu.rename'))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('copies the session JSONL path and closes the menu', () => {
    const onCopyPath = vi.fn()
    const onClose = vi.fn()

    render(
      <SessionContextMenu
        x={0}
        y={0}
        sessionId="session-1"
        tags={[]}
        sessionTagIds={[]}
        onToggleTag={() => {}}
        onCopyPath={onCopyPath}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText('session.copyPath'))
    expect(onCopyPath).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancels the delete when the cancel (X) button is pressed', () => {
    const onDelete = vi.fn()

    render(
      <SessionContextMenu
        x={0}
        y={0}
        sessionId="session-1"
        tags={[]}
        sessionTagIds={[]}
        onToggleTag={() => {}}
        onDelete={onDelete}
        onClose={() => {}}
      />,
    )

    // Arm confirm, then dismiss it via the X button (matched by its title attr).
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByTitle('common.cancel'))

    expect(onDelete).not.toHaveBeenCalled()
  })
})
