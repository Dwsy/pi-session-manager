use super::deps::*;
use super::types::{DbPluginRecord, DbPluginRecordIndexValue, PluginRecordSearchHit};

pub fn ensure_plugin_records_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS plugin_records (
            id TEXT PRIMARY KEY,
            plugin_id TEXT NOT NULL,
            scope_type TEXT NOT NULL,
            scope_id TEXT NOT NULL,
            record_type TEXT NOT NULL,
            schema_version INTEGER NOT NULL CHECK(schema_version >= 1),
            payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
            searchable_text TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_plugin_records_scope
            ON plugin_records(scope_type, scope_id, record_type);
        CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin
            ON plugin_records(plugin_id, record_type);
        CREATE INDEX IF NOT EXISTS idx_plugin_records_type_updated
            ON plugin_records(record_type, updated_at DESC);
        CREATE TABLE IF NOT EXISTS plugin_record_index_values (
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
        CREATE INDEX IF NOT EXISTS idx_plugin_record_index_text
            ON plugin_record_index_values(plugin_id, record_type, index_name, value_text);
        CREATE INDEX IF NOT EXISTS idx_plugin_record_index_number
            ON plugin_record_index_values(plugin_id, record_type, index_name, value_number);
        CREATE INDEX IF NOT EXISTS idx_plugin_record_index_datetime
            ON plugin_record_index_values(plugin_id, record_type, index_name, value_datetime);",
    )
    .map_err(|e| format!("Failed to create plugin record tables: {e}"))?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS plugin_records_fts USING fts5(
            record_id UNINDEXED,
            plugin_id UNINDEXED,
            scope_type UNINDEXED,
            scope_id UNINDEXED,
            record_type UNINDEXED,
            searchable_text,
            tokenize='unicode61'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create plugin_records_fts: {e}"))?;

    Ok(())
}

fn row_to_plugin_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<DbPluginRecord> {
    Ok(DbPluginRecord { id: row.get(0)?, plugin_id: row.get(1)?, scope_type: row.get(2)?, scope_id: row.get(3)?, record_type: row.get(4)?, schema_version: row.get(5)?, payload_json: row.get(6)?, searchable_text: row.get(7)?, created_at: row.get(8)?, updated_at: row.get(9)? })
}

pub fn upsert_plugin_record(conn: &Connection, record: &DbPluginRecord, index_values: &[DbPluginRecordIndexValue]) -> Result<(), String> {
    if serde_json::from_str::<Value>(&record.payload_json).is_err() {
        return Err("Invalid plugin record payload_json".to_string());
    }
    if record.schema_version < 1 {
        return Err("Plugin record schema_version must be >= 1".to_string());
    }

    let tx = conn.unchecked_transaction().map_err(|e| format!("Failed to begin plugin record transaction: {e}"))?;
    tx.execute(
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
        params![record.id, record.plugin_id, record.scope_type, record.scope_id, record.record_type, record.schema_version, record.payload_json, record.searchable_text, record.created_at, record.updated_at,],
    )
    .map_err(|e| format!("Failed to upsert plugin record: {e}"))?;

    tx.execute("DELETE FROM plugin_records_fts WHERE record_id = ?1", params![record.id]).map_err(|e| format!("Failed to delete plugin record FTS row: {e}"))?;
    if let Some(text) = record.searchable_text.as_deref().filter(|text| !text.trim().is_empty()) {
        tx.execute(
            "INSERT INTO plugin_records_fts(record_id, plugin_id, scope_type, scope_id, record_type, searchable_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![record.id, record.plugin_id, record.scope_type, record.scope_id, record.record_type, text],
        )
        .map_err(|e| format!("Failed to insert plugin record FTS row: {e}"))?;
    }

    tx.execute("DELETE FROM plugin_record_index_values WHERE record_id = ?1", params![record.id]).map_err(|e| format!("Failed to clear plugin record index values: {e}"))?;
    for value in index_values {
        if value.record_id != record.id || value.plugin_id != record.plugin_id || value.record_type != record.record_type {
            return Err("Plugin record index value must match record id/plugin_id/record_type".to_string());
        }
        tx.execute(
            "INSERT INTO plugin_record_index_values (
                record_id, plugin_id, record_type, index_name, value_text, value_number, value_datetime
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![value.record_id, value.plugin_id, value.record_type, value.index_name, value.value_text, value.value_number, value.value_datetime],
        )
        .map_err(|e| format!("Failed to insert plugin record index value: {e}"))?;
    }

    tx.commit().map_err(|e| format!("Failed to commit plugin record transaction: {e}"))
}

pub fn get_plugin_record(conn: &Connection, id: &str) -> Result<Option<DbPluginRecord>, String> {
    conn.query_row(
        "SELECT id, plugin_id, scope_type, scope_id, record_type, schema_version,
                payload_json, searchable_text, created_at, updated_at
         FROM plugin_records WHERE id = ?1",
        params![id],
        row_to_plugin_record,
    )
    .optional()
    .map_err(|e| format!("Failed to get plugin record: {e}"))
}

pub fn list_plugin_records_for_scope(conn: &Connection, scope_type: &str, scope_id: &str, record_type: Option<&str>, limit: usize) -> Result<Vec<DbPluginRecord>, String> {
    let limit = limit.clamp(1, 500) as i64;
    if let Some(record_type) = record_type {
        let mut stmt = conn
            .prepare(
                "SELECT id, plugin_id, scope_type, scope_id, record_type, schema_version,
                        payload_json, searchable_text, created_at, updated_at
                 FROM plugin_records
                 WHERE scope_type = ?1 AND scope_id = ?2 AND record_type = ?3
                 ORDER BY updated_at DESC
                 LIMIT ?4",
            )
            .map_err(|e| format!("Failed to prepare plugin record list: {e}"))?;
        let rows = stmt.query_map(params![scope_type, scope_id, record_type, limit], row_to_plugin_record).map_err(|e| format!("Failed to query plugin records: {e}"))?;
        return rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| format!("Failed to collect plugin records: {e}"));
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, plugin_id, scope_type, scope_id, record_type, schema_version,
                    payload_json, searchable_text, created_at, updated_at
             FROM plugin_records
             WHERE scope_type = ?1 AND scope_id = ?2
             ORDER BY updated_at DESC
             LIMIT ?3",
        )
        .map_err(|e| format!("Failed to prepare plugin record list: {e}"))?;
    let rows = stmt.query_map(params![scope_type, scope_id, limit], row_to_plugin_record).map_err(|e| format!("Failed to query plugin records: {e}"))?;
    rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| format!("Failed to collect plugin records: {e}"))
}

pub fn search_plugin_records(conn: &Connection, query: &str, record_type: Option<&str>, plugin_id: Option<&str>, limit: usize) -> Result<Vec<PluginRecordSearchHit>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    let limit = limit.clamp(1, 500) as i64;
    let normalized = crate::utils::normalize_search_text(trimmed);
    let fts_query = if normalized.is_empty() { format!("\"{}\"", trimmed.replace('"', "\"\"").replace('\\', "\\\\")) } else { normalized };

    let sql = "SELECT
            r.id, r.plugin_id, r.scope_type, r.scope_id, r.record_type, r.schema_version,
            r.payload_json, r.searchable_text, r.created_at, r.updated_at,
            snippet(plugin_records_fts, 5, '<b>', '</b>', '...', 80) AS snippet,
            bm25(plugin_records_fts) AS rank
        FROM plugin_records_fts
        JOIN plugin_records r ON r.id = plugin_records_fts.record_id
        WHERE plugin_records_fts MATCH ?1
          AND (?2 IS NULL OR r.record_type = ?2)
          AND (?3 IS NULL OR r.plugin_id = ?3)
        ORDER BY rank
        LIMIT ?4";

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Failed to prepare plugin record search: {e}"))?;
    let rows = stmt.query_map(params![fts_query, record_type, plugin_id, limit], |row| Ok(PluginRecordSearchHit { record: row_to_plugin_record(row)?, snippet: row.get(10)?, rank: row.get::<_, f64>(11)? })).map_err(|e| format!("Failed to query plugin record search: {e}"))?;

    rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| format!("Failed to collect plugin record search results: {e}"))
}
