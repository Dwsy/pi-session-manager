import { describe, expect, it } from 'vitest'

import {
  appendShortcutLabel,
  formatShortcutDisplay,
  formatShortcutText,
  shouldUseTauriDragRegion,
  stripShortcutSuffix,
} from './platformShortcuts'

describe('platformShortcuts', () => {
  it('maps Cmd shortcuts to Ctrl on non-mac platforms', () => {
    expect(formatShortcutDisplay('Cmd+Shift+F', { isMac: false })).toBe('Ctrl+Shift+F')
    expect(formatShortcutDisplay('Cmd+R', { isMac: false })).toBe('Ctrl+R')
  })

  it('keeps textual modifiers on mac when symbolic mode is disabled', () => {
    expect(formatShortcutDisplay('Cmd+R', { isMac: true })).toBe('Cmd+R')
  })

  it('supports symbolic shortcut badges on mac', () => {
    expect(formatShortcutDisplay('Cmd+`', { isMac: true, symbolic: true })).toBe('⌘`')
  })

  it('formats embedded shortcut text for non-mac platforms', () => {
    expect(formatShortcutText('Show thinking (⌘T)', { isMac: false })).toBe('Show thinking (Ctrl+T)')
    expect(formatShortcutText('Resume session (Cmd+R)', { isMac: false })).toBe('Resume session (Ctrl+R)')
  })

  it('strips trailing shortcut suffixes from labels', () => {
    expect(stripShortcutSuffix('Search all sessions (Cmd+Shift+F)')).toBe('Search all sessions')
    expect(stripShortcutSuffix('Hide thinking (⌘T)')).toBe('Hide thinking')
  })

  it('rebuilds labels with the platform-appropriate shortcut', () => {
    expect(appendShortcutLabel('Search all sessions (Cmd+Shift+F)', 'Cmd+K', { isMac: false })).toBe(
      'Search all sessions (Ctrl+K)',
    )
  })

  it('only enables tauri drag regions on mac platforms', () => {
    expect(shouldUseTauriDragRegion(true)).toBe(true)
    expect(shouldUseTauriDragRegion(false)).toBe(false)
  })
})
