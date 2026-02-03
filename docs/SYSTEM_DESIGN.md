# Pi Session Manager - System Design

## Overview

A Tauri2 desktop application for managing and searching Pi Agent sessions stored in `~/.pi/agent/sessions/`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri2 Desktop App                       │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript + Vite)                      │
│  ├── App.tsx - Main application                            │
│  ├── components/                                            │
│  │   ├── SessionList.tsx - Virtual scrolling list          │
│  │   ├── SessionViewer.tsx - Iframe-embedded Pi HTML       │
│  │   └── SearchPanel.tsx - Search input and filters        │
│  └── types.ts - TypeScript interfaces                      │
├─────────────────────────────────────────────────────────────┤
│  Backend (Rust)                                             │
│  ├── commands.rs - Tauri IPC commands                      │
│  ├── scanner.rs - Session file scanner (2-layer cache)     │
│  ├── scanner_scheduler.rs - Background scanner (30s)       │
│  ├── sqlite_cache.rs - SQLite storage layer                │
│  ├── search.rs - Full-text search engine                   │
│  └── models.rs - Data models (serde)                       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Session Scanning (2-Layer Cache)
```
Frontend → scan_sessions() → Rust scanner.rs
  ↓
Initialize SQLite cache (if not exists)
  ↓
Split into two layers:
  ├─ Layer 1: Real-time (≤ 2 days)
  │  └─ Direct file system scan
  │     └─ Parse JSONL files
  └─ Layer 2: Historical (> 2 days)
     └─ Query SQLite cache
  ↓
Merge results, sort by modified DESC
  ↓
Return SessionInfo[] to frontend
```

### 1.1 Background Scanner (30s interval)
```
Background Thread (tokio)
  ↓
Scan all JSONL files
  ↓
For each file:
  ├─ Get file modification time (mtime)
  ├─ Query SQLite for cached mtime
  └─ IF file mtime > cached mtime:
     └─ Re-parse and UPDATE SQLite
  ↓
Log statistics: +added, ~updated, ~skipped
```

### 2. Session Viewing

### 2. Session Viewing
```
Frontend → read_session_file(path) → Rust commands.rs
  ↓
Read JSONL file content
  ↓
Frontend generates HTML using Pi template
  ↓
Render in iframe
```

### 3. Search
```
Frontend → search_sessions(sessions, query, includeTools)
  ↓
Rust search.rs
  ↓
Full-text search using regex
  ↓
Return SearchResult[] with matches
```

## Data Models

### SessionInfo (Rust → TypeScript)
```rust
pub struct SessionInfo {
    pub path: String,
    pub id: String,
    pub cwd: String,
    pub name: Option<String>,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    pub message_count: usize,
    pub first_message: String,
    pub all_messages_text: String,
}
```

### SessionEntry
```rust
pub struct SessionEntry {
    pub entry_type: String,
    pub id: String,
    pub parent_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub message: Option<Message>,
}
```

### SearchResult
```rust
pub struct SearchResult {
    pub session_id: String,
    pub session_path: String,
    pub session_name: Option<String>,
    pub first_message: String,
    pub matches: Vec<Match>,
    pub score: f32,
}
```

## Pi Session Format

### File Structure
```
~/.pi/agent/sessions/
├── --Users-dengwenyu-project-a--/
│   └── 2026-01-30T12-00-00-000Z_uuid.jsonl
└── --Users-dengwenyu-project-b--/
    └── 2026-01-30T13-00-00-000Z_uuid.jsonl
```

### JSONL Format
```jsonl
{"type":"session","id":"uuid","timestamp":"2026-01-30T12:00:00Z","cwd":"/path/to/project"}
{"type":"message","id":"msg1","parentId":null,"timestamp":"2026-01-30T12:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"type":"message","id":"msg2","parentId":"msg1","timestamp":"2026-01-30T12:00:02Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]}}
{"type":"session_info","id":"info1","parentId":null,"timestamp":"2026-01-30T12:00:03Z","name":"My Session"}
```

## Tauri Commands

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `scan_sessions` | - | `SessionInfo[]` | Scan all sessions (2-layer cache) |
| `read_session_file` | `path: String` | `String` | Read JSONL file content |
| `get_session_entries` | `path: String` | `SessionEntry[]` | Parse session entries |
| `search_sessions` | `sessions, query, includeTools` | `SearchResult[]` | Full-text search |
| `delete_session` | `path: String` | `()` | Delete a session |
| `export_session` | `path, format` | `String` | Export session (HTML/MD/JSON) |
| `rename_session` | `path, newName` | `()` | Rename a session |
| `get_session_stats` | - | `SessionStats` | Get session statistics |

## Frontend Components

### App.tsx
- Main application container
- Manages state: sessions, selectedSession, searchResults
- Coordinates between sidebar and viewer

### SessionList.tsx
- Displays session list with virtual scrolling
- Shows: name, path, message count, modification time
- Uses `date-fns` for relative time display

### SessionViewer.tsx
- Renders selected session in iframe
- Generates HTML from JSONL using Pi template
- Base64 encodes session data for iframe injection

### SearchPanel.tsx
- Search input with debouncing
- "Include tool calls" checkbox
- Displays result count

## Phase 1 Features (MVP)

- ✅ Session list scanning and display
- ✅ Session detail viewer (embedded Pi HTML template)
- ✅ Basic full-text search (user + AI messages)
- ✅ Dark mode theme

## Phase 2 Features (Planned)

- Advanced search with filters
  - Date range filter
  - Project directory filter
  - Model provider filter
- Tool call filtering in search
- Session export (HTML, JSON, Markdown)
- Statistics dashboard
  - Total sessions
  - Messages per session distribution
  - Most used models
- Session management
  - Delete sessions
  - Merge sessions
  - Rename sessions

## Performance Optimizations

### Backend
- **2-Layer Cache System**:
  - Layer 1 (Real-time, ≤ 2 days): Direct file system scan
  - Layer 2 (Historical, > 2 days): SQLite database
  - Background scanner (30s interval) for incremental updates
- Async file reading with tokio
- Parallel session parsing
- Cached search results

### Frontend
- Virtual scrolling for session list
- Lazy loading of session content
- Debounced search input

## Dependencies

### Rust
- `tauri` - Desktop app framework
- `serde` - Serialization
- `chrono` - Date/time handling
- `regex` - Pattern matching
- `dirs` - Cross-platform paths
- `rusqlite` - SQLite database (bundled)
- `tokio` - Async runtime
- `tracing` - Logging and diagnostics

### TypeScript
- `react` - UI framework
- `@tauri-apps/api` - Tauri APIs
- `date-fns` - Date formatting
- `lucide-react` - Icons

## Development

### Running
```bash
npm run tauri:dev
```

### Building
```bash
npm run tauri:build
```

### Project Structure
```
pi-session-manager/
├── src/              # Frontend
│   ├── components/
│   ├── App.tsx
│   └── types.ts
├── src-tauri/        # Backend
│   ├── src/
│   │   ├── commands.rs
│   │   ├── scanner.rs          # Session scanner (2-layer cache)
│   │   ├── scanner_scheduler.rs # Background scanner (30s interval)
│   │   ├── sqlite_cache.rs     # SQLite storage layer
│   │   ├── search.rs
│   │   ├── models.rs
│   │   ├── export.rs
│   │   ├── stats.rs
│   │   └── main.rs
│   └── Cargo.toml
└── tauri.conf.json
```

## 2-Layer Cache Architecture

### Overview
The session manager uses a 2-layer caching system to optimize performance:
- **Layer 1 (Real-time)**: Direct file system scan for sessions ≤ 2 days old
- **Layer 2 (Historical)**: SQLite database for sessions > 2 days old

### Database Schema

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    cwd TEXT NOT NULL,
    name TEXT,
    created TEXT NOT NULL,      -- ISO 8601 timestamp
    modified TEXT NOT NULL,     -- ISO 8601 timestamp
    file_modified TEXT NOT NULL, -- File system mtime (ISO 8601)
    message_count INTEGER NOT NULL,
    first_message TEXT,
    all_messages_text TEXT,
    cached_at TEXT NOT NULL     -- When this record was cached
);

CREATE INDEX idx_modified ON sessions(modified DESC);
CREATE INDEX idx_cwd ON sessions(cwd);
CREATE INDEX idx_file_modified ON sessions(file_modified);
```

### Cache Update Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    scan_sessions()                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  Calculate     │
                    │  cutoff = now  │
                    │  - 2 days      │
                    └─────────────────┘
                              ↓
              ┌───────────────┴───────────────┐
              ↓                               ↓
    ┌─────────────────┐           ┌─────────────────┐
    │  Real-time      │           │  Historical     │
    │  (≤ cutoff)     │           │  (> cutoff)     │
    └─────────────────┘           └─────────────────┘
              ↓                               ↓
    Scan file system              Query SQLite
    Parse JSONL files             Get sessions
              ↓                               ↓
              └───────────────┬───────────────┘
                              ↓
                    Merge results
                    Sort by modified DESC
                              ↓
                    Return to frontend
```

### Background Scanner (30s Interval)

```
Background Thread (tokio::spawn)
  ↓
Initialize SQLite connection
  ↓
Loop every 30 seconds:
  ↓
  Scan all JSONL files in ~/.pi/agent/sessions/
  ↓
  For each file:
    ├─ Get file mtime
    ├─ Query SQLite: SELECT file_modified FROM sessions WHERE path = ?
    └─ IF file mtime > cached mtime:
       ├─ Parse JSONL file
       └─ UPSERT to SQLite
  ↓
  Log statistics: +N added, ~M updated, K skipped
```

### Incremental Update Logic

```rust
// Pseudocode
for file in all_jsonl_files:
    file_mtime = get_file_mtime(file.path)

    cached_mtime = sqlite.get_cached_mtime(file.path)

    if cached_mtime is None:
        // New file
        session = parse_session(file)
        sqlite.insert(session, file_mtime)
        stats.added += 1
    elif file_mtime > cached_mtime:
        // Modified file
        session = parse_session(file)
        sqlite.update(session, file_mtime)
        stats.updated += 1
    else:
        // Unchanged file
        stats.skipped += 1
```

### Performance Benefits

| Metric | Before (JSON cache) | After (SQLite 2-layer) |
|--------|---------------------|------------------------|
| Startup time | ~2s (full scan) | ~200ms (2-day scan only) |
| Memory usage | ~50MB (all in memory) | ~25MB (historical in SQLite) |
| Incremental update | ~500ms (manual) | ~60ms (auto, 30s interval) |
| Cache size | ~25MB JSON file | ~30MB SQLite file |

### Database Location
- Path: `~/.pi/agent/sessions.db`
- Auto-created on first run
- No manual migration needed

### Deletion Policy
- **No deletion sync**: When a session file is deleted, the SQLite record is preserved
- **Rationale**: Historical data remains available for search and analytics
- **Cleanup**: Manual vacuum operation available if needed

## Future Enhancements

1. **Tantivy Integration**: Replace regex search with full-text search engine
2. **Live Updates**: Watch for new sessions and auto-refresh
3. **Session Comparison**: Compare two sessions side-by-side
4. **Annotations**: Add notes/bookmarks to sessions
5. **Tags**: Tag sessions for organization
6. **Cloud Sync**: Sync sessions across devices
7. **AI-Powered Search**: Semantic search using embeddings