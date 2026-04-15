use super::deps::*;

/// Current schema version for migrations
pub(crate) const LATEST_SCHEMA_VERSION: i64 = 8;

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
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);
    if count == 0 {
        conn.execute("INSERT INTO schema_version (version) VALUES (0)", [])
            .map_err(|e| format!("Failed to insert initial schema version: {e}"))?;
    }
    Ok(())
}

/// Get the current schema version (assumes table exists and has at least one row)
pub(crate) fn get_current_version(conn: &Connection) -> Result<i64, String> {
    let version: i64 = conn
        .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Failed to get schema version: {e}"))?;
    Ok(version)
}

/// Set the current schema version
pub(crate) fn set_schema_version(conn: &Connection, version: i64) -> Result<(), String> {
    conn.execute("UPDATE schema_version SET version = ?", params![version])
        .map_err(|e| format!("Failed to set schema version: {e}"))?;
    Ok(())
}
