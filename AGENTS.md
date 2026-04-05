# Pi Session Manager — Agent Work Guide

This document is intended for **AI coding agents** to quickly and accurately understand this repository's actual structure, build workflow, runtime architecture, and development conventions.

> Note: This file is organized based on the current repository code and configuration (not just the README). If the documentation conflicts with the code, follow the implementation.

---

## 1. Project Overview

Pi Session Manager is a session management tool built with **Tauri 2 + Rust + React/TypeScript**, designed to manage Pi sessions (JSONL) under `~/.pi/agent/sessions/`.

Core capabilities include:
- Session scanning, paginated listing, filtering, renaming, deletion, and export
- Full-text search (SQLite FTS + Tantivy-related implementations)
- Tags, favorites, and statistics dashboard
- Built-in terminal (PTY)
- Multi-protocol access: Tauri IPC / WebSocket / HTTP
- Can run in both GUI mode and headless service mode

The repository also contains a documentation site (`website/`, Next.js + Fumadocs).

---

## 2. Repository Structure (by Responsibility)

```text
.
├── src/                    # Frontend React + TypeScript (Vite)
│   ├── components/         # UI components (including app/, settings/, kanban/, dashboard/, etc.)
│   ├── hooks/              # Business hooks (sessions, settings, search, terminal, UI state)
│   ├── contexts/           # Transport/Settings/SessionView contexts
│   ├── plugins/            # Search plugin system
│   ├── i18n/               # Localization resources (en-US, zh-CN, ja-JP, de-DE, fr-FR, es-ES)
│   ├── transport.ts        # Unified IPC/WS/HTTP transport layer (auto-selected at runtime)
│   └── App.tsx             # Main application container
│
├── src-tauri/              # Main backend crate (package name: pi-session-manager)
│   ├── src/main.rs         # GUI entry point; also supports --cli/--headless args
│   ├── src/lib.rs          # Module exports and command registration
│   ├── src/dispatch.rs     # Protocol-agnostic command dispatch (core business routing)
│   ├── src/http_adapter.rs # HTTP API + /ws + SSE + static asset serving
│   ├── src/ws_adapter.rs   # Standalone WebSocket server (legacy, now uses HTTP /ws path)
│   ├── src/commands/       # Thin Tauri command layer (session/search/settings/tags/...)
│   ├── src/scanner.rs      # Session scanning, snapshot cache, incremental rescans
│   ├── src/sqlite_cache.rs # SQLite initialization, migrations, indexes, cached read/write
│   ├── src/file_watcher.rs # File change watcher; emits sessions-changed events
│   ├── src/terminal.rs     # PTY terminal session management
│   └── tests/              # Rust integration tests
│
├── src-tauri-cli/          # Standalone CLI crate (package name: pi-session-cli)
│   └── src/main.rs         # Single-port HTTP+WS+static frontend service (/api, /ws, /health)
│
├── website/                # Documentation site (Next.js + Fumadocs)
├── scripts/                # Build and manual testing scripts
├── .github/workflows/      # CI / Release / Website deployment
└── docs/                   # Design and historical implementation docs (partially outdated)
```

---

## 3. Key Configuration Files

### Root Directory
- `package.json`: Frontend and Tauri script entry points (`dev/build/tauri:*`)
- `Cargo.toml` (workspace): Members are `src-tauri` and `src-tauri-cli`
- `tsconfig.json`: TypeScript strict mode (`strict: true`), excluding test files
- `vite.config.ts`: Vite + PWA + dev proxy + chunk splitting
- `tailwind.config.js`: Theme color system based on CSS variables
- `postcss.config.js`: PostCSS configuration
- `pnpm-lock.yaml` + `package-lock.json`: Both pnpm and npm lockfiles are present

### Main Tauri Backend (`src-tauri/`)
- `Cargo.toml`: Main Rust dependencies, features (`gui`/`cli`), and bin definitions
- `tauri.conf.json`: Tauri build, packaging, dist directory, window and security options
- `capabilities/default.json`: Tauri capability declarations
- `build.rs`: Runs `tauri_build::build()` only when `gui` feature is enabled

### Standalone CLI (`src-tauri-cli/`)
- `Cargo.toml`: Depends on `pi-session-manager` (`default-features = false, features = ["cli"]`)

### CI/CD
- `.github/workflows/ci.yml`: Cross-platform checks (tsc/build/fmt/clippy/test)
- `.github/workflows/release.yml`: Tag-triggered desktop package + CLI artifact release
- `.github/workflows/website.yml`: Docs site build and GitHub Pages deployment

### Container
- `Dockerfile.cli`: Build workflow for a musl static binary image of `pi-session-cli`

---

## 4. Tech Stack

### Frontend
- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS
- i18next
- Main UI/interaction libraries: `cmdk`, `@dnd-kit/*`, `@xyflow/react`, `recharts`, `@xterm/xterm`

### Backend
- Rust (edition 2021)
- Tauri 2
- Tokio
- Axum
- rusqlite (bundled SQLite)
- Tantivy
- notify / notify-debouncer
- portable-pty

### Protocol Layer
- Tauri IPC
- WebSocket (standalone ws adapter + HTTP `/ws`)
- HTTP API (`/api` + `/v1/*`)
- SSE (`/api/events`, `/v1/events`)

---

## 5. Build, Run, and Release Workflow

## 5.1 Local Development

### Frontend-only Development
```bash
npm install
npm run dev
```

### Tauri GUI Integration (Frontend + Backend)
```bash
npm run tauri:dev
```

### Production Build
```bash
npm run build
npm run tauri:build
```

### CLI Build
```bash
npm run build:cli
# Actually runs scripts/build-cli.mjs: frontend build first, then cargo build -p pi-session-cli
```

> Note: The repository contains both npm and pnpm scripts; CI uses pnpm (`pnpm install --frozen-lockfile`).

## 5.2 Rust Checks and Tests

```bash
cargo fmt --all --check
cd src-tauri && cargo clippy -- -D warnings
cargo clippy -p pi-session-cli -- -D warnings
cd src-tauri && cargo test
```

## 5.3 Release (GitHub Actions)

- Push tag `v*` to trigger `release.yml`
- Artifacts:
  - Desktop installers (built via Tauri action)
  - CLI binaries + sha256
- The workflow finally generates release notes automatically and publishes the release

### 5.3.1 Version Synchronization Rules (Must Follow)

- The current version source for frontend injection is `package.json` only (`vite.config.ts` injects `__APP_VERSION__` via `npm_package_version`).
- Before release, ensure the following files all have the same version:
  - `package.json`
  - `package-lock.json` (root `version` and `packages[""].version`, if using npm)
  - `src-tauri/Cargo.toml`
  - `src-tauri-cli/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- `git tag` must match the versions above (recommended: `vX.Y.Z`).
- Use `node scripts/release-version.mjs check` to verify sync, and `node scripts/release-version.mjs sync <version>` to normalize all release metadata.
- Release reminder for agents/LLMs: **sync and update all versions above before pushing a new tag; do not change versions after pushing the tag**, otherwise update prompts may show inconsistent versions.

## 5.4 Docs Site Deployment

- `website.yml` is triggered when `website/**` changes
- Next.js build output is deployed to GitHub Pages

---

## 6. Runtime Architecture (Important)

## 6.1 Frontend Transport Auto-selection

Selection logic in `src/transport.ts`:
1. If `window.__TAURI__` is detected → use **TauriTransport** (IPC)
2. Otherwise, choose by config/environment:
   - `HttpTransport` (mobile or forced http)
   - `WebSocketTransport` (default browser remote mode)

Supports configuring `wsUrl/httpBaseUrl/token/transport` via query/localStorage/env.

## 6.2 Backend Command Routing

Core idea: **protocol adapters + shared business dispatch**
- Shared business logic: `src-tauri/src/dispatch.rs`
- GUI-specific command overrides: `src-tauri/src/ws_adapter.rs::dispatch(...)`
- HTTP `/api` and WS requests ultimately enter the same command semantics

## 6.3 Session Data Flow

- `scanner.rs`: Scans JSONL and maintains in-memory snapshot cache (`SCAN_CACHE`)
- `file_watcher.rs`: Watches session directory changes, triggers incremental rescans, and broadcasts `sessions-changed`
- `write_buffer.rs` + timed flush: Reduces database write pressure
- `sqlite_cache.rs`:
  - Table creation, indexing, schema migration (current `LATEST_SCHEMA_VERSION = 3`)
  - Corruption recovery (backup then rebuild)

## 6.5 Pi CLI Live Session (Mirror Sync)

To handle high-frequency event streams from Pi CLI without message loss or duplication:
- **Backend Registry (`pi_agent_registry.rs`)**: Maintains an in-memory `entries` cache for each live session. Bridges sync full history on registration.
- **Frontend Mirror Sync (`useSessionViewerData.ts`)**: 
  - Prioritizes Registry cache over disk-scan when `isLive` is true.
  - Uses `lastResponseIdRef` to track active messages and prevent ID collision/deletion.
  - Merges `message_update` and `turn_end` content to preserve Thinking blocks.
- **Sidebar Integration (`usePaginatedSessions.ts`)**: Merges live registry sessions into the paginated list instantly.

## 6.4 Network Service Ports (Code Defaults)

### GUI Main Program (`src-tauri/src/main.rs` + settings)
- **Unified single-port**: HTTP + WS(`/ws`) on `52131`
- Default `bind_addr`: `127.0.0.1`

### Standalone CLI Crate (`src-tauri-cli/src/main.rs`)
- Single-port service (default `52131`)
- Same port serves `/api`, `/ws`, and static frontend

---

## 7. Configuration and Data Paths (Per Code)

## 7.1 Sessions and Database
- Session directory: `~/.pi/agent/sessions/`
- SQLite DB: `~/.pi/agent/sessions/sessions.db`
  - Both `sqlite_cache.rs` and `auth.rs` point to this path

## 7.2 Scan Configuration
- File: `~/.pi/agent/session-manager-config.toml`
- Source: `src-tauri/src/config.rs`
- Key fields:
  - `realtime_cutoff_days`
  - `scan_interval_seconds`
  - `enable_fts5`
  - `preload_count`
  - `auto_cleanup_days`
  - `session_paths`
  - `metrics_enabled`
  - `metrics_port`

## 7.3 App Settings
- Stored in SQLite `settings` table (`settings_store.rs`)
- Compatible migration source: `$XDG_CONFIG_HOME/pi-session-manager/settings.json` (legacy path)

## 7.4 CLI Configuration (Standalone CLI)
- File: `dirs::config_dir()/pi-session-manager.json`
- Example fields: `http_port`, `bind_addr`, `auth_enabled`

## 7.5 Pi Ecosystem Related Paths
- `~/.pi/agent/skills/`
- `~/.pi/agent/prompts/`
- `~/.pi/agent/settings.json`

> Note: Historical paths like `session-manager.db` may appear in the README; current implementation uses `sessions/sessions.db`.

---

## 8. Code Organization and Module Boundaries

### Frontend Layers
- `components/`: UI components (including large feature subdirectories)
- `hooks/`: Business state and side-effect encapsulation
- `contexts/`: Cross-component state injection (Transport/Settings/SessionView)
- `plugins/`: Search plugin mechanism
- `utils/`: Pure utility functions
- `transport.ts`: Protocol abstraction layer (critical infrastructure)
- Settings model management entry now uses `src/components/settings/sections/ModelConfigCenter.tsx` (wired via `ModelSettings.tsx`) and includes:
  - Visual provider/model editing for `~/.pi/agent/models.json`
  - Import/export (file and raw JSON content)
  - Backup listing/restore/delete for `~/.pi/agent/backups/models/*.json`
  - Version restore using SQLite `config_versions`
  - Online HTTP model test with generated masked cURL

### Backend Layers
- `commands/*`: Command layer (parameter and return-value boundaries)
- `dispatch.rs`: Common command dispatch (protocol-agnostic)
- Business modules: `scanner`, `search`, `export`, `stats`, `session_parser`...
- Infrastructure: `sqlite_cache`, `file_watcher`, `terminal`, `http_adapter`, `ws_adapter`
- Model config commands in `src-tauri/src/commands/skills.rs` now include:
  - `load_model_config` / `save_model_config`
  - `import_model_config_content` / `import_model_config_from_path`
  - `export_model_config_content` / `export_model_config_to_path`
  - `create_model_config_backup` / `list_model_config_backups` / `restore_model_config_backup` / `delete_model_config_backup`
  - `list_model_config_versions`
  - `test_model_http`
- Pi Agent commands in `src-tauri/src/commands/pi_live.rs`:
  - `get_pi_live_sessions`: List active registry sessions.
  - `get_pi_agent_entries`: Fetch cached history for a live session.
  - `send_pi_agent_rpc`: Send prompt/command to Pi CLI.

---

## 9. Testing Strategy (Current State)

## 9.1 Rust Tests Are Primary
`src-tauri/tests/` contains many integration tests, for example:
- `search_test.rs`
- `full_text_search_integration_test.rs`
- `export_test.rs`
- `migration_test.rs`
- `write_buffer_eviction_test.rs`
- `subagent_cost_test.rs`

CI runs `cd src-tauri && cargo test`.

## 9.2 Frontend Test Status
- Vitest-style test files exist (e.g., `src/components/__tests__/FullTextSearch.test.tsx`)
- But root `package.json` does not declare vitest/testing-library dependencies, and there is no `npm test` script
- `tsconfig.json` explicitly excludes `*.test.*` and `__tests__`

Conclusion: Frontend automated testing is currently not a stable CI path; Rust tests + manual validation are primary.

## 9.3 Manual Test Scripts
`scripts/` includes multiple scenario scripts (export/search/sidebar/toolcall, etc.), mostly for development assistance and regression verification.

---

## 10. Development Conventions (Based on Existing Standards and Style)

## 10.1 TypeScript / React
- `strict: true`; avoid `any`
- Function components + hooks are preferred
- Separate types from runtime logic; `import type` is common
- Transport calls should consistently go through `transport.ts` (instead of scattered direct calls)

## 10.2 Rust
- Public-facing capabilities typically return `Result<T, String>`
- Keep command layer thin; sink business logic into functional modules
- Naming follows snake_case / PascalCase / SCREAMING_SNAKE_CASE

## 10.3 Commit Convention
- Use Conventional Commits (CI/docs are aligned with this convention)

## 10.4 Comment Language
- The codebase already has historical mixed Chinese/English comments.
- For new code, **English comments** are recommended to keep cross-language maintainability.

---

## 11. Security Notes (Must Understand)

1. **Authentication behavior depends on bind address and configuration**
   - Authentication is only enforced for non-loopback IPs (`auth::is_auth_required`)
   - If the service binds to `0.0.0.0`, make sure token strategy is properly configured

2. **HTTP CORS is currently permissive**
   - API returns `access-control-allow-origin: *`

3. **`/metrics` exposes metrics**
   - `http_adapter` exposes `/metrics` directly without extra auth logic

4. **Tauri CSP is null**
   - In `tauri.conf.json`: `app.security.csp = null`

5. **File system access scope is broad**
   - Features involve reading `~/.pi/agent/*` directories, session files, and config files

6. **Compression and remote parameter support**
   - Supports gzip (including `PSM_FORCE_GZIP=1`) and query-parameter controls; keep link behavior consistent during debugging

---

## 12. Known Gaps and Maintenance Suggestions

The following documentation/implementation mismatches are currently visible in the repository. Decide case-by-case which source to follow before changing behavior:

- Some configuration path descriptions in README do not match the code (historical DB path changes)
- README describes fewer i18n languages than actually present
- There are two CLI entry implementations in the repo (`src-tauri/src/main-cli.rs` and `src-tauri-cli/src/main.rs`); the current release flow primarily uses the `src-tauri-cli` crate
- Frontend test files exist but do not yet form a complete runnable test pipeline

Suggestion: When you change related behavior, update `README*`, `docs/`, and this file together.

---

## 13. Agent Practical Recommendations (Minimal Changes First)

- First identify which layer the change belongs to: frontend UI, command layer, core business, protocol adapter, or data storage
- Prefer minimally invasive changes in the corresponding layer; avoid cross-layer rewrites
- For Rust logic changes, prefer adding/updating tests in `src-tauri/tests`
- For protocol or path changes, check these linked parts:
  - `transport.ts`
  - `http_adapter.rs` / `ws_adapter.rs` / `dispatch.rs`
  - `README.md` / `README.zh.md` / `AGENTS.md`
