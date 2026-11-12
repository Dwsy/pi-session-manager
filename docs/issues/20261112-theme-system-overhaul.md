# 主题系统修复：schema 错配与变量覆盖不全

> 2026-11-12 | 类型: 架构重构 + bug 修复

## 问题概述

主题功能「差劲」的根因不是审美，是三层结构性缺陷叠加：

1. **schema 错配**：pi 主题文件用 `surface`/`ink` 定义背景/文字，`piTheme.ts` 只查找 `background`/`bg` —— 用户自定义主题背景永远不生效
2. **双份映射漂移**：`applyPiChatTheme` 覆盖 79 个变量，`applyRawThemeObject`（Theme Studio 预览）只覆盖 46 个 —— 预览与实际效果不一致
3. **清理列表漏项**：`_themes.less` 声明 112 个主题变量，`OVERRIDE_VARS` 只清 83 个 —— 自定义浅色主题下工具色/调色板仍是深色值

## 修复内容

### 1. 新建 `src/utils/themeTokens.ts`（683 行）

单一真相源，`computeThemeVars(theme)` 一次性计算全部 112 个 CSS 变量。

关键修复：
- **schema 兼容**：`resolveColor` fallback 链包含 `surface`/`ink`，用户 pi 主题文件背景正确解析
- **变量覆盖补齐**：`THEME_OVERRIDE_VARS` 与 `_themes.less` 声明对齐（112 个）
- **合成面板色**：主题未定义 panel 时自动从背景合成，保证卡片/侧边栏视觉分离
- **工具状态色区分**：`toolPendingBg`/`toolSuccessBg`/`toolErrorBg` 自动带色调，不再全部坍缩为同一颜色
- **工具/分支调色板**：从主题 accent 色旋转 hue 生成 6+8 色，不再回退到旧主题值
- **语法色**：pi schema 的 `syntax*` 键不再被丢弃，全部正确映射
- **消除闪烁**：`applyThemeVars` 先设变量再翻转 `theme-dark`/`theme-light` class（原来先删 class 导致一帧掉回 media-query 默认值）
- **不碰外观 class**：`clearThemeVars` 不再移除 `theme-dark`/`theme-light`，由 `useAppearance` 独占管理（原来 `applyPiChatTheme` 会覆盖 `applyThemeClass` 的决定）

### 2. 重写 `src/utils/piTheme.ts`（726 → 337 行，-54%）

- 删除两份重复映射代码，全部委托 `computeThemeVars`
- `applyRawThemeObject` 与 `applyPiChatTheme` 现在走同一条计算路径，预览 = 实际
- 新增 `loadThemePreview()` 支持用户主题文件预览（原来只支持内置主题）
- `resolveThemePreview()` 支持缓存的用户主题
- `generateThemePrompt()` 模板改为真实 pi schema（`surface`/`ink`，完整 40+ 变量），并附 WCAG 对比度指引
- 修复循环依赖：`codexThemes.ts` 的 `PiThemeFile` 类型改为从 `themeTokens` 导入

### 3. UI 修复（`AppearanceSettings.tsx` / `ThemeStudioModal.tsx`）

- **删除主题不再静默换主题**：`handleThemeSelect` 移除「选 custom 就自动换成第一个内置主题」的逻辑
- **用户主题有预览了**：`selectedPreview` 改为异步 `loadThemePreview`，色卡不再消失
- **删除确认用应用内弹窗**：替换原生 `confirm()`，支持 6 国语言 i18n
- **Theme Studio 基底下拉补上 Codex 主题**（原来只有 base46 + 用户主题）
- **Theme Studio 用户主题可加载**：选用户主题时从磁盘读取并填充调色板

### 4. 清理死代码

- 删除 `src/utils/ghosttyThemeCatalog.ts`（3435 行，490 个主题，零引用）
- 删除 `src/utils/base46ThemeCatalog.ts`（663 行，94 个主题，零引用）

### 5. i18n（6 语言）

新增 `deleteThemeTitle` / `deleteThemeConfirm` 至 en-US、zh-CN、de-DE、es-ES、fr-FR、ja-JP。

## 验证

- `tsc --noEmit` 零错误
- `vitest run src/utils/piTheme.test.ts src/utils/codeThemes.test.ts` 15/15 通过
- 全量测试 1154/1154 通过（3 个 pre-existing `bun:test` 加载失败与本次改动无关）

## 已知限制 / 后续

- UI 主题选择器仍为原生 `<select>`（94 base46 + codex + 用户主题），建议后续换成语法主题同款的搜索式 PickerDialog
- ghostty 主题目录（490 个）已删，如需接入可从 git 恢复并接进 `getBuiltInBase46Themes` 流程
- `--tool-palette-*` / `--branch-palette-*` 消费端仍较少（主要在 GlobalMapCanvas / ActivityHeatmap），但变量已完整覆盖