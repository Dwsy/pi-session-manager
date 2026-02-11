import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AppSettings } from '../components/settings/types'
import { defaultSettings } from '../components/settings/types'
import { loadAppSettings, saveAppSettings } from '../utils/settingsApi'

interface SettingsContextType {
  settings: AppSettings
  loading: boolean
  saving: boolean
  error: string | null
  updateSetting: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]]
  ) => void
  resetSettings: () => void
  saveSettings: () => Promise<void>
  reloadSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

interface SettingsProviderProps {
  children: ReactNode
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await loadAppSettings()
      setSettings(s)
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError('加载设置失败')
    } finally {
      setLoading(false)
    }
  }

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveAppSettings(settings)
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError('保存设置失败')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }))
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
  }

  const reloadSettings = async () => {
    await loadSettings()
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const value: SettingsContextType = {
    settings,
    loading,
    saving,
    error,
    updateSetting,
    resetSettings,
    saveSettings: doSave,
    reloadSettings,
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
