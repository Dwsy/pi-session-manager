# 设置系统框架文档

## 📋 概述

设置系统框架已完成基础架构搭建，包括类型定义、Context、Hook、工具函数和组件框架。目前所有功能都是**框架代码**，真实实现标记为 TODO。

---

## 🏗️ 架构

### 文件结构

```
src/
├── types/
│   └── settings.ts                    # 设置类型定义
├── contexts/
│   └── SettingsContext.tsx            # 设置 Context 和 Provider
├── hooks/
│   ├── useSettings.ts                 # 设置管理 Hook
│   └── useAppearance.ts               # 外观设置 Hook
├── utils/
│   └── settings.ts                    # 设置工具函数
└── components/
    └── settings/
        ├── types.ts                   # 组件类型定义
        ├── SettingsPanel.tsx          # 原始设置面板（保留）
        ├── SettingsPanel.refactored.tsx # 重构版设置面板
        └── sections/
            ├── TerminalSettings.tsx   # 终端设置
            ├── AppearanceSettings.tsx # 外观设置
            ├── LanguageSettings.tsx   # 语言设置
            ├── SessionSettings.tsx    # 会话设置
            ├── SearchSettings.tsx     # 搜索设置
            ├── ExportSettings.tsx     # 导出设置
            ├── PiConfigSettings.tsx   # Pi 配置
            └── AdvancedSettings.tsx   # 高级设置
```

---

## 📦 模块说明

### 1. 类型定义 (`src/types/settings.ts`)

定义了完整的设置类型系统：

```typescript
// 主要类型
- TerminalSettings          # 终端设置
- AppearanceSettings        # 外观设置
- LanguageSettings          # 语言设置
- SessionSettings           # 会话设置
- SearchSettings            # 搜索设置
- ExportSettings            # 导出设置
- AdvancedSettings          # 高级设置
- AppSettings               # 完整应用设置

// 辅助类型
- ValidationError           # 验证错误
- SettingsChangeEvent       # 设置变更事件
- SettingsExport            # 设置导出格式

// 常量
- defaultSettings           # 默认设置值
- settingsValidationRules   # 验证规则
```

**状态**: ✅ 完整定义

---

### 2. Settings Context (`src/contexts/SettingsContext.tsx`)

提供全局设置状态管理：

```typescript
interface SettingsContextType {
  settings: AppSettings              // 当前设置
  loading: boolean                    // 加载状态
  saving: boolean                    // 保存状态
  error: string | null               // 错误信息
  updateSetting: <K>(section, key, value) => void  // 更新设置
  resetSettings: () => void          // 重置设置
  saveSettings: () => Promise<void>  // 保存设置
  reloadSettings: () => Promise<void> // 重载设置
}
```

**状态**: ✅ 框架完成，TODO: 实现后端存储

---

### 3. useSettings Hook (`src/hooks/useSettings.ts`)

提供便捷的设置访问和更新方法：

```typescript
// 基础 Hook
useSettings()

// 分类 Hook
- getTerminalSetting / updateTerminalSetting
- getAppearanceSetting / updateAppearanceSetting
- getLanguageSetting / updateLanguageSetting
- getSessionSetting / updateSessionSetting
- getSearchSetting / updateSearchSetting
- getExportSetting / updateExportSetting
- getAdvancedSetting / updateAdvancedSetting

// 扩展 Hook
- useSettingsValidation()            # 设置验证
- useSettingsImportExport()          # 导入导出
```

**状态**: ✅ 框架完成，TODO: 实现验证和导入导出

---

### 4. useAppearance Hook (`src/hooks/useAppearance.ts`)

自动应用外观设置到 DOM：

```typescript
// 主题管理
useTheme()

// 字体大小管理
useFontSize()

// 代码块主题管理
useCodeBlockTheme()
```

**状态**: ✅ 框架完成，TODO: 实现主题切换逻辑

---

### 5. 工具函数 (`src/utils/settings.ts`)

提供设置相关的工具函数：

```typescript
- mergeSettings()                    # 深度合并设置
- validateSettingValue()             # 验证设置值
- formatSettingValue()               # 格式化显示
- parseSettingValue()                # 解析输入
- getSettingDefaultValue()           # 获取默认值
- isSettingModified()                # 检查是否修改
- resetSectionToDefault()            # 重置到默认
- exportSettingsToJson()             # 导出 JSON
- importSettingsFromJson()           # 导入 JSON
- checkSettingsCompatibility()       # 版本兼容性
- migrateSettings()                  # 版本迁移
- getSettingDisplayName()            # 获取显示名称
```

**状态**: ✅ 框架完成，TODO: 实现具体逻辑

---

### 6. 设置面板组件

#### 原始版本 (`SettingsPanel.tsx`)

保留原有实现，使用独立状态管理。

**状态**: ✅ 完整实现（使用 localStorage）

#### 重构版本 (`SettingsPanel.refactored.tsx`)

使用全局 Settings Context：

```typescript
// 子组件
- SettingsMenu                       # 左侧菜单
- SettingsHeader                     # 头部
- SettingsContent                    # 内容区
- SettingsFooter                     # 底部按钮
```

**状态**: ✅ 框架完成，TODO: 替换原始版本

#### 设置区块组件 (`sections/`)

8 个独立的设置区块组件：

- `TerminalSettings.tsx`    # 终端设置
- `AppearanceSettings.tsx`  # 外观设置
- `LanguageSettings.tsx`    # 语言设置
- `SessionSettings.tsx`     # 会话设置
- `SearchSettings.tsx`      # 搜索设置
- `ExportSettings.tsx`      # 导出设置
- `PiConfigSettings.tsx`    # Pi 配置
- `AdvancedSettings.tsx`    # 高级设置

**状态**: ✅ UI 完整，TODO: 实现功能逻辑

---

## 🔄 集成步骤

### 1. 在 App.tsx 中包裹 SettingsProvider

```typescript
import { SettingsProvider } from './contexts/SettingsContext'

function App() {
  return (
    <SettingsProvider>
      {/* 应用内容 */}
    </SettingsProvider>
  )
}
```

### 2. 替换 SettingsPanel 导入

```typescript
// 旧版本
import SettingsPanel from './components/settings/SettingsPanel'

// 新版本
import SettingsPanel from './components/settings/SettingsPanel.refactored'
```

### 3. 在组件中使用设置

```typescript
import { useSettings } from './hooks/useSettings'

function MyComponent() {
  const { settings, updateSetting } = useSettings()

  return (
    <div>
      <p>当前主题: {settings.appearance.theme}</p>
      <button onClick={() => updateSetting('appearance', 'theme', 'light')}>
        切换到浅色主题
      </button>
    </div>
  )
}
```

---

## 📝 TODO 列表

### 高优先级

- [ ] 实现 Tauri 后端存储命令 (`load_settings`, `save_settings`)
- [ ] 在 App.tsx 中集成 SettingsProvider
- [ ] 替换 SettingsPanel 为重构版本
- [ ] 实现外观设置的实际应用

### 中优先级

- [ ] 实现设置验证逻辑
- [ ] 实现设置导入导出
- [ ] 统一 Pi Config 处理
- [ ] 修复 sidebarWidth 数据一致性

### 低优先级

- [ ] 添加未保存提示
- [ ] 实现设置搜索功能
- [ ] 添加键盘快捷键
- [ ] 编写单元测试

---

## 🧪 测试计划

### 单元测试

```typescript
// 测试设置类型
describe('Settings Types', () => {
  it('should create default settings', () => {})
  it('should validate settings', () => {})
  it('should merge settings', () => {})
})

// 测试 Context
describe('SettingsContext', () => {
  it('should provide settings', () => {})
  it('should update settings', () => {})
  it('should save settings', () => {})
})

// 测试 Hook
describe('useSettings', () => {
  it('should return settings', () => {})
  it('should update setting', () => {})
  it('should reset settings', () => {})
})
```

### 集成测试

```typescript
// 测试设置面板
describe('SettingsPanel', () => {
  it('should render all sections', () => {})
  it('should update settings', () => {})
  it('should save settings', () => {})
})

// 测试外观应用
describe('useAppearance', () => {
  it('should apply theme', () => {})
  it('should apply font size', () => {})
  it('should apply spacing', () => {})
})
```

---

## 📚 参考文档

- [任务索引](../../task/settings-system-completion/任务索引.md)
- [执行计划](../../task/settings-system-completion/EXECUTION_PLAN.md)
- [设置系统审查报告](../../SETTING_SYSTEM_REVIEW.md)

---

**最后更新**: 2026-01-31