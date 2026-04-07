# Frontend

## Directory Structure

```
src/
  App.tsx, main.tsx, transport.ts, types.ts
  components/    # 155 components
  hooks/         # 40 hooks
  contexts/      # 3 contexts
  plugins/       # Plugin system
  utils/         # 15 utilities
  i18n/          # i18n (en-US, zh-CN, ja-JP, de-DE, fr-FR, es-ES)
  styles/        # 19 Less files
```

## Components (components/)

### Layout (app/)

| Component | Description |
|-----------|-------------|
| `AppDesktopSidebar.tsx` | Desktop sidebar |
| `AppDesktopContent.tsx` | Main content area |
| `AppDesktopSearchBar.tsx` | Search bar |
| `AppDesktopSidebarContent.tsx` | Sidebar content |
| `AppMobileLayout.tsx` | Mobile layout |
| `AppMobileFilterBar.tsx` | Mobile filter bar |
| `AppOverlays.tsx` | Modal/overlay layer |
| `AppSessionListPane.tsx` | Session list pane |
| `AppKanbanPane.tsx` | Kanban pane |
| `AppDashboardPane.tsx` | Dashboard pane |
| `AppSessionViewerPane.tsx` | Session viewer pane |
| `AppSettingsPane.tsx` | Settings pane |
| `AppTerminalPane.tsx` | Terminal pane |
| `AppProjectListPane.tsx` | Project list pane |

### Command Palette (command/)

| Component | Description |
|-----------|-------------|
| `CommandMenu.tsx` | Main command menu |
| `CommandPalette.tsx` | Palette wrapper |
| `CommandItem.tsx` | Command item |
| `CommandHints.tsx` | Keyboard hints |
| `CommandEmpty.tsx` | Empty state |
| `CommandLoading.tsx` | Loading state |
| `CommandError.tsx` | Error state |

### Dashboard (dashboard/)

| Component | Description |
|-----------|-------------|
| `Dashboard.tsx` | Main dashboard |
| `DashboardCardShell.tsx` | Card wrapper |
| `DashboardInsightModal.tsx` | Insight modal |
| `ActivityHeatmap.tsx` | Activity heatmap |
| `ActivityTrend.tsx` | Trend chart |
| `HeatmapDayModal.tsx` | Day detail modal |
| `HeatmapTooltip.tsx` | Heatmap tooltip |
| `MessageDistribution.tsx` | Message pie chart |
| `ProductivityMetrics.tsx` | Productivity stats |
| `ProjectsChart.tsx` | Projects bar chart |
| `RecentSessions.tsx` | Recent list |
| `SessionLengthChart.tsx` | Length chart |
| `StatCard.tsx` | Stat card |
| `StatsPanel.tsx` | Stats panel |
| `TimeDistribution.tsx` | Time chart |
| `TokenStats.tsx` | Token stats |
| `TokenTrendChart.tsx` | Token trend |
| `TopModelsChart.tsx` | Model usage |
| `WeeklyComparison.tsx` | Week comparison |
| `Achievements.tsx` | Achievement badges |

### Kanban (kanban/)

| Component | Description |
|-----------|-------------|
| `KanbanBoard.tsx` | Main board |
| `KanbanCard.tsx` | Card component |
| `KanbanColumn.tsx` | Column component |
| `KanbanContextMenu.tsx` | Right-click menu |
| `SessionPreviewModal.tsx` | Preview modal |

### Messages (messages/)

| Component | Description |
|-----------|-------------|
| `AssistantMessage.tsx` | Assistant messages |
| `UserMessage.tsx` | User messages |
| `ThinkingBlock.tsx` | Thinking/reasoning |
| `ModelChange.tsx` | Model switch |
| `ThinkingLevelChange.tsx` | Thinking level |
| `PiAgentMessages.tsx` | Pi agent messages |
| `SystemPromptDialog.tsx` | System prompt |
| `Compaction.tsx` | Session compaction |
| `CustomMessage.tsx` | Custom messages |

### Session List (session-list/)

| Component | Description |
|-----------|-------------|
| `SessionList.tsx` | Main list |
| `SessionListByDirectory.tsx` | Directory grouped |

### Session Tree (session-tree/)

| Component | Description |
|-----------|-------------|
| `SessionTree.tsx` | Main tree |
| `SessionTreeSearch.tsx` | Tree search |
| `TreeNode.tsx` | Node component |

### Session Viewer (session-viewer/)

| Component | Description |
|-----------|-------------|
| `SessionViewer.tsx` | Main viewer |
| `SessionViewerMessages.tsx` | Message list |
| `SessionBadge.tsx` | Session badge |
| `SessionContextMenu.tsx` | Right-click menu |
| `SessionEntryRenderer.tsx` | Entry renderer |
| `SessionFlowView.tsx` | Flow/graph view |
| `SessionHeader.tsx` | Header |
| `SessionInfoEntry.tsx` | Info entry |
| `SessionScrollMarkers.tsx` | Scroll markers |
| `SessionSortSelect.tsx` | Sort selector |
| `SessionViewerSearchBar.tsx` | Search bar |
| `SessionViewerSidebar.tsx` | Sidebar |
| `SessionViewerToolbar.tsx` | Toolbar |
| `SessionViewerModelControls.tsx` | Model controls |
| `SessionViewerOnlineStatusBar.tsx` | Online status |

### Search (search/)

| Component | Description |
|-----------|-------------|
| `FullTextSearch.tsx` | FTS component |
| `SearchFilterBar.tsx` | Filter bar |
| `SearchPanel.tsx` | Search panel |

### Pi Live (pi-live/)

| Component | Description |
|-----------|-------------|
| `PiLivePanel.tsx` | Main panel |
| `PiLiveChatInput.tsx` | Chat input |
| `PiLiveSessionCard.tsx` | Session card |
| `PiLiveStatusBar.tsx` | Status bar |

### Project (project/)

| Component | Description |
|-----------|-------------|
| `ProjectList.tsx` | Project list |
| `ProjectFilterList.tsx` | Project filter |
| `SelectedProjectHeader.tsx` | Header |

### Tags (tags/)

| Component | Description |
|-----------|-------------|
| `TagBadge.tsx` | Tag badge |
| `TagFilter.tsx` | Tag filter |
| `TagPicker.tsx` | Tag picker |
| `LabelEntry.tsx` | Label entry |
| `LabelFilter.tsx` | Label filter |

### Tool Calls (tool-calls/)

| Component | Description |
|-----------|-------------|
| `BashExecution.tsx` | Bash tool |
| `EditExecution.tsx` | Edit tool |
| `ReadExecution.tsx` | Read tool |
| `WriteExecution.tsx` | Write tool |
| `GenericToolCall.tsx` | Generic tool |
| `SubagentToolCall.tsx` | Subagent call |
| `SubagentModal.tsx` | Subagent modal |
| `ToolCallList.tsx` | Tool list |

### Terminal (terminal/)

| Component | Description |
|-----------|-------------|
| `TerminalPanel.tsx` | Main terminal |
| `TerminalToggleButton.tsx` | Toggle button |

### Settings (settings/)

**Base Components:**

| Component | Description |
|-----------|-------------|
| `SettingsPanel.tsx` | Main panel |
| `SettingsCard.tsx` | Card component |
| `SettingsField.tsx` | Field component |
| `SettingsInput.tsx` | Input component |
| `SettingsSelect.tsx` | Select component |
| `SettingsSliderField.tsx` | Slider field |
| `SettingsToggleRow.tsx` | Toggle row |
| `SettingsOptionButton.tsx` | Option button |
| `SettingsOptionGroup.tsx` | Option group |
| `SettingsRadioCardGroup.tsx` | Radio cards |
| `SettingsVisualSliderField.tsx` | Visual slider |

**Settings Sections (sections/):**

| Section | Description |
|---------|-------------|
| `AdvancedSettings.tsx` | Advanced config |
| `APITestSettings.tsx` | API testing |
| `AppearanceSettings.tsx` | Theme/appearance |
| `ConfigBundleManager.tsx` | Config import/export |
| `ExportSettings.tsx` | Export options |
| `LanguageSettings.tsx` | Language selection |
| `ModelConfigCenter.tsx` | Model configuration |
| `ModelSettings.tsx` | Model settings |
| `PiConfigSettings.tsx` | Pi config |
| `PiLiveSettings.tsx` | Pi live settings |
| `SearchSettings.tsx` | Search options |
| `SessionSettings.tsx` | Session settings |
| `ShortcutSettings.tsx` | Keyboard shortcuts |
| `TagManagerSettings.tsx` | Tag management |
| `TerminalSettings.tsx` | Terminal config |
| `UpdateSettings.tsx` | Update settings |

### Dialogs (dialogs/)

| Component | Description |
|-----------|-------------|
| `DeleteSessionPopover.tsx` | Delete confirmation (popover) |
| `DeleteSessionConfirmDialog.tsx` | Delete confirmation (dialog) |
| `ExportDialog.tsx` | Export dialog |
| `ForkDialog.tsx` | Fork session dialog |
| `RenameDialog.tsx` | Rename dialog |

### UI Primitives (ui/)

| Component | Description |
|-----------|-------------|
| `CodeBlock.tsx` | Code block with syntax highlighting |
| `HoverPreview.tsx` | Hover preview |
| `MarkdownContent.tsx` | Markdown renderer |
| `KbdTooltip.tsx` | Keyboard tooltip |
| `PullToRefresh.tsx` | Pull to refresh |
| `Skeleton.tsx` | Loading skeleton |
| `Toggle.tsx` | Toggle switch |

### Onboarding (onboarding/)

| Component | Description |
|-----------|-------------|
| `OnboardingServiceSettings.tsx` | Service settings step |
| `OnboardingStepContent.tsx` | Step content |
| `steps.tsx` | Step definitions |
| `types.ts` | Type definitions |

### Root Level

| Component | Description |
|-----------|-------------|
| `FavoritesPanel.tsx` | Favorites panel |
| `AuthGate.tsx` | Auth guard |
| `BranchSummary.tsx` | Git branch display |
| `ClipboardBridge.tsx` | Clipboard integration |
| `ConnectionBanner.tsx` | Connection status |
| `ErrorBoundary.tsx` | Error boundary |
| `DiffTest.tsx` | Diff testing |
| `Onboarding.tsx` | Onboarding wrapper |
| `OpenInBrowserButton.tsx` | Open in browser |
| `OpenInTerminalButton.tsx` | Open in terminal |
| `SessionViewer.tsx` | Session viewer (standalone) |
| `UpdateNoticeToast.tsx` | Update notification |

## Hooks (hooks/)

### App Hooks (hooks/app/)

`useAppBootstrap` | `useAppUiEffects` | `useDesktopSidebarActions` | `useFavorites` | `useSidebarSessions` | `useUpdateChecker`

### Session Hooks

`usePaginatedSessions` (pagination + live merge) | `useSessions` | `useSessionActions` | `useSessionBadges` | `useSessionTreeLookup` | `useSessionViewerData` (Registry first) | `useSessionViewerDerivedData` | `useSessionViewerHotkeys` | `useSessionViewerInMessageSearch` | `useSessionViewerVirtualScroll` | `useSessionScrollMarkers`

### Search Hooks

`useSearch` | `useSimpleSearch` | `useSearchCache` | `useSearchPlugins`

### Pi Live Hooks

`usePiLive` | `usePiLiveSessions`

### UI Hooks

`useAppearance` | `useKeyboardShortcuts` | `useResizableSidebar` | `useResolvedTheme` | `useSwipe` | `useClipboard` | `useCommandMenu` | `useConnectionStatus` | `useDemoMode` | `useIsMobile` | `usePrefersReducedMotion`

### Data Hooks

`useTags` | `useFileWatcher` | `useToolStyles`

### Settings Hooks

`useAllSettings` | `useAppSettings` | `useSettings`

## Contexts (contexts/)

| Context | Description |
|---------|-------------|
| `TransportContext.tsx` | Transport provider (Tauri/WS/HTTP) |
| `SettingsContext.tsx` | Settings provider |
| `SessionViewContext.tsx` | Session viewer state |

## Plugins (plugins/)

| Path | Description |
|------|-------------|
| `types.ts` | SearchPlugin interface |
| `registry.ts` | Plugin registry |
| `builtins.ts` | Built-in plugins |
| `base/BaseSearchPlugin.ts` | Base class |
| `message/MessageSearchPlugin.tsx` | Message search |
| `project/ProjectSearchPlugin.tsx` | Project search |
| `session/SessionSearchPlugin.tsx` | Session search |
| `tools-render/index.ts` | registerBuiltinToolPlugins |
| `tools-render/registry.ts` | Tool renderer registry |
| `tools-render/builtins/` | bash, edit, read, write, generic |
| `tools-render/extensions/` | subagent |
| `tools-render/utils/` | resolveData, searchSegments |

## Utils (utils/)

| File | Description |
|------|-------------|
| `assistantContent.ts` | Assistant content parsing |
| `format.ts` | Formatting utilities |
| `haptics.ts` | Haptic feedback |
| `kanbanPreviewDebug.ts` | Debug utils |
| `markdown.ts` | Markdown rendering |
| `path.ts` | Path utilities |
| `piTheme.ts` | Pi theme |
| `search.ts` | Search utilities |
| `session.ts` | Session utilities |
| `sessionDisplay.ts` | Display formatting |
| `sessionFilters.ts` | Filter logic |
| `settings.ts` | Settings utilities |
| `settingsApi.ts` | Settings API |
| `toolCallDisplay.ts` | Tool call display |
| `updateChecker.ts` | Update checking |

## Styles (styles/)

| File | Description |
|------|-------------|
| `_variables.less` | CSS variables |
| `_themes.less` | Theme definitions |
| `_base.less` | Base styles |
| `_layout.less` | Layout styles |
| `_messages.less` | Message styles |
| `_code-block.less` | Code block styles |
| `_tool-execution.less` | Tool execution styles |
| `_subagent.less` | Subagent styles |
| `_flow.less` | Flow view styles |
| `_scroll-markers.less` | Scroll marker styles |
| `_cmdk.less` | Command palette styles |
| `_search.less` | Search styles |
| `_filters.less` | Filter styles |
| `_tree.less` | Tree view styles |
| `_mobile.less` | Mobile styles |
| `_markdown.less` | Markdown styles |
| `_animations.less` | Animations |
| `_utilities.less` | Utility classes |
| `index.less` | Main entry (imports all)

## i18n (i18n/)

```
locales/
  en-US/
  zh-CN/
  ja-JP/
  de-DE/
  fr-FR/
  es-ES/
```

Config: `i18n/config.ts`, `i18n/index.ts`
