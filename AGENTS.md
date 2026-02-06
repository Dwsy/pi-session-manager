# Repository Guidelines

This document gives AI coding assistants the build commands, code style, and development guidelines for this repository.

## Project Structure

```
src/                    # Frontend (React + TypeScript + Vite)
src-tauri/              # Backend (Tauri + Rust)
src-tauri/src/          # Rust sources
src-tauri/tests/        # Rust integration tests
docs/                   # Design docs
scripts/                # Auxiliary scripts
archive/                # Historical archive
```

## Build, Test, and Development Commands

### Frontend (TypeScript/React)

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build production bundle
npm run build

# Preview production build
npm run preview
```

### Backend (Rust)

```bash
# Check code (no compile)
cd src-tauri && cargo check

# Build
npm run tauri:build

# Dev mode (frontend + Rust)
npm run tauri:dev
```

### Test Commands

**Run a single Rust test:**
```bash
cd src-tauri && cargo test test_name_here
```

**Run a specific test file:**
```bash
cd src-tauri && cargo test --test search_test
cd src-tauri && cargo test --test export_test
cd src-tauri && cargo test --test integration_test
```

**Show test output:**
```bash
cd src-tauri && cargo test -- --nocapture
```

**Note: The frontend currently lacks a test framework. If you add tests, prefer Vitest or Jest.**

### Linting and Formatting

**Rust (required):**
```bash
cd src-tauri && cargo fmt --check    # Format check
cd src-tauri && cargo fmt            # Auto format
cd src-tauri && cargo clippy         # Static analysis
```

**Frontend (no ESLint/Prettier config yet; keep style consistent):**
```bash
# Suggested setup when adding linting:
# npm install -D eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

## Code Style Guide

### TypeScript/React Guidelines

**Import order (mandatory):**
```typescript
// 1. React core
import { useState, useEffect, useMemo, useCallback } from 'react'

// 2. Third-party libraries
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'

// 3. Internal components (default imports)
import SessionList from './components/SessionList'

// 4. Custom hooks
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

// 5. Utility functions
import { formatDate } from './utils/date'

// 6. Types (use import type)
import type { SessionInfo, SearchResult } from './types'
```

**Naming rules:**

| Type | Convention | Example |
|------|------|------|
| Component | PascalCase | `SessionList`, `DashboardPanel` |
| Function | camelCase | `handleClick`, `loadSessions` |
| Variable | camelCase | `selectedSession`, `isLoading` |
| Constant | UPPER_SNAKE_CASE | `MAX_ITEMS`, `DEFAULT_TIMEOUT` |
| Interface | PascalCase | `SessionInfo`, `SearchResult` |
| Props | ComponentNameProps | `SessionListProps` |

**Component structure:**
```typescript
// Functional component + hooks, one component per file
function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<string>('')
  
  useEffect(() => {
    // Side effects
  }, [deps])
  
  const handler = useCallback(() => {
    // Event handling
  }, [deps])
  
  return <div>...</div>
}

export default ComponentName
```

**Error handling:**
```typescript
try {
  const result = await invoke<SessionInfo>('scan_sessions')
  setSessions(result)
} catch (error) {
  console.error('Failed to load sessions:', error)
  setError(error instanceof Error ? error.message : 'Unknown error')
}
```

### Rust Guidelines

**Naming rules:**
- Functions: snake_case (`scan_sessions`, `parse_file`)
- Types: PascalCase (`SessionInfo`, `SearchResult`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_RETRIES`)

**Error handling (use `Result<T, String>` everywhere):**
```rust
pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    parse_session(&content)
        .map_err(|e| format!("Parse error: {}", e))
}
```

**Tauri command pattern:**
```rust
/// Doc comments describe the function and parameters
/// `path`: file path
/// Returns: session content
#[tauri::command]
pub async fn read_session_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read: {}", e))
}
```

**Module organization:**
- `lib.rs`: module declarations and Tauri command registration
- `commands.rs`: Tauri IPC commands (thin wrapper)
- Feature modules (`scanner.rs`, `search.rs`, etc.): business logic

## Commit Guidelines

Use Conventional Commits:

```
feat: add session export to markdown
fix: resolve search not returning results
docs: update API documentation
refactor: simplify scanner logic
test: add unit tests for export module
chore: update dependencies
```

## Important Notes

1. **TypeScript strict mode is on**: `strict: true`, no `any`.
2. **Rust error handling**: every public function returns `Result<T, String>`, no panic.
3. **Docs**: Rust public functions require `///` doc comments.
4. **Tests**: when changing Rust code, add or update tests (`src-tauri/tests/`).
5. **Config**: local config lives at `~/.pi/agent/session-manager.json`.

## Tech Stack Reference

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + i18next
- **Backend**: Tauri 2 + Rust + Tokio + SQLite + Regex
- **Build**: Vite (frontend) + Cargo (Rust)

## Dual-Stack Architecture (IPC/WebSocket)

The project supports two runtime modes. Frontend code adapts through a unified transport abstraction:

```
Frontend (React)
    │
    └── src/transport.ts (unified entry)
              │
              ├── TauriTransport (desktop environment)
              │     └── @tauri-apps/api invoke
              │
              └── WebSocketTransport (browser environment)
                    └── ws://localhost:52130
                          │
                          ▼
                    WsAdapter (ws_adapter.rs)
                          │
                          ▼
                    Service Layer (services/)
```

### Frontend Rules (Important)

**Do not call Tauri APIs directly:**

```typescript
// ❌ Wrong — throws in browsers
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// ✅ Correct — use the transport abstraction
import { invoke, listen } from '../transport'
```

**Window operations (desktop only):**

```typescript
// Needs dynamic import; browsers silently ignore
const startDragging = async () => {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  } catch {
    // Ignore when running in browsers
  }
}
```

### Backend Rules (Three-Layer Architecture)

```
Commands (commands/)     ← Tauri wrappers handling State<T>
    │
    ▼
Services (services/)     ← Pure business logic, explicit params
    │
    ▼
Core (pi_rpc, scanner)   ← Low-level implementation
```

**How to add a new command:**

1. **Implement the service layer** (`services/rpc_service.rs`):
```rust
pub async fn my_feature_impl(
    rpc_client: &SharedRPCClient,
    param: String,
) -> Result<MyResult, String> {
    // Business logic
}
```

2. **Wrap it as a Tauri command** (`commands/rpc.rs`):
```rust
#[tauri::command]
pub async fn my_feature(
    rpc_client: State<'_, SharedRPCClient>,
    param: String,
) -> Result<MyResult, String> {
    rpc_service::my_feature_impl(rpc_client.inner(), param).await
}
```

3. **Register the command** (`lib.rs` and `main.rs`)

4. **Route via `WsAdapter`** (`ws_adapter.rs`):
```rust
"my_feature" => {
    let param: String = extract_field(&payload, "param")?;
    rpc_service::my_feature_impl(&self.app_state.rpc_client, param).await
}
```

### Runtime Modes

```bash
# Desktop development
pnpm run tauri:dev

# Web mode test (requires two terminals)
# Terminal 1: pnpm run tauri:dev  (WebSocket service)
# Terminal 2: pnpm run dev        (pure frontend)
# Browser: http://localhost:5173
```

### Key Files

| File | Responsibility |
|------|------|
| `src/transport.ts` | Frontend transport abstraction |
| `src-tauri/src/app_state.rs` | Shared state (RPC client, event broadcast) |
| `src-tauri/src/services/` | Business logic layer |
| `src-tauri/src/ws_adapter.rs` | WebSocket server and command routing |