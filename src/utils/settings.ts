/**
 * Settings utility functions
 */

import i18n from '../i18n'
import type { AppSettings } from '../components/settings/types'

export interface ValidationError {
  field: string
  message: string
}

export const settingsValidationRules: Record<string, (value: unknown) => ValidationError | null> = {
  'terminal.piCommandPath': (value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return { field: 'terminal.piCommandPath', message: i18n.t('settings.validation.piCommandPathRequired') }
    }
    return null
  },
  'session.refreshInterval': (value) => {
    if (typeof value !== 'number' || value < 5 || value > 300) {
      return { field: 'session.refreshInterval', message: i18n.t('settings.validation.refreshIntervalRange') }
    }
    return null
  },
  'advanced.maxCacheSize': (value) => {
    if (typeof value !== 'number' || value < 10 || value > 1000) {
      return { field: 'advanced.maxCacheSize', message: i18n.t('settings.validation.cacheSizeRange') }
    }
    return null
  },
  'appearance.sidebarWidth': (value) => {
    if (typeof value !== 'number' || value < 200 || value > 600) {
      return { field: 'appearance.sidebarWidth', message: i18n.t('settings.validation.sidebarWidthRange') }
    }
    return null
  },
}

export function validateSettings(settings: AppSettings): ValidationError[] {
  const errors: ValidationError[] = []

  for (const [field, validator] of Object.entries(settingsValidationRules)) {
    const [section, key] = field.split('.')
    const value = (settings as any)[section]?.[key]
    const error = validator(value)
    if (error) {
      errors.push(error)
    }
  }

  return errors
}

/**
 * Deep merge settings
 */
export function mergeSettings(base: AppSettings, override: Partial<AppSettings>): AppSettings {
  return {
    terminal: { ...base.terminal, ...override.terminal },
    appearance: { ...base.appearance, ...override.appearance },
    language: { ...base.language, ...override.language },
    session: { ...base.session, ...override.session },
    search: { ...base.search, ...override.search },
    export: { ...base.export, ...override.export },
    update: { ...base.update, ...override.update },
    advanced: { ...base.advanced, ...override.advanced },
  }
}

/**
 * Format setting values for display
 */
export function formatSettingValue(_section: string, _key: string, value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? i18n.t('common.enabled') : i18n.t('common.disabled')
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

/**
 * Export settings to JSON
 */
export function exportSettingsToJson(settings: AppSettings): string {
  return JSON.stringify(settings, null, 2)
}

/**
 * Import settings from JSON
 */
export function importSettingsFromJson(json: string): AppSettings | null {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
