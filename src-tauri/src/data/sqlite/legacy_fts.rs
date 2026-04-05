use super::deps::*;

fn init_fts5(conn: &Connection) -> Result<(), String> {
    // Check if we need to upgrade FTS5 table
    let mut stmt = conn
        .prepare("PRAGMA table_info(sessions_fts)")
        .map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if columns.is_empty() || !columns.contains(&"user_messages_text".to_string()) {
        full_rebuild_fts(conn)?;
    } else {
        // Table exists, ensure it is auto-sync (content='sessions') and triggers are removed
        let mut stmt_sql = conn
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions_fts'")
            .map_err(|e| e.to_string())?;
        let sql: String = stmt_sql
            .query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let is_auto_sync =
            sql.contains("content='sessions'") || sql.contains("content=\"sessions\"");
        if !is_auto_sync {
            // legacy manual FTS, rebuild
            full_rebuild_fts(conn)?;
        } else {
            // Auto-sync, but drop any leftover triggers from older versions
            drop_sessions_fts_triggers(conn)?;
        }
    }

    // Ensure triggers exist for sessions_fts to keep index in sync
    create_sessions_triggers(conn)?;

    Ok(())
}

pub(crate) fn drop_sessions_fts_triggers(conn: &Connection) -> Result<(), String> {
    // Drop legacy manual triggers; with content='sessions' auto-sync, they are not needed.
    conn.execute("DROP TRIGGER IF EXISTS sessions_ai", [])
        .map_err(|e| format!("Failed to drop trigger sessions_ai: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_ad", [])
        .map_err(|e| format!("Failed to drop trigger sessions_ad: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_au", [])
        .map_err(|e| format!("Failed to drop trigger sessions_au: {e}"))?;
    Ok(())
}

fn create_sessions_triggers(conn: &Connection) -> Result<(), String> {
    // Insert trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
         INSERT INTO sessions_fts(rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES (new.rowid, new.path, new.cwd, new.name, new.first_message, new.all_messages_text, new.user_messages_text, new.assistant_messages_text); END;",
        [],
    ).map_err(|e| format!("Failed to create trigger sessions_ai: {e}"))?;

    // Delete trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
         INSERT INTO sessions_fts(sessions_fts, rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES('delete', old.rowid, old.path, old.cwd, old.name, old.first_message, old.all_messages_text, old.user_messages_text, old.assistant_messages_text); END;",
        [],
    ).map_err(|e| format!("Failed to create trigger sessions_ad: {e}"))?;

    // Update trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
         INSERT INTO sessions_fts(sessions_fts, rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES('delete', old.rowid, old.path, old.cwd, old.name, old.first_message, old.all_messages_text, old.user_messages_text, old.assistant_messages_text);
         INSERT INTO sessions_fts(rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES (new.rowid, new.path, new.cwd, new.name, new.first_message, new.all_messages_text, new.user_messages_text, new.assistant_messages_text); END;",
        [],
    ).map_err(|e| format!("Failed to create trigger sessions_au: {e}"))?;

    debug!("[FTS] Created sessions sync triggers");
    Ok(())
}

pub fn search_fts5(conn: &Connection, query: &str, limit: usize) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT path FROM sessions_fts
         WHERE sessions_fts MATCH ?
         ORDER BY rowid DESC
         LIMIT ?",
        )
        .map_err(|e| format!("Failed to prepare FTS5 statement: {e}"))?;

    let paths: Vec<String> = stmt
        .query_map(params![query, limit as i64], |row| row.get(0))
        .map_err(|e| format!("Failed to query FTS5: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect FTS5 results: {e}"))?;

    Ok(paths)
}

pub fn full_rebuild_fts(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TABLE IF EXISTS sessions_fts", [])
        .map_err(|e| e.to_string())?;
    // Drop any legacy triggers (they will be removed with the table drop, but do it explicitly for safety)
    conn.execute("DROP TRIGGER IF EXISTS sessions_ai", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_ad", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_au", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE VIRTUAL TABLE sessions_fts USING fts5(
            path UNINDEXED,
            cwd,
            name,
            first_message,
            all_messages_text,
            user_messages_text,
            assistant_messages_text,
            content='sessions',
            content_rowid='rowid',
            tokenize='unicode61'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create FTS5 table: {e}"))?;

    // No manual triggers: auto-sync maintains the index

    // Rebuild the index from existing sessions
    conn.execute(
        "INSERT INTO sessions_fts(sessions_fts) VALUES('rebuild')",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
