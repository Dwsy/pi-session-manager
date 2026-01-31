/**
 * 设置系统类型定义
 */

// 终端设置
export interface TerminalSettings {
  defaultTerminal: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  customTerminalCommand?: string
  piCommandPath: string
}

// 外观设置
export interface AppearanceSettings {
  theme: 'dark' | 'light' | 'system'
  sidebarWidth: number
  fontSize: 'small' | 'medium' | 'large'
  codeBlockTheme: 'github' | 'monokai' | 'dracula' | 'one-dark'
  messageSpacing: 'compact' | 'comfortable' | 'spacious'
}

// 语言设置
export interface LanguageSettings {
  locale: string
}

// 会话设置
export interface SessionSettings {
  autoRefresh: boolean
  refreshInterval: number
  defaultViewMode: 'list' | 'directory' | 'project'
  showMessagePreview: boolean
  previewLines: number
}

// 搜索设置
export interface SearchSettings {
  defaultSearchMode: 'content' | 'name'
  caseSensitive: boolean
  includeToolCalls: boolean
  highlightMatches: boolean
}

// 导出设置
export interface ExportSettings {
  defaultFormat: 'html' | 'md' | 'json'
  includeMetadata: boolean
  includeTimestamps: boolean
}

// 高级设置
export interface AdvancedSettings {
  sessionDir: string
  cacheEnabled: boolean
  debugMode: boolean
  maxCacheSize: number
}

// Pi 配置（独立于 AppSettings）
export interface PiConfigSettings {
  skills: string[]
  prompts: string[]
  extensions: string[]
}

// 完整的应用设置
export interface AppSettings {
  terminal: TerminalSettings
  appearance: AppearanceSettings
  language: LanguageSettings
  session: SessionSettings
  search: SearchSettings
  export: ExportSettings
  advanced: AdvancedSettings
}

// 设置验证错误
export interface ValidationError {
  field: string
  message: string
}

// 设置变更事件
export interface SettingsChangeEvent {
  section: keyof AppSettings
  key: string
  oldValue: unknown
  newValue: unknown
}

// 设置导入/导出格式
export interface SettingsExport {
  version: string
  exportedAt: string
  settings: AppSettings
}

// 默认设置
export const defaultSettings: AppSettings = {
  terminal: {
    defaultTerminal: 'iterm2',
    piCommandPath: 'pi',
  },
  appearance: {
    theme: 'dark',
    sidebarWidth: 320,
    fontSize: 'medium',
    codeBlockTheme: 'github',
    messageSpacing: 'comfortable',
  },
  language: {
    locale: 'zh-CN',
  },
  session: {
    autoRefresh: true,
    refreshInterval: 30,
    defaultViewMode: 'project',
    showMessagePreview: true,
    previewLines: 2,
  },
  search: {
    defaultSearchMode: 'content',
    caseSensitive: false,
    includeToolCalls: false,
    highlightMatches: true,
  },
  export: {
    defaultFormat: 'html',
    includeMetadata: true,
    includeTimestamps: true,
  },
  advanced: {
    sessionDir: '~/.pi/agent/sessions',
    cacheEnabled: true,
    debugMode: false,
    maxCacheSize: 100,
  },
}

// 设置验证规则
export const settingsValidationRules: Record<string, (value: unknown) => ValidationError | null> = {
  'terminal.piCommandPath': (value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return { field: 'terminal.piCommandPath', message: 'Pi 命令路径不能为空' }
    }
    return null
  },
  'session.refreshInterval': (value) => {
    if (typeof value !== 'number' || value < 5 || value > 300) {
      return { field: 'session.refreshInterval', message: '刷新间隔必须在 5-300 秒之间' }
    }
    return null
  },
  'advanced.maxCacheSize': (value) => {
    if (typeof value !== 'number' || value < 10 || value > 1000) {
      return { field: 'advanced.maxCacheSize', message: '缓存大小必须在 10-1000 MB 之间' }
    }
    return null
  },
  'appearance.sidebarWidth': (value) => {
    if (typeof value !== 'number' || value < 200 || value > 600) {
      return { field: 'appearance.sidebarWidth', message: '侧边栏宽度必须在 200-600 px 之间' }
    }
    return null
  },
}

// 验证设置
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