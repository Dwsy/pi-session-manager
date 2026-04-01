/**
 * Hook to control tool execution styles based on settings
 */

import { useEffect } from 'react'
import { useSettings } from './useSettings'

export function useToolStyles() {
  const { settings } = useSettings()
  const disableSuccessStyle = settings.appearance.disableToolSuccessStyle

  useEffect(() => {
    const root = document.documentElement

    // Control tool execution style via CSS variables
    if (disableSuccessStyle) {
      // Disable success styling - use transparent to let parent background show through
      root.style.setProperty('--toolExecutionBg', 'transparent')
      root.style.setProperty('--toolSuccessBgOverride', 'transparent')
      root.style.setProperty('--toolSuccessBorderOverride', 'rgba(var(--accent-rgb), 0.12)')
      root.style.setProperty('--toolOutputExpandedMargin', '0px')
    } else {
      // Enable default styling by clearing overrides
      root.style.removeProperty('--toolExecutionBg')
      root.style.removeProperty('--toolSuccessBgOverride')
      root.style.removeProperty('--toolSuccessBorderOverride')
      root.style.removeProperty('--toolOutputExpandedMargin')
    }

    // Cleanup on unmount or setting change
    return () => {
      root.style.removeProperty('--toolExecutionBg')
      root.style.removeProperty('--toolSuccessBgOverride')
      root.style.removeProperty('--toolSuccessBorderOverride')
      root.style.removeProperty('--toolOutputExpandedMargin')
    }
  }, [disableSuccessStyle])

  return { disableSuccessStyle }
}
