use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

use crate::domain::casr_min::model::{
    flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession,
    MessageRole,
};

const BUBBLE_TYPE_USER: i64 = 1;
const BUBBLE_TYPE_ASSISTANT: i64 = 2;

#[derive(Clone)]
struct CursorPathListCacheEntry {
    modified_at_ms: u128,
    session_paths: Vec<PathBuf>,
}

fn session_path_cache() -> &'static RwLock<HashMap<String, CursorPathListCacheEntry>> {
    static CACHE: OnceLock<RwLock<HashMap<String, CursorPathListCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn db_modified_ms(path: &Path) -> Result<u128, String> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|e| format!("Cursor: failed to read DB metadata {}: {e}", path.display()))?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|e| format!("Cursor: failed to normalize DB mtime {}: {e}", path.display()))
}

pub fn session_roots() -> Vec<PathBuf> {
    find_db_files()
}

pub fn matches_path(path: &Path) -> bool {
    is_db_path(path)
        || path
            .parent()
            .is_some_and(|parent| parent.is_file() && parent.extension().and_then(|ext| ext.to_str()) == Some("vscdb"))
}

pub fn is_db_path(path: &Path) -> bool {
    path.file_name().and_then(|value| value.to_str()) == Some("state.vscdb")
        || path.extension().and_then(|ext| ext.to_str()) == Some("vscdb")
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

    let conn = open_db(db_path)?;
    let session_paths = list_composer_ids(&conn)
        .into_iter()
        .map(|composer_id| virtual_session_path(db_path, &composer_id))
        .collect::<Vec<_>>();

    if let Ok(mut guard) = session_path_cache().write() {
        guard.insert(
            cache_key,
            CursorPathListCacheEntry {
                modified_at_ms,
                session_paths: session_paths.clone(),
            },
        );
    }
    Ok(session_paths)
}

pub fn resume_command() -> String {
    "cursor .".to_string()
}

pub fn build_target_path(_session: &CanonicalSession, _target_session_id: &str, _now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
    Err("Cursor is a scan/source provider only; conversion target is unsupported".to_string())
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    if let Some((db_path, composer_id)) = parse_virtual_path(path) {
        let conn = open_db(&db_path)?;
        return read_composer_session(&conn, &composer_id, &db_path);
    }

    if is_db_path(path) && path.is_file() {
        let conn = open_db(path)?;
        let ids = list_composer_ids(&conn);
        if let Some(first_id) = ids.first() {
            return read_composer_session(&conn, first_id, path);
        }
        return read_legacy_session(&conn, path);
    }

    Err(format!("Cursor: no sessions found at {}", path.display()))
}

pub fn read_session_from_str(_path: &Path, _content: &str) -> Result<CanonicalSession, String> {
    Err("Cursor sessions are SQLite-backed; reading from string is unsupported".to_string())
}

pub fn render_session(_session: &CanonicalSession, _target_session_id: &str) -> Result<String, String> {
    Err("Cursor does not support text preview rendering".to_string())
}

fn config_dir() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("CURSOR_HOME") {
        if !home.trim().is_empty() {
            return Some(PathBuf::from(home));
        }
    }
    #[cfg(target_os = "macos")]
    {
        return dirs::data_dir().map(|d| d.join("Cursor"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        dirs::config_dir().map(|c| c.join("Cursor"))
    }
}

fn find_db_files() -> Vec<PathBuf> {
    let Some(config_dir) = config_dir() else {
        return vec![];
    };
    let mut dbs = Vec::new();
    let global_db = config_dir.join("User/globalStorage/state.vscdb");
    if global_db.is_file() {
        dbs.push(global_db);
    }
    let ws_storage = config_dir.join("User/workspaceStorage");
    if ws_storage.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&ws_storage) {
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let candidate = entry.path().join("state.vscdb");
                    if candidate.is_file() {
                        dbs.push(candidate);
                    }
                }
            }
        }
    }
    dbs
}

fn virtual_session_path(db_path: &Path, composer_id: &str) -> PathBuf {
    db_path.join(urlencoding::encode(composer_id).as_ref())
}

fn parse_virtual_path(path: &Path) -> Option<(PathBuf, String)> {
    let parent = path.parent()?;
    if !(parent.is_file() && parent.extension().and_then(|ext| ext.to_str()) == Some("vscdb")) {
        return None;
    }
    let filename = path.file_name()?.to_str()?;
    let composer_id = urlencoding::decode(filename).map(|s| s.into_owned()).unwrap_or_else(|_| filename.to_string());
    Some((parent.to_path_buf(), composer_id))
}

fn open_db(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e| format!("Cursor: failed to open DB {}: {e}", path.display()))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("Cursor: failed to set busy timeout: {e}"))?;
    Ok(conn)
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1")
        .and_then(|mut stmt| stmt.exists(rusqlite::params![table]))
        .unwrap_or(false)
}

fn list_composer_ids(conn: &Connection) -> Vec<String> {
    if !table_exists(conn, "cursorDiskKV") {
        return vec![];
    }
    let Ok(mut stmt) = conn.prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'") else {
        return vec![];
    };
    stmt.query_map([], |row| {
        let key: String = row.get(0)?;
        Ok(key.strip_prefix("composerData:").unwrap_or(&key).to_string())
    })
    .ok()
    .into_iter()
    .flatten()
    .filter_map(Result::ok)
    .collect()
}

fn fetch_bubbles(conn: &Connection, composer_id: &str) -> HashMap<String, Value> {
    let prefix = format!("bubbleId:{composer_id}:");
    let prefix_upper = format!("bubbleId:{composer_id};");
    let mut bubbles = HashMap::new();
    let Ok(mut stmt) = conn.prepare("SELECT key, value FROM cursorDiskKV WHERE key >= ?1 AND key < ?2") else {
        return bubbles;
    };
    let Ok(rows) = stmt.query_map(rusqlite::params![prefix, prefix_upper], |row| {
        let key: String = row.get(0)?;
        let value: String = row.get(1)?;
        Ok((key, value))
    }) else {
        return bubbles;
    };
    for row in rows.flatten() {
        let (key, value_str) = row;
        let bubble_id = key.strip_prefix(&prefix).unwrap_or(&key);
        if let Ok(val) = serde_json::from_str::<Value>(&value_str) {
            bubbles.insert(bubble_id.to_string(), val);
        }
    }
    bubbles
}

fn read_composer_session(conn: &Connection, composer_id: &str, db_path: &Path) -> Result<CanonicalSession, String> {
    let composer_json: String = conn
        .query_row(
            "SELECT value FROM cursorDiskKV WHERE key = ?1",
            rusqlite::params![format!("composerData:{composer_id}")],
            |row| row.get(0),
        )
        .map_err(|e| format!("Cursor: composerData not found for {composer_id}: {e}"))?;
    let composer: Value = serde_json::from_str(&composer_json).map_err(|e| format!("Cursor: invalid composerData JSON: {e}"))?;
    let bubbles = fetch_bubbles(conn, composer_id);
    parse_composer(composer_id, &composer, &bubbles, db_path)
}

fn parse_composer(
    composer_id: &str,
    composer: &Value,
    bubbles: &HashMap<String, Value>,
    source_path: &Path,
) -> Result<CanonicalSession, String> {
    let mut messages: Vec<CanonicalMessage> = Vec::new();
    let mut model_counts: HashMap<String, usize> = HashMap::new();
    let mut started_at = composer.get("createdAt").and_then(parse_timestamp);
    let mut ended_at = composer.get("lastUpdatedAt").and_then(parse_timestamp);
    let workspace = extract_workspace_from_bubbles(bubbles).or_else(|| extract_workspace_from_composer(composer));

    if let Some(headers) = composer.get("fullConversationHeadersOnly").and_then(Value::as_array) {
        for header in headers {
            let bubble_id = header.get("bubbleId").and_then(Value::as_str).unwrap_or("");
            if bubble_id.is_empty() {
                continue;
            }
            if let Some(bubble) = bubbles.get(bubble_id) {
                if let Some(msg) = parse_bubble(bubble, &mut model_counts, &mut started_at, &mut ended_at) {
                    messages.push(msg);
                }
            }
        }
    } else if let Some(tabs) = composer.get("tabs").and_then(Value::as_array) {
        for tab in tabs {
            if let Some(tab_bubbles) = tab.get("bubbles").and_then(Value::as_array) {
                for bubble in tab_bubbles {
                    if let Some(msg) = parse_bubble(bubble, &mut model_counts, &mut started_at, &mut ended_at) {
                        messages.push(msg);
                    }
                }
            }
        }
    } else if let Some(conv_map) = composer.get("conversationMap").and_then(Value::as_object) {
        for (_conv_id, conv) in conv_map {
            if let Some(conv_bubbles) = conv.get("bubbles").and_then(Value::as_array) {
                for bubble in conv_bubbles {
                    if let Some(msg) = parse_bubble(bubble, &mut model_counts, &mut started_at, &mut ended_at) {
                        messages.push(msg);
                    }
                }
            }
        }
    } else if let Some(content) = extract_bubble_content(composer) {
        if !content.trim().is_empty() {
            messages.push(CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content,
                timestamp: started_at,
                author: None,
                tool_calls: Vec::new(),
                tool_results: Vec::new(),
                extra: composer.clone(),
            });
        }
    }

    reindex_messages(&mut messages);
    let session_title = composer
        .get("name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| messages.iter().find(|m| m.role == MessageRole::User).map(|m| truncate_title(&m.content, 100)));
    let model_name = model_counts.into_iter().max_by_key(|(_, count)| *count).map(|(name, _)| name);
    let mut metadata = serde_json::Map::new();
    metadata.insert("source".into(), Value::String("cursor".to_string()));
    if let Some(model_config) = composer.get("modelConfig") {
        metadata.insert("modelConfig".into(), model_config.clone());
    }
    if let Some(mode) = composer.get("unifiedMode").and_then(Value::as_str) {
        metadata.insert("unifiedMode".into(), Value::String(mode.to_string()));
    }

    Ok(CanonicalSession {
        session_id: composer_id.to_string(),
        provider_slug: "cursor".to_string(),
        workspace,
        title: session_title,
        started_at,
        ended_at,
        messages,
        metadata: Value::Object(metadata),
        source_path: virtual_session_path(source_path, composer_id),
        model_name,
    })
}

fn extract_bubble_content(bubble: &Value) -> Option<String> {
    for field in ["text", "rawText", "richText", "content", "message"] {
        if let Some(val) = bubble.get(field) {
            let text = flatten_content(val);
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }
    None
}

fn parse_bubble(
    bubble: &Value,
    model_counts: &mut HashMap<String, usize>,
    started_at: &mut Option<i64>,
    ended_at: &mut Option<i64>,
) -> Option<CanonicalMessage> {
    let content = extract_bubble_content(bubble)?;
    let role = determine_bubble_role(bubble);
    let author = bubble
        .get("modelType")
        .and_then(Value::as_str)
        .or_else(|| bubble.get("model").and_then(Value::as_str))
        .or_else(|| bubble.pointer("/modelInfo/modelName").and_then(Value::as_str))
        .filter(|s| !s.is_empty())
        .map(String::from);
    if let Some(ref model) = author {
        *model_counts.entry(model.clone()).or_insert(0) += 1;
    }
    let timestamp = bubble.get("timestamp").or_else(|| bubble.get("createdAt")).and_then(parse_timestamp);
    if let Some(ts) = timestamp {
        *started_at = Some(started_at.map_or(ts, |s| s.min(ts)));
        *ended_at = Some(ended_at.map_or(ts, |e| e.max(ts)));
    }
    Some(CanonicalMessage {
        idx: 0,
        role,
        content,
        timestamp,
        author,
        tool_calls: Vec::new(),
        tool_results: Vec::new(),
        extra: bubble.clone(),
    })
}

fn determine_bubble_role(bubble: &Value) -> MessageRole {
    if let Some(num_type) = bubble.get("type").and_then(Value::as_i64) {
        return match num_type {
            BUBBLE_TYPE_USER => MessageRole::User,
            BUBBLE_TYPE_ASSISTANT => MessageRole::Assistant,
            _ => MessageRole::Assistant,
        };
    }
    if let Some(type_str) = bubble.get("type").and_then(Value::as_str) {
        return normalize_cursor_role(type_str);
    }
    if let Some(role_str) = bubble.get("role").and_then(Value::as_str) {
        return normalize_cursor_role(role_str);
    }
    MessageRole::Assistant
}

fn normalize_cursor_role(role_str: &str) -> MessageRole {
    match role_str.to_ascii_lowercase().as_str() {
        "user" | "human" => MessageRole::User,
        "assistant" | "ai" | "bot" | "model" | "agent" => MessageRole::Assistant,
        other => normalize_role(other),
    }
}

fn extract_workspace_from_bubbles(bubbles: &HashMap<String, Value>) -> Option<PathBuf> {
    for bubble in bubbles.values() {
        if let Some(dir) = bubble.get("workspaceProjectDir").and_then(Value::as_str) {
            if !dir.is_empty() {
                return Some(PathBuf::from(dir));
            }
        }
        if let Some(uris) = bubble.get("workspaceUris").and_then(Value::as_array) {
            for uri in uris {
                if let Some(uri_str) = uri.as_str() {
                    if let Some(path) = parse_workspace_uri(uri_str) {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

fn extract_workspace_from_composer(composer: &Value) -> Option<PathBuf> {
    composer
        .get("workspacePath")
        .or_else(|| composer.get("projectPath"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

fn parse_workspace_uri(uri: &str) -> Option<PathBuf> {
    if let Some(file_path) = uri.strip_prefix("file://") {
        let decoded = urlencoding::decode(file_path).ok()?;
        return Some(PathBuf::from(decoded.as_ref()));
    }
    if let Some(rest) = uri.strip_prefix("vscode-remote://") {
        if let Some(slash_idx) = rest.find('/') {
            let path_part = &rest[slash_idx..];
            let decoded = urlencoding::decode(path_part).ok()?;
            return Some(PathBuf::from(decoded.as_ref()));
        }
    }
    None
}

fn read_legacy_session(conn: &Connection, db_path: &Path) -> Result<CanonicalSession, String> {
    if !table_exists(conn, "ItemTable") {
        return Err(format!("Cursor: no cursorDiskKV or ItemTable found in {}", db_path.display()));
    }
    let mut stmt = conn
        .prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%aichat%chatdata%' OR key LIKE '%composer%' ORDER BY key LIMIT 1")
        .map_err(|e| format!("Cursor: failed to query legacy ItemTable: {e}"))?;
    let result: Option<(String, String)> = stmt
        .query_row([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })
        .ok();
    let (entry_key, entry_value) = result.ok_or_else(|| format!("Cursor: no legacy chat data found in {}", db_path.display()))?;
    let data: Value = serde_json::from_str(&entry_value).map_err(|e| format!("Cursor: invalid JSON in legacy entry {entry_key}: {e}"))?;
    let empty_map = HashMap::new();
    parse_composer(&entry_key, &data, &empty_map, db_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_composer_modern_headers_only() {
        let composer = json!({
            "name": "demo",
            "createdAt": 1_700_000_000_000i64,
            "lastUpdatedAt": 1_700_000_100_000i64,
            "fullConversationHeadersOnly": [
                {"bubbleId": "b1"},
                {"bubbleId": "b2"}
            ]
        });
        let mut bubbles = HashMap::new();
        bubbles.insert("b1".to_string(), json!({"type": 1, "text": "hello", "timestamp": 1_700_000_000_000i64}));
        bubbles.insert("b2".to_string(), json!({"type": 2, "text": "world", "timestamp": 1_700_000_100_000i64, "modelType": "gpt"}));
        let session = parse_composer("cmp-1", &composer, &bubbles, Path::new("/tmp/state.vscdb")).expect("parse");
        assert_eq!(session.session_id, "cmp-1");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.model_name.as_deref(), Some("gpt"));
    }
}
