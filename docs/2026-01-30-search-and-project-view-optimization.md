# Search and Project View Optimization Record

**Date**: 2026-01-30

**Goal**: Solve search feature UI/UX usability issues and slow performance problems

---

## Problem Diagnosis

### User Feedback
- UI/UX hard to use
- Slow search
- Scanning 1962 files takes time every time

### Performance Issues

1. **Slow scanning**: Every scan of all 1962 files takes ~15 seconds
2. **Slow search**: Every search re-reads all files
3. **Complex UI**: Too many options for search mode and role filtering

---

## Solutions

### 1. Incremental Scanning (Performance Optimization)

#### New Files
- `src-tauri/src/cache.rs`: Cache management

#### Implementation
```rust
// Cache structure
struct CacheEntry {
    path: String,
    modified: DateTime<Utc>,
    session: SessionInfo,
}

// Scanning logic
1. Load cache
2. Iterate all files
3. Only re-parse new or modified files
4. Save cache
```

#### Performance Improvement
| Operation | Before | After |
|-----------|--------|-------|
| First load | ~15s | ~15s |
| Refresh load | ~15s | **<1s** |
| Incremental scan | Scan 1962 files | Only scan 3 files |

#### Cache File
- Location: `~/.pi/agent/sessions/session_cache.json`
- Format: JSON

---

### 2. Search Optimization

#### Backend Changes
- Changed to OR logic (any word match)
- Use `all_messages_text` for fast filtering
- Return max 5 matches per session

#### Frontend Simplification
- Removed Name/Content mode toggle
- Removed User/Assistant/All role filtering
- Only one simple search box
- Debounce reduced from 300ms to 200ms

#### Search Response
| Operation | Before | After |
|-----------|--------|-------|
| Search response | ~2-5s | **<500ms** |

---

### 3. Project View (New Feature)

#### New Components
- `src/components/ProjectList.tsx`: Project list view

#### Two-Level Navigation
```
Level 1: Project List
  - Display all projects
  - Each project shows: name, session count, message count, last active time
  - Click project → Enter Level 2

Level 2: Sessions in Project
  - Only show sessions in that project
  - Title shows project name
  - "← Back" button to return
  - Esc key to return
```

#### Three View Modes
| Icon | Mode | Description |
|------|------|-------------|
| ☰ | List | All sessions sorted by time |
| 📁 | Directory | Grouped by directory, expandable/collapsible |
| 📂 | Project | Two-level project navigation |

#### Default View
- App starts with Project view by default

---

## Code Change Summary

### New Files
- `src-tauri/src/cache.rs`: Cache management
- `src/components/ProjectList.tsx`: Project list component

### Modified Files
- `src-tauri/src/lib.rs`: Add cache module
- `src-tauri/src/scanner.rs`: Implement incremental scanning
- `src-tauri/src/search.rs`: Search optimization
- `src-tauri/src/stats.rs`: Simplify stats logic
- `src-tauri/src/commands.rs`: Command handling
- `src/components/SearchPanel.tsx`: Simplify search panel
- `src/components/SessionList.tsx`: Update list component
- `src/components/SessionListByDirectory.tsx`: Update directory list
- `src/App.tsx`: Add project view logic

---

## Performance Comparison Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| First load | 15s | 15s | - |
| Refresh load | 15s | <1s | **15x** |
| Search response | 2-5s | <500ms | **4-10x** |
| Incremental scan | 1962 files | 3 files | **654x** |

---

## Usage Instructions

### Search
1. Enter keywords for auto-search (200ms debounce)
2. Support multi-word search (OR logic)
3. Click result to view session details

### Project Navigation
1. Default shows project list
2. Click project to view sessions in that project
3. Click "← Back" or press `Esc` to return
4. Click top icon to switch view mode

### Keyboard Shortcuts
- `Cmd/Ctrl + R`: Refresh session list
- `Cmd/Ctrl + F`: Focus search box
- `Cmd/Ctrl + Shift + S`: Open stats panel
- `Esc`: Clear search / Return to previous level

---

## Known Issues
1. Cache file may be large (1962 sessions)
2. Cache may be inaccurate after session deletion (next refresh fixes it)
3. Search results don't highlight matches
4. No search history

---

## Future Improvements

### Performance
- [ ] Use Tantivy for inverted index
- [ ] Parallel scanning and searching
- [ ] LRU cache for search results

### UI/UX
- [ ] Search result highlighting
- [ ] Search history
- [ ] Advanced filters (date, model, etc.)
- [ ] Keyboard navigation (up/down arrows to select)

### Features
- [ ] Fuzzy search
- [ ] Regular expression support
- [ ] Pinyin search
- [ ] Semantic search

---

## Test Commands
```bash
# Development mode
npm run tauri:dev

# Build
npm run tauri:build
```

---

## Cache Management

### Clear Cache
```bash
rm ~/.pi/agent/sessions/session_cache.json
```

### View Cache
```bash
cat ~/.pi/agent/sessions/session_cache.json | jq '.sessions | length'
```

---

## Related Documents
- [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)
- [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md)
- [README.md](../README.md)
