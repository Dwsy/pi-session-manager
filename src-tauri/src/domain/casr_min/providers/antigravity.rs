//! Antigravity (`agy` CLI & Antigravity Desktop / Insiders) reader.
//!
//! Supports both `transcript_full.jsonl` (agy 1.3.5+ / Desktop App) and legacy
//! `transcript.jsonl` under `brain/<uuid>/.system_generated/logs/`, reading
//! titles, previews, and workspace URIs from `conversation_summaries.db`.

use std::path::{Path, PathBuf};

use reqwest::Url;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Map, Value};

use crate::domain::casr_min::model::{parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AntigravityClient {
    Cli,
    Desktop,
    Insiders,
}

impl AntigravityClient {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cli => "cli",
            Self::Desktop => "desktop",
            Self::Insiders => "insiders",
        }
    }
}

pub fn client_kind(path: &Path) -> AntigravityClient {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.contains("/antigravity-insiders/") {
        AntigravityClient::Insiders
    } else if normalized.contains("/antigravity-cli/") {
        AntigravityClient::Cli
    } else if normalized.contains("/.gemini/antigravity/") || normalized.contains("/antigravity/brain/") {
        AntigravityClient::Desktop
    } else {
        AntigravityClient::Cli
    }
}

pub fn is_cli_session(path: &Path) -> bool {
    matches!(client_kind(path), AntigravityClient::Cli)
}

pub fn session_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for base in candidate_base_roots() {
        if !base.is_dir() {
            continue;
        }
        let brain = base.join("brain");
        let candidate = if brain.is_dir() { brain } else { base };
        if !roots.iter().any(|existing| existing == &candidate) {
            roots.push(candidate);
        }
    }
    roots
}

pub fn is_under_antigravity_store(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.contains("/.gemini/antigravity-cli/")
        || normalized.contains("/antigravity-cli/")
        || normalized.contains("/.gemini/antigravity/")
        || normalized.contains("/.gemini/antigravity-insiders/")
        || normalized.contains("/antigravity-insiders/")
    {
        return true;
    }
    for var in ["CASS_ANTIGRAVITY_DATA_ROOT", "ANTIGRAVITY_HOME"] {
        if let Ok(root) = std::env::var(var) {
            let root = root.trim().replace('\\', "/");
            if !root.is_empty() && normalized.starts_with(&root) {
                return true;
            }
        }
    }
    false
}

pub fn matches_path(path: &Path) -> bool {
    is_transcript_path(path)
}

pub fn is_transcript_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or_default();
    let is_primary_name = matches!(file_name, "transcript_full.jsonl" | "transcript.jsonl");
    let is_direct_logs_child = path.parent().and_then(Path::file_name).and_then(|v| v.to_str()) == Some("logs")
        && path.parent().and_then(Path::parent).and_then(Path::file_name).and_then(|v| v.to_str()) == Some(".system_generated");
    is_primary_name && is_direct_logs_child && (is_under_antigravity_store(path) || normalized.contains("/brain/"))
}

/// Whether `path` should be admitted during directory scanning.
///
/// Excludes `chunks/transcript/*.jsonl` shards and deduplicates `transcript.jsonl`
/// when `transcript_full.jsonl` exists alongside it for the same conversation.
pub fn is_discoverable_transcript_path(path: &Path) -> bool {
    if !is_transcript_path(path) {
        return false;
    }
    if path.file_name().and_then(|v| v.to_str()) == Some("transcript.jsonl") {
        if let Some(parent) = path.parent() {
            if parent.join("transcript_full.jsonl").is_file() {
                return false;
            }
        }
    }
    true
}

pub fn resume_command(session_id: &str) -> String {
    format!("agy --conversation {session_id}")
}

pub fn build_target_path(_session: &CanonicalSession, _target_session_id: &str, _now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
    Err("Antigravity is a scan/source provider only; conversion target is unsupported".to_string())
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("Antigravity: failed to read {}: {e}", path.display()))?;
    read_session_from_str(path, &content)
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    let mut records = Vec::new();
    for (lineno, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(trimmed) {
            Ok(value) => records.push(value),
            Err(_) => {
                // Malformed lines are non-fatal, same as FAD.
                let _ = lineno;
            }
        }
    }
    if records.is_empty() {
        return Err(format!("Antigravity: empty transcript {}", path.display()));
    }

    let mut ordered: Vec<&Value> = records.iter().collect();
    ordered.sort_by_key(|record| record.get("step_index").and_then(Value::as_i64).unwrap_or(i64::MAX));

    let mut messages = Vec::new();
    let mut started_at = None;
    let mut ended_at = None;
    for record in ordered {
        if let Some(ts) = record.get("created_at").and_then(parse_timestamp) {
            started_at = Some(started_at.map_or(ts, |cur: i64| cur.min(ts)));
            ended_at = Some(ended_at.map_or(ts, |cur: i64| cur.max(ts)));
        }
        if let Some(message) = record_to_message(record) {
            messages.push(message);
        }
    }
    if messages.is_empty() {
        return Err(format!("Antigravity: transcript produced no messages: {}", path.display()));
    }
    reindex_messages(&mut messages);

    let session_id = conversation_uuid_from_path(path).unwrap_or_else(|| path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("unknown").to_string());
    let summary = read_summary(path, &session_id)?;
    let workspace = summary.workspace;
    let model_name = detect_model(&records);
    let client = client_kind(path);
    let title = summary
        .title
        .or(summary.preview)
        .or_else(|| messages.iter().find(|message| message.role == MessageRole::User).map(|message| truncate_title(&message.content, 100)));

    Ok(CanonicalSession {
        session_id,
        provider_slug: "antigravity".to_string(),
        workspace,
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({ "source": "antigravity", "client": client.as_str(), "model": model_name }),
        source_path: path.to_path_buf(),
        model_name,
    })
}

pub fn render_session(session: &CanonicalSession, _target_session_id: &str) -> Result<String, String> {
    let mut lines = Vec::with_capacity(session.messages.len());
    for message in &session.messages {
        let role = match &message.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
            MessageRole::Other(other) => other.as_str(),
        };
        lines.push(
            serde_json::to_string(&json!({
                "role": role,
                "content": message.content,
                "timestamp": message.timestamp,
            }))
            .map_err(|e| e.to_string())?,
        );
    }
    Ok(lines.join("\n") + "\n")
}

fn candidate_base_roots() -> Vec<PathBuf> {
    if let Ok(root) = std::env::var("CASS_ANTIGRAVITY_DATA_ROOT") {
        if !root.trim().is_empty() {
            return vec![PathBuf::from(root)];
        }
    }
    if let Ok(root) = std::env::var("ANTIGRAVITY_HOME") {
        if !root.trim().is_empty() {
            return vec![PathBuf::from(root)];
        }
    }
    let gemini_dir = dirs::home_dir().unwrap_or_default().join(".gemini");
    vec![
        gemini_dir.join("antigravity-cli"),
        gemini_dir.join("antigravity"),
        gemini_dir.join("antigravity-insiders"),
    ]
}

fn conversation_uuid_from_path(path: &Path) -> Option<String> {
    path.ancestors().find(|dir| dir.parent().and_then(Path::file_name).is_some_and(|name| name == "brain")).and_then(|dir| dir.file_name()).and_then(|name| name.to_str()).filter(|name| !name.trim().is_empty()).map(String::from)
}

#[derive(Default)]
struct ConversationSummary {
    title: Option<String>,
    preview: Option<String>,
    workspace: Option<PathBuf>,
}

fn read_summary(path: &Path, session_id: &str) -> Result<ConversationSummary, String> {
    let Some(root) = path.ancestors().find(|dir| dir.file_name().is_some_and(|name| name == "brain")).and_then(Path::parent) else {
        return Ok(ConversationSummary::default());
    };
    let db_path = root.join("conversation_summaries.db");
    if !db_path.try_exists().map_err(|e| format!("Antigravity: failed to inspect workspace metadata {}: {e}", db_path.display()))? {
        return Ok(ConversationSummary::default());
    }

    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| format!("Antigravity: failed to open workspace metadata {}: {e}", db_path.display()))?;
    let row: Option<(Option<String>, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT title, preview, workspace_uris FROM conversation_summaries WHERE conversation_id = ?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .or_else(|_| {
            conn.query_row(
                "SELECT title, NULL, workspace_uris FROM conversation_summaries WHERE conversation_id = ?1",
                [session_id],
                |row| Ok((row.get(0)?, None, row.get(2)?)),
            )
            .optional()
        })
        .or_else(|_| {
            conn.query_row(
                "SELECT NULL, NULL, workspace_uris FROM conversation_summaries WHERE conversation_id = ?1",
                [session_id],
                |row| Ok((None, None, row.get(2)?)),
            )
            .optional()
        })
        .map_err(|e| format!("Antigravity: failed to read workspace for {session_id}: {e}"))?;

    let Some((raw_title, raw_preview, workspace_uris)) = row else {
        return Ok(ConversationSummary::default());
    };
    let title = raw_title.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let preview = raw_preview.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let workspace = match workspace_uris {
        None => None,
        Some(uris_json) => {
            let workspaces: Vec<String> = serde_json::from_str(&uris_json).map_err(|e| format!("Antigravity: invalid workspace metadata for {session_id}: {e}"))?;
            if workspaces.is_empty() {
                None
            } else {
                let mut resolved = None;
                for uri in &workspaces {
                    if let Ok(url) = Url::parse(uri) {
                        if let Ok(file_path) = url.to_file_path() {
                            resolved = Some(file_path);
                            break;
                        }
                    }
                }
                if resolved.is_none() {
                    return Err(format!("Antigravity: workspace URI for {session_id} is not a local file path"));
                }
                resolved
            }
        }
    };
    Ok(ConversationSummary { title, preview, workspace })
}

fn extract_tagged_blocks(content: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find(&open) {
        let after = &rest[start + open.len()..];
        let Some(end) = after.find(&close) else {
            break;
        };
        out.push(after[..end].trim().to_string());
        rest = &after[end + close.len()..];
    }
    out
}

fn extract_user_request(content: &str) -> (String, Option<String>, Option<String>) {
    let requests = extract_tagged_blocks(content, "USER_REQUEST");
    let settings = extract_tagged_blocks(content, "USER_SETTINGS_CHANGE").into_iter().next();
    let metadata = extract_tagged_blocks(content, "ADDITIONAL_METADATA").into_iter().next();
    let body = if requests.is_empty() { content.trim().to_string() } else { requests.join("\n\n") };
    (body, settings, metadata)
}

fn model_from_settings(settings: &str) -> Option<String> {
    let from_marker = " from ";
    let to_marker = " to ";
    let search_from = settings.find(from_marker).map_or(0, |i| i + from_marker.len());
    let rel = settings[search_from..].find(to_marker)?;
    let start = search_from + rel + to_marker.len();
    let tail = &settings[start..];
    let end = tail.find(". ").unwrap_or(tail.len());
    let model = tail[..end].trim().trim_end_matches('.').trim();
    if model.is_empty() || model.eq_ignore_ascii_case("none") {
        return None;
    }
    Some(model.to_string())
}

fn detect_model(records: &[Value]) -> Option<String> {
    for record in records {
        if record.get("type").and_then(Value::as_str) != Some("USER_INPUT") {
            continue;
        }
        let content = record.get("content").and_then(Value::as_str).unwrap_or("");
        if let Some(settings) = extract_tagged_blocks(content, "USER_SETTINGS_CHANGE").into_iter().next() {
            if let Some(model) = model_from_settings(&settings) {
                return Some(model);
            }
        }
    }
    None
}

fn parse_tool_calls(tool_calls: Option<&Value>, step_type: &str) -> Vec<ToolCall> {
    let synthesized_name = step_type.to_ascii_lowercase();
    let Some(arr) = tool_calls.and_then(Value::as_array).filter(|a| !a.is_empty()) else {
        return vec![ToolCall { id: None, name: synthesized_name, arguments: Value::Null }];
    };
    arr.iter()
        .map(|tc| {
            let name = tc.get("name").or_else(|| tc.get("tool_name")).or_else(|| tc.pointer("/function/name")).and_then(Value::as_str).filter(|s| !s.trim().is_empty()).map_or_else(|| synthesized_name.clone(), String::from);
            let call_id = tc.get("id").or_else(|| tc.get("call_id")).or_else(|| tc.get("tool_call_id")).and_then(Value::as_str).map(String::from);
            let arguments = tc
                .get("arguments")
                .or_else(|| tc.get("args"))
                .or_else(|| tc.get("input"))
                .or_else(|| tc.pointer("/function/arguments"))
                .cloned()
                .map(|raw| match raw {
                    Value::String(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::String(s)),
                    other => other,
                })
                .unwrap_or(Value::Null);
            ToolCall { id: call_id, name, arguments }
        })
        .collect()
}

fn record_to_message(rec: &Value) -> Option<CanonicalMessage> {
    let source = rec.get("source").and_then(Value::as_str).unwrap_or("");
    let step_type = rec.get("type").and_then(Value::as_str).unwrap_or("");
    let created = rec.get("created_at").and_then(parse_timestamp);
    let content = rec.get("content").and_then(Value::as_str).unwrap_or("").to_string();
    let thinking = rec.get("thinking").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let tool_calls = rec.get("tool_calls").filter(|v| v.is_array());

    match step_type {
        "USER_INPUT" => {
            let (body, settings, metadata) = extract_user_request(&content);
            if body.trim().is_empty() {
                return None;
            }
            let mut extra = Map::new();
            if let Some(s) = settings {
                extra.insert("settings_change".to_string(), Value::String(s));
            }
            if let Some(m) = metadata {
                extra.insert("additional_metadata".to_string(), Value::String(m));
            }
            Some(CanonicalMessage { idx: 0, role: MessageRole::User, content: body, timestamp: created, author: None, tool_calls: Vec::new(), tool_results: Vec::new(), extra: Value::Object(extra) })
        }
        "PLANNER_RESPONSE" => {
            let parsed_tool_calls = if tool_calls.and_then(Value::as_array).is_some_and(|a| !a.is_empty()) {
                parse_tool_calls(tool_calls, step_type)
            } else {
                Vec::new()
            };
            if content.trim().is_empty() && thinking.is_none() && parsed_tool_calls.is_empty() {
                return None;
            }
            let mut extra = Map::new();
            if let Some(t) = thinking {
                extra.insert("thinking".to_string(), Value::String(t));
            }
            Some(CanonicalMessage { idx: 0, role: MessageRole::Assistant, content, timestamp: created, author: None, tool_calls: parsed_tool_calls, tool_results: Vec::new(), extra: Value::Object(extra) })
        }
        "GENERIC" if source == "MODEL" => {
            if content.trim().is_empty() {
                return None;
            }
            let mut extra = Map::new();
            extra.insert("agy_type".to_string(), Value::String(step_type.to_string()));
            Some(CanonicalMessage {
                idx: 0,
                role: MessageRole::Tool,
                content: content.clone(),
                timestamp: created,
                author: Some("tool_output".to_string()),
                tool_calls: Vec::new(),
                tool_results: vec![ToolResult { call_id: None, content, is_error: false }],
                extra: Value::Object(extra),
            })
        }
        "CONVERSATION_HISTORY" => None,
        "EPHEMERAL_MESSAGE" | "SYSTEM_MESSAGE" => {
            if content.trim().is_empty() {
                return None;
            }
            let mut extra = Map::new();
            extra.insert("agy_type".to_string(), Value::String(step_type.to_string()));
            let author = if step_type == "EPHEMERAL_MESSAGE" { "ephemeral" } else { "system" };
            Some(CanonicalMessage { idx: 0, role: MessageRole::System, content, timestamp: created, author: Some(author.to_string()), tool_calls: Vec::new(), tool_results: Vec::new(), extra: Value::Object(extra) })
        }
        _ => {
            if source == "MODEL" {
                let tool_calls = parse_tool_calls(tool_calls, step_type);
                if content.trim().is_empty() && thinking.is_none() && tool_calls.is_empty() {
                    return None;
                }
                let mut extra = Map::new();
                extra.insert("agy_type".to_string(), Value::String(step_type.to_string()));
                if let Some(t) = thinking {
                    extra.insert("thinking".to_string(), Value::String(t));
                }
                Some(CanonicalMessage { idx: 0, role: MessageRole::Tool, content, timestamp: created, author: Some(step_type.to_ascii_lowercase()), tool_calls, tool_results: Vec::new(), extra: Value::Object(extra) })
            } else {
                if content.trim().is_empty() {
                    return None;
                }
                let mut extra = Map::new();
                extra.insert("agy_type".to_string(), Value::String(step_type.to_string()));
                if !source.is_empty() {
                    extra.insert("agy_source".to_string(), Value::String(source.to_string()));
                }
                Some(CanonicalMessage { idx: 0, role: MessageRole::System, content, timestamp: created, author: None, tool_calls: Vec::new(), tool_results: Vec::new(), extra: Value::Object(extra) })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_user_and_planner_response() {
        let content = r#"
{"step_index":1,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-06-11T20:14:42Z","content":"<USER_REQUEST>hello agy</USER_REQUEST><USER_SETTINGS_CHANGE>The user changed setting Model Selection from None to Gemini 3.1 Pro (High). No need to comment.</USER_SETTINGS_CHANGE>"}
{"step_index":2,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-06-11T20:14:43Z","content":"hi there","thinking":"plan"}
{"step_index":3,"source":"MODEL","type":"VIEW_FILE","created_at":"2026-06-11T20:14:44Z","content":"file body","tool_calls":[{"name":"view_file","arguments":{"path":"a.rs"}}]}
"#;
        let path = Path::new("/tmp/.gemini/antigravity-cli/brain/f1e2d3c4-b5a6-4789-9abc-def012345678/.system_generated/logs/transcript.jsonl");
        let session = read_session_from_str(path, content).expect("parse");
        assert_eq!(session.session_id, "f1e2d3c4-b5a6-4789-9abc-def012345678");
        assert_eq!(session.messages.len(), 3);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "hello agy");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[2].role, MessageRole::Tool);
        assert_eq!(session.model_name.as_deref(), Some("Gemini 3.1 Pro (High)"));
        assert_eq!(session.workspace, None);
    }

    #[test]
    fn scanned_transcripts_use_their_conversation_workspace() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("antigravity-cli");
        std::fs::create_dir_all(&root).expect("mkdir");
        let conn = rusqlite::Connection::open(root.join("conversation_summaries.db")).expect("open summaries");
        conn.execute("CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, workspace_uris TEXT NOT NULL)", []).expect("create summaries");

        let content = r#"{"step_index":1,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-11-23T21:00:00Z","content":"<USER_REQUEST>hello agy</USER_REQUEST>"}"#;
        for (id, directory) in [("documents-session", "Documents"), ("project-session", "My Projects/日本語")] {
            let workspace = temp.path().join(directory);
            let uri = reqwest::Url::from_file_path(&workspace).expect("workspace URI");
            conn.execute("INSERT INTO conversation_summaries VALUES (?1, ?2)", rusqlite::params![id, serde_json::to_string(&[uri.as_str()]).unwrap()]).expect("insert summary");

            for log in ["transcript.jsonl", "transcript_full.jsonl", "chunks/transcript/00000000.jsonl"] {
                let path = root.join("brain").join(id).join(".system_generated/logs").join(log);
                std::fs::create_dir_all(path.parent().unwrap()).expect("mkdir logs");
                std::fs::write(&path, content).expect("write transcript");

                let (_, canonical) = crate::domain::session_bridge::read_canonical_session_from_path(&path).expect("read canonical");
                assert_eq!(canonical.session_id, id);
                assert_eq!(canonical.workspace.as_deref(), Some(workspace.as_path()));

                let (info, _) = crate::core::scanner::parse_session_info(&path).expect("scan transcript");
                assert_eq!(Path::new(&info.cwd), workspace.as_path());
                assert!(crate::domain::session_list::session_matches_project_filter(&info, &workspace.to_string_lossy()));
            }
        }
    }

    #[test]
    fn distinguishes_missing_workspace_metadata_from_invalid_metadata() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("brain/session/.system_generated/logs/transcript.jsonl");
        let content = r#"{"step_index":1,"source":"USER_EXPLICIT","type":"USER_INPUT","content":"hello"}"#;
        let conn = rusqlite::Connection::open(temp.path().join("conversation_summaries.db")).expect("open summaries");
        conn.execute("CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, workspace_uris TEXT NOT NULL)", []).expect("create summaries");

        assert_eq!(read_session_from_str(&path, content).expect("no summary").workspace, None);
        conn.execute("INSERT INTO conversation_summaries VALUES ('session', '[]')", []).expect("insert summary");
        assert_eq!(read_session_from_str(&path, content).expect("no workspaces").workspace, None);

        for invalid in ["not-json", r#"["https://example.com/project"]"#] {
            conn.execute("UPDATE conversation_summaries SET workspace_uris = ?1", [invalid]).expect("update summary");
            let error = read_session_from_str(&path, content).expect_err("invalid metadata must be reported");
            assert!(error.contains("workspace"), "{error}");
        }
    }

    #[test]
    fn matches_transcript_path() {
        let path = Path::new("/Users/demo/.gemini/antigravity-cli/brain/abc/.system_generated/logs/transcript.jsonl");
        assert!(matches_path(path));
        assert!(matches_path(Path::new("/Users/demo/.gemini/antigravity-cli/brain/abc/.system_generated/logs/transcript_full.jsonl")));
        assert!(matches_path(Path::new("/Users/demo/.gemini/antigravity/brain/abc/.system_generated/logs/transcript_full.jsonl")));
        assert!(matches_path(Path::new("/Users/demo/.gemini/antigravity-insiders/brain/abc/.system_generated/logs/transcript_full.jsonl")));
        assert!(!matches_path(Path::new("/Users/demo/.gemini/antigravity-cli/brain/abc/.system_generated/logs/chunks/transcript/00000000.jsonl")));
        assert!(!matches_path(Path::new("/Users/demo/.gemini/tmp/hash/chats/session-x.json")));
    }

    #[test]
    fn deduplicates_transcript_when_transcript_full_exists_and_distinguishes_clients() {
        let temp = tempfile::tempdir().expect("tempdir");
        let cli_logs = temp.path().join(".gemini/antigravity-cli/brain/sess-1/.system_generated/logs");
        std::fs::create_dir_all(&cli_logs).expect("mkdir");
        let full = cli_logs.join("transcript_full.jsonl");
        let legacy = cli_logs.join("transcript.jsonl");
        std::fs::write(&legacy, "{}").expect("write legacy");
        assert!(is_discoverable_transcript_path(&legacy));
        std::fs::write(&full, "{}").expect("write full");
        assert!(is_discoverable_transcript_path(&full));
        assert!(!is_discoverable_transcript_path(&legacy));

        assert_eq!(client_kind(&full), AntigravityClient::Cli);
        assert!(is_cli_session(&full));
        let desktop = temp.path().join(".gemini/antigravity/brain/sess-2/.system_generated/logs/transcript_full.jsonl");
        assert_eq!(client_kind(&desktop), AntigravityClient::Desktop);
        assert!(!is_cli_session(&desktop));
        let insiders = temp.path().join(".gemini/antigravity-insiders/brain/sess-3/.system_generated/logs/transcript_full.jsonl");
        assert_eq!(client_kind(&insiders), AntigravityClient::Insiders);
        assert!(!is_cli_session(&insiders));
    }

    #[test]
    fn parses_planner_tool_calls_generic_results_and_summary_title() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join(".gemini/antigravity-cli");
        let logs = root.join("brain/sess-tools/.system_generated/logs");
        std::fs::create_dir_all(&logs).expect("mkdir");
        let conn = rusqlite::Connection::open(root.join("conversation_summaries.db")).expect("open db");
        conn.execute("CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT, preview TEXT, workspace_uris TEXT)", []).expect("create table");
        conn.execute("INSERT INTO conversation_summaries VALUES ('sess-tools', 'Fix auth bug', 'preview text', '[]')", []).expect("insert");

        let content = r#"
{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-11-25T10:00:00Z","content":"<USER_REQUEST>read a.txt</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-11-25T10:00:01Z","content":"","tool_calls":[{"name":"read_file","args":{"path":"a.txt"}}]}
{"step_index":2,"source":"MODEL","type":"GENERIC","created_at":"2026-11-25T10:00:02Z","content":"1: hello"}
{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-11-25T10:00:03Z","content":"Done."}
"#;
        let path = logs.join("transcript_full.jsonl");
        let session = read_session_from_str(&path, content).expect("parse");
        assert_eq!(session.title.as_deref(), Some("Fix auth bug"));
        assert_eq!(session.messages.len(), 4);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].tool_calls.len(), 1);
        assert_eq!(session.messages[1].tool_calls[0].name, "read_file");
        assert_eq!(session.messages[2].role, MessageRole::Tool);
        assert_eq!(session.messages[2].tool_results.len(), 1);
        assert_eq!(session.messages[2].tool_results[0].content, "1: hello");
    }
}
