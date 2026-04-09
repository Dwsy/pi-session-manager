use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use crate::domain::casr_min::model::{
    flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title,
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult,
};

pub fn session_roots() -> Vec<PathBuf> {
    dirs::home_dir()
        .map(|h| h.join(".codex").join("sessions"))
        .filter(|p| p.is_dir())
        .map(|p| vec![p])
        .unwrap_or_default()
}

pub fn build_target_path(target_session_id: &str, now: DateTime<Utc>) -> Result<PathBuf, String> {
    let sessions_dir = dirs::home_dir()
        .map(|h| h.join(".codex").join("sessions"))
        .ok_or_else(|| "cannot determine Codex sessions directory".to_string())?;
    let date_dir = now.format("%Y/%m/%d").to_string();
    let stamp = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    Ok(sessions_dir
        .join(date_dir)
        .join(format!("rollout-{stamp}-{target_session_id}.jsonl")))
}

pub fn resume_command(session_id: &str) -> String {
    format!("codex resume {session_id}")
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    read_session_from_str(path, &content)
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    let trimmed = content.trim_start();

    if trimmed.starts_with('[') {
        let root: Value = serde_json::from_str(trimmed)
            .map_err(|e| format!("failed to parse codex array JSON {}: {e}", path.display()))?;
        let items = root
            .as_array()
            .ok_or_else(|| "codex array root is not an array".to_string())?;
        return read_envelopes(path, items.to_vec());
    }

    if let Some(first_line) = trimmed.lines().next() {
        if let Ok(obj) = serde_json::from_str::<Value>(first_line) {
            if obj.get("session").is_some() || obj.get("items").is_some() {
                return read_legacy_json(path, content);
            }
        }
    }

    let mut envelopes = Vec::new();
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            envelopes.push(v);
        }
    }
    read_envelopes(path, envelopes)
}

fn read_envelopes(path: &Path, envelopes: Vec<Value>) -> Result<CanonicalSession, String> {
    let mut session_id: Option<String> = None;
    let mut workspace: Option<PathBuf> = None;
    let mut started_at: Option<i64> = None;
    let mut ended_at: Option<i64> = None;
    let mut messages: Vec<CanonicalMessage> = Vec::new();

    for envelope in envelopes {
        let event_type = envelope.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let payload = envelope.get("payload");
        let ts = envelope.get("timestamp").and_then(parse_timestamp);
        if let Some(t) = ts {
            started_at = Some(started_at.map_or(t, |s| s.min(t)));
            ended_at = Some(ended_at.map_or(t, |e| e.max(t)));
        }

        match event_type {
            "session_meta" => {
                if let Some(p) = payload {
                    if session_id.is_none() {
                        session_id = p.get("id").and_then(|v| v.as_str()).map(String::from);
                    }
                    if workspace.is_none() {
                        workspace = p.get("cwd").and_then(|v| v.as_str()).map(PathBuf::from);
                    }
                }
            }
            "response_item" => {
                if let Some(p) = payload {
                    let payload_type = p.get("type").and_then(|v| v.as_str()).unwrap_or_default();
                    let role = if matches!(
                        payload_type,
                        "function_call_output" | "custom_tool_call_output"
                    ) {
                        MessageRole::Tool
                    } else {
                        let role_str = p
                            .get("role")
                            .and_then(|v| v.as_str())
                            .unwrap_or("assistant");
                        normalize_role(role_str)
                    };
                    let content_val = p.get("content");
                    let text = extract_text_content(content_val);
                    let mut tool_calls = extract_tool_calls(content_val);
                    tool_calls.extend(extract_payload_tool_calls(p));
                    let mut tool_results = extract_tool_results(content_val);
                    tool_results.extend(extract_payload_tool_results(p));
                    if text.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                        continue;
                    }
                    let next_message = CanonicalMessage {
                        idx: 0,
                        role,
                        content: text,
                        timestamp: ts,
                        author: if payload_type == "reasoning" {
                            Some("reasoning".to_string())
                        } else {
                            None
                        },
                        tool_calls,
                        tool_results,
                        extra: envelope,
                    };
                    let is_adjacent_user_duplicate = messages.last().is_some_and(|prev| {
                        prev.role == MessageRole::User
                            && next_message.role == MessageRole::User
                            && prev.content == next_message.content
                            && prev.timestamp == next_message.timestamp
                    });
                    if !is_adjacent_user_duplicate {
                        messages.push(next_message);
                    }
                }
            }
            "event_msg" => {
                if let Some(p) = payload {
                    let sub_type = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    match sub_type {
                        "user_message" => {
                            let text = p
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if !text.trim().is_empty() {
                                let next_message = CanonicalMessage {
                                    idx: 0,
                                    role: MessageRole::User,
                                    content: text,
                                    timestamp: ts,
                                    author: None,
                                    tool_calls: vec![],
                                    tool_results: vec![],
                                    extra: envelope,
                                };
                                let is_adjacent_user_duplicate =
                                    messages.last().is_some_and(|prev| {
                                        prev.role == MessageRole::User
                                            && prev.content == next_message.content
                                            && prev.timestamp == next_message.timestamp
                                    });
                                if !is_adjacent_user_duplicate {
                                    messages.push(next_message);
                                }
                            }
                        }
                        "agent_reasoning" => {
                            let text = p
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if !text.trim().is_empty() {
                                messages.push(CanonicalMessage {
                                    idx: 0,
                                    role: MessageRole::Assistant,
                                    content: text,
                                    timestamp: ts,
                                    author: Some("reasoning".to_string()),
                                    tool_calls: vec![],
                                    tool_results: vec![],
                                    extra: envelope,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    reindex_messages(&mut messages);
    let session_id = session_id.unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string()
    });
    let title = messages
        .iter()
        .find(|m| m.role == MessageRole::User)
        .map(|m| truncate_title(&m.content, 100));
    Ok(CanonicalSession {
        session_id,
        provider_slug: "codex".to_string(),
        workspace,
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({"source": "codex"}),
        source_path: path.to_path_buf(),
        model_name: None,
    })
}

fn read_legacy_json(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    let root: Value = serde_json::from_str(content)
        .map_err(|e| format!("failed to parse legacy JSON {}: {e}", path.display()))?;
    let session_obj = root.get("session");
    let session_id = session_obj
        .and_then(|s| s.get("id"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let workspace = session_obj
        .and_then(|s| s.get("cwd"))
        .and_then(|v| v.as_str())
        .map(PathBuf::from);
    let items = root
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut messages = Vec::new();
    let mut started_at: Option<i64> = None;
    let mut ended_at: Option<i64> = None;
    for item in &items {
        let role_str = item
            .get("role")
            .and_then(|v| v.as_str())
            .unwrap_or("assistant");
        let role = normalize_role(role_str);
        let text = item.get("content").map(flatten_content).unwrap_or_default();
        if text.trim().is_empty() {
            continue;
        }
        let ts = item.get("timestamp").and_then(parse_timestamp);
        if let Some(t) = ts {
            started_at = Some(started_at.map_or(t, |s| s.min(t)));
            ended_at = Some(ended_at.map_or(t, |e| e.max(t)));
        }
        messages.push(CanonicalMessage {
            idx: 0,
            role,
            content: text,
            timestamp: ts,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: item.clone(),
        });
    }
    reindex_messages(&mut messages);
    Ok(CanonicalSession {
        session_id: session_id.unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        }),
        provider_slug: "codex".to_string(),
        workspace,
        title: messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100)),
        started_at,
        ended_at,
        messages,
        metadata: root,
        source_path: path.to_path_buf(),
        model_name: None,
    })
}

pub fn render_session(
    session: &CanonicalSession,
    target_session_id: &str,
) -> Result<String, String> {
    let now = chrono::Utc::now();
    let now_iso = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let cwd = session
        .workspace
        .as_deref()
        .unwrap_or(std::path::Path::new("/tmp"))
        .to_string_lossy()
        .to_string();
    let mut lines: Vec<String> = Vec::with_capacity(session.messages.len() + 1);
    lines.push(
        serde_json::to_string(&json!({
            "type": "session_meta",
            "timestamp": now_iso,
            "payload": {
                "id": target_session_id,
                "cwd": cwd,
                "timestamp": now_iso,
                "originator": "psm-bridge",
                "cli_version": env!("CARGO_PKG_VERSION"),
                "source": "desktop",
                "model_provider": "openai",
            }
        }))
        .map_err(|e| e.to_string())?,
    );

    for msg in &session.messages {
        let msg_ts = msg
            .timestamp
            .and_then(chrono::DateTime::from_timestamp_millis)
            .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
            .unwrap_or_else(|| now_iso.clone());
        for event in events_for_message(msg, &msg_ts) {
            lines.push(serde_json::to_string(&event).map_err(|e| e.to_string())?);
        }
    }

    Ok(lines.join("\n"))
}

fn events_for_message(msg: &CanonicalMessage, msg_ts: &str) -> Vec<Value> {
    let user_needs_response_item = msg.role == MessageRole::User
        && (!msg.tool_calls.is_empty() || !msg.tool_results.is_empty());
    match msg.role {
        MessageRole::User if !user_needs_response_item => vec![json!({
            "type": "event_msg",
            "timestamp": msg_ts,
            "payload": {"type": "user_message", "message": msg.content}
        })],
        MessageRole::User => vec![json!({
            "type": "response_item",
            "timestamp": msg_ts,
            "payload": {"type": "message", "role": role_string(&msg.role), "content": response_content(msg)}
        })],
        MessageRole::Assistant if msg.author.as_deref() == Some("reasoning") => vec![json!({
            "type": "event_msg",
            "timestamp": msg_ts,
            "payload": {"type": "agent_reasoning", "text": msg.content}
        })],
        _ => vec![json!({
            "type": "response_item",
            "timestamp": msg_ts,
            "payload": {"type": "message", "role": role_string(&msg.role), "content": response_content(msg)}
        })],
    }
}

fn role_string(role: &MessageRole) -> String {
    match role {
        MessageRole::User => "user".to_string(),
        MessageRole::Assistant => "assistant".to_string(),
        MessageRole::Tool => "tool".to_string(),
        MessageRole::System => "developer".to_string(),
        MessageRole::Other(other) => other.clone(),
    }
}

fn response_content(msg: &CanonicalMessage) -> Value {
    let mut blocks = Vec::new();
    let text_type = if msg.role == MessageRole::Assistant {
        "output_text"
    } else {
        "input_text"
    };
    if !msg.content.is_empty() {
        blocks.push(json!({"type": text_type, "text": msg.content}));
    }
    for tc in &msg.tool_calls {
        blocks.push(json!({
            "type": "tool_use",
            "id": tc.id.as_deref().unwrap_or(""),
            "name": tc.name,
            "input": tc.arguments,
        }));
    }
    for tr in &msg.tool_results {
        blocks.push(json!({
            "type": "tool_result",
            "tool_use_id": tr.call_id.as_deref().unwrap_or(""),
            "content": tr.content,
            "is_error": tr.is_error,
        }));
    }
    if blocks.is_empty() {
        blocks.push(json!({"type": text_type, "text": msg.content}));
    }
    Value::Array(blocks)
}

fn extract_text_content(content: Option<&Value>) -> String {
    let Some(value) = content else {
        return String::new();
    };
    match value {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => {
            let mut parts: Vec<String> = Vec::new();
            for block in blocks {
                if let Some(obj) = block.as_object() {
                    let block_type = obj.get("type").and_then(|v| v.as_str());
                    if matches!(
                        block_type,
                        Some("text") | Some("input_text") | Some("output_text")
                    ) || block_type.is_none()
                    {
                        if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                            parts.push(text.to_string());
                        }
                    }
                } else if let Some(s) = block.as_str() {
                    parts.push(s.to_string());
                }
            }
            parts.join("\n")
        }
        Value::Object(obj) => obj
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn extract_tool_calls(content: Option<&Value>) -> Vec<ToolCall> {
    let Some(Value::Array(blocks)) = content else {
        return vec![];
    };
    blocks
        .iter()
        .filter_map(|block| {
            let obj = block.as_object()?;
            if obj.get("type")?.as_str()? != "tool_use" {
                return None;
            }
            Some(ToolCall {
                id: obj.get("id").and_then(|v| v.as_str()).map(String::from),
                name: obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("input").cloned().unwrap_or(Value::Null),
            })
        })
        .collect()
}

fn extract_tool_results(content: Option<&Value>) -> Vec<ToolResult> {
    let Some(Value::Array(blocks)) = content else {
        return vec![];
    };
    blocks
        .iter()
        .filter_map(|block| {
            let obj = block.as_object()?;
            if obj.get("type")?.as_str()? != "tool_result" {
                return None;
            }
            Some(ToolResult {
                call_id: obj
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                content: obj
                    .get("content")
                    .and_then(|v| v.as_str())
                    .or_else(|| obj.get("output").and_then(|v| v.as_str()))
                    .unwrap_or("")
                    .to_string(),
                is_error: obj
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn extract_payload_tool_calls(payload: &Value) -> Vec<ToolCall> {
    let payload_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if !matches!(payload_type, "function_call" | "custom_tool_call") {
        return vec![];
    }
    let arguments = payload
        .get("arguments")
        .or_else(|| payload.get("input"))
        .or_else(|| payload.get("args"))
        .cloned()
        .unwrap_or(Value::Null);
    vec![ToolCall {
        id: payload
            .get("call_id")
            .or_else(|| payload.get("id"))
            .or_else(|| payload.get("tool_use_id"))
            .and_then(|v| v.as_str())
            .map(String::from),
        name: payload
            .get("name")
            .or_else(|| payload.pointer("/function/name"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        arguments,
    }]
}

fn extract_payload_tool_results(payload: &Value) -> Vec<ToolResult> {
    let payload_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if !matches!(
        payload_type,
        "function_call_output" | "custom_tool_call_output"
    ) {
        return vec![];
    }
    let content = payload
        .get("output")
        .or_else(|| payload.get("content"))
        .or_else(|| payload.get("result"))
        .map(flatten_content)
        .unwrap_or_default();
    let is_error = payload
        .get("is_error")
        .and_then(|v| v.as_bool())
        .or_else(|| {
            payload
                .get("status")
                .and_then(|v| v.as_str())
                .map(|s| s == "error")
        })
        .unwrap_or(false);
    vec![ToolResult {
        call_id: payload
            .get("call_id")
            .or_else(|| payload.get("tool_use_id"))
            .or_else(|| payload.get("id"))
            .and_then(|v| v.as_str())
            .map(String::from),
        content,
        is_error,
    }]
}
