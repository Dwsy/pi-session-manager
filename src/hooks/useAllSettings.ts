import { useState, useCallback } from 'react'
import i18n from '../i18n'
import type { AppSettings } from '../components/settings/types'
import { defaultSettings } from '../components/settings/types'
import { loadAppSettings, saveAppSettings } from '../utils/settingsApi'

export interface UseAllSettingsReturn {
  settings: AppSettings
  loadSettings: () => Promise<void>
  saveSettings: (newSettings: AppSettings) => Promise<void>
}

export function useAllSettings(): UseAllSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  const loadSettings = useCallback(async () => {
    try {
      const s = await loadAppSettings()
      setSettings(s)
      if (s.language?.locale) {
        i18n.changeLanguage(s.language.locale)
      }
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error)
      setSettings(defaultSettings)
    }
  }, [])

  const doSave = useCallback(async (newSettings: AppSettings) => {
    try {
      await saveAppSettings(newSettings)
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
    saveSettings: doSave,
  }
}
