import { useState, useCallback } from 'react'
import i18n from '../i18n'
import { loadAppSettings } from '../utils/settingsApi'
import { type TerminalType, getPlatformDefaults } from '../components/settings/types'

export type { TerminalType }

const platformDefaults = getPlatformDefaults()

export interface UseAppSettingsReturn {
  terminal: TerminalType
  piPath: string
  customCommand: string
  loadSettings: () => Promise<void>
}

export function useAppSettings(): UseAppSettingsReturn {
  const [terminal, setTerminal] = useState<TerminalType>(platformDefaults.defaultTerminal)
  const [piPath, setPiPath] = useState<string>('pi')
  const [customCommand, setCustomCommand] = useState<string>('')

  const loadSettings = useCallback(async () => {
    try {
      const settings = await loadAppSettings()
      if (settings?.terminal) {
        setTerminal(settings.terminal.defaultTerminal || platformDefaults.defaultTerminal)
        setPiPath(settings.terminal.piCommandPath || 'pi')
        setCustomCommand(settings.terminal.customTerminalCommand || '')
      }
      if (settings?.language?.locale) {
        i18n.changeLanguage(settings.language.locale)
      }
    } catch {
      // Silently fail during initialization
    }
  }, [])

  return {
    terminal,
    piPath,
    customCommand,
    loadSettings,
  }
}
