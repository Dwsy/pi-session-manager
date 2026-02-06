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
    codeBlockTheme: 
      | 'github-dark'
      | 'github-light'
      | 'github-dark-dimmed'
      | 'github-dark-high-contrast'
      | 'github-light-high-contrast'
      | 'dark-plus'
      | 'light-plus'
      | 'monokai'
      | 'dracula'
      | 'dracula-soft'
      | 'one-dark-pro'
      | 'one-light'
      | 'nord'
      | 'tokyo-night'
      | 'catppuccin-mocha'
      | 'catppuccin-latte'
      | 'catppuccin-frappe'
      | 'catppuccin-macchiato'
      | 'rose-pine'
      | 'rose-pine-moon'
      | 'rose-pine-dawn'
      | 'vitesse-dark'
      | 'vitesse-light'
      | 'vitesse-black'
      | 'solarized-dark'
      | 'solarized-light'
      | 'gruvbox-dark-medium'
      | 'gruvbox-light-medium'
      | 'material-theme'
      | 'material-theme-darker'
      | 'material-theme-lighter'
      | 'material-theme-ocean'
      | 'material-theme-palenight'
      | 'night-owl'
      | 'synthwave-84'
      | 'ayu-dark'
      | 'everforest-dark'
      | 'everforest-light'
      | 'min-dark'
      | 'min-light'
    mermaidRenderMode: 'ascii' | 'svg'
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
    demoMode: boolean
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
    codeBlockTheme: 'github-dark',
    mermaidRenderMode: 'svg',
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
    demoMode: false,
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
