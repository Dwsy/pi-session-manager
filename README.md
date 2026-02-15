<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager">
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  Cross-platform desktop, mobile, and web app for browsing, searching, and managing
  <a href="https://github.com/badlogic/pi-mono">Pi</a> AI coding sessions.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20iOS%20%7C%20Android-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Tauri-2.x-orange?style=flat-square" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square" alt="React 18">
  <img src="https://img.shields.io/badge/Rust-stable-orange?style=flat-square" alt="Rust">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="https://dwsy.github.io/pi-session-manager/">📖 Documentation</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">中文文档</a> ·
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">⬇️ Download</a>
</p>

<p align="center">
  <img width="1800" alt="screenshot-dark" src="https://github.com/user-attachments/assets/4cb92d95-f50e-48d2-8c5e-4bb814d45b8f" />
</p>
<p align="center">
  <img width="1800" alt="screenshot-light" src="https://github.com/user-attachments/assets/87630b70-84a1-4417-9b66-b35124ebdcea" />
</p>

---

## Features

- **Multi-Platform Support** — Native desktop (macOS/Windows/Linux), responsive mobile web, and headless server mode
- **Session Browser** — List / project / directory / kanban views, favorites, rename, batch export
- **Kanban Board** — Drag-and-drop sessions across tag columns, context menu, project filtering
- **Hierarchical Tags** — Parent-child tag tree with auto-rules and reordering
- **Full-Text Search** — SQLite FTS5 + Tantivy, role / tool filters, snippet highlighting, plugin system
- **Session Viewer** — Tree view with collapsible tool calls / thinking blocks, flow visualization (React Flow)
- **Built-in Terminal** — Integrated xterm.js terminal with PTY backend (`Cmd/Ctrl+J`)
- **Export** — HTML / Markdown / JSON, one-click open in browser
- **Dashboard** — Activity heatmap, project mix, model usage, token costs, achievements
- **Skills & Prompts** — Scan and manage `~/.pi/agent/skills` and prompts, system prompt editor
- **Model Tester** — Batch connectivity test for configured models
- **Multi-Path Scanning** — Configure multiple session directories
- **Web Access** — Embedded frontend served via HTTP, accessible from any browser or mobile device
- **Theme** — Dark / Light / System, fully themeable via CSS custom properties
- **i18n** — English and 简体中文
- **Multi-Protocol API** — Tauri IPC + WebSocket (`ws://:52130`) + HTTP (`http://:52131`)
- **CLI Mode** — Headless backend service via `--cli` / `--headless`
- **Mobile Optimized** — Touch-friendly UI with bottom navigation on phones

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Clients                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Desktop    │  │    Mobile    │  │      Web Browser         │  │
│  │  (Tauri App) │  │  (PWA/Web)   │  │  (Chrome/Safari/Firefox) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │                 │                       │
          └─────────────────┼───────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                    Frontend (React 18 / TypeScript / Vite)          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  99+ Components · 19 Hooks · Plugin System · i18n · xterm.js │   │
│  │  React Flow · Recharts · dnd-kit · cmdk · Virtual Scroll    │   │
│  └─────────────────────────────────────────────────────────────┘   │
├───────────────────────────┬───────────────────┬─────────────────────┤
│       Tauri IPC           │    WebSocket      │  HTTP + Embedded UI │
│       (Desktop)           │   ws://:52130     │  http://:52131      │
└───────────────────────────┴───────────────────┴─────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                    Rust Backend (Tauri 2)                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Scanner · SQLite Cache · FTS5 · Tantivy · File Watcher     │   │
│  │  PTY Terminal · Auth · Export · Config · Stats · Tags       │   │
│  │  WebSocket/HTTP Adapters · Incremental Updates              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

All three protocols share a single command router — `dispatch()`. Adding a new command only requires one `match` arm in Rust; WS and HTTP inherit it automatically.

The HTTP server embeds the frontend via `rust-embed`, so the packaged binary serves the full UI at `http://localhost:52131` — no external `dist/` directory needed. The frontend auto-detects the runtime environment and switches between:
- **Tauri IPC** — When running as desktop app (window.__TAURI__ available)
- **WebSocket/HTTP** — When running in browser or mobile

---

## Download

Grab the latest build from [**Releases**](../../releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Pi.Session.Manager_*_aarch64.dmg` |
| macOS (Intel) | `Pi.Session.Manager_*_x64.dmg` |
| Windows (x64) | `Pi.Session.Manager_*_x64-setup.exe` / `.msi` |
| Linux (deb) | `pi-session-manager_*_amd64.deb` |
| Linux (AppImage) | `pi-session-manager_*_amd64.AppImage` |
| Linux (rpm) | `pi-session-manager_*_x86_64.rpm` |

### Prerequisites

[Pi](https://github.com/badlogic/pi-mono) must be installed for session resume and terminal integration.

---

## Build from Source

### Requirements

- **Node.js** >= 20
- **Rust** stable (via [rustup](https://rustup.rs/))
- Platform dependencies:

<details>
<summary><b>macOS</b></summary>

```bash
xcode-select --install
```
</details>

<details>
<summary><b>Ubuntu / Debian</b></summary>

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```
</details>

<details>
<summary><b>Fedora</b></summary>

```bash
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf
```
</details>

<details>
<summary><b>Windows</b></summary>

- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — C++ desktop workload
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11)
</details>

### Steps

```bash
git clone https://github.com/anthropics/pi-session-manager.git
cd pi-session-manager

npm install              # Install frontend deps
npm run tauri:dev        # Development (hot-reload)
npm run tauri:build      # Production build
```

Build artifacts land in `src-tauri/target/release/bundle/`.

---

## Usage

### Desktop (GUI Mode)

Default mode with full native integration:

```bash
./pi-session-manager
```

### Server (CLI / Headless Mode)

Run as a backend service exposing WebSocket + HTTP APIs, accessible from any device on the network:

```bash
./pi-session-manager --cli
# or
./pi-session-manager --headless
```

Then open `http://localhost:52131` in any browser, or connect mobile apps.

### Web / Mobile Access

Open `http://localhost:52131` in any browser while the app is running (GUI or CLI mode). The frontend:
- Auto-detects mobile devices and shows touch-optimized UI
- Uses bottom navigation bar on phones
- Supports responsive layouts for tablets
- Works as PWA (add to home screen)

### API Examples

```bash
# HTTP
curl -s -X POST http://127.0.0.1:52131/api \
  -H "Content-Type: application/json" \
  -d '{"command":"scan_sessions","payload":{}}' | jq

# WebSocket
wscat -c ws://127.0.0.1:52130
> {"command":"scan_sessions","payload":{}}
```

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Command palette / global search |
| `Cmd/Ctrl + J` | Toggle terminal panel |
| `Cmd/Ctrl + P` | Switch to project view |
| `Cmd/Ctrl + R` | Resume session in terminal |
| `Cmd/Ctrl + E` | Export & open in browser |
| `Cmd/Ctrl + ,` | Settings |
| `Esc` | Close dialog / clear selection |

### Session Viewer

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + F` | Sidebar search |
| `Cmd/Ctrl + T` | Toggle thinking blocks |
| `Cmd/Ctrl + O` | Toggle tool call expansion |

---

## Project Structure

```
src/                        # Frontend (React + TypeScript)
  components/               #   UI components (99+ files)
    kanban/                 #   Kanban board (drag-drop, context menu)
    dashboard/              #   Analytics charts (11 components)
    settings/sections/      #   Settings panels (10+ sections)
    command/                #   Command palette (cmdk-based)
  hooks/                    #   React hooks (19)
  plugins/                  #   Search plugin system (session, message, project)
  contexts/                 #   React contexts (Transport, Settings, SessionView)
  i18n/                     #   Internationalization (en-US, zh-CN)
  transport.ts              #   Multi-protocol transport layer
  utils/                    #   Utilities

src-tauri/                  # Backend (Rust + Tauri 2)
  src/
    main.rs                 #   Entry: CLI args, window, adapter startup
    main-cli.rs             #   CLI-only entry point
    lib.rs                  #   Module declarations, command registration
    ws_adapter.rs           #   WebSocket server + dispatch() router
    http_adapter.rs         #   HTTP server, embedded frontend (rust-embed)
    app_state.rs            #   SharedAppState (Arc)
    scanner.rs              #   Session file scanner (multi-path, incremental)
    scanner_scheduler.rs    #   Background scan scheduling
    terminal.rs             #   PTY session manager (portable-pty)
    sqlite_cache.rs         #   Dual-layer cache (FS + SQLite)
    tantivy_search.rs       #   Full-text search index
    file_watcher.rs         #   FS watcher for incremental updates
    write_buffer.rs         #   Async write batching
    commands/               #   Tauri IPC command handlers (12 modules, ~2160 LOC)
      session.rs            #   Session operations
      tags.rs               #   Tag management
      skills.rs             #   Skills & prompts scanning
      settings.rs           #   Settings persistence
      terminal.rs           #   Terminal commands
      search.rs             #   Search commands
      cache.rs              #   Cache management
      favorites.rs          #   Favorites system
      models.rs             #   Model testing
      auth_cmds.rs          #   Authentication
  tests/                    #   Integration tests
```

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, i18next, xterm.js, cmdk, Recharts, React Flow, dnd-kit, @tanstack/react-virtual |
| **Backend** | Tauri 2, Rust, Tokio, Axum, SQLite (rusqlite), Tantivy, portable-pty, rust-embed, notify |
| **Communication** | Tauri IPC, WebSocket (tokio-tungstenite), HTTP (Axum) |
| **Build** | Cargo, PNPM, GitHub Actions |

---

## Configuration

| Path | Description |
|------|-------------|
| `~/.pi/agent/sessions/` | Default Pi session directory |
| `~/.pi/agent/session-manager.db` | SQLite cache, settings, tags, favorites |
| `~/.pi/agent/session-manager-config.toml` | Scanner config (cutoff days, FTS5, paths, etc.) |
| `~/.pi/agent/skills/` | Pi skills directory |
| `~/.pi/agent/prompts/` | Pi prompts directory |
| `~/.pi/agent/settings.json` | Pi agent settings |

### Config File Example

```toml
# ~/.pi/agent/session-manager-config.toml
realtime_cutoff_days = 2      # Days to keep in memory
scan_interval_seconds = 30    # Background scan interval
enable_fts5 = true            # Enable full-text search
preload_count = 20            # Preload recent sessions
auto_cleanup_days = 90        # Auto cleanup old sessions (optional)
session_paths = []            # Additional session directories
```

---

## Contributing

1. Fork & create a feature branch
2. `cd src-tauri && cargo fmt && cargo clippy`
3. Run tests: `cd src-tauri && cargo test`
4. Submit PR with [Conventional Commits](https://www.conventionalcommits.org/)

---

## License

[MIT](LICENSE)
