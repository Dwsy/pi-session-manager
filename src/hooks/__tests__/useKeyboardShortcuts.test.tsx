import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

interface TestHarnessProps {
  allowInTextEntry?: string[]
  onDelete: () => void
  onSearchAll: () => void
  onSettings: () => void
}

function TestHarness({
  allowInTextEntry = [],
  onDelete,
  onSearchAll,
  onSettings,
}: TestHarnessProps) {
  useKeyboardShortcuts(
    {
      'cmd+,': onSettings,
      'cmd+shift+f': onSearchAll,
      'cmd+backspace': onDelete,
    },
    { allowInTextEntry },
  )

  return (
    <div>
      <input aria-label="editor" />
      <button type="button">outside</button>
    </div>
  )
}

function renderHarness(allowInTextEntry: string[] = []) {
  const onSettings = vi.fn()
  const onSearchAll = vi.fn()
  const onDelete = vi.fn()

  render(
    <TestHarness
      allowInTextEntry={allowInTextEntry}
      onDelete={onDelete}
      onSearchAll={onSearchAll}
      onSettings={onSettings}
    />,
  )

  return {
    editor: screen.getByLabelText('editor'),
    outsideButton: screen.getByRole('button', { name: 'outside' }),
    onDelete,
    onSearchAll,
    onSettings,
  }
}

describe('useKeyboardShortcuts', () => {
  it('blocks command shortcuts from text inputs by default', () => {
    const { editor, onSettings, onSearchAll } = renderHarness()

    editor.focus()
    fireEvent.keyDown(editor, { key: ',', metaKey: true })
    fireEvent.keyDown(editor, { key: 'F', metaKey: true, shiftKey: true })

    expect(onSettings).not.toHaveBeenCalled()
    expect(onSearchAll).not.toHaveBeenCalled()
  })

  it('allows configured global shortcuts while a text input is focused', () => {
    const { editor, onSettings, onSearchAll } = renderHarness(['cmd+,', 'cmd+shift+f'])

    editor.focus()
    fireEvent.keyDown(editor, { key: ',', metaKey: true })
    fireEvent.keyDown(editor, { key: 'F', metaKey: true, shiftKey: true })

    expect(onSettings).toHaveBeenCalledTimes(1)
    expect(onSearchAll).toHaveBeenCalledTimes(1)
  })

  it('still blocks non-allowlisted shortcuts while typing', () => {
    const { editor, onDelete } = renderHarness(['cmd+,', 'cmd+shift+f'])

    editor.focus()
    fireEvent.keyDown(editor, { key: 'Backspace', metaKey: true })

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('still handles shortcuts outside text inputs', () => {
    const { outsideButton, onDelete } = renderHarness()

    outsideButton.focus()
    fireEvent.keyDown(outsideButton, { key: 'Backspace', metaKey: true })

    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
