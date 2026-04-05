# Rust Backend Directory Restructure — Implementation Plan

> **Goal**: Improve maintainability of `src-tauri/src/` (73 files, ~19,698 lines) without changing any public API, behavior, or external interface.

---

## 1. Problem Summary

### 1.1 Root directory bloat

28 top-level `.rs` files + 4 subdirectories = 32 entries. Target: ≤ 15.

### 1.2 Module split anti-pattern

| Module | Split Pattern | Files Involved |
|--------|--------------|----------------|
| `sqlite_cache` | `mod.rs` → `#[path = "sqlite_cache_impl.rs"] mod split_impl` → 15 sub-files in `sqlite_cache/` | 17 files |
| `http_adapter` | `mod.rs` → `#[path = "http_adapter_impl.rs"] mod split_impl` → 6 sub-files in `http_adapter/` | 8 files |

The `#[path]` hack means these modules evolved past single-file size but never got proper directory restructuring.

### 1.3 Scattered domain groups

**Session domain** (6 files scattered across root + commands):
- `scanner.rs` (576), `scanner_scheduler.rs` (162), `session_delete.rs` (106), `session_parser.rs` (157), `write_buffer.rs` (178), `session_intel.rs` (282)

**Search domain** (4 files at root):
- `search.rs` (506), `search_index.rs` (140), `tantivy_search.rs` (15), `embedding_service.rs` (418)

**Server domain** (4 files at root):
- `http_adapter.rs` (4), `http_adapter_impl.rs` (235), `ws_adapter.rs` (575), `api_readonly.rs` (604)

### 1.4 Dispatch monolith

`dispatch.rs` (854 lines) — single `match` with 70+ arms handling every command domain. Mixed GUI/CLI branching via `#[cfg]` scattered throughout.

### 1.5 Commands/ internal coupling

- `commands/models.rs` (model list commands) vs root `models.rs` (data types) — same name, different purpose
- `commands/session_file.rs` imports `super::session::FileStats` — cross-file coupling within commands
- `commands/cache.rs` (18 lines, 1 function) — file too thin to justify itself

---

## 2. Dependency Graph (Current)

```
lib.rs (pub use commands::*)          ← External API surface
  │
  ├── commands/*                      ← Tauri command wrappers (thin)
  │     ├── session_file → session.rs
  │     ├── session_list → scanner, search, sqlite_cache
  │     ├── session_open → export
  │     ├── search → config, sqlite_cache, metrics
  │     ├── model_config → config_versions
  │     ├── pi_settings → config_versions
  │     └── favorites, tags, settings, skills, auth_cmds, cache, terminal
  │
  ├── models.rs                       ← Data types (SessionInfo, etc.)
  ├── dispatch.rs                     ← Protocol-agnostic command routing
  ├── config.rs, settings_store.rs    ← Configuration
  ├── auth.rs, compression.rs, metrics.rs  ← Infrastructure
  │
  ├── scanner.rs ──────────┐
  ├── scanner_scheduler.rs │
  ├── session_parser.rs    │  Session domain
  ├── session_delete.rs    │
  ├── session_intel.rs     │
  ├── write_buffer.rs ─────┘
  │
  ├── search.rs ───────────┐
  ├── search_index.rs      │  Search domain
  ├── tantivy_search.rs    │
  ├── embedding_service.rs ┘
  │
  ├── sqlite_cache.rs ──┐
  ├── sqlite_cache_impl │  Data layer
  ├── sqlite_cache/     │  (15 sub-files)
  └── stats.rs ─────────┘
  │
  ├── http_adapter.rs ──┐
  ├── http_adapter_impl │  Server layer
  ├── http_adapter/     │
  ├── ws_adapter.rs     │
  └── api_readonly.rs   ┘
  │
  ├── export.rs, subagent.rs  ← Standalone business modules
  ├── terminal.rs, file_watcher.rs, app_state.rs, pi_agent_registry.rs  ← GUI-only
```

**No circular dependencies detected.** The graph is a clean DAG, which means restructuring is safe.

---

## 3. Target Structure

```
src-tauri/src/
├── lib.rs                          # Module declarations + pub use re-exports
├── main.rs                         # GUI entry (#[cfg(feature = "gui")])
├── main-cli.rs                     # CLI entry
│
├── types/                          # WAS: root models.rs
│   ├── mod.rs                      # SessionInfo, SessionEntry, SearchResult, etc.
│   └── stats.rs                    # SubagentRunInfo, AgentStats, SubagentSummary
│                                   # (moved from stats.rs imports)
│
├── core/                           # Session lifecycle domain
│   ├── mod.rs
│   ├── scanner.rs                  # scanner.rs + scanner_scheduler.rs merged
│   ├── parser.rs                   # session_parser.rs
│   ├── delete.rs                   # session_delete.rs
│   ├── intel.rs                    # session_intel.rs
│   └── write_buffer.rs             # write_buffer.rs
│
├── data/                           # Persistence layer
│   ├── mod.rs
│   ├── sqlite/                     # WAS: sqlite_cache/ + sqlite_cache_impl.rs
│   │   ├── mod.rs                  # WAS: sqlite_cache.rs + sqlite_cache_impl.rs
│   │   ├── bootstrap.rs
│   │   ├── deps.rs
│   │   ├── schema.rs
│   │   ├── migrations.rs
│   │   ├── sessions.rs
│   │   ├── details_cache.rs
│   │   ├── message_index.rs
│   │   ├── subagent_meta.rs
│   │   ├── favorites.rs
│   │   ├── tags.rs
│   │   ├── legacy_fts.rs
│   │   ├── maintenance.rs
│   │   ├── types.rs
│   │   └── util.rs
│   └── search/                     # WAS: search.rs + search_index.rs + tantivy_search.rs + embedding_service.rs
│       ├── mod.rs
│       ├── search.rs               # Client-side search (search_sessions, scoring)
│       ├── index.rs                # SearchSegment, extract_message_contents
│       ├── tantivy.rs              # Tantivy search integration
│       └── embedding.rs            # Embedding service
│
├── server/                         # Network layer
│   ├── mod.rs
│   ├── http.rs                     # WAS: http_adapter.rs + http_adapter_impl.rs + http_adapter/*
│   │   ├── mod.rs
│   │   ├── common.rs
│   │   ├── readonly_routes.rs
│   │   ├── realtime.rs
│   │   ├── sessions.rs
│   │   ├── static_assets.rs
│   │   └── embedding.rs
│   ├── ws.rs                       # ws_adapter.rs
│   ├── dispatch.rs                 # dispatch.rs (split by domain in Phase 5)
│   └── readonly.rs                 # api_readonly.rs
│
├── commands/                       # Tauri command wrappers (KEEP, reorganize internally)
│   ├── mod.rs
│   ├── session.rs                  # Merge: session.rs + session_file.rs + session_list.rs + session_open.rs
│   ├── settings.rs                 # settings.rs + pi_settings.rs
│   ├── models.rs                   # Model list commands (no rename — distinct from types/)
│   ├── model_config.rs             # Model config management
│   ├── config_bundle.rs            # Config bundle import/export
│   ├── config_versions.rs          # Config versioning
│   ├── skills.rs                   # Skills + pi_resources.rs
│   ├── favorites.rs
│   ├── tags.rs
│   ├── terminal.rs                 # #[cfg(feature = "gui")]
│   ├── pi_live.rs                  # #[cfg(feature = "gui")]
│   ├── auth.rs                     # auth_cmds.rs → auth.rs
│   └── cache.rs                    # (DELETE — merge 1 function into settings.rs or data/)
│
├── config.rs                       # KEEP at root (single responsibility)
├── settings_store.rs               # KEEP at root
├── auth.rs                         # KEEP at root
├── compression.rs                  # KEEP at root
├── metrics.rs                      # KEEP at root
├── export.rs                       # KEEP at root (standalone, called from commands)
├── stats.rs                        # MOVE to core/ in Phase 4
├── subagent.rs                     # KEEP at root (standalone)
├── terminal.rs                     # KEEP at root (#[cfg(feature = "gui")])
├── file_watcher.rs                 # KEEP at root (#[cfg(feature = "gui")])
├── app_state.rs                    # KEEP at root (#[cfg(feature = "gui")])
└── pi_agent_registry.rs            # KEEP at root (#[cfg(feature = "gui")])
```

**Root file count after restructure**: 14 files + 5 directories = 19 entries.
Target met: 14 root `.rs` files ≤ 15.

---

## 4. Implementation Phases

### Phase 1: Fix split-module anti-patterns (P0, zero-risk)

**1a. Merge `sqlite_cache_impl.rs` into `sqlite_cache/`**

- Delete `sqlite_cache.rs` (currently 4 lines: `#[path]` + `mod split_impl` + `pub use`)
- Delete `sqlite_cache_impl.rs`
- Create `sqlite_cache/mod.rs` with the content of `sqlite_cache_impl.rs` + `mod` declarations for existing sub-files
- Update `lib.rs`: remove `pub mod sqlite_cache;` → keep as `pub mod sqlite_cache;` (directory now, no change)
- **No external import changes needed** — `crate::sqlite_cache::xxx` still works

**1b. Merge `http_adapter_impl.rs` into `http_adapter/`**

- Delete `http_adapter.rs` (4 lines: `#[path]` hack)
- Delete `http_adapter_impl.rs`
- Create `http_adapter/mod.rs` with content from `http_adapter_impl.rs` + existing sub-module declarations
- Update `lib.rs`: same pattern — no external impact
- **Update `http_adapter/mod.rs`**: convert `#[path = "http_adapter/common.rs"]` to regular `mod common;`

**1c. Verify**: `cargo clippy && cargo test` — must pass with zero changes.

---

### Phase 2: Consolidate search domain

**2a. Create `data/search/` directory**

Move and rename:
- `search.rs` → `data/search/search.rs`
- `search_index.rs` → `data/search/index.rs`
- `tantivy_search.rs` → `data/search/tantivy.rs`
- `embedding_service.rs` → `data/search/embedding.rs`

**2b. Create `data/search/mod.rs`**

```rust
pub mod search;
pub mod index;
pub mod tantivy;
pub mod embedding;

pub use search::*;
pub use index::*;
pub use tantivy::*;
pub use embedding::*;
```

**2c. Create `data/mod.rs`**

```rust
pub mod sqlite;
pub mod search;
```

**2d. Create `data/sqlite/mod.rs`**

Convert `sqlite_cache/` to `data/sqlite/`:
- Move `sqlite_cache/*` → `data/sqlite/*`
- Convert `sqlite_cache.rs` re-export → `data/sqlite/mod.rs`
- Keep all `pub use` to maintain `crate::data::sqlite::xxx` compatibility

**2e. Update all cross-references**

| Old import | New import |
|------------|-----------|
| `crate::search` | `crate::data::search::search` (or `crate::data::search`) |
| `crate::search_index` | `crate::data::search::index` |
| `crate::tantivy_search` | `crate::data::search::tantivy` |
| `crate::embedding_service` | `crate::data::search::embedding` |
| `crate::sqlite_cache` | `crate::data::sqlite` |

Files to update: `scanner.rs`, `session_delete.rs`, `stats.rs`, `subagent.rs`, `commands/search.rs`, `commands/session_list.rs`, `commands/session_file.rs`, `commands/cache.rs`, `commands/favorites.rs`, `commands/tags.rs`, `dispatch.rs`, `ws_adapter.rs`, `http_adapter/` sub-files, `main.rs`, `lib.rs`

**2f. Maintain backward compatibility in `lib.rs`**

```rust
// Re-export for backward compat
pub use data::sqlite as sqlite_cache;
pub use data::search::search as search;
pub use data::search::index as search_index;
pub use data::search::tantivy as tantivy_search;
pub use data::search::embedding as embedding_service;
```

This ensures `main.rs` and `src-tauri-cli` don't need changes.

**2g. Verify**: `cargo clippy && cargo test`

---

### Phase 3: Consolidate session domain into `core/`

**3a. Create `core/` directory**

Move:
- `scanner.rs` + `scanner_scheduler.rs` → `core/scanner.rs` (merge)
- `session_parser.rs` → `core/parser.rs`
- `session_delete.rs` → `core/delete.rs`
- `session_intel.rs` → `core/intel.rs`
- `write_buffer.rs` → `core/write_buffer.rs`

**3b. Create `core/mod.rs`**

```rust
pub mod scanner;
pub mod parser;
pub mod delete;
pub mod intel;
pub mod write_buffer;

pub use scanner::*;
pub use parser::*;
pub use delete::*;
pub use intel::*;
pub use write_buffer::*;
```

**3c. Update cross-references**

| Old import | New import |
|------------|-----------|
| `crate::scanner` | `crate::core::scanner` |
| `crate::scanner_scheduler` | `crate::core::scanner` (merged) |
| `crate::session_parser` | `crate::core::parser` |
| `crate::session_delete` | `crate::core::delete` |
| `crate::session_intel` | `crate::core::intel` |
| `crate::write_buffer` | `crate::core::write_buffer` |

**3d. Backward compat in `lib.rs`**

```rust
pub use core::scanner as scanner;
pub use core::parser as session_parser;
pub use core::delete as session_delete;
pub use core::intel as session_intel;
pub use core::write_buffer as write_buffer;
// scanner_scheduler is merged, add alias
pub mod scanner_scheduler {
    pub use crate::core::scanner::ScannerScheduler;
}
```

**3e. Verify**: `cargo clippy && cargo test`

---

### Phase 4: Consolidate server domain into `server/`

**4a. Create `server/` directory**

Move:
- `http_adapter.rs` + `http_adapter_impl.rs` + `http_adapter/*` → `server/http.rs` + `server/http/*`
- `ws_adapter.rs` → `server/ws.rs`
- `api_readonly.rs` → `server/readonly.rs`
- `dispatch.rs` → `server/dispatch.rs`

**4b. Create `server/mod.rs`**

```rust
pub mod http;
pub mod ws;
pub mod dispatch;
pub mod readonly;

pub use http::*;
pub use ws::*;
pub use dispatch::*;
pub use readonly::*;
```

**4c. Update cross-references**

| Old import | New import |
|------------|-----------|
| `crate::http_adapter` | `crate::server::http` |
| `crate::ws_adapter` | `crate::server::ws` |
| `crate::api_readonly` | `crate::server::readonly` |
| `crate::dispatch` | `crate::server::dispatch` |

**4d. Backward compat in `lib.rs`**

```rust
pub use server::http as http_adapter;
pub use server::ws as ws_adapter;
pub use server::dispatch as dispatch;
pub use server::readonly as api_readonly;
```

**4e. Verify**: `cargo clippy && cargo test`

---

### Phase 5: Clean up commands/ and lib.rs

**5a. Merge thin command files**

- `commands/cache.rs` (18 lines) → merge into `commands/settings.rs`
- `commands/session_file.rs` → merge into `commands/session.rs` (already shares types)
- `commands/session_list.rs` → merge into `commands/session.rs`
- `commands/session_open.rs` → merge into `commands/session.rs`
- `commands/pi_settings.rs` → merge into `commands/settings.rs`
- `commands/pi_resources.rs` → merge into `commands/skills.rs`
- `commands/auth_cmds.rs` → rename to `commands/auth.rs`

**5b. Rename root `models.rs` → `types/mod.rs`**

- Move `models.rs` content to `types/mod.rs`
- Move `stats.rs` type exports to `types/stats.rs` (or keep inline)
- Keep `stats.rs` at root as business logic module

**5c. Update `lib.rs` module declarations**

Remove old module declarations, add new ones, maintain backward-compat re-exports:

```rust
// New structure
pub mod types;
pub mod core;
pub mod data;
pub mod server;
pub mod commands;

// Infrastructure (stay at root)
pub mod config;
pub mod settings_store;
pub mod auth;
pub mod compression;
pub mod metrics;
pub mod export;
pub mod stats;
pub mod subagent;

// GUI-only
#[cfg(feature = "gui")]
pub mod terminal;
#[cfg(feature = "gui")]
pub mod file_watcher;
#[cfg(feature = "gui")]
pub mod app_state;
#[cfg(feature = "gui")]
pub mod pi_agent_registry;

// Backward-compat re-exports (for main.rs and external consumers)
pub use types::*;
pub use commands::*;
pub use core::scanner as scanner;
pub use core::parser as session_parser;
pub use core::delete as session_delete;
pub use core::intel as session_intel;
pub use core::write_buffer as write_buffer;
pub use data::sqlite as sqlite_cache;
pub use server::http as http_adapter;
pub use server::ws as ws_adapter;
pub use server::dispatch as dispatch;
pub use server::readonly as api_readonly;
// ... etc
```

**5d. Verify**: `cargo clippy && cargo test && cargo build`

---

### Phase 6: (Optional) Split dispatch.rs by domain

**Only if dispatch.rs > 600 lines remains a maintenance pain after above phases.**

Split into per-domain dispatch functions:
- `server/dispatch/session.rs`
- `server/dispatch/search.rs`
- `server/dispatch/settings.rs`
- `server/dispatch/tags.rs`
- `server/dispatch/models.rs`
- `server/dispatch/pi_live.rs`
- `server/dispatch/auth.rs`

Top-level `dispatch()` delegates to domain-specific dispatch. Each domain match ≤ 100 lines.

---

## 5. Risk Assessment

| Phase | Risk Level | Rollback Strategy | Est. Effort |
|-------|-----------|-------------------|-------------|
| 1. Fix split modules | Low | `git checkout -- src-tauri/src/` | 15 min |
| 2. Consolidate search | Medium | Same + update imports | 30 min |
| 3. Consolidate core | Medium | Same + update imports | 30 min |
| 4. Consolidate server | Medium | Same + update imports | 30 min |
| 5. Clean up commands | Low | Same | 20 min |
| 6. Split dispatch | Medium | Same | 45 min |

**Key safety property**: Each phase maintains full backward compatibility via `lib.rs` re-exports. `main.rs`, `src-tauri-cli`, tests, and external consumers see no change.

---

## 6. Acceptance Criteria

1. `cargo clippy -p pi-session-manager -- -D warnings` — zero warnings
2. `cargo test` — all existing tests pass (no new tests, no deleted tests)
3. `cargo build` (gui feature) — compiles without errors
4. `cargo clippy -p pi-session-cli -- -D warnings` — CLI crate compiles clean
5. Root directory has ≤ 15 `.rs` files (excluding `main.rs`, `main-cli.rs`, `lib.rs`)
6. No `#[path = "..."]` hacks remain
7. All `pub use` re-exports in `lib.rs` match pre-restructure public API
8. No circular dependencies introduced

---

## 7. File Move Summary

| Phase | Move | Rename | New Files | Delete |
|-------|------|--------|-----------|--------|
| 1 | sqlite_cache_impl.rs → sqlite_cache/mod.rs | — | 1 mod.rs | 2 files |
| 1 | http_adapter_impl.rs → http_adapter/mod.rs | — | 1 mod.rs | 2 files |
| 2 | search.rs, search_index.rs, tantivy_search.rs, embedding_service.rs → data/search/ | tantivy_search→tantivy, embedding_service→embedding | 2 mod.rs | 4 root files |
| 2 | sqlite_cache/ → data/sqlite/ | — | 1 mod.rs | sqlite_cache.rs |
| 3 | scanner.rs+scanner_scheduler.rs → core/scanner.rs | — | 1 mod.rs | 2 root files |
| 3 | session_parser.rs → core/parser.rs | session_parser→parser | — | 1 root file |
| 3 | session_delete.rs → core/delete.rs | session_delete→delete | — | 1 root file |
| 3 | session_intel.rs → core/intel.rs | session_intel→intel | — | 1 root file |
| 3 | write_buffer.rs → core/write_buffer.rs | — | — | 1 root file |
| 4 | http_adapter/* → server/http/ | http_adapter_impl→http/mod | 2 mod.rs | 3 root files |
| 4 | ws_adapter.rs → server/ws.rs | — | — | 1 root file |
| 4 | api_readonly.rs → server/readonly.rs | — | — | 1 root file |
| 4 | dispatch.rs → server/dispatch.rs | — | — | 1 root file |
| 5 | models.rs → types/mod.rs | — | 1 mod.rs | 1 root file |
| 5 | commands/*.rs merges | auth_cmds→auth | — | 3 thin files |

**Net effect**: 73 files → ~58 files. Root `.rs` files: 28 → 14.
