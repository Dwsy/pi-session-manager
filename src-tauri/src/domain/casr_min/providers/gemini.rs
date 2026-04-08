use std::io::BufReader;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::domain::casr_min::model::{
    flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title,
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult,
};

pub fn session_roots() -> Vec<PathBuf> {
    let Some(tmp) = tmp_dir() else {
        return vec![];
    };
    if !tmp.is_dir() {
        return vec![];
    }

    std::fs::read_dir(&tmp)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let chats = entry.path().join("chats");
            chats.is_dir().then_some(chats)
        })
        .collect()
}

pub fn matches_path(path: &Path) -> bool {
    is_session_file(path)
}

pub fn is_session_file(path: &Path) -> bool {
    path.parent()
        .and_then(|parent| parent.file_name())
        .and_then(|value| value.to_str())
        == Some("chats")
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with("session-") && name.ends_with(".json"))
}

pub fn project_hash(workspace: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(workspace.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn session_filename(session_id: &str, now: &chrono::DateTime<chrono::Utc>) -> String {
    let ts = now.format("%Y-%m-%dT%H-%M").to_string();
    let prefix: String = session_id.chars().take(8).collect();
    format!("session-{ts}-{prefix}.json")
}

pub fn build_target_path(
    session: &CanonicalSession,
    target_session_id: &str,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<PathBuf, String> {
    let tmp_dir = tmp_dir().ok_or_else(|| "cannot determine Gemini tmp directory".to_string())?;
    let workspace_path = session.workspace.as_deref().unwrap_or(Path::new("/tmp"));
    let hash = session
        .metadata
        .get("project_hash")
        .or_else(|| session.metadata.get("projectHash"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| project_hash(workspace_path));
    let chats_dir = tmp_dir.join(hash).join("chats");
    Ok(chats_dir.join(session_filename(target_session_id, &now)))
}

pub fn resume_command(session_id: &str) -> String {
    format!("gemini --resume {session_id}")
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let file =
        std::fs::File::open(path).map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    let root: Value = serde_json::from_reader(BufReader::new(file))
        .map_err(|e| format!("failed to parse Gemini JSON {}: {e}", path.display()))?;
    parse_root(path, &root)
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    let root: Value = serde_json::from_str(content)
        .map_err(|e| format!("failed to parse Gemini JSON {}: {e}", path.display()))?;
    parse_root(path, &root)
}

pub fn render_session(
    session: &CanonicalSession,
    target_session_id: &str,
) -> Result<String, String> {
    let now = chrono::Utc::now();
    let start_time = session
        .started_at
        .and_then(chrono::DateTime::from_timestamp_millis)
        .unwrap_or(now)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let last_updated = session
        .ended_at
        .and_then(chrono::DateTime::from_timestamp_millis)
        .unwrap_or(now)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let workspace_path = session.workspace.as_deref().unwrap_or(Path::new("/tmp"));
    let hash = session
        .metadata
        .get("project_hash")
        .or_else(|| session.metadata.get("projectHash"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| project_hash(workspace_path));

    let messages = session
        .messages
        .iter()
        .map(|msg| {
            let mut entry = json!({
                "type": gemini_message_type(msg),
                "content": gemini_message_content(msg),
            });
            if let Some(timestamp) = msg
                .timestamp
                .and_then(chrono::DateTime::from_timestamp_millis)
            {
                entry["timestamp"] =
                    Value::String(timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
            }
            merge_gemini_extra_fields(&mut entry, &msg.extra);
            entry
        })
        .collect::<Vec<_>>();

    serde_json::to_string_pretty(&json!({
        "sessionId": target_session_id,
        "projectHash": hash,
        "startTime": start_time,
        "lastUpdated": last_updated,
        "messages": messages,
    }))
    .map_err(|e| e.to_string())
}

fn home_dir() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("GEMINI_HOME") {
        return Some(PathBuf::from(home));
    }
    dirs::home_dir().map(|home| home.join(".gemini"))
}

fn tmp_dir() -> Option<PathBuf> {
    home_dir().map(|home| home.join("tmp"))
}

fn parse_root(path: &Path, root: &Value) -> Result<CanonicalSession, String> {
    let session_id = root
        .get("sessionId")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .and_then(|value| value.strip_prefix("session-"))
                .unwrap_or("unknown")
                .to_string()
        });
    let project_hash = root
        .get("projectHash")
        .and_then(Value::as_str)
        .map(String::from);
    let started_at = root.get("startTime").and_then(parse_timestamp);
    let mut ended_at = root.get("lastUpdated").and_then(parse_timestamp);

    let msg_array = root
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut messages = Vec::new();
    for msg in &msg_array {
        let role_str = msg
            .get("type")
            .or_else(|| msg.get("role"))
            .and_then(Value::as_str)
            .unwrap_or("user");
        let role = normalize_role(role_str);
        let content_val = msg.get("content");
        let text = gemini_extract_text_content(msg, content_val);
        let tool_calls = gemini_extract_tool_calls(msg, content_val);
        let tool_results = gemini_extract_tool_results(msg, content_val);
        if text.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
            continue;
        }
        let ts = msg.get("timestamp").and_then(parse_timestamp);
        if let Some(timestamp) = ts {
            ended_at = Some(ended_at.map_or(timestamp, |current| current.max(timestamp)));
        }
        messages.push(CanonicalMessage {
            idx: 0,
            role,
            content: text,
            timestamp: ts,
            author: None,
            tool_calls,
            tool_results,
            extra: msg.clone(),
        });
    }

    reindex_messages(&mut messages);

    let title = messages
        .iter()
        .find(|message| message.role == MessageRole::User)
        .map(|message| truncate_title(&message.content, 100));
    let workspace = extract_workspace_from_messages(&messages);

    let mut metadata = serde_json::Map::new();
    metadata.insert("source".into(), Value::String("gemini".to_string()));
    if let Some(project_hash) = project_hash {
        metadata.insert("project_hash".into(), Value::String(project_hash));
    }

    Ok(CanonicalSession {
        session_id,
        provider_slug: "gemini".to_string(),
        workspace,
        title,
        started_at,
        ended_at,
        messages,
        metadata: Value::Object(metadata),
        source_path: path.to_path_buf(),
        model_name: None,
    })
}

fn gemini_message_type(msg: &CanonicalMessage) -> String {
    match msg.role {
        MessageRole::User => "user".to_string(),
        MessageRole::Assistant => "model".to_string(),
        MessageRole::Tool => "tool".to_string(),
        MessageRole::System => "system".to_string(),
        MessageRole::Other(ref other) => other.clone(),
    }
}

fn gemini_extract_text_content(message: &Value, content: Option<&Value>) -> String {
    let extracted = match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => {
            let mut text_parts = Vec::new();
            for part in parts {
                match part {
                    Value::String(text) => text_parts.push(text.clone()),
                    Value::Object(obj) => {
                        let block_type = obj.get("type").and_then(Value::as_str);
                        if matches!(
                            block_type,
                            Some("text") | Some("input_text") | Some("output_text")
                        ) || block_type.is_none()
                        {
                            if let Some(text) = obj.get("text").and_then(Value::as_str) {
                                text_parts.push(text.to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
            text_parts.join("\n")
        }
        Some(Value::Object(obj)) => obj
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    };

    if !extracted.trim().is_empty() {
        return extracted;
    }

    message
        .get("thoughts")
        .map(gemini_extract_thoughts_text)
        .unwrap_or_default()
}

fn gemini_extract_thoughts_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| match item {
                Value::String(text) if !text.trim().is_empty() => Some(text.to_string()),
                Value::Object(obj) => obj
                    .get("description")
                    .or_else(|| obj.get("text"))
                    .or_else(|| obj.get("summary"))
                    .or_else(|| obj.get("subject"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                _ => {
                    let flat = flatten_content(item);
                    (!flat.trim().is_empty()).then_some(flat)
                }
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
        Value::Object(obj) => obj
            .get("description")
            .or_else(|| obj.get("text"))
            .or_else(|| obj.get("summary"))
            .or_else(|| obj.get("subject"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn gemini_extract_tool_calls(message: &Value, content: Option<&Value>) -> Vec<ToolCall> {
    let mut calls = Vec::new();

    if let Some(Value::Array(parts)) = content {
        for part in parts {
            let Some(obj) = part.as_object() else {
                continue;
            };
            if obj.get("type").and_then(Value::as_str) != Some("tool_use") {
                continue;
            }
            calls.push(ToolCall {
                id: obj
                    .get("id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                name: obj
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("input").cloned().unwrap_or(Value::Null),
            });
        }
    }

    if let Some(tool_calls) = message.get("toolCalls").and_then(Value::as_array) {
        for call in tool_calls {
            let Some(obj) = call.as_object() else {
                continue;
            };
            calls.push(ToolCall {
                id: obj
                    .get("id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                name: obj
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("args").cloned().unwrap_or(Value::Null),
            });
        }
    }

    calls
}

fn gemini_extract_tool_results(message: &Value, content: Option<&Value>) -> Vec<ToolResult> {
    let mut results = Vec::new();

    if let Some(Value::Array(parts)) = content {
        for part in parts {
            let Some(obj) = part.as_object() else {
                continue;
            };
            if obj.get("type").and_then(Value::as_str) != Some("tool_result") {
                continue;
            }
            let content_text = obj
                .get("content")
                .map(flatten_content)
                .or_else(|| obj.get("output").map(flatten_content))
                .unwrap_or_default();
            results.push(ToolResult {
                call_id: obj
                    .get("tool_use_id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                content: content_text,
                is_error: obj
                    .get("is_error")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            });
        }
    }

    if let Some(tool_calls) = message.get("toolCalls").and_then(Value::as_array) {
        for call in tool_calls {
            let Some(obj) = call.as_object() else {
                continue;
            };
            if obj.get("result").is_none() && obj.get("resultDisplay").is_none() {
                continue;
            }
            results.push(ToolResult {
                call_id: obj
                    .get("id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                content: gemini_tool_call_result_text(call),
                is_error: obj.get("status").and_then(Value::as_str) == Some("error"),
            });
        }
    }

    results
}

fn gemini_tool_call_result_text(call: &Value) -> String {
    if let Some(text) = call.get("resultDisplay").and_then(Value::as_str) {
        if !text.trim().is_empty() {
            return text.to_string();
        }
    }
    if let Some(text) = call
        .pointer("/result/0/functionResponse/response/output")
        .and_then(Value::as_str)
    {
        if !text.trim().is_empty() {
            return text.to_string();
        }
    }
    if let Some(text) = call
        .pointer("/result/0/functionResponse/response/error")
        .and_then(Value::as_str)
    {
        if !text.trim().is_empty() {
            return text.to_string();
        }
    }
    if let Some(result) = call.get("result") {
        let flat = flatten_content(result);
        if !flat.trim().is_empty() {
            return flat;
        }
        if let Ok(serialized) = serde_json::to_string(result) {
            return serialized;
        }
    }
    String::new()
}

fn gemini_message_content(msg: &CanonicalMessage) -> Value {
    if let Some(content) = msg.extra.get("content") {
        if !content.is_null() {
            return content.clone();
        }
    }

    if msg.tool_calls.is_empty() && msg.tool_results.is_empty() {
        return Value::String(msg.content.clone());
    }

    let mut blocks = Vec::new();
    if !msg.content.is_empty() {
        blocks.push(json!({
            "type": "text",
            "text": msg.content.clone(),
        }));
    }
    for tc in &msg.tool_calls {
        blocks.push(json!({
            "type": "tool_use",
            "id": tc.id.as_deref().unwrap_or(""),
            "name": tc.name.clone(),
            "input": tc.arguments.clone(),
        }));
    }
    for tr in &msg.tool_results {
        blocks.push(json!({
            "type": "tool_result",
            "tool_use_id": tr.call_id.as_deref().unwrap_or(""),
            "content": tr.content.clone(),
            "is_error": tr.is_error,
        }));
    }

    if blocks.is_empty() {
        Value::String(msg.content.clone())
    } else {
        Value::Array(blocks)
    }
}

fn merge_gemini_extra_fields(entry: &mut Value, extra: &Value) {
    let Some(entry_obj) = entry.as_object_mut() else {
        return;
    };
    let Some(extra_obj) = extra.as_object() else {
        return;
    };
    for (key, value) in extra_obj {
        if key == "type" || key == "content" || key == "timestamp" {
            continue;
        }
        entry_obj
            .entry(key.clone())
            .or_insert_with(|| value.clone());
    }
}

fn extract_workspace_from_messages(messages: &[CanonicalMessage]) -> Option<PathBuf> {
    let scan_limit = messages.len().min(50);
    for msg in &messages[..scan_limit] {
        if let Some(idx) = msg.content.find("/data/projects/") {
            let rest = &msg.content[idx..];
            let project_path: String = rest
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'' && *c != ')')
                .collect();
            let parts: Vec<&str> = project_path.split('/').collect();
            if parts.len() >= 4 {
                let normalized = format!("/{}/{}/{}", parts[1], parts[2], parts[3]);
                return Some(PathBuf::from(normalized));
            }
        }
        for prefix in ["/home/", "/Users/", "/root/"] {
            if let Some(idx) = msg.content.find(prefix) {
                let rest = &msg.content[idx..];
                let path: String = rest
                    .chars()
                    .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
                    .collect();
                if path.len() > prefix.len() + 3 {
                    let candidate = PathBuf::from(&path);
                    if candidate.is_file() {
                        return candidate
                            .parent()
                            .map(Path::to_path_buf)
                            .or(Some(candidate));
                    }
                    return Some(candidate);
                }
            }
        }
    }
    None
}
