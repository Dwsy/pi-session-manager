import { useEffect } from 'react'
import { useSettings } from './useSettings'
import type { AppSettings } from '../components/settings/types'

export type AppearanceSettings = AppSettings['appearance']

function applyThemeClass(theme: AppearanceSettings['theme']) {
  const root = document.documentElement
  root.classList.remove('theme-dark', 'theme-light')

  if (theme === 'dark') {
    root.classList.add('theme-dark')
  } else if (theme === 'light') {
    root.classList.add('theme-light')
  }
  // system: no class — CSS @media handles it
}

export function useAppearance() {
  const { appearance, updateAppearanceSetting } = useSettings()

  useEffect(() => {
    applyThemeClass(appearance.theme)
    document.documentElement.style.setProperty('--sidebar-width', `${appearance.sidebarWidth}px`)
  }, [appearance.theme, appearance.sidebarWidth])

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
    document.documentElement.style.setProperty('--font-size-base', fontSizeMap[appearance.fontSize])
  }, [appearance.fontSize])

  useEffect(() => {
    const spacingMap = { compact: '8px', comfortable: '16px', spacious: '24px' }
    document.documentElement.style.setProperty('--spacing-base', spacingMap[appearance.messageSpacing])
  }, [appearance.messageSpacing])

  useEffect(() => {
    document.documentElement.setAttribute('data-code-theme', appearance.codeBlockTheme || 'github')
  }, [appearance.codeBlockTheme])

  return { appearance, updateAppearanceSetting }
}

export function useTheme() {
  const { appearance, updateAppearanceSetting } = useSettings()

  const setTheme = (theme: AppearanceSettings['theme']) => {
    updateAppearanceSetting('theme', theme)
  }

  const toggleTheme = () => {
    const themes: AppearanceSettings['theme'][] = ['dark', 'light', 'system']
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
