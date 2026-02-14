# 硬编码中文审计报告

**Date**: 2026-02-13  
**Status**: 🔍 Audit Complete  
**Priority**: P1 (High)

## 概述

系统性扫描项目中的硬编码中文字符串，识别需要 i18n 化的代码位置。

## 扫描结果

### 1. 错误消息 (SettingsContext.tsx)

**文件**: `src/contexts/SettingsContext.tsx`

```typescript
// Line 41
setError('加载设置失败')

// Line 54
setError('保存设置失败')
```

**修复方案**:
```typescript
// 使用 i18n
setError(t('settings.error.loadFailed', '加载设置失败'))
setError(t('settings.error.saveFailed', '保存设置失败'))
```

---

### 2. 验证消息 (utils/settings.ts)

**文件**: `src/utils/settings.ts`

```typescript
// Line 15
return { field: 'terminal.piCommandPath', message: 'Pi 命令路径不能为空' }

// Line 21
return { field: 'session.refreshInterval', message: '刷新间隔必须在 5-300 秒之间' }

// Line 27
return { field: 'advanced.maxCacheSize', message: '缓存大小必须在 10-1000 MB 之间' }

// Line 33
return { field: 'appearance.sidebarWidth', message: '侧边栏宽度必须在 200-600 px 之间' }
```

**修复方案**:
```typescript
// 需要传入 t 函数或使用全局 i18n
return { 
  field: 'terminal.piCommandPath', 
  message: t('settings.validation.piCommandPathRequired', 'Pi 命令路径不能为空') 
}
```

---

### 3. 格式化显示 (utils/settings.ts)

**文件**: `src/utils/settings.ts`

```typescript
// Line 86
return value ? '启用' : '禁用'
```

**修复方案**:
```typescript
return value 
  ? t('common.enabled', '启用') 
  : t('common.disabled', '禁用')
```

---

### 4. 设置显示名称 (utils/settings.ts)

**文件**: `src/utils/settings.ts` (Lines 178-214)

**问题**: `getSettingDisplayName()` 函数返回硬编码中文

```typescript
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
  // ... 更多
}
```

**修复方案**:
```typescript
// 方案 A: 使用 i18n key 映射
function getSettingDisplayName(section: string, key: string): string {
  return t(`settings.${section}.${key}`, key)
}

// 方案 B: 删除此函数，直接使用 i18n
// 这个函数可能已经不再使用，需要检查调用点
```

---

### 5. 插件名称和描述

**文件**: `src/plugins/session/SessionSearchPlugin.tsx`

```typescript
// Lines 11-14
name = '会话搜索'
description = '搜索会话名称和元数据'
keywords = ['session', 'file', 'conversation', '会话', '文件', '对话']
```

**文件**: `src/plugins/project/ProjectSearchPlugin.tsx`

```typescript
name = '项目搜索'
description = '搜索项目路径'
```

**文件**: `src/plugins/message/MessageSearchPlugin.tsx`

```typescript
name = '消息搜索'
description = '搜索用户消息和助手回复'
```

**修复方案**:
```typescript
// 插件需要支持 i18n
class SessionSearchPlugin extends BaseSearchPlugin {
  get name() {
    return this.context?.t('plugins.session.name', '会话搜索') || '会话搜索'
  }
  
  get description() {
    return this.context?.t('plugins.session.description', '搜索会话名称和元数据') || '搜索会话名称和元数据'
  }
  
  keywords = ['session', 'file', 'conversation', '会话', '文件', '对话']
}
```

---

### 6. 时间格式化

**文件**: `src/plugins/session/SessionSearchPlugin.tsx` (Lines 114-138)

```typescript
if (seconds < 60) return '刚刚'
if (minutes < 60) return `${minutes} 分钟前`
if (hours < 24) return `${hours} 小时前`
if (days < 7) return `${days} 天前`
if (weeks < 4) return `${weeks} 周前`
```

**文件**: `src/plugins/message/MessageSearchPlugin.tsx` (Lines 93-98)

```typescript
if (days === 0) return '今天'
if (days === 1) return '昨天'
if (days < 7) return `${days} 天前`
if (days < 30) return `${Math.floor(days / 7)} 周前`
if (days < 365) return `${Math.floor(days / 30)} 月前`
return `${Math.floor(days / 365)} 年前`
```

**修复方案**:
```typescript
// 使用 i18n 的相对时间格式化
formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  
  if (seconds < 60) {
    return this.context.t('time.justNow', '刚刚')
  }
  
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return this.context.t('time.minutesAgo', '{{count}} 分钟前', { count: minutes })
  }
  
  // ... 更多
}
```

---

### 7. 消息计数

**文件**: `src/plugins/session/SessionSearchPlugin.tsx` (Line 94)

```typescript
defaultValue: `${session.message_count} 条消息`
```

**修复方案**:
```typescript
// 已经使用 t() 但 defaultValue 是硬编码
// 应该移除 defaultValue，让 i18n 文件提供默认值
description: context.t('session.messageCount', { count: session.message_count })
```

---

### 8. 项目过滤器

**文件**: `src/components/ProjectFilterList.tsx` (Line 166)

```typescript
if (!cwd || cwd === 'Unknown' || cwd === '未知') {
  // ...
}
```

**修复方案**:
```typescript
// 这是检查逻辑，不是显示文本
// 但应该统一使用英文常量
const UNKNOWN_CWD = 'Unknown'
if (!cwd || cwd === UNKNOWN_CWD) {
  // ...
}
```

---

## 优先级分类

### P0 - 立即修复（影响用户体验）

1. ✅ **插件名称和描述** - 用户直接可见
2. ✅ **时间格式化** - 频繁显示
3. ✅ **错误消息** - 用户反馈

### P1 - 高优先级（功能完整性）

4. **验证消息** - 表单验证反馈
5. **格式化显示** - 设置界面

### P2 - 中优先级（代码质量）

6. **设置显示名称** - 可能已废弃，需检查调用点
7. **项目过滤器** - 内部逻辑，影响较小

---

## 修复计划

### Phase 1: 插件 i18n 化 (P0)

**文件**:
- `src/plugins/session/SessionSearchPlugin.tsx`
- `src/plugins/project/ProjectSearchPlugin.tsx`
- `src/plugins/message/MessageSearchPlugin.tsx`

**工作量**: ~2 小时

**步骤**:
1. 修改插件基类支持 i18n context
2. 将 name/description 改为 getter 方法
3. 实现时间格式化 i18n
4. 添加翻译 key 到 locales

---

### Phase 2: 错误和验证消息 (P0-P1)

**文件**:
- `src/contexts/SettingsContext.tsx`
- `src/utils/settings.ts`

**工作量**: ~1 小时

**步骤**:
1. SettingsContext 使用 useTranslation
2. settings.ts 验证函数接受 t 参数
3. 添加错误和验证翻译 key

---

### Phase 3: 清理和优化 (P2)

**文件**:
- `src/utils/settings.ts` (getSettingDisplayName)
- `src/components/ProjectFilterList.tsx`

**工作量**: ~30 分钟

**步骤**:
1. 检查 getSettingDisplayName 调用点
2. 如果未使用，删除函数
3. 统一 Unknown 常量

---

## 翻译 Key 规划

### 新增 i18n Keys

```typescript
// common.ts
export const common = {
  enabled: '启用',
  disabled: '禁用',
  unknown: '未知',
}

// settings.ts (新增)
export const settings = {
  error: {
    loadFailed: '加载设置失败',
    saveFailed: '保存设置失败',
  },
  validation: {
    piCommandPathRequired: 'Pi 命令路径不能为空',
    refreshIntervalRange: '刷新间隔必须在 5-300 秒之间',
    cacheSizeRange: '缓存大小必须在 10-1000 MB 之间',
    sidebarWidthRange: '侧边栏宽度必须在 200-600 px 之间',
  },
}

// plugins.ts (新增文件)
export const plugins = {
  session: {
    name: '会话搜索',
    description: '搜索会话名称和元数据',
  },
  project: {
    name: '项目搜索',
    description: '搜索项目路径',
  },
  message: {
    name: '消息搜索',
    description: '搜索用户消息和助手回复',
  },
}

// time.ts (新增文件)
export const time = {
  justNow: '刚刚',
  minutesAgo: '{{count}} 分钟前',
  hoursAgo: '{{count}} 小时前',
  daysAgo: '{{count}} 天前',
  weeksAgo: '{{count}} 周前',
  monthsAgo: '{{count}} 月前',
  yearsAgo: '{{count}} 年前',
  today: '今天',
  yesterday: '昨天',
}
```

---

## 技术债务

### 1. utils/settings.ts 重构

**问题**: 
- `getSettingDisplayName()` 函数可能已废弃
- 验证函数无法访问 i18n

**建议**:
- 检查调用点，如果未使用则删除
- 验证逻辑移到 React 组件层，可以访问 useTranslation

### 2. 插件架构改进

**问题**:
- 插件无法访问 i18n context
- name/description 是静态属性

**建议**:
- 插件构造函数接受 context (包含 t 函数)
- name/description 改为 getter 方法

---

## 验证清单

修复完成后需要验证：

- [ ] 所有错误消息支持中英文
- [ ] 插件名称和描述支持中英文
- [ ] 时间格式化支持中英文
- [ ] 验证消息支持中英文
- [ ] 切换语言后所有文本正确更新
- [ ] 无控制台警告（missing translation keys）

---

## 相关文件

### 需要修改的文件

1. `src/contexts/SettingsContext.tsx`
2. `src/utils/settings.ts`
3. `src/plugins/session/SessionSearchPlugin.tsx`
4. `src/plugins/project/ProjectSearchPlugin.tsx`
5. `src/plugins/message/MessageSearchPlugin.tsx`
6. `src/plugins/base/BaseSearchPlugin.ts`
7. `src/components/ProjectFilterList.tsx`

### 需要新增的翻译文件

1. `src/i18n/locales/zh-CN/plugins.ts`
2. `src/i18n/locales/en-US/plugins.ts`
3. `src/i18n/locales/zh-CN/time.ts`
4. `src/i18n/locales/en-US/time.ts`
5. `src/i18n/locales/zh-CN/common.ts` (扩展)
6. `src/i18n/locales/en-US/common.ts` (扩展)

---

## 估算

**总工作量**: ~4 小时

| Phase | 工作量 | 优先级 |
|-------|--------|--------|
| Phase 1: 插件 i18n | 2h | P0 |
| Phase 2: 错误/验证 | 1h | P0-P1 |
| Phase 3: 清理优化 | 0.5h | P2 |
| 测试验证 | 0.5h | - |

---

**下一步**: 开始 Phase 1 - 插件 i18n 化
