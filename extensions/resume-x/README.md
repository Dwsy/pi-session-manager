# resume-x

Enhanced resume command using PSM SQLite — fast, no disk scan.

## Features

- **SQLite fast path** — reads from `~/.pi/agent/sessions/sessions.db` (no disk scan)
- **cwd filtering** — shows current project sessions first
- **Detail pane** — model, tokens, cost per session (monkey-patches SessionList.render)
- **Message preview** — press `→` to browse full conversation history, `←` to return
- **Full-text search** — `⌥Q` to search sessions, messages, tags
- **Fast scrolling** — `↑/↓` = 3 lines, `Shift+↑/↓` = half-page, `PgUp/PgDn` = full-page

## Usage

```bash
# In pi TUI:
/resume-x          # Command
Alt+X              # Shortcut (limited: no switchSession, falls back to setSessionFile)
```

### Navigation

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate sessions (main list) |
| `Enter` | Resume selected session |
| `→` | Enter preview mode (browse messages) |
| `←` | Exit preview mode |
| `⌥Q` | Enter search mode |
| `Tab` | Toggle CWD/Global scope (search mode) |
| `Esc` | Cancel / back to list |

### Scrolling (Preview Mode)

| Key | Action |
|-----|--------|
| `↑/↓` | Scroll 3 lines |
| `Shift+↑/↓` | Scroll half-page (9 lines) |
| `PgUp/PgDn` | Scroll full-page (18 lines) |

## Architecture

```
index.ts          (~430 lines) — Extension entry + UI orchestration
lib/
├── types.ts      (77 lines)   — All interfaces + scroll config
├── db.ts         (168 lines)  — SQLite connection + queries
├── search.ts     (312 lines)  — Full-text search + Kanban data + search UI
├── render.ts     (215 lines)  — Preview/detail panes + monkey-patch
└── utils.ts      (115 lines)  — Formatters + scroll helpers + theme accessor
```

## Dependencies

- `@earendil-works/pi-coding-agent` — ExtensionContext, ExtensionCommandContext, SessionSelectorComponent
- `@earendil-works/pi-tui` — visibleWidth, matchesKey, getKeybindings
- `better-sqlite3` — SQLite access

## Data Source

Reads from PSM's SQLite database:
```
~/.pi/agent/sessions/sessions.db
```

Tables used:
- `sessions` — session metadata
- `session_details_cache` — token/cost aggregates
- `message_entries` — message content

## Key Implementation Details

### ctx.switchSession Staleness

`ctx.switchSession()` internally calls `teardownCurrent()` → `dispose()` → `invalidate()`, which makes the `ctx` object stale. Any subsequent `ctx.xxx()` call will throw.

**Solution:** For search/preview modes, call `switchSessionFn` BEFORE `done()` (while ctx is still valid). For the main selector, the switch happens after `done()` resolves (via post-factory path).

### Shortcut vs Command Context

- `registerCommand` handler receives `ExtensionCommandContext` (has `switchSession`)
- `registerShortcut` handler receives `ExtensionContext` (no `switchSession`)

Alt+X shortcut falls back to `sessionManager.setSessionFile()` which doesn't refresh the UI.

## Changelog

### 2026-05-08

- **Bug fix:** `ctx.switchSession()` staleness — search/preview modes now switch session before `done()` to keep ctx valid
- **Bug fix:** `runResumeX` param type changed from `ExtensionContext` to `ExtensionCommandContext`
- **Bug fix:** Removed stale `await import` in non-async functions
- **Scroll speed:** `↑/↓` = 3 lines (was 1), `Shift+↑/↓` = half-page (new)
- **Refactor:** Split 1154-line monolith into 6 modules (reduced `index.ts` to ~430 lines)
- **Added:** README, lib/ module structure
