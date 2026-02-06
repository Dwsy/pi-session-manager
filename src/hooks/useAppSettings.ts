import { useState, useCallback } from 'react'
import { invoke } from '../transport'
import i18n from '../i18n'

export type TerminalType = 'iterm2' | 'terminal' | 'vscode' | 'custom'

export interface UseAppSettingsReturn {
  terminal: TerminalType
  piPath: string
  customCommand: string
  loadSettings: () => Promise<void>
}

export function useAppSettings(): UseAppSettingsReturn {
  const [terminal, setTerminal] = useState<TerminalType>('iterm2')
  const [piPath, setPiPath] = useState<string>('pi')
  const [customCommand, setCustomCommand] = useState<string>('')

  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke('load_app_settings') as any
      if (settings?.terminal) {
        setTerminal(settings.terminal.default_terminal || 'iterm2')
        setPiPath(settings.terminal.pi_command_path || 'pi')
        setCustomCommand(settings.terminal.custom_terminal_command || '')
      }

      const frontendSettings = localStorage.getItem('pi-session-manager-settings')
      if (frontendSettings) {
        const parsed = JSON.parse(frontendSettings)
        if (parsed?.language?.locale) {
          i18n.changeLanguage(parsed.language.locale)
        }
      }
    } catch (error) {
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
