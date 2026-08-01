/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { resolveShikiTheme } from './codeThemes'

afterEach(() => {
  document.documentElement.classList.remove('theme-dark', 'theme-light')
  document.documentElement.removeAttribute('data-chat-theme')
})

describe('resolveShikiTheme', () => {
  it('uses the dark counterpart when a paired light theme is selected in dark mode', () => {
    document.documentElement.classList.add('theme-dark')

    expect(resolveShikiTheme('github-light')).toBe('github-dark')
    expect(resolveShikiTheme('catppuccin-latte')).toBe('catppuccin-mocha')
  })

  it('uses the light counterpart when a paired dark theme is selected in light mode', () => {
    document.documentElement.classList.add('theme-light')

    expect(resolveShikiTheme('github-dark')).toBe('github-light')
    expect(resolveShikiTheme('one-dark-pro')).toBe('one-light')
  })

  it('keeps unpaired theme families explicit', () => {
    document.documentElement.classList.add('theme-light')

    expect(resolveShikiTheme('dracula')).toBe('dracula')
    expect(resolveShikiTheme('tokyo-night')).toBe('tokyo-night')
  })
})
