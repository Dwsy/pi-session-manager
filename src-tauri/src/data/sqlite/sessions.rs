use super::deps::*;
use super::message_index::{
    delete_message_entries_for_session, insert_message_entries, upsert_message_entries,
};
use super::util::parse_timestamp;

pub fn upsert_session(
    conn: &mut Connection,
    session: &SessionInfo,
    file_modified: DateTime<Utc>,
    entries: Option<&[SessionEntry]>,
) -> Result<(), String> {
    const MAX_RETRIES: usize = 3;
    let mut last_error = None;

    for attempt in 0..MAX_RETRIES {
        if attempt > 0 {
            let delay = std::time::Duration::from_millis(50 * (1 << (attempt - 1)));
            std::thread::sleep(delay);
        }

        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| format!("Failed to begin transaction: {e}"))?;

        let result = upsert_session_in_tx(&tx, session, file_modified, entries);

        match result {
            Ok(()) => {
                if let Err(e) = tx.commit() {
                    let err_msg = format!("Failed to commit transaction: {e}");
                    let is_locked =
                        err_msg.contains("database is locked") || err_msg.contains("busy");
                    if is_locked && attempt < MAX_RETRIES - 1 {
                        last_error = Some(err_msg);
                        continue;
                    }
                    return Err(err_msg);
                }
                return Ok(());
            }
            Err(e) => {
                let is_locked = e.contains("database is locked") || e.contains("busy");
                let _ = tx.rollback();
                if is_locked && attempt < MAX_RETRIES - 1 {
                    last_error = Some(e);
                    continue;
                }
                return Err(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Unknown upsert error".to_string()))
}

fn upsert_session_in_tx(
    tx: &rusqlite::Transaction<'_>,
    session: &SessionInfo,
    file_modified: DateTime<Utc>,
    entries: Option<&[SessionEntry]>,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path, cached_at, access_count, last_accessed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 0, NULL)
         ON CONFLICT(path) DO UPDATE SET
            name = excluded.name,
            modified = excluded.modified,
            file_modified = excluded.file_modified,
            message_count = excluded.message_count,
            first_message = excluded.first_message,
            all_messages_text = excluded.all_messages_text,
            user_messages_text = excluded.user_messages_text,
            assistant_messages_text = excluded.assistant_messages_text,
            last_message = excluded.last_message,
            last_message_role = excluded.last_message_role,
            parent_session_path = excluded.parent_session_path,
            cached_at = excluded.cached_at",
        params![
            &session.id,
            &session.path,
            &session.cwd,
            &session.name,
            &session.created.to_rfc3339(),
            &session.modified.to_rfc3339(),
            &file_modified.to_rfc3339(),
            session.message_count as i64,
            &session.first_message,
            &session.all_messages_text,
            &session.user_messages_text,
            &session.assistant_messages_text,
            &session.last_message,
            &session.last_message_role,
            &session.parent_session_path,
            &Utc::now().to_rfc3339(),
        ],
    ).map_err(|e| format!("Failed to upsert session: {e}"))?;

    // Populate message_entries table if it exists (for per-message FTS)
    if tx
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|_| true)
        .unwrap_or(false)
    {
        debug!(
            "[Upsert] Updating message entries for session: {}",
            session.path
        );
        // Clear existing entries for this session to avoid duplicates
        delete_message_entries_for_session(tx, &session.path)?;
        // Insert fresh entries (use pre-parsed if available to avoid re-reading file)
        if let Some(entries) = entries {
            upsert_message_entries(tx, &session.path, entries)?;
        } else {
            insert_message_entries(tx, session)?;
        }
        debug!(
            "[Upsert] Completed message entries for session: {}",
            session.path
        );
    } else {
        debug!("[Upsert] message_entries table does not exist, skipping");
    }

    Ok(())
}

pub fn get_session(conn: &Connection, path: &str) -> Result<Option<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path
         FROM sessions WHERE path = ?"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let session = stmt
        .query_row(params![path], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
                parent_session_path: row.get(13)?,
            })
        })
        .ok();

    if session.is_some() {
        conn.execute(
            "UPDATE sessions SET access_count = access_count + 1, last_accessed = ? WHERE path = ?",
            params![Utc::now().to_rfc3339(), path],
        )
        .ok();
    }

    Ok(session)
}

pub fn get_all_sessions(conn: &Connection) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path
         FROM sessions ORDER BY modified DESC, path ASC"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
                parent_session_path: row.get(13)?,
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}

pub fn get_sessions_modified_after(
    conn: &Connection,
    cutoff: DateTime<Utc>,
) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path
         FROM sessions WHERE modified > ? ORDER BY modified DESC, path ASC"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map(params![cutoff.to_rfc3339()], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
                parent_session_path: row.get(13)?,
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}

pub fn get_sessions_modified_before(
    conn: &Connection,
    cutoff: DateTime<Utc>,
) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, parent_session_path
         FROM sessions WHERE modified <= ? ORDER BY modified DESC, path ASC"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map(params![cutoff.to_rfc3339()], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
                parent_session_path: row.get(13)?,
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}
