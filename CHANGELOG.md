# Changelog

All notable changes to Pi Session Manager will be documented in this file.

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

## [Unreleased]

### Changed
- Session tree sidebar now floats over content with `position: absolute` instead of pushing the main view
- Main content area auto-adjusts with `padding-left` to avoid being covered by the sidebar
- Smooth transition animation when toggling sidebar visibility (200ms)

### Planned
- Tantivy full-text search engine implementation
- Session merge functionality
- Advanced filters (date range, project, model)
- File system watcher for live updates
- Drag-and-drop file handling
- Copy message to clipboard
- Print session export
- Visual timeline charts in statistics panel
- Model usage statistics