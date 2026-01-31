/**
 * 外观设置 Hook
 * 用于应用主题、字体大小等外观设置
 */

import { useEffect } from 'react'
import { useSettings } from './useSettings'
import type { AppearanceSettings } from '../types/settings'

/**
 * 使用外观设置 Hook
 * 自动应用外观设置到 DOM
 */
export function useAppearance() {
  const { appearance, updateAppearanceSetting } = useSettings()

  // 应用主题
  useEffect(() => {
    const root = document.documentElement

    // 移除旧的主题类
    root.classList.remove('theme-dark', 'theme-light')

    // 应用新主题
    if (appearance.theme === 'dark') {
      root.classList.add('theme-dark')
    } else if (appearance.theme === 'light') {
      root.classList.add('theme-light')
    }
    // 如果是 system，不添加任何类，让系统决定

    // 设置 CSS 变量
    root.style.setProperty('--sidebar-width', `${appearance.sidebarWidth}px`)
  }, [appearance.theme, appearance.sidebarWidth])

  // 应用字体大小
  useEffect(() => {
    const root = document.documentElement
    const fontSizeMap = {
      small: '14px',
      medium: '16px',
      large: '18px',
    }
    root.style.setProperty('--font-size-base', fontSizeMap[appearance.fontSize])
  }, [appearance.fontSize])

  // 应用消息间距
  useEffect(() => {
    const root = document.documentElement
    const spacingMap = {
      compact: '8px',
      comfortable: '16px',
      spacious: '24px',
    }
    root.style.setProperty('--spacing-base', spacingMap[appearance.messageSpacing])
  }, [appearance.messageSpacing])

  return {
    appearance,
    updateAppearanceSetting,
  }
}

/**
 * 使用主题 Hook
 * 快速访问和更新主题
 */
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

  return {
    theme: appearance.theme,
    setTheme,
    toggleTheme,
  }
}

/**
 * 使用字体大小 Hook
 * 快速访问和更新字体大小
 */
export function useFontSize() {
  const { appearance, updateAppearanceSetting } = useSettings()

  const setFontSize = (size: AppearanceSettings['fontSize']) => {
    updateAppearanceSetting('fontSize', size)
  }

  return {
    fontSize: appearance.fontSize,
    setFontSize,
  }
}

/**
 * 使用代码块主题 Hook
 * 快速访问和更新代码块主题
 */
export function useCodeBlockTheme() {
  const { appearance, updateAppearanceSetting } = useSettings()

  const setCodeBlockTheme = (theme: AppearanceSettings['codeBlockTheme']) => {
    updateAppearanceSetting('codeBlockTheme', theme)
  }

  return {
    codeBlockTheme: appearance.codeBlockTheme,
    setCodeBlockTheme,
  }
}