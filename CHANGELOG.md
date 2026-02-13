# Changelog

All notable changes to Pi Session Manager will be documented in this file.

## [Unreleased]

### Added

- **Mobile adaptation** — full responsive support for < 768px screens
  - `useIsMobile` hook (matchMedia-based, 768px breakpoint)
  - Full-screen page switching with bottom navigation bar (5 tabs: list, projects, kanban, dashboard, settings)
  - Session detail takes over full screen with back arrow navigation
  - Diff view switches to unified (single-column) mode on mobile
  - Kanban board uses top-tab single-column layout instead of horizontal scroll
  - Dashboard stat grid: 5th card spans full width to avoid orphan half-row
  - StatCard label text bumped to 11px on mobile for readability
  - Settings panel: sidebar → horizontal scrollable tab bar
  - Dialogs (export, rename) expand to 95vw on mobile
  - CSS: 36px min touch targets, safe-area-bottom padding, kanban snap scroll
  - Terminal panel hidden on mobile (touch terminal not practical)

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