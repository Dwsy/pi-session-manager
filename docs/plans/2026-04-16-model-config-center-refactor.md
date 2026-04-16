# ModelConfigCenter.tsx 拆分实施计划

> **REQUIRED SUB-SKILL:** Use `/skill:executing-plans` or `/skill:subagent-driven-development` to implement this plan task-by-task.

**Goal:** 将 `src/components/settings/sections/ModelConfigCenter.tsx` (2992 行) 拆分为职责清晰的模块，主组件控制在 250 行以内，零行为变更。

**Architecture:** 采用 "Container + Hook + Tabs + Shared UI" 四层结构。先提取类型/工具函数（低风险），再提取 Hook（中风险），最后提取各个 Tab 和 Modal 组件（中风险）。每步都有编译验证。

**Tech Stack:** React 18 + TypeScript 5 + Tailwind CSS + i18next + Tauri invoke

---

## 目录结构目标

```
src/components/settings/sections/model-config/
├── index.tsx                 # 重命名后的 ModelConfigCenter
├── types.ts                  # 所有类型、常量
├── utils.ts                  # 纯工具函数
├── useModelConfig.ts         # 状态管理 hook
├── ui/
│   ├── StatTile.tsx
│   ├── StatusBanner.tsx
│   ├── ModalShell.tsx
│   └── ConfirmDialog.tsx
├── modals/
│   ├── AddProviderModal.tsx
│   └── ImportModal.tsx
└── tabs/
    ├── ConfigureTab.tsx
    ├── TestTab.tsx
    ├── ToolsTab.tsx
    └── HistoryTab.tsx
```

---

## Task 1: 创建目录并提取类型与常量

**Files:**
- Create: `src/components/settings/sections/model-config/types.ts`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx` (删除已提取的类型)

**Step 1: 写入 types.ts**

将原文件第 25-119 行的所有 interface/type/const 提取出来：

```typescript
export type JsonValue = Record<string, unknown>;

export type FeedbackTone = "success" | "error" | "warning" | "info";
export type ImportMode = "merge" | "replace";
export type HistoryTab = "backups" | "versions";
export type ConfirmTone = "danger" | "warning" | "info";
export type ModelConfigMainTab = "configure" | "test" | "tools" | "history";
export type ConfigDetailTab = "provider" | "model";

export interface ModelCost { ... }
export interface ModelEntry { ... }
export interface ProviderEntry { ... }
export interface ModelConfigShape { ... }
export interface ModelConfigBackupMeta { ... }
export interface ConfigVersionMeta { ... }
export interface ModelHttpTestResult { ... }
export interface FeedbackState { ... }
export interface ConfirmDialogState { ... }

export const EMPTY_CONFIG: ModelConfigShape = { providers: {} };
export const MODEL_CONFIG_PATH = "~/.pi/agent/models.json";

export const API_TYPE_OPTIONS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;
```

**Step 2: 修改 ModelConfigCenter.tsx**

删除上述类型定义，改为：

```typescript
import type {
  ModelConfigShape,
  ModelConfigBackupMeta,
  ConfigVersionMeta,
  ModelHttpTestResult,
  FeedbackState,
  ConfirmDialogState,
  ModelConfigMainTab,
  HistoryTab,
  ImportMode,
  ConfigDetailTab,
} from "./model-config/types";
import {
  EMPTY_CONFIG,
  MODEL_CONFIG_PATH,
} from "./model-config/types";
```

**Step 3: 验证编译**

Run: `cd ~/Dev/AI/pi-session-manager && pnpm tsc --noEmit`
Expected: `TypeScript compilation completed` (零错误)

**Step 4: Commit**

```bash
git add src/components/settings/sections/model-config/types.ts src/components/settings/sections/ModelConfigCenter.tsx
git commit -m "refactor(model-config): extract types and constants"
```

---

## Task 2: 提取纯工具函数

**Files:**
- Create: `src/components/settings/sections/model-config/utils.ts`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 写入 utils.ts**

提取原文件第 134-244 行的所有纯函数：

```typescript
import type { ModelConfigShape, ProviderEntry, ModelEntry } from "./types";
import { EMPTY_CONFIG } from "./types";

export function asModelConfigShape(raw: unknown): ModelConfigShape { ... }
export function asErrorMessage(error: unknown): string { ... }
export function formatBytes(bytes: number): string { ... }
export function normalizeHeaders(...) { ... }
export function normalizeConfig(config: ModelConfigShape): ModelConfigShape { ... }
export function serializeConfig(config: ModelConfigShape): string { ... }
export function prettyConfig(config: ModelConfigShape): string { ... }
export function splitInputTypes(raw: string): string[] { ... }
export function createDefaultModel(): ModelEntry { ... }
export function createDefaultProvider(): ProviderEntry { ... }
export function modelSelectionValue(index: number): string { ... }
```

**Step 2: 修改 ModelConfigCenter.tsx**

删除上述函数，改为：

```typescript
import {
  asModelConfigShape,
  asErrorMessage,
  formatBytes,
  normalizeConfig,
  serializeConfig,
  prettyConfig,
  splitInputTypes,
  createDefaultModel,
  createDefaultProvider,
  modelSelectionValue,
} from "./model-config/utils";
```

**Step 3: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 4: Commit**

```bash
git commit -m "refactor(model-config): extract pure utility functions"
```

---

## Task 3: 提取通用 UI 组件

**Files:**
- Create: `src/components/settings/sections/model-config/ui/StatTile.tsx`
- Create: `src/components/settings/sections/model-config/ui/StatusBanner.tsx`
- Create: `src/components/settings/sections/model-config/ui/ModalShell.tsx`
- Create: `src/components/settings/sections/model-config/ui/ConfirmDialog.tsx`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 创建 4 个 UI 组件文件**

从原文件第 250-403 行复制对应组件代码，确保所有 `import { ReactNode }` 和 lucide 图标保留。

**Step 2: 修改 ModelConfigCenter.tsx**

删除这 4 个组件定义，改为：

```typescript
import { StatTile } from "./model-config/ui/StatTile";
import { StatusBanner } from "./model-config/ui/StatusBanner";
import { ModalShell } from "./model-config/ui/ModalShell";
import { ConfirmDialog } from "./model-config/ui/ConfirmDialog";
```

**Step 3: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 4: Commit**

```bash
git commit -m "refactor(model-config): extract shared UI primitives"
```

---

## Task 4: 提取 useModelConfig Hook

**Files:**
- Create: `src/components/settings/sections/model-config/useModelConfig.ts`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 写入 useModelConfig.ts**

将原文件中从 `export default function ModelConfigCenter()` 开始到 JSX return 之前的所有逻辑提取为 hook。

需要导出：

```typescript
export function useModelConfig() {
  // 所有 useState, useMemo, useEffect, handlers
  return {
    config, setConfig,
    loading, saving, busy,
    isDirty,
    feedback, pushFeedback, setFeedback,
    selectedProvider, setSelectedProvider,
    selectedModel, setSelectedModel,
    selectedProviderEntry, selectedProviderModels, selectedModelEntry, activeModelLabel,
    providerNames, totalModels,
    testPrompt, setTestPrompt, testResult, setTestResult,
    backups, versions, historyTab, setHistoryTab, importMode, setImportMode,
    mainTab, setMainTab, configDetailTab, setConfigDetailTab,
    showAddProviderModal, setShowAddProviderModal, newProviderName, setNewProviderName,
    showImportModal, setShowImportModal, importContentDraft, setImportContentDraft,
    confirmDialog, setConfirmDialog, confirmingDialog, setConfirmingDialog,
    loadAll,
    openConfirm,
    guardUnsaved,
    handleConfirmDialog,
    updateSelectedProviderEntry,
    updateSelectedModelEntry,
    commitProviderRename,
    handleCreateProvider,
    requestDeleteProvider,
    addModel,
    requestDeleteModel,
    saveConfig,
    refreshConfig,
    createBackup,
    exportToPath,
    copyDraftJson,
    openImportContentModal,
    importFromPath,
    pasteClipboardToImport,
    importFromContent,
    requestRestoreBackup,
    requestDeleteBackup,
    requestRestoreVersion,
    runHttpTest,
    copyCurlCommand,
  };
}
```

注意：hook 内部仍然使用 `useTranslation()` 和 `useClipboard()`。

**Step 2: 修改 ModelConfigCenter.tsx**

在组件顶部改为：

```typescript
import { useModelConfig } from "./model-config/useModelConfig";

export default function ModelConfigCenter() {
  const { t } = useTranslation();
  const vm = useModelConfig();
  // ... 下面只保留 JSX
}
```

**Step 3: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 4: Commit**

```bash
git commit -m "refactor(model-config): extract useModelConfig hook"
```

---

## Task 5: 提取 AddProviderModal 和 ImportModal

**Files:**
- Create: `src/components/settings/sections/model-config/modals/AddProviderModal.tsx`
- Create: `src/components/settings/sections/model-config/modals/ImportModal.tsx`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 分析 Modal 的 props 需求**

从原文件第 2809-2976 行提取两个 modal。

`AddProviderModal` 需要 props：
- `open: boolean`
- `providerName: string`
- `onProviderNameChange: (v: string) => void`
- `onConfirm: () => void`
- `onCancel: () => void`

`ImportModal` 需要 props：
- `open: boolean`
- `importMode: ImportMode`
- `onImportModeChange: (mode: ImportMode) => void`
- `importContentDraft: string`
- `onImportContentDraftChange: (v: string) => void`
- `onImportFromPath: () => void`
- `onPasteClipboard: () => void`
- `onImportFromContent: () => void`
- `onCancel: () => void`
- `busy: boolean | string` (或专门的 isImporting boolean)

**Step 2: 创建文件并替换原 Modal JSX**

在 `ModelConfigCenter.tsx` 中将 modal 的 JSX 替换为：

```tsx
{vm.showAddProviderModal && (
  <AddProviderModal ... />
)}
{vm.showImportModal && (
  <ImportModal ... />
)}
```

**Step 3: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 4: Commit**

```bash
git commit -m "refactor(model-config): extract AddProvider and Import modals"
```

---

## Task 6: 提取 HistoryTab

**Files:**
- Create: `src/components/settings/sections/model-config/tabs/HistoryTab.tsx`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 提取 HistoryTab**

从原文件 `mainTab === "history"` 的区块（约第 2631-2808 行）提取。

Props 大致需要：
- `backups`, `versions`, `historyTab`, `onHistoryTabChange`
- `onRestoreBackup`, `onDeleteBackup`, `onRestoreVersion`
- `t`

**Step 2: 替换原 JSX**

**Step 3: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 4: Commit**

```bash
git commit -m "refactor(model-config): extract HistoryTab"
```

---

## Task 7: 提取 ToolsTab 和 TestTab

**Files:**
- Create: `src/components/settings/sections/model-config/tabs/ToolsTab.tsx`
- Create: `src/components/settings/sections/model-config/tabs/TestTab.tsx`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 提取 ToolsTab**

从原文件 `mainTab === "tools"` 区块（约第 2283-2402 行）提取。
Props：导入导出相关 actions。

**Step 2: 提取 TestTab**

从原文件 `mainTab === "test"` 区块（约第 2403-2630 行）提取。
Props：testPrompt, testResult, selectedProvider/Model, onRunTest, onCopyCurl, onPromptChange。

**Step 3: 替换原 JSX**

**Step 4: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 5: Commit**

```bash
git commit -m "refactor(model-config): extract ToolsTab and TestTab"
```

---

## Task 8: 提取 ConfigureTab（最复杂）

**Files:**
- Create: `src/components/settings/sections/model-config/tabs/ConfigureTab.tsx`
- Create: `src/components/settings/sections/model-config/tabs/ProviderList.tsx`
- Create: `src/components/settings/sections/model-config/tabs/ModelList.tsx`
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`

**Step 1: 先提取 ProviderList 和 ModelList**

这两个列表组件在 ConfigureTab 的左侧导航中，各自有约 150-200 行 JSX。

`ProviderList` props:
- `providerNames`, `config`, `selectedProvider`, `onSelect`, `onDelete`, `onAdd`

`ModelList` props:
- `selectedProvider`, `models`, `selectedModel`, `onSelect`, `onAdd`

**Step 2: 提取 ConfigureTab**

ConfigureTab 包含：
- 左侧 SettingsCard (navigator) + ProviderList + ModelList
- 右侧 SettingsTabs (provider/model) + 详情表单

详情表单部分暂时保留在 ConfigureTab 内部（仍可进一步拆分 ProviderForm/ModelForm，但当前先停在这一层）。

**Step 3: 替换原 JSX**

**Step 4: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 5: Commit**

```bash
git commit -m "refactor(model-config): extract ConfigureTab with ProviderList and ModelList"
```

---

## Task 9: 最终清理与主文件瘦身

**Files:**
- Modify: `src/components/settings/sections/ModelConfigCenter.tsx`
- Rename: `src/components/settings/sections/ModelConfigCenter.tsx` -> `src/components/settings/sections/model-config/index.tsx`

**Step 1: 清理未使用的 import**

运行 TypeScript / IDE 检查，删除 `ModelConfigCenter.tsx` 中不再使用的 import（如大量被提取出去后遗留的 import）。

**Step 2: 将主文件重命名为 index.tsx**

```bash
mv src/components/settings/sections/ModelConfigCenter.tsx \
   src/components/settings/sections/model-config/index.tsx
```

**Step 3: 更新引用该组件的地方**

检查是否有其他文件 import `ModelConfigCenter`：

```bash
rg "ModelConfigCenter" src/
```

通常只有 `src/components/settings/SettingsPanel.tsx` 会引用它。更新 import 路径：

```typescript
import ModelConfigCenter from "./sections/model-config";
```

**Step 4: 验证编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 5: Commit**

```bash
git commit -m "refactor(model-config): move main component to index.tsx and update imports"
```

---

## Task 10: 端到端验证

**Step 1: Rust 测试**

Run: `cd src-tauri && cargo test`
Expected: `147 passed`

**Step 2: TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

**Step 3: 手动功能走查**

启动 dev 模式或热加载后验证以下路径：
- [ ] 页面加载后显示 provider 列表
- [ ] 点击 "Add Provider" -> 输入名称 -> 创建成功
- [ ] 选择 provider 后显示 model 列表
- [ ] 点击 "Add Model" -> 填写 ID/Name -> 保存配置
- [ ] Test tab 中运行 HTTP test
- [ ] Tools tab 中导入/导出 JSON
- [ ] History tab 中显示 backups/versions 并能恢复

**Step 4: 最终 Commit**

```bash
git commit -m "refactor(model-config): complete ModelConfigCenter decomposition"
```

---

## 风险与回滚

- **风险：** props drilling 过深导致中间组件频繁变更。
  - **缓解：** 如果 ConfigureTab 的 props 超过 12 个，考虑直接传入 `vm` 的一个子集，或者使用 `React.Context`（但本次尽量 props 传递，避免引入新抽象）。
- **风险：** hook 提取时丢失某个 state 的依赖关系。
  - **缓解：** 每次提取后用 `tsc` 和浏览器 console 检查。
- **回滚：** 每个 Phase 都有独立 commit，出问题可逐段 revert。
