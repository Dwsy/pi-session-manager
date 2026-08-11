# Frontend

## Directory Structure

```
src/
  App.tsx        # Application composition root
  main.tsx, transport.ts, types.ts
  components/app/ # Mobile/desktop layout and pane adapters
  components/    # Feature and shared UI components
  hooks/app/     # Application-shell feature controllers
  hooks/         # Feature/data/UI hooks
  contexts/      # Shared React contexts
  plugins/       # Plugin system and runtime host
  utils/         # Pure utilities and API helpers
  i18n/          # i18n resources
  styles/        # Global and feature styles
```

`App.tsx` is the composition root: it wires feature hooks, route state, and mobile/desktop panes. Cohesive state machines and side-effectful feature controllers belong in `hooks/app/`; presentational layout belongs in `components/app/`. New app-shell behavior should extend the owning controller instead of adding another inline state cluster to `App.tsx`.

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
| `AppPluginViewPane.tsx` | Plugin app view pane |
| `AppPluginSidebarPane.tsx` | Plugin sidebar pane |
| `AppDashboardPane.tsx` | Dashboard pane |
| `AppSessionViewerPane.tsx` | Session viewer pane |
| `AppSettingsPane.tsx` | Settings pane |
| `AppTerminalPane.tsx` | Terminal pane |
| `AppProjectListPane.tsx` | Project list pane |
| `resolveDesktopMainContent.ts` | Picks the desktop main pane (session viewer / plugin view / explorer / dashboard) |

### Explorer (explorer/)

Full-width project and session browser rendered in the desktop main pane
(route `/explorer`, toggled from the sidebar search row). It reuses the app-level
search/tag/source/model/date filter state and shows more per-session metadata
than the sidebar cards.

| Component | Description |
|-----------|-------------|
| `ExplorerPane.tsx` | Tabs, project scope chip, filter bar slot, row actions, context menu |
| `ExplorerSessionTable.tsx` | Virtualized session table incl. plugin-contributed columns |
| `ExplorerProjectTable.tsx` | Virtualized project table incl. plugin project actions |
| `explorerModel.ts` | Pure grouping/sorting helpers |

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

### Plugin App Views

Host app-level plugin views are rendered through `src/components/app/AppPluginViewPane.tsx`
and sidebars through `src/components/app/AppPluginSidebarPane.tsx`. Built-in app
view implementations live under `extensions/psm-*`.

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
| `SessionRowContextMenu.tsx` | Shared right-click menu wiring for session rows |

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

First-launch guide. Four environment-aware steps; deep configuration is delegated to
Settings sections through `SETTINGS_NAVIGATE_EVENT` instead of being duplicated here.

| File | Description |
|------|-------------|
| `Onboarding.tsx` | Dialog shell: layout, step nav, focus trap, completion |
| `steps/OnboardingWelcomeStep.tsx` | Scanned library stats and busiest projects |
| `steps/OnboardingSourcesStep.tsx` | Detected agents, per-provider include toggles |
| `steps/OnboardingAppearanceStep.tsx` | Theme, text size, language |
| `steps/OnboardingThemePreview.tsx` | Token-driven live preview of the session viewer |
| `steps/OnboardingReadyStep.tsx` | Shortcut cheat sheet and settings deep links |
| `onboardingStatus.ts` | Completion flags, local/settings reconciliation, reset |
| `onboardingSummary.ts` | Pure session-library aggregation for the welcome step |
| `ShowOnboardingAgainButton.tsx` | Shared reset control used by the maintenance sections |

Completion is stored twice on purpose: `settings.onboarding.completed` is the source of
truth across devices, and the `onboarding-completed` localStorage key is a fast path that
avoids a flash of the guide on first paint. `psm-first-scan-done` is separate so skipping
the guide does not suppress the initial scanning splash.

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
| `OpenInBrowserButton.tsx` | Open in browser |
| `OpenInTerminalButton.tsx` | Open in terminal |
| `SessionViewer.tsx` | Session viewer (standalone) |
| `UpdateNoticeToast.tsx` | Update notification |

## Hooks (hooks/)

### App Hooks (hooks/app/)

| Hook | Ownership |
|------|-----------|
| `useAppBootstrap` | Startup, initial data loading, file watcher, terminal settings bootstrap |
| `useAppUiEffects` | Mobile modal body state and pending-entry cleanup |
| `useAppViewNavigation` | Plugin app-view routes, mobile tabs, sidebar items, and app-view shortcuts |
| `useDesktopSidebarActions` | Desktop sidebar navigation actions |
| `useFavorites` | Favorite item loading and mutations |
| `useOnboardingGate` | First-launch guide visibility and first-scan tracking |
| `useSidebarSessions` | Sidebar filtering, pagination, project summary, and list props |
| `useTerminalScopes` | Terminal visibility, active scope, bounded scope cache, and pending commands |
| `useUpdateChecker` | Desktop update checks and update-notice actions |

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

### PSM Browser Plugins

For writing PSM browser plugins, start with [Plugin Authoring](06-plugins.md). It links the public SDK contract, capability audit, extension examples, build/install shape, and verification checklist.

Key local boundaries:

- First-party built-ins live in `extensions/psm-*` and are discovered through `src/plugins/runtime-host/builtins.ts`.
- External npm/path plugins must build browser-compatible ESM and use only `@pi-session-manager/plugin-sdk` as the public API.
- Plugin UI should register host contributions through `ctx.ui`, read settings through `ctx.settings`, and use injected `ctx.i18n` for text.
- Published bundles must not import app aliases or host internals such as `@/components`, `@/types`, runtime host files, app transport, Tauri APIs, or desktop-private code.
- Heavy or experimental dependencies belong inside plugin packages, not the main app dependency graph.

## Utils (utils/)

| File | Description |
|------|-------------|
| `assistantContent.ts` | Assistant content parsing |
| `format.ts` | Formatting utilities |
| `haptics.ts` | Haptic feedback |
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
| `_branch-atlas.less` | Branch Outline 与 Branch Map 样式 |
| `_branch-atlas-timeline.less` | Active Path Timeline 样式 |
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
