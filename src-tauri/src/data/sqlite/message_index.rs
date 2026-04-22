use super::deps::*;
use crate::domain::pi_session::resolve_labels;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MessageEntriesBackfillState {
    InProgress,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MessageEntryRow {
    row_id: String,
    entry_id: String,
    session_path: String,
    role: String,
    source_type: String,
    content: String,
    search_text: String,
    timestamp: String,
}

const INSERT_CHUNK_SIZE: usize = 32;
const MESSAGE_INDEX_ROW_VERSION: &str = "3";

static MESSAGE_ENTRIES_BACKFILL_STATE: Mutex<Option<HashMap<String, MessageEntriesBackfillState>>> = Mutex::new(None);

fn try_claim_message_entries_backfill(db_key: &str) -> Result<bool, String> {
    let mut guard = MESSAGE_ENTRIES_BACKFILL_STATE.lock().map_err(|_| "Failed to lock backfill state guard".to_string())?;
    let states = guard.get_or_insert_with(HashMap::new);

    match states.get(db_key) {
        Some(MessageEntriesBackfillState::InProgress) => {
            debug!("[Migration] message_entries backfill already in progress for db {}, skipping duplicate trigger", db_key);
            Ok(false)
        }
        None => {
            states.insert(db_key.to_string(), MessageEntriesBackfillState::InProgress);
            Ok(true)
        }
    }
}

fn finish_message_entries_backfill(db_key: &str, _mark_done: bool) -> Result<(), String> {
    let mut guard = MESSAGE_ENTRIES_BACKFILL_STATE.lock().map_err(|_| "Failed to lock backfill state guard".to_string())?;
    let states = guard.get_or_insert_with(HashMap::new);

    states.remove(db_key);
    if states.is_empty() {
        *guard = None;
    }

    Ok(())
}

#[cfg(test)]
fn clear_message_entries_backfill_state_for_tests(db_key: &str) {
    let mut guard = MESSAGE_ENTRIES_BACKFILL_STATE.lock().expect("mutex poisoned");
    if let Some(states) = guard.as_mut() {
        states.remove(db_key);
        if states.is_empty() {
            *guard = None;
        }
    }
}

fn ensure_message_index_state_table(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_index_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create message_index_state: {e}"))?;
    Ok(())
}

fn get_message_index_row_version(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM message_index_state WHERE key = 'row_version'", [], |row| row.get(0)).optional().map_err(|e| format!("Failed to read message index row version: {e}"))
}

fn set_message_index_row_version(conn: &Connection, version: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO message_index_state (key, value) VALUES ('row_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![version],
    )
    .map_err(|e| format!("Failed to persist message index row version: {e}"))?;
    Ok(())
}

fn backing_store_exists(session_path: &str) -> bool {
    crate::domain::casr_min::bridge_ops::backing_file_path(Path::new(session_path)).exists()
}

fn refresh_message_entries_if_needed(conn: &Connection) -> Result<(), String> {
    let db_key = conn.path().map(|path| path.to_string()).unwrap_or_else(|| "<memory>".to_string());

    if !try_claim_message_entries_backfill(&db_key)? {
        return Ok(());
    }

    let result = (|| -> Result<bool, String> {
        ensure_message_index_state_table(conn)?;

        let stored_row_version = get_message_index_row_version(conn)?;
        let needs_full_rebuild = stored_row_version.as_deref() != Some(MESSAGE_INDEX_ROW_VERSION);

        if needs_full_rebuild {
            let rebuilt_count = rebuild_all_message_entries(conn)?;
            info!("[Migration] Rebuilt message_entries rows for {} sessions with row version {}", rebuilt_count, MESSAGE_INDEX_ROW_VERSION);
            return Ok(true);
        }

        let backfilled = backfill_missing_message_entries(conn)?;
        Ok(backfilled > 0)
    })();

    match result {
        Ok(mark_done) => {
            finish_message_entries_backfill(&db_key, mark_done)?;
            Ok(())
        }
        Err(error) => {
            finish_message_entries_backfill(&db_key, false)?;
            Err(error)
        }
    }
}

fn rebuild_all_message_entries(conn: &Connection) -> Result<usize, String> {
    let session_paths = list_all_session_paths(conn)?;
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION").map_err(|e| format!("Failed to begin message_entries rebuild transaction: {e}"))?;

    let rebuild_result = (|| -> Result<usize, String> {
        if session_paths.is_empty() {
            conn.execute("DELETE FROM message_entries", []).map_err(|e| format!("Failed to clear message_entries during empty rebuild: {e}"))?;
            set_message_index_row_version(conn, MESSAGE_INDEX_ROW_VERSION)?;
            return Ok(0);
        }

        conn.execute("DELETE FROM message_entries", []).map_err(|e| format!("Failed to clear message_entries for rebuild: {e}"))?;

        let mut rebuilt_count = 0usize;
        for path in session_paths {
            if !backing_store_exists(&path) {
                warn!("[Migration] Removing stale session cache entry for missing backing file: {}", path);
                if let Err(delete_err) = super::maintenance::delete_session(conn, &path) {
                    warn!("[Migration] Failed to remove stale session cache entry {}: {}", path, delete_err);
                }
                continue;
            }

            insert_message_entries_for_path(conn, &path)?;
            rebuilt_count += 1;
        }

        set_message_index_row_version(conn, MESSAGE_INDEX_ROW_VERSION)?;
        Ok(rebuilt_count)
    })();

    match rebuild_result {
        Ok(rebuilt_count) => {
            conn.execute_batch("COMMIT").map_err(|e| format!("Failed to commit message_entries rebuild transaction: {e}"))?;
            Ok(rebuilt_count)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

fn list_all_session_paths(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare("SELECT path FROM sessions ORDER BY modified DESC, path ASC").map_err(|e| format!("Failed to prepare session path listing for rebuild: {e}"))?;

    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| format!("Failed to query session paths for rebuild: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect session paths for rebuild: {e}"))
}

fn backfill_missing_message_entries(conn: &Connection) -> Result<usize, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.path
             FROM sessions s
             WHERE NOT EXISTS (
                 SELECT 1 FROM message_entries m WHERE m.session_path = s.path
             )
             ORDER BY s.modified DESC, s.path ASC",
        )
        .map_err(|e| format!("Failed to prepare missing session paths for message_entries backfill: {e}"))?;

    let missing_paths: Vec<String> =
        stmt.query_map([], |row| row.get(0)).map_err(|e| format!("Failed to query missing session paths for message_entries backfill: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect missing session paths for message_entries backfill: {e}"))?;

    if missing_paths.is_empty() {
        return Ok(0);
    }

    info!("[Migration] Backfilling message_entries rows for {} missing sessions", missing_paths.len());

    let mut backfilled = 0usize;
    for path in missing_paths {
        if !backing_store_exists(&path) {
            warn!("[Migration] Removing stale session cache entry for missing backing file: {}", path);
            if let Err(delete_err) = super::maintenance::delete_session(conn, &path) {
                warn!("[Migration] Failed to remove stale session cache entry {}: {}", path, delete_err);
            }
            continue;
        }

        insert_message_entries_for_path(conn, &path)?;
        backfilled += 1;
    }

    Ok(backfilled)
}

pub fn ensure_message_fts_schema(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn.prepare("PRAGMA table_info(message_entries)").map_err(|e| format!("Failed to query message_entries schema: {e}"))?;
    let me_columns: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to read message_entries columns: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect message_entries columns: {e}"))?;
    let required_me_columns = ["id", "entry_id", "session_path", "role", "source_type", "content", "search_text", "timestamp"];
    let mut migrated = false;
    for &col in &required_me_columns {
        if !me_columns.contains(&col.to_string()) {
            warn!("[Migration] message_entries missing column '{}', adding...", col);
            let sql = if col == "search_text" { "ALTER TABLE message_entries ADD COLUMN search_text TEXT NOT NULL DEFAULT ''".to_string() } else { format!("ALTER TABLE message_entries ADD COLUMN {col}") };
            conn.execute(&sql, []).map_err(|e| format!("Failed to add column {col}: {e}"))?;
            migrated = true;
        }
    }
    if migrated {
        info!("[Migration] message_entries schema updated by adding missing columns");
    } else {
        debug!("[Schema] message_entries columns OK: {:?}", me_columns);
    }

    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_fts'").map_err(|e| format!("Failed to check message_fts existence: {e}"))?;
    let fts_exists = stmt.query_row([], |row| Ok(row.get::<_, String>(0)? == "message_fts")).unwrap_or(false);

    if !fts_exists {
        info!("[FTS] Creating message_fts virtual table");
        create_message_fts5(conn)?;
        rebuild_message_fts_index(conn)?;
    } else {
        let mut stmt = conn.prepare("PRAGMA table_info(message_fts)").map_err(|e| format!("Failed to query message_fts schema: {e}"))?;
        let fts_columns: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to read message_fts columns: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect message_fts columns: {e}"))?;
        let required_fts_columns = ["session_path", "role", "source_type", "search_text"];
        let fts_has_all = required_fts_columns.iter().all(|&col| fts_columns.contains(&col.to_string()));

        if !fts_has_all {
            error!("[Migration] message_fts schema incomplete. Has columns: {:?}. Recreating virtual table...", fts_columns);
            conn.execute("DROP TABLE IF EXISTS message_fts", []).map_err(|e| format!("Failed to drop old message_fts: {e}"))?;
            create_message_fts5(conn)?;
            rebuild_message_fts_index(conn)?;
            info!("[Migration] Recreated message_fts virtual table");
        } else {
            debug!("[Schema] message_fts columns OK: {:?}", fts_columns);
            let mut stmt_sql = conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='message_fts'").map_err(|e| format!("Failed to query message_fts definition: {e}"))?;
            let sql: String = stmt_sql.query_row([], |row| row.get(0)).map_err(|e| format!("Failed to read message_fts sql: {e}"))?;
            let is_auto_sync = sql.contains("content='message_entries'") || sql.contains("content=\"message_entries\"");
            let has_metadata_columns_unindexed = sql.contains("role UNINDEXED") && sql.contains("source_type UNINDEXED");
            let indexes_search_text = sql.contains("search_text");
            if !is_auto_sync || !has_metadata_columns_unindexed || !indexes_search_text {
                error!("[Migration] message_fts schema is outdated. Recreating content-synced content-only FTS index...");
                conn.execute("DROP TABLE IF EXISTS message_fts", []).map_err(|e| format!("Failed to drop outdated message_fts: {e}"))?;
                create_message_fts5(conn)?;
                rebuild_message_fts_index(conn)?;
                info!("[Migration] Recreated message_fts with updated schema");
            } else {
                debug!("[Schema] message_fts already auto-sync");
            }
        }
    }

    create_message_entries_triggers(conn)?;

    if let Err(e) = refresh_message_entries_if_needed(conn) {
        error!("[Migration] Failed to refresh message entries: {}", e);
    }

    Ok(())
}

pub(crate) fn drop_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ai", []).map_err(|e| format!("Failed to drop trigger message_entries_ai: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ad", []).map_err(|e| format!("Failed to drop trigger message_entries_ad: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_au", []).map_err(|e| format!("Failed to drop trigger message_entries_au: {e}"))?;
    Ok(())
}

fn create_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_ai AFTER INSERT ON message_entries BEGIN
         INSERT INTO message_fts(rowid, session_path, role, source_type, search_text)
         VALUES (new.rowid, new.session_path, new.role, new.source_type, new.search_text); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_ai: {e}"))?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_ad AFTER DELETE ON message_entries BEGIN
         INSERT INTO message_fts(message_fts, rowid, session_path, role, source_type, search_text)
         VALUES('delete', old.rowid, old.session_path, old.role, old.source_type, old.search_text); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_ad: {e}"))?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_au AFTER UPDATE ON message_entries BEGIN
         INSERT INTO message_fts(message_fts, rowid, session_path, role, source_type, search_text)
         VALUES('delete', old.rowid, old.session_path, old.role, old.source_type, old.search_text);
         INSERT INTO message_fts(rowid, session_path, role, source_type, search_text)
         VALUES (new.rowid, new.session_path, new.role, new.source_type, new.search_text); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_au: {e}"))?;

    debug!("[FTS] Created message_entries sync triggers");
    Ok(())
}

fn create_message_fts5(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
            session_path UNINDEXED,
            role UNINDEXED,
            source_type UNINDEXED,
            search_text,
            content='message_entries',
            content_rowid='rowid',
            tokenize='unicode61'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create message_fts: {e}"))?;

    info!("[FTS] Created message_fts virtual table (content auto-sync enabled)");
    Ok(())
}

fn optimize_message_fts_index(conn: &Connection) -> Result<(), String> {
    conn.execute("INSERT INTO message_fts(message_fts) VALUES('optimize')", []).map_err(|e| format!("Failed to optimize FTS index: {e}"))?;
    Ok(())
}

fn rebuild_message_fts_index(conn: &Connection) -> Result<(), String> {
    info!("[FTS] Rebuilding message_fts index from message_entries...");
    conn.execute("INSERT INTO message_fts(message_fts) VALUES('rebuild')", []).map_err(|e| format!("Failed to rebuild FTS index: {e}"))?;
    optimize_message_fts_index(conn)?;
    Ok(())
}

pub fn delete_message_entries_for_session(conn: &Connection, session_path: &str) -> Result<(), String> {
    debug!("[Delete] Attempting to delete message entries for session: {}", session_path);

    if !message_entries_table_exists(conn)? {
        debug!("[Delete] message_entries table does not exist, skipping delete");
        return Ok(());
    }

    let mut col_stmt = conn.prepare("PRAGMA table_info(message_entries)").map_err(|e| format!("Failed to query message_entries schema: {e}"))?;
    let column_names: Vec<String> = col_stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to read message_entries column names: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect message_entries column names: {e}"))?;

    let required = ["id", "session_path", "role", "content", "timestamp"];
    let has_all = required.iter().all(|&col| column_names.contains(&col.to_string()));

    if !has_all {
        error!("[Delete] message_entries schema incomplete. Columns: {:?}. Required: {:?}. Triggering migration...", column_names, required);
        ensure_message_fts_schema(conn)?;
        return delete_message_entries_for_session(conn, session_path);
    }

    if cfg!(debug_assertions) {
        debug!("[Delete] message_entries schema OK: {:?}", column_names);
    }

    match conn.execute("DELETE FROM message_entries WHERE session_path = ?", params![session_path]) {
        Ok(_) => {
            debug!("[Delete] Deleted message entries for session: {}", session_path);
        }
        Err(e) => {
            let err_str = format!("{e:?}");
            error!("[Delete] Failed to delete message entries for session '{}': {:?} (code: {:?})", session_path, e, e.sqlite_error_code());

            error!("[Delete] Attempting schema migration recovery...");
            if let Err(migrate_err) = ensure_message_fts_schema(conn) {
                error!("[Delete] Migration recovery failed: {}", migrate_err);
            } else if let Ok(count) = conn.execute("DELETE FROM message_entries WHERE session_path = ?", params![session_path]) {
                debug!("[Delete] Recovered: deleted {} rows", count);
                return Ok(());
            }

            return Err(format!("Failed to delete message entries: {err_str}"));
        }
    }
    Ok(())
}

fn message_entries_table_exists(conn: &Connection) -> Result<bool, String> {
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'").map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists = stmt.query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries")).unwrap_or(false);
    Ok(exists)
}

fn load_include_thinking_in_search() -> bool {
    crate::unified_config::read_section("app").ok().and_then(|settings| settings.get("search").cloned()).and_then(|search| search.get("includeThinkingInSearch").and_then(Value::as_bool)).unwrap_or(false)
}

fn build_row_id(session_path: &str, entry_id: &str, source_type: &str) -> String {
    format!("{session_path}::{entry_id}::{source_type}")
}

fn build_rows_from_session_entries(session_path: &str, entries: &[SessionEntry], include_thinking: bool) -> Vec<MessageEntryRow> {
    let mut rows = Vec::new();
    let mut message_roles_by_entry_id = HashMap::new();

    for entry in entries {
        let Some(message) = entry.message.as_ref() else {
            continue;
        };
        if message.role != "user" && message.role != "assistant" {
            continue;
        }

        message_roles_by_entry_id.insert(entry.id.clone(), message.role.clone());

        let (visible_text, thinking_text) = extract_message_segments(message, include_thinking);
        let timestamp = entry.timestamp.to_rfc3339();

        rows.push(MessageEntryRow {
            row_id: build_row_id(session_path, &entry.id, &message.role),
            entry_id: entry.id.clone(),
            session_path: session_path.to_string(),
            role: message.role.clone(),
            source_type: message.role.clone(),
            content: visible_text.clone().unwrap_or_default(),
            search_text: crate::utils::normalize_search_text(visible_text.as_deref().unwrap_or_default()),
            timestamp: timestamp.clone(),
        });

        if let Some(content) = thinking_text {
            rows.push(MessageEntryRow {
                row_id: build_row_id(session_path, &entry.id, "thinking"),
                entry_id: entry.id.clone(),
                session_path: session_path.to_string(),
                role: message.role.clone(),
                source_type: "thinking".to_string(),
                search_text: crate::utils::normalize_search_text(&content),
                content,
                timestamp,
            });
        }
    }

    for (target_id, resolved_label) in resolve_labels(entries) {
        let Some(role) = message_roles_by_entry_id.get(&target_id) else {
            continue;
        };

        rows.push(MessageEntryRow {
            row_id: build_row_id(session_path, &target_id, "label"),
            entry_id: target_id.clone(),
            session_path: session_path.to_string(),
            role: role.clone(),
            source_type: "label".to_string(),
            search_text: crate::utils::normalize_search_text(&resolved_label.text),
            content: resolved_label.text,
            timestamp: resolved_label.labeled_at.to_rfc3339(),
        });
    }

    rows
}

fn extract_message_segments(message: &crate::types::Message, include_thinking: bool) -> (Option<String>, Option<String>) {
    let mut visible_parts = Vec::new();
    let mut thinking_parts = Vec::new();

    for item in &message.content {
        let Some(text) = item.text.as_deref() else {
            continue;
        };
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }

        if item.content_type == "thinking" {
            if include_thinking {
                thinking_parts.push(trimmed.to_string());
            }
        } else {
            visible_parts.push(trimmed.to_string());
        }
    }

    let visible_text = (!visible_parts.is_empty()).then(|| visible_parts.join("\n"));
    let thinking_text = (!thinking_parts.is_empty()).then(|| thinking_parts.join("\n"));
    (visible_text, thinking_text)
}

fn insert_message_entries_rows(conn: &Connection, rows: &[MessageEntryRow]) -> Result<(), String> {
    for chunk in rows.chunks(INSERT_CHUNK_SIZE) {
        let values_sql = (0..chunk.len())
            .map(|index| {
                let base = index * 8;
                format!("(?{}, ?{}, ?{}, ?{}, ?{}, ?{}, ?{}, ?{})", base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, base + 7, base + 8)
            })
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!("INSERT OR REPLACE INTO message_entries (id, entry_id, session_path, role, source_type, content, search_text, timestamp) VALUES {values_sql}");

        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(chunk.len() * 8);
        for row in chunk {
            params.push(&row.row_id);
            params.push(&row.entry_id);
            params.push(&row.session_path);
            params.push(&row.role);
            params.push(&row.source_type);
            params.push(&row.content);
            params.push(&row.search_text);
            params.push(&row.timestamp);
        }

        conn.execute(&sql, params.as_slice()).map_err(|e| format!("Failed to bulk insert message entries: {e}"))?;
    }

    Ok(())
}

fn insert_message_entries_for_path(conn: &Connection, session_path: &str) -> Result<(), String> {
    let include_thinking = load_include_thinking_in_search();
    let entries = crate::domain::casr_min::bridge_ops::parse_session_entries_from_path(Path::new(session_path))?;
    let rows = build_rows_from_session_entries(session_path, &entries, include_thinking);
    delete_message_entries_for_session(conn, session_path)?;
    insert_message_entries_rows(conn, &rows)
}

pub fn insert_message_entries(conn: &Connection, session: &SessionInfo) -> Result<(), String> {
    if !message_entries_table_exists(conn)? {
        return Ok(());
    }

    insert_message_entries_for_path(conn, &session.path)
}

pub fn upsert_message_entries(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    if !message_entries_table_exists(conn)? {
        return Ok(());
    }

    let include_thinking = load_include_thinking_in_search();
    let rows = build_rows_from_session_entries(session_path, entries, include_thinking);
    delete_message_entries_for_session(conn, session_path)?;
    insert_message_entries_rows(conn, &rows)?;

    debug!("Upserted {} message entry rows for session: {}", rows.len(), session_path);
    Ok(())
}

/// Append only: insert new rows without clearing existing ones.
/// Used for incremental tail-read optimization.
pub fn append_message_entries(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    if !message_entries_table_exists(conn)? {
        return Ok(());
    }

    let include_thinking = load_include_thinking_in_search();
    let rows = build_rows_from_session_entries(session_path, entries, include_thinking);
    insert_message_entries_rows(conn, &rows)?;

    debug!("Appended {} message entry rows for session: {}", rows.len(), session_path);
    Ok(())
}

#[allow(clippy::type_complexity)]
pub fn search_message_fts(conn: &Connection, query: &str, role_filter: Option<&str>, limit: usize) -> Result<Vec<(String, String, String, String, String, f32)>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let normalized = crate::utils::normalize_search_text(trimmed);
    let fts_query = if normalized.is_empty() { format!("\"{}\"", trimmed.replace('"', "\"\"").replace('\\', "\\\\")) } else { normalized };

    let role_condition = match role_filter {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };

    let sql = format!(
        "SELECT
            m.entry_id,
            m.session_path,
            m.role,
            snippet(message_fts, 3, '<b>', '</b>', '...', 80) as snippet,
            m.timestamp,
            bm25(message_fts) as rank
         FROM message_entries m
         JOIN message_fts ON m.rowid = message_fts.rowid
         WHERE message_fts MATCH ?
         AND {role_condition}
         ORDER BY m.rowid
         LIMIT ?"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare message FTS query: {e}"))?;

    let rows = stmt.query_map(params![fts_query, limit as i64], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, f32>(5)?))).map_err(|e| format!("Failed to query message FTS: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect message FTS results: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};
    use std::sync::{Arc, Barrier};
    use std::thread;

    fn parse_test_timestamp(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value).expect("valid timestamp").with_timezone(&Utc)
    }

    fn message_entry(id: &str, timestamp: &str, role: &str, text: &str) -> SessionEntry {
        SessionEntry {
            entry_type: "message".to_string(),
            id: id.to_string(),
            parent_id: None,
            timestamp: parse_test_timestamp(timestamp),
            message: Some(crate::types::Message { role: role.to_string(), content: vec![crate::types::Content { content_type: "text".to_string(), text: Some(text.to_string()) }] }),
            target_id: None,
            label: None,
        }
    }

    fn label_entry(id: &str, timestamp: &str, target_id: &str, label: Option<&str>) -> SessionEntry {
        SessionEntry { entry_type: "label".to_string(), id: id.to_string(), parent_id: None, timestamp: parse_test_timestamp(timestamp), message: None, target_id: Some(target_id.to_string()), label: label.map(ToString::to_string) }
    }

    fn model_change_entry(id: &str, timestamp: &str) -> SessionEntry {
        SessionEntry { entry_type: "model_change".to_string(), id: id.to_string(), parent_id: None, timestamp: parse_test_timestamp(timestamp), message: None, target_id: None, label: None }
    }

    #[test]
    fn backfill_claim_allows_only_one_concurrent_winner_per_db() {
        let db_key = "/tmp/test-claim-concurrent.db";
        clear_message_entries_backfill_state_for_tests(db_key);

        let barrier = Arc::new(Barrier::new(8));
        let mut handles = Vec::new();

        for _ in 0..8 {
            let barrier = Arc::clone(&barrier);
            handles.push(thread::spawn(move || {
                barrier.wait();
                try_claim_message_entries_backfill(db_key).unwrap()
            }));
        }

        let winners = handles.into_iter().map(|handle| handle.join().unwrap()).filter(|claimed| *claimed).count();

        assert_eq!(winners, 1, "only one thread should claim the backfill slot");

        finish_message_entries_backfill(db_key, false).unwrap();
        clear_message_entries_backfill_state_for_tests(db_key);
    }

    #[test]
    fn backfill_claim_can_retry_after_completion() {
        let db_key = "/tmp/test-claim-retry.db";
        clear_message_entries_backfill_state_for_tests(db_key);

        assert!(try_claim_message_entries_backfill(db_key).unwrap());
        finish_message_entries_backfill(db_key, false).unwrap();
        assert!(try_claim_message_entries_backfill(db_key).unwrap());

        finish_message_entries_backfill(db_key, true).unwrap();
        assert!(try_claim_message_entries_backfill(db_key).unwrap());

        clear_message_entries_backfill_state_for_tests(db_key);
    }

    #[test]
    fn row_builder_emits_label_rows_for_message_targets() {
        let rows = build_rows_from_session_entries("/tmp/session.jsonl", &[message_entry("m1", "2026-04-09T10:01:00Z", "user", "hello world"), label_entry("l1", "2026-04-09T10:02:00Z", "m1", Some("important"))], false);

        assert_eq!(rows.len(), 2);
        let label_row = rows.iter().find(|row| row.source_type == "label").expect("label row");
        assert_eq!(label_row.entry_id, "m1");
        assert_eq!(label_row.role, "user");
        assert_eq!(label_row.content, "important");
        assert_eq!(label_row.timestamp, "2026-04-09T10:02:00+00:00");
    }

    #[test]
    fn row_builder_omits_cleared_labels() {
        let rows = build_rows_from_session_entries("/tmp/session.jsonl", &[message_entry("m1", "2026-04-09T10:01:00Z", "assistant", "hello world"), label_entry("l1", "2026-04-09T10:02:00Z", "m1", Some("bookmark")), label_entry("l2", "2026-04-09T10:03:00Z", "m1", Some("   "))], false);

        assert_eq!(rows.len(), 1);
        assert!(rows.iter().all(|row| row.source_type != "label"));
    }

    #[test]
    fn row_builder_skips_non_message_label_targets() {
        let rows = build_rows_from_session_entries("/tmp/session.jsonl", &[model_change_entry("mc1", "2026-04-09T10:01:00Z"), label_entry("l1", "2026-04-09T10:02:00Z", "mc1", Some("settings"))], false);

        assert!(rows.is_empty());
    }

    #[test]
    fn row_ids_are_session_scoped() {
        let entries = vec![message_entry("shared-id", "2026-04-09T10:01:00Z", "user", "hello")];
        let rows_a = build_rows_from_session_entries("/tmp/a.jsonl", &entries, false);
        let rows_b = build_rows_from_session_entries("/tmp/b.jsonl", &entries, false);

        assert_eq!(rows_a.len(), 1);
        assert_eq!(rows_b.len(), 1);
        assert_ne!(rows_a[0].row_id, rows_b[0].row_id);
        assert!(rows_a[0].row_id.contains("/tmp/a.jsonl"));
        assert!(rows_b[0].row_id.contains("/tmp/b.jsonl"));
    }
}
