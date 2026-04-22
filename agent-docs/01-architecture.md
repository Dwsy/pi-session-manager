# Architecture

## Four-Layer Architecture

```
Commands (thin) ← Tauri IPC / HTTP / WS
Domain (business) ← model_config, session_list, stats, terminal
Data ← search (SQLite FTS5 normalized index) sqlite (cache)
Server (protocol) ← HTTP adapter, WebSocket adapter
```

## Command Routing

```
HTTP /api POST → handle_command → dispatch → commands → domain → data
WS /ws → handle_connection → ws_dispatch → dispatch → commands → domain → data
Tauri invoke() → #[tauri::command] (direct, no dispatch)
```

## Protocol Entry Points

### Tauri IPC (GUI mode only)

```rust
// commands/session.rs
#[tauri::command]
pub async fn my_command(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<MyResponse, String> {
    // Direct call, bypasses dispatch()
}
```

### HTTP Adapter

```rust
// server/http/mod.rs
async fn handle_command(req: Json<HttpRequest>) -> Response {
    dispatch(&app_state, &req.command, &req.payload).await
}
```

### WebSocket Adapter

```rust
// server/ws.rs
async fn handle_message(&self, msg: WsRequest) -> WsResponse {
    dispatch(&app_state, &msg.command, &msg.payload).await
}
```

## Key Insight: Single Dispatch Point

**All HTTP and WS requests converge at `dispatch()`**:

```rust
// dispatch.rs
pub async fn dispatch(
    app_state: &Option<SharedAppState>,
    command: &str,
    payload: &Value,
) -> Result<Value, String> {
    match command {
        "scan_sessions" => { /* ... */ }
        "my_new_command" => my_new_command_handler(app_state, payload).await
        // ...
    }
}
```

**Adding a command once in `dispatch.rs` makes it available via both HTTP and WS.**

## Module Aliases (lib.rs)

```rust
pub use core::scanner;
pub use data::search::client as search;
pub use data::sqlite as sqlite_cache;
#[cfg(feature = "gui")]
pub use server::http as http_adapter;
```

## Session Data Flow

1. `core/scanner.rs` — Scan JSONL, maintain SCAN_CACHE
2. `file_watcher.rs` — Watch changes, broadcast sessions-changed
3. `core/write_buffer.rs` — Write buffer
4. `data/sqlite/` — Tables/indexes/migration (VERSION=3)

## Live Session (Pi CLI)

- Backend: `pi_agent_registry.rs` — In-memory cache
- Frontend: `useSessionViewerData` — Prefer Registry
- Sidebar: `usePaginatedSessions` — Real-time merge

## Port

GUI/CLI: `52131` (HTTP + WS `/ws`), default `127.0.0.1`
