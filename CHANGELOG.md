# Changelog

All notable changes to Pi Session Manager will be documented in this file.

## [0.8.3] - 2026-09-02

### Added

- Persisted built-in terminal transcripts and exposed bounded read-only history to plugins through the opt-in `terminal:read` permission and `ctx.psm.terminalHistory` SDK.
- Added a desktop “locate current session” action that can load later sidebar pages until the selected session is found.
- Added a setting to show or hide sessions stored under `subagent` / `subagents` directories, with an explicit subagent badge when shown.

### Changed

- Made the resume/copy provider picker denser and keyboard-operable with arrow-key selection and Enter activation.
- Inlined Kanban tag toggles into the main context menu instead of routing through a tag submenu.
- Renamed the code-review toolbar action to “Trace” with a branch icon, and fixed the cache-usage plugin build to use its host React shim without external React imports.

### Fixed

- Model testing now falls back to an installed `pi` or `omp` CLI when the bundled Pi AI helper script is unavailable, while rejecting unsupported tool-bearing requests explicitly.
- Preserved OMP session metadata chains when normalizing session entries.

## [Unreleased]

### Added

- **Full CASR provider coverage** — session support grew from 10 to 18 providers, adding Aider, Amp, ChatGPT, Cline, OpenClaw, Vibe, Kiro CLI and Grok Build. All are scannable, browsable and usable as conversion sources and targets
  - Upgraded the vendored CASR crate from 0.2.2 to upstream 0.3.0, which brings the official Antigravity, Kiro and Grok readers/writers, and replayed PSM's local fixes for Claude Code tool results, legacy Codex tool calls, and the current OpenCode SQLite schema
  - Added `casr_min/providers/vendored.rs`, which owns path matching for the delegated providers and forwards reads to CASR instead of maintaining a second set of parsers
  - Session discovery now recognizes non-JSONL session containers for Aider (markdown transcript), Amp and ChatGPT (JSON) and Cline (task directory)

### Changed

- Provider detection no longer lets CASR pick the reader by itself. PSM identifies the provider from the path and calls that reader explicitly, so a permissive JSONL parser can no longer claim a session that lives outside a known provider root
- The scanner and the file watcher now share one `is_session_candidate_path` gate instead of two copies of the same extension checks

### Fixed

- Cursor and Antigravity were missing from the resume-target validator and the conversion dialog's i18n tables, so selecting them silently fell back to Pi

- **OMP (oh-my-pi) session support** — the Pi fork's sessions (`~/.omp/agent/sessions`) are now scanned, parsed, and shown with their own source badge/icon alongside Pi and other external agents
  - Added `Omp` to the backend provider registry (`ProviderKind` / `SessionBridgeSource`) with `omp --session` resume and `~/.omp/...` session roots
  - Added `omp` binary to export command candidates
  - Added OMP source detection, AgentIcon (from the omp icon.svg), i18n strings, and resume-target support in the frontend

## [0.7.0] - 2026-07-14

### Added

- **Branch Atlas replay** — semantic checkpoint playback on the active branch path in full-screen Branch Atlas (play/pause, step, speed, scrub), with fork hints and map/Inspector focus
- **Favorites plugin** — dedicated favorites surface in the plugin app views
- **Skill invocation titles** — prettier skill titles in session lists and viewer

- **Branch Atlas views** — integrated branch-aware session visualization with global maps, timeline views, navigation, and session-branch modeling
- **Agent usage analytics** — added backend usage collection, provider parsers, runtime SDK support, and the built-in Agent Usage plugin
- **Cursor and Antigravity session sources** — added scanning, parsing, provider metadata, and session viewer support for both sources

### Changed

- **Plugin app view ordering** — plugin views can now be pinned and ordered while preserving the main content view
- **Embedded session tree density** — streamlined the tree controller and tightened the embedded session-tree layout

### Refactor

- **Branch visualization architecture** — replaced the previous flow-oriented implementation with the Branch Atlas model and dedicated map/timeline components

### Fixed

- **macOS lightweight close handling** — shared the lightweight close handler across recreated windows
- **Session bridge compatibility** — fixed parsing for Claude message envelopes and legacy Codex tool calls
- **Code review stability** — stabilized tool selection and static asset serving for the code-review plugin
- **Session viewer process folding** — kept `model_change` entries visible outside the process fold

### Added

- **Pi tree node-label search and source filtering** — labels are now first-class searchable node metadata in global full-text search and the in-session tree
  - Added Pi-specific raw label parsing with latest-wins / empty-label-clears semantics
  - Indexed resolved labels as `source_type = "label"` hits tied to target nodes
  - Added global `sourceFilter` modes: `all`, `labels_only`, `content_only`
  - Added browse-all-labels behavior for `labels_only + empty query`
  - Added backend/runtime `get_session_labels` lookup for chunked session trees
  - Added label-aware session-tree display, local search, labeled-only filtering, and target-node navigation

- **Pi Live session integration** — real-time session sync with pi agent
  - Unified TypeScript type definitions for live sessions
  - Live session indicator in sidebar and dashboard
  - Session viewer online status and model controls
  - Robust frontend parsing for live session entries
  - Full RPC command set for pi agent steering
  - Connection management via PiAgentRegistry

- **Pluggable tool render system** — extensible tool rendering architecture
  - Custom tool card rendering support
  - Toggle to disable tool success styling

- **ANSI escape sequence conversion** — convert ANSI codes to Markdown in thinking content
  - `ansiToMarkdown` with configurable `stripColor` flag

### Performance

- **recalculateVisualStructure optimization** — precomputed ancestor paths for faster tree recalculation
  - Reduced time complexity from O(n²) to O(n) for large session trees
  - Pre-computed ancestor paths avoid redundant tree traversals

### Refactor

- **Components directory reorganization** — complete refactor of flat `src/components/` into logical subdirectories
  - Split into: `app/`, `settings/`, `kanban/`, `dashboard/`, `session-viewer/`, `session-list/`, `command-palette/`, `search/`, `terminal/`
  - All imports updated, barrel exports added

- **Rust backend restructure** — improved maintainability
  - Reorganized `src-tauri/src/` into logical modules
  - Updated `lib.rs` exports and dispatch routing

- **TypeScript path aliases** — replaced relative imports with `@/*` aliases

### Fixed

- **CSS import paths** — corrected after directory reorganization
  - `SubagentModal` CSS import path
  - `SessionFlowView` CSS import path
- **Pi Live toggle button** — removed unused sidebar toggle
- **TypeScript errors** — resolved 2 pre-existing errors

### Changed

- **Unified single-port architecture for GUI mode**
  - Changed default `ws_port` from `52130` to `52131` (same as `http_port`)
  - GUI mode now uses HTTP `/ws` path instead of standalone WebSocket server
  - Both GUI and CLI modes now share the same single-port architecture

### Added

- **Session viewer in-message search navigation**
  - Added inline search UI with match highlighting across user/assistant messages and tool results
  - Added in-search scope filter with `All`, `User + Assistant Messages`, and `User Messages` modes
  - Added previous/next result paging with `Cmd/Ctrl + G` / `Shift + Cmd/Ctrl + G`
  - Close/reset via toolbar action, close button, or `Esc`

### Refactor

- **HTTP adapter decomposition and readonly API deduplication**
  - Split monolithic `http_adapter.rs` into facade + modular implementation
  - Added shared readonly service layer for full-text search, memory recall, analytics
  - Verified with `cargo fmt`, `cargo check --workspace`, and regression suites

- **SQLite cache module decomposition for maintainability**
  - Split monolithic `sqlite_cache.rs` into facade + modular implementation
  - Extracted modules: `bootstrap`, `schema`, `migrations`, `sessions`, `message_index`, etc.

- **Command skills module decomposition for maintainability**
  - Split `commands/skills.rs` into focused modules: `skills.rs`, `pi_resources.rs`, `pi_settings.rs`, `model_config.rs`, `config_versions.rs`

### Demo & Docs

- **Demo mode defaults are now deterministic**
  - Added `demo.html` and `dist-demo` build output
  - Added demo scripts: `dev:demo`, `build:demo`, `preview:demo`

- **Demo mock full-capability data engine**
  - Modular providers under `src/demo/*` (seed, content, search, stats, store, mode, types)
  - Render-ready JSONL coverage for bash, read, write, edit, subagent tools

### Platform & Tooling

- **Windows compatibility hardening (frontend + backend)**
  - Unified path-separator handling (`/` and `\`)
  - Expanded Windows shell detection (powershell.exe, pwsh.exe, cmd.exe, bash.exe)
  - Updated CLI build to cross-platform Node entry (`scripts/build-cli.mjs`)

- **Cross-platform script runtime (`.mjs`)**
  - Added `scripts/script-utils.mjs` for command execution, file checks, path handling

### Added

- **GitHub Releases update checker**
  - Automatic check once per day (non-intrusive)
  - Settings → Updates section with manual "Check Now"
  - Update toast dismissible per version, release notes in modal

- **App version source for update comparison**
  - Vite injects `__APP_VERSION__` at build time
  - Version resolution prefers CI/tag context and `git tag --points-at HEAD`

### Fixed

- **Session Viewer desktop toolbar dragging regression**
  - Restored window dragging in Tauri desktop mode
  - Added explicit `getCurrentWindow().startDragging()` fallback on toolbar `mousedown`

- **Mobile Outline layering and overlap regression**
  - Mobile Outline now renders as true left side drawer (`fixed`, constrained width)
  - Opening Outline closes "More actions" sheet first

- **External terminal launch is now production-usable across macOS/Linux/Windows**
  - Platform-specific terminal probing with ordered fallback attempts
  - Custom terminal command supports placeholders: `{command}`, `{cwd}`, `{path}`, `{pi}`
  - External terminal default changed to `auto`

- **Sidebar paginated sessions loading regression**
  - Prevented `silent` refresh from hijacking foreground loading lifecycle
  - Added in-flight request de-duplication

- **Session viewer open-position hydration regression**
  - Top mode now eagerly loads all remaining chunks on session open
  - Added chunk merge de-duplication (`mergeEntriesWithUniqueIds`)

- **Session viewer scroll performance and virtualization stability**
  - Moved virtual-scroll state to `SessionViewerMessages` to reduce parent-level re-renders
  - Tuned message virtualizer overscan from `12` to `8`

- **Command Palette readability and tag contrast**
  - Increased tab count badge readability
  - Refined message result role chip to icon+label pill

### Changed

- **Command Palette search UX and interaction architecture**
  - Expanded `Cmd/Ctrl + K` panel size and result viewport
  - Tabs work as true search scopes (plugin-scoped search)
  - Added request sequencing guard and search cache key improvements

- **Command Palette message-search performance optimization**
  - Reduced default FTS fetch window from `48` to `40` hits per query
  - Added in-memory session metadata cache

- **Session Viewer mobile toolbar UX and readability refresh**
  - Reworked mobile top actions into clear primary controls (Outline / Thinking / More)

### Changed

- **Atomic commit sync** — synchronized changelog entries for recent refactors
  - Backend: paginated session APIs, byte-offset incremental reader, project filter matching
  - Frontend: App container modularized, SessionViewer split, paginated session loading hook

### Added

- **Heatmap enhancements** — interactive day detail modal and rich tooltips
  - Click any heatmap day to open modal with project breakdown, session list, hourly distribution

- **Subagent usage stats** — track subagent costs in Dashboard
  - `SubagentSummary` and `AgentStats` types mirror backend Rust structs
  - Combined token count reflects main session + subagents

- **Kanban preview modal FLIP animation** — smooth card-to-modal transition
  - FLIP (First, Last, Invert, Play) animation from KanbanCard to SessionPreviewModal
  - Focus trap, mobile responsive, reduced motion support

- **Embedding Service** — local GGUF model inference for shared embedding
  - EmbeddingGemma 300M Q8_0 (768 dims, ~435MB RAM, ~4-8ms inference)
  - Auto-release after 5 min idle

- **API Test Panel** — online diagnostics in Settings
  - Tests all endpoints: embedding, sessions, memory recall, analytics
  - Latency measurement with color-coded results

- **Session Intel Module** — `session_intel.rs` for memory/experience analytics
  - Structured recall with intent detection and confidence scoring

### Changed

- **Exact phrase search with quotes** — search supports exact contiguous phrase matching via double quotes
  - Example: `"foo bar baz"` matches only contiguous occurrences

- **Internationalization** — All Chinese code comments translated to English
  - Rust backend: 10 files translated
  - TypeScript/React frontend: 17 files translated

- **Theme alignment for diff cards** — light theme colors now match tool card background
  - Light theme `toolSuccessBg` changed to minty `#E6F0E7`

- **Scroll markers enhanced** — compaction markers and glassmorphic tooltips
  - Compaction entries render as purple scroll markers
  - Tooltips upgraded to glassmorphic style

### Added

- **Appearance customization** — custom Pi theme mode and configurable UI/monospace fonts
  - Theme mode supports `dark | light | system | custom`
  - New font controls split UI text (`fontFamily`) and code (`fontFamilyMono`)

- **Subagent session viewer** — view full subagent conversations inline
  - Clickable subagent tool call cards showing agent name, model, duration, tokens
  - Modal renders complete subagent JSONL session
  - Nested subagent support with stacked modals

- **Tauri drag region fix** — toolbar buttons now clickable on macOS overlay title bar
  - SessionViewer and KanbanBoard toolbars carry own `data-tauri-drag-region` at `z-20`

- **Pi Config TUI settings panel** — unified resource management aligned with pi source
  - Resources tab: scan and manage extensions/skills/prompts/themes
  - Settings tab: 25+ settings across 5 groups (Model, Behavior, Advanced, Terminal, Appearance)

### Fixed

- **Compaction component styling** — collapsed/expanded states now render correctly
- **Session deletion safety and recoverability** — explicit confirmation, Trash first
- **Appearance font sizing consistency** — Small/Medium/Large now scales consistently
- **Dashboard flash-on-update** — incremental updates no longer trigger full skeleton screen

### Fixed

- **Project filter state persistence** — filter state preserved when switching views
- **Mobile viewport height** — fixed iOS Safari address bar causing layout overflow
- **Mobile safe area insets** — top/bottom/left/right safe area padding classes
- **Desktop drag region conditional** — Tauri title bar drag region only renders in desktop app
- **Mobile SessionViewer toolbar overflow** — redesigned with overflow menu

### Changed

- **SessionTree user messages** — two-line layout with "User:" label
- **SessionTree tool call colorization** — different tools display in distinct colors

### Added

- **SessionTree tool call colorization** — colorized by tool type
  - Fixed colors: read (blue), edit (yellow), write (purple), bash (green), search (cyan), web_fetch (orange)
  - Other tools auto-assigned from 8-color palette

### Fixed

- **SessionTree text truncation** — CSS `text-overflow: ellipsis` instead of JS hard-truncation
- **Pi Config settings default values** — boolean settings now use correct defaults
- **Resource viewer modal clipping** — modal now renders via `createPortal` to `#portal-root`

### Added

- **Unified SearchFilterBar component** — reusable search + tag filter bar shared across all views
- **Full-text search (FTS)** — message-level search across all sessions
  - SQLite FTS5 virtual table, role filtering, pagination, scoring
  - Incremental indexing during scanning, corruption recovery

### Fixed

- **i18n hardcoded strings cleanup** — fixed ~50 hardcoded strings across 19 component files

### Fixed

- **GUI dev mode now correctly uses Vite dev server** — fixed `tauri://localhost` white screen issue

### Added

- **Unified single-port architecture (CLI)** — API, WebSocket, and frontend on port 52131
  - `src-tauri-cli/src/main.rs` rewritten with axum Router

- **Remote auth gate** — frontend authentication for non-local access
  - `AuthGate` component wraps app, detects non-localhost access

- **Remote config via URL params** — `?server=`, `?token=`, `?transport=` query parameters

### Changed

- **Mobile adaptation** — full responsive support for < 768px screens
  - Full-screen page switching with bottom navigation bar (5 tabs)
  - Diff view switches to unified mode on mobile

- **Connection status banner** — real-time transport health indicator
  - Red/amber/green banners for disconnected/reconnecting/connected states

- **Incremental session scanning** — backend cache + diff-based updates
  - Scanner: persistent cache, `CACHE_VERSION` counter, `get_session_digest()`

- **HTTP transport + SSE** — mobile-friendly alternative to WebSocket
  - `HttpTransport`: POST `/api` + SSE `/api/events`

- **Auth token management** — API key CRUD for remote access
- **Configurable bind address** — control network exposure
- **Session content cache** — faster back-navigation (LRU, 5 entries)

### Changed

- **Flow view** — new graph visualization mode for conversation trees
  - React Flow based node graph with compact tree algorithm
  - Role-based node icons, MiniMap, toolbar with zoom controls

- **Multi-path session directories** — scan sessions from multiple locations
- **Hierarchical labels** — parent-child tag relationships
- **Kanban UX improvements** — project filtering, context menu, untagged first
- **Tree view improvements** — `findNewestLeaf` navigation, Write filter

## [0.6.91] - 2026-07-10

### Added

- **Pi configuration management** — expanded resource and settings management across the Pi configuration panel
- **Session entry transformer extension** — added an extension point for transforming session entries
- **Pi Live and external session UX** — added session actions, paginated sidebar support, scroll markers, and context-delete workflows
- **Plugin onboarding and localization** — added plugin setup to onboarding and expanded settings/model/plugin translations

### Changed

- **Session viewer and code review** — refined viewer controls, toolbar/title actions, preview actions, and split shell/file review surfaces
- **Settings and app shell** — simplified appearance settings and refreshed dashboard, sidebar session, and session-list surfaces
- **Release update checks** — prefer update manifests before falling back to GitHub Releases

### Fixed

- **Session preview** — guard the code-review host when no session is selected
- **Session bridge** — fixed command/cache usage paths and preserved external tool-result roles
- **Deep links and installer** — fixed cold-start deep links and polished CLI installer output

## [0.6.9] - 2026-07-03

### Fixed

- **Windows CI tests** — run Rust tests without default GUI features to prevent Windows GUI DLL crashes

## [0.6.8] - 2026-07-03

### Fixed

- **Pi Live test build** — added the required feature gate and corrected the dispatch unit-test assertion

## [0.6.7] - 2026-07-03

### Fixed

- **CI dependency resolution** — aliased `@google/genai` to an empty mock in Vite to resolve CI build failures

## [0.6.6] - 2026-07-03

### Added

- **Codex themes** — added built-in Codex themes to Appearance settings
- **Pi Notes extension** — introduced the notes extension
- **Session viewer controls** — added pinned panels and expanded session-viewer interactions
- **Update checker and session actions** — added update utilities and related session actions
- **Remote connections** — expanded settings, tree, and session-bridge support for remote connections

### Changed

- **Session viewer and backend** — refreshed viewer layout, scroll behavior, session commands, scanner, SQLite storage, authentication, and tray integration
- **Code review and Pi bridge** — updated review components and bridge client tools/tests
- **Shortcuts and localization** — aligned navigation shortcuts, command-palette triggers, settings controls, and multiple locale translations

### Fixed

- **Code review read operations** — render read operations as content blocks instead of raw arguments

## [0.6.5] - 2026-06-10

### Added

- **Subagent compatibility** — refactored the compatibility layer for external subagent sessions
- **Terminal and remote modes** — added Ghostty support, Tauri remote-mode switching, and CLI port/runtime improvements
- **Dataset mode** — added standalone browser-dataset mode and deployment support
- **Cross-platform CLI installation** — added install scripts and improved CLI build tooling
- **Keyboard and command workflows** — expanded settings, Command Palette, and shortcut interactions

### Changed

- **Session loading** — replaced the loading animation with a short grace period to avoid distracting flashes
- **Code review** — compacted the status strip and hid secondary detail content by default

### Fixed

- **Windows title-bar behavior** — disabled unsupported drag regions and localized shortcut labels
- **Pi Live source detection** — enabled real-time features only for Pi sessions
- **User-message modal** — rendered the expand modal through a portal

## [0.6.4] - 2026-06-04

### Added

- **PSM plugin platform** — added the runtime host, SDK client/types, generic plugin records, permissions, app views, path plugins, and npm-installable plugin boundaries
- **Builtin plugin migration** — moved trace, tool rendering, code review, and session graph functionality into plugins
- **Generative UI and agent bridge** — added a generative UI renderer and host-managed agent bridge capabilities
- **Session Sidechat** — added threaded sidechat backend/frontend, configurable options, and persisted conversations
- **Session intelligence** — added the intelligence panel, summary/analytics surfaces, and initial AI summary/session-intelligence plugins
- **Search and session sources** — added paginated source-filtered search, WSL CLI session sources, external resume bridge files, and conversion compatibility improvements
- **Plugin and dashboard capabilities** — added day insights, theme catalogs, cache-usage/word-cloud views, bulk selection and density controls, scoped terminals, and docked panels

### Changed

- **Plugin architecture** — reorganized settings, runtime host, session viewer, app shell, and SDK documentation around the plugin platform
- **Navigation and review UX** — refined command surfaces, Kanban interactions, tool inspection, session preview flows, and unified side panels
- **Backend boundaries** — added font/plugin-window commands and updated dispatch, session opening, and domain modules

### Fixed

- **Session and routing compatibility** — fixed conversion IPC parameters, external resume bridge writes, deep-link/tag handling, clicked branch context, sidechat fallback context, and hard-to-reproduce preview routes
- **Data and platform edge cases** — handled incomplete dataset loads, acknowledged database downgrades, and improved external conversion compatibility
- **Rust and build checks** — resolved clippy issues and font sorting behavior

## [0.6.3] - 2026-05-21

### Fixed

- **WebView CPU usage** — fixed a SettingsPanel render loop that caused maximum update depth warnings and sustained WebContent CPU usage.
- **Pi Live event pressure** — stopped high-frequency live update events from flooding the Tauri WebView bridge while preserving external WebSocket delivery.
- **Pi Live sidebar state** — reused unchanged live session state references to avoid unnecessary React re-renders.

## [0.6.2] - 2026-05-21

### Added

- **Settings sections** — split settings into focused app behavior, data sources, diagnostics, Pi agent, and search/export sections.
- **Dashboard day drilldown** — expanded heatmap day modal with richer daily stats and preview flow.
- **Review modal tests** — added coverage for tool-call review and session viewer derived data behavior.

### Changed

- **Tool call review UI** — refined ToolCallReviewModal into a flatter IDE-style review surface with clearer diff and operation filtering.
- **Conversation process rendering** — removed legacy tool-call folding paths in favor of inline expanded process entries.
- **Kanban interactions** — tightened drag state, delete confirmation, and menu behavior.
- **Session loading** — improved session refresh, pagination, and notification lifecycle handling.

### Fixed

- **Native feel cleanup** — removed ineffective sidebar vibrancy/accent hooks and updated related audit docs.
- **Stats cache** — added cache token fields to day statistics and demo/runtime stats data.
- **Release metadata** — synchronized package, Cargo, and Tauri versions for v0.6.2.

## [0.6.1] - 2026-05-15

### Added

- **System tray & lightweight mode** — minimize-to-tray on close, lightweight mode toggle in Advanced Settings
- **Session tree gutter layout** — enhanced SessionTree with gutter layout and detail pane
- **Date range, model, and source filters** — LabelFilter now supports date range, model, and source type filtering
- **Terminal launcher expansion** — added warp, zed, hyper, tabby, ghostty launch support
- **Bulk insert/upsert** — SQLite bulk operations and FTS trigger management API
- **IO tracing diagnostics** — scanner startup classify-reason diagnostics for IO analysis
- **Conversation preview folding** — collapsible conversation preview in session viewer
- **ThinkingBlock improvements** — collapsed state with brain icon for thinking content
- **Conversation mode primary** — conversation mode is now the default view
- **Tag filter submenu & dashboard i18n** — added tag filter submenu and dashboard translations (en/zh)
- **Model field propagation** — session model field now flows through the full scan pipeline

### Fixed

- **Dashboard insight modal** — pass sessions prop to DashboardInsightModal
- **Settings locale sync** — sync settings locale keys and minor frontend fixes
- **Thinking toggle collapse** — make thinking toggle collapse blocks properly
- **Terminal session open** — open session via local web route
- **Stats cache tokens** — include cache tokens in totals
- **resume-x SQLite error** — expose SQLite init error instead of misleading 'no session' message
- **resume-x session switch** — prevent stale context access, use withSession callback
- **CI pipeline** — fixed macOS rustup compatibility, release CLI permissions, lint gate ordering

### Changed

- **Code block styling** — frosted glass header overlay, refined tool path display
- **Message layout** — split viewer controllers and message layout for cleaner architecture
- **Sidebar responsibilities** — clarified project sidebar component boundaries
- **pi-session-bridge** — restructured extension with src/ directory, reads port from config, supports 8-char session IDs
- **Performance** — truncate message previews in list query to 200 chars for faster rendering
- **Tech debt cleanup** — code quality improvements, cargo config for faster dev builds

## [0.6.0] - 2026-05-09

### Added

- **Kanban workspaces** — added workspace management, project search, time-range filtering, and improved workspace filtering/sorting
- **Session labels and search** — indexed labels in full-text search, added label badges, and updated labels during full-parse fallback
- **Resume-X extension** — added a SQLite-backed fast session-resume extension with search, detail panes, preview mode, tool folding, and keyboard navigation
- **Routing and deep links** — added URL-driven project/feature routes, session URL synchronization, and the `pi-session://` deep-link scheme
- **Incremental scanning diagnostics** — added IO tracing, scan diagnostics, byte-offset reads, incremental database updates, and append-only file handling
- **CLI and transport APIs** — added IPv6 dual-stack support, terminal commands in WS dispatch, and the HTTP session-entries API

### Changed

- **Scanner and SQLite performance** — reduced redundant file reads and database work, batched incremental updates, raised WAL checkpoint thresholds, and removed redundant indexes
- **Session navigation** — improved sidebar refresh behavior, session-list search, Kanban virtualization, loading splash timing, and truncated-name marquee display
- **Input and theming** — added CJK/IME-safe inputs, light-mode color adaptation, and viewport-relative settings sizing

### Fixed

- **Resume-X preview** — fixed preview entry, rendering, tool detection, search navigation, session switching, and stale context handling
- **Session and routing state** — fixed route synchronization clearing selection, deep-link listener churn, and duplicate desktop main content
- **Search and labels** — fixed label indexing, session rename persistence, and fast-search skeleton flashes
- **Database and CLI** — fixed cold-start stats retries, workspace command registration, and terminal/server edge cases

## [0.5.7] - 2026-04-30

### Added

- **IO diagnostics** — added instrumentation across file reads, session parsing, database writes, and scanner paths
- **Trace and preview UX** — added LoopStrip-based trace navigation, collapsible tool rendering, and a persistent command-palette preview panel
- **Dashboard and settings search** — added insight-modal search/filter/sort and fuzzy search across settings
- **Session preview shortcuts** — added Option/Alt-click preview opening from session lists

### Changed

- **Scanner and SQLite performance** — introduced incremental sync, header-only parsing, cache warm-up, larger page cache, reduced duplicate scans, and lower checkpoint/write IO
- **Session viewer** — improved flow/tree building, tool expansion scroll stability, and preview interactions

### Fixed

- **Updater and configuration** — corrected updater protocol/endpoint handling and fallback behavior
- **Session actions** — restored preview imports, improved copy feedback, and registered stats/fork commands
- **Search and platform behavior** — fixed IME-triggered searches, large-dataset timeout handling, and Windows path assertions

## [0.5.6] - 2026-04-22

### Added

- **IME input handling** — added the shared `useCompositionInput` hook for safe CJK input
- **Dashboard insights** — grouped insight statistics by provider
- **Terminal workflows** — added Ghostty, resume-command copy, improved terminal tabs, and related shortcut handling
- **Dataset and CLI distribution** — added standalone dataset mode, pages deployment, cross-platform install scripts, and improved CLI builds

### Changed

- **Session and terminal UX** — improved scroll reset behavior and copy-to-toast feedback
- **Translations and documentation** — refreshed Chinese translations and architecture documentation

### Fixed

- **Updater reliability** — disabled the rate-limit-prone automatic path and added safer fallback handling
- **Session viewer scrolling** — prevented jumps and preserved position when expanding tool calls
- **Search input** — handled IME composition so pinyin input does not trigger premature searches

## [0.5.5] - 2026-04-18

### Added

- **Pi Live** — added real-time agent monitoring, chat, available-model selection, slash commands, request/response bridging, and live session indicators
- **External session providers** — added cross-agent session scanning, filtering, resume controls, and CASR-based provider bridges
- **Dataset browser** — added browser dataset management and API integration
- **Trace analytics** — added trace extraction, details/analytics charts, timeline/Gantt views, and inspector tooling
- **Search and tool rendering** — added node-label/source-filter search, message-search plugins, and the registry-based tool-render system
- **Model and settings management** — expanded model configuration, settings registries/tabs, Command Palette, and session preview workflows

### Changed

- **Architecture** — introduced runtime-data providers, session-bridge/domain modules, plugin-aware backend adapters, and modular settings/session-viewer components
- **Frontend UX** — refreshed session lists, Kanban, onboarding, translations, tool execution, and dashboard surfaces

### Fixed

- **Pi Live stability** — fixed streaming state, queue preservation, stale session switching, slash-command loading, and available-model propagation
- **External session conversion** — preserved tool payloads and hardened resume/copy flows
- **Search and data migrations** — fixed quoted session-ID handling, FTS sorting/filtering, and compatibility with SQLite schema changes

## [0.5.4] - 2026-04-11

### Added

- **External session controls** — added provider filtering, unified resume flows, configurable resume targets, and available-model support
- **Pi Live controls** — added model selector, thinking-level controls, slash-command completion/history, and live input
- **Session tree and dashboard polish** — improved tree simplification, virtualization, tooltips, toolbar borders, and dashboard card hover effects

### Changed

- **Session bridge architecture** — reorganized CASR bridge operations and unified external-provider resume commands
- **SQLite writes** — added retry handling and busy timeouts for concurrent writes

### Fixed

- **Tool payload preservation** — preserved tool payloads during conversion verification
- **CI and build configuration** — synchronized lockfiles, dispatch signatures, updater capabilities, and release validation
- **Session viewer behavior** — reset scroll after chat send, stabilized model-selector rendering, and corrected project live-count calculations

## [0.5.3] - 2026-04-07

### Added

- **tmux resume command** — added unique tmux session names and copy-to-clipboard toast feedback

## [0.5.2] - 2026-04-07

### Added

- **Tauri updater** — added signed auto-updates, progress UI, updater artifacts, and release signing support
- **Pi Live integration** — added live-session indicators, online status, model controls, agent steering RPCs, and bridge state synchronization
- **Pluggable tool rendering** — added extensible tool-card rendering and success-style configuration
- **ANSI thinking rendering** — converted ANSI escape sequences to Markdown with configurable color stripping
- **Search and command palette** — added session-ID lookup, integrated full-text search filters, sort order controls, and session preview flows

### Changed

- **Component architecture** — reorganized frontend components into logical directories and replaced relative imports with TypeScript path aliases
- **Rust backend** — split dispatch, commands, domain, and utility modules for clearer boundaries
- **Session and settings UX** — refreshed Command Palette, settings, session list/Kanban, onboarding, and localization surfaces

### Fixed

- **Live session synchronization** — corrected payload extraction, streaming updates, RPC correlation, disconnect cleanup, and session matching
- **Cross-platform builds** — guarded platform-specific imports/exports and fixed Windows/macOS release build issues
- **Search and UI behavior** — fixed quoted session-ID handling, search sorting, initial empty-state flashes, and related command-menu behavior

## [0.5.1] - 2026-03-31

### Added

- **Terminal resume command** — resume sessions from web terminal with full workflow
  - `buildResumeCommand()` generates `cd + pi --session` command
  - Custom resume command template with placeholders: `{command}`, `{cwd}`, `{path}`, `{pi}`
  - `resumeCommand` stored in settings, editable via Terminal Settings

- **Configurable Cmd+F behavior** — toggle between in-session search and sidebar focus

- **In-session search navigation** — enhanced search within open session
  - `Cmd/Ctrl + F` toggles search input
  - Previous/next paging with `Cmd/Ctrl + G` / `Shift + Cmd/Ctrl + G`

### Fixed

- **Session viewer toolbar window dragging** — restored draggable title bar
- **Global keyboard shortcuts** — allow app-level shortcuts from text inputs
- **Window size clamping** — initial window size respects monitor work area (#27)

### Changed

- **Terminal launcher auto-detection** — improved cross-platform detection

## [0.5.0] - 2026-03-27

### Performance

- **SQLite message entry ingest optimization** — major performance improvements
  - Batched multi-row `INSERT OR REPLACE` (42% faster: 457ms → 215ms)
  - Eliminated duplicate `DELETE FROM message_entries` per upsert
  - Optimized chunk size from 64 to 32 rows
  - Joined `sessions` directly in FTS query
  - Folded `total_hits` via `COUNT(*) OVER ()`
  - Benchmark: 604ms → 278ms (~54% improvement)

## [0.4.9] - 2026-03-14

### Added

- **Session fork functionality** — branch existing sessions
- **Cmd+F behavior setting** — toggle between in-session search and sidebar
- **ModelConfigCenter** — visual model management component
- **Model config and Pi settings commands** — backend support
- **Thinking text indexing and CJK support** — improved search
- **Scoped in-session search** — search within open session

### Refactor

- **HTTP adapter decomposition** — modular submodules
- **SQLite cache module decomposition** — modular submodules
- **Session commands split** — focused command modules

### Fixed

- **Fallback default for cmdFBehavior** — setting behavior
- **Search cache and plugin hooks** — improved performance

## [0.4.8] - 2026-03-05

### Added

- **Demo mode polish** — pending UI improvements shipped
- **Deterministic static demo mode** — demo.html with dist-demo

### Fixed

- **Demo auth gate bypass** — demo mode authentication
- **Desktop toolbar window dragging** — restored functionality

## [0.4.7] - 2026-03-04

### Added

- **Session UX and dashboard polish** — interaction improvements
- **Update-check flow** — GitHub Releases integration
- **Cross-platform runtime hardening** — Windows/Linux support
- **Session multi-select from filter bars** — UX improvement

### Fixed

- **Terminal launcher clippy** — needless_return issue

## [0.4.6] - 2026-03-04

### Added

- **Terminal resume compatibility** — enhanced auto-detection and fallback

### Fixed

- **Sidebar pagination stability** — refresh and scroll anchor preservation

### Refactor

- **Session viewer scroll decoupling** — message list scroll/render separation

## [0.4.5] - 2026-03-03

### Added

- **Session sorting and batch delete** — workflow improvements
- **Session list sort and chunked APIs** — backend support

### Fixed

- **Session viewer hydration** — deterministic restore

## [0.4.4] - 2026-03-03

*No changes in this release.*

## [0.4.3] - 2026-03-03

### Added

- **Paginated session APIs** — safer HTTP fallback
- **Configurable task navigation open position** — top/bottom mode
- **Subagent modal polish** — progressive rendering (#19)
- **Thinking blocks as markdown** — improved rendering
- **Tool output expand/collapse animation** — UI enhancement
- **Dynamic tool-based session filters** — filtering options

### Refactor

- **App shell modularization** — UI side-effects extraction
- **Session viewer flows** — modular component design

## [0.4.2] - 2026-02-27

### Added

- **Compaction scroll markers** — glassmorphic tooltips
- **Heatmap day detail modal** — interactive heatmap
- **Heatmap data model** — day stats API
- **Exact phrase search** — quoted query support
- **Scrollable code blocks** — max height support
- **Kanban FLIP animation** — card-to-modal transition
- **Session preview modal** — preview state management

### Fixed

- **Session deletion confirmation** — explicit in-app confirmation
- **Duplicate ID handling** — parseSessionEntries fix
- **Kanban animation flicker** — useLayoutEffect fix

## [0.4.1] - 2026-02-23

### Added

- **Subagent usage stats** — Dashboard integration
- **Subagent meta scanning** — cost aggregation
- **Flow View enhancements** — interactive minimap
- **Terminal-focused keyboard shortcuts** — priority handling

### Fixed

- **SQLite connection reuse** — review findings addressed
- **Cold start session display** — show all sessions instead of last 2 days

## [0.4.0] - 2026-02-17

### Added

- **PWA support** — vite-plugin-pwa integration

### Fixed

- **Legacy database NULL handling** — SQLite compatibility

## [0.3.4] - 2026-02-17

### Added

- **Screenshot light/dark auto-switch** — theme-aware screenshots

### Fixed

- **Website routing** — MDX relative links, language switcher
- **GitHub Pages deployment** — trailingSlash, basePath

## [0.3.3] - 2026-02-15

### Added

- **Mobile safe area** — notch handling
- **Tool colorization** — SessionTree UX
- **Command palette z-index** — overlay conflict fix

## [0.3.2] - 2026-02-14

### Added

- **Terminal watcher** — CLI mode support
- **Manual API key mode** — authentication option

### Fixed

- **Gzip Content-Type header** — HTTP responses
- **CLI clippy gates** — watcher and terminal modules

## [0.3.1] - 2026-02-14

### Fixed

- **Gzip response** — explicit Response builder
- **CompressionStream typing** — BufferSource compatibility
- **pnpm frozen lockfile** — CI consistency

## [0.3.0] - 2026-02-14

### Added

- **Multi-language support** — German, Spanish, French translations
- **Toggle and SettingsCard components** — reusable UI
- **Subagent session viewer** — modal with toolbar
- **Pi Config TUI** — resource management and settings
- **SearchFilterBar** — unified search + tag filter
- **Unified single-port server** — HTTP + WS + auth
- **Connection status banner** — transport health indicator
- **Mobile adaptation** — responsive < 768px
- **Incremental session scanning** — cache-based diff
- **HTTP transport + SSE** — mobile alternative
- **Auth token management** — configurable bind address

### Fixed

- **GUI dev mode** — Vite dev server integration
- **Onboarding UX** — bind_addr config

### Refactor

- **AdvancedSettings redesign** — card layout
- **Incremental scanning** — cache architecture

## [0.2.2] - 2026-02-13

### Added

- **Project filtering** — Kanban UX
- **Hierarchical labels** — parent-child tags
- **Multi-path session directories** — multiple locations
- **Flow view mode** — React Flow visualization
- **Toolbar with zoom controls** — flow view
- **Role icons on nodes** — User/Bot/Wrench/Settings

### Fixed

- **Flow view parent chain** — filtering toolResult entries
- **Tree view branch switching** — node click navigation

### Refactor

- **rust-embed frontend assets** — binary embedding
- **Kanban rewrite** — @dnd-kit → react-kanban-kit

## [0.2.1] - 2026-02-12

### Fixed

- **TransportProvider hook** — invalid hook call fix
- **Export HTML test** — skip when pi CLI unavailable
- **CI build failures** — general fixes

## [0.2.0] - 2026-02-11

### Added

- **Windows and Linux support** — cross-platform terminal
- **Platform-aware terminal defaults** — shell detection
- **Services configuration step** — onboarding
- **Cache clear command** — maintenance
- **Embedded PTY terminal** — backend + frontend
- **GUI/CLI dual-mode startup** — flexible launch
- **Triple-stack communication** — WebSocket + HTTP + Tauri IPC

### Fixed

- **Theme-aware diff viewer** — light/dark mode
- **Tool output overflow** — scrollable containers

### Refactor

- **CSS custom properties theme** — semantic tokens
- **Appearance hooks** — streamlined implementation
- **Settings hooks** — simplified architecture

## [0.1.2] - 2026-02-10

### Added

- **Collapsible tree nodes** — session view
- **System locale auto-detection** — i18n
- **Keyboard shortcuts section** — settings
- **Onboarding guide** — new users
- **Favorites with project selection** — filtering

## [0.1.1] - 2026-02-04

*Bug fixes and minor improvements.*

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
- Export sessions to HTML/Markdown/JSON format
- Rename sessions
- Export dialog with format selection

#### Phase 2 - Search & Analytics
- Search result match count badges
- Statistics dashboard (sessions, messages, top projects)

#### Phase 2 - UX Improvements
- Keyboard shortcuts: `Cmd/Ctrl + R/F/Shift+S`, `Esc`
- Hover delete button, export/rename buttons
- Stats button in sidebar header

### Technical

#### Backend (Rust)
- `export.rs`, `stats.rs`, `tantivy_search.rs` modules
- `delete_session`, `export_session`, `rename_session`, `get_session_stats` commands
- Dependencies: `tauri-plugin-dialog`, `tantivy`, `lazy_static`

#### Frontend (TypeScript/React)
- `ExportDialog.tsx`, `RenameDialog.tsx`, `StatsPanel.tsx` components
- `useKeyboardShortcuts.ts` hook
- `SessionStats`, `DailyActivity` types

### Fixed
- SessionViewer empty body rendering
- Search functionality and JSON parsing
- Search result match count display

### Changed
- HTML server-side generation for performance
- Tool call filtering in search
- Consistent dark theme colors
