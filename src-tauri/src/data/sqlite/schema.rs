use super::deps::*;

/// Current schema version for migrations
pub(crate) const LATEST_SCHEMA_VERSION: i64 = 17;

/// Ensure the schema_version table exists and initialize to 0 if empty.
pub(crate) fn ensure_schema_version_table(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create schema_version table: {e}"))?;

    // Check if any row exists; if not, insert version 0.
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM schema_version", [], |row| row.get(0)).unwrap_or(0);
    if count == 0 {
        conn.execute("INSERT INTO schema_version (version) VALUES (0)", []).map_err(|e| format!("Failed to insert initial schema version: {e}"))?;
    }
    Ok(())
}

/// Get the current schema version (assumes table exists and has at least one row)
pub(crate) fn get_current_version(conn: &Connection) -> Result<i64, String> {
    let version: i64 = conn.query_row("SELECT version FROM schema_version LIMIT 1", [], |row| row.get(0)).map_err(|e| format!("Failed to get schema version: {e}"))?;
    Ok(version)
}

/// Set the current schema version
pub(crate) fn set_schema_version(conn: &Connection, version: i64) -> Result<(), String> {
    conn.execute("UPDATE schema_version SET version = ?", params![version]).map_err(|e| format!("Failed to set schema version: {e}"))?;
    Ok(())
}

/// Ensure the app_version_info table exists for tracking app version changes.
pub(crate) fn ensure_app_version_info_table(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_version_info (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            app_version TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create app_version_info table: {e}"))?;
    Ok(())
}

/// Get the stored app version info (returns None if table is empty).
pub(crate) fn get_app_version_info(conn: &Connection) -> Result<Option<(String, i64, String)>, String> {
    let result = conn.query_row("SELECT app_version, schema_version, updated_at FROM app_version_info WHERE id = 1", [], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?)));
    match result {
        Ok(info) => Ok(Some(info)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get app version info: {e}")),
    }
}

/// Set the app version info (upserts the single row).
pub(crate) fn set_app_version_info(conn: &Connection, app_version: &str, schema_version: i64, updated_at: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_version_info (id, app_version, schema_version, updated_at) VALUES (1, ?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET app_version = ?1, schema_version = ?2, updated_at = ?3",
        params![app_version, schema_version, updated_at],
    )
    .map_err(|e| format!("Failed to set app version info: {e}"))?;
    Ok(())
}
