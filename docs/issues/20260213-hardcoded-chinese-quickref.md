# 硬编码中文快速参考

## 📊 一图看懂

```
总计: 655 行硬编码中文
├── P0 (立即修复) - 59 行
│   ├── SessionSearchPlugin.tsx (30) - 插件名称、时间格式
│   ├── MessageSearchPlugin.tsx (17) - 插件名称、时间格式
│   ├── ProjectSearchPlugin.tsx (10) - 插件名称
│   └── SettingsContext.tsx (2) - 错误消息
├── P1 (高优先级) - 50 行
│   └── utils/settings.ts (50) - 验证消息、显示名称
└── P2 (中优先级) - 1 行
    └── ProjectFilterList.tsx (1) - 逻辑常量
```

## 🎯 Top 5 修复点

| # | 位置 | 问题 | 影响 | 修复难度 |
|---|------|------|------|----------|
| 1 | SessionSearchPlugin | 时间格式化 | 高 | 中 |
| 2 | MessageSearchPlugin | 时间格式化 | 高 | 中 |
| 3 | 所有插件 | name/description | 高 | 低 |
| 4 | SettingsContext | 错误消息 | 中 | 低 |
| 5 | utils/settings.ts | 验证消息 | 中 | 中 |

## 🔧 快速修复模板

### 1. 插件名称/描述

```typescript
// ❌ Before
class MyPlugin extends BaseSearchPlugin {
  name = '我的插件'
  description = '插件描述'
}

// ✅ After
class MyPlugin extends BaseSearchPlugin {
  get name() {
    return this.context?.t('plugins.my.name', '我的插件') || '我的插件'
  }
  get description() {
    return this.context?.t('plugins.my.description', '插件描述') || '插件描述'
  }
}
```

### 2. 时间格式化

```typescript
// ❌ Before
if (minutes < 60) return `${minutes} 分钟前`

// ✅ After
if (minutes < 60) {
  return this.context.t('time.minutesAgo', '{{count}} 分钟前', { count: minutes })
}
```

### 3. 错误消息

```typescript
// ❌ Before
setError('加载失败')

// ✅ After
const { t } = useTranslation()
setError(t('settings.error.loadFailed', '加载失败'))
```

### 4. 验证消息

```typescript
// ❌ Before
return { field: 'xxx', message: '不能为空' }

// ✅ After
return {
  field: 'xxx',
  message: t('settings.validation.xxxRequired', '不能为空')
}
```

## 📦 需要新增的翻译文件

```
src/i18n/locales/
├── zh-CN/
│   ├── plugins.ts (新增)
│   ├── time.ts (新增)
│   ├── common.ts (扩展)
│   └── settings.ts (扩展)
└── en-US/
    ├── plugins.ts (新增)
    ├── time.ts (新增)
    ├── common.ts (扩展)
    └── settings.ts (扩展)
```

## ⏱️ 时间分配

```
Phase 1: 插件 i18n (2h)
  ├── 修改基类 (30min)
  ├── 修改 3 个插件 (1h)
  └── 添加翻译 (30min)

Phase 2: 错误/验证 (1h)
  ├── SettingsContext (15min)
  ├── utils/settings.ts (30min)
  └── 添加翻译 (15min)

Phase 3: 清理 (30min)
  └── 检查并清理废弃代码

测试: (30min)
  └── 语言切换测试
```

## 🚀 执行顺序

1. **先做 Phase 1** - 用户最直接可见
2. **再做 Phase 2** - 功能完整性
3. **最后 Phase 3** - 代码质量

## 📝 Commit 建议

```bash
# Phase 1
git commit -m "feat(i18n): add plugin name/description translations"
git commit -m "feat(i18n): add time formatting translations"

# Phase 2
git commit -m "feat(i18n): add error message translations"
git commit -m "feat(i18n): add validation message translations"

# Phase 3
git commit -m "refactor: remove unused getSettingDisplayName function"
git commit -m "refactor: unify Unknown constant to English"
```

## ⚠️ 注意事项

1. **插件架构**: 需要修改基类支持 i18n context
2. **时间格式**: 考虑使用 i18next 的 plural 功能
3. **验证逻辑**: 可能需要重构到组件层
4. **测试覆盖**: 确保语言切换后立即生效

## 🔗 快速链接

- [详细审计报告](./20260213-hardcoded-chinese-audit.md)
- [扫描结果](./20260213-hardcoded-chinese-scan.md)
- [i18n 架构文档](../architecture/i18n-architecture.md)
