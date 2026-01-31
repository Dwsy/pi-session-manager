export interface AppSettings {
  terminal: {
    defaultTerminal: 'iterm2' | 'terminal' | 'vscode' | 'custom'
    customTerminalCommand?: string
    piCommandPath: string
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
    defaultViewMode: 'list' | 'directory' | 'project'
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
    maxCacheSize: number
  }
}

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

export type SettingsSection =
  | 'terminal'
  | 'appearance'
  | 'language'
  | 'session'
  | 'search'
  | 'export'
  | 'pi-config'
  | 'models'
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