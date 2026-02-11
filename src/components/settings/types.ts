export type TerminalType =
  | 'iterm2' | 'terminal' | 'vscode' | 'custom'
  | 'powershell' | 'cmd' | 'windows-terminal'
  | 'gnome-terminal' | 'konsole' | 'xterm'

export type Platform = 'macos' | 'windows' | 'linux'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent || navigator.platform || ''
  if (/Win/i.test(ua)) return 'windows'
  if (/Mac/i.test(ua)) return 'macos'
  return 'linux'
}

export function getPlatformDefaults(): { defaultTerminal: TerminalType; defaultShell: string } {
  switch (detectPlatform()) {
    case 'windows':
      return { defaultTerminal: 'powershell', defaultShell: 'powershell.exe' }
    case 'linux':
      return { defaultTerminal: 'gnome-terminal', defaultShell: '/bin/bash' }
    default:
      return { defaultTerminal: 'iterm2', defaultShell: '/bin/zsh' }
  }
}

export interface AppSettings {
  terminal: {
    defaultTerminal: TerminalType
    customTerminalCommand?: string
    piCommandPath: string
    builtinTerminalEnabled: boolean
    defaultShell: string
    terminalFontSize: number
  }
  appearance: {
    theme: 'dark' | 'light' | 'system'
    sidebarWidth: number
    fontSize: 'small' | 'medium' | 'large'
    codeBlockTheme: 'github' | 'monokai' | 'dracula' | 'one-dark'
    messageSpacing: 'compact' | 'comfortable' | 'spacious'
  }
  language: {
    locale: string
  }
  session: {
    autoRefresh: boolean
    refreshInterval: number
    defaultViewMode: 'list' | 'directory' | 'project' | 'kanban'
    showMessagePreview: boolean
    previewLines: number
  }
  search: {
    defaultSearchMode: 'content' | 'name'
    caseSensitive: boolean
    includeToolCalls: boolean
    highlightMatches: boolean
  }
  export: {
    defaultFormat: 'html' | 'md' | 'json'
    includeMetadata: boolean
    includeTimestamps: boolean
  }
  advanced: {
    sessionDir: string
    cacheEnabled: boolean
    debugMode: boolean
    demoMode: boolean
    maxCacheSize: number
  }
}

/**
 * 检测系统语言，优先使用用户已保存的偏好
 */
function getDefaultLocale(): string {
  const saved = localStorage.getItem('app-language')
  if (saved) return saved
  const lang = navigator.language || 'en-US'
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US'
}

const platformDefaults = getPlatformDefaults()

export const defaultSettings: AppSettings = {
  terminal: {
    defaultTerminal: platformDefaults.defaultTerminal,
    piCommandPath: 'pi',
    builtinTerminalEnabled: true,
    defaultShell: platformDefaults.defaultShell,
    terminalFontSize: 13,
  },
  appearance: {
    theme: 'dark',
    sidebarWidth: 320,
    fontSize: 'medium',
    codeBlockTheme: 'github',
    messageSpacing: 'comfortable',
  },
  language: {
    locale: getDefaultLocale(),
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
    demoMode: false,
    maxCacheSize: 100,
  },
}

export type SettingsSection =
  | 'terminal'
  | 'appearance'
  | 'language'
  | 'session'
  | 'tags'
  | 'search'
  | 'export'
  | 'pi-config'
  | 'models'
  | 'shortcuts'
  | 'advanced'

export type SettingsProps<T extends keyof AppSettings> = {
  settings: AppSettings
  onUpdate: (section: T, key: keyof AppSettings[T], value: any) => void
}

export interface TerminalSettingsProps extends SettingsProps<'terminal'> {}
export interface AppearanceSettingsProps extends SettingsProps<'appearance'> {}
export interface LanguageSettingsProps extends SettingsProps<'language'> {}
export interface SessionSettingsProps extends SettingsProps<'session'> {}
export interface SearchSettingsProps extends SettingsProps<'search'> {}
export interface ExportSettingsProps extends SettingsProps<'export'> {}
export interface AdvancedSettingsProps extends SettingsProps<'advanced'> {}