# Frontend Component Packaging Inventory

> 生成日期：2026-05-18。范围覆盖 `src/components`、`src/plugins/tools-render`、桌面/web 入口与 demo/dataset 构建模板。

## Runtime Packages

| Package | Scope | Runtime |
| --- | --- | --- |
| `src/App.tsx` | 桌面/移动主编排、运行时分支、overlay 挂载 | Tauri, web, demo, dataset |
| `src/main.tsx` | React 入口、demo/dataset bootstrap、Tauri 标题栏变量 | Tauri, web, demo, dataset |
| `src/components/app/` | App shell 包：desktop sidebar/content/panes、mobile layout、overlay | Tauri, web, demo, dataset |
| `src/plugins/tools-render/` | 工具调用渲染插件注册、内置工具 renderer、扩展 renderer | Tauri, web, demo, dataset |

## Component Packages

### Root Components

`AuthGate.tsx`, `BranchSummary.tsx`, `ClipboardBridge.tsx`, `ConnectionBanner.tsx`, `DiffTest.tsx`, `ErrorBoundary.tsx`, `FavoritesPanel.tsx`, `ModelSelector.tsx`, `Onboarding.tsx`, `OpenInBrowserButton.tsx`, `OpenInTerminalButton.tsx`, `SessionViewer.tsx`, `UpdateNoticeToast.tsx`

这些是历史根层组件，仍被入口或主编排直接引用。后续若继续“逐一打包”，建议先按功能迁移到对应目录，再补 barrel export。

### `app/`

`AppDashboardPane.tsx`, `AppDesktopContent.tsx`, `AppDesktopSearchBar.tsx`, `AppDesktopSidebar.tsx`, `AppDesktopSidebarContent.tsx`, `AppMobileFilterBar.tsx`, `AppMobileLayout.tsx`, `AppOverlays.tsx`, `AppPluginSidebarPane.tsx`, `AppPluginSurfaceData.tsx`, `AppPluginViewPane.tsx`, `AppProjectListPane.tsx`, `AppSessionListPane.tsx`, `AppSessionViewerPane.tsx`, `AppSettingsPane.tsx`, `AppTerminalPane.tsx`, `AppViewIcon.tsx`, `resolveDesktopMainContent.ts`

本轮已把 shell/sidebar/content 作为显式视觉包处理：`app-shell`、`app-desktop-sidebar`、`app-desktop-content`、`data-runtime`。vibrancy 专用属性和样式已移除，桌面布局回到稳定的不透明主题表面。

### `command/`

`CommandEmpty.tsx`, `CommandError.tsx`, `CommandFilterBar.tsx`, `CommandHints.tsx`, `CommandItem.tsx`, `CommandLoading.tsx`, `CommandMenu.tsx`, `CommandPalette.tsx`, `CommandResultItem.tsx`, `CommandResultList.tsx`, `CommandSearchInput.tsx`, `SessionPreviewPanel.tsx`, `hooks/useCommandSearch.ts`, `utils.ts`, `index.ts`

已有 barrel：`index.ts`。当前 barrel 主要服务 palette/menu 的公开面，搜索内部件仍保持包内引用。

### `dashboard/`

`Achievements.tsx`, `ActivityHeatmap.tsx`, `ActivityTrend.tsx`, `Dashboard.tsx`, `DashboardCardShell.tsx`, `DashboardInsightModal.tsx`, `HeatmapDayModal.tsx`, `HeatmapTooltip.tsx`, `MessageDistribution.tsx`, `ProductivityMetrics.tsx`, `ProjectsChart.tsx`, `RecentSessions.tsx`, `SessionLengthChart.tsx`, `StatCard.tsx`, `StatsPanel.tsx`, `TimeDistribution.tsx`, `TokenStats.tsx`, `TokenTrendChart.tsx`, `TopModelsChart.tsx`, `WeeklyComparison.tsx`, `index.ts`

已有完整 barrel：`index.ts`。

### `dataset/`

`StandaloneDatasetManagerDialog.tsx`, `StandaloneDatasetOverview.tsx`

无 barrel。该包必须保持纯 web 兼容，不能依赖 Tauri API。

### `dialogs/`

`ConvertSessionDialog.tsx`, `ConvertSessionResultDialog.tsx`, `DeleteSessionConfirmDialog.tsx`, `DeleteSessionPopover.tsx`, `ExportDialog.tsx`, `ForkDialog.tsx`, `RenameDialog.tsx`, `ResumeSessionDialog.tsx`, `VersionDowngradeDialog.tsx`, `deleteSessionTypes.ts`, `index.ts`

已有 barrel：`index.ts`。测试文件：`DeleteSessionPopover.test.tsx`。

### 插件 App View

宿主不保留具体 App View 的业务组件。`src/components/app/AppPluginViewPane.tsx`
和 `src/components/app/AppPluginSidebarPane.tsx` 只负责渲染插件注册的通用入口；
具体内置视图组件放在对应的 `extensions/psm-*` 目录。

### `messages/`

`AssistantMessage.tsx`, `Compaction.tsx`, `CustomMessage.tsx`, `ModelChange.tsx`, `PiAgentMessages.tsx`, `SystemPromptDialog.tsx`, `ThinkingBlock.tsx`, `ThinkingLevelChange.tsx`, `UserMessage.tsx`, `assistantProcess.ts`, `index.ts`

已有 barrel：`index.ts`。

### `onboarding/`

`OnboardingServiceSettings.tsx`, `OnboardingStepContent.tsx`, `steps.tsx`, `types.ts`

无 barrel。根层 `Onboarding.tsx` 是该包的当前入口。

### `pi-live/`

`PiLiveChatInput.tsx`, `PiLivePanel.tsx`, `PiLiveSessionCard.tsx`, `PiLiveStatusBar.tsx`, `index.ts`

已有 barrel：`index.ts`。

### `project/`

`ProjectFilterList.tsx`, `ProjectList.tsx`, `SelectedProjectHeader.tsx`, `index.ts`

已有 barrel：`index.ts`。

### `search/`

`ActiveFilterChips.tsx`, `FullTextSearch.tsx`, `SearchFilterBar.tsx`, `SearchPanel.tsx`, `index.ts`

已有 barrel：`index.ts`。

### `session-list/`

`SessionList.tsx`, `SessionListByDirectory.tsx`, `index.ts`

已有 barrel：`index.ts`。

### `session-tree/`

`SessionTree.tsx`, `SessionTreeSearch.tsx`, `TreeNode.tsx`, `index.ts`

已有 barrel：`index.ts`。

### `session-viewer/`

`AgentIcon.tsx`, `ConversationPreviewMessages.tsx`, `NewMessagesButton.tsx`, `SessionBadge.tsx`, `SessionContextMenu.tsx`, `SessionEntryRenderer.tsx`, `SessionFlowView.tsx`, `SessionHeader.tsx`, `SessionInfoEntry.tsx`, `SessionMessagesStates.tsx`, `SessionScrollMarkers.tsx`, `SessionSortSelect.tsx`, `SessionTimelineNav.tsx`, `SessionViewerBody.tsx`, `SessionViewerMessages.tsx`, `SessionViewerModelControls.tsx`, `SessionViewerOnlineStatusBar.tsx`, `SessionViewerSearchBar.tsx`, `SessionViewerSidebar.tsx`, `SessionViewerToolbar.tsx`, `SessionViewerToolbarTypes.ts`, `ToolCallReviewModal.tsx`, `previewTypes.ts`, `index.ts`

已有 barrel：`index.ts`，但公开面是渐进式的，不等同于“导出所有内部件”。测试文件：`SessionViewerSidebar.test.tsx`。

### `settings/`

`SettingsCard.tsx`, `SettingsField.tsx`, `SettingsInput.tsx`, `SettingsOptionButton.tsx`, `SettingsOptionGroup.tsx`, `SettingsPanel.tsx`, `SettingsRadioCardGroup.tsx`, `SettingsSelect.tsx`, `SettingsSliderField.tsx`, `SettingsTabs.tsx`, `SettingsToggleRow.tsx`, `SettingsVisualSliderField.tsx`, `settingsRegistry.tsx`, `settingsSearchIndex.ts`, `types.ts`

Sections: `AdvancedSettings.tsx`, `APITestSettings.tsx`, `AppearanceSettings.tsx`, `ConfigBundleManager.tsx`, `ExportSettings.tsx`, `ExternalSessionsSettings.tsx`, `LanguageSettings.tsx`, `ModelSettings.tsx`, `PiConfigSettings.tsx`, `PiLiveSettings.tsx`, `SearchSettings.tsx`, `SessionSettings.tsx`, `ShortcutSettings.tsx`, `TagManagerSettings.tsx`, `TerminalSettings.tsx`, `UpdateSettings.tsx`

Model config subpackage: `sections/model-config/index.tsx`, `types.ts`, `useModelConfig.ts`, `utils.ts`, `modals/*`, `tabs/*`, `ui/*`

无顶层 barrel。`AppearanceSettings.tsx` 不再暴露 vibrancy 设置入口。

### `tags/`

`LabelEntry.tsx`, `LabelFilter.tsx`, `TagBadge.tsx`, `TagFilter.tsx`, `TagPicker.tsx`, `index.ts`

已有 barrel：`index.ts`。

### `terminal/`

`TerminalPanel.tsx`, `TerminalToggleButton.tsx`, `index.ts`

已有 barrel：`index.ts`。dataset runtime 会禁用 terminal。

### `tool-calls/`

`BashExecution.tsx`, `EditExecution.tsx`, `GenericToolCall.tsx`, `ReadExecution.tsx`, `ToolCallList.tsx`, `WriteExecution.tsx`, `toolCallFolding.ts`, `index.ts`

已有 barrel：`index.ts`。

### `trace/`

`TraceView.tsx`, `LoopStrip/LoopStrip.tsx`, `LoopStrip/LoopSegment.tsx`, `LoopStrip/LoopTooltip.tsx`, `LoopStrip/LoopPhaseBar.tsx`, `LoopStrip/ViewportSlider.tsx`, `LoopStrip/deriveLoops.ts`, `LoopStrip/index.ts`

只有 `LoopStrip/` 子包有 barrel。`trace/` 顶层无 barrel。

### `ui/`

`CodeBlock.tsx`, `CompositionInput.tsx`, `DeleteConfirmButton.tsx`, `DeleteConfirmMenuItem.tsx`, `HoverPreview.tsx`, `KbdTooltip.tsx`, `MarkdownContent.tsx`, `PullToRefresh.tsx`, `Skeleton.tsx`, `Toggle.tsx`, `index.ts`

已有 barrel：`index.ts`。删除确认与输入组合组件仍可按需要纳入公开面。

## Tool Render Plugin Package

| Package | Files |
| --- | --- |
| `plugins/tools-render/builtins/` | `bash.tsx`, `edit.tsx`, `generic.tsx`, `read.tsx`, `write.tsx`, `index.ts` |
| `plugins/tools-render/extensions/` | `index.ts` (legacy no-op) |
| `extensions/psm-ask-user-question-renderer/` | `index.tsx` |
| `extensions/psm-loop-renderer/` | `index.tsx` |
| `extensions/psm-subagent-renderer/` | `index.ts`, `SubagentToolRenderer.tsx`, `SubagentModal.tsx` |
| `plugins/tools-render/utils/` | `resolveData.ts`, `searchSegments.ts`, `index.ts` |
| `plugins/tools-render/` | `index.ts`, `registry.ts`, `types.ts` |

该包已通过插件注册机制打包，不应混入 `src/components` 的视觉组件 barrel。

## Build Matrix

| Script | Meaning |
| --- | --- |
| `npm run build` | 默认 web/Tauri frontend dist |
| `npm run build:demo` | demo 模板，输出 demo runtime |
| `npm run build:dataset` | standalone dataset 模板 |
| `npm run release:version:check` | 版本一致性检查 |

Vibrancy 策略：已移除。前端不再写入 `data-vibrancy` / `data-sidebar-vibrancy`，Rust 侧不再调用 macOS vibrancy 或 Windows Mica；web/demo/dataset/Tauri 运行时仅保留稳定 `data-runtime` 标记。
