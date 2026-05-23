# Pi Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>



<p align="center">
  Manage <a href="https://github.com/badlogic/pi-mono">Pi</a> coding sessions with a Tauri desktop app, browser-accessible server mode, and a standalone static demo page.
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">Documentation</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">zh</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Demo</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/dataset/">Dataset</a> ·
  <a href="#extension-system">Extensions</a>
</p>

## UI Preview

| Home | Session Page |
|------|-------------|
| ![Home](website/public/screenshots/home.png) | ![Session Page](website/public/screenshots/session-page.png) |

| Session Tree | Kanban |
|-------------|--------|
| ![Session Tree](website/public/screenshots/session-tree.png) | ![Kanban](website/public/screenshots/kanban.png) |


## Highlights

- Session browser with list/project/kanban views, favorites, tags, rename, delete, and export.
- Full-text search via SQLite FTS5 with normalized indexing/search flows, including tree node label search and node content vs. label source filtering.
- In-session message search with inline highlights, current-match navigation, and keyboard-friendly close/reset behavior. `Cmd/Ctrl + F` behavior is configurable (search vs. sidebar toggle).
- Built-in terminal (PTY) and one-click resume of Pi sessions.
- **External Sessions** — scan and browse sessions from other coding agents (Claude, OpenCode, etc.) with unified settings UI for scan control and default resume targets.
- **Dataset Browser** — download and explore session datasets from HuggingFace with local caching, search, tags, favorites, and statistics.
- Multi-protocol runtime: Tauri IPC, WebSocket, HTTP, SSE.
- Rich **demo data engine** and dedicated static demo page build mode.
- i18n packs: `en-US`, `zh-CN`, `ja-JP`, `de-DE`, `fr-FR`, `es-ES`.
- Pi Live integration with real-time session sync and model control.
- Analytics dashboard with activity heatmap, token trends, and subagent cost stats.

## Architecture

```
Frontend: React + TypeScript + Vite
Backend: Rust + Tauri 2 + Axum + SQLite + FTS5

Protocols: Tauri IPC | WebSocket (/ws) | HTTP (/api) | SSE
```

### Four-Layer Design

```
Commands (thin) <- Tauri IPC / HTTP / WS
Domain (business) <- model_config, session_list, stats, terminal
Data <- search (SQLite FTS5 normalized index) sqlite (cache)
Server (protocol) <- HTTP adapter, WebSocket adapter
```

## Quick Start

### Prerequisites

- Node.js 20+
- Rust stable (via `rustup`)
- Platform toolchains for Tauri (Xcode / WebView2 / WebKitGTK)

### Install

```bash
git clone https://github.com/Dwsy/pi-session-manager.git
cd pi-session-manager
pnpm install
```

## Runtime Modes

| Mode | Entry | Network behavior |
|------|-------|------------------|
| Desktop GUI | `pi-session-manager` | GUI + backend services; unified single-port HTTP + WS(`/ws`) on `http_port` (default `52131`) |
| Headless in main binary | `pi-session-manager --cli` / `--headless` | Single-port HTTP + WS(`/ws`) on `http_port` (default `52131`) |
| Standalone CLI crate | `pi-session-cli` | Single-port HTTP + WS(`/ws`) (default `52131`) |
| Static demo page | `dist-demo/index.html` | No backend required, forced demo data |
| Static dataset page | `dist-dataset/index.html` | No backend required, browser dataset mode |

### CLI Flags

- `-p, --port <PORT>`: shared HTTP+WS port in CLI mode
- `-b, --bind <ADDR>`: bind address
- `--auth` / `--no-auth`: enable/disable auth
- `--token <TOKEN>`: runtime-only token for current process

## API Surface

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api` | POST | Command endpoint |
| `/ws` | GET | WebSocket |
| `/api/events` | GET | SSE events |
| `/health` | GET | Health check |
| `/` | GET | Embedded frontend |

## Paths & Storage

> `~/.pi/...` in docs means "the current user's home directory + .pi". On macOS/Linux/Windows the actual absolute path is resolved from the user's home directory at runtime.

| Path | Description |
|------|-------------|
| `~/.pi/agent/sessions/` | Session directory |
| `~/.pi/agent/sessions/sessions.db` | SQLite DB for sessions only, not runtime config |
| `~/.pi/pi-session-manager/config.json` | Unified external config (server/session/app/ui) |
| `~/.pi/pi-session-manager/tags_config.json` | Tag definitions |
| `~/.pi/pi-session-manager/session_mark.json` | Session-tag assignments |
| `~/.pi/pi-session-manager/favorites.json` | Favorites |
| `~/.pi/pi-session-manager/auth_tokens.json` | Auth tokens |
| `~/.pi/pi-session-manager/history/config-versions/` | Config history snapshots (JSON files) |
| `~/.pi/pi-session-manager/backups/` | Import/export backups |
| `~/.pi/agent/models.json` | Pi model config |
| `~/.pi/agent/settings.json` | Pi settings |

## Extension System

Pi extensions live in `extensions/` and follow the [pi-package](https://github.com/mariozechner/pi-coding-agent) spec. Install to `~/.pi/agent/extensions/` for auto-loading.

| Extension | Purpose | Dependency |
|-----------|---------|------------|
| [pi-session-bridge](#pi-session-bridge) | Live sync, search, tags, context recall | better-sqlite3 |
| [resume-x](#resume-x) | Enhanced session resume via SQLite | better-sqlite3 |
| [rename-nag](#rename-nag) | Smart session naming reminder | — |

bridge and resume-x share `~/.pi/agent/sessions/sessions.db`. rename-nag uses Pi API only.

### pi-session-bridge

Bridge Pi agent sessions to PSM.

**Repository**: [Dwsy/psm-bridge](https://github.com/Dwsy/psm-bridge)

```bash
pi install Dwsy/psm-bridge
```

| Tool | Description |
|------|-------------|
| `session_search` | Full-text search across indexed sessions |
| `session_recall` | Search + retrieve surrounding dialogue context |
| `session_context` | Fetch messages from a specific session |
| `session_tag` | List/set/remove session tags |

| Command | Description |
|---------|-------------|
| `/psm-live on/off` | Toggle real-time sync |
| `/psm-connect` / `/psm-disconnect` | Manual connection control |
| `/state` `/state-set` `/state-list` `/state-clear` | Tag management |
| `/flow <action>` | Quick transitions (todo → wip → done) |
| `/open-in-psm` | Open current session in PSM desktop app |

Status indicators: `[psm]` connected, `[retry N]` reconnecting, `[timeout]` disconnected, `[psm: off]` live mode disabled.

### resume-x

Enhanced session resume — SQLite fast path, no disk scan.

**Location**: `extensions/resume-x/`

Add to `~/.pi/agent/settings.json` → `extensions` array:
```json
{
  "extensions": [
    "~/Dev/AI/pi-session-manager/extensions/resume-x/index.ts"
  ]
}
```

```
/resume-x    # or press ⌥X
```

| Feature | Description |
|---------|-------------|
| SQLite fast path | Reads from `sessions.db`, no filesystem scan |
| CWD filter | Shows current project sessions first |
| Detail pane | Model, tokens, cost, kanban tags |
| Message preview | Browse full conversation before resuming |
| Full-text search | `⌥Q` — search names, messages, tags |

**Keybindings**:

| Key | List Mode | Preview Mode | Search Mode |
|-----|-----------|--------------|-------------|
| `⌥X` | Toggle open/close | — | — |
| `⌥Q` | Search | — | — |
| `→` | Enter preview | — | — |
| `←` / `Esc` | — | Back to list | Back to list |
| `↑` / `↓` | Navigate | Scroll 1 line | Navigate |
| `⇧↑` / `⇧↓` | — | Page up/down | — |
| `⏎` | Resume | Resume | Open selected |
| `Tab` | — | — | Toggle CWD/global |

### rename-nag

Smart session naming reminder — nudges agent to name sessions.

**Location**: `extensions/rename-nag/`

```json
{
  "extensions": [
    "~/Dev/AI/pi-session-manager/extensions/rename-nag/index.ts"
  ]
}
```

| Tool | Description |
|------|-------------|
| `session_rename` | Rename the current session |

Triggers:
- **First**: tool calls > 6 + unnamed → full reminder with naming suggestions
- **Follow-up**: every 40 tool calls (40, 80, 120...) + named → check if topic shifted

"Unnamed" = NULL or matches `YYYY-MM-DDTHH-MM-SS` timestamp format.

### Tool Render Plugins

```
src/plugins/tools-render/
├── builtins/    # bash, edit, read, write, generic
└── extensions/  # subagent, ...
```

### Search Plugins

```
src/plugins/
├── message/     # In-message search
├── project/     # Project search
└── session/     # Session search
```

## Keyboard Shortcuts

### Session View

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + C` | Copy resume command to clipboard |
| `Cmd/Ctrl + F` | Search in session (or toggle sidebar, configurable) |
| `Cmd/Ctrl + Shift + F` | Toggle sidebar (or open search, configurable) |
| `Cmd/Ctrl + T` | Toggle thinking display |
| `Cmd/Ctrl + O` | Toggle tools expanded |
| `Cmd/Ctrl + G` | Next search match (in search mode) |
| `Cmd/Ctrl + Shift + G` | Previous search match (in search mode) |
| `Cmd/Ctrl + R` | Resume session |
| `Cmd/Ctrl + E` | Export session |
| `Esc` | Close search |

## Development

### Development Checks

```bash
cargo fmt --all --check
cd src-tauri && cargo clippy -- -D warnings
cargo clippy -p pi-session-cli -- -D warnings
cd src-tauri && cargo test
```

### Adding a New Command

1. **Business logic** -> `src-tauri/src/domain/`
2. **Command layer** -> `src-tauri/src/commands/`
3. **Route registration** -> `src-tauri/src/dispatch.rs`
4. **Tauri registration** -> `src-tauri/src/lib.rs`

See [agent-docs/03-backend.md](agent-docs/03-backend.md) for detailed tutorial.

## Documentation

| Document | Description |
|----------|-------------|
| [AGENTS.md](AGENTS.md) | Agent development guide |
| [agent-docs/01-architecture.md](agent-docs/01-architecture.md) | Four-layer architecture |
| [agent-docs/02-frontend.md](agent-docs/02-frontend.md) | Frontend component index |
| [agent-docs/03-backend.md](agent-docs/03-backend.md) | Backend modules + command tutorial |
| [agent-docs/04-development.md](agent-docs/04-development.md) | Build & release |
| [agent-docs/05-config.md](agent-docs/05-config.md) | Config & security |
| [docs/PSM_PLUGIN_SDK.md](docs/PSM_PLUGIN_SDK.md) | Public PSM browser-plugin SDK contract |
| [docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md](docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md) | SDK capability exposure and contract reuse audit |
| [extensions/README.md](extensions/README.md) | PSM built-in plugins and Pi Agent extension overview |
| [DESIGN.md](DESIGN.md) | Design system (colors, typography, motion) |

## License

MIT

## macOS Installation Note

If macOS shows "App is damaged and can't be opened", run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Pi Session Manager.app"
```

This is a standard Gatekeeper behavior for non-App-Store apps. No certificate is required for personal use.
