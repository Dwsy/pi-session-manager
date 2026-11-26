/**
 * Reactive hook that returns the current resolved Shiki theme name.
 * Re-renders when data-code-theme, active chat theme markers, or theme-dark/theme-light class changes.
 */
import { useCallback, useEffect, useState } from 'react'
import { resolveShikiTheme } from '@/utils/codeThemes'

export function useResolvedCodeTheme(): string {
  const resolve = useCallback(() => {
    const codeTheme = document.documentElement.getAttribute('data-code-theme') || 'github'
    return resolveShikiTheme(codeTheme)
  }, [])

  const [theme, setTheme] = useState(resolve)

  useEffect(() => {
    const root = document.documentElement

    // Watch for data-code-theme, active Pi/Base46/Codex chat theme markers, and theme-dark/theme-light class toggles
    const observer = new MutationObserver(() => {
      setTheme(resolve())
    })

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-code-theme', 'data-chat-theme', 'data-chat-theme-scheme', 'class'],
    })

    return () => observer.disconnect()
  }, [resolve])

  return theme
}
