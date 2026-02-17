# Changelog

All notable changes to Pi Session Manager will be documented in this file.

## [Unreleased]

### Added

- **Subagent session viewer** — view full subagent conversations inline
  - Clickable subagent tool call cards showing agent name, model, duration, tokens, task preview
  - Modal with scale+fade animation renders the complete subagent JSONL session (reuses UserMessage, AssistantMessage, ToolCallList, etc.)
  - Supports single, parallel, chain, and management (list/get) action modes
  - Nested subagent support — subagent within subagent opens stacked modals with incremental z-index
  - Thinking/Tools toggle buttons (⌘T / ⌘O) in both main SessionViewer toolbar and SubagentModal toolbar
  - Capture-phase keyboard interception prevents shortcuts from leaking between modal and parent view
  - JSONL cache (10 entries) with fallback path resolution (artifactPaths → sessionFile)
  - `exitCode === 0` is now the sole success indicator — ignores benign "terminated" error from pi-subagents
  - File watcher filters out `subagent-artifacts/` paths to prevent ghost sessions in main list
  - Portal-rendered modal avoids parent overflow clipping; mobile responsive

- **Tauri drag region fix** — toolbar buttons now clickable on macOS overlay title bar
  - SessionViewer and KanbanBoard toolbars carry their own `data-tauri-drag-region` at `z-20`
  - Background overlay lowered to `z-10` for Dashboard fallback
  - Empty toolbar space remains draggable; buttons use `no-drag` via existing CSS rule

- **Pi Config TUI settings panel** — unified resource management and settings editor aligned with pi source
  - Resources tab: scan and manage extensions/skills/prompts/themes with user+project scope grouping
  - `scan_all_resources` backend: scans `~/.pi/agent/` and `.pi/` for all resource types with metadata
  - YAML frontmatter parsing for SKILL.md descriptions (handles `>`, `|`, quoted, unquoted formats)
  - Resource toggle via `+/-` prefix mechanism matching pi's enable/disable pattern
  - Resource viewer modal: click Eye icon to preview SKILL.md/README.md content rendered as markdown
  - Settings tab: full alignment with pi source `settings-manager.js` — 25+ settings across 5 groups (Model, Behavior, Advanced, Terminal, Appearance)
  - Nested settings support via dot-notation (`compaction.enabled`, `retry.maxRetries`, etc.)
  - Progressive model loading: fast from `models.json`, then full from `pi --list-models`
  - Provider/Model as dropdowns with background refresh
  - Version History as standalone third tab with preview/restore UI
  - `read_resource_file` command with path traversal security guard
  - `load_pi_settings_full`, `save_pi_setting`, `toggle_resource` backend commands

### Fixed

- **Dashboard flash-on-update** — incremental session updates no longer trigger full skeleton screen
  - Only show `DashboardSkeleton` on first load (stats === null); subsequent updates refresh data silently in background
  - Refresh button spins (`animate-spin`) during background reload as lightweight visual feedback
  - Project switch correctly resets state to show skeleton for the new context
  - Removed the 300ms minimum skeleton timer that was adding unnecessary delay

### Fixed

- **Mobile viewport height** — fixed iOS Safari address bar causing layout overflow
  - Added `viewport-fit=cover` to enable `env(safe-area-inset-*)` on iOS
  - Introduced `.h-screen-safe` utility using `100dvh` with `100vh` fallback, replacing raw `h-screen` on all root containers (App, AuthGate)
  - `html, body, #root` use `height: 100% + overflow: hidden` to prevent whole-page scrolling
  - Added `overscroll-behavior: none` to prevent iOS bounce scroll
- **Mobile safe area insets** — top/bottom/left/right safe area padding classes now available
  - Mobile session detail and tab layout apply `safe-area-top` to avoid notch overlap
  - Bottom nav already had `safe-area-bottom`; added `safe-area-left/right/all` for landscape
- **Desktop drag region conditional** — Tauri title bar drag region only renders in desktop app, not web
  - Sidebar toolbar adapts height: fixed `h-8` with drag in Tauri, auto-height without drag in web
  - Right-side transparent drag overlay only renders when `isTauri()` is true
  - `--titlebar-height` CSS variable set to `32px` in Tauri, `0px` in web
  - Drag overlay hidden when terminal is maximized to prevent click blocking
- **Mobile SessionViewer toolbar overflow** — redesigned with overflow menu
  - Toolbar now shows: back + title + search + thinking + tools + ⋮ (overflow menu)
  - Overflow menu contains: system prompt, scroll top/bottom, rename, export, resume
  - Click-outside-to-close with proper ref-based detection

### Changed

- **SessionTree user messages** — two-line layout with "User:" label
  - User message nodes now display a small "User:" label on the first line and message preview on the second
  - Preview text increased from 50 to 80 characters
  - Tree node alignment switches to `flex-start` for user messages via `:has()` selector

### Added

- **SessionTree tool call colorization** — different tools display in distinct colors
  - Fixed colors for core tools: read (blue), edit (yellow), write (purple), bash (green), search (cyan), web_fetch (orange)
  - Other tools auto-assigned from an 8-color palette via deterministic hash
  - Dark and light theme variants via CSS variables for proper contrast in both modes
  - Toggleable in Settings → Session → "Colorize Tool Calls" (enabled by default)

### Fixed

- **SessionTree text truncation** — replaced JS hard-truncation (`slice + '...'`) with CSS `text-overflow: ellipsis`
  - Tool call text (bash commands, file paths) now uses native `…` instead of ugly `...`
  - Added `min-width: 0; flex: 1` to `.tree-content` for correct ellipsis in flex layout

- **Pi Config settings default values** — boolean settings now use correct defaults from pi source code
  - `compaction.enabled`, `retry.enabled`, `enableSkillCommands`, `terminal.showImages`, `images.autoResize` default to `true` when absent
  - `hideThinkingBlock`, `quietStartup`, `collapseChangelog`, `terminal.clearOnShrink`, `images.blockImages`, `showHardwareCursor` default to `false`
  - Enum/number settings also respect their pi source defaults (`steeringMode` → `one-at-a-time`, `autocompleteMaxVisible` → `5`, etc.)
- **Resource viewer modal clipping** — modal now renders via `createPortal` to `#portal-root` outside React tree, preventing overflow clipping by Settings panel ancestors

### Added

- **Unified SearchFilterBar component** — reusable search + tag filter bar shared across all views
  - New `SearchFilterBar` component combining inline search input with `LabelFilter` dropdown
  - Desktop sidebar: search + tag filter always visible for list, project, and kanban views
  - Kanban board header: integrated search box next to project badge and session count
  - Mobile: filter bar with search + tags on list, project, and kanban tabs
  - Context-aware placeholder: "搜索会话..." for list/kanban, "搜索项目..." for project view
  - Search filters by session name, first/last message, and project directory
  - Added i18n keys: `common.searchProjectsPlaceholder` (en-US / zh-CN)

- **Full-text search (FTS)** — message-level search across all sessions
  - New `full_text_search` Tauri command with SQLite FTS5 virtual table for fast full-text search
  - Supports role filtering (user/assistant/all), path glob patterns, pagination, and scoring
  - Integrated into UI: press `Cmd+Shift+F` to open search modal from anywhere
  - Results show role icons, snippets, timestamps; click to jump to entry with automatic scroll and highlight
  - Incremental indexing during scanning writes to `message_entries` and `message_fts` virtual table
  - Backfill migration automatically indexes existing sessions on first run
  - Corruption recovery: automatically rebuilds database if FTS triggers corruption
  - Updated i18n with full-text search keys across 6 locales (en-US, zh-CN, de-DE, es-ES, fr-FR, ja-JP)

### Fixed

- **i18n hardcoded strings cleanup** — fixed ~50 hardcoded Chinese/English strings across 19 component files
  - Settings sections: `TerminalSettings` (收起/展开), `AppearanceSettings` (紧凑/舒适/宽松), `SessionSettings` (列表/目录/项目), `AdvancedSettings` (option labels), `ModelSettings` (快/中/慢, test prompt)
  - Dashboard: `StatsPanel` (stat labels & time titles), `WeeklyComparison` (vs last week), `ActivityHeatmap` (Less/More), `TokenTrendChart` (no data text)
  - Viewer: `TreeNode` (Session Start, Model, tool calls), `SessionTree` (Loading), `SessionFlowView` (toolbar titles)
  - Subagent: `SubagentModal` (Thinking/Tools/Close/Show/Hide), `SubagentToolCall` (click to view)
  - Terminal: `TerminalPanel` (New terminal/Select shell/Hide panel)
  - Other: `SessionListByDirectory` (tooltip labels), `TagManagerSettings` (Add child), `PiConfigSettings` (View), `Onboarding` (WebSocket/HTTP API)
  - Added missing `settings.sections.tags` key to both en-US and zh-CN locale files
  - Added new i18n keys: `session.tree.*`, `session.tooltip.*`, `settings.terminal.collapse/expandSettings`, `settings.advanced.bindAddrLocal/bindAddrAll`, `settings.models.speed.*`, `settings.models.testPrompt`, `dashboard.weeklyComparison.vsLastWeek`, `components.subagent.*`, `components.sessionFlow.*`, `components.terminalPanel.*`, `components.tokenTrend.*`, `components.tagManager.*`, `components.piConfig.*`, `onboarding.steps.services.websocket/httpApi`

### Fixed

- **GUI dev mode now correctly uses Vite dev server** — fixed `tauri://localhost` white screen issue
  - Removed `custom-protocol` from default `gui` feature in `Cargo.toml` (only needed for production builds)
  - Added `init_http_adapter_with_options()` to control static file serving based on runtime mode
  - GUI dev mode: HTTP adapter serves API only, Tauri connects to `http://localhost:1420` (Vite)
  - CLI mode: HTTP adapter serves API + embedded frontend from `dist/`
  - Hot module replacement (HMR) now works correctly in development

### Added

- **Unified single-port architecture (CLI)** — API, WebSocket, and embedded frontend all served on one port (52131)
  - `src-tauri-cli/src/main.rs` rewritten with axum Router: `POST /api`, `GET /ws`, `GET /health`, SPA fallback
  - Eliminates need for separate WS/HTTP ports; single tunnel/proxy sufficient for remote access
  - rust-embed serves built frontend assets with SPA fallback to `index.html`

- **Remote auth gate** — frontend authentication for non-local access
  - `AuthGate` component wraps app; detects non-localhost access and prompts for API token
  - Backend `GET /api/auth-check` endpoint returns `{ needsAuth, authenticated }`
  - Token stored in localStorage (`psm.apiToken`), sent as `Bearer` header
  - Show/hide toggle on password input, loading spinner, error feedback
  - `X-Forwarded-For` header support so auth works behind reverse proxies (ngrok, etc.)

- **Remote config via URL params** — `?server=`, `?token=`, `?transport=` query parameters
  - `readRemoteConfig()` in transport.ts reads URL params → localStorage → env vars
  - WS/HTTP URLs derived from `location.protocol`/`hostname`/`port` (no hardcoded ports)
  - WS path changed to `/ws` on same port as HTTP (merged architecture)

### Changed

- `http_adapter.rs` — unified auth via `is_authorized()` (Bearer header + `?token=` query param), SSE auth added
- `vite.config.ts` — `allowedHosts: true` for tunnel/proxy access, proxy config for `/api` and `/ws`
- axum dependency gains `ws` feature in both `src-tauri/Cargo.toml` and `src-tauri-cli/Cargo.toml`

- **Mobile adaptation** — full responsive support for < 768px screens
  - `useIsMobile` hook (matchMedia-based, 768px breakpoint)
  - Full-screen page switching with bottom navigation bar (5 tabs: list, projects, kanban, dashboard, settings)
  - Session detail takes over full screen with back arrow navigation
  - Diff view switches to unified (single-column) mode on mobile
  - Kanban board uses top-tab single-column layout instead of horizontal scroll
  - Dashboard stat grid: 5th card spans full width to avoid orphan half-row
  - StatCard label text bumped to 11px on mobile for readability
  - Settings panel: animated list → detail page navigation on mobile
  - Dialogs (export, rename) expand to 95vw on mobile
  - Long-press context menu on session list (touch devices)
  - CSS: 36px min touch targets, safe-area-bottom padding, kanban snap scroll

- **Connection status banner** — real-time transport health indicator
  - Red banner when WS/HTTP transport disconnects ("无法连接到服务")
  - Amber "正在重新连接…" during reconnection attempts
  - Green "已重新连接" flash (2s) on recovery, then auto-hide
  - Skips initial connecting state to avoid flash on first load
  - Works on both mobile and desktop layouts

- **Incremental session scanning** — backend cache + diff-based updates
  - Scanner: persistent cache (no TTL), `CACHE_VERSION` atomic counter, `get_session_digest()`
  - `rescan_changed_files()`: re-parse only changed .jsonl files, merge into cache
  - File watcher: accumulate changed paths, batch rescan, emit `SessionsDiff` payload
  - Frontend: `patchSessions()` merges diffs into session list without full reload
  - `useFileWatcher` receives diffs and accumulates within debounce window
  - SessionViewer: event-driven incremental update replaces 1s polling interval
  - `all_messages_text` no longer serialized from backend (skip_serializing)

- **HTTP transport + SSE** — mobile-friendly alternative to WebSocket
  - `HttpTransport`: POST `/api` for commands, SSE `/api/events` for real-time diffs
  - Auto-detect mobile web → use HTTP transport instead of WebSocket
  - Backend: SSE endpoint via axum + async-stream

- **Auth token management** — API key CRUD for remote access
  - `list_tokens` / `create_token` / `revoke_token` / `update_last_used` in auth.rs
  - Tauri IPC commands + WS/HTTP dispatch for list/create/revoke
  - Advanced Settings UI: key list, create with name, copy notice, revoke with confirm

- **Configurable bind address** — control network exposure
  - `bind_addr` field in ServerSettings (default `127.0.0.1`)
  - WS/HTTP adapters bind to configured address
  - Onboarding: bind address selector with local/remote hints and mobile access instructions
  - Remote warning badge when `0.0.0.0` selected

- **Session content cache** — faster back-navigation in SessionViewer
  - LRU cache (5 entries) keyed by path + modified timestamp
  - Cache hit skips file read entirely, StrictMode double-mount also hits cache

- **Terminal resume command** — resume sessions from web terminal
  - `buildResumeCommand()` generates `cd + pi --session` command
  - `TerminalPanel` accepts `pendingCommand` prop, writes to shell after 500ms

### Changed

- WebSocket `invoke()` waits for connection (connectWaiters queue + 10s timeout) instead of throwing immediately
- WebSocketTransport uses `location.hostname` instead of hardcoded `localhost`
- TransportContext simplified to singleton via `getTransport()`, removed `wsUrl`/`forceWebSocket` props
- Onboarding dialog responsive (95vw on mobile), shows bind_addr config in Services step
- Session load error: silent console.error instead of blocking `alert()`

- **Flow view** — new graph visualization mode for conversation trees
  - React Flow (`@xyflow/react`) based node graph with compact tree algorithm
  - Collapses linear tool call chains, shows skipped tool names on edges (e.g. `bash x2, read, edit`)
  - Role-based node icons: User / Bot / Wrench / Settings
  - Toolbar: zoom in/out, fit view, focus active node
  - MiniMap with role-based coloring
  - Click node to navigate to corresponding conversation branch
  - Shares filter bar with tree view (Default / No Tools / User / All / Read / Edit / Write)
  - Theme-aware via CSS variables, follows light/dark mode

- **Multi-path session directories** — scan sessions from multiple locations
  - Backend: `Config.session_paths` + `get_all_session_dirs()` multi-directory scanning
  - Frontend: `sessionDirs` array in Advanced Settings with add/remove UI
  - New commands: `get_session_paths`, `save_session_paths`, `get_all_session_dirs`
  - File watcher monitors all configured directories with dynamic reload
  - Legacy `sessionDir` (string) auto-migrated to `sessionDirs` (string[])

- **Hierarchical labels** — parent-child tag relationships
  - Backend: `parent_id` column on tags table, wired through create/update
  - Frontend: `getDescendantIds`, `getRootTags`, `getChildTags` in useTags hook
  - TagPicker renders tree structure with expand/collapse
  - TagManagerSettings groups statuses vs custom labels
  - New LabelFilter component with search, grouped sections, descendant filtering
  - Renamed "tag" → "label" across en-US/zh-CN i18n

- **Kanban UX improvements**
  - Project-based filtering via new ProjectFilterList sidebar
  - Untagged column moved to first position
  - Context menu on right-click: terminal, browser, favorite, labels, delete
  - Project selection persists across view switches

- **Tree view improvements**
  - `findNewestLeaf` navigation — clicking any node follows newest child chain
  - Write tool filter button alongside Read/Edit
  - Collapse toggle only on branch points (nodes with >1 children)

### Changed
- HTTP adapter uses `rust-embed` to serve frontend assets from binary instead of runtime `ServeDir`
- Session tree sidebar floats over content with smooth transition animation

### Fixed
- Tree view: clicking a node now switches the conversation branch (previously only scrolled)
- Flow view: fixed broken parent chain when filtering toolResult entries — build tree from all entries, let compactTree handle skipping
- Flow view: filter out session/thinking_level_change/label metadata nodes

## [0.1.0] - 2026-01-30

### Added

#### Phase 1 - MVP
- Session list scanning from `~/.pi/agent/sessions/`
- Session metadata extraction (id, cwd, message_count, timestamps)
- Session viewer with Pi HTML template
- Full-text search across user and AI messages
- Dark mode UI with Tailwind-like styling
- Virtual scrolling support

#### Phase 2 - Session Management
- Delete sessions with confirmation dialog
- Export sessions to HTML format
- Export sessions to Markdown format
- Export sessions to JSON format
- Rename sessions
- Export dialog with format selection
- Rename dialog

#### Phase 2 - Search & Analytics
- Search result match count badges
- Statistics dashboard with:
  - Total sessions count
  - Total messages count
  - User vs assistant message breakdown
  - Average messages per session
  - Top projects list

#### Phase 2 - UX Improvements
- Keyboard shortcuts:
  - `Cmd/Ctrl + R` - Refresh sessions
  - `Cmd/Ctrl + F` - Focus search
  - `Cmd/Ctrl + Shift + S` - Open statistics
  - `Esc` - Clear selection/close dialogs
- Hover delete button on session items
- Export button in SessionViewer toolbar
- Rename button in SessionViewer toolbar
- Stats button in sidebar header

### Technical

#### Backend (Rust)
- Added `export.rs` module for export functionality
- Added `stats.rs` module for statistics calculation
- Added `tantivy_search.rs` module (placeholder for future)
- Added `delete_session` Tauri command
- Added `export_session` Tauri command
- Added `rename_session` Tauri command
- Added `get_session_stats` Tauri command
- Added `tauri-plugin-dialog` dependency
- Added `tantivy` dependency
- Added `lazy_static` dependency

#### Frontend (TypeScript/React)
- Added `ExportDialog.tsx` component
- Added `RenameDialog.tsx` component
- Added `StatsPanel.tsx` component
- Added `useKeyboardShortcuts.ts` hook
- Added `SessionStats` type
- Added `DailyActivity` type
- Updated `SessionViewer.tsx` with export/rename buttons
- Updated `SessionList.tsx` with delete button and match badges
- Added `@tauri-apps/plugin-dialog` dependency

### Fixed

- Fixed SessionViewer empty body issue - now correctly renders messages
- Fixed search functionality - now properly searches session content
- Fixed JSON parsing in SessionViewer to handle Pi session format
- Fixed search result mapping to display correct match counts

### Changed

- Improved SessionViewer to generate HTML server-side for better performance
- Enhanced search to support tool call filtering
- Updated UI styling with consistent dark theme colors