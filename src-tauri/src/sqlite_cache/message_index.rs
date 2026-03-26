use super::deps::*;

pub(crate) static MESSAGE_ENTRIES_BACKFILL_ONCE: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn backfill_missing_message_entries(conn: &Connection) -> Result<(), String> {
    let db_key = conn
        .path()
        .map(|path| path.to_string())
        .unwrap_or_else(|| "<memory>".to_string());

    let already_done = {
        let guard = MESSAGE_ENTRIES_BACKFILL_ONCE
            .lock()
            .map_err(|_| "Failed to lock backfill once guard".to_string())?;
        guard
            .as_ref()
            .map(|seen| seen.contains(&db_key))
            .unwrap_or(false)
    };
    if already_done {
        debug!(
            "[Migration] message_entries backfill already completed for db {}, skipping duplicate trigger",
            db_key
        );
        return Ok(());
    }

    let sessions_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count sessions for message_entries backfill: {e}"))?;
    if sessions_count == 0 {
        return Ok(());
    }

    let indexed_sessions_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT session_path) FROM message_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| {
            format!("Failed to count indexed sessions for message_entries backfill: {e}")
        })?;

    if indexed_sessions_count >= sessions_count {
        return Ok(());
    }

    let mut stmt = conn
        .prepare(
            "SELECT s.path
             FROM sessions s
             WHERE (
                 COALESCE(s.first_message, '') <> ''
                 OR COALESCE(s.last_message, '') <> ''
                 OR COALESCE(s.user_messages_text, '') <> ''
                 OR COALESCE(s.assistant_messages_text, '') <> ''
             )
             AND NOT EXISTS (
                 SELECT 1 FROM message_entries m WHERE m.session_path = s.path
             )
             ORDER BY s.modified DESC",
        )
        .map_err(|e| {
            format!("Failed to prepare missing session paths for message_entries backfill: {e}")
        })?;

    let missing_paths: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| {
            format!("Failed to query missing session paths for message_entries backfill: {e}")
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            format!("Failed to collect missing session paths for message_entries backfill: {e}")
        })?;

    if missing_paths.is_empty() {
        return Ok(());
    }

    info!(
        "[Migration] message_entries indexed sessions {}/{}. Backfilling {} missing sessions...",
        indexed_sessions_count,
        sessions_count,
        missing_paths.len()
    );

    let mut backfilled = 0usize;
    for path in &missing_paths {
        let session = SessionInfo {
            path: path.clone(),
            id: String::new(),
            cwd: String::new(),
            name: None,
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 0,
            first_message: String::new(),
            all_messages_text: String::new(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: String::new(),
            parent_session_path: None,
        };
        if let Err(e) = insert_message_entries(conn, &session) {
            if Path::new(path).exists() {
                warn!(
                    "[Migration] Failed to backfill missing message entries for session {}: {}",
                    path, e
                );
            } else {
                warn!(
                    "[Migration] Removing stale session cache entry for missing file: {}",
                    path
                );
                if let Err(delete_err) = super::maintenance::delete_session(conn, path) {
                    warn!(
                        "[Migration] Failed to remove stale session cache entry {}: {}",
                        path, delete_err
                    );
                }
            }
        } else {
            backfilled += 1;
        }
    }

    info!(
        "[Migration] Backfilled message entries for {} missing sessions",
        backfilled
    );

    let mut guard = MESSAGE_ENTRIES_BACKFILL_ONCE
        .lock()
        .map_err(|_| "Failed to lock backfill once guard".to_string())?;
    guard.get_or_insert_with(HashSet::new).insert(db_key);

    Ok(())
}

pub fn ensure_message_fts_schema(conn: &Connection) -> Result<(), String> {
    // Check and migrate message_entries schema: add any missing columns (non-destructive)
    let mut stmt = conn
        .prepare("PRAGMA table_info(message_entries)")
        .map_err(|e| format!("Failed to query message_entries schema: {e}"))?;
    let me_columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| format!("Failed to read message_entries columns: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message_entries columns: {e}"))?;
    let required_me_columns = [
        "id",
        "entry_id",
        "session_path",
        "role",
        "source_type",
        "content",
        "timestamp",
    ];
    let mut migrated = false;
    for &col in &required_me_columns {
        if !me_columns.contains(&col.to_string()) {
            warn!(
                "[Migration] message_entries missing column '{}', adding...",
                col
            );
            let sql = format!("ALTER TABLE message_entries ADD COLUMN {col}");
            conn.execute(&sql, [])
                .map_err(|e| format!("Failed to add column {col}: {e}"))?;
            migrated = true;
        }
    }
    if migrated {
        info!("[Migration] message_entries schema updated by adding missing columns");
    } else {
        debug!("[Schema] message_entries columns OK: {:?}", me_columns);
    }

    // Ensure message_fts exists with correct schema (no triggers needed for content-bearing FTS5)
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_fts'")
        .map_err(|e| format!("Failed to check message_fts existence: {e}"))?;
    let fts_exists = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_fts"))
        .unwrap_or(false);

    if !fts_exists {
        info!("[FTS] Creating message_fts virtual table");
        create_message_fts5(conn)?;
        rebuild_message_fts_index(conn)?;
    } else {
        // Check if FTS has required columns
        let mut stmt = conn
            .prepare("PRAGMA table_info(message_fts)")
            .map_err(|e| format!("Failed to query message_fts schema: {e}"))?;
        let fts_columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to read message_fts columns: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect message_fts columns: {e}"))?;
        let required_fts_columns = ["session_path", "role", "source_type", "content"];
        let fts_has_all = required_fts_columns
            .iter()
            .all(|&col| fts_columns.contains(&col.to_string()));

        if !fts_has_all {
            error!("[Migration] message_fts schema incomplete. Has columns: {:?}. Recreating virtual table...", fts_columns);
            conn.execute("DROP TABLE IF EXISTS message_fts", [])
                .map_err(|e| format!("Failed to drop old message_fts: {e}"))?;
            create_message_fts5(conn)?;
            rebuild_message_fts_index(conn)?;
            // Index will be automatically rebuilt from message_entries content.
            info!("[Migration] Recreated message_fts virtual table");
        } else {
            debug!("[Schema] message_fts columns OK: {:?}", fts_columns);
            // Check if it's using auto-sync with content='message_entries'
            let mut stmt_sql = conn
                .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='message_fts'")
                .map_err(|e| format!("Failed to query message_fts definition: {e}"))?;
            let sql: String = stmt_sql
                .query_row([], |row| row.get(0))
                .map_err(|e| format!("Failed to read message_fts sql: {e}"))?;
            // Detect if content='message_entries' is present
            let is_auto_sync = sql.contains("content='message_entries'")
                || sql.contains("content=\"message_entries\"");
            if !is_auto_sync {
                error!(
                    "[Migration] message_fts is manual (no content=). Converting to auto-sync..."
                );
                conn.execute("DROP TABLE IF EXISTS message_fts", [])
                    .map_err(|e| format!("Failed to drop manual message_fts: {e}"))?;
                create_message_fts5(conn)?;
                rebuild_message_fts_index(conn)?;
                // Index will be automatically rebuilt from message_entries content.
                info!("[Migration] Converted message_fts to auto-sync");
            } else {
                debug!("[Schema] message_fts already auto-sync");
            }
        }
    }

    // Ensure triggers exist to keep message_fts in sync with message_entries.
    create_message_entries_triggers(conn)?;

    if let Err(e) = backfill_missing_message_entries(conn) {
        error!(
            "[Migration] Failed to backfill missing message entries: {}",
            e
        );
    }

    Ok(())
}

pub(crate) fn drop_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    // Drop legacy manual triggers; with content='message_entries' auto-sync, they are not needed.
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ai", [])
        .map_err(|e| format!("Failed to drop trigger message_entries_ai: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ad", [])
        .map_err(|e| format!("Failed to drop trigger message_entries_ad: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_au", [])
        .map_err(|e| format!("Failed to drop trigger message_entries_au: {e}"))?;
    Ok(())
}

fn create_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    // Insert trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_ai AFTER INSERT ON message_entries BEGIN
         INSERT INTO message_fts(rowid, session_path, role, source_type, content)
         VALUES (new.rowid, new.session_path, new.role, new.source_type, new.content); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_ai: {e}"))?;

    // Delete trigger (use 'delete' command)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_ad AFTER DELETE ON message_entries BEGIN
         INSERT INTO message_fts(message_fts, rowid, session_path, role, source_type, content)
         VALUES('delete', old.rowid, old.session_path, old.role, old.source_type, old.content); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_ad: {e}"))?;

    // Update trigger (delete old, insert new)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_au AFTER UPDATE ON message_entries BEGIN
         INSERT INTO message_fts(message_fts, rowid, session_path, role, source_type, content)
         VALUES('delete', old.rowid, old.session_path, old.role, old.source_type, old.content);
         INSERT INTO message_fts(rowid, session_path, role, source_type, content)
         VALUES (new.rowid, new.session_path, new.role, new.source_type, new.content); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_au: {e}"))?;

    debug!("[FTS] Created message_entries sync triggers");
    Ok(())
}

fn create_message_fts5(conn: &Connection) -> Result<(), String> {
    // Create virtual FTS5 table that is automatically maintained by SQLite
    // because it specifies content='message_entries'. No triggers needed.
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
            session_path UNINDEXED,
            role,
            source_type,
            content,
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

fn rebuild_message_fts_index(conn: &Connection) -> Result<(), String> {
    info!("[FTS] Rebuilding message_fts index from message_entries...");
    conn.execute("INSERT INTO message_fts(message_fts) VALUES('rebuild')", [])
        .map_err(|e| format!("Failed to rebuild FTS index: {e}"))?;
    Ok(())
}

// ============ Message-level FTS support ============

/// Delete all message entries for a session (used before re-inserting)
pub fn delete_message_entries_for_session(
    conn: &Connection,
    session_path: &str,
) -> Result<(), String> {
    debug!(
        "[Delete] Attempting to delete message entries for session: {}",
        session_path
    );

    // Check if message_entries table exists
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'")
        .map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists: bool = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries"))
        .unwrap_or(false);

    if !exists {
        debug!("[Delete] message_entries table does not exist, skipping delete");
        return Ok(());
    }

    // Validate schema has all required columns before attempting DELETE
    let mut col_stmt = conn
        .prepare("PRAGMA table_info(message_entries)")
        .map_err(|e| format!("Failed to query message_entries schema: {e}"))?;
    let column_names: Vec<String> = col_stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| format!("Failed to read message_entries column names: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message_entries column names: {e}"))?;

    let required = ["id", "session_path", "role", "content", "timestamp"];
    let has_all = required
        .iter()
        .all(|&col| column_names.contains(&col.to_string()));

    if !has_all {
        error!("[Delete] message_entries schema incomplete. Columns: {:?}. Required: {:?}. Triggering migration...",
            column_names, required);
        ensure_message_fts_schema(conn)?;
        // Retry after migration
        let mut col_stmt2 = conn
            .prepare("PRAGMA table_info(message_entries)")
            .map_err(|e| format!("Failed to prepare PRAGMA after migration: {e}"))?;
        let columns2: Vec<String> = col_stmt2
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns after migration: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns after migration: {e}"))?;
        if !required
            .iter()
            .all(|&col| columns2.contains(&col.to_string()))
        {
            return Err(format!(
                "message_entries schema still incomplete after migration: {columns2:?}"
            ));
        }
        debug!("[Delete] Schema migration successful, retrying delete");
        return delete_message_entries_for_session(conn, session_path);
    }

    // Debug logging
    if cfg!(debug_assertions) {
        debug!("[Delete] message_entries schema OK: {:?}", column_names);
    }

    match conn.execute(
        "DELETE FROM message_entries WHERE session_path = ?",
        params![session_path],
    ) {
        Ok(_) => {
            debug!(
                "[Delete] Deleted message entries for session: {}",
                session_path
            );
        }
        Err(e) => {
            let err_str = format!("{e:?}");
            error!(
                "[Delete] Failed to delete message entries for session '{}': {:?} (code: {:?})",
                session_path,
                e,
                e.sqlite_error_code()
            );

            // Always attempt recovery via migration, then retry
            error!("[Delete] Attempting schema migration recovery...");
            if let Err(migrate_err) = ensure_message_fts_schema(conn) {
                error!("[Delete] Migration recovery failed: {}", migrate_err);
            } else if let Ok(count) = conn.execute(
                "DELETE FROM message_entries WHERE session_path = ?",
                params![session_path],
            ) {
                debug!("[Delete] Recovered: deleted {} rows", count);
                return Ok(());
            }

            return Err(format!("Failed to delete message entries: {err_str}"));
        }
    }
    Ok(())
}

fn load_include_thinking_in_search() -> bool {
    crate::settings_store::get::<Value>("app_settings")
        .ok()
        .flatten()
        .and_then(|settings| settings.get("search").cloned())
        .and_then(|search| {
            search
                .get("includeThinkingInSearch")
                .and_then(Value::as_bool)
        })
        .unwrap_or(false)
}

fn build_message_index_rows(
    entry: &Value,
    session_path: &str,
    include_thinking: bool,
) -> Vec<(String, String, String, String, String, String, String)> {
    let Some(message) = entry.get("message") else {
        return vec![];
    };

    let role = message
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if role != "user" && role != "assistant" {
        return vec![];
    }

    let entry_id = entry
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if entry_id.is_empty() {
        return vec![];
    }

    let timestamp = entry
        .get("timestamp")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    extract_index_segments(entry, include_thinking)
        .into_iter()
        .map(|(source_type, content)| {
            (
                format!("{entry_id}:{source_type}"),
                entry_id.clone(),
                session_path.to_string(),
                role.clone(),
                source_type,
                content,
                timestamp.clone(),
            )
        })
        .collect()
}

/// Insert message entries from a session file into message_entries table
pub fn insert_message_entries(conn: &Connection, session: &SessionInfo) -> Result<(), String> {
    use serde_json::Value;
    use std::io::BufReader;

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'")
        .map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists: bool = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries"))
        .unwrap_or(false);

    if !exists {
        return Ok(());
    }

    let include_thinking = load_include_thinking_in_search();
    let file = fs::File::open(&session.path)
        .map_err(|e| format!("Failed to open file for message entries: {e}"))?;
    let reader = BufReader::new(file);

    let mut inserted_count = 0;
    for line_result in reader.lines() {
        let line: String = line_result.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<Value>(&line) {
            for (id, entry_id, session_path, role, source_type, content, timestamp) in
                build_message_index_rows(&entry, &session.path, include_thinking)
            {
                conn.execute(
                    "INSERT OR REPLACE INTO message_entries (id, entry_id, session_path, role, source_type, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![id, entry_id, session_path, role, source_type, content, timestamp],
                )
                .map_err(|e| format!("Failed to insert message entry (session: {}, row: {}): {}", session.path, id, e))?;
                inserted_count += 1;
            }
        }
    }

    debug!(
        "Inserted {} message entries for session: {}",
        inserted_count, session.path
    );
    Ok(())
}

/// Upsert message entries into message_entries table from a pre-parsed list.
/// This is more efficient than insert_message_entries because it avoids re-reading the session file.
/// Callers are responsible for clearing stale rows before invoking this helper.
pub fn upsert_message_entries(
    conn: &Connection,
    session_path: &str,
    entries: &[SessionEntry],
) -> Result<(), String> {
    struct MessageEntryRow {
        row_id: String,
        entry_id: String,
        role: String,
        source_type: String,
        content: String,
        timestamp: String,
    }

    const INSERT_CHUNK_SIZE: usize = 32;

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'")
        .map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists: bool = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries"))
        .unwrap_or(false);

    if !exists {
        return Ok(());
    }

    drop(stmt);

    let include_thinking = load_include_thinking_in_search();
    let mut rows = Vec::new();

    for entry in entries {
        let Some(ref msg) = entry.message else {
            continue;
        };

        let mut visible_parts = Vec::new();
        let mut thinking_parts = Vec::new();
        for item in &msg.content {
            match item.content_type.as_str() {
                "thinking" => {
                    if include_thinking {
                        if let Some(text) = item.text.as_deref() {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                thinking_parts.push(trimmed.to_string());
                            }
                        }
                    }
                }
                _ => {
                    if let Some(text) = item.text.as_deref() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            visible_parts.push(trimmed.to_string());
                        }
                    }
                }
            }
        }

        let mut segments = Vec::new();
        if !visible_parts.is_empty() {
            segments.push((msg.role.clone(), visible_parts.join("\n")));
        }
        if include_thinking && !thinking_parts.is_empty() {
            segments.push(("thinking".to_string(), thinking_parts.join("\n")));
        }

        let timestamp = entry.timestamp.to_rfc3339();
        for (source_type, content) in segments {
            rows.push(MessageEntryRow {
                row_id: format!("{}:{}", entry.id, source_type),
                entry_id: entry.id.clone(),
                role: msg.role.clone(),
                source_type,
                content,
                timestamp: timestamp.clone(),
            });
        }
    }

    for chunk in rows.chunks(INSERT_CHUNK_SIZE) {
        let values_sql = (0..chunk.len())
            .map(|index| {
                let base = index * 7;
                format!(
                    "(?{}, ?{}, ?{}, ?{}, ?{}, ?{}, ?{})",
                    base + 1,
                    base + 2,
                    base + 3,
                    base + 4,
                    base + 5,
                    base + 6,
                    base + 7
                )
            })
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "INSERT OR REPLACE INTO message_entries (id, entry_id, session_path, role, source_type, content, timestamp) VALUES {values_sql}"
        );

        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(chunk.len() * 7);
        for row in chunk {
            params.push(&row.row_id);
            params.push(&row.entry_id);
            params.push(&session_path);
            params.push(&row.role);
            params.push(&row.source_type);
            params.push(&row.content);
            params.push(&row.timestamp);
        }

        conn.execute(&sql, params.as_slice())
            .map_err(|e| format!("Failed to bulk insert message entries for {}: {}", session_path, e))?;
    }

    debug!(
        "Upserted {} message entry rows for session: {}",
        rows.len(),
        session_path
    );
    Ok(())
}

/// Search message-level FTS5 index and return matching message entries
/// Returns (entry_id, session_path, role, snippet, timestamp, rank)
#[allow(clippy::type_complexity)]
pub fn search_message_fts(
    conn: &Connection,
    query: &str,
    role_filter: Option<&str>,
    limit: usize,
) -> Result<Vec<(String, String, String, String, String, f32)>, String> {
    // Escape and treat query as a literal phrase for FTS5 MATCH
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    // Escape double quotes and backslashes per FTS5 requirements
    let mut escaped = String::new();
    for ch in trimmed.chars() {
        match ch {
            '"' => escaped.push_str("\"\""),
            '\\' => escaped.push_str("\\\\"),
            _ => escaped.push(ch),
        }
    }
    // Wrap in double quotes to match as a phrase
    let fts_query = format!("\"{escaped}\"");

    // Build role filter condition
    let role_condition = match role_filter {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };

    let sql = format!(
        "SELECT \
            m.entry_id, \
            m.session_path, \
            m.role, \
            snippet(message_fts, 3, '<b>', '</b>', '...', 80) as snippet, \
            m.timestamp, \
            bm25(message_fts) as rank \
         FROM message_entries m \
         JOIN message_fts ON m.rowid = message_fts.rowid \
         WHERE message_fts MATCH ? \
         AND {role_condition} \
         ORDER BY m.rowid \
         LIMIT ?"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare message FTS query: {e}"))?;

    let rows = stmt
        .query_map(params![fts_query, limit as i64], |row| {
            Ok((
                row.get::<_, String>(0)?, // entry_id
                row.get::<_, String>(1)?, // session_path
                row.get::<_, String>(2)?, // role
                row.get::<_, String>(3)?, // snippet with <b> tags
                row.get::<_, String>(4)?, // timestamp
                row.get::<_, f32>(5)?,    // rank
            ))
        })
        .map_err(|e| format!("Failed to query message FTS: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message FTS results: {e}"))?;

    Ok(rows)
}
