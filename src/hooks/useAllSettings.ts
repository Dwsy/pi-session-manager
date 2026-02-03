import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import i18n from '../i18n'
import type { AppSettings } from '../components/settings/types'

export interface UseAllSettingsReturn {
  settings: AppSettings
  loadSettings: () => Promise<void>
  saveSettings: (newSettings: AppSettings) => Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    defaultTerminal: 'iterm2',
    piCommandPath: 'pi',
  },
  appearance: {
    theme: 'dark',
    sidebarWidth: 320,
    fontSize: 'medium',
    codeBlockTheme: 'github',
    messageSpacing: 'comfortable',
  },
  language: {
    locale: 'zh-CN',
  },
  session: {
    autoRefresh: true,
    refreshInterval: 30,
    defaultViewMode: 'project',
    showMessagePreview: true,
    previewLines: 2,
  },
  search: {
    defaultSearchMode: 'content',
    caseSensitive: false,
    includeToolCalls: false,
    highlightMatches: true,
  },
  export: {
    defaultFormat: 'html',
    includeMetadata: true,
    includeTimestamps: true,
  },
  advanced: {
    sessionDir: '~/.pi/agent/sessions',
    cacheEnabled: true,
    debugMode: false,
    demoMode: false,
    maxCacheSize: 100,
  },
}

export function useAllSettings(): UseAllSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  const loadSettings = useCallback(async () => {
    try {
      // Load Tauri backend settings
      const backendSettings = await invoke('load_app_settings') as any
      
      // Load frontend settings from localStorage
      const frontendSettingsStr = localStorage.getItem('pi-session-manager-settings')
      let frontendSettings: Partial<AppSettings> = {}
      
      if (frontendSettingsStr) {
        try {
          frontendSettings = JSON.parse(frontendSettingsStr)
        } catch (e) {
          console.warn('Failed to parse frontend settings from localStorage')
        }
      }

      // Merge settings with priority: frontend > backend > default
      const mergedSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...backendSettings,
        ...frontendSettings,
        terminal: {
          ...DEFAULT_SETTINGS.terminal,
          ...backendSettings?.terminal,
          ...frontendSettings?.terminal,
        },
        appearance: {
          ...DEFAULT_SETTINGS.appearance,
          ...backendSettings?.appearance,
          ...frontendSettings?.appearance,
        },
        language: {
          ...DEFAULT_SETTINGS.language,
          ...backendSettings?.language,
          ...frontendSettings?.language,
        },
        session: {
          ...DEFAULT_SETTINGS.session,
          ...backendSettings?.session,
          ...frontendSettings?.session,
        },
        search: {
          ...DEFAULT_SETTINGS.search,
          ...backendSettings?.search,
          ...frontendSettings?.search,
        },
        export: {
          ...DEFAULT_SETTINGS.export,
          ...backendSettings?.export,
          ...frontendSettings?.export,
        },
        advanced: {
          ...DEFAULT_SETTINGS.advanced,
          ...backendSettings?.advanced,
          ...frontendSettings?.advanced,
        },
      }

      setSettings(mergedSettings)

      // Apply language setting
      if (mergedSettings.language?.locale) {
        i18n.changeLanguage(mergedSettings.language.locale)
      }
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error)
      setSettings(DEFAULT_SETTINGS)
    }
  }, [])

  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      // Save to localStorage for frontend settings
      localStorage.setItem('pi-session-manager-settings', JSON.stringify(newSettings))
      
      // Update language immediately
      if (newSettings.language?.locale !== settings.language?.locale) {
        i18n.changeLanguage(newSettings.language.locale)
      }
      
      setSettings(newSettings)
    } catch (error) {
      console.error('Failed to save settings:', error)
      throw error
    }
  }, [settings.language?.locale])

  return {
    settings,
    loadSettings,
    saveSettings,
  }
}