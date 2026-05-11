# Backend

## Directory Structure

```
src-tauri/src/
  lib.rs, main.rs, main-cli.rs, dispatch.rs
  commands/    # Tauri commands (thin layer)
  domain/       # Business logic
  core/        # Core utilities
  data/        # Data access
  server/      # Protocol adapters
  infrastructure: app_state, auth, compression, config, export,
                  metrics, settings_store, stats, subagent,
                  pi_agent_registry, file_watcher, terminal
```

## Commands

`session.rs` (CRUD) | `session_file.rs` (read) | `session_list.rs` (list) | `session_open.rs` (open) | `search.rs` | `settings.rs` | `tags.rs` | `favorites.rs` | `terminal.rs` | `skills.rs` | `models.rs` | `model_config.rs` | `pi_live.rs` | `auth.rs` | `config_versions.rs` | `config_bundle.rs` | `datasets.rs` | `trace.rs` | `workspaces.rs`

## Domain

| Module | Description |
|--------|-------------|
| `model_config/` | reader, writer, backup, http_tester |
| `session_list/` | filtering, pagination, sorting |
| `stats/` | aggregator, day_stats, heatmap |
| `terminal/` | api, launch, utils |
| `trace/` | trace analytics extraction |
| `workspaces/` | workspace management |
| `session_bridge/` | session bridge integration |
| `casr_min/` | minimal CASR integration |
| Root | datasets, pi_session, delete, intel, parser, scanner, write_buffer |

## Core

`delete.rs` | `intel.rs` | `io_trace.rs` | `parser.rs` | `scanner.rs` | `write_buffer.rs`

## Data

| Module | Description |
|--------|-------------|
| `search/` | client, embedding, index, tantivy |
| `sqlite/` | bootstrap, sessions, tags, favorites, migrations, schema, maintenance |

## Server

| Module | Description |
|--------|-------------|
| `http/` | common, embedding, readonly_routes, realtime (SSE), sessions, static_assets |
| `ws.rs` | WebSocket |

## Feature Gates

- GUI: `cargo run` — Tauri IPC, file watcher, terminal, Pi registry
- CLI: `cargo run -p pi-session-cli` — HTTP/WS only

---

## How to Add a New Command

### Step 1: Choose the Right Location

| Command Type | Location |
|-------------|----------|
| Session operations | `commands/session.rs` |
| File reading | `commands/session_file.rs` |
| List/filter/paginate | `commands/session_list.rs` |
| Tags | `commands/tags.rs` |
| Settings | `commands/settings.rs` |
| Terminal (GUI only) | `commands/terminal.rs` |
| New feature area | Create new file in `commands/` |

### Step 2: Implement the Command

```rust
// commands/my_feature.rs

use crate::app_state::SharedAppState;
use crate::domain::my_feature::do_the_thing; // business logic in domain/

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn my_new_command(
    state: tauri::State<'_, AppState>,
    id: String,
    data: Option<String>,
) -> Result<MyResponse, String> {
    do_the_thing(&state, &id, data.as_deref()).await
}
```

### Step 3: Register in dispatch.rs

**This makes the command available via HTTP and WS:**

```rust
// dispatch.rs — inside dispatch_impl()
"my_new_command" => {
    // For simple commands that don't need app_state:
    my_new_command(payload).await
    // Or if app_state is needed:
    // my_new_command(app_state, payload).await
}
```

### Step 4: Export from commands/mod.rs

```rust
// commands/mod.rs
pub mod my_feature;
pub use my_feature::*;
```

### Step 5: Register Tauri Command (GUI only)

```rust
// lib.rs
tauri::generate_handler![
    // ... existing commands ...
    my_new_command,
]
```

### Step 6: Frontend Type (optional)

```typescript
// src/types/index.ts
export interface MyResponse {
  success: boolean
  data: string
}

// src/transport.ts or src/utils/settingsApi.ts
export async function myNewCommand(id: string, data?: string) {
  return invoke<MyResponse>('my_new_command', { id, data })
}
```

## Command Response Format

```rust
// Success
Ok(serde_json::to_value(result).unwrap())

// Error
Err("Descriptive error message".to_string())
```

## Best Practices

1. **Thin commands**: Only validate params and call domain logic
2. **Domain-first**: Put business logic in `domain/`, not `commands/`
3. **Payload helpers**: Use `extract_string()`, `extract_optional_string()`, `extract_usize()` from `utils/payload.rs`
4. **Feature gates**: Use `#[cfg(feature = "gui")]` for GUI-only commands
5. **Error handling**: Return `Result<T, String>` with descriptive errors
