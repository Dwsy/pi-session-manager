import { useAllSettings } from './useAllSettings'

/**
 * Hook to get the current code block theme from settings
 */
export function useCodeTheme() {
  const { settings } = useAllSettings()
  return settings.appearance.codeBlockTheme
}
