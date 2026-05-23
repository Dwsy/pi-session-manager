# AI TS Plugin Platform Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build Pi Session Manager into an AI-extensible platform where Rust provides stable kernel capabilities and AI-authored TypeScript PSM plugins extend metadata, search, workflow, and UI contributions through generic plugin records, using pi-style authoring patterns where useful.

**Architecture:** Rust remains the authority for sessions, SQLite, FTS, permissions, model calls, event routing, and capability governance. Plugin-owned data is stored as typed generic records (`plugin_records`) with JSON payloads and declared searchable/indexed projections, not as one table per plugin feature. PSM owns the plugin contract; its TypeScript authoring style should borrow pi's extension flavor (factory function, registered tools/commands/events, lightweight capability object) instead of inventing a heavy custom host. The existing `domain/session_summary` code becomes a first-party PSM plugin contract path, not a one-off feature island.

**Tech Stack:** Rust 2021, Tauri 2, Axum/WS, SQLite/FTS5, React 18, TypeScript 5, Vite, Vitest, cargo tests, PSM TypeScript plugin SDK with pi-flavored authoring conventions.

---

## Current Facts To Preserve

- Existing Rust command routing lives in `src-tauri/src/dispatch.rs` and is already available through HTTP/WS.
- Existing search storage uses `message_entries` plus `message_fts` in `src-tauri/src/data/sqlite/message_index.rs` and `src-tauri/src/commands/search.rs`.
- Existing frontend “plugins” in `src/plugins/` are compile-time UI/search registries, not runtime third-party plugins.
- Existing Pi resource management scans user/project `extensions` in `src-tauri/src/commands/skills.rs`, but those are Pi Agent extensions, not PSM plugin runtime entries.
- Existing `src-tauri/src/domain/session_summary/mod.rs` can build context and call configured LLM providers, but its referenced `DbSessionSummary` has no visible SQLite implementation in current search results. Do not revive a parallel summary-specific table; migrate this path to generic plugin records.
- Existing schema has a probable migration mismatch: `src-tauri/src/data/sqlite/schema.rs` sets `LATEST_SCHEMA_VERSION = 18`, while `src-tauri/src/data/sqlite/migrations.rs` only handles migrations through 17. Resolve before adding any new DB migration.

## Target Platform Shape

```text
React UI
  -> invokes Rust kernel commands
Rust kernel
  -> owns sessions/search/records/model/events/permissions
  -> exposes governed capability APIs
PSM TypeScript plugin layer
  -> uses pi-flavored factory/registration patterns
  -> calls PSM capability APIs as tools/commands/SDK helpers
AI-authored PSM plugins
  -> contribute processors/search/providers/panels/actions
```

## Permission Names For V1

```ts
type PsmPermission =
  | "sessions:read"
  | "search:read"
  | "records:read"
  | "records:write"
  | "model:invoke"
  | "events:subscribe"
  | "ui:contribute"
  | "storage:plugin"
```

## Plugin Contribution Points For V1

```ts
type PsmContributionKind =
  | "session.processor"
  | "search.provider"
  | "session.detailPanel"
  | "workflow.action"
  | "event.handler"
```

## Generic Plugin Storage Model

Rust and SQLite should provide a stable generic storage substrate for plugin-owned data. Do not create one Rust table per plugin feature. Keep strong tables for PSM-owned core facts (`sessions`, `message_entries`, tags, favorites), and store plugin-owned facts in generic records.

Do not assume PostgreSQL-style `jsonb`. SQLite should use validated JSON text in V1:

```sql
payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
```

SQLite JSONB can be evaluated later behind storage-version checks, but V1 should stay compatible with the bundled SQLite runtime and JSON1 functions.

Core storage shape:

```sql
CREATE TABLE plugin_records (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    searchable_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_plugin_records_scope
ON plugin_records(scope_type, scope_id, record_type);

CREATE INDEX idx_plugin_records_plugin
ON plugin_records(plugin_id, record_type);

CREATE VIRTUAL TABLE plugin_records_fts USING fts5(
    record_id UNINDEXED,
    plugin_id UNINDEXED,
    scope_type UNINDEXED,
    scope_id UNINDEXED,
    record_type UNINDEXED,
    searchable_text
);
```

Optional manifest-declared indexes are stored separately and populated by Rust:

```sql
CREATE TABLE plugin_record_index_values (
    record_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    index_name TEXT NOT NULL,
    value_text TEXT,
    value_number REAL,
    value_datetime TEXT,
    PRIMARY KEY (record_id, index_name),
    FOREIGN KEY (record_id) REFERENCES plugin_records(id) ON DELETE CASCADE
);
```

`session.intelligence` is the first record type:

```text
plugin_id   = builtin.session-summary
scope_type  = session
scope_id    = <session_path>
record_type = session.intelligence
payload_json = { summary, objective, status, topics, unresolvedTasks, nextSteps, confidence }
```

---

### Task 1: Write Architecture Decision Doc

**Files:**
- Create: `docs/architecture/psm-plugin-platform.md`
- Reference: `agent-docs/01-architecture.md`
- Reference: `agent-docs/03-backend.md`
- Reference: `src-tauri/src/dispatch.rs`
- Reference: `src/plugins/types.ts`
- Reference: `src-tauri/src/domain/session_summary/mod.rs`

**Step 1: Write the architecture doc**

Create `docs/architecture/psm-plugin-platform.md` with this structure:

```md
# PSM Plugin Platform Architecture

## Goal

Pi Session Manager becomes a Rust-kernel + pi-flavored TypeScript plugin platform. AI agents should be able to author PSM plugins with familiar pi-style construction patterns while still serving PSM's records/search/session substrate.

## Non-Goals

- No arbitrary DB access from plugins.
- No arbitrary filesystem access in V1.
- No unbounded UI injection in V1.
- No third-party marketplace in V1.

## Runtime Layers

| Layer | Owner | Responsibilities |
|---|---|---|
| React UI | frontend | Render registered contributions, settings, results |
| Rust Kernel | backend | Sessions, search, metadata, models, permission checks, events |
| PSM TypeScript Plugin Layer | PSM + pi-flavored authoring | Load PSM plugins, register processors/tools/commands, call PSM capabilities |
| Plugin | user/project code | Register processors/search providers/panels/actions |

## Capability API

Document sessions/search/metadata/model/events/ui/storage APIs and permissions.

## First-Party Sample

`builtin:session-summary` is implemented through the same contracts as external plugins.

## Rollout

P0: generic plugin record storage.
P1: first-party summary processor writes `session.intelligence` records.
P2: SDK types and manifest validation.
P3: pi-flavored PSM capability client prototype.
P4: UI contribution slots.
```

**Step 2: Verify doc exists**

Run:

```bash
test -f docs/architecture/psm-plugin-platform.md
```

Expected: exit code 0.

**Step 3: Commit**

```bash
git add docs/architecture/psm-plugin-platform.md
git commit -m "docs: define PSM plugin platform architecture"
```

---

### Task 2: Fix Schema Migration Baseline

**Files:**
- Modify: `src-tauri/src/data/sqlite/schema.rs`
- Modify: `src-tauri/src/data/sqlite/migrations.rs`
- Test: `src-tauri/tests/migration_test.rs`

**Step 1: Write the failing migration test**

Add a test that initializes a fresh SQLite DB and asserts schema version reaches `LATEST_SCHEMA_VERSION` without `Unknown migration version`.

```rust
#[test]
fn test_latest_schema_version_has_matching_migration() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("psm-test.db");

    let result = pi_session_manager::data::sqlite::init_db_at_path(&db_path);

    assert!(result.is_ok(), "fresh db migration failed: {result:?}");
}
```

If `init_db_at_path` does not exist, use the existing helper pattern already present in `src-tauri/tests/migration_test.rs`; do not add a new public helper just for this test.

**Step 2: Run test to verify it fails or exposes current mismatch**

Run:

```bash
cd src-tauri && cargo test --test migration_test test_latest_schema_version_has_matching_migration -- --nocapture
```

Expected before fix: FAIL if schema version 18 has no migration handler, or PASS if existing tests already initialize through a different path. If PASS, still inspect `schema.rs` and `migrations.rs` and align versions explicitly.

**Step 3: Apply minimal fix**

Choose one:

```rust
// If no version 18 migration exists yet:
pub(crate) const LATEST_SCHEMA_VERSION: i64 = 17;
```

or add `18 => migration_18(conn)?` only if current code already depends on a version 18 table/column.

**Step 4: Run migration tests**

Run:

```bash
cd src-tauri && cargo test --test migration_test -- --nocapture
```

Expected: all migration tests pass.

**Step 5: Commit**

```bash
git add src-tauri/src/data/sqlite/schema.rs src-tauri/src/data/sqlite/migrations.rs src-tauri/tests/migration_test.rs
git commit -m "fix: align sqlite schema migration version"
```

---

### Task 3: Add Generic Plugin Record Storage

**Files:**
- Create: `src-tauri/src/data/sqlite/plugin_records.rs`
- Modify: `src-tauri/src/data/sqlite/mod.rs`
- Modify: `src-tauri/src/data/sqlite/types.rs`
- Modify: `src-tauri/src/data/sqlite/migrations.rs`
- Modify: `src-tauri/src/data/sqlite/schema.rs`
- Test: `src-tauri/tests/plugin_records_test.rs`

**Step 1: Write failing storage tests**

Create `src-tauri/tests/plugin_records_test.rs`:

```rust
use pi_session_manager::data::sqlite::{
    get_plugin_record,
    search_plugin_records,
    upsert_plugin_record,
    DbPluginRecord,
};

#[test]
fn test_upsert_and_get_plugin_record_with_json_payload() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("psm-test.db");
    let conn = pi_session_manager::data::sqlite::init_db_at_path(&db_path).expect("db");

    let item = DbPluginRecord {
        id: "builtin.session-summary:session:/tmp/session.jsonl:session.intelligence".to_string(),
        plugin_id: "builtin.session-summary".to_string(),
        scope_type: "session".to_string(),
        scope_id: "/tmp/session.jsonl".to_string(),
        record_type: "session.intelligence".to_string(),
        schema_version: 1,
        payload_json: serde_json::json!({
            "summary": "Fixed search ranking and verified regression tests.",
            "objective": "Improve search quality",
            "status": "completed",
            "topics": ["search", "ranking"],
            "unresolvedTasks": [],
            "nextSteps": ["Monitor future ranking regressions"],
            "confidence": 0.91
        }).to_string(),
        searchable_text: Some("Fixed search ranking verified regression tests search ranking".to_string()),
        created_at: "2026-05-23T00:00:00Z".to_string(),
        updated_at: "2026-05-23T00:01:00Z".to_string(),
    };

    upsert_plugin_record(&conn, &item).expect("upsert");
    let loaded = get_plugin_record(&conn, &item.id).expect("get").expect("item");

    assert_eq!(loaded.plugin_id, "builtin.session-summary");
    assert_eq!(loaded.record_type, "session.intelligence");
    assert_eq!(loaded.payload_json, item.payload_json);
}

#[test]
fn test_search_plugin_records_matches_searchable_text() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("psm-test.db");
    let conn = pi_session_manager::data::sqlite::init_db_at_path(&db_path).expect("db");

    let item = DbPluginRecord {
        id: "builtin.session-summary:session:/tmp/search.jsonl:session.intelligence".to_string(),
        plugin_id: "builtin.session-summary".to_string(),
        scope_type: "session".to_string(),
        scope_id: "/tmp/search.jsonl".to_string(),
        record_type: "session.intelligence".to_string(),
        schema_version: 1,
        payload_json: serde_json::json!({ "summary": "Tantivy ranking fixed", "topics": ["tantivy", "fts"] }).to_string(),
        searchable_text: Some("Tantivy ranking fixed fts".to_string()),
        created_at: "2026-05-23T00:00:00Z".to_string(),
        updated_at: "2026-05-23T00:01:00Z".to_string(),
    };

    upsert_plugin_record(&conn, &item).expect("upsert");
    let hits = search_plugin_records(&conn, "tantivy", Some("session.intelligence"), 10).expect("search");

    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].scope_id, "/tmp/search.jsonl");
}

#[test]
fn test_upsert_plugin_record_rejects_invalid_json_payload() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("psm-test.db");
    let conn = pi_session_manager::data::sqlite::init_db_at_path(&db_path).expect("db");

    let item = DbPluginRecord {
        id: "bad".to_string(),
        plugin_id: "test".to_string(),
        scope_type: "session".to_string(),
        scope_id: "/tmp/bad.jsonl".to_string(),
        record_type: "bad.record".to_string(),
        schema_version: 1,
        payload_json: "not json".to_string(),
        searchable_text: None,
        created_at: "2026-05-23T00:00:00Z".to_string(),
        updated_at: "2026-05-23T00:01:00Z".to_string(),
    };

    let err = upsert_plugin_record(&conn, &item).expect_err("invalid json should fail");
    assert!(err.contains("payload_json"));
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd src-tauri && cargo test --test plugin_records_test -- --nocapture
```

Expected: FAIL with unresolved imports or missing functions.

**Step 3: Add storage types**

In `src-tauri/src/data/sqlite/types.rs` add:

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct DbPluginRecord {
    pub id: String,
    pub plugin_id: String,
    pub scope_type: String,
    pub scope_id: String,
    pub record_type: String,
    pub schema_version: i64,
    pub payload_json: String,
    pub searchable_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct PluginRecordSearchHit {
    pub id: String,
    pub plugin_id: String,
    pub scope_type: String,
    pub scope_id: String,
    pub record_type: String,
    pub payload_json: String,
    pub searchable_text: Option<String>,
    pub score: f32,
}
```

**Step 4: Add migration**

In `src-tauri/src/data/sqlite/migrations.rs`, add next migration. Use JSON text with `json_valid`; do not depend on PostgreSQL-style JSONB or SQLite JSONB for V1.

```rust
fn migration_N(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS plugin_records (
            id TEXT PRIMARY KEY,
            plugin_id TEXT NOT NULL,
            scope_type TEXT NOT NULL,
            scope_id TEXT NOT NULL,
            record_type TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
            searchable_text TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| format!("Migration N failed creating plugin_records: {e}"))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_plugin_records_scope
         ON plugin_records(scope_type, scope_id, record_type)",
        [],
    ).map_err(|e| format!("Migration N failed creating plugin record scope index: {e}"))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin
         ON plugin_records(plugin_id, record_type)",
        [],
    ).map_err(|e| format!("Migration N failed creating plugin record plugin index: {e}"))?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS plugin_records_fts USING fts5(
            record_id UNINDEXED,
            plugin_id UNINDEXED,
            scope_type UNINDEXED,
            scope_id UNINDEXED,
            record_type UNINDEXED,
            searchable_text
        )",
        [],
    ).map_err(|e| format!("Migration N failed creating plugin_records_fts: {e}"))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS plugin_record_index_values (
            record_id TEXT NOT NULL,
            plugin_id TEXT NOT NULL,
            record_type TEXT NOT NULL,
            index_name TEXT NOT NULL,
            value_text TEXT,
            value_number REAL,
            value_datetime TEXT,
            PRIMARY KEY (record_id, index_name),
            FOREIGN KEY (record_id) REFERENCES plugin_records(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Migration N failed creating plugin_record_index_values: {e}"))?;

    Ok(())
}
```

Update `LATEST_SCHEMA_VERSION` and migration match arm consistently.

**Step 5: Implement storage functions**

Create `src-tauri/src/data/sqlite/plugin_records.rs`:

```rust
use super::deps::*;
use super::types::{DbPluginRecord, PluginRecordSearchHit};

pub fn upsert_plugin_record(conn: &Connection, item: &DbPluginRecord) -> Result<(), String> {
    if serde_json::from_str::<serde_json::Value>(&item.payload_json).is_err() {
        return Err("payload_json must be valid JSON".to_string());
    }

    conn.execute(
        "INSERT INTO plugin_records (
            id, plugin_id, scope_type, scope_id, record_type, schema_version,
            payload_json, searchable_text, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(id) DO UPDATE SET
            plugin_id = excluded.plugin_id,
            scope_type = excluded.scope_type,
            scope_id = excluded.scope_id,
            record_type = excluded.record_type,
            schema_version = excluded.schema_version,
            payload_json = excluded.payload_json,
            searchable_text = excluded.searchable_text,
            updated_at = excluded.updated_at",
        params![
            item.id,
            item.plugin_id,
            item.scope_type,
            item.scope_id,
            item.record_type,
            item.schema_version,
            item.payload_json,
            item.searchable_text,
            item.created_at,
            item.updated_at,
        ],
    ).map_err(|e| format!("Failed to upsert plugin_records: {e}"))?;

    conn.execute("DELETE FROM plugin_records_fts WHERE record_id = ?1", params![item.id])
        .map_err(|e| format!("Failed to delete plugin_records_fts: {e}"))?;

    if let Some(searchable_text) = &item.searchable_text {
        conn.execute(
            "INSERT INTO plugin_records_fts(record_id, plugin_id, scope_type, scope_id, record_type, searchable_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.plugin_id, item.scope_type, item.scope_id, item.record_type, searchable_text],
        ).map_err(|e| format!("Failed to insert plugin_records_fts: {e}"))?;
    }

    Ok(())
}
```

Also implement:

```rust
pub fn get_plugin_record(conn: &Connection, id: &str) -> Result<Option<DbPluginRecord>, String>
pub fn list_plugin_records_for_scope(conn: &Connection, scope_type: &str, scope_id: &str, record_type: Option<&str>) -> Result<Vec<DbPluginRecord>, String>
pub fn search_plugin_records(conn: &Connection, query: &str, record_type: Option<&str>, limit: usize) -> Result<Vec<PluginRecordSearchHit>, String>
```

**Step 6: Export module**

In `src-tauri/src/data/sqlite/mod.rs` add:

```rust
pub mod plugin_records;
pub use plugin_records::{get_plugin_record, list_plugin_records_for_scope, search_plugin_records, upsert_plugin_record};
pub use types::{DbPluginRecord, PluginRecordSearchHit};
```

**Step 7: Run storage tests**

Run:

```bash
cd src-tauri && cargo test --test plugin_records_test -- --nocapture
```

Expected: PASS.

**Step 8: Commit**

```bash
git add src-tauri/src/data/sqlite src-tauri/tests/plugin_records_test.rs
git commit -m "feat: add generic plugin record storage"
```

### Task 4: Convert Existing Summary Domain To Generic Plugin Record Producer

**Files:**
- Modify: `src-tauri/src/domain/session_summary/mod.rs`
- Create: `src-tauri/src/domain/session_intelligence/mod.rs`
- Modify: `src-tauri/src/domain/mod.rs`
- Test: `src-tauri/src/domain/session_intelligence/mod.rs`

**Step 1: Write failing unit tests**

In `src-tauri/src/domain/session_intelligence/mod.rs`, add tests for pure transformation only; do not call real LLM.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_refresh_when_file_modified_changes() {
        let existing = ExistingRecordFingerprint {
            file_modified: "2026-05-22T00:00:00Z".to_string(),
            message_count: 10,
            content_hash: Some("old".to_string()),
            schema_version: 1,
        };

        let current = CurrentRecordFingerprint {
            file_modified: "2026-05-23T00:00:00Z".to_string(),
            message_count: 10,
            content_hash: Some("old".to_string()),
            schema_version: 1,
        };

        assert!(should_refresh_record(Some(&existing), &current));
    }

    #[test]
    fn test_to_plugin_record_uses_session_intelligence_record_type() {
        let generated = GeneratedSessionIntelligence {
            summary: "Implemented plugin architecture plan.".to_string(),
            objective: Some("Design plugin platform".to_string()),
            status: "completed".to_string(),
            topics: vec!["plugins".to_string()],
            unresolved_tasks: vec![],
            next_steps: vec!["Build storage".to_string()],
            confidence: Some(0.8),
        };

        let record = to_session_intelligence_record(
            "/tmp/a.jsonl",
            generated,
            "2026-05-23T00:00:00Z",
        ).expect("record");

        assert_eq!(record.plugin_id, "builtin.session-summary");
        assert_eq!(record.scope_type, "session");
        assert_eq!(record.scope_id, "/tmp/a.jsonl");
        assert_eq!(record.record_type, "session.intelligence");
        assert!(record.searchable_text.unwrap().contains("plugin architecture"));
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd src-tauri && cargo test session_intelligence --lib -- --nocapture
```

Expected: FAIL with missing module/types/functions.

**Step 3: Add pure domain module**

Create `src-tauri/src/domain/session_intelligence/mod.rs` with:

```rust
pub const BUILTIN_SUMMARY_PLUGIN_ID: &str = "builtin.session-summary";
pub const SESSION_INTELLIGENCE_RECORD_TYPE: &str = "session.intelligence";
pub const SESSION_INTELLIGENCE_SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSessionIntelligence {
    pub summary: String,
    pub objective: Option<String>,
    pub status: String,
    pub topics: Vec<String>,
    pub unresolved_tasks: Vec<String>,
    pub next_steps: Vec<String>,
    pub confidence: Option<f64>,
}

pub struct ExistingRecordFingerprint {
    pub file_modified: String,
    pub message_count: i64,
    pub content_hash: Option<String>,
    pub schema_version: i64,
}

pub struct CurrentRecordFingerprint {
    pub file_modified: String,
    pub message_count: i64,
    pub content_hash: Option<String>,
    pub schema_version: i64,
}

pub fn should_refresh_record(
    existing: Option<&ExistingRecordFingerprint>,
    current: &CurrentRecordFingerprint,
) -> bool {
    let Some(existing) = existing else { return true; };
    existing.file_modified != current.file_modified
        || existing.message_count != current.message_count
        || existing.content_hash != current.content_hash
        || existing.schema_version != current.schema_version
}

pub fn to_session_intelligence_record(
    session_path: &str,
    generated: GeneratedSessionIntelligence,
    now: &str,
) -> Result<crate::data::sqlite::DbPluginRecord, String> {
    let searchable_text = [
        generated.summary.as_str(),
        generated.objective.as_deref().unwrap_or(""),
        &generated.topics.join(" "),
        &generated.unresolved_tasks.join(" "),
        &generated.next_steps.join(" "),
    ].join(" ");

    let payload_json = serde_json::to_string(&generated)
        .map_err(|e| format!("Serialize session intelligence payload: {e}"))?;

    Ok(crate::data::sqlite::DbPluginRecord {
        id: format!("{BUILTIN_SUMMARY_PLUGIN_ID}:session:{session_path}:{SESSION_INTELLIGENCE_RECORD_TYPE}"),
        plugin_id: BUILTIN_SUMMARY_PLUGIN_ID.to_string(),
        scope_type: "session".to_string(),
        scope_id: session_path.to_string(),
        record_type: SESSION_INTELLIGENCE_RECORD_TYPE.to_string(),
        schema_version: SESSION_INTELLIGENCE_SCHEMA_VERSION,
        payload_json,
        searchable_text: Some(searchable_text),
        created_at: now.to_string(),
        updated_at: now.to_string(),
    })
}
```

**Step 4: Bridge existing session summary result**

In `src-tauri/src/domain/session_summary/mod.rs`, add conversion from `SessionSummaryResult` into `GeneratedSessionIntelligence`. Preserve current provider call code; do not refactor model provider logic in this task.

**Step 5: Export domain module**

In `src-tauri/src/domain/mod.rs` add:

```rust
pub mod session_intelligence;
```

**Step 6: Run domain tests**

Run:

```bash
cd src-tauri && cargo test session_intelligence --lib -- --nocapture
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src-tauri/src/domain/session_intelligence src-tauri/src/domain/session_summary/mod.rs src-tauri/src/domain/mod.rs
git commit -m "feat: model session intelligence plugin record"
```

---

### Task 5: Add Backend Commands And API For Plugin Records

**Files:**
- Create: `src-tauri/src/commands/plugin_records.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/dispatch.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/api_readonly.rs`
- Modify: `src-tauri/src/server/http/mod.rs`
- Modify: `src-tauri/src/server/http/readonly_routes.rs`
- Test: `src-tauri/tests/plugin_records_command_test.rs`

**Step 1: Write failing dispatch test**

Create `src-tauri/tests/plugin_records_command_test.rs`:

```rust
#[tokio::test]
async fn test_search_plugin_records_dispatch_rejects_empty_query() {
    let result = pi_session_manager::dispatch::dispatch(
        "search_plugin_records",
        &serde_json::json!({ "query": "", "limit": 10 }),
    ).await;

    assert!(result.is_err());
    assert!(result.err().unwrap().contains("query is required"));
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd src-tauri && cargo test --test plugin_records_command_test -- --nocapture
```

Expected: FAIL because command is not registered.

**Step 3: Add thin commands**

Create `src-tauri/src/commands/plugin_records.rs`:

```rust
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_plugin_record(id: String) -> Result<Option<crate::data::sqlite::DbPluginRecord>, String> {
    let config = crate::config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    crate::data::sqlite::get_plugin_record(&conn, &id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_plugin_records_for_scope(scope_type: String, scope_id: String, record_type: Option<String>) -> Result<Vec<crate::data::sqlite::DbPluginRecord>, String> {
    let config = crate::config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    crate::data::sqlite::list_plugin_records_for_scope(&conn, &scope_type, &scope_id, record_type.as_deref())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_plugin_records(query: String, record_type: Option<String>, limit: usize) -> Result<Vec<crate::data::sqlite::PluginRecordSearchHit>, String> {
    if query.trim().is_empty() {
        return Err("query is required".to_string());
    }
    let config = crate::config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    crate::data::sqlite::search_plugin_records(&conn, &query, record_type.as_deref(), limit.clamp(1, 100))
}
```

Add generation command only after storage/search commands pass:

```rust
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn refresh_session_intelligence_record(session_path: String, provider: Option<String>, model: Option<String>) -> Result<crate::data::sqlite::DbPluginRecord, String> {
    // Load entries, build summary context, call existing session_summary generation,
    // convert to `record_type = session.intelligence`, store with upsert_plugin_record, return stored record.
    // Do not leave todo! in committed code.
}
```

**Step 4: Register commands**

- `src-tauri/src/commands/mod.rs`: `pub mod plugin_records; pub use plugin_records::*;`
- `src-tauri/src/dispatch.rs`: add `get_plugin_record`, `list_plugin_records_for_scope`, and `search_plugin_records` match arms.
- `src-tauri/src/lib.rs` and `src-tauri/src/main.rs`: add Tauri handlers guarded like existing commands.

**Step 5: Add readonly HTTP routes**

Add:

```text
GET /v1/plugin-records/{id}
POST /v1/plugin-records/search
GET /v1/plugin-records/scope/{scope_type}/{scope_id}
```

Keep route handlers thin and route through dispatch.

**Step 6: Run command tests**

Run:

```bash
cd src-tauri && cargo test --test plugin_records_command_test -- --nocapture
```

Expected: PASS.

**Step 7: Run dispatch/search regression tests**

Run:

```bash
cd src-tauri && cargo test --test full_text_search_command_test --test full_text_search_integration_test -- --nocapture
```

Expected: PASS.

**Step 8: Commit**

```bash
git add src-tauri/src/commands/plugin_records.rs src-tauri/src/commands/mod.rs src-tauri/src/dispatch.rs src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/src/api_readonly.rs src-tauri/src/server/http src-tauri/tests/plugin_records_command_test.rs
git commit -m "feat: expose plugin record API"
```

---

### Task 6: Add TypeScript PSM Plugin Capability Contracts

**Files:**
- Create: `src/plugins/runtime-sdk/types.ts`
- Create: `src/plugins/runtime-sdk/manifest.ts`
- Create: `src/plugins/runtime-sdk/manifest.test.ts`
- Modify: `src/plugins/index.ts`

**Step 1: Write failing manifest validation tests**

Create `src/plugins/runtime-sdk/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePluginManifest } from "./manifest";

describe("validatePluginManifest", () => {
  it("accepts a minimal session summary plugin", () => {
    const result = validatePluginManifest({
      id: "builtin.session-summary",
      name: "Session Summary",
      version: "0.1.0",
      permissions: ["sessions:read", "records:write", "model:invoke"],
      records: [
        {
          type: "session.intelligence",
          scope: "session",
          schemaVersion: 1,
          searchable: ["summary", "objective", "topics", "unresolvedTasks", "nextSteps"],
          indexes: [{ name: "status", path: "$.status", valueType: "text" }],
        },
      ],
      contributes: {
        processors: [{ id: "summary", kind: "session.processor" }],
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown permissions", () => {
    const result = validatePluginManifest({
      id: "bad",
      name: "Bad",
      version: "0.1.0",
      permissions: ["db:write"],
      contributes: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("db:write");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/manifest.test.ts
```

Expected: FAIL because files do not exist.

**Step 3: Add capability contract types**

Create `src/plugins/runtime-sdk/types.ts`:

```ts
export type PsmPermission =
  | "sessions:read"
  | "search:read"
  | "records:read"
  | "records:write"
  | "model:invoke"
  | "events:subscribe"
  | "ui:contribute"
  | "storage:plugin";

export type PsmContributionKind =
  | "session.processor"
  | "search.provider"
  | "session.detailPanel"
  | "workflow.action"
  | "event.handler";

export interface PsmRecordDeclaration {
  type: string;
  scope: "session" | "project" | "global" | "entry";
  schemaVersion: number;
  searchable?: string[];
  indexes?: Array<{
    name: string;
    path: string;
    valueType: "text" | "number" | "datetime";
  }>;
}

export interface PsmPluginManifest {
  id: string;
  name: string;
  version: string;
  permissions: PsmPermission[];
  records?: PsmRecordDeclaration[];
  contributes: {
    processors?: Array<{ id: string; kind: "session.processor" }>;
    searchProviders?: Array<{ id: string; kind: "search.provider" }>;
    panels?: Array<{ id: string; kind: "session.detailPanel" }>;
    actions?: Array<{ id: string; kind: "workflow.action" }>;
    eventHandlers?: Array<{ id: string; kind: "event.handler" }>;
  };
}

export interface PsmCapabilityApi {
  sessions: {
    list(): Promise<unknown[]>;
    readEntries(sessionPath: string, options?: { limit?: number }): Promise<unknown[]>;
  };
  search: {
    fulltext(input: { query: string; limit?: number }): Promise<unknown[]>;
  };
  records: {
    get(id: string): Promise<unknown | null>;
    listForScope(input: { scopeType: string; scopeId: string; recordType?: string }): Promise<unknown[]>;
    upsert(input: { recordType: string; scopeType: string; scopeId: string; payload: unknown; searchableText?: string }): Promise<void>;
    search(input: { query: string; recordType?: string; limit?: number }): Promise<unknown[]>;
  };
  model: {
    generateObject(input: { schema: string; input: unknown }): Promise<unknown>;
  };
}
```

**Step 4: Add manifest validator**

Create `src/plugins/runtime-sdk/manifest.ts`:

```ts
import type { PsmPermission, PsmPluginManifest } from "./types";

const KNOWN_PERMISSIONS = new Set<PsmPermission>([
  "sessions:read",
  "search:read",
  "records:read",
  "records:write",
  "model:invoke",
  "events:subscribe",
  "ui:contribute",
  "storage:plugin",
]);

export type ManifestValidationResult =
  | { success: true; manifest: PsmPluginManifest }
  | { success: false; error: string };

export function validatePluginManifest(value: unknown): ManifestValidationResult {
  if (!value || typeof value !== "object") {
    return { success: false, error: "manifest must be an object" };
  }
  const manifest = value as Partial<PsmPluginManifest>;
  if (!manifest.id || !manifest.name || !manifest.version) {
    return { success: false, error: "manifest requires id, name, and version" };
  }
  const permissions = manifest.permissions ?? [];
  for (const permission of permissions) {
    if (!KNOWN_PERMISSIONS.has(permission)) {
      return { success: false, error: `unknown permission: ${permission}` };
    }
  }
  return { success: true, manifest: manifest as PsmPluginManifest };
}
```

**Step 5: Export capability contracts**

In `src/plugins/index.ts` export the capability client/types. These are helper contracts for PSM plugins with pi-flavored authoring, not a separate runtime loader.

**Step 6: Run capability contract tests**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/manifest.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/plugins/runtime-sdk src/plugins/index.ts
git commit -m "feat: define PSM plugin capability contracts"
```

---

### Task 7: Add Rust Plugin Manifest And Permission Broker

**Files:**
- Create: `src-tauri/src/domain/plugin_platform/mod.rs`
- Create: `src-tauri/src/domain/plugin_platform/manifest.rs`
- Create: `src-tauri/src/domain/plugin_platform/permissions.rs`
- Modify: `src-tauri/src/domain/mod.rs`
- Test: `src-tauri/src/domain/plugin_platform/manifest.rs`
- Test: `src-tauri/src/domain/plugin_platform/permissions.rs`

**Step 1: Write failing Rust tests**

In `manifest.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_accepts_record_declarations() {
        let manifest = parse_plugin_manifest(serde_json::json!({
            "id": "builtin.session-summary",
            "name": "Session Summary",
            "version": "0.1.0",
            "permissions": ["sessions:read", "records:write"],
            "records": [{
                "type": "session.intelligence",
                "scope": "session",
                "schemaVersion": 1,
                "searchable": ["summary", "topics"],
                "indexes": [{ "name": "status", "path": "$.status", "valueType": "text" }]
            }],
            "contributes": {}
        })).expect("valid manifest");

        assert_eq!(manifest.records.len(), 1);
        assert_eq!(manifest.records[0].record_type, "session.intelligence");
    }

    #[test]
    fn test_manifest_rejects_unknown_permission() {
        let value = serde_json::json!({
            "id": "bad",
            "name": "Bad",
            "version": "0.1.0",
            "permissions": ["db:write"],
            "contributes": {}
        });

        let err = parse_plugin_manifest(value).expect_err("should reject");
        assert!(err.contains("db:write"));
    }
}
```

In `permissions.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_broker_allows_declared_permission() {
        let broker = PermissionBroker::new(vec![PsmPermission::SessionsRead]);
        assert!(broker.check(PsmPermission::SessionsRead).is_ok());
        assert!(broker.check(PsmPermission::RecordsWrite).is_err());
    }
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
cd src-tauri && cargo test plugin_platform --lib -- --nocapture
```

Expected: FAIL because module does not exist.

**Step 3: Implement manifest model**

Use serde rename rules that match TypeScript strings exactly:

```rust
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum PsmPermission {
    #[serde(rename = "sessions:read")]
    SessionsRead,
    #[serde(rename = "search:read")]
    SearchRead,
    #[serde(rename = "records:read")]
    RecordsRead,
    #[serde(rename = "records:write")]
    RecordsWrite,
    #[serde(rename = "model:invoke")]
    ModelInvoke,
    #[serde(rename = "events:subscribe")]
    EventsSubscribe,
    #[serde(rename = "ui:contribute")]
    UiContribute,
    #[serde(rename = "storage:plugin")]
    StoragePlugin,
}
```

Implement `parse_plugin_manifest(value: serde_json::Value) -> Result<PsmPluginManifest, String>` and include record declaration structs:

```rust
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub permissions: Vec<PsmPermission>,
    #[serde(default)]
    pub records: Vec<PsmRecordDeclaration>,
    #[serde(default)]
    pub contributes: serde_json::Value,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PsmRecordDeclaration {
    #[serde(rename = "type")]
    pub record_type: String,
    pub scope: String,
    pub schema_version: i64,
    #[serde(default)]
    pub searchable: Vec<String>,
    #[serde(default)]
    pub indexes: Vec<PsmRecordIndexDeclaration>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PsmRecordIndexDeclaration {
    pub name: String,
    pub path: String,
    pub value_type: String,
}
```

Reject unknown permissions and reject record declarations with empty `type`, empty `scope`, or `schemaVersion < 1`. Do not create tables from plugin code; Rust consumes these declarations and populates `plugin_record_index_values` itself.

**Step 4: Implement permission broker**

```rust
pub struct PermissionBroker {
    allowed: std::collections::HashSet<PsmPermission>,
}

impl PermissionBroker {
    pub fn new(permissions: Vec<PsmPermission>) -> Self { ... }
    pub fn check(&self, permission: PsmPermission) -> Result<(), String> { ... }
}
```

**Step 5: Export domain module**

In `src-tauri/src/domain/mod.rs` add:

```rust
pub mod plugin_platform;
```

**Step 6: Run tests**

Run:

```bash
cd src-tauri && cargo test plugin_platform --lib -- --nocapture
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src-tauri/src/domain/plugin_platform src-tauri/src/domain/mod.rs
git commit -m "feat: add plugin manifest permission broker"
```

---

### Task 8: Define Pi-Flavored PSM Capability Client

**Files:**
- Create: `src/plugins/runtime-sdk/capability-client.ts`
- Create: `src/plugins/runtime-sdk/capability-client.test.ts`
- Optional doc: `extensions/psm-session-summary/README.md`

**Step 1: Write capability client tests**

Create `src/plugins/runtime-sdk/capability-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPsmCapabilityClient } from "./capability-client";

describe("createPsmCapabilityClient", () => {
  it("calls PSM plugin record search through the configured transport", async () => {
    const transport = vi.fn().mockResolvedValue([{ id: "rec-1", record_type: "session.intelligence" }]);
    const client = createPsmCapabilityClient({ invoke: transport, pluginId: "builtin.session-summary" });

    await expect(client.records.search({ query: "tantivy", recordType: "session.intelligence", limit: 5 }))
      .resolves.toEqual([{ id: "rec-1", record_type: "session.intelligence" }]);

    expect(transport).toHaveBeenCalledWith("search_plugin_records", {
      query: "tantivy",
      recordType: "session.intelligence",
      limit: 5,
    });
  });

  it("attaches plugin_id to record writes", async () => {
    const transport = vi.fn().mockResolvedValue(undefined);
    const client = createPsmCapabilityClient({ invoke: transport, pluginId: "builtin.session-summary" });

    await client.records.upsert({
      id: "rec-1",
      scopeType: "session",
      scopeId: "/tmp/session.jsonl",
      recordType: "session.intelligence",
      schemaVersion: 1,
      payload: { summary: "ok" },
      searchableText: "ok",
    });

    expect(transport).toHaveBeenCalledWith("upsert_plugin_record", expect.objectContaining({
      pluginId: "builtin.session-summary",
      recordType: "session.intelligence",
    }));
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/capability-client.test.ts
```

Expected: FAIL because the capability client does not exist.

**Step 3: Add capability client**

Create `src/plugins/runtime-sdk/capability-client.ts`:

```ts
export type PsmInvoke = (command: string, payload: unknown) => Promise<unknown>;

export interface PsmCapabilityClientOptions {
  pluginId: string;
  invoke: PsmInvoke;
}

export function createPsmCapabilityClient(options: PsmCapabilityClientOptions) {
  const { pluginId, invoke } = options;

  return {
    records: {
      get(id: string) {
        return invoke("get_plugin_record", { id });
      },
      listForScope(input: { scopeType: string; scopeId: string; recordType?: string }) {
        return invoke("list_plugin_records_for_scope", input);
      },
      search(input: { query: string; recordType?: string; limit?: number }) {
        return invoke("search_plugin_records", input);
      },
      upsert(input: {
        id: string;
        scopeType: string;
        scopeId: string;
        recordType: string;
        schemaVersion: number;
        payload: unknown;
        searchableText?: string;
      }) {
        return invoke("upsert_plugin_record", {
          ...input,
          pluginId,
          payloadJson: JSON.stringify(input.payload),
        });
      },
    },
  };
}
```

This file is a helper for PSM plugins using pi-flavored construction patterns. It does not load plugins and does not supervise a host process. PSM remains the product boundary; pi is the authoring-style reference.

**Step 4: Add pi-flavored PSM plugin usage example**

Document the intended flavor:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPsmCapabilityClient } from "./capability-client";

export default function (pi: ExtensionAPI) {
  const psm = createPsmCapabilityClient({ pluginId: "builtin.session-summary", invoke: psmInvoke });

  pi.registerTool({
    name: "psm_session_summary_refresh",
    label: "Refresh Session Summary",
    description: "Generate and store a session.intelligence record in PSM",
    parameters: Type.Object({ sessionPath: Type.String() }),
    async execute(_toolCallId, params) {
      // read session through PSM capability, generate summary through pi/model, write plugin record
      await psm.records.upsert({ ... });
      return { content: [{ type: "text", text: "Stored session.intelligence" }], details: {} };
    },
  });
}
```

**Step 5: Run tests**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/capability-client.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/plugins/runtime-sdk/capability-client.ts src/plugins/runtime-sdk/capability-client.test.ts extensions/psm-session-summary/README.md
git commit -m "feat: define pi-flavored PSM capability client"
```

---

### Task 9: Add First-Party Builtin Summary Plugin Contract Sample

**Files:**
- Create: `extensions/psm-session-summary/psm.plugin.ts`
- Create: `extensions/psm-session-summary/README.md`
- Create: `src/plugins/runtime-sdk/examples/session-summary.test.ts`

**Step 1: Write manifest sample test**

Create `src/plugins/runtime-sdk/examples/session-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import summaryPlugin from "../../../../extensions/psm-session-summary/psm.plugin";
import { validatePluginManifest } from "../manifest";

describe("builtin session summary plugin", () => {
  it("has a valid manifest", () => {
    expect(validatePluginManifest(summaryPlugin.manifest).success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/examples/session-summary.test.ts
```

Expected: FAIL because sample does not exist.

**Step 3: Add sample plugin**

Create `extensions/psm-session-summary/psm.plugin.ts`:

```ts
import type { PsmPluginManifest } from "@pi-session-manager/plugin-sdk";

const manifest: PsmPluginManifest = {
  id: "builtin.session-summary",
  name: "Session Summary",
  version: "0.1.0",
  permissions: ["sessions:read", "records:write", "model:invoke"],
  records: [
    {
      type: "session.intelligence",
      scope: "session",
      schemaVersion: 1,
      searchable: ["summary", "objective", "topics", "unresolvedTasks", "nextSteps"],
      indexes: [{ name: "status", path: "$.status", valueType: "text" }],
    },
  ],
  contributes: {
    processors: [{ id: "summary", kind: "session.processor" }],
  },
};

export default {
  manifest,
};
```

**Step 4: Add README**

Create `extensions/psm-session-summary/README.md` explaining this is a pi-flavored PSM plugin contract sample until PSM plugin execution lands.

**Step 5: Run sample test**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/examples/session-summary.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add extensions/psm-session-summary src/plugins/runtime-sdk/examples/session-summary.test.ts
git commit -m "docs: add builtin summary plugin sample"
```

---

### Task 10: Wire Frontend Plugin Record Search Plugin

**Files:**
- Create: `src/plugins/plugin-records/PluginRecordSearchPlugin.tsx`
- Modify: `src/plugins/builtins.ts`
- Modify: `src/runtime-data/sessionSource.ts`
- Modify: `src/runtime-data/providers/sessionProviders.ts`
- Modify: `src/types.ts`
- Test: `src/plugins/plugin-records/__tests__/PluginRecordSearchPlugin.test.tsx`

**Step 1: Write failing plugin test**

Create test:

```tsx
import { describe, expect, it, vi } from "vitest";
import { PluginRecordSearchPlugin } from "../PluginRecordSearchPlugin";

describe("PluginRecordSearchPlugin", () => {
  it("returns backend session intelligence records", async () => {
    const plugin = new PluginRecordSearchPlugin({
      search: vi.fn().mockResolvedValue([
        {
          id: "rec1",
          plugin_id: "builtin.session-summary",
          scope_type: "session",
          scope_id: "/tmp/a.jsonl",
          record_type: "session.intelligence",
          payload_json: JSON.stringify({ summary: "Plugin platform design", status: "active" }),
          searchable_text: "Plugin platform design active",
          score: 1,
        },
      ]),
    });

    const results = await plugin.search("plugin", {
      sessions: [],
      selectedProject: null,
      selectedSession: null,
      searchCurrentProjectOnly: false,
      setSelectedSession: vi.fn(),
      setSelectedProject: vi.fn(),
      closeCommandMenu: vi.fn(),
      t: (_key: string, fallback?: string) => fallback ?? _key,
    });

    expect(results[0].title).toContain("Plugin platform design");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/plugins/plugin-records/__tests__/PluginRecordSearchPlugin.test.tsx
```

Expected: FAIL because plugin does not exist.

**Step 3: Add runtime provider method**

Add `searchPluginRecords(query, recordType, limit)` to runtime provider interfaces and Tauri provider implementation using `invoke("search_plugin_records", { query, recordType, limit })`. Use `recordType = "session.intelligence"` for the first built-in search plugin.

**Step 4: Add plugin implementation**

Create `PluginRecordSearchPlugin.tsx` that calls backend plugin record search with `recordType = "session.intelligence"`, parses `payload_json`, maps records into `SearchPluginResult`, and opens the session via `getRuntimeSessionByPath(record.scope_id)`.

**Step 5: Register built-in plugin**

In `src/plugins/builtins.ts`, register `new PluginRecordSearchPlugin()` after message/session search. Give lower priority than message search and higher than plain session search if desired.

**Step 6: Run plugin test**

Run:

```bash
pnpm vitest run src/plugins/plugin-records/__tests__/PluginRecordSearchPlugin.test.tsx
```

Expected: PASS.

**Step 7: Run related search plugin tests**

Run:

```bash
pnpm vitest run src/plugins/message/__tests__/MessageSearchPlugin.test.ts src/plugins/session/__tests__/SessionSearchPlugin.test.tsx
```

Expected: PASS.

**Step 8: Commit**

```bash
git add src/plugins/plugin-records src/plugins/builtins.ts src/runtime-data src/types.ts
git commit -m "feat: add plugin record search plugin"
```

---

### Task 11: Final Verification And Documentation Update

**Files:**
- Modify: `docs/architecture/psm-plugin-platform.md`
- Modify: `agent-docs/03-backend.md` if new command docs are stable
- Modify: `agent-docs/02-frontend.md` if new frontend plugin docs are stable

**Step 1: Run Rust focused checks**

Run:

```bash
cd src-tauri && cargo test --test migration_test --test plugin_records_test --test plugin_records_command_test -- --nocapture
```

Expected: PASS.

**Step 2: Run Rust broad check**

Run:

```bash
cd src-tauri && cargo test
```

Expected: PASS.

**Step 3: Run frontend focused checks**

Run:

```bash
pnpm vitest run src/plugins/runtime-sdk/manifest.test.ts src/plugins/runtime-sdk/rpc.test.ts src/plugins/plugin-records/__tests__/PluginRecordSearchPlugin.test.tsx
```

Expected: PASS.

**Step 4: Run typecheck/build**

Run:

```bash
pnpm build
```

Expected: PASS.

**Step 5: Run Rust lint if time allows**

Run:

```bash
cd src-tauri && cargo clippy -- -D warnings
```

Expected: PASS or document any pre-existing warnings separately without hiding new warnings.

**Step 6: Update docs**

Add short sections for:

- `plugin_records` generic storage and `plugin_records_fts` search.
- `session.intelligence` as a first-party record type, not a dedicated table.
- Plugin manifest and permission broker.
- Pi-flavored PSM capability client contracts.
- What is intentionally not supported yet.

**Step 7: Commit**

```bash
git add docs/architecture/psm-plugin-platform.md agent-docs/02-frontend.md agent-docs/03-backend.md
git commit -m "docs: document generic plugin record rollout"
```

---

## Execution Notes

- Commit after each task. Do not batch the whole platform into one commit.
- Do not launch arbitrary plugin code in V1. Capability contracts and manifest first, pi/packages/agent integration later.
- Do not grant plugins direct DB/file access. Route every operation through Rust capabilities.
- Keep first-party summary plugin using the same public contract planned for third-party plugins.
- Keep AI-inferred metadata separate from user tags. Store inferred topics/status in `plugin_records` under `record_type = session.intelligence`; do not write inferred topics into user tag tables.
- If `init_db_at_path` does not exist, reuse existing test helper patterns instead of broadening public API unnecessarily.
- If the existing `domain/session_summary` module fails to compile because `DbSessionSummary` is missing, fix by migrating to `DbPluginRecord`; do not revive a parallel summary table.

## Completion Criteria

- Architecture doc exists and describes Rust kernel + pi-flavored PSM TypeScript plugin layer clearly.
- SQLite migration baseline is consistent.
- `plugin_records` generic storage exists and is searchable through FTS.
- Backend commands expose get/list/search plugin records through Tauri/dispatch/HTTP.
- TypeScript SDK defines manifest, permissions, contribution points, and RPC envelope.
- Rust permission broker validates plugin manifest permissions.
- Builtin summary plugin sample validates as a PSM plugin.
- Frontend command palette can search `session.intelligence` plugin records.
- Focused Rust tests, focused Vitest tests, `cargo test`, and `pnpm build` pass before claiming completion.
