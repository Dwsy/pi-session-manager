use super::deps::*;
use super::message_index::delete_message_entries_for_session;
use super::util::parse_timestamp;

pub fn get_cached_file_modified(conn: &Connection, path: &str) -> Result<Option<DateTime<Utc>>, String> {
    let mut stmt = conn.prepare("SELECT file_modified FROM sessions WHERE path = ?").map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let result = stmt.query_row(params![path], |row| Ok(parse_timestamp(&row.get::<_, String>(0)?))).ok();

    Ok(result)
}

pub fn needs_reindexing(conn: &Connection, path: &str) -> Result<bool, String> {
    let mut stmt = conn.prepare("SELECT user_messages_text IS NULL OR assistant_messages_text IS NULL FROM sessions WHERE path = ?").map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let result = stmt.query_row(params![path], |row| row.get::<_, bool>(0)).optional().map_err(|e| format!("Failed to query needs_reindexing: {e}"))?;

    Ok(result.unwrap_or(false))
}

pub fn delete_session(conn: &Connection, path: &str) -> Result<(), String> {
    // Also delete from message_entries (FOREIGN KEY CASCADE should handle but we do explicitly for safety)
    let _ = delete_message_entries_for_session(conn, path);
    let _ = conn.execute("DELETE FROM session_details_cache WHERE path = ?", params![path]);
    let _ = conn.execute("DELETE FROM subagent_meta_cache WHERE path = ?", params![path]);

    conn.execute("DELETE FROM sessions WHERE path = ?", params![path]).map_err(|e| format!("Failed to delete session: {e}"))?;
    Ok(())
}

pub fn delete_sessions_by_source_slugs(conn: &Connection, source_slugs: &[String]) -> Result<usize, String> {
    if source_slugs.is_empty() {
        return Ok(0);
    }

    let source_matchers = source_slugs.iter().filter_map(|slug| crate::domain::session_bridge::SessionBridgeSource::ALL.into_iter().find(|source| source.slug().replace('_', "-") == *slug)).collect::<Vec<_>>();
    if source_matchers.is_empty() {
        return Ok(0);
    }

    let mut stmt = conn.prepare("SELECT path FROM sessions").map_err(|e| format!("Failed to prepare session path query: {e}"))?;
    let paths = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| format!("Failed to query session paths: {e}"))?.collect::<SqliteResult<Vec<_>>>().map_err(|e| format!("Failed to collect session paths: {e}"))?;

    let mut deleted = 0usize;
    for path in paths {
        let path_ref = Path::new(&path);
        if source_matchers.iter().any(|source| source.matches_path(path_ref)) {
            delete_session(conn, &path)?;
            deleted += 1;
        }
    }

    Ok(deleted)
}

pub fn get_session_count(conn: &Connection) -> Result<usize, String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0)).map_err(|e| format!("Failed to count sessions: {e}"))?;
    Ok(count as usize)
}

pub fn vacuum(conn: &Connection) -> Result<(), String> {
    conn.execute("VACUUM", []).map_err(|e| format!("Failed to vacuum database: {e}"))?;
    Ok(())
}

pub fn cleanup_missing_files(conn: &Connection) -> Result<usize, String> {
    let mut stmt = conn.prepare("SELECT path FROM sessions").map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let paths: Vec<String> = stmt.query_map([], |row| row.get(0)).map_err(|e| format!("Failed to query paths: {e}"))?.collect::<SqliteResult<Vec<_>>>().map_err(|e| format!("Failed to collect paths: {e}"))?;

    let mut deleted = 0;
    for path in paths {
        if !Path::new(&path).exists() {
            delete_session(conn, &path)?;
            deleted += 1;
        }
    }

    Ok(deleted)
}

pub fn preload_recent_sessions(conn: &Connection, count: usize) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, cwd, name, created, modified, message_count, first_message, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path
         FROM sessions
         ORDER BY last_accessed DESC, access_count DESC, modified DESC, path ASC
         LIMIT ?",
        )
        .map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map(params![count as i64], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                user_messages_text: row.get(8).unwrap_or_default(),
                assistant_messages_text: row.get(9).unwrap_or_default(),
                last_message: row.get(10).unwrap_or_default(),
                last_message_role: row.get(11).unwrap_or_default(),
                parent_session_path: row.get(12)?,
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
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

    let paths: Vec<String> = stmt.query_map(params![query, limit as i64], |row| row.get(0)).map_err(|e| format!("Failed to query FTS5: {e}"))?.collect::<SqliteResult<Vec<_>>>().map_err(|e| format!("Failed to collect FTS5 results: {e}"))?;

    Ok(paths)
}

pub fn optimize_database(conn: &Connection) -> Result<(), String> {
    vacuum(conn)?;
    conn.execute("ANALYZE", []).map_err(|e| format!("Failed to analyze database: {e}"))?;
    Ok(())
}

// Clear all cached session data (sessions table and session_details_cache table)
// Note: favorites table is preserved
pub fn clear_all_cache(conn: &Connection) -> Result<(usize, usize), String> {
    // Delete all sessions
    let sessions_deleted = conn.execute("DELETE FROM sessions", []).map_err(|e| format!("Failed to delete sessions: {e}"))?;

    // Delete all session details cache
    let details_deleted = conn.execute("DELETE FROM session_details_cache", []).map_err(|e| format!("Failed to delete session details cache: {e}"))?;

    // Delete all subagent meta cache
    conn.execute("DELETE FROM subagent_meta_cache", []).map_err(|e| format!("Failed to delete subagent_meta_cache: {e}"))?;

    // Vacuum to reclaim space
    vacuum(conn)?;

    Ok((sessions_deleted, details_deleted))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::data::sqlite::init_db_with_path;

    #[test]
    fn delete_sessions_by_source_slugs_removes_matching_rows() {
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("sessions.db");
        let conn = init_db_with_path(&db_path, &Config::default()).expect("db");

        let pi_root = crate::paths::pi_agent_sessions_dir().expect("pi sessions dir");
        let pi_path = pi_root.join("foo").join("a.jsonl");
        conn.execute(
            "INSERT INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path, cached_at, access_count, last_accessed)
             VALUES (?1, ?2, '', NULL, ?3, ?3, ?3, 0, '', '', '', '', '', NULL, ?3, 0, NULL)",
            params!["pi-1", pi_path.to_string_lossy().to_string(), chrono::Utc::now().to_rfc3339()],
        )
        .expect("insert pi");
        conn.execute(
            "INSERT INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path, cached_at, access_count, last_accessed)
             VALUES (?1, ?2, '', NULL, ?3, ?3, ?3, 0, '', '', '', '', '', NULL, ?3, 0, NULL)",
            params!["codex-1", "/Users/demo/.codex/sessions/2026/01/01/rollout-a.jsonl", chrono::Utc::now().to_rfc3339()],
        )
        .expect("insert codex");

        let deleted = delete_sessions_by_source_slugs(&conn, &["codex".to_string()]).expect("delete");
        assert_eq!(deleted, 1);

        let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0)).expect("count");
        assert_eq!(remaining, 1);

        let remaining_path: String = conn.query_row("SELECT path FROM sessions", [], |row| row.get(0)).expect("path");
        let pi_root = crate::paths::pi_agent_sessions_dir().expect("pi sessions dir");
        let normalized_remaining_path = remaining_path.replace('\\', "/");
        let normalized_pi_root = pi_root.to_string_lossy().replace('\\', "/");
        assert!(normalized_remaining_path.contains(&normalized_pi_root));
    }
}
