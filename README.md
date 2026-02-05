# Pi Session Manager

Tauri 2 + React desktop app for exploring and auditing Pi Agent sessions without the fluff.

<img width="1800" height="1066" alt="image" src="https://github.com/user-attachments/assets/4cb92d95-f50e-48d2-8c5e-4bb814d45b8f" />
<img width="1800" height="1066" alt="image" src="https://github.com/user-attachments/assets/87630b70-84a1-4417-9b66-b35124ebdcea" />

```
┌─ Pi Session Manager ─┐
│ sessions  search  stats│  Single control panel for ~/.pi/agent/*
└────────────────────────┘
```

## Quick Scan

- Sessions: tree/list/project views, favorites, rename, export to HTML/Markdown/JSON, resume in terminal
- Search: full-text with role/tool filters, live hit counts, plugin-based result cards
- Dashboard: 14 charts for project mix, models, costs, streaks, heatmaps
- Assets: skills/prompt indexer, system prompt editor, model connectivity tester
- i18n: English + Simplified Chinese out of the box, extendable
- Performance: dual-layer cache (FS + SQLite), virtualized UI, parallel parsing

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + R` | Resume selected session in terminal |
| `Cmd/Ctrl + E` | Export session and open in browser |
| `Cmd/Ctrl + P` | Switch to project view |
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + ,` | Open settings panel |
| `Esc` | Close dialogs or clear selection |

### Session Viewer

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + T` | Toggle thinking blocks |
| `Cmd/Ctrl + O` | Toggle tool call expansion |
| `Cmd/Ctrl + F` | Focus sidebar search |

## Architecture Snapshot

```
Frontend (React 18 / TS)      Backend (Rust / Tauri)
───────────────┐             ┌────────────────────
Components     │   invoke    │ Commands (session/search/...)
Hooks + i18n   │────────────▶│ Services (scanner/search/export)
State + Charts │◀────────────│ SQLite cache + FS watcher
───────────────┘   events    └────────────────────
```

### Directory Map

```
src/        UI components, hooks, plugins, i18n, utils
src-tauri/  commands/, services/, sqlite_cache.rs, ws_adapter.rs
```

## Core Feature Matrix

| Module | Highlights |
|--------|------------|
| Sessions | Tree/list/project views, favorites, batch export, resume via shell |
| Search | 300 ms debounce, role/tool filters, snippet highlighting |
| Analytics | Activity heatmap, top projects, model usage, token cost, achievements |
| Skills & Models | Scan ~/.pi/agent/skills & prompts, batch model tests, edit system prompt |
| Settings | JSON config read/write, terminal command overrides, theme/language toggle |

## Data & Flow

```
scan_sessions()
   │ cutoff = now - 2d
   ├─ file system (recent)
   └─ SQLite cache (historical)
        │
        └─ merge + sort → SessionInfo[]

search_sessions()
   │ query debounce 300 ms
   └─ Rust regex on session/message → SearchResult[]
```

## Install & Run

**Prereqs**: Node 18+, Rust 1.70+, Tauri CLI

```bash
npm install
npm run tauri:dev   # dev desktop app
npm run tauri:build # bundles end up in src-tauri/target/release/bundle/
```

Useful scripts: `npm run dev`, `npm run build`, `npm run preview`

Rust workflow: `cd src-tauri && cargo check|build|test`

## Config Cheatsheet

- App settings: `~/.pi/agent/session-manager.json` (theme, language, scanner, terminal)
- Tauri manifest: `src-tauri/tauri.conf.json` (window 1400×900, id `com.pi.session-manager`)

## Known Facts

| Topic | Status |
|-------|--------|
| Icon generation | Needs ImageMagick; disabled in CI |
| Session HTML | Using simplified template; full Pi theme TODO |
| File watcher | Work in progress (currently 30 s scanner) |
| Tantivy search | Placeholder only |

Roadmap (excerpt): Tantivy-based search, batch session ops, tags, live FS watcher, accessibility polish (ARIA/high-contrast).

## Contributing

1. Fork + feature branch
2. Code + `cargo fmt` / `cargo clippy`
3. Run tests (`cargo test`, future frontend tests)
4. Submit PR with Conventional Commit messages

## License & Support

- License: MIT
- Issues / feature ideas: open tickets in this repo
- Changelog: see [CHANGELOG.md](CHANGELOG.md)
- Related project: [badlogic/pi-mono](https://github.com/badlogic/pi-mono/)
