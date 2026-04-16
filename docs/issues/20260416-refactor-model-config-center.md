# Issue: 拆分 ModelConfigCenter.tsx 组件

> Status: Open
> Labels: `refactoring`, `frontend`, `technical-debt`
> Priority: High

## 问题

`src/components/settings/sections/ModelConfigCenter.tsx` 当前长达 **2992 行**，是前端代码库中最大的单文件组件。它违反了单一职责原则，导致：

- **可维护性差**：任何小的 UI 调整都需要在 3000 行中定位
- **代码审查困难**：巨大的 diff 让 reviewer 无法聚焦
- **复用性低**：内部的工具函数、类型定义、子组件被锁死在一个文件里
- **测试困难**：没有拆分就无法对子功能进行单元测试

## 目标

将该文件拆分为职责清晰的模块，使主组件文件控制在 **250 行以内**，整体结构类似：

```
model-config/
├── index.tsx              # 主入口 (ModelConfigCenter)
├── types.ts               # 类型定义 + 常量
├── utils.ts               # 纯工具函数
├── useModelConfig.ts      # 状态管理 hook
├── ui/
│   ├── StatTile.tsx
│   ├── StatusBanner.tsx
│   ├── ModalShell.tsx
│   └── ConfirmDialog.tsx
├── modals/
│   ├── AddProviderModal.tsx
│   └── ImportModal.tsx
└── tabs/
    ├── ConfigureTab/
    │   ├── index.tsx
    │   ├── ProviderList.tsx
    │   ├── ModelList.tsx
    │   ├── ProviderForm.tsx
    │   └── ModelForm.tsx
    ├── TestTab.tsx
    ├── ToolsTab.tsx
    └── HistoryTab.tsx
```

## 拆分策略

### Phase 1: 提取共享层（低风险）
- 提取类型定义、常量、纯工具函数
- 提取通用 UI 小组件（StatTile, StatusBanner, ModalShell, ConfirmDialog）
- 验证 TypeScript 编译和运行时行为不变

### Phase 2: 提取状态层（中风险）
- 将 `useState`/`useEffect`/handlers 封装为 `useModelConfig()`
- 确保所有异步操作和反馈逻辑完整迁移
- 主组件改为仅消费 hook 返回的 state 和 actions

### Phase 3: 提取视图层（中风险）
- 将 4 个 mainTab 的 JSX 分别提取为独立组件
- 将 2 个 Modal 的 JSX 分别提取为独立组件
- ConfigureTab 内部再拆分为 ProviderList/ModelList/ProviderForm/ModelForm

### Phase 4: 清理与验证
- 删除原文件中的冗余内联代码
- 运行 `pnpm tsc --noEmit` 确保零类型错误
- 运行 `cargo test` 确保后端不受影响（该组件调用 `load_model_config` 等 Tauri 命令）
- 手动在 UI 中走查：保存配置、添加 provider、HTTP 测试、导入导出、历史恢复

## 关键约束

- **零行为变更**：本次只做代码移动和必要的 props 传递调整，不修改任何业务逻辑
- **保持类型安全**：所有提取的类型必须继续严格导出
- **保持 i18n**：所有 `t()` 调用路径不变
- **渐进式提交**：每个 Phase 一个独立的 commit

## 相关文件

- `src/components/settings/sections/ModelConfigCenter.tsx` (源文件)
- `src/components/settings/SettingsCard.tsx`
- `src/components/settings/SettingsTabs.tsx`
- `src/i18n/locales/*/settings.ts` (i18n 键值)
