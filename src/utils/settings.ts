/**
 * 设置工具函数
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
 * 深度合并设置
 */
export function mergeSettings(base: AppSettings, override: Partial<AppSettings>): AppSettings {
  return {
    terminal: { ...base.terminal, ...override.terminal },
    appearance: { ...base.appearance, ...override.appearance },
    language: { ...base.language, ...override.language },
    session: { ...base.session, ...override.session },
    search: { ...base.search, ...override.search },
    export: { ...base.export, ...override.export },
    advanced: { ...base.advanced, ...override.advanced },
  }
}

/**
 * 验证设置值
 */
export function validateSettingValue(
  _section: string,
  _key: string,
  _value: unknown
): ValidationError | null {
  // TODO: 实现验证逻辑
  return null
}

/**
 * 格式化设置值用于显示
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
 * 解析设置值从字符串
 */
export function parseSettingValue(_section: string, _key: string, value: string): unknown {
  // TODO: 实现解析逻辑
  return value
}

/**
 * 获取设置的默认值
 */
export function getSettingDefaultValue(_section: string, _key: string): unknown {
  // TODO: 实现获取默认值逻辑
  return null
}

/**
 * 检查设置是否被修改
 */
export function isSettingModified(
  _current: AppSettings,
  _original: AppSettings
): { modified: boolean; modifiedFields: string[] } {
  const modifiedFields: string[] = []

  // TODO: 实现比较逻辑

  return {
    modified: modifiedFields.length > 0,
    modifiedFields,
  }
}

/**
 * 重置设置到默认值
 */
export function resetSectionToDefault(_section: keyof AppSettings): Partial<AppSettings> {
  // TODO: 实现重置逻辑
  return {}
}

/**
 * 导出设置为 JSON
 */
export function exportSettingsToJson(settings: AppSettings): string {
  return JSON.stringify(settings, null, 2)
}

/**
 * 从 JSON 导入设置
 */
export function importSettingsFromJson(json: string): AppSettings | null {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * 检查设置版本兼容性
 */
export function checkSettingsCompatibility(_version: string): boolean {
  // TODO: 实现版本检查
  return true
}

/**
 * 迁移旧版本设置
 */
export function migrateSettings(oldSettings: any): AppSettings {
  // TODO: 实现迁移逻辑
  return oldSettings as AppSettings
}
