/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import {
  applyPiChatTheme,
  getBuiltInBase46Themes,
  isBuiltInBase46ThemeSelection,
  resolveThemePreview,
  toPiThemeFileFromBase46,
} from './piTheme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-chat-theme')
  document.documentElement.removeAttribute('data-chat-theme-scheme')
  document.documentElement.classList.remove('theme-dark', 'theme-light')
})

describe('base46 theme support', () => {
  it('ships a balanced built-in base46 theme catalog', () => {
    const themes = getBuiltInBase46Themes()

    expect(themes.length).toBeGreaterThanOrEqual(6)
    expect(themes.some((theme) => theme.scheme === 'dark')).toBe(true)
    expect(themes.some((theme) => theme.scheme === 'light')).toBe(true)
    expect(themes.map((theme) => theme.id)).toContain('tokyonight')
  })

  it('maps base46 palette values to app theme tokens', () => {
    const theme = getBuiltInBase46Themes().find((item) => item.id === 'tokyonight')
    expect(theme).toBeTruthy()

    const mapped = toPiThemeFileFromBase46(theme!)

    expect(mapped.name).toBe('Tokyo Night')
    expect(mapped.vars?.background).toBe('#1a1b26')
    expect(mapped.vars?.panel).toBe('#24283b')
    expect(mapped.vars?.text).toBe('#c0caf5')
    expect(mapped.vars?.accent).toBe('#7aa2f7')
    expect(mapped.vars?.mdCode).toBe('#7dcfff')
    expect(mapped.vars?.toolDiffAdded).toBe('#9ece6a')
  })

  it('recognizes built-in base46 selections without confusing user theme names', () => {
    expect(isBuiltInBase46ThemeSelection('base46:tokyonight')).toBe(true)
    expect(isBuiltInBase46ThemeSelection('tokyonight')).toBe(false)
    expect(isBuiltInBase46ThemeSelection('themes/base46:tokyonight.json')).toBe(false)
  })

  it('builds a preview model for built-in themes', () => {
    const preview = resolveThemePreview('base46:tokyonight')

    expect(preview?.source).toBe('built-in')
    expect(preview?.label).toBe('Tokyo Night')
    expect(preview?.scheme).toBe('dark')
    expect(preview?.colors.background).toBe('#1a1b26')
    expect(preview?.colors.accent).toBe('#7aa2f7')
    expect(preview?.colors.error).toBe('#f7768e')
  })

  it('applies built-in themes through the same DOM override lifecycle', async () => {
    const root = document.documentElement

    await applyPiChatTheme('base46:tokyonight')

    expect(root.style.getPropertyValue('--color-background')).toBe('26 27 38')
    expect(root.style.getPropertyValue('--accent')).toBe('#7aa2f7')
    expect(root.getAttribute('data-chat-theme')).toBe('Tokyo Night')
    expect(root.getAttribute('data-chat-theme-scheme')).toBe('dark')
    expect(root.classList.contains('theme-dark')).toBe(true)

    await applyPiChatTheme('app-default')

    expect(root.style.getPropertyValue('--color-background')).toBe('')
    expect(root.style.getPropertyValue('--accent')).toBe('')
    expect(root.getAttribute('data-chat-theme')).toBeNull()
    expect(root.getAttribute('data-chat-theme-scheme')).toBeNull()
  })

  it('applies light base46 themes as theme-light', async () => {
    const root = document.documentElement

    await applyPiChatTheme('base46:catppuccin-latte')

    expect(root.getAttribute('data-chat-theme')).toBe('Catppuccin Latte')
    expect(root.getAttribute('data-chat-theme-scheme')).toBe('light')
    expect(root.classList.contains('theme-light')).toBe(true)
    expect(root.classList.contains('theme-dark')).toBe(false)
  })

  it('clears overrides for unknown base46 selections', async () => {
    const root = document.documentElement

    await applyPiChatTheme('base46:tokyonight')
    await applyPiChatTheme('base46:missing')

    expect(root.style.getPropertyValue('--color-background')).toBe('')
    expect(root.style.getPropertyValue('--accent')).toBe('')
    expect(root.getAttribute('data-chat-theme')).toBeNull()
    expect(root.getAttribute('data-chat-theme-scheme')).toBeNull()
  })
})
