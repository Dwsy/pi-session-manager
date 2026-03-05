import { getCachedSettings } from '../utils/settingsApi'

function isDemoPage(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.location.pathname.endsWith('/demo.html')
}

export function isDemoModeEnabled(): boolean {
  if (import.meta.env.MODE === 'demo' || isDemoPage()) {
    return true
  }

  try {
    return getCachedSettings()?.advanced?.demoMode === true
  } catch (error) {
    console.error('[demo] Failed to resolve demo mode:', error)
    return false
  }
}
