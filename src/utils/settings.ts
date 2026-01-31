/**
 * 设置工具函数
 */

import type { AppSettings, ValidationError } from '../types/settings'

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
  section: string,
  key: string,
  value: unknown
): ValidationError | null {
  // TODO: 实现验证逻辑
  return null
}

/**
 * 格式化设置值用于显示
 */
export function formatSettingValue(section: string, key: string, value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '启用' : '禁用'
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
export function parseSettingValue(section: string, key: string, value: string): unknown {
  // TODO: 实现解析逻辑
  return value
}

/**
 * 获取设置的默认值
 */
export function getSettingDefaultValue(section: string, key: string): unknown {
  // TODO: 实现获取默认值逻辑
  return null
}

/**
 * 检查设置是否被修改
 */
export function isSettingModified(
  current: AppSettings,
  original: AppSettings
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
export function resetSectionToDefault(section: keyof AppSettings): Partial<AppSettings> {
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
export function checkSettingsCompatibility(version: string): boolean {
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

/**
 * 获取设置的显示名称
 */
export function getSettingDisplayName(section: string, key: string): string {
  const displayNames: Record<string, Record<string, string>> = {
    terminal: {
      defaultTerminal: '默认终端',
      customTerminalCommand: '自定义终端命令',
      piCommandPath: 'Pi 命令路径',
    },
    appearance: {
      theme: '主题',
      sidebarWidth: '侧边栏宽度',
      fontSize: '字体大小',
      codeBlockTheme: '代码块主题',
      messageSpacing: '消息间距',
    },
    language: {
      locale: '语言',
    },
    session: {
      autoRefresh: '自动刷新',
      refreshInterval: '刷新间隔',
      defaultViewMode: '默认视图模式',
      showMessagePreview: '显示消息预览',
      previewLines: '预览行数',
    },
    search: {
      defaultSearchMode: '默认搜索模式',
      caseSensitive: '区分大小写',
      includeToolCalls: '包含工具调用',
      highlightMatches: '高亮匹配',
    },
    export: {
      defaultFormat: '默认导出格式',
      includeMetadata: '包含元数据',
      includeTimestamps: '包含时间戳',
    },
    advanced: {
      sessionDir: '会话目录',
      cacheEnabled: '启用缓存',
      debugMode: '调试模式',
      maxCacheSize: '最大缓存大小',
    },
  }

  return displayNames[section]?.[key] || key
}