import { invoke } from '../transport'
import type { AppSettings } from '../components/settings/types'
import { defaultSettings } from '../components/settings/types'

const CACHE_KEY = 'pi-session-manager-settings'

let memoryCache: AppSettings | null = null

function mergeDefaults(raw: Partial<AppSettings>): AppSettings {
  return {
    terminal: { ...defaultSettings.terminal, ...raw.terminal },
    appearance: { ...defaultSettings.appearance, ...raw.appearance },
    language: { ...defaultSettings.language, ...raw.language },
    session: { ...defaultSettings.session, ...raw.session },
    search: { ...defaultSettings.search, ...raw.search },
    export: { ...defaultSettings.export, ...raw.export },
    advanced: { ...defaultSettings.advanced, ...raw.advanced },
  }
}

function writeCache(settings: AppSettings) {
  memoryCache = settings
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
    if (settings.language?.locale) {
      localStorage.setItem('app-language', settings.language.locale)
    }
  } catch {}
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await invoke<Partial<AppSettings>>('load_app_settings')
    const settings = mergeDefaults(raw ?? {})
    writeCache(settings)
    return settings
  } catch (e) {
    console.warn('Failed to load settings from backend, using cache/defaults:', e)
    return getCachedSettings()
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await invoke('save_app_settings', { settings })
  writeCache(settings)
}

export function getCachedSettings(): AppSettings {
  if (memoryCache) return memoryCache
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      const settings = mergeDefaults(parsed)
      memoryCache = settings
      return settings
    }
  } catch {}
  return defaultSettings
}
