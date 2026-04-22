use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

use crate::domain::casr_min::model::{flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};

pub const DB_FILENAME: &str = "opencode.db";
const DATA_DIRNAME: &str = ".opencode";

#[derive(Clone)]
struct OpenCodePathListCacheEntry {
    modified_at_ms: u128,
    session_paths: Vec<PathBuf>,
}

fn session_path_cache() -> &'static RwLock<std::collections::HashMap<String, OpenCodePathListCacheEntry>> {
    static CACHE: OnceLock<RwLock<std::collections::HashMap<String, OpenCodePathListCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(std::collections::HashMap::new()))
}

fn db_modified_ms(path: &Path) -> Result<u128, String> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|e| format!("OpenCode: failed to read DB metadata {}: {e}", path.display()))?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|e| format!("OpenCode: failed to normalize DB mtime {}: {e}", path.display()))
}

pub fn session_roots() -> Vec<PathBuf> {
    dedup_existing_dirs(candidate_data_dirs())
}

pub fn matches_path(path: &Path) -> bool {
    if path.file_name().and_then(|value| value.to_str()) == Some(DB_FILENAME) {
        return true;
    }

    path.parent().and_then(|parent| parent.file_name()).and_then(|value| value.to_str()) == Some(DB_FILENAME) || path.to_string_lossy().replace('\\', "/").contains("/.opencode/")
}

pub fn backing_store_path(path: &Path) -> PathBuf {
    parse_virtual_path(path).map(|(db_path, _)| db_path).unwrap_or_else(|| path.to_path_buf())
}

pub fn list_session_paths_in_db(db_path: &Path) -> Result<Vec<PathBuf>, String> {
    let modified_at_ms = db_modified_ms(db_path)?;
    let cache_key = db_path.to_string_lossy().to_string();

    if let Ok(guard) = session_path_cache().read() {
        if let Some(entry) = guard.get(&cache_key) {
            if entry.modified_at_ms == modified_at_ms {
                return Ok(entry.session_paths.clone());
            }
        }
    }

    let conn = open_db_ro(db_path)?;
    if !table_exists(&conn, "sessions") {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare("SELECT id FROM sessions ORDER BY created_at DESC").map_err(|e| format!("OpenCode: failed to prepare session list query: {e}"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| format!("OpenCode: failed to query sessions: {e}"))?;

    let session_paths = rows.flatten().map(|session_id| virtual_session_path(db_path, &session_id)).collect::<Vec<_>>();

    if let Ok(mut guard) = session_path_cache().write() {
        guard.insert(cache_key, OpenCodePathListCacheEntry { modified_at_ms, session_paths: session_paths.clone() });
    }

    Ok(session_paths)
}

pub fn build_target_path(session: &CanonicalSession, target_session_id: &str) -> Result<PathBuf, String> {
    let db_path = choose_target_db_path(session)?;
    Ok(virtual_session_path(&db_path, target_session_id))
}

pub fn resume_command() -> String {
    "opencode".to_string()
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    if let Some((db_path, session_id)) = parse_virtual_path(path) {
        let conn = open_db_ro(&db_path)?;
        return read_session_by_id(&conn, &db_path, &session_id);
    }

    let conn = open_db_ro(path)?;
    let session_id = newest_root_session_id(&conn).ok_or_else(|| format!("OpenCode: no sessions found in {}", path.display()))?;
    read_session_by_id(&conn, path, &session_id)
}

pub fn read_session_from_str(_path: &Path, _content: &str) -> Result<CanonicalSession, String> {
    Err("OpenCode sessions are SQLite-backed; reading from string is unsupported".to_string())
}

pub fn render_session(_session: &CanonicalSession, _target_session_id: &str) -> Result<String, String> {
    Err("OpenCode does not support text preview rendering".to_string())
}

pub fn write_session(session: &CanonicalSession, target_session_id: &str) -> Result<PathBuf, String> {
    let target_path = build_target_path(session, target_session_id)?;
    let db_path = backing_store_path(&target_path);
    let mut conn = open_db_rw(&db_path)?;
    ensure_schema(&conn)?;

    let now = chrono::Utc::now().timestamp_millis();
    let created_at = session.started_at.unwrap_or(now);
    let updated_at = session.ended_at.unwrap_or(now);
    let title = session.title.clone().or_else(|| session.messages.iter().find(|message| message.role == MessageRole::User).map(|message| truncate_title(&message.content, 80)).filter(|value| !value.is_empty())).unwrap_or_else(|| "Converted session".to_string());

    let tx = conn.unchecked_transaction().map_err(|e| format!("OpenCode: failed to begin transaction: {e}"))?;

    tx.execute(
        "INSERT INTO sessions (
            id, parent_session_id, title, message_count, prompt_tokens, completion_tokens, cost,
            summary_message_id, updated_at, created_at
         ) VALUES (?1, NULL, ?2, ?3, 0, 0, 0.0, NULL, ?4, ?5)",
        rusqlite::params![target_session_id, title, i64::try_from(session.messages.len()).unwrap_or(i64::MAX), updated_at, created_at,],
    )
    .map_err(|e| format!("OpenCode: failed to insert session: {e}"))?;

    let default_model = session.model_name.clone();
    for msg in &session.messages {
        let message_id = format!("{target_session_id}-{:04}", msg.idx);
        let parts_json = serde_json::to_string(&build_parts(msg)).map_err(|e| format!("OpenCode: failed to serialize message parts: {e}"))?;
        let timestamp = msg.timestamp.unwrap_or(created_at);
        let model = msg.author.clone().or_else(|| default_model.clone());

        tx.execute(
            "INSERT INTO messages (
                id, session_id, role, parts, model, created_at, updated_at, finished_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
            rusqlite::params![message_id, target_session_id, role_to_opencode(&msg.role), parts_json, model, timestamp, timestamp,],
        )
        .map_err(|e| format!("OpenCode: failed to insert message {}: {e}", msg.idx))?;
    }

    tx.commit().map_err(|e| format!("OpenCode: failed to commit transaction: {e}"))?;

    Ok(target_path)
}

fn candidate_data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(path) = env_db_path() {
        if let Some(parent) = path.parent() {
            dirs.push(parent.to_path_buf());
        }
    }

    dirs.extend(cwd_ancestor_data_dirs());

    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(DATA_DIRNAME));
    }

    dirs.extend(configured_data_dirs());
    dirs
}

fn env_db_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("OPENCODE_DB_PATH") {
        if !path.trim().is_empty() {
            return Some(PathBuf::from(path));
        }
    }

    if let Ok(home) = std::env::var("OPENCODE_HOME") {
        if !home.trim().is_empty() {
            let home_path = PathBuf::from(home);
            if home_path.extension().is_some_and(|ext| ext == "db") {
                return Some(home_path);
            }
            return Some(home_path.join(DB_FILENAME));
        }
    }

    None
}

fn configured_data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    for cfg in config_paths() {
        let Ok(text) = std::fs::read_to_string(&cfg) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let Some(dir) = json.pointer("/data/directory").and_then(Value::as_str) else {
            continue;
        };

        let path = PathBuf::from(dir);
        if path.is_absolute() {
            dirs.push(path);
        }
    }

    dirs
}

fn config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".opencode.json"));
        paths.push(home.join(".config/opencode/.opencode.json"));
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.trim().is_empty() {
            paths.push(PathBuf::from(xdg).join("opencode/.opencode.json"));
        }
    }
    paths
}

fn cwd_ancestor_data_dirs() -> Vec<PathBuf> {
    let Ok(cwd) = std::env::current_dir() else {
        return Vec::new();
    };

    cwd.ancestors().map(|ancestor| ancestor.join(DATA_DIRNAME)).collect()
}

fn dedup_existing_dirs(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = BTreeSet::new();
    for path in paths {
        if path.is_dir() {
            seen.insert(path);
        }
    }
    seen.into_iter().collect()
}

fn choose_target_db_path(session: &CanonicalSession) -> Result<PathBuf, String> {
    if let Some(env_db) = env_db_path() {
        return Ok(env_db);
    }

    if let Some(workspace) = &session.workspace {
        return Ok(workspace.join(DATA_DIRNAME).join(DB_FILENAME));
    }

    if let Some(existing_dir) = session_roots().into_iter().next() {
        return Ok(existing_dir.join(DB_FILENAME));
    }

    let cwd = std::env::current_dir().map_err(|e| format!("OpenCode: failed to get cwd: {e}"))?;
    Ok(cwd.join(DATA_DIRNAME).join(DB_FILENAME))
}

fn virtual_session_path(db_path: &Path, session_id: &str) -> PathBuf {
    let encoded = urlencoding::encode(session_id);
    db_path.join(encoded.as_ref())
}

fn parse_virtual_path(path: &Path) -> Option<(PathBuf, String)> {
    let parent = path.parent()?;
    if parent.file_name().and_then(|value| value.to_str()) != Some(DB_FILENAME) {
        return None;
    }

    let encoded = path.file_name()?.to_str()?;
    let session_id = urlencoding::decode(encoded).ok()?.into_owned();
    Some((parent.to_path_buf(), session_id))
}

fn open_db_ro(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| format!("OpenCode: failed to open DB {}: {e}", path.display()))?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| format!("OpenCode: failed to set busy timeout: {e}"))?;
    Ok(conn)
}

fn open_db_rw(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("OpenCode: failed to create directory {}: {e}", parent.display()))?;
    }

    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| format!("OpenCode: failed to open DB {} for writing: {e}", path.display()))?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| format!("OpenCode: failed to set busy timeout: {e}"))?;
    Ok(conn)
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    parent_session_id TEXT,
    title TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    cost REAL NOT NULL DEFAULT 0.0 CHECK (cost >= 0.0),
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    summary_message_id TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parts TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
    UNIQUE(path, session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
CREATE INDEX IF NOT EXISTS idx_files_session_id ON files (session_id);
"#,
    )
    .map_err(|e| format!("OpenCode: failed to initialize schema: {e}"))
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1").and_then(|mut stmt| stmt.exists(rusqlite::params![table])).unwrap_or(false)
}

fn newest_root_session_id(conn: &Connection) -> Option<String> {
    if !table_exists(conn, "sessions") {
        return None;
    }

    conn.query_row("SELECT id FROM sessions WHERE parent_session_id IS NULL ORDER BY created_at DESC LIMIT 1", [], |row| row.get(0)).ok()
}

fn workspace_from_db_path(db_path: &Path) -> Option<PathBuf> {
    let data_dir = db_path.parent()?;
    if data_dir.file_name().and_then(|value| value.to_str()) == Some(DATA_DIRNAME) {
        return data_dir.parent().map(Path::to_path_buf);
    }
    None
}

fn read_session_by_id(conn: &Connection, db_path: &Path, session_id: &str) -> Result<CanonicalSession, String> {
    if !table_exists(conn, "sessions") {
        return Err(format!("OpenCode DB has no sessions table: {}", db_path.display()));
    }
    if !table_exists(conn, "messages") {
        return Err(format!("OpenCode DB has no messages table: {}", db_path.display()));
    }

    let (title_raw, created_raw, updated_raw, parent_session_id, prompt_tokens, completion_tokens, cost): (String, i64, i64, Option<String>, i64, i64, f64) = conn
        .query_row(
            "SELECT title, created_at, updated_at, parent_session_id, prompt_tokens, completion_tokens, cost
             FROM sessions
             WHERE id = ?1
             LIMIT 1",
            rusqlite::params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        )
        .map_err(|e| format!("OpenCode: failed to load session {session_id}: {e}"))?;

    let mut started_at = parse_timestamp(&Value::from(created_raw));
    let mut ended_at = parse_timestamp(&Value::from(updated_raw)).or(started_at);
    let mut model_counts = std::collections::HashMap::new();
    let mut messages = Vec::new();

    let mut stmt = conn
        .prepare(
            "SELECT id, role, parts, model, created_at, updated_at, finished_at
             FROM messages
             WHERE session_id = ?1
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| format!("OpenCode: failed to prepare message query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, i64>(4)?, row.get::<_, i64>(5)?, row.get::<_, Option<i64>>(6)?)))
        .map_err(|e| format!("OpenCode: failed to query messages: {e}"))?;

    for row in rows {
        let (message_id, role_raw, parts_json, model, created_at_raw, _updated_at_raw, finished_at_raw) = row.map_err(|e| format!("OpenCode: failed to decode message row: {e}"))?;

        let timestamp = parse_timestamp(&Value::from(created_at_raw)).or(Some(created_at_raw));
        if let Some(ts) = timestamp {
            started_at = Some(started_at.map_or(ts, |current| current.min(ts)));
            ended_at = Some(ended_at.map_or(ts, |current| current.max(ts)));
        }

        if let Some(finished_at_raw) = finished_at_raw {
            if let Some(finished_ts) = parse_timestamp(&Value::from(finished_at_raw)) {
                ended_at = Some(ended_at.map_or(finished_ts, |current| current.max(finished_ts)));
            }
        }

        let raw_parts = serde_json::from_str::<Value>(&parts_json).unwrap_or_else(|_| json!([]));
        let (content, tool_calls, tool_results) = parse_parts(&raw_parts);

        if let Some(model_name) = model.as_deref().filter(|value| !value.is_empty()) {
            *model_counts.entry(model_name.to_string()).or_insert(0usize) += 1;
        }

        messages.push(CanonicalMessage {
            idx: 0,
            role: normalize_role(&role_raw),
            content,
            timestamp,
            author: model.clone(),
            tool_calls,
            tool_results,
            extra: json!({
                "opencode_message_id": message_id,
                "opencode_parts": raw_parts,
            }),
        });
    }

    reindex_messages(&mut messages);

    let title = (!title_raw.trim().is_empty()).then_some(title_raw).or_else(|| messages.iter().find(|message| message.role == MessageRole::User).map(|message| truncate_title(&message.content, 80)).filter(|value| !value.is_empty()));

    let model_name = model_counts.into_iter().max_by_key(|(_, count)| *count).map(|(name, _)| name);

    Ok(CanonicalSession {
        session_id: session_id.to_string(),
        provider_slug: "opencode".to_string(),
        workspace: workspace_from_db_path(db_path),
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({
            "opencode_db": db_path.display().to_string(),
            "parent_session_id": parent_session_id,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost": cost,
        }),
        source_path: virtual_session_path(db_path, session_id),
        model_name,
    })
}

fn parse_parts(parts: &Value) -> (String, Vec<ToolCall>, Vec<ToolResult>) {
    let Some(items) = parts.as_array() else {
        return (String::new(), Vec::new(), Vec::new());
    };

    let mut text_chunks = Vec::new();
    let mut reasoning_chunks = Vec::new();
    let mut tool_calls = Vec::new();
    let mut tool_results = Vec::new();

    for item in items {
        let part_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
        let data = item.get("data").unwrap_or(&Value::Null);

        match part_type {
            "text" => {
                if let Some(text) = data.get("text").and_then(Value::as_str) {
                    if !text.trim().is_empty() {
                        text_chunks.push(text.to_string());
                    }
                }
            }
            "reasoning" => {
                if let Some(text) = data.get("thinking").and_then(Value::as_str) {
                    if !text.trim().is_empty() {
                        reasoning_chunks.push(text.to_string());
                    }
                }
            }
            "tool_call" => {
                let name = data.get("name").and_then(Value::as_str).filter(|value| !value.is_empty()).unwrap_or("tool_call").to_string();
                let id = data.get("id").and_then(Value::as_str).filter(|value| !value.is_empty()).map(ToString::to_string);
                let input = data.get("input").and_then(Value::as_str).unwrap_or_default();

                tool_calls.push(ToolCall { id, name, arguments: parse_tool_call_arguments(input) });
            }
            "tool_result" => {
                tool_results.push(ToolResult {
                    call_id: data.get("tool_call_id").and_then(Value::as_str).filter(|value| !value.is_empty()).map(ToString::to_string),
                    content: data.get("content").and_then(Value::as_str).unwrap_or_default().to_string(),
                    is_error: data.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                });
            }
            _ => {
                let fallback = flatten_content(data);
                if !fallback.trim().is_empty() {
                    text_chunks.push(fallback);
                }
            }
        }
    }

    let mut content = text_chunks.join("\n");
    if content.trim().is_empty() {
        content = reasoning_chunks.join("\n");
    }
    if content.trim().is_empty() {
        content = tool_results.iter().map(|result| result.content.as_str()).filter(|value| !value.trim().is_empty()).collect::<Vec<_>>().join("\n");
    }

    (content, tool_calls, tool_results)
}

fn parse_tool_call_arguments(input: &str) -> Value {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return json!({});
    }
    serde_json::from_str(trimmed).unwrap_or_else(|_| json!({ "input": input }))
}

fn build_parts(message: &CanonicalMessage) -> Value {
    let mut parts = Vec::new();

    if !message.content.trim().is_empty() {
        let part_type = if message.author.as_deref() == Some("reasoning") { "reasoning" } else { "text" };
        let data = if part_type == "reasoning" { json!({ "thinking": message.content.clone() }) } else { json!({ "text": message.content.clone() }) };
        parts.push(json!({
            "type": part_type,
            "data": data,
        }));
    }

    for call in &message.tool_calls {
        let input = if let Some(text) = call.arguments.as_str() { text.to_string() } else { serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".to_string()) };

        parts.push(json!({
            "type": "tool_call",
            "data": {
                "id": call.id.clone().unwrap_or_default(),
                "name": call.name.clone(),
                "input": input,
                "type": "function",
                "finished": true,
            }
        }));
    }

    for result in &message.tool_results {
        parts.push(json!({
            "type": "tool_result",
            "data": {
                "tool_call_id": result.call_id.clone().unwrap_or_default(),
                "name": "tool",
                "content": result.content.clone(),
                "metadata": "",
                "is_error": result.is_error,
            }
        }));
    }

    Value::Array(parts)
}

fn role_to_opencode(role: &MessageRole) -> &str {
    match role {
        MessageRole::User => "user",
        MessageRole::Assistant => "assistant",
        MessageRole::Tool => "tool",
        MessageRole::System => "system",
        MessageRole::Other(role) => role.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::casr_min::model::{CanonicalMessage, CanonicalSession, MessageRole};

    fn build_session(workspace: &Path, session_id: &str, text: &str) -> CanonicalSession {
        CanonicalSession {
            session_id: session_id.to_string(),
            provider_slug: "codex".to_string(),
            workspace: Some(workspace.to_path_buf()),
            title: Some(text.to_string()),
            started_at: Some(1_701_388_800_000),
            ended_at: Some(1_701_388_801_000),
            messages: vec![CanonicalMessage { idx: 0, role: MessageRole::User, content: text.to_string(), timestamp: Some(1_701_388_800_000), author: None, tool_calls: vec![], tool_results: vec![], extra: Value::Null }],
            metadata: Value::Null,
            source_path: workspace.join(format!("{session_id}.jsonl")),
            model_name: None,
        }
    }

    #[test]
    fn list_session_paths_in_db_refreshes_when_db_changes() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace");

        let first = build_session(&workspace, "seed-1", "first");
        let written_path = write_session(&first, "opc-session-1").expect("write first");
        let db_path = backing_store_path(&written_path);

        let first_paths = list_session_paths_in_db(&db_path).expect("list first");
        assert_eq!(first_paths.len(), 1);

        std::thread::sleep(std::time::Duration::from_millis(20));

        let second = build_session(&workspace, "seed-2", "second");
        write_session(&second, "opc-session-2").expect("write second");

        let second_paths = list_session_paths_in_db(&db_path).expect("list second");
        assert_eq!(second_paths.len(), 2);
    }
}
