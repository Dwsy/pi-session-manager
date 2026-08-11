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
    label: Option<String>,
}

const INSERT_CHUNK_SIZE: usize = 32;
const MESSAGE_INDEX_ROW_VERSION: &str = "4";
const MAX_TOOL_RESULT_INDEX_CHARS: usize = 16 * 1024;
const MESSAGE_INDEX_REBUILD_BATCH_SIZE: usize = 25;
const MESSAGE_INDEX_REFRESH_MIN_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);
const MESSAGE_INDEX_REBUILD_TARGET_KEY: &str = "row_version_rebuild_target";
const MESSAGE_INDEX_REBUILD_CURSOR_KEY: &str = "row_version_rebuild_cursor";

static MESSAGE_ENTRIES_BACKFILL_STATE: Mutex<Option<HashMap<String, MessageEntriesBackfillState>>> = Mutex::new(None);
static MESSAGE_ENTRIES_REFRESH_LAST_RUN: Mutex<Option<HashMap<String, std::time::Instant>>> = Mutex::new(None);

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

fn message_entries_refresh_is_throttled(db_key: &str) -> Result<bool, String> {
    let mut guard = MESSAGE_ENTRIES_REFRESH_LAST_RUN.lock().map_err(|_| "Failed to lock message index refresh throttle".to_string())?;
    let last_runs = guard.get_or_insert_with(HashMap::new);

    if let Some(last_run) = last_runs.get(db_key) {
        if last_run.elapsed() < MESSAGE_INDEX_REFRESH_MIN_INTERVAL {
            return Ok(true);
        }
    }

    Ok(false)
}

fn mark_message_entries_refresh(db_key: &str) -> Result<(), String> {
    let mut guard = MESSAGE_ENTRIES_REFRESH_LAST_RUN.lock().map_err(|_| "Failed to lock message index refresh throttle".to_string())?;
    guard.get_or_insert_with(HashMap::new).insert(db_key.to_string(), std::time::Instant::now());
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

#[cfg(test)]
fn clear_message_entries_refresh_throttle_for_tests(db_key: &str) {
    let mut guard = MESSAGE_ENTRIES_REFRESH_LAST_RUN.lock().expect("mutex poisoned");
    if let Some(last_runs) = guard.as_mut() {
        last_runs.remove(db_key);
        if last_runs.is_empty() {
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
    get_message_index_state(conn, "row_version")
}

fn set_message_index_row_version(conn: &Connection, version: &str) -> Result<(), String> {
    set_message_index_state(conn, "row_version", version)
}

fn get_message_index_state(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM message_index_state WHERE key = ?1", params![key], |row| row.get(0)).optional().map_err(|e| format!("Failed to read message index state {key}: {e}"))
}

fn set_message_index_state(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO message_index_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("Failed to persist message index state {key}: {e}"))?;
    Ok(())
}

fn delete_message_index_state(conn: &Connection, key: &str) -> Result<(), String> {
    conn.execute("DELETE FROM message_index_state WHERE key = ?1", params![key]).map_err(|e| format!("Failed to delete message index state {key}: {e}"))?;
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
            if message_entries_refresh_is_throttled(&db_key)? {
                debug!("[Migration] message_entries row-version rebuild throttled for db {}", db_key);
                return Ok(false);
            }
            let rebuilt_count = rebuild_message_entries_row_version_batch(conn)?;
            if rebuilt_count > 0 {
                mark_message_entries_refresh(&db_key)?;
            }
            return Ok(rebuilt_count > 0);
        }

        if message_entries_refresh_is_throttled(&db_key)? {
            debug!("[Migration] message_entries backfill throttled for db {}", db_key);
            return Ok(false);
        }
        let backfilled = backfill_missing_message_entries(conn)?;
        if backfilled > 0 {
            mark_message_entries_refresh(&db_key)?;
        }
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

#[derive(Clone, Debug)]
struct RebuildCursor {
    modified: String,
    path: String,
}

fn encode_rebuild_cursor(cursor: &RebuildCursor) -> String {
    format!("{}\n{}", cursor.modified, cursor.path)
}

fn decode_rebuild_cursor(raw: &str) -> Option<RebuildCursor> {
    let (modified, path) = raw.split_once('\n')?;
    if modified.is_empty() || path.is_empty() {
        return None;
    }
    Some(RebuildCursor { modified: modified.to_string(), path: path.to_string() })
}

fn ensure_rebuild_target(conn: &Connection) -> Result<(), String> {
    let target = get_message_index_state(conn, MESSAGE_INDEX_REBUILD_TARGET_KEY)?;
    if target.as_deref() == Some(MESSAGE_INDEX_ROW_VERSION) {
        return Ok(());
    }

    set_message_index_state(conn, MESSAGE_INDEX_REBUILD_TARGET_KEY, MESSAGE_INDEX_ROW_VERSION)?;
    delete_message_index_state(conn, MESSAGE_INDEX_REBUILD_CURSOR_KEY)?;
    Ok(())
}

fn get_rebuild_cursor(conn: &Connection) -> Result<Option<RebuildCursor>, String> {
    Ok(get_message_index_state(conn, MESSAGE_INDEX_REBUILD_CURSOR_KEY)?.and_then(|raw| decode_rebuild_cursor(&raw)))
}

fn list_message_entries_rebuild_batch(conn: &Connection, cursor: Option<&RebuildCursor>, limit: usize) -> Result<Vec<RebuildCursor>, String> {
    let limit = i64::try_from(limit).unwrap_or(i64::MAX);

    let rows = if let Some(cursor) = cursor {
        let mut stmt = conn
            .prepare(
                "SELECT path, modified
                 FROM sessions
                 WHERE message_count > 0
                   AND (modified < ?1 OR (modified = ?1 AND path > ?2))
                 ORDER BY modified DESC, path ASC
                 LIMIT ?3",
            )
            .map_err(|e| format!("Failed to prepare cursor message_entries rebuild listing: {e}"))?;

        let rows = stmt
            .query_map(params![&cursor.modified, &cursor.path, limit], |row| Ok(RebuildCursor { path: row.get(0)?, modified: row.get(1)? }))
            .map_err(|e| format!("Failed to query cursor message_entries rebuild listing: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect cursor message_entries rebuild listing: {e}"))?;
        rows
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT path, modified
                 FROM sessions
                 WHERE message_count > 0
                 ORDER BY modified DESC, path ASC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare message_entries rebuild listing: {e}"))?;

        let rows = stmt
            .query_map(params![limit], |row| Ok(RebuildCursor { path: row.get(0)?, modified: row.get(1)? }))
            .map_err(|e| format!("Failed to query message_entries rebuild listing: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect message_entries rebuild listing: {e}"))?;
        rows
    };

    Ok(rows)
}

fn rebuild_message_entries_row_version_batch(conn: &Connection) -> Result<usize, String> {
    ensure_rebuild_target(conn)?;
    let cursor = get_rebuild_cursor(conn)?;
    let batch = list_message_entries_rebuild_batch(conn, cursor.as_ref(), MESSAGE_INDEX_REBUILD_BATCH_SIZE)?;

    if batch.is_empty() {
        set_message_index_row_version(conn, MESSAGE_INDEX_ROW_VERSION)?;
        delete_message_index_state(conn, MESSAGE_INDEX_REBUILD_TARGET_KEY)?;
        delete_message_index_state(conn, MESSAGE_INDEX_REBUILD_CURSOR_KEY)?;
        info!("[Migration] message_entries row version {} rebuild complete", MESSAGE_INDEX_ROW_VERSION);
        return Ok(0);
    }

    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION").map_err(|e| format!("Failed to begin message_entries rebuild transaction: {e}"))?;
    let reached_end = batch.len() < MESSAGE_INDEX_REBUILD_BATCH_SIZE;

    let rebuild_result = (|| -> Result<usize, String> {
        let mut rebuilt_count = 0usize;
        for item in &batch {
            if !backing_store_exists(&item.path) {
                warn!("[Migration] Removing stale session cache entry for missing backing file: {}", item.path);
                if let Err(delete_err) = super::maintenance::delete_session(conn, &item.path) {
                    warn!("[Migration] Failed to remove stale session cache entry {}: {}", item.path, delete_err);
                }
                continue;
            }

            if let Err(e) = insert_message_entries_for_path(conn, &item.path) {
                warn!("[Migration] Failed to rebuild message_entries for {}: {}", item.path, e);
                continue; // Skip failed sessions instead of aborting entire rebuild
            }
            rebuilt_count += 1;
        }

        if reached_end {
            set_message_index_row_version(conn, MESSAGE_INDEX_ROW_VERSION)?;
            delete_message_index_state(conn, MESSAGE_INDEX_REBUILD_TARGET_KEY)?;
            delete_message_index_state(conn, MESSAGE_INDEX_REBUILD_CURSOR_KEY)?;
        } else if let Some(last) = batch.last() {
            set_message_index_state(conn, MESSAGE_INDEX_REBUILD_CURSOR_KEY, &encode_rebuild_cursor(last))?;
        }

        Ok(rebuilt_count)
    })();

    match rebuild_result {
        Ok(rebuilt_count) => {
            conn.execute_batch("COMMIT").map_err(|e| format!("Failed to commit message_entries rebuild transaction: {e}"))?;
            info!("[IO] message_entries row-version rebuild batch rebuilt={} scanned={} target_version={} cursor_set={}", rebuilt_count, batch.len(), MESSAGE_INDEX_ROW_VERSION, !reached_end);
            Ok(rebuilt_count)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

fn backfill_missing_message_entries(conn: &Connection) -> Result<usize, String> {
    let start = std::time::Instant::now();
    let mut stmt = conn
        .prepare(
            "SELECT s.path
             FROM sessions s
             WHERE s.message_count > 0
             AND s.modified > datetime('now', '-30 days')
             AND NOT EXISTS (
                 SELECT 1 FROM message_entries m WHERE m.session_path = s.path
             )
             ORDER BY s.modified DESC, s.path ASC
             LIMIT 50",
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

        if let Err(e) = insert_message_entries_for_path(conn, &path) {
            warn!("[Migration] Failed to backfill message_entries for {}: {}", path, e);
            continue; // Skip failed sessions instead of aborting entire batch
        }
        backfilled += 1;
    }

    let elapsed = start.elapsed();
    info!("[IO] backfill_missing_message_entries backfilled={} elapsed={:?}", backfilled, elapsed);
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

pub fn drop_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ai", []).map_err(|e| format!("Failed to drop trigger message_entries_ai: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ad", []).map_err(|e| format!("Failed to drop trigger message_entries_ad: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_au", []).map_err(|e| format!("Failed to drop trigger message_entries_au: {e}"))?;
    Ok(())
}

pub fn create_message_entries_triggers(conn: &Connection) -> Result<(), String> {
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

pub fn rebuild_message_fts_index(conn: &Connection) -> Result<(), String> {
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

fn truncate_index_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect()
}

fn build_rows_from_session_entries(session_path: &str, entries: &[SessionEntry], include_thinking: bool) -> Vec<MessageEntryRow> {
    let mut rows = Vec::new();
    let mut message_roles_by_entry_id = HashMap::new();
    let labels = resolve_labels(entries);

    for entry in entries {
        let Some(message) = entry.message.as_ref() else {
            continue;
        };
        let is_dialogue = message.role == "user" || message.role == "assistant";
        let is_tool_result = message.role == "toolResult";
        if !is_dialogue && !is_tool_result {
            continue;
        }

        message_roles_by_entry_id.insert(entry.id.clone(), message.role.clone());
        let entry_label = labels.get(&entry.id).map(|l| l.text.clone());

        let (visible_text, thinking_text) = extract_message_segments(message, include_thinking);
        let visible_text = if is_tool_result { visible_text.map(|text| truncate_index_text(&text, MAX_TOOL_RESULT_INDEX_CHARS)) } else { visible_text };
        let timestamp = entry.timestamp.to_rfc3339();
        let source_type = if is_tool_result { "tool_result" } else { message.role.as_str() };

        // Include labels and compact tool metadata in the indexed text while
        // keeping raw tool output bounded to avoid pathological FTS rows.
        let tool_prefix = if is_tool_result {
            let tool_name = message.tool_name.as_deref().unwrap_or("tool");
            if message.is_error.unwrap_or(false) {
                format!("[tool:{tool_name} error] ")
            } else {
                format!("[tool:{tool_name}] ")
            }
        } else {
            String::new()
        };
        let search_content = match (&visible_text, &entry_label) {
            (Some(text), Some(label)) => format!("{tool_prefix}[{}] {}", label, text),
            (None, Some(label)) => format!("{tool_prefix}[{}]", label),
            (Some(text), None) => format!("{tool_prefix}{text}"),
            (None, None) => tool_prefix,
        };

        rows.push(MessageEntryRow {
            row_id: build_row_id(session_path, &entry.id, source_type),
            entry_id: entry.id.clone(),
            session_path: session_path.to_string(),
            role: message.role.clone(),
            source_type: source_type.to_string(),
            content: visible_text.clone().unwrap_or_default(),
            search_text: crate::utils::normalize_search_text(&search_content),
            timestamp: timestamp.clone(),
            label: entry_label.clone(),
        });

        if is_dialogue {
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
                    label: entry_label,
                });
            }
        }
    }

    for (target_id, resolved_label) in labels {
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
            label: None,
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
                let base = index * 9;
                format!("(?{}, ?{}, ?{}, ?{}, ?{}, ?{}, ?{}, ?{}, ?{})", base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, base + 7, base + 8, base + 9)
            })
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!("INSERT OR REPLACE INTO message_entries (id, entry_id, session_path, role, source_type, content, search_text, timestamp, label) VALUES {values_sql}");

        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(chunk.len() * 9);
        for row in chunk {
            params.push(&row.row_id);
            params.push(&row.entry_id);
            params.push(&row.session_path);
            params.push(&row.role);
            params.push(&row.source_type);
            params.push(&row.content);
            params.push(&row.search_text);
            params.push(&row.timestamp);
            params.push(&row.label);
        }

        conn.execute(&sql, params.as_slice()).map_err(|e| format!("Failed to bulk insert message entries: {e}"))?;
    }

    Ok(())
}

fn insert_message_entries_for_path(conn: &Connection, session_path: &str) -> Result<(), String> {
    let start = std::time::Instant::now();
    let include_thinking = load_include_thinking_in_search();
    let entries = crate::domain::casr_min::bridge_ops::parse_session_entries_from_path(Path::new(session_path))?;
    let rows = build_rows_from_session_entries(session_path, &entries, include_thinking);
    delete_message_entries_for_session(conn, session_path)?;
    insert_message_entries_rows(conn, &rows)?;
    let elapsed = start.elapsed();
    info!("[IO] insert_message_entries_for_path path={} entries={} rows={} elapsed={:?}", session_path, entries.len(), rows.len(), elapsed);
    Ok(())
}

/// Self-contained bulk insert: drops triggers → delete+insert → rebuild FTS → recreate triggers.
/// Do NOT call when triggers are already dropped (e.g. inside scanner bulk path) —
/// use insert_message_entries_rows + rebuild at caller level instead.
pub fn bulk_insert_message_entries_for_path(conn: &Connection, session_path: &str) -> Result<(), String> {
    let start = std::time::Instant::now();
    let include_thinking = load_include_thinking_in_search();
    let entries = crate::domain::casr_min::bridge_ops::parse_session_entries_from_path(Path::new(session_path))?;
    let rows = build_rows_from_session_entries(session_path, &entries, include_thinking);

    // Drop triggers to avoid per-row FTS sync during bulk insert
    drop_message_entries_triggers(conn)?;
    delete_message_entries_for_session(conn, session_path)?;
    insert_message_entries_rows(conn, &rows)?;
    // Rebuild FTS index from content table (single pass, much faster than per-row triggers)
    rebuild_message_fts_index(conn)?;
    // Recreate triggers for ongoing incremental updates
    create_message_entries_triggers(conn)?;

    let elapsed = start.elapsed();
    info!("[IO] bulk_insert_message_entries_for_path path={} entries={} rows={} elapsed={:?}", session_path, entries.len(), rows.len(), elapsed);
    Ok(())
}

/// Self-contained bulk upsert: drops triggers → delete+insert → rebuild FTS → recreate triggers.
/// Do NOT call when triggers are already dropped (e.g. inside scanner bulk path).
pub fn bulk_upsert_message_entries(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    if !message_entries_table_exists(conn)? {
        return Ok(());
    }
    let include_thinking = load_include_thinking_in_search();
    let rows = build_rows_from_session_entries(session_path, entries, include_thinking);

    drop_message_entries_triggers(conn)?;
    delete_message_entries_for_session(conn, session_path)?;
    insert_message_entries_rows(conn, &rows)?;
    rebuild_message_fts_index(conn)?;
    create_message_entries_triggers(conn)?;

    debug!("Bulk upserted {} message entry rows for session: {}", rows.len(), session_path);
    Ok(())
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

    let start = std::time::Instant::now();
    let include_thinking = load_include_thinking_in_search();
    let rows = build_rows_from_session_entries(session_path, entries, include_thinking);
    insert_message_entries_rows(conn, &rows)?;
    let elapsed = start.elapsed();

    crate::core::io_trace::trace_db("append_entries", session_path, rows.len(), elapsed);
    debug!("Appended {} message entry rows for session: {}", rows.len(), session_path);
    Ok(())
}

/// Update labels for existing message entries when new label entries are discovered.
/// This handles the case where a label entry targets an already-indexed message.
pub fn update_labels_for_entries(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    if !message_entries_table_exists(conn)? {
        return Ok(());
    }

    let labels = crate::domain::pi_session::resolve_labels(entries);
    if labels.is_empty() {
        return Ok(());
    }

    let start = std::time::Instant::now();
    let mut updated = 0;

    for (target_id, resolved_label) in &labels {
        // Update all rows for this entry_id (message, thinking, etc.)
        let rows_affected = conn.execute("UPDATE message_entries SET label = ?1 WHERE session_path = ?2 AND entry_id = ?3", rusqlite::params![resolved_label.text, session_path, target_id]).map_err(|e| format!("Failed to update label for entry {}: {e}", target_id))?;
        updated += rows_affected;
    }

    let elapsed = start.elapsed();
    if updated > 0 {
        debug!("Updated labels for {} rows in session: {} ({:?})", updated, session_path, elapsed);
    }
    Ok(())
}

/// Sync message entries incrementally: only delete removed entries and insert new ones.
/// This avoids the expensive delete-all + reinsert-all pattern.
///
/// Assumes JSONL append-only semantics: existing entries are never modified,
/// only new entries are appended. If a session file is rewritten (e.g., via
/// `pi session edit`), stale content may persist until a full rescan.
/// Sync message entries: delete stale + insert new rows in message_entries.
/// FTS sync depends on trigger state: if triggers exist, FTS is updated per-row;
/// if triggers are dropped (bulk mode), caller must rebuild FTS after.
pub fn sync_message_entries(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    if !message_entries_table_exists(conn)? {
        return Ok(());
    }
    sync_message_entries_inner(conn, session_path, entries)
}

/// Alias for sync_message_entries. Use when caller has explicitly dropped FTS triggers
/// and will rebuild FTS after all sessions are synced (scanner bulk path).
pub fn bulk_sync_message_entries(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    sync_message_entries(conn, session_path, entries)
}

/// Inner sync logic without FTS trigger management (used by both sync and bulk_sync)
fn sync_message_entries_inner(conn: &Connection, session_path: &str, entries: &[SessionEntry]) -> Result<(), String> {
    let start = std::time::Instant::now();
    let _total_entries = entries.len();

    let existing_ids: std::collections::HashSet<String> = {
        let mut stmt = conn.prepare("SELECT id FROM message_entries WHERE session_path = ?").map_err(|e| format!("Failed to prepare existing ids query: {e}"))?;
        let rows = stmt.query_map(params![session_path], |row| row.get::<_, String>(0)).map_err(|e| format!("Failed to query existing ids: {e}"))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let include_thinking = load_include_thinking_in_search();
    let new_rows = build_rows_from_session_entries(session_path, entries, include_thinking);
    let new_ids: std::collections::HashSet<&str> = new_rows.iter().map(|r| r.row_id.as_str()).collect();

    let ids_to_delete: Vec<&String> = existing_ids.iter().filter(|id| !new_ids.contains(id.as_str())).collect();
    if !ids_to_delete.is_empty() {
        for chunk in ids_to_delete.chunks(INSERT_CHUNK_SIZE) {
            let placeholders: Vec<String> = chunk.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
            let sql = format!("DELETE FROM message_entries WHERE id IN ({})", placeholders.join(", "));
            let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|id| *id as &dyn rusqlite::ToSql).collect();
            conn.execute(&sql, params.as_slice()).map_err(|e| format!("Failed to batch delete stale entries: {e}"))?;
        }
    }

    let rows_to_insert: Vec<&MessageEntryRow> = new_rows.iter().filter(|r| !existing_ids.contains(&r.row_id)).collect();
    if !rows_to_insert.is_empty() {
        for chunk in rows_to_insert.chunks(INSERT_CHUNK_SIZE) {
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
            conn.execute(&sql, params.as_slice()).map_err(|e| format!("Failed to batch insert new entries: {e}"))?;
        }
    }

    let elapsed = start.elapsed();
    if ids_to_delete.is_empty() && rows_to_insert.is_empty() {
        debug!("No changes to message entries for session: {}", session_path);
    } else {
        info!("[IO:sync_entries_inner] session={} total={} existing={} deleted={} inserted={} elapsed={:?}", session_path, _total_entries, existing_ids.len(), ids_to_delete.len(), rows_to_insert.len(), elapsed);
    }

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
            message: Some(crate::types::Message {
                role: role.to_string(),
                content: vec![crate::types::Content { content_type: "text".to_string(), id: None, name: None, arguments: None, text: Some(text.to_string()) }],
                tool_call_id: None,
                tool_name: None,
                is_error: None,
                model: None,
                provider: None,
                usage: None,
            }),
            target_id: None,
            label: None,
            name: None,
            provider: None,
            model_id: None,
        }
    }

    fn label_entry(id: &str, timestamp: &str, target_id: &str, label: Option<&str>) -> SessionEntry {
        SessionEntry { entry_type: "label".to_string(), id: id.to_string(), parent_id: None, timestamp: parse_test_timestamp(timestamp), message: None, target_id: Some(target_id.to_string()), label: label.map(ToString::to_string), name: None, provider: None, model_id: None }
    }

    fn model_change_entry(id: &str, timestamp: &str) -> SessionEntry {
        SessionEntry { entry_type: "model_change".to_string(), id: id.to_string(), parent_id: None, timestamp: parse_test_timestamp(timestamp), message: None, target_id: None, label: None, name: None, provider: None, model_id: None }
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
    fn message_entries_refresh_throttle_skips_immediate_repeat() {
        let db_key = "/tmp/test-refresh-throttle.db";
        clear_message_entries_refresh_throttle_for_tests(db_key);

        assert!(!message_entries_refresh_is_throttled(db_key).unwrap());
        mark_message_entries_refresh(db_key).unwrap();
        assert!(message_entries_refresh_is_throttled(db_key).unwrap());

        clear_message_entries_refresh_throttle_for_tests(db_key);
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
    fn row_builder_indexes_bounded_tool_results() {
        let oversized = "x".repeat(MAX_TOOL_RESULT_INDEX_CHARS + 100);
        let rows = build_rows_from_session_entries("/tmp/session.jsonl", &[message_entry("tool-1", "2026-04-09T10:01:00Z", "toolResult", &oversized)], false);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].source_type, "tool_result");
        assert_eq!(rows[0].role, "toolResult");
        assert_eq!(rows[0].content.chars().count(), MAX_TOOL_RESULT_INDEX_CHARS);
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
