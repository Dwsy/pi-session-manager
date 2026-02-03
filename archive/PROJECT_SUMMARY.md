# Pi Session Manager - Project Summary

## 🎯 Project Overview

A Tauri2 desktop application for managing and searching Pi Agent sessions. Built with Rust backend and React frontend.

## ✅ Completed (Phase 1 - MVP)

### Core Features
- ✅ Session list scanning from `~/.pi/agent/sessions/`
- ✅ Session metadata extraction (id, cwd, message_count, timestamps)
- ✅ Session viewer with embedded Pi HTML template
- ✅ Full-text search across user and AI messages
- ✅ Dark mode UI with Tailwind-like styling
- ✅ Virtual scrolling support (via @tanstack/react-virtual)

## ✅ Completed (Phase 2 - Part 1)

### Session Management
- ✅ Delete sessions (with hover trash icon)
- ✅ Export sessions (HTML, Markdown, JSON formats)
- ✅ Rename sessions

### Search Enhancements
- ✅ Search result match count badges

### Analytics
- ✅ Statistics dashboard with:
  - Total sessions/messages overview
  - Message breakdown (user vs assistant)
  - Top projects list
  - Average messages per session

### UX Improvements
- ✅ Keyboard shortcuts:
  - `Cmd/Ctrl + R` - Refresh sessions
  - `Cmd/Ctrl + F` - Focus search
  - `Cmd/Ctrl + Shift + S` - Open statistics
  - `Esc` - Clear selection/close dialogs
- ✅ Export dialog with format selection
- ✅ Rename dialog
- ✅ Stats panel with charts

### Technical Implementation

#### Backend (Rust)
- **scanner.rs**: Scans JSONL session files, extracts metadata
- **search.rs**: Full-text search using regex matching
- **commands.rs**: Tauri IPC commands (scan_sessions, read_session_file, search_sessions, delete_session, export_session, rename_session, get_session_stats)
- **export.rs**: Export sessions to HTML/Markdown/JSON formats
- **stats.rs**: Statistics calculation and analytics
- **tantivy_search.rs**: Tantivy search engine (placeholder)
- **models.rs**: Serde data models

#### Frontend (TypeScript + React)
- **App.tsx**: Main application state management with keyboard shortcuts
- **SessionList.tsx**: Session list with date formatting and delete button
- **SessionViewer.tsx**: Iframe-embedded Pi HTML template with export/rename buttons
- **SearchPanel.tsx**: Search input with filters
- **ExportDialog.tsx**: Export format selection dialog
- **RenameDialog.tsx**: Rename session dialog
- **StatsPanel.tsx**: Statistics dashboard with charts
- **hooks/useKeyboardShortcuts.ts**: Keyboard shortcuts hook

### Project Structure
```
pi-session-manager/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # React components
│   ├── App.tsx            # Main app
│   └── types.ts           # TypeScript types
├── src-tauri/             # Backend (Rust)
│   ├── src/
│   │   ├── commands.rs    # Tauri commands
│   │   ├── scanner.rs     # Session scanner
│   │   ├── search.rs      # Search engine
│   │   └── models.rs      # Data models
│   └── Cargo.toml
├── dist/                  # Built frontend
└── tauri.conf.json        # Tauri configuration
```

## 📊 Data Flow

```
User Action
    ↓
Frontend (React)
    ↓
Tauri IPC
    ↓
Backend (Rust)
    ↓
File System (~/.pi/agent/sessions/)
    ↓
JSONL Parsing
    ↓
SessionInfo / SearchResult
    ↓
Frontend Display
```

## 🔍 Pi Session Format

Pi stores sessions as JSONL files:
```
~/.pi/agent/sessions/
├── --Users-dengwenyu-project-a--/
│   └── 2026-01-30T12-00-00-000Z_uuid.jsonl
```

Each JSONL file contains:
- Session header (type: "session")
- Message entries (type: "message")
- Metadata entries (type: "session_info", "compaction", etc.)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Tauri CLI

### Installation
```bash
cd /Users/dengwenyu/Dev/AI/pi-session-manager
npm install
```

### Development
```bash
npm run tauri:dev
```

### Build
```bash
npm run tauri:build
```

## 📋 Planned Features (Phase 2 - Remaining)

### Search Enhancements
- [ ] Advanced filters (date range, project, model)
- [ ] Tool call filtering toggle (UI only, needs backend)
- [ ] Search result snippet highlighting
- [ ] Saved searches

### Session Management
- [ ] Merge sessions

### Analytics
- [ ] Usage charts (timeline visualization)
- [ ] Model usage stats

### Performance
- [ ] Tantivy full-text search engine
- [ ] Indexed search cache
- [ ] Lazy pagination
- [ ] File system watcher for live updates

### UX Improvements
- [ ] Drag-and-drop file handling
- [ ] Copy message to clipboard
- [ ] Print session export

## 🛠 Dependencies

### Rust
- `tauri` 2.1 - Desktop app framework
- `tauri-plugin-dialog` 2.0 - File dialog support
- `serde` - Serialization
- `chrono` - Date/time
- `regex` - Pattern matching
- `dirs` - Cross-platform paths
- `tantivy` 0.22 - Full-text search engine
- `lazy_static` 1.4 - Global state management

### TypeScript
- `react` 18 - UI framework
- `@tauri-apps/api` - Tauri APIs
- `@tauri-apps/plugin-dialog` - File dialog support
- `date-fns` - Date formatting
- `lucide-react` - Icons
- `@tanstack/react-virtual` - Virtual scrolling

## 📝 Key Design Decisions

1. **Tauri2 over Electron**: Smaller bundle size, better performance
2. **Rust backend**: Safe, fast file I/O
3. **React frontend**: Familiar ecosystem, fast development
4. **Iframe for Pi HTML**: Reuse existing Pi template without modification
5. **Regex search initially**: Will upgrade to Tantivy for performance

## 🎨 UI Design

- Dark mode by default
- Monospace fonts for code
- Sidebar + main content layout
- Responsive design

## 🔒 Security

- File system access limited to `~/.pi/agent/sessions/`
- No network access needed
- Sandboxed iframe for session viewing

## 📈 Performance

- Async file reading
- Parallel session parsing
- Virtual scrolling for large lists
- Debounced search input (300ms)

## 🐛 Known Issues

1. Icon generation requires ImageMagick (skipped in current build)
2. Session HTML template is simplified (full Pi template integration needed)
3. No file system watcher for live updates

## 📚 References

- Pi Session Manager: `@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts`
- Pi Export HTML: `@mariozechner/pi-coding-agent/dist/core/export-html/`
- Pi Mono: `~/Dev/AI/pi-mono/packages/coding-agent/src/`

## 🤝 Contributing

This is a personal project for Pi Agent session management.

## 📄 License

MIT

---

**Status**: Phase 2 (In Progress) - Export/Delete/Rename/Stats features implemented
**Next Steps**: Continue implementing remaining Phase 2 features (Tantivy search, merge sessions, etc.)