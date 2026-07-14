// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

interface TestHarnessProps {
  allowInTextEntry?: string[]
  onDelete: () => void
  onSearchAll: () => void
  onSettings: () => void
  onListView?: () => void
  onProjectView?: () => void
  onKanbanView?: () => void
}

function TestHarness({
  allowInTextEntry = [],
  onDelete,
  onSearchAll,
  onSettings,
  onListView = () => {},
  onProjectView = () => {},
  onKanbanView = () => {},
}: TestHarnessProps) {
  useKeyboardShortcuts(
    {
      'cmd+,': onSettings,
      'cmd+shift+f': onSearchAll,
      'cmd+backspace': onDelete,
      'cmd+1': onListView,
      'cmd+2': onProjectView,
      'cmd+3': onKanbanView,
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
  const onListView = vi.fn()
  const onProjectView = vi.fn()
  const onKanbanView = vi.fn()

  render(
    <TestHarness
      allowInTextEntry={allowInTextEntry}
      onDelete={onDelete}
      onSearchAll={onSearchAll}
      onSettings={onSettings}
      onListView={onListView}
      onProjectView={onProjectView}
      onKanbanView={onKanbanView}
    />,
  )

  return {
    editor: screen.getByLabelText('editor'),
    outsideButton: screen.getByRole('button', { name: 'outside' }),
    onDelete,
    onSearchAll,
    onSettings,
    onListView,
    onProjectView,
    onKanbanView,
  }
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    cleanup()
  })
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

  it('handles numeric app-view shortcuts outside text inputs', () => {
    const { outsideButton, onListView, onProjectView, onKanbanView } = renderHarness()

    outsideButton.focus()
    fireEvent.keyDown(outsideButton, { key: '1', metaKey: true })
    fireEvent.keyDown(outsideButton, { key: '2', metaKey: true })
    fireEvent.keyDown(outsideButton, { key: '3', metaKey: true })

    expect(onListView).toHaveBeenCalledTimes(1)
    expect(onProjectView).toHaveBeenCalledTimes(1)
    expect(onKanbanView).toHaveBeenCalledTimes(1)
  })

  it('ignores IME composition, keyCode 229, and AltGraph input', () => {
    const { outsideButton, onSettings } = renderHarness()
    outsideButton.focus()

    fireEvent.keyDown(outsideButton, { key: ',', metaKey: true, isComposing: true })
    fireEvent.keyDown(outsideButton, { key: ',', metaKey: true, keyCode: 229 })
    const altGraph = new KeyboardEvent('keydown', { key: ',', ctrlKey: true, altKey: true, bubbles: true })
    Object.defineProperty(altGraph, 'getModifierState', { value: (name: string) => name === 'AltGraph' })
    outsideButton.dispatchEvent(altGraph)

    expect(onSettings).not.toHaveBeenCalled()
  })
})
