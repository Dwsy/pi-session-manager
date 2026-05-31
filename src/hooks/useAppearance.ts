import { useEffect } from 'react'
import { useSettings } from './useSettings'
import type { AppSettings } from '@/components/settings/types'
import { applyPiChatTheme } from '@/utils/piTheme'

export type AppearanceSettings = AppSettings['appearance']

function applyThemeClass(theme: 'dark' | 'light' | 'system') {
  const root = document.documentElement
  root.classList.remove('theme-dark', 'theme-light')

  if (theme === 'dark') {
    root.classList.add('theme-dark')
  } else if (theme === 'light') {
    root.classList.add('theme-light')
  } else {
    // system: follow OS preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.add(isDark ? 'theme-dark' : 'theme-light')
  }
}

export function useAppearance() {
  const { appearance, updateAppearanceSetting } = useSettings()

  useEffect(() => {
    // For dark/light/system themes, set class directly
    // For custom theme, applyPiChatTheme will set the class automatically
    if (appearance.theme === 'dark' || appearance.theme === 'light' || appearance.theme === 'system') {
      applyThemeClass(appearance.theme)
    }

    document.documentElement.style.setProperty('--sidebar-width', `${appearance.sidebarWidth}px`)
  }, [appearance.theme, appearance.customTheme, appearance.sidebarWidth])

  // Listen for OS color scheme changes when in system mode
  useEffect(() => {
    if (appearance.theme !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass('system')
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [appearance.theme])

  useEffect(() => {
    const fontSizeMap = { small: '14px', medium: '16px', large: '18px' }
    const root = document.documentElement
    root.style.setProperty('--font-size-base', fontSizeMap[appearance.fontSize])
    root.style.setProperty('--font-family', appearance.fontFamily)
    root.style.setProperty('--font-family-mono', appearance.fontFamilyMono)
    // Code-specific typography
    root.style.setProperty('--code-font-size', `${appearance.codeFontSize ?? 13}px`)
    root.style.setProperty('--code-font-weight', String(appearance.codeFontWeight ?? 400))
    const lig = appearance.codeLigatures ? '"calt", "liga", "dlig"' : 'none'
    root.style.setProperty('--code-ligatures', lig)
  }, [appearance.fontSize, appearance.fontFamily, appearance.fontFamilyMono, appearance.codeFontSize, appearance.codeFontWeight, appearance.codeLigatures])

  useEffect(() => {
    const spacingMap = { compact: '8px', comfortable: '16px', spacious: '24px' }
    document.documentElement.style.setProperty('--spacing-base', spacingMap[appearance.messageSpacing])
  }, [appearance.messageSpacing])

  useEffect(() => {
    document.documentElement.setAttribute('data-code-theme', appearance.codeBlockTheme || 'github')
  }, [appearance.codeBlockTheme])

  useEffect(() => {
    const selectedTheme = appearance.theme === 'custom' ? appearance.customTheme : 'app-default'
    applyPiChatTheme(selectedTheme)
  }, [appearance.theme, appearance.customTheme])

  return { appearance, updateAppearanceSetting }
}

export function useTheme() {
  const { appearance, updateAppearanceSetting } = useSettings()

  const setTheme = (theme: AppearanceSettings['theme']) => {
    updateAppearanceSetting('theme', theme)
  }

  const toggleTheme = () => {
    const themes: AppearanceSettings['theme'][] = ['dark', 'light', 'system', 'custom']
    const currentIndex = themes.indexOf(appearance.theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  return { theme: appearance.theme, setTheme, toggleTheme }
}

export function useFontSize() {
  const { appearance, updateAppearanceSetting } = useSettings()
  return {
    fontSize: appearance.fontSize,
    setFontSize: (size: AppearanceSettings['fontSize']) => updateAppearanceSetting('fontSize', size),
  }
}

export function useCodeBlockTheme() {
  const { appearance, updateAppearanceSetting } = useSettings()
  return {
    codeBlockTheme: appearance.codeBlockTheme,
    setCodeBlockTheme: (theme: AppearanceSettings['codeBlockTheme']) => updateAppearanceSetting('codeBlockTheme', theme),
  }
}
