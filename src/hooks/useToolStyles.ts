/**
 * Hook to control tool execution styles based on settings
 */

import { useEffect } from 'react'
import { useSettings } from './useSettings'

export function useToolStyles() {
  const { settings } = useSettings()
  const disableSuccessStyle = settings.appearance.disableToolSuccessStyle
  const disableToolCallStyle = settings.appearance.disableToolCallStyle

  useEffect(() => {
    const root = document.documentElement

    // Control tool execution style via CSS variables
    if (disableSuccessStyle) {
      // Remove green success tint — handled at component level by omitting 'success' class
      root.style.setProperty('--toolOutputExpandedMargin', '0px')
    } else {
      // Enable default styling
      root.style.removeProperty('--toolOutputExpandedMargin')
    }

    root.classList.toggle('tool-call-style-disabled', disableToolCallStyle)

    // Cleanup on unmount or setting change
    return () => {
      root.style.removeProperty('--toolOutputExpandedMargin')
      root.classList.remove('tool-call-style-disabled')
    }
  }, [disableSuccessStyle, disableToolCallStyle])

  return { disableSuccessStyle, disableToolCallStyle }
}
