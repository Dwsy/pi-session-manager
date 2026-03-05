<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  Manage <a href="https://github.com/badlogic/pi-mono">Pi</a> coding sessions with a Tauri desktop app, browser-accessible server mode, and a standalone static demo page.
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">Documentation</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">中文文档</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Preview</a>
</p>

## Highlights

- Session browser with list/project/kanban views, favorites, tags, rename, delete, and export.
- Full-text search via SQLite FTS + Tantivy-backed indexing/search flows.
- Built-in terminal (PTY) and one-click resume of Pi sessions.
- Multi-protocol runtime: Tauri IPC, WebSocket, HTTP, SSE.
- Rich **demo data engine** and dedicated static demo page build mode.
- i18n packs: `en-US`, `zh-CN`, `ja-JP`, `de-DE`, `fr-FR`, `es-ES`.

## UI Preview

| Home | Session Page |
| --- | --- |
| ![Home](website/public/screenshots/home.png) | ![Session Page](website/public/screenshots/session-page.png) |
| Session Tree | Kanban |
| ![Session Tree](website/public/screenshots/session-tree.png) | ![Kanban](website/public/screenshots/kanban.png) |

## Runtime Modes

| Mode | Entry | Network behavior |
| --- | --- | --- |
| Desktop GUI | `pi-session-manager` | GUI + backend services; default settings include WS `52130`, HTTP `52131` |
| Headless in main binary | `pi-session-manager --cli` / `--headless` | Single-port HTTP + WS(`/ws`) on `http_port` (default `52131`) |
| Standalone CLI crate | `pi-session-cli` | Single-port HTTP + WS(`/ws`) (default `52131`) |
| Static demo page | `dist-demo/index.html` | No backend required, forced demo data |

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
# or: npm install
```

### Common Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Frontend dev server |
| `npm run dev:demo` | Frontend dev server in demo mode context |
| `npm run build` | Production frontend build to `dist/` |
| `npm run build:demo` | Static demo build to `dist-demo/` (default page is demo mode) |
| `npm run tauri:dev` | Full desktop dev (frontend + Rust) |
| `npm run tauri:build` | Desktop production bundle |
| `npm run build:cli` | Build standalone `pi-session-cli` binary |

## Run Binaries

### Desktop GUI

```bash
./pi-session-manager
```

### Headless service in main binary

```bash
./pi-session-manager --cli
# or
./pi-session-manager --headless

# Override port/bind
./pi-session-manager --cli -p 18080 -b 0.0.0.0
```

CLI flags:

- `-p, --port <PORT>`: shared HTTP+WS port in CLI mode
- `-b, --bind <ADDR>`: bind address
- `--auth` / `--no-auth`: enable/disable auth
- `--token <TOKEN>`: runtime-only token for current process

### Standalone CLI binary

```bash
./pi-session-cli
./pi-session-cli -p 18080 -b 0.0.0.0
```

Default auth behavior:

- Auth is enabled by default.
- Loopback clients are exempt.
- Non-loopback clients must provide a valid token.

## API Surface (Server/CLI)

- `POST /api` command endpoint
- `GET /ws` WebSocket endpoint
- `GET /api/events` and `/v1/events` SSE events
- `GET /health` health check
- `GET /` embedded frontend (server modes)

## Demo Page Mode

### Public preview

- https://dwsy.github.io/pi-session-manager/demo/

### Dev preview

```bash
npm run dev
# open http://localhost:1420/demo.html
```

### Static demo bundle

```bash
npm run build:demo
# output: dist-demo/index.html
```

`dist-demo/index.html` bootstraps app settings with:

- `advanced.demoMode = true`
- `language.locale = en-US`

So it always opens with rich English demo data and does not require backend services.

## Paths and Storage

| Path | Description |
| --- | --- |
| `~/.pi/agent/sessions/` | Session directory |
| `~/.pi/agent/sessions/sessions.db` | SQLite DB (sessions, settings, tags, favorites, auth tokens) |
| `~/.pi/agent/session-manager-config.toml` | Scanner config (`session_paths`, FTS, intervals, etc.) |
| `~/.pi/agent/skills/` | Pi skills |
| `~/.pi/agent/prompts/` | Pi prompts |
| `~/.pi/agent/settings.json` | Pi settings |
| `~/.config/pi-session-manager.json` | Standalone `pi-session-cli` config |

## Development Checks

```bash
cargo fmt --all --check
cd src-tauri && cargo clippy -- -D warnings
cargo clippy -p pi-session-cli -- -D warnings
cd src-tauri && cargo test
```

## License

[MIT](LICENSE)
