# 设置系统 - 集成指南

本文档说明如何在应用中集成新的设置系统框架。

## 📦 文件结构

```
src/
├── contexts/
│   └── SettingsContext.tsx          # 设置上下文提供者
├── hooks/
│   ├── useSettings.ts               # 设置管理 Hook
│   └── useAppearance.ts            # 外观设置 Hook
├── utils/
│   └── settings.ts                 # 设置工具函数
├── types/
│   └── settings.ts                 # 设置类型定义
└── components/
    └── settings/
        ├── types.ts                # 组件类型
        ├── SettingsPanel.refactored.tsx  # 重构后的设置面板
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

## 🚀 集成步骤

### 1. 在 App.tsx 中包裹 SettingsProvider

```tsx
// src/App.tsx
import { SettingsProvider } from './contexts/SettingsContext'
import SettingsPanel from './components/settings/SettingsPanel.refactored'

function App() {
  return (
    <SettingsProvider>
      {/* 应用其他组件 */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </SettingsProvider>
  )
}
```

### 2. 在组件中使用设置

#### 2.1 基本用法

```tsx
import { useSettings } from '@/hooks/useSettings'

function MyComponent() {
  const { settings, updateSetting, isLoading, error } = useSettings()

  const handleChange = (value: string) => {
    updateSetting('language', 'locale', value)
  }

  if (isLoading) return <div>加载中...</div>
  if (error) return <div>错误: {error.message}</div>

  return (
    <div>
      当前语言: {settings.language.locale}
    </div>
  )
}
```

#### 2.2 使用外观设置

```tsx
import { useAppearance } from '@/hooks/useAppearance'

function App() {
  const { theme, fontSize, messageSpacing } = useAppearance()

  return (
    <div className={theme} style={{ fontSize }}>
      <div className={messageSpacing}>
        内容...
      </div>
    </div>
  )
}
```

### 3. 应用主题到根元素

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
      {/* 应用内容 */}
    </div>
  )
}
```

## 🎨 样式配置

在 `src/index.css` 中添加 CSS 变量：

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

/* 字体大小 */
[data-font-size="small"] {
  font-size: 14px;
}

[data-font-size="medium"] {
  font-size: 16px;
}

[data-font-size="large"] {
  font-size: 18px;
}

/* 主题 */
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
  /* 跟随系统主题 */
}
```

## 🔧 设置应用示例

### 应用侧边栏宽度

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
      {/* 侧边栏内容 */}
    </div>
  )
}
```

### 应用搜索设置

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

  return <input type="search" placeholder="搜索..." />
}
```

### 应用会话设置

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

## 🎯 迁移现有代码

### 迁移 SessionViewer 中的 sidebarWidth

```tsx
// 之前
const [sidebarWidth, setSidebarWidth] = useState(() => {
  const saved = localStorage.getItem('pi-session-manager-sidebar-width')
  return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
})

// 之后
const { settings, updateSetting } = useSettings()
const sidebarWidth = settings.appearance.sidebarWidth

const handleResize = (newWidth: number) => {
  updateSetting('appearance', 'sidebarWidth', newWidth)
}
```

### 迁移语言设置

```tsx
// 之前
const { i18n } = useTranslation()

useEffect(() => {
  const savedLang = localStorage.getItem('app-language')
  if (savedLang) i18n.changeLanguage(savedLang)
}, [])

// 之后 - 已在 SettingsProvider 中自动处理
```

## 📝 类型定义

### AppSettings 类型

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

### useSettings Hook 返回值

```typescript
interface UseSettingsReturn {
  // 状态
  settings: AppSettings
  isLoading: boolean
  error: Error | null
  isDirty: boolean

  // 操作
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

### useAppearance Hook 返回值

```typescript
interface UseAppearanceReturn {
  theme: 'dark' | 'light' | 'system'
  fontSize: 'small' | 'medium' | 'large'
  messageSpacing: 'compact' | 'comfortable' | 'spacious'
  sidebarWidth: number
  codeBlockTheme: 'github' | 'monokai' | 'dracula' | 'one-dark'
}
```

## 🧪 测试

### 测试设置更新

```tsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'

test('更新设置', async () => {
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

## 📚 相关文档

- [设置框架概述](./SETTINGS_FRAMEWORK.md)
- [设置类型定义](../src/types/settings.ts)
- [设置审查报告](./SETTING_SYSTEM_REVIEW.md)
- [任务执行计划](../task/settings-system-completion/README.md)

---

**最后更新**: 2026-01-31