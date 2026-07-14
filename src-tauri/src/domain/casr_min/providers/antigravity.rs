//! Antigravity (`agy`) reader adapted from franken_agent_detection.
//!
//! Primary path: `~/.gemini/antigravity-cli/brain/<uuid>/.system_generated/logs/transcript.jsonl`

use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::domain::casr_min::model::{
    parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolCall,
};

pub fn session_roots() -> Vec<PathBuf> {
    let base = base_root();
    if !base.is_dir() {
        return Vec::new();
    }
    let brain = base.join("brain");
    if brain.is_dir() {
        vec![brain]
    } else {
        vec![base]
    }
}

pub fn matches_path(path: &Path) -> bool {
    is_transcript_path(path)
}

pub fn is_transcript_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    path.file_name().and_then(|value| value.to_str()) == Some("transcript.jsonl")
        && normalized.contains("/.system_generated/logs/")
        && (normalized.contains("/.gemini/antigravity-cli/") || normalized.contains("/antigravity-cli/"))
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

    let session_id = conversation_uuid_from_path(path).unwrap_or_else(|| {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("unknown")
            .to_string()
    });
    let model_name = detect_model(&records);
    let title = messages
        .iter()
        .find(|message| message.role == MessageRole::User)
        .map(|message| truncate_title(&message.content, 100));

    Ok(CanonicalSession {
        session_id,
        provider_slug: "antigravity".to_string(),
        workspace: None,
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({ "source": "antigravity", "model": model_name }),
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

fn base_root() -> PathBuf {
    if let Ok(root) = std::env::var("CASS_ANTIGRAVITY_DATA_ROOT") {
        if !root.trim().is_empty() {
            return PathBuf::from(root);
        }
    }
    if let Ok(root) = std::env::var("ANTIGRAVITY_HOME") {
        if !root.trim().is_empty() {
            return PathBuf::from(root);
        }
    }
    dirs::home_dir().unwrap_or_default().join(".gemini").join("antigravity-cli")
}

fn conversation_uuid_from_path(path: &Path) -> Option<String> {
    // .../brain/<uuid>/.system_generated/logs/transcript.jsonl
    path.parent() // logs
        .and_then(Path::parent) // .system_generated
        .and_then(Path::parent) // <uuid>
        .and_then(|dir| dir.file_name())
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(String::from)
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
    let body = if requests.is_empty() {
        content.trim().to_string()
    } else {
        requests.join("\n\n")
    };
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
        return vec![ToolCall {
            id: None,
            name: synthesized_name,
            arguments: Value::Null,
        }];
    };
    arr.iter()
        .map(|tc| {
            let name = tc
                .get("name")
                .or_else(|| tc.get("tool_name"))
                .or_else(|| tc.pointer("/function/name"))
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .map_or_else(|| synthesized_name.clone(), String::from);
            let call_id = tc
                .get("id")
                .or_else(|| tc.get("call_id"))
                .or_else(|| tc.get("tool_call_id"))
                .and_then(Value::as_str)
                .map(String::from);
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
            ToolCall {
                id: call_id,
                name,
                arguments,
            }
        })
        .collect()
}

fn record_to_message(rec: &Value) -> Option<CanonicalMessage> {
    let source = rec.get("source").and_then(Value::as_str).unwrap_or("");
    let step_type = rec.get("type").and_then(Value::as_str).unwrap_or("");
    let created = rec.get("created_at").and_then(parse_timestamp);
    let content = rec.get("content").and_then(Value::as_str).unwrap_or("").to_string();
    let thinking = rec
        .get("thinking")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);
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
            Some(CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: body,
                timestamp: created,
                author: None,
                tool_calls: Vec::new(),
                tool_results: Vec::new(),
                extra: Value::Object(extra),
            })
        }
        "PLANNER_RESPONSE" => {
            if content.trim().is_empty() && thinking.is_none() {
                return None;
            }
            let mut extra = Map::new();
            if let Some(t) = thinking {
                extra.insert("thinking".to_string(), Value::String(t));
            }
            Some(CanonicalMessage {
                idx: 0,
                role: MessageRole::Assistant,
                content,
                timestamp: created,
                author: None,
                tool_calls: Vec::new(),
                tool_results: Vec::new(),
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
            Some(CanonicalMessage {
                idx: 0,
                role: MessageRole::System,
                content,
                timestamp: created,
                author: Some(author.to_string()),
                tool_calls: Vec::new(),
                tool_results: Vec::new(),
                extra: Value::Object(extra),
            })
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
                Some(CanonicalMessage {
                    idx: 0,
                    role: MessageRole::Tool,
                    content,
                    timestamp: created,
                    author: Some(step_type.to_ascii_lowercase()),
                    tool_calls,
                    tool_results: Vec::new(),
                    extra: Value::Object(extra),
                })
            } else {
                if content.trim().is_empty() {
                    return None;
                }
                let mut extra = Map::new();
                extra.insert("agy_type".to_string(), Value::String(step_type.to_string()));
                if !source.is_empty() {
                    extra.insert("agy_source".to_string(), Value::String(source.to_string()));
                }
                Some(CanonicalMessage {
                    idx: 0,
                    role: MessageRole::System,
                    content,
                    timestamp: created,
                    author: None,
                    tool_calls: Vec::new(),
                    tool_results: Vec::new(),
                    extra: Value::Object(extra),
                })
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
    }

    #[test]
    fn matches_transcript_path() {
        let path = Path::new("/Users/demo/.gemini/antigravity-cli/brain/abc/.system_generated/logs/transcript.jsonl");
        assert!(matches_path(path));
        assert!(!matches_path(Path::new("/Users/demo/.gemini/tmp/hash/chats/session-x.json")));
    }
}
