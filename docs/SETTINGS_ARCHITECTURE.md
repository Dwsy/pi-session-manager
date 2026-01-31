# 设置系统 - 架构与设计

## 📐 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         应用层 (UI Components)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ App.tsx      │  │ SessionView  │  │ SessionList  │          │
│  │              │  │ er           │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                      useSettings Hook                            │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                         Context 层                               │
├────────────────────────────┼─────────────────────────────────────┤
│                            │                                     │
│          ┌─────────────────┴─────────────────┐                   │
│          │         SettingsContext         │                   │
│          │  - settings: AppSettings         │                   │
│          │  - updateSetting()               │                   │
│          │  - resetSettings()               │                   │
│          │  - isLoading / error / isDirty    │                   │
│          └─────────────────┬─────────────────┘                   │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                         Service 层                               │
├────────────────────────────┼─────────────────────────────────────┤
│                            │                                     │
│          ┌─────────────────┴─────────────────┐                   │
│          │      SettingsService             │                   │
│          │  - loadSettings()                │                   │
│          │  - saveSettings()                │                   │
│          │  - validateSettings()            │                   │
│          │  - migrateSettings()             │                   │
│          └─────────────────┬─────────────────┘                   │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                    Storage 层 (持久化)                            │
├────────────────────────────┼─────────────────────────────────────┤
│                            │                                     │
│          ┌─────────────────┴─────────────────┐                   │
│          │                                     │                   │
│    ┌─────┴─────┐                       ┌─────┴─────┐             │
│    │ localStorage│                       │ Tauri FS  │             │
│    │  (降级方案) │                       │ (主要方案) │             │
│    └───────────┘                       └───────────┘             │
│          │                                     │                   │
│          └─────────────────┬─────────────────┘                   │
│                            │                                     │
│                  ~/.pi/session-manager/                         │
│                       settings.json                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 数据流

### 加载设置流程

```
1. 应用启动
   │
   ├─→ SettingsProvider 初始化
   │
   ├─→ 调用 SettingsService.loadSettings()
   │
   ├─→ 尝试从 Tauri FS 加载
   │   ├─→ 成功: 返回 settings
   │   └─→ 失败: 降级到 localStorage
   │
   ├─→ 验证设置格式
   │   ├─→ 有效: 使用加载的设置
   │   └─→ 无效: 合并默认值
   │
   ├─→ 更新 Context 状态
   │
   └─→ 触发所有订阅组件重新渲染
```

### 更新设置流程

```
1. 用户在 SettingsPanel 中修改设置
   │
   ├─→ 调用 updateSetting(section, key, value)
   │
   ├─→ 更新 Context 中的 settings 状态
   │
   ├─→ 标记 isDirty = true
   │
   ├─→ 触发所有订阅组件重新渲染
   │
   └─→ (可选) 自动保存到 Tauri FS
       │
       ├─→ SettingsService.saveSettings(settings)
       │
       ├─→ 写入到 ~/.pi/session-manager/settings.json
       │
       └─→ 备份到 localStorage (降级)
```

### 应用设置流程

```
1. 组件使用 useSettings Hook
   │
   ├─→ 订阅 SettingsContext
   │
   ├─→ 获取当前 settings
   │
   ├─→ 根据 settings 应用样式/行为
   │   │
   │   ├─→ theme: 更新根元素类名
   │   ├─→ fontSize: 更新 CSS 变量
   │   ├─→ sidebarWidth: 更新宽度样式
   │   └─→ 其他: 更新组件 props
   │
   └─→ 设置变化时自动重新渲染
```

---

## 🎨 组件层次结构

```
SettingsProvider (Context Provider)
│
├─→ SettingsPanel (设置面板)
│   │
│   ├─→ TerminalSettings (终端设置)
│   │   └─→ useSettings()
│   │
│   ├─→ AppearanceSettings (外观设置)
│   │   └─→ useSettings()
│   │
│   ├─→ LanguageSettings (语言设置)
│   │   └─→ useSettings()
│   │
│   ├─→ SessionSettings (会话设置)
│   │   └─→ useSettings()
│   │
│   ├─→ SearchSettings (搜索设置)
│   │   └─→ useSettings()
│   │
│   ├─→ ExportSettings (导出设置)
│   │   └─→ useSettings()
│   │
│   ├─→ PiConfigSettings (Pi 配置)
│   │   └─→ invoke() (直接调用 Tauri)
│   │
│   └─→ AdvancedSettings (高级设置)
│       └─→ useSettings()
│
├─→ App (应用根组件)
│   │
│   ├─→ useAppearance() (应用主题)
│   │
│   └─→ SessionViewer (会话查看器)
│       │
│       ├─→ useSettings() (获取 sidebarWidth)
│       │
│       └─→ SessionTree
│           │
│           └─→ useSettings() (获取预览设置)
│
├─→ SessionList (会话列表)
│   │
│   └─→ useSettings() (获取预览设置)
│
├─→ SearchPanel (搜索面板)
│   │
│   └─→ useSettings() (获取搜索设置)
│
└─→ ExportDialog (导出对话框)
    │
    └─→ useSettings() (获取导出设置)
```

---

## 📦 模块职责

### SettingsContext (src/contexts/SettingsContext.tsx)

**职责**:
- 提供全局设置状态
- 管理设置的加载、更新、保存
- 处理加载状态和错误
- 提供设置重置功能

**API**:
```typescript
interface SettingsContextValue {
  settings: AppSettings
  isLoading: boolean
  error: Error | null
  isDirty: boolean
  updateSetting: (section, key, value) => Promise<void>
  resetSettings: () => Promise<void>
  saveSettings: () => Promise<void>
  reloadSettings: () => Promise<void>
}
```

### useSettings (src/hooks/useSettings.ts)

**职责**:
- 提供便捷的设置访问接口
- 封装 Context 订阅逻辑
- 提供类型安全的更新方法

**使用场景**:
- 需要访问任意设置
- 需要更新设置
- 需要监听设置变化

### useAppearance (src/hooks/useAppearance.ts)

**职责**:
- 提供外观设置的便捷访问
- 自动应用主题样式

**使用场景**:
- 需要应用主题
- 需要应用字体大小
- 需要应用间距

### SettingsService (src/utils/settings.ts)

**职责**:
- 处理设置的加载和保存
- 验证设置格式
- 处理降级方案 (localStorage)
- 迁移旧版本设置

**API**:
```typescript
class SettingsService {
  static async load(): Promise<AppSettings>
  static async save(settings: AppSettings): Promise<void>
  static validate(settings: unknown): AppSettings
  static migrate(oldSettings: any): AppSettings
}
```

### SettingsPanel (src/components/settings/SettingsPanel.refactored.tsx)

**职责**:
- 提供设置 UI
- 展示当前设置值
- 收集用户输入
- 调用更新方法

### 各设置区块组件

**职责**:
- 提供特定设置的 UI
- 验证用户输入
- 调用 updateSetting

---

## 🔐 数据验证

### 设置验证流程

```
1. 加载设置
   │
   ├─→ 解析 JSON
   │
   ├─→ validate(rawSettings)
   │   │
   │   ├─→ 检查必需字段
   │   ├─→ 检查字段类型
   │   ├─→ 检查枚举值
   │   ├─→ 检查数值范围
   │   └─→ 检查字符串格式
   │
   ├─→ 有效 → 返回验证后的设置
   │
   └─→ 无效 → 合并默认值
       │
       └─→ 返回 merge(defaultSettings, rawSettings)
```

### 验证规则

| 字段 | 类型 | 必需 | 默认值 | 验证规则 |
|------|------|------|--------|----------|
| `terminal.defaultTerminal` | enum | 是 | `iterm2` | `iterm2 \| terminal \| vscode \| custom` |
| `terminal.piCommandPath` | string | 是 | `pi` | 非空字符串 |
| `appearance.theme` | enum | 是 | `dark` | `dark \| light \| system` |
| `appearance.sidebarWidth` | number | 是 | `320` | 200-600 |
| `appearance.fontSize` | enum | 是 | `medium` | `small \| medium \| large` |
| `session.refreshInterval` | number | 是 | `30` | 5-300 |
| `session.previewLines` | number | 是 | `2` | 1-5 |
| `advanced.maxCacheSize` | number | 是 | `100` | 10-1000 |

---

## 🔄 降级策略

### 存储降级

```
主要方案: Tauri FS
  │
  ├─→ 成功: 使用 Tauri FS
  │
  └─→ 失败: 降级到 localStorage
      │
      ├─→ 成功: 使用 localStorage
      │
      └─→ 失败: 使用默认值
```

### 加载降级

```typescript
async function loadSettings(): Promise<AppSettings> {
  // 1. 尝试从 Tauri FS 加载
  try {
    const settings = await invoke<AppSettings>('load_settings')
    return SettingsService.validate(settings)
  } catch (error) {
    console.warn('Failed to load from Tauri FS, falling back to localStorage')
  }

  // 2. 降级到 localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const settings = JSON.parse(saved)
      return SettingsService.validate(settings)
    }
  } catch (error) {
    console.warn('Failed to load from localStorage, using defaults')
  }

  // 3. 使用默认值
  return defaultSettings
}
```

### 保存降级

```typescript
async function saveSettings(settings: AppSettings): Promise<void> {
  // 1. 尝试保存到 Tauri FS
  try {
    await invoke('save_settings', { settings })
  } catch (error) {
    console.warn('Failed to save to Tauri FS, falling back to localStorage')
  }

  // 2. 降级到 localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save to localStorage', error)
    throw error
  }
}
```

---

## 🎯 性能优化

### 1. 防抖保存

```typescript
// 设置变更后延迟保存，避免频繁写入
const debouncedSave = useMemo(
  () => debounce(() => saveSettings(settings), 1000),
  [settings]
)

useEffect(() => {
  if (isDirty) {
    debouncedSave()
  }
}, [isDirty, settings, debouncedSave])
```

### 2. 选择性订阅

```typescript
// 只订阅需要的设置，避免不必要的渲染
const { settings } = useSettings()

// ❌ 不好: 订阅整个 settings
const theme = settings.appearance.theme

// ✅ 好: 使用专门的 Hook
const { theme } = useAppearance()
```

### 3. 记忆化计算

```typescript
// 缓存计算结果
const computedStyle = useMemo(() => ({
  fontSize: fontSize === 'small' ? '14px' : fontSize === 'medium' ? '16px' : '18px',
  spacing: messageSpacing === 'compact' ? '4px' : messageSpacing === 'comfortable' ? '8px' : '16px',
}), [fontSize, messageSpacing])
```

---

## 🔒 安全性

### 1. 输入验证

```typescript
// 验证用户输入
function validateTerminalPath(path: string): boolean {
  if (!path.trim()) return false
  if (path.includes('..')) return false  // 防止路径遍历
  if (path.includes('|') || path.includes('&')) return false  // 防止命令注入
  return true
}
```

### 2. 权限检查

```typescript
// 检查文件系统权限
async function checkWritePermission(path: string): Promise<boolean> {
  try {
    await invoke('check_write_permission', { path })
    return true
  } catch (error) {
    return false
  }
}
```

### 3. 敏感信息保护

```typescript
// 不保存敏感信息到 localStorage
const sensitiveKeys = ['apiKey', 'token', 'password']

function sanitizeSettings(settings: AppSettings): AppSettings {
  const sanitized = { ...settings }
  sensitiveKeys.forEach(key => {
    if (key in sanitized) {
      delete sanitized[key]
    }
  })
  return sanitized
}
```

---

## 📊 监控与日志

### 设置变更日志

```typescript
function logSettingChange(
  section: keyof AppSettings,
  key: string,
  oldValue: unknown,
  newValue: unknown
) {
  console.log(`[Settings] ${section}.${key} changed:`, {
    from: oldValue,
    to: newValue,
    timestamp: new Date().toISOString(),
  })
}
```

### 性能监控

```typescript
function measureSettingsPerformance() {
  const start = performance.now()

  loadSettings().then(() => {
    const duration = performance.now() - start
    console.log(`[Settings] Loaded in ${duration.toFixed(2)}ms`)
  })
}
```

---

## 🧪 测试策略

### 1. 单元测试

```typescript
// 测试 SettingsService
describe('SettingsService', () => {
  test('should validate settings', () => {
    const valid = SettingsService.validate(defaultSettings)
    expect(valid).toEqual(defaultSettings)
  })

  test('should merge with defaults', () => {
    const partial = { terminal: { piCommandPath: 'custom-pi' } }
    const merged = SettingsService.validate(partial)
    expect(merged.terminal.piCommandPath).toBe('custom-pi')
    expect(merged.appearance.theme).toBe('dark')  // 默认值
  })
})
```

### 2. 集成测试

```typescript
// 测试 SettingsContext
describe('SettingsContext', () => {
  test('should update settings', async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    })

    await act(async () => {
      await result.current.updateSetting('language', 'locale', 'en-US')
    })

    expect(result.current.settings.language.locale).toBe('en-US')
  })
})
```

### 3. E2E 测试

```typescript
// 测试设置持久化
test('should persist settings across reloads', async () => {
  // 1. 修改设置
  await updateSetting('language', 'locale', 'en-US')

  // 2. 刷新页面
  await page.reload()

  // 3. 验证设置保持
  const currentSettings = await getSettings()
  expect(currentSettings.language.locale).toBe('en-US')
})
```

---

## 📚 相关文档

- [设置框架概述](./SETTINGS_FRAMEWORK.md)
- [设置集成指南](./SETTINGS_INTEGRATION.md)
- [设置类型定义](../src/types/settings.ts)
- [设置审查报告](./SETTING_SYSTEM_REVIEW.md)

---

**最后更新**: 2026-01-31