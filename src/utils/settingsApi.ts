import { invoke } from '../transport'
import type { AppSettings } from '../components/settings/types'
import { defaultSettings } from '../components/settings/types'

const CACHE_KEY = 'pi-session-manager-settings'

let memoryCache: AppSettings | null = null

function mergeDefaults(raw: Partial<AppSettings>): AppSettings {
  const advanced = { ...defaultSettings.advanced, ...raw.advanced }

  // Migrate legacy sessionDir (string) → sessionDirs (string[])
  const rawAdv = raw.advanced as Record<string, unknown> | undefined
  if (rawAdv && typeof rawAdv.sessionDir === 'string' && !rawAdv.sessionDirs) {
    const legacyDir = rawAdv.sessionDir as string
    advanced.sessionDirs = legacyDir === '~/.pi/agent/sessions'
      ? ['~/.pi/agent/sessions']
      : ['~/.pi/agent/sessions', legacyDir]
  }

  // Migrate legacy appearance keys
  const rawAppearance = raw.appearance as Record<string, unknown> | undefined
  const legacyChatTheme = typeof rawAppearance?.chatTheme === 'string' ? rawAppearance.chatTheme : undefined
  const legacyUiFontFamily = typeof rawAppearance?.uiFontFamily === 'string' ? rawAppearance.uiFontFamily : undefined
  const legacyMonoFontFamily = typeof rawAppearance?.monoFontFamily === 'string' ? rawAppearance.monoFontFamily : undefined

  const rawTheme = typeof rawAppearance?.theme === 'string' ? rawAppearance.theme : undefined
  const migratedTheme: AppSettings['appearance']['theme'] =
    rawTheme === 'dark' || rawTheme === 'light' || rawTheme === 'system' || rawTheme === 'custom'
      ? rawTheme
      : legacyChatTheme
        ? 'custom'
        : defaultSettings.appearance.theme

  const appearance = {
    ...defaultSettings.appearance,
    ...raw.appearance,
    theme: migratedTheme,
    customTheme: raw.appearance?.customTheme ?? legacyChatTheme ?? defaultSettings.appearance.customTheme,
    fontFamily: raw.appearance?.fontFamily ?? legacyUiFontFamily ?? defaultSettings.appearance.fontFamily,
    fontFamilyMono: raw.appearance?.fontFamilyMono ?? legacyMonoFontFamily ?? defaultSettings.appearance.fontFamilyMono,
  }

  return {
    terminal: { ...defaultSettings.terminal, ...raw.terminal },
    appearance,
    language: { ...defaultSettings.language, ...raw.language },
    session: { ...defaultSettings.session, ...raw.session },
    search: { ...defaultSettings.search, ...raw.search },
    export: { ...defaultSettings.export, ...raw.export },
    advanced,
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

  // Sync session paths to backend config (TOML) so scanner picks them up
  const extraPaths = (settings.advanced.sessionDirs || []).filter(
    (d: string) => d !== '~/.pi/agent/sessions' && d.trim() !== ''
  )
  try {
    await invoke('save_session_paths', { paths: extraPaths })
  } catch (e) {
    console.warn('Failed to sync session paths:', e)
  }
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
