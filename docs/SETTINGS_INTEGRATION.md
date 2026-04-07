# Settings System - Integration Guide

This document explains how to integrate the new settings system framework into the application.

## 📦 File Structure

```
src/
├── contexts/
│   └── SettingsContext.tsx          # Settings context provider
├── hooks/
│   ├── useSettings.ts               # Settings management hook
│   └── useAppearance.ts            # Appearance settings hook
├── utils/
│   └── settings.ts                 # Settings utility functions
├── types/
│   └── settings.ts                 # Settings type definitions
└── components/
    └── settings/
        ├── types.ts                # Component types
        ├── SettingsPanel.refactored.tsx  # Refactored settings panel
        └── sections/
            ├── TerminalSettings.tsx
            ├── AppearanceSettings.tsx
            ├── LanguageSettings.tsx
            ├── SessionSettings.tsx
            ├── SearchSettings.tsx
            ├── ExportSettings.tsx
            ├── PiConfigSettings.tsx
            └── AdvancedSettings.tsx
```

## 🚀 Integration Steps

### 1. Wrap SettingsProvider in App.tsx

```tsx
// src/App.tsx
import { SettingsProvider } from './contexts/SettingsContext'
import SettingsPanel from './components/settings/SettingsPanel.refactored'

function App() {
  return (
    <SettingsProvider>
      {/* Other application components */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </SettingsProvider>
  )
}
```

### 2. Use Settings in Components

#### 2.1 Basic Usage

```tsx
import { useSettings } from '@/hooks/useSettings'

function MyComponent() {
  const { settings, updateSetting, isLoading, error } = useSettings()

  const handleChange = (value: string) => {
    updateSetting('language', 'locale', value)
  }

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      Current language: {settings.language.locale}
    </div>
  )
}
```

#### 2.2 Using Appearance Settings

```tsx
import { useAppearance } from '@/hooks/useAppearance'

function App() {
  const { theme, fontSize, messageSpacing } = useAppearance()

  return (
    <div className={theme} style={{ fontSize }}>
      <div className={messageSpacing}>
        Content...
      </div>
    </div>
  )
}
```

### 3. Apply Theme to Root Element

```tsx
import { useAppearance } from '@/hooks/useAppearance'

function App() {
  const { theme, fontSize, messageSpacing } = useAppearance()

  return (
    <div
      className={`app-root ${theme}`}
      style={{
        '--font-size-base': fontSize === 'small' ? '14px' : fontSize === 'medium' ? '16px' : '18px',
        '--spacing-base': messageSpacing === 'compact' ? '4px' : messageSpacing === 'comfortable' ? '8px' : '16px',
      }}
    >
      {/* Application content */}
    </div>
  )
}
```

## 🎨 Style Configuration

Add CSS variables in `src/index.css`:

```css
:root {
  --font-size-base: 16px;
  --spacing-base: 8px;
  --color-primary: #569cd6;
  --color-secondary: #6a6f85;
  --color-bg: #1e1f2e;
  --color-bg-secondary: #191a26;
  --color-border: #2c2d3b;
  --color-text: #ffffff;
}

/* Font sizes */
[data-font-size="small"] {
  font-size: 14px;
}
[data-font-size="medium"] {
  font-size: 16px;
}
[data-font-size="large"] {
  font-size: 18px;
}

/* Themes */
[data-theme="dark"] {
  --color-bg: #1e1f2e;
  --color-bg-secondary: #191a26;
  --color-text: #ffffff;
}
[data-theme="light"] {
  --color-bg: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-text: #000000;
}
[data-theme="system"] {
  /* Follow system theme */
}
```

## 🔧 Settings Application Examples

### Apply Sidebar Width

```tsx
import { useSettings } from '@/hooks/useSettings'

function SessionViewer() {
  const { settings, updateSetting } = useSettings()
  const sidebarWidth = settings.appearance.sidebarWidth

  const handleResize = (newWidth: number) => {
    updateSetting('appearance', 'sidebarWidth', newWidth)
  }

  return (
    <div style={{ width: `${sidebarWidth}px` }}>
      {/* Sidebar content */}
    </div>
  )
}
```

### Apply Search Settings

```tsx
import { useSettings } from '@/hooks/useSettings'

function SearchComponent() {
  const { settings } = useSettings()
  const searchConfig = settings.search

  const handleSearch = async (query: string) => {
    const results = await invoke('search_sessions', {
      query,
      caseSensitive: searchConfig.caseSensitive,
      includeToolCalls: searchConfig.includeToolCalls,
    })
    return results
  }

  return <input type="search" placeholder="Search..." />
}
```

### Apply Session Settings

```tsx
import { useSettings } from '@/hooks/useSettings'
import { useEffect } from 'react'

function SessionList() {
  const { settings } = useSettings()
  const { autoRefresh, refreshInterval, showMessagePreview, previewLines } = settings.session

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      loadSessions()
    }, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval])

  return (
    <div>
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          showPreview={showMessagePreview}
          previewLines={previewLines}
        />
      ))}
    </div>
  )
}
```

## 🎯 Migrating Existing Code

### Migrate sidebarWidth in SessionViewer

```tsx
// Before
const [sidebarWidth, setSidebarWidth] = useState(() => {
  const saved = localStorage.getItem('pi-session-manager-sidebar-width')
  return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
})

// After
const { settings, updateSetting } = useSettings()
const sidebarWidth = settings.appearance.sidebarWidth

const handleResize = (newWidth: number) => {
  updateSetting('appearance', 'sidebarWidth', newWidth)
}
```

### Migrate Language Settings

```tsx
// Before
const { i18n } = useTranslation()
useEffect(() => {
  const savedLang = localStorage.getItem('app-language')
  if (savedLang) i18n.changeLanguage(savedLang)
}, [])

// After - Automatically handled in SettingsProvider
```

## 📝 Type Definitions

### AppSettings Type

```typescript
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
```

### useSettings Hook Return Value

```typescript
interface UseSettingsReturn {
  // State
  settings: AppSettings
  isLoading: boolean
  error: Error | null
  isDirty: boolean

  // Actions
  updateSetting: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]]
  ) => Promise<void>
  resetSettings: () => Promise<void>
  saveSettings: () => Promise<void>
  reloadSettings: () => Promise<void>
}
```

### useAppearance Hook Return Value

```typescript
interface UseAppearanceReturn {
  theme: 'dark' | 'light' | 'system'
  fontSize: 'small' | 'medium' | 'large'
  messageSpacing: 'compact' | 'comfortable' | 'spacious'
  sidebarWidth: number
  codeBlockTheme: 'github' | 'monokai' | 'dracula' | 'one-dark'
}
```

## 🧪 Testing

### Test Settings Update

```tsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'

test('update settings', async () => {
  const wrapper = ({ children }) => (
    <SettingsProvider>{children}</SettingsProvider>
  )

  const { result } = renderHook(() => useSettings(), { wrapper })

  await act(async () => {
    await result.current.updateSetting('language', 'locale', 'en-US')
  })

  expect(result.current.settings.language.locale).toBe('en-US')
})
```

## 📚 Related Documentation

- [Settings Framework Overview](./SETTINGS_FRAMEWORK.md)
- [Settings Type Definitions](../src/types/settings.ts)
- [Settings Review Report](./SETTING_SYSTEM_REVIEW.md)
- [Task Execution Plan](../task/settings-system-completion/README.md)

---

**Last Updated**: 2026-01-31
