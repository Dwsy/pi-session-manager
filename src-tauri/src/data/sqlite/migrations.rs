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
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns for {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    // For sessions table
    if !column_exists(conn, "sessions", "last_message")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message TEXT", [])
            .map_err(|e| format!("Failed to add last_message column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "last_message_role")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message_role TEXT", [])
            .map_err(|e| format!("Failed to add last_message_role column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "user_messages_text")? {
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN user_messages_text TEXT",
            [],
        )
        .map_err(|e| format!("Failed to add user_messages_text column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "assistant_messages_text")? {
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN assistant_messages_text TEXT",
            [],
        )
        .map_err(|e| format!("Failed to add assistant_messages_text column: {e}"))?;
    }

    // For tags table
    if !column_exists(conn, "tags", "auto_rules")? {
        conn.execute("ALTER TABLE tags ADD COLUMN auto_rules TEXT", [])
            .map_err(|e| format!("Failed to add auto_rules column: {e}"))?;
    }
    if !column_exists(conn, "tags", "parent_id")? {
        conn.execute("ALTER TABLE tags ADD COLUMN parent_id TEXT", [])
            .map_err(|e| format!("Failed to add parent_id column: {e}"))?;
    }

    Ok(())
}

/// Migration to version 2: add performance indexes.
fn migration_2(conn: &Connection) -> Result<(), String> {
    // Composite index on session_path and timestamp for per-session ordering
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp)",
        [],
    )
    .map_err(|e| format!("Migration 2 failed: {e}"))?;

    Ok(())
}

/// Migration to version 3: persist per-model token/cost usage in session_details_cache.
fn migration_3(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns for {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "session_details_cache", "model_usage_json")? {
        conn.execute(
            "ALTER TABLE session_details_cache ADD COLUMN model_usage_json TEXT NOT NULL DEFAULT '{}'",
            [],
        )
        .map_err(|e| format!("Migration 3 failed adding model_usage_json: {e}"))?;
    }

    Ok(())
}

/// Migration to version 4: rebuild message search tables with normalized segment rows.
fn migration_4(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TABLE IF EXISTS message_fts", [])
        .map_err(|e| format!("Migration 4 failed dropping message_fts: {e}"))?;
    conn.execute("DROP TABLE IF EXISTS message_entries", [])
        .map_err(|e| format!("Migration 4 failed dropping message_entries: {e}"))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Migration 4 failed creating message_entries: {e}"))?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)",
        [],
    )
    .map_err(|e| format!("Migration 4 failed creating session index: {e}"))?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id)",
        [],
    )
    .map_err(|e| format!("Migration 4 failed creating entry index: {e}"))?;
    Ok(())
}

/// Migration to version 5: add parent_session_path column for fork support.
fn migration_5(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns for {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "sessions", "parent_session_path")? {
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN parent_session_path TEXT",
            [],
        )
        .map_err(|e| format!("Migration 5 failed adding parent_session_path: {e}"))?;
    }

    Ok(())
}

/// Migration to version 6: add turns column to subagent_meta_cache for @tintinweb/pi-subagents compatibility.
fn migration_6(conn: &Connection) -> Result<(), String> {
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns for {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    if !column_exists(conn, "subagent_meta_cache", "turns")? {
        conn.execute(
            "ALTER TABLE subagent_meta_cache ADD COLUMN turns INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| format!("Migration 6 failed adding turns column: {e}"))?;
    }

    Ok(())
}
