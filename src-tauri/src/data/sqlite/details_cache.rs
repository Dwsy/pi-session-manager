use super::deps::*;
use super::types::SessionDetailsCache;
use super::util::parse_timestamp;

pub fn get_session_details_cache(conn: &Connection, path: &str) -> Result<Option<SessionDetailsCache>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT file_modified, user_messages, assistant_messages, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost,
                cache_write_cost, models_json, model_usage_json
         FROM session_details_cache
         WHERE path = ?",
        )
        .map_err(|e| format!("Failed to prepare session_details_cache statement: {e}"))?;

    let row = stmt
        .query_row(params![path], |row| {
            Ok(SessionDetailsCache {
                file_modified: parse_timestamp(&row.get::<_, String>(0)?),
                user_messages: row.get::<_, i64>(1)? as usize,
                assistant_messages: row.get::<_, i64>(2)? as usize,
                input_tokens: row.get::<_, i64>(3)? as usize,
                output_tokens: row.get::<_, i64>(4)? as usize,
                cache_read_tokens: row.get::<_, i64>(5)? as usize,
                cache_write_tokens: row.get::<_, i64>(6)? as usize,
                input_cost: row.get::<_, f64>(7)?,
                output_cost: row.get::<_, f64>(8)?,
                cache_read_cost: row.get::<_, f64>(9)?,
                cache_write_cost: row.get::<_, f64>(10)?,
                models_json: row.get::<_, String>(11)?,
                model_usage_json: row.get::<_, String>(12)?,
            })
        })
        .ok();

    Ok(row)
}

pub fn upsert_session_details_cache(conn: &Connection, path: &str, file_modified: DateTime<Utc>, details: &SessionDetails) -> Result<(), String> {
    let models_json = serde_json::to_string(&details.models).map_err(|e| format!("Failed to serialize models: {e}"))?;
    let model_usage_json = serde_json::to_string(&details.model_usage).map_err(|e| format!("Failed to serialize model usage: {e}"))?;

    conn.execute(
        "INSERT INTO session_details_cache (
            path, file_modified, user_messages, assistant_messages, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost,
            cache_write_cost, models_json, model_usage_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(path) DO UPDATE SET
            file_modified = excluded.file_modified,
            user_messages = excluded.user_messages,
            assistant_messages = excluded.assistant_messages,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            cache_read_tokens = excluded.cache_read_tokens,
            cache_write_tokens = excluded.cache_write_tokens,
            input_cost = excluded.input_cost,
            output_cost = excluded.output_cost,
            cache_read_cost = excluded.cache_read_cost,
            cache_write_cost = excluded.cache_write_cost,
            models_json = excluded.models_json,
            model_usage_json = excluded.model_usage_json",
        params![
            path,
            &file_modified.to_rfc3339(),
            details.user_messages as i64,
            details.assistant_messages as i64,
            details.input_tokens as i64,
            details.output_tokens as i64,
            details.cache_read_tokens as i64,
            details.cache_write_tokens as i64,
            details.input_cost,
            details.output_cost,
            details.cache_read_cost,
            details.cache_write_cost,
            models_json,
            model_usage_json,
        ],
    )
    .map_err(|e| format!("Failed to upsert session_details_cache: {e}"))?;

    Ok(())
}

/// Transaction-aware version of upsert_session_details_cache for batch operations
pub fn upsert_session_details_cache_in_tx(tx: &rusqlite::Transaction<'_>, path: &str, file_modified: DateTime<Utc>, details: &SessionDetails) -> Result<(), String> {
    let models_json = serde_json::to_string(&details.models).map_err(|e| format!("Failed to serialize models: {e}"))?;
    let model_usage_json = serde_json::to_string(&details.model_usage).map_err(|e| format!("Failed to serialize model usage: {e}"))?;

    tx.execute(
        "INSERT INTO session_details_cache (
            path, file_modified, user_messages, assistant_messages, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost,
            cache_write_cost, models_json, model_usage_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(path) DO UPDATE SET
            file_modified = excluded.file_modified,
            user_messages = excluded.user_messages,
            assistant_messages = excluded.assistant_messages,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            cache_read_tokens = excluded.cache_read_tokens,
            cache_write_tokens = excluded.cache_write_tokens,
            input_cost = excluded.input_cost,
            output_cost = excluded.output_cost,
            cache_read_cost = excluded.cache_read_cost,
            cache_write_cost = excluded.cache_write_cost,
            models_json = excluded.models_json,
            model_usage_json = excluded.model_usage_json",
        params![
            path,
            &file_modified.to_rfc3339(),
            details.user_messages as i64,
            details.assistant_messages as i64,
            details.input_tokens as i64,
            details.output_tokens as i64,
            details.cache_read_tokens as i64,
            details.cache_write_tokens as i64,
            details.input_cost,
            details.output_cost,
            details.cache_read_cost,
            details.cache_write_cost,
            models_json,
            model_usage_json,
        ],
    )
    .map_err(|e| format!("Failed to upsert session_details_cache: {e}"))?;

    Ok(())
}
