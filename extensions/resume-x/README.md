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

`ctx.switchSession()` internally calls `teardownCurrent()` → `dispose()` → `invalidate()`, which makes the `ctx` object stale. Any subsequent `ctx.xxx()` call will throw (including `ctx.ui.notify` in error handlers).

**Solution:** ALL modes (list, preview, search) use `doResume()` — a helper defined inside the `ctx.ui.custom()` factory — which calls `switchSessionFn` BEFORE `done()`. This ensures:
1. `switchSessionFn` runs while ctx is still valid (assertActive passes)
2. `done()` runs after switch completes, triggering `restoreEditor()` which re-renders the TUI with the new session
3. Post-factory code never touches `ctx.ui` (it's stale after the switch)

### Shortcut vs Command Context

- `registerCommand` handler receives `ExtensionCommandContext` (has `switchSession`)
- `registerShortcut` handler receives `ExtensionContext` (no `switchSession`)

Alt+X shortcut falls back to `sessionManager.setSessionFile()` which changes the file but may not fully refresh the UI. Use `/resume-x` command for full session switch support.

## Changelog

### 2026-05-09

- **Bug fix (critical, attempt 2):** `doResume()` now mirrors built-in `showSessionSelector` exactly: `done()` first (synchronous, closes UI), then `switchSessionFn()` as fire-and-forget. Previous attempt had switch BEFORE done, which is wrong — `renderCurrentSessionState()` would fire before editor was restored.
- **Root cause confirmed:** Built-in pattern is `done() → handleResumeSession()`. The `done()` closure never touches ctx. `handleResumeSession` uses `this` (interactive mode). Only the post-factory code accessing `ctx.ui.notify()` was dangerous.

### 2026-05-09 (attempt 1)

- **Bug fix (attempt 1, reverted):** Moved switchSessionFn BEFORE done() — wrong order, render fires before UI restored

### 2026-05-08

- **Bug fix:** `ctx.switchSession()` staleness — search/preview modes now switch session before `done()` to keep ctx valid
- **Bug fix:** `runResumeX` param type changed from `ExtensionContext` to `ExtensionCommandContext`
- **Bug fix:** Removed stale `await import` in non-async functions
- **Scroll speed:** `↑/↓` = 3 lines (was 1), `Shift+↑/↓` = half-page (new)
- **Refactor:** Split 1154-line monolith into 6 modules (reduced `index.ts` to ~430 lines)
- **Added:** README, lib/ module structure
