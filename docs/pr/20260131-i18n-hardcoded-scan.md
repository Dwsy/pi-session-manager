# i18n 硬编码文本扫描报告

**日期**: 2026-01-31
**扫描范围**: src/components/ 目录下的所有 .tsx 文件

## 扫描结果

发现 **9 处**需要替换为 i18n 的硬编码文本。

### 详细列表

| 文件 | 行号 | 文本内容 | 建议翻译键 |
|------|------|---------|-----------|
| `ReadExecution.tsx` | 62 | `Read image` | `components.readExecution.imageAlt` |
| `UserMessage.tsx` | 39 | `Message image` | `components.userMessage.imageAlt` |
| `dashboard/Achievements.tsx` | 222 | `You're a true Pi Agent power user!` | `components.achievements.powerUserMessage` |
| `dashboard/TimeDistribution.tsx` | 37 | `No activity data` | `components.dashboard.noActivityData` |
| `dashboard/TimeDistribution.tsx` | 122 | `Daily view coming soon` | `components.dashboard.dailyViewComingSoon` |
| `dashboard/TokenStats.tsx` | 141 | `Top Models by Cost` | `components.dashboard.topModelsByCost` |
| `dashboard/TopModelsChart.tsx` | 114 | `No model data` | `components.dashboard.noModelData` |
| `settings/SettingsPanel.tsx` | 399 | `例如: alacritty -e` | `settings.terminal.commandExample` |
| `settings/sections/TerminalSettings.tsx` | 61 | `例如: alacritty -e` | `settings.terminal.commandExample` |

## 修复建议

### 1. 添加翻译键

在 `src/i18n/locales/en-US/components.ts` 中添加：

```typescript
readExecution: {
  // ... existing keys
  imageAlt: 'Read image',
},

userMessage: {
  // ... existing keys
  imageAlt: 'Message image',
},

achievements: {
  // ... existing keys
  powerUserMessage: "You're a true Pi Agent power user!",
},

dashboard: {
  // ... existing keys
  noActivityData: 'No activity data',
  dailyViewComingSoon: 'Daily view coming soon',
  topModelsByCost: 'Top Models by Cost',
  noModelData: 'No model data',
},
```

在 `src/i18n/locales/zh-CN/components.ts` 中添加：

```typescript
readExecution: {
  // ... existing keys
  imageAlt: '读取图片',
},

userMessage: {
  // ... existing keys
  imageAlt: '消息图片',
},

achievements: {
  // ... existing keys
  powerUserMessage: '你是一个真正的 Pi Agent 超级用户！',
},

dashboard: {
  // ... existing keys
  noActivityData: '无活动数据',
  dailyViewComingSoon: '每日视图即将推出',
  topModelsByCost: '成本排名模型',
  noModelData: '无模型数据',
},
```

在 `src/i18n/locales/en-US/settings.ts` 中添加：

```typescript
terminal: {
  // ... existing keys
  commandExample: 'e.g., alacritty -e',
},
```

在 `src/i18n/locales/zh-CN/settings.ts` 中添加：

```typescript
terminal: {
  // ... existing keys
  commandExample: '例如：alacritty -e',
},
```

### 2. 替换硬编码文本

#### ReadExecution.tsx (Line 62)
```tsx
// 修改前
alt="Read image"

// 修改后
alt={t('components.readExecution.imageAlt')}
```

#### UserMessage.tsx (Line 39)
```tsx
// 修改前
alt="Message image"

// 修改后
alt={t('components.userMessage.imageAlt')}
```

#### dashboard/Achievements.tsx (Line 222)
```tsx
// 修改前
<div className="text-[10px] text-[#6a6f85]">You're a true Pi Agent power user!</div>

// 修改后
<div className="text-[10px] text-[#6a6f85]">{t('components.achievements.powerUserMessage')}</div>
```

#### dashboard/TimeDistribution.tsx (Line 37)
```tsx
// 修改前
<div className="text-center text-[#6a6f85] py-4 text-xs">No activity data</div>

// 修改后
<div className="text-center text-[#6a6f85] py-4 text-xs">{t('components.dashboard.noActivityData')}</div>
```

#### dashboard/TimeDistribution.tsx (Line 122)
```tsx
// 修改前
{type === 'daily' && <div className="text-center text-[#6a6f85] py-4 text-xs">Daily view coming soon</div>}

// 修改后
{type === 'daily' && <div className="text-center text-[#6a6f85] py-4 text-xs">{t('components.dashboard.dailyViewComingSoon')}</div>}
```

#### dashboard/TokenStats.tsx (Line 141)
```tsx
// 修改前
<span className="text-xs text-[#6a6f85]">Top Models by Cost</span>

// 修改后
<span className="text-xs text-[#6a6f85]">{t('components.dashboard.topModelsByCost')}</span>
```

#### dashboard/TopModelsChart.tsx (Line 114)
```tsx
// 修改前
<p className="text-xs">No model data</p>

// 修改后
<p className="text-xs">{t('components.dashboard.noModelData')}</p>
```

#### settings/SettingsPanel.tsx (Line 399)
```tsx
// 修改前
placeholder="例如: alacritty -e"

// 修改后
placeholder={t('settings.terminal.commandExample')}
```

#### settings/sections/TerminalSettings.tsx (Line 61)
```tsx
// 修改前
placeholder="例如: alacritty -e"

// 修改后
placeholder={t('settings.terminal.commandExample')}
```

## 优先级

| 优先级 | 数量 | 说明 |
|--------|------|------|
| 高 | 7 | 用户可见的界面文本 |
| 低 | 2 | 示例文本（terminal settings） |

## 注意事项

1. **导入 useTranslation**: 确保所有修改的组件都已导入 `useTranslation` hook
2. **命名空间**: 某些组件可能需要指定命名空间，如 `useTranslation('components')`
3. **测试**: 修改后需要测试中英文切换功能

## 执行状态

- [x] 添加翻译键到 en-US
- [x] 添加翻译键到 zh-CN
- [x] 替换 ReadExecution.tsx
- [x] 替换 UserMessage.tsx
- [x] 替换 dashboard/Achievements.tsx
- [x] 替换 dashboard/TimeDistribution.tsx
- [x] 替换 dashboard/TokenStats.tsx
- [x] 替换 dashboard/TopModelsChart.tsx
- [x] 替换 settings/SettingsPanel.tsx
- [x] 替换 settings/sections/TerminalSettings.tsx
- [ ] 测试中英文切换
- [ ] 验证所有翻译正确显示

## 完成日期

2026-01-31