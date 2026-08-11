use super::deps::*;
use super::schema::{set_schema_version, LATEST_SCHEMA_VERSION};

/// Run migrations from current_version+1 up to LATEST_SCHEMA_VERSION.
pub(crate) fn apply_migrations(conn: &Connection, from_version: i64) -> Result<(), String> {
    let mut current = from_version;
    while current < LATEST_SCHEMA_VERSION {
        current += 1;
        match current {
            1 => migration_1(conn)?,
            2 => migration_2(conn)?,
            3 => migration_3(conn)?,
            4 => migration_4(conn)?,
            5 => migration_5(conn)?,
            6 => migration_6(conn)?,
            7 => migration_7(conn)?,
            8 => migration_8(conn)?,
            9 => migration_9(conn)?,
            10 => migration_10(conn)?,
            11 => migration_11(conn)?,
            12 => migration_12(conn)?,
            13 => migration_13(conn)?,
            14 => migration_14(conn)?,
            15 => migration_15(conn)?,
            16 => migration_16(conn)?,
            17 => migration_17(conn)?,
            18 => migration_18(conn)?,
            19 => migration_19(conn)?,
            20 => migration_20(conn)?,
            _ => return Err(format!("Unknown migration version: {current}")),
        }
        // Update version after successful migration
        set_schema_version(conn, current)?;
    }
    Ok(())
}

/// Migration to version 1: adds columns that were previously added via ad-hoc ALTER TABLE.
fn migration_1(conn: &Connection) -> Result<(), String> {
    // Helper to check if a column exists in a table
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    // For sessions table
    if !column_exists(conn, "sessions", "last_message")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message TEXT", []).map_err(|e| format!("Failed to add last_message column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "last_message_role")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message_role TEXT", []).map_err(|e| format!("Failed to add last_message_role column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "user_messages_text")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN user_messages_text TEXT", []).map_err(|e| format!("Failed to add user_messages_text column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "assistant_messages_text")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN assistant_messages_text TEXT", []).map_err(|e| format!("Failed to add assistant_messages_text column: {e}"))?;
    }

    // For tags table (legacy only)
    let tags_table_exists = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tags'", [], |row| row.get::<_, i64>(0)).map(|count| count > 0).unwrap_or(false);

    if tags_table_exists && !column_exists(conn, "tags", "auto_rules")? {
        conn.execute("ALTER TABLE tags ADD COLUMN auto_rules TEXT", []).map_err(|e| format!("Failed to add auto_rules column: {e}"))?;
    }
    if tags_table_exists && !column_exists(conn, "tags", "parent_id")? {
        conn.execute("ALTER TABLE tags ADD COLUMN parent_id TEXT", []).map_err(|e| format!("Failed to add parent_id column: {e}"))?;
    }

    Ok(())
}

/// Migration to version 2: add performance indexes.
fn migration_2(conn: &Connection) -> Result<(), String> {
    // Composite index on session_path and timestamp for per-session ordering
    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp)", []).map_err(|e| format!("Migration 2 failed: {e}"))?;

    Ok(())
}

/// Migration to version 3: persist per-model token/cost usage in session_details_cache.
fn migration_3(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "session_details_cache", "model_usage_json")? {
        conn.execute("ALTER TABLE session_details_cache ADD COLUMN model_usage_json TEXT NOT NULL DEFAULT '{}'", []).map_err(|e| format!("Migration 3 failed adding model_usage_json: {e}"))?;
    }

    Ok(())
}

/// Migration to version 4: rebuild message search tables with normalized segment rows.
fn migration_4(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TABLE IF EXISTS message_fts", []).map_err(|e| format!("Migration 4 failed dropping message_fts: {e}"))?;
    conn.execute("DROP TABLE IF EXISTS message_entries", []).map_err(|e| format!("Migration 4 failed dropping message_entries: {e}"))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking', 'label')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Migration 4 failed creating message_entries: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)", []).map_err(|e| format!("Migration 4 failed creating session index: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id)", []).map_err(|e| format!("Migration 4 failed creating entry index: {e}"))?;
    Ok(())
}

/// Migration to version 5: add parent_session_path column for fork support.
fn migration_5(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "sessions", "parent_session_path")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN parent_session_path TEXT", []).map_err(|e| format!("Migration 5 failed adding parent_session_path: {e}"))?;
    }

    Ok(())
}

/// Migration to version 6: add turns column to subagent_meta_cache for @tintinweb/pi-subagents compatibility.
fn migration_6(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "subagent_meta_cache", "turns")? {
        conn.execute("ALTER TABLE subagent_meta_cache ADD COLUMN turns INTEGER NOT NULL DEFAULT 0", []).map_err(|e| format!("Migration 6 failed adding turns column: {e}"))?;
    }

    Ok(())
}

/// Migration to version 7: allow label-derived rows in message_entries.source_type.
fn migration_7(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TABLE IF EXISTS message_fts", []).map_err(|e| format!("Migration 7 failed dropping message_fts: {e}"))?;
    conn.execute("DROP TABLE IF EXISTS message_entries", []).map_err(|e| format!("Migration 7 failed dropping message_entries: {e}"))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking', 'label')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Migration 7 failed creating message_entries: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)", []).map_err(|e| format!("Migration 7 failed creating session index: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id)", []).map_err(|e| format!("Migration 7 failed creating entry index: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp)", []).map_err(|e| format!("Migration 7 failed creating session/timestamp index: {e}"))?;
    Ok(())
}

fn migration_8(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS scan_state (
            path TEXT PRIMARY KEY,
            backing_path TEXT NOT NULL,
            provider_slug TEXT NOT NULL,
            file_modified TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            last_scanned_at TEXT NOT NULL,
            last_parse_status TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Migration 8 failed creating scan_state: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scan_state_backing_path ON scan_state(backing_path)", []).map_err(|e| format!("Migration 8 failed creating backing_path index: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scan_state_provider_slug ON scan_state(provider_slug)", []).map_err(|e| format!("Migration 8 failed creating provider_slug index: {e}"))?;
    Ok(())
}

/// Migration to version 9: set all_messages_text to NULL for backward compatibility.
/// Column is retained but deprecated - message_entries + FTS5 are now the source of truth.
fn migration_9(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    // Set column to NULL instead of dropping - preserves schema for code still referencing it
    if column_exists(conn, "sessions", "all_messages_text")? {
        conn.execute("UPDATE sessions SET all_messages_text = NULL", []).map_err(|e| format!("Migration 9 failed nullifying all_messages_text: {e}"))?;
    }

    Ok(())
}

/// Migration to version 10: add append-read tracking columns to scan_state.
fn migration_10(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "scan_state", "read_offset")? {
        conn.execute("ALTER TABLE scan_state ADD COLUMN read_offset INTEGER NOT NULL DEFAULT 0", []).map_err(|e| format!("Migration 10 failed adding read_offset: {e}"))?;
    }
    if !column_exists(conn, "scan_state", "append_trust_count")? {
        conn.execute("ALTER TABLE scan_state ADD COLUMN append_trust_count INTEGER NOT NULL DEFAULT 0", []).map_err(|e| format!("Migration 10 failed adding append_trust_count: {e}"))?;
    }

    Ok(())
}

/// Migration to version 11: add search_text column for normalized FTS indexing.
fn migration_11(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "message_entries", "search_text")? {
        conn.execute("ALTER TABLE message_entries ADD COLUMN search_text TEXT NOT NULL DEFAULT ''", []).map_err(|e| format!("Migration 11 failed adding search_text: {e}"))?;
    }

    Ok(())
}

/// Migration to version 12: invalidate session_details_cache for stats recalculation
/// This clears model_usage_json and models_json so they get re-parsed with the new
/// provider/model separation logic. We do NOT touch token/cost fields to avoid
/// data loss when session files have been deleted.
fn migration_12(conn: &Connection) -> Result<(), String> {
    // Clear model_usage_json and models_json to force re-parsing
    // Token/cost fields are preserved so deleted-session stats survive
    conn.execute("UPDATE session_details_cache SET model_usage_json = '{}', models_json = '[]' WHERE model_usage_json != '{}' OR models_json != '[]'", []).map_err(|e| format!("Migration 12 failed clearing model cache: {e}"))?;

    Ok(())
}

fn migration_13(conn: &Connection) -> Result<(), String> {
    // Drop redundant indexes on message_entries to reduce DB size and IO.
    // - idx_message_entries_session is covered by idx_message_entries_session_time(session_path, timestamp)
    // - idx_message_entries_timestamp_julianday duplicates idx_message_entries_timestamp
    conn.execute("DROP INDEX IF EXISTS idx_message_entries_session", []).map_err(|e| format!("Migration 13 failed dropping session index: {e}"))?;
    conn.execute("DROP INDEX IF EXISTS idx_message_entries_timestamp_julianday", []).map_err(|e| format!("Migration 13 failed dropping julianday index: {e}"))?;
    Ok(())
}

/// Migration to version 14: create session_info_entries table for session_info JSONL entries.
/// This stores all session_info entries from JSONL files, enabling name history tracking.
fn migration_14(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS session_info_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            name TEXT NOT NULL,
            parent_id TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Migration 14 failed creating session_info_entries: {e}"))?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_session_info_entries_session ON session_info_entries(session_path)", []).map_err(|e| format!("Migration 14 failed creating session index: {e}"))?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_session_info_entries_timestamp ON session_info_entries(timestamp DESC)", []).map_err(|e| format!("Migration 14 failed creating timestamp index: {e}"))?;

    Ok(())
}

/// Migration to version 15: add label column to message_entries table.
/// This stores user-defined labels for specific entries (bookmarks, markers).
fn migration_15(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "message_entries", "label")? {
        conn.execute("ALTER TABLE message_entries ADD COLUMN label TEXT", []).map_err(|e| format!("Migration 15 failed adding label column: {e}"))?;
    }

    conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_label ON message_entries(label) WHERE label IS NOT NULL", []).map_err(|e| format!("Migration 15 failed creating label index: {e}"))?;

    Ok(())
}

/// Migration to version 16: force full re-scan by clearing all session data.
///
/// Old databases have stale session_details_cache (timestamp precision), sparse
/// message_entries (9580 for 4419 sessions), and empty user_messages_text.
/// Clearing these tables forces the next scan to classify every file as "new"
/// and fully re-parse all caches, message entries, and text columns.
///
/// Preserved tables: tags, session_tags, favorites, schema_version, message_index_state
fn migration_16(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM session_details_cache", []).map_err(|e| format!("Migration 16 failed clearing session_details_cache: {e}"))?;
    // message_fts is an FTS5 virtual table created lazily after migrations;
    // it may not exist yet on fresh DBs, so guard with existence check.
    let fts_exists: bool = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='message_fts'", [], |row| row.get::<_, i64>(0)).map(|c| c > 0).unwrap_or(false);
    if fts_exists {
        conn.execute("DELETE FROM message_fts", []).map_err(|e| format!("Migration 16 failed clearing message_fts: {e}"))?;
    }
    conn.execute("DELETE FROM message_entries", []).map_err(|e| format!("Migration 16 failed clearing message_entries: {e}"))?;
    conn.execute("DELETE FROM session_info_entries", []).map_err(|e| format!("Migration 16 failed clearing session_info_entries: {e}"))?;
    conn.execute("DELETE FROM subagent_meta_cache", []).map_err(|e| format!("Migration 16 failed clearing subagent_meta_cache: {e}"))?;
    conn.execute("DELETE FROM scan_state", []).map_err(|e| format!("Migration 16 failed clearing scan_state: {e}"))?;
    // sessions last — it has FK references from other tables we just cleared
    conn.execute("DELETE FROM sessions", []).map_err(|e| format!("Migration 16 failed clearing sessions: {e}"))?;

    Ok(())
}

/// Migration to version 17: add model column to sessions table.
/// This stores the model identifier (e.g. "anthropic/claude-sonnet-4-20250514")
/// extracted from the last message in each session.
fn migration_17(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt.query_map([], |row| row.get(1)).map_err(|e| format!("Failed to query columns for {table}: {e}"))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "sessions", "model")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN model TEXT", []).map_err(|e| format!("Migration 17 failed adding model column: {e}"))?;
    }

    Ok(())
}

/// Migration to version 18: add generic plugin record storage.
/// Plugin records hold extension-defined JSON payloads with FTS and declared index projections.
fn migration_18(conn: &Connection) -> Result<(), String> {
    super::plugin_records::ensure_plugin_records_schema(conn)
}

/// Migration to version 19: invalidate cached Claude Code / Codex message data.
///
/// The assistant-turn grouping fix (claude_code.rs / codex.rs) changes how
/// fragmented assistant turns are parsed — previously each fragment became its
/// own message; now they collapse into one. DBs populated before the fix still
/// hold the fragmented `message_entries`, stale `session_details_cache`, and
/// `scan_state` rows that prevent a re-parse (unmodified files look current).
///
/// We only touch Claude Code and Codex sessions (identified via scan_state's
/// provider_slug, stored hyphenated). Pi/other-provider caches are left intact.
/// Deleting scan_state forces the next scan to classify these files as
/// "no_scan_state" and re-parse them with the corrected parser, repopulating
/// message_entries and session_details_cache. The sessions row itself is kept
/// so the session doesn't vanish from the list before the rescan completes.
fn migration_19(conn: &Connection) -> Result<(), String> {
    // Collect paths of Claude Code / Codex sessions from scan_state.
    // provider_slug is stored hyphenated (e.g. "claude-code", "codex").
    let affected_paths: Vec<String> = {
        let scan_state_exists: bool = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='scan_state'", [], |row| row.get::<_, i64>(0)).map(|c| c > 0).unwrap_or(false);
        if !scan_state_exists {
            return Ok(());
        }
        let mut stmt = conn.prepare("SELECT path FROM scan_state WHERE provider_slug IN ('claude-code', 'codex')").map_err(|e| format!("Migration 19 failed preparing scan_state select: {e}"))?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| format!("Migration 19 failed querying scan_state paths: {e}"))?;
        let mut paths: Vec<String> = Vec::new();
        for row in rows {
            match row {
                Ok(path) => paths.push(path),
                Err(_) => continue,
            }
        }
        paths
    };

    if affected_paths.is_empty() {
        return Ok(());
    }

    // message_entries may not exist on fresh DBs that skipped earlier migrations;
    // guard with an existence check.
    let message_entries_exists: bool = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='message_entries'", [], |row| row.get::<_, i64>(0)).map(|c| c > 0).unwrap_or(false);
    if message_entries_exists {
        for chunk in affected_paths.chunks(500) {
            let placeholders = (0..chunk.len()).map(|i| format!("?{}", i + 1)).collect::<Vec<_>>().join(", ");
            let sql = format!("DELETE FROM message_entries WHERE session_path IN ({placeholders})");
            let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
            conn.execute(&sql, params.as_slice()).map_err(|e| format!("Migration 19 failed deleting message_entries: {e}"))?;
        }
    }

    // session_details_cache is keyed by path.
    let details_cache_exists: bool = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='session_details_cache'", [], |row| row.get::<_, i64>(0)).map(|c| c > 0).unwrap_or(false);
    if details_cache_exists {
        for chunk in affected_paths.chunks(500) {
            let placeholders = (0..chunk.len()).map(|i| format!("?{}", i + 1)).collect::<Vec<_>>().join(", ");
            let sql = format!("DELETE FROM session_details_cache WHERE path IN ({placeholders})");
            let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
            conn.execute(&sql, params.as_slice()).map_err(|e| format!("Migration 19 failed deleting session_details_cache: {e}"))?;
        }
    }

    // Drop scan_state rows so the next scan re-parses these files.
    for chunk in affected_paths.chunks(500) {
        let placeholders = (0..chunk.len()).map(|i| format!("?{}", i + 1)).collect::<Vec<_>>().join(", ");
        let sql = format!("DELETE FROM scan_state WHERE path IN ({placeholders})");
        let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        conn.execute(&sql, params.as_slice()).map_err(|e| format!("Migration 19 failed deleting scan_state: {e}"))?;
    }

    info!("[migration:19] invalidated {} Claude Code / Codex sessions for re-parse", affected_paths.len());
    Ok(())
}

/// Migration to version 20: allow bounded tool-result evidence in message_entries.
///
/// Preserve existing user/assistant rows while widening the CHECK constraints.
/// The content-synced FTS table and triggers are dropped before the table rebuild;
/// bootstrap calls ensure_message_fts_schema after versioned migrations, which
/// recreates them and rebuilds FTS from the preserved rows.
fn migration_20(conn: &Connection) -> Result<(), String> {
    let message_entries_exists: bool = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='message_entries'", [], |row| row.get::<_, i64>(0)).map(|count| count > 0).unwrap_or(false);

    if !message_entries_exists {
        conn.execute_batch(
            "CREATE TABLE message_entries (
                id TEXT PRIMARY KEY,
                entry_id TEXT NOT NULL,
                session_path TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'toolResult')),
                source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking', 'label', 'tool_result')),
                content TEXT NOT NULL,
                search_text TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL,
                label TEXT,
                FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id);
            CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp);
            CREATE INDEX IF NOT EXISTS idx_message_entries_label ON message_entries(label) WHERE label IS NOT NULL;",
        )
        .map_err(|e| format!("Migration 20 failed creating message_entries: {e}"))?;
        return Ok(());
    }

    conn.execute_batch(
        "BEGIN IMMEDIATE;
         DROP TRIGGER IF EXISTS message_entries_ai;
         DROP TRIGGER IF EXISTS message_entries_ad;
         DROP TRIGGER IF EXISTS message_entries_au;
         DROP TABLE IF EXISTS message_fts;
         ALTER TABLE message_entries RENAME TO message_entries_v19;
         CREATE TABLE message_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'toolResult')),
            source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking', 'label', 'tool_result')),
            content TEXT NOT NULL,
            search_text TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL,
            label TEXT,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
         );
         INSERT INTO message_entries (id, entry_id, session_path, role, source_type, content, search_text, timestamp, label)
         SELECT id, entry_id, session_path, role, source_type, content, search_text, timestamp, label
         FROM message_entries_v19;
         DROP TABLE message_entries_v19;
         CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id);
         CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp);
         CREATE INDEX IF NOT EXISTS idx_message_entries_label ON message_entries(label) WHERE label IS NOT NULL;
         COMMIT;",
    )
    .map_err(|e| format!("Migration 20 failed rebuilding message_entries constraints: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod migration_20_tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn widens_message_entry_constraints_without_losing_existing_rows() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute("CREATE TABLE sessions (path TEXT PRIMARY KEY)", []).expect("sessions table");
        conn.execute("INSERT INTO sessions(path) VALUES('/tmp/session.jsonl')", []).expect("session row");
        conn.execute_batch(
            "CREATE TABLE message_entries (
                id TEXT PRIMARY KEY,
                entry_id TEXT NOT NULL,
                session_path TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking', 'label')),
                content TEXT NOT NULL,
                search_text TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL,
                label TEXT,
                FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
            );
            INSERT INTO message_entries(id, entry_id, session_path, role, source_type, content, search_text, timestamp, label)
            VALUES('old', 'e1', '/tmp/session.jsonl', 'assistant', 'assistant', 'kept', 'kept', '2026-01-01T00:00:00Z', NULL);",
        )
        .expect("old schema");

        migration_20(&conn).expect("migration");

        let preserved: String = conn.query_row("SELECT content FROM message_entries WHERE id='old'", [], |row| row.get(0)).expect("preserved row");
        assert_eq!(preserved, "kept");
        conn.execute("INSERT INTO message_entries(id, entry_id, session_path, role, source_type, content, search_text, timestamp) VALUES('tool', 'e2', '/tmp/session.jsonl', 'toolResult', 'tool_result', 'compiler error', 'compiler error', '2026-01-01T00:00:01Z')", [])
            .expect("toolResult row allowed");
    }
}

#[cfg(test)]
mod migration_19_tests {
    use super::*;
    use rusqlite::Connection;

    /// Build the minimal schema migration_19 inspects (scan_state + message_entries +
    /// session_details_cache). FKs are omitted so we can insert rows without a sessions row.
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute(
            "CREATE TABLE scan_state (
                path TEXT PRIMARY KEY,
                backing_path TEXT NOT NULL,
                provider_slug TEXT NOT NULL,
                file_modified TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                last_scanned_at TEXT NOT NULL,
                last_parse_status TEXT NOT NULL,
                read_offset INTEGER NOT NULL DEFAULT 0,
                append_trust_count INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .expect("create scan_state");
        conn.execute(
            "CREATE TABLE message_entries (
                id TEXT PRIMARY KEY,
                entry_id TEXT NOT NULL,
                session_path TEXT NOT NULL,
                role TEXT NOT NULL,
                source_type TEXT NOT NULL,
                content TEXT NOT NULL,
                search_text TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL
            )",
            [],
        )
        .expect("create message_entries");
        conn.execute(
            "CREATE TABLE session_details_cache (
                path TEXT PRIMARY KEY,
                file_modified TEXT NOT NULL,
                user_messages INTEGER NOT NULL,
                assistant_messages INTEGER NOT NULL,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                cache_read_tokens INTEGER NOT NULL,
                cache_write_tokens INTEGER NOT NULL,
                input_cost REAL NOT NULL,
                output_cost REAL NOT NULL,
                cache_read_cost REAL NOT NULL,
                cache_write_cost REAL NOT NULL,
                models_json TEXT NOT NULL,
                model_usage_json TEXT NOT NULL DEFAULT '{}'
            )",
            [],
        )
        .expect("create session_details_cache");
        conn
    }

    fn count(conn: &Connection, table: &str, clause: &str) -> i64 {
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE {clause}");
        conn.query_row(&sql, [], |row| row.get::<_, i64>(0)).unwrap_or(0)
    }

    #[test]
    fn purges_claude_code_and_codex_sessions_only() {
        let conn = setup_test_db();

        // Claude Code + Codex sessions should be purged.
        for (path, slug) in [("/home/u/.claude/projects/abc/cc-1.jsonl", "claude-code"), ("/home/u/.codex/sessions/2026/01/01/codex-1.jsonl", "codex")] {
            conn.execute("INSERT INTO scan_state (path, backing_path, provider_slug, file_modified, file_size, last_scanned_at, last_parse_status) VALUES (?1, ?1, ?2, '2026-01-01', 100, '2026-01-01', 'ok')", params![path, slug]).unwrap();
            conn.execute("INSERT INTO message_entries (id, entry_id, session_path, role, source_type, content, timestamp) VALUES (?1, ?1, ?2, 'assistant', 'assistant', 'fragment', '2026-01-01')", params![format!("{path}-e1"), path]).unwrap();
            conn.execute(
                "INSERT INTO session_details_cache (path, file_modified, user_messages, assistant_messages, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost, cache_write_cost, models_json) VALUES (?1, '2026-01-01', 1, 1, 10, 20, 0, 0, 0, 0, 0, 0, '[]')",
                params![path],
            )
            .unwrap();
        }

        // A Pi session must be left untouched.
        let pi_path = "/home/u/.pi/agent/sessions/pi-1.jsonl";
        let _ = pi_path;
        conn.execute("INSERT INTO scan_state (path, backing_path, provider_slug, file_modified, file_size, last_scanned_at, last_parse_status) VALUES (?1, ?1, 'pi', '2026-01-01', 100, '2026-01-01', 'ok')", params![pi_path]).unwrap();
        conn.execute("INSERT INTO message_entries (id, entry_id, session_path, role, source_type, content, timestamp) VALUES (?1, ?1, ?2, 'user', 'user', 'hello', '2026-01-01')", params![format!("{pi_path}-e1"), pi_path]).unwrap();
        conn.execute(
            "INSERT INTO session_details_cache (path, file_modified, user_messages, assistant_messages, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost, cache_write_cost, models_json) VALUES (?1, '2026-01-01', 1, 0, 5, 0, 0, 0, 0, 0, 0, 0, '[]')",
            params![pi_path],
        )
        .unwrap();

        migration_19(&conn).expect("migration runs");

        // Claude/Codex: scan_state, message_entries, session_details_cache all gone.
        assert_eq!(count(&conn, "scan_state", "provider_slug IN ('claude-code', 'codex')"), 0, "claude/codex scan_state should be purged");
        assert_eq!(count(&conn, "message_entries", "session_path LIKE '%.claude/%' OR session_path LIKE '%.codex/%'"), 0, "claude/codex message_entries should be purged");
        assert_eq!(count(&conn, "session_details_cache", "path LIKE '%.claude/%' OR path LIKE '%.codex/%'"), 0, "claude/codex details cache should be purged");

        // Pi: untouched.
        assert_eq!(count(&conn, "scan_state", "provider_slug = 'pi'"), 1, "pi scan_state must survive");
        assert_eq!(count(&conn, "message_entries", "session_path LIKE '%.pi/%'"), 1, "pi message_entries must survive");
        assert_eq!(count(&conn, "session_details_cache", "path LIKE '%.pi/%'"), 1, "pi details cache must survive");
    }

    #[test]
    fn is_a_noop_when_scan_state_table_missing() {
        // Fresh DBs (e.g. brand new installs) may not have scan_state yet; the
        // migration must not error.
        let conn = Connection::open_in_memory().expect("open in-memory db");
        migration_19(&conn).expect("migration is a no-op without scan_state");
    }

    #[test]
    fn is_a_noop_when_no_claude_or_codex_sessions() {
        let conn = setup_test_db();
        // Only a Pi session.
        conn.execute("INSERT INTO scan_state (path, backing_path, provider_slug, file_modified, file_size, last_scanned_at, last_parse_status) VALUES ('/p/pi.jsonl', '/p/pi.jsonl', 'pi', '2026-01-01', 1, '2026-01-01', 'ok')", []).unwrap();
        migration_19(&conn).expect("migration runs cleanly");
        assert_eq!(count(&conn, "scan_state", "1=1"), 1, "pi row preserved");
    }
}
