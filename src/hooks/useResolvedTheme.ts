import { useEffect, useState } from 'react'

/**
 * 获取当前实际使用的主题（解析 system 主题）
 * @returns 'dark' | 'light'
 */
export function useResolvedTheme(): 'dark' | 'light' {
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => {
    // Initialize: check DOM class or system preference
    if (document.documentElement.classList.contains('theme-dark')) {
      return 'dark'
    }
    if (document.documentElement.classList.contains('theme-light')) {
      return 'light'
    }
    // If no class name, use system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    const updateTheme = () => {
      if (document.documentElement.classList.contains('theme-dark')) {
        setResolvedTheme('dark')
      } else if (document.documentElement.classList.contains('theme-light')) {
        setResolvedTheme('light')
      } else {
        // system theme: use system preference
        setResolvedTheme(
          window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        )
      }
    }

    // Listen for DOM class changes
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      // Only respond to system changes when in system theme
      if (
        !document.documentElement.classList.contains('theme-dark') &&
        !document.documentElement.classList.contains('theme-light')
      ) {
        updateTheme()
      }
    }
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      observer.disconnect()
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return resolvedTheme
}
