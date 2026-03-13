use super::deps::*;
use super::util::parse_timestamp;

/// Look up a cached `SubagentRunInfo` by file path.
/// Returns `(file_modified, run_info)` when a cache entry exists, or `None` otherwise.
pub fn get_cached_subagent_meta(
    conn: &Connection,
    path: &str,
) -> Result<Option<(DateTime<Utc>, SubagentRunInfo)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT file_modified, run_id, agent, model, exit_code, cost,
                    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                    duration_ms, tool_count, timestamp
             FROM subagent_meta_cache
             WHERE path = ?",
        )
        .map_err(|e| format!("Failed to prepare subagent_meta_cache statement: {e}"))?;

    let row = stmt
        .query_row(params![path], |row| {
            Ok((
                parse_timestamp(&row.get::<_, String>(0)?),
                SubagentRunInfo {
                    run_id: row.get(1)?,
                    agent: row.get(2)?,
                    model: row.get(3)?,
                    exit_code: row.get(4)?,
                    cost: row.get(5)?,
                    input_tokens: row.get::<_, i64>(6)? as usize,
                    output_tokens: row.get::<_, i64>(7)? as usize,
                    cache_read_tokens: row.get::<_, i64>(8)? as usize,
                    cache_write_tokens: row.get::<_, i64>(9)? as usize,
                    duration_ms: row.get::<_, i64>(10)? as u64,
                    tool_count: row.get::<_, i64>(11)? as usize,
                    timestamp: row.get(12)?,
                },
            ))
        })
        .ok();

    Ok(row)
}

/// Insert or replace a `SubagentRunInfo` cache entry keyed by file path.
pub fn upsert_subagent_meta(
    conn: &Connection,
    path: &str,
    file_modified: DateTime<Utc>,
    run: &SubagentRunInfo,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO subagent_meta_cache (
            path, file_modified, run_id, agent, model, exit_code, cost,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            duration_ms, tool_count, timestamp
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(path) DO UPDATE SET
            file_modified = excluded.file_modified,
            run_id = excluded.run_id,
            agent = excluded.agent,
            model = excluded.model,
            exit_code = excluded.exit_code,
            cost = excluded.cost,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            cache_read_tokens = excluded.cache_read_tokens,
            cache_write_tokens = excluded.cache_write_tokens,
            duration_ms = excluded.duration_ms,
            tool_count = excluded.tool_count,
            timestamp = excluded.timestamp",
        params![
            path,
            &file_modified.to_rfc3339(),
            &run.run_id,
            &run.agent,
            &run.model,
            run.exit_code,
            run.cost,
            run.input_tokens as i64,
            run.output_tokens as i64,
            run.cache_read_tokens as i64,
            run.cache_write_tokens as i64,
            run.duration_ms as i64,
            run.tool_count as i64,
            run.timestamp,
        ],
    )
    .map_err(|e| format!("Failed to upsert subagent_meta_cache: {e}"))?;

    Ok(())
}
