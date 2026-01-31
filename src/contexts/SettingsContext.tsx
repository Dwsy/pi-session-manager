import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AppSettings } from '../components/settings/types'
import { defaultSettings } from '../components/settings/types'

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

  // 加载设置
  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      // TODO: 实现从后端加载设置
      // const savedSettings = await invoke<AppSettings>('load_settings')
      // setSettings(savedSettings)

      // 临时：从 localStorage 加载
      const saved = localStorage.getItem('pi-session-manager-settings')
      if (saved) {
        setSettings({ ...defaultSettings, ...JSON.parse(saved) })
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError('加载设置失败')
    } finally {
      setLoading(false)
    }
  }

  // 保存设置
  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    try {
      // TODO: 实现保存到后端
      // await invoke('save_settings', { settings })

      // 临时：保存到 localStorage
      localStorage.setItem('pi-session-manager-settings', JSON.stringify(settings))
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError('保存设置失败')
      throw err
    } finally {
      setSaving(false)
    }
  }

  // 更新设置
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

  // 重置设置
  const resetSettings = () => {
    setSettings(defaultSettings)
  }

  // 重载设置
  const reloadSettings = async () => {
    await loadSettings()
  }

  // 初始化加载
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
    saveSettings,
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