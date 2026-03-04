import { getCachedSettings } from '../utils/settingsApi'

export function isDemoModeEnabled(): boolean {
  try {
    return getCachedSettings()?.advanced?.demoMode === true
  } catch (error) {
    console.error('[demo] Failed to resolve demo mode:', error)
    return false
  }
}
