# Pi Session Manager

A Tauri2 desktop application for managing and searching Pi Agent sessions. Built with Rust backend and React frontend, providing fast performance and efficient session handling.

## Features

### Core Functionality

**Session Management**
- Browse all Pi sessions from `~/.pi/agent/sessions/`
- View session details with embedded Pi HTML template
- Delete unwanted sessions with confirmation
- Rename sessions for easy identification
- Export sessions to HTML, Markdown, or JSON formats

**Search Capabilities**
- Full-text search across user messages and AI responses
- Real-time search with match count badges
- Filter search results by role (user/assistant/all)
- Tool call filtering support

**Analytics Dashboard**
- Statistics overview with key metrics
- Message breakdown (user vs assistant)
- Top projects visualization
- Activity heatmap showing usage patterns
- Token usage tracking and cost analysis
- Time distribution charts (hourly/daily)

### User Experience

**Multiple View Modes**
- List view: Simple chronological session list
- Directory view: Sessions organized by project directory
- Project view: Grouped by project with session counts

**Keyboard Shortcuts**
- `Cmd/Ctrl + R` - Refresh session list
- `Cmd/Ctrl + F` - Focus search input
- `Cmd/Ctrl + Shift + S` - Open statistics panel
- `Cmd/Ctrl + K` - Open command palette
- `Cmd/Ctrl + ,` - Open settings
- `Esc` - Clear selection / Close dialogs

**Internationalization**
- English (en-US) - Default language
- Simplified Chinese (zh-CN)
- Extensible translation system

### Performance

**2-Layer Cache System**
- Real-time layer: Direct file system scan for sessions within 2 days
- Historical layer: SQLite database for sessions older than 2 days
- Background scanner updates cache every 30 seconds
- Incremental updates for modified sessions only

**Optimizations**
- Virtual scrolling for large session lists
- Debounced search input (300ms)
- Async file reading with tokio
- Parallel session parsing

## Architecture

### Backend (Rust)

```
src-tauri/src/
├── commands.rs          # Tauri IPC commands
├── scanner.rs           # Session scanner (2-layer cache)
├── scanner_scheduler.rs # Background scanner (30s interval)
├── sqlite_cache.rs      # SQLite storage layer
├── search.rs            # Full-text search engine
├── session_parser.rs    # JSONL parser
├── export.rs            # Export functionality
├── stats.rs             # Statistics calculation
├── config.rs            # Configuration management
├── file_watcher.rs      # File system monitoring
├── tantivy_search.rs    # Tantivy integration (placeholder)
├── models.rs            # Data models
├── lib.rs               # Library entry point
└── main.rs              # Application entry point
```

### Frontend (React + TypeScript)

```
src/
├── components/          # React components (75 files)
│   ├── SessionList.tsx
│   ├── SessionListByDirectory.tsx
│   ├── ProjectList.tsx
│   ├── SessionViewer.tsx
│   ├── SearchPanel.tsx
│   ├── Dashboard.tsx
│   ├── ExportDialog.tsx
│   ├── RenameDialog.tsx
│   ├── SettingsPanel.tsx
│   ├── CommandPalette.tsx
│   └── dashboard/       # Dashboard components
├── hooks/               # Custom React hooks (9 files)
│   ├── useKeyboardShortcuts.ts
│   ├── useFileWatcher.ts
│   └── useSessionBadges.ts
├── plugins/             # Search plugins (8 files)
│   ├── BaseSearchPlugin.ts
│   ├── MessageSearchPlugin.tsx
│   ├── ProjectSearchPlugin.tsx
│   ├── SessionSearchPlugin.tsx
│   └── registry.ts
├── i18n/                # Internationalization
│   ├── locales/
│   │   ├── en-US/       # English translations
│   │   └── zh-CN/       # Chinese translations
│   └── config.ts
├── utils/               # Utility functions
├── types.ts             # TypeScript type definitions
├── App.tsx              # Main application
└── main.tsx             # Application entry point
```

### Data Flow

**Session Scanning**
```
Frontend Request
    ↓
scan_sessions() command
    ↓
Calculate cutoff (now - 2 days)
    ↓
┌──────────────┬──────────────┐
│ Real-time    │ Historical   │
│ (≤ cutoff)   │ (> cutoff)   │
└──────────────┴──────────────┘
    ↓               ↓
File System     SQLite Query
Scan             Get Sessions
    ↓               ↓
    └───────┬───────┘
            ↓
    Merge Results
    Sort by modified DESC
            ↓
    Return SessionInfo[]
```

**Search Flow**
```
User Input Query
    ↓
Debounced (300ms)
    ↓
search_sessions() command
    ↓
Rust search.rs
    ↓
Regex matching on:
- Session names
- Message content
- User messages
- Assistant messages
    ↓
Return SearchResult[] with matches
    ↓
Display in UI
```

## Database Schema

The SQLite cache stores session metadata at `~/.pi/agent/sessions.db`:

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    cwd TEXT NOT NULL,
    name TEXT,
    created TEXT NOT NULL,
    modified TEXT NOT NULL,
    file_modified TEXT NOT NULL,
    message_count INTEGER NOT NULL,
    first_message TEXT,
    all_messages_text TEXT,
    last_message TEXT,
    last_message_role TEXT,
    cached_at TEXT NOT NULL,
    access_count INTEGER DEFAULT 0,
    last_accessed TEXT
);

CREATE INDEX idx_modified ON sessions(modified DESC);
CREATE INDEX idx_cwd ON sessions(cwd);
CREATE INDEX idx_file_modified ON sessions(file_modified);
```

## Pi Session Format

Pi stores sessions as JSONL files:

```
~/.pi/agent/sessions/
├── --Users-dengwenyu-project-a--/
│   └── 2026-01-30T12-00-00-000Z_uuid.jsonl
└── --Users-dengwenyu-project-b--/
    └── 2026-01-30T13-00-00-000Z_uuid.jsonl
```

Each JSONL file contains:
- Session header (type: "session")
- Message entries (type: "message")
- Metadata entries (type: "session_info", "compaction", etc.)

Example JSONL format:
```json
{"type":"session","id":"uuid","timestamp":"2026-01-30T12:00:00Z","cwd":"/path/to/project"}
{"type":"message","id":"msg1","parentId":null,"timestamp":"2026-01-30T12:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"type":"message","id":"msg2","parentId":"msg1","timestamp":"2026-01-30T12:00:02Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]}}
```

## Installation

### Prerequisites

- Node.js 18 or higher
- Rust 1.70 or higher
- Tauri CLI

### Setup

```bash
# Clone the repository
cd ~/Dev/AI/pi-session-manager

# Install dependencies
npm install

# Run development server
npm run tauri:dev
```

### Build for Production

```bash
# Build the application
npm run tauri:build

# The output will be in src-tauri/target/release/bundle/
```

## Development

### Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build frontend for production
- `npm run preview` - Preview production build
- `npm run tauri:dev` - Run Tauri in development mode
- `npm run tauri:build` - Build Tauri application

### Rust Development

```bash
# Check Rust code
cd src-tauri && cargo check

# Build Rust code
cd src-tauri && cargo build

# Run tests
cd src-tauri && cargo test
```

### Project Structure

```
pi-session-manager/
├── src/                  # Frontend (React + TypeScript)
│   ├── components/       # React components
│   ├── hooks/            # Custom hooks
│   ├── plugins/          # Search plugins
│   ├── i18n/             # Translations
│   ├── utils/            # Utilities
│   ├── App.tsx           # Main app
│   └── main.tsx          # Entry point
├── src-tauri/            # Backend (Rust)
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   ├── tauri.conf.json   # Tauri configuration
│   └── capabilities/     # Tauri capabilities
├── public/               # Static assets
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
├── tailwind.config.js    # Tailwind CSS configuration
├── vite.config.ts        # Vite configuration
└── README.md             # This file
```

## Configuration

### Application Settings

Settings are stored in `~/.pi/agent/session-manager.json`:

```json
{
  "general": {
    "theme": "dark",
    "language": "en"
  },
  "scanner": {
    "realtime_cutoff_days": 2,
    "enable_fts5": false
  },
  "terminal": {
    "default_terminal": "iterm2",
    "pi_command_path": "pi",
    "custom_terminal_command": ""
  }
}
```

### Tauri Configuration

Located in `src-tauri/tauri.conf.json`:
- Window size: 1400x900 (minimum: 1000x600)
- Identifier: com.pi.session-manager
- Version: 0.1.0

## Dependencies

### Rust Dependencies

- `tauri` 2.1 - Desktop app framework
- `tauri-plugin-shell` 2.1 - Shell plugin
- `tauri-plugin-dialog` 2.0 - File dialog support
- `serde` 1.0 - Serialization framework
- `serde_json` 1.0 - JSON handling
- `tokio` 1.0 - Async runtime
- `chrono` 0.4 - Date/time handling
- `regex` 1.11 - Pattern matching
- `dirs` 5.0 - Cross-platform paths
- `rusqlite` 0.32 - SQLite database
- `tracing` 0.1 - Logging framework
- `toml` 0.8 - Configuration parsing
- `notify` 6.1 - File system watcher

### TypeScript Dependencies

- `react` 18.3 - UI framework
- `react-dom` 18.3 - React DOM
- `@tauri-apps/api` 2.9 - Tauri APIs
- `@tauri-apps/plugin-dialog` 2.6 - File dialog API
- `@tanstack/react-virtual` 3.10 - Virtual scrolling
- `recharts` 3.7 - Charting library
- `i18next` 25.8 - i18n framework
- `react-i18next` 16.5 - React i18n bindings
- `date-fns` 3.6 - Date formatting
- `marked` 17.0 - Markdown parser
- `highlight.js` 11.11 - Code highlighting
- `lucide-react` 0.454 - Icon library
- `cmdk` 1.1 - Command palette
- `tailwindcss` 3.4 - CSS framework

## Tauri Commands

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `scan_sessions` | - | `SessionInfo[]` | Scan all sessions (2-layer cache) |
| `read_session_file` | `path: String` | `String` | Read JSONL file content |
| `get_session_entries` | `path: String` | `SessionEntry[]` | Parse session entries |
| `search_sessions` | `sessions, query, searchMode, roleFilter, includeTools` | `SearchResult[]` | Full-text search |
| `delete_session` | `path: String` | `()` | Delete a session |
| `export_session` | `path, format, outputPath` | `String` | Export session |
| `rename_session` | `path, newName` | `()` | Rename a session |
| `get_session_stats` | `sessions` | `SessionStats` | Get session statistics |
| `load_app_settings` | - | `Settings` | Load application settings |
| `save_app_settings` | `settings` | `()` | Save application settings |

## Internationalization

### Adding a New Language

1. Create a new translation file in `src/i18n/locales/`:
   ```typescript
   // src/i18n/locales/your-lang.ts
   export const yourLang = {
     common: {
       // translations
     },
     // other namespaces
   } as const
   ```

2. Add the language to `src/i18n/config.ts`:
   ```typescript
   resources: {
     en: { translation: enUS },
     zh: { translation: zhCN },
     yourLangCode: { translation: yourLang },
   }
   ```

3. Update `LanguageSwitcher.tsx` to include the new language option

### Translation Namespaces

- `common` - Common UI elements (buttons, labels)
- `app` - Application-level text
- `session` - Session-related text
- `search` - Search interface
- `export` - Export dialog
- `rename` - Rename dialog
- `project` - Project list
- `stats` - Statistics dashboard
- `dashboard` - Dashboard components
- `settings` - Settings panel
- `command` - Command palette
- `role` - Message roles
- `components` - Component-specific text

## Performance Metrics

| Metric | Before (JSON cache) | After (SQLite 2-layer) |
|--------|---------------------|------------------------|
| Startup time | ~2s (full scan) | ~200ms (2-day scan only) |
| Memory usage | ~50MB (all in memory) | ~25MB (historical in SQLite) |
| Incremental update | ~500ms (manual) | ~60ms (auto, 30s interval) |
| Cache size | ~25MB JSON file | ~30MB SQLite file |

## Known Issues

1. Icon generation requires ImageMagick (skipped in current build)
2. Session HTML template is simplified (full Pi template integration needed)
3. No file system watcher for live updates (feature in development)
4. Tantivy full-text search is not yet implemented (placeholder only)

## Future Enhancements

### Planned Features

**Search Enhancements**
- Tantivy full-text search engine
- Advanced filters (date range, project, model)
- Search result snippet highlighting
- Saved searches
- Search history

**Session Management**
- Session merge functionality
- Batch operations (delete, export)
- Session tags/categories
- Session favorites

**Analytics**
- Visual timeline charts
- Model usage statistics
- Daily activity heatmap
- Export statistics as CSV
- Session duration tracking

**UX Improvements**
- File system watcher for live updates
- Drag-and-drop file handling
- Copy message to clipboard
- Print session export
- Session thumbnails
- Custom color themes
- Session comparison view

**Accessibility**
- ARIA labels
- Keyboard navigation improvements
- Screen reader support
- High contrast mode

## Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style

- Rust: Follow `rustfmt` and `clippy` recommendations
- TypeScript: Follow ESLint rules with Prettier
- Commit messages: Use conventional commits format

### Testing

```bash
# Run Rust tests
cd src-tauri && cargo test

# Run TypeScript tests (when implemented)
npm test
```

## License

MIT License

## Support

For issues, questions, or contributions, please refer to the project documentation or open an issue in the repository.

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.