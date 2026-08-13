use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::domain::casr_min::model::{normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};

pub fn session_roots() -> Vec<PathBuf> {
    crate::paths::pi_agent_sessions_dir().ok().filter(|p| p.is_dir()).map(|p| vec![p]).unwrap_or_default()
}

pub fn build_target_path(target_session_id: &str, now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
    let root = crate::paths::current_session_home_dir().map(|home| home.join(".pi").join("agent").join("sessions").join("bridge")).map_err(|_| "cannot determine Pi sessions directory".to_string())?;
    let stamp = now.format("%Y-%m-%dT%H-%M-%S%.3f").to_string();
    let suffix = target_session_id.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect::<String>();
    Ok(root.join(format!("{stamp}_{suffix}.jsonl")))
}

pub fn resume_command(target_path: &Path) -> String {
    format!("pi --session {}", shell_escape(target_path))
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    read_session_from_reader(path, BufReader::new(file))
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    read_session_from_reader(path, BufReader::new(content.as_bytes()))
}

fn read_session_from_reader<R: BufRead>(path: &Path, reader: R) -> Result<CanonicalSession, String> {
    let mut messages: Vec<CanonicalMessage> = Vec::new();
    let mut started_at: Option<i64> = None;
    let mut ended_at: Option<i64> = None;
    let mut session_cwd: Option<String> = None;
    let mut session_id_from_header: Option<String> = None;
    let mut model_id: Option<String> = None;
    let mut provider_name: Option<String> = None;
    let mut title: Option<String> = None;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let val: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entry_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match entry_type {
            "session" => {
                session_id_from_header = val.get("id").and_then(|v| v.as_str()).map(String::from);
                session_cwd = val.get("cwd").and_then(|v| v.as_str()).map(String::from);
                provider_name = val.get("provider").and_then(|v| v.as_str()).map(String::from);
                model_id = val.get("modelId").and_then(|v| v.as_str()).map(String::from);
                if title.is_none() {
                    title = val.get("title").and_then(|v| v.as_str()).or_else(|| val.get("name").and_then(|v| v.as_str())).map(str::trim).filter(|value| !value.is_empty()).map(String::from);
                }
                if let Some(ts) = val.get("timestamp").and_then(parse_timestamp) {
                    started_at = Some(ts);
                }
            }
            "title" => {
                if let Some(value) = val.get("title").and_then(|v| v.as_str()).map(str::trim).filter(|value| !value.is_empty()) {
                    title = Some(value.to_string());
                }
            }
            "message" => {
                let Some(msg) = val.get("message") else {
                    continue;
                };
                let role_str = msg.get("role").and_then(|v| v.as_str()).unwrap_or("unknown");
                let normalized = match role_str {
                    "toolResult" => "tool",
                    other => other,
                };
                let role = normalize_role(normalized);
                let content_val = msg.get("content");
                let content = content_val.map(flatten_pi_content).unwrap_or_default();
                let tool_calls = content_val.map(extract_tool_calls).unwrap_or_default();
                let tool_results = if role == MessageRole::Tool { vec![ToolResult { call_id: msg.get("toolCallId").and_then(|v| v.as_str()).map(String::from), content: content.clone(), is_error: msg.get("isError").and_then(|v| v.as_bool()).unwrap_or(false) }] } else { vec![] };
                if content.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                    continue;
                }
                let ts = val.get("timestamp").and_then(parse_timestamp);
                if started_at.is_none() {
                    started_at = ts;
                }
                if ts.is_some() {
                    ended_at = ts;
                }
                let author = if role == MessageRole::Assistant {
                    // Prefer message-level provider+model, fallback to session-level
                    let msg_provider = msg.get("provider").and_then(|v| v.as_str());
                    let msg_model = msg.get("model").and_then(|v| v.as_str());

                    if let (Some(provider), Some(model)) = (msg_provider, msg_model) {
                        Some(format!("{provider}/{model}"))
                    } else if let Some(model) = msg_model {
                        Some(model.to_string())
                    } else {
                        model_id.clone()
                    }
                } else {
                    None
                };
                messages.push(CanonicalMessage { idx: 0, role, content, timestamp: ts, author, tool_calls, tool_results, extra: val });
            }
            "model_change" => {
                provider_name = val.get("provider").and_then(|v| v.as_str()).map(String::from);
                model_id = val.get("modelId").and_then(|v| v.as_str()).map(String::from);
            }
            _ => {}
        }
    }

    reindex_messages(&mut messages);
    let session_id = session_id_from_header.unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string());
    let title = title.or_else(|| messages.iter().find(|m| m.role == MessageRole::User).map(|m| truncate_title(&m.content, 100)));
    let workspace = session_cwd.as_ref().map(PathBuf::from);
    Ok(CanonicalSession { session_id, provider_slug: "pi-agent".to_string(), workspace, title, started_at, ended_at, messages, metadata: json!({"source": "pi_agent", "provider": provider_name, "model_id": model_id}), source_path: path.to_path_buf(), model_name: model_id })
}

pub fn render_session(session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
    let header_timestamp = session.started_at.and_then(chrono::DateTime::from_timestamp_millis).unwrap_or_else(chrono::Utc::now).to_rfc3339();
    let cwd = session.workspace.as_ref().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| "/tmp".to_string());
    let mut lines = vec![serde_json::to_string(&json!({
        "type": "session",
        "version": 3,
        "id": target_session_id,
        "timestamp": header_timestamp,
        "cwd": cwd,
        "provider": session.metadata.get("provider").and_then(|v| v.as_str()).unwrap_or(session.provider_slug.as_str()),
        "modelId": session.model_name.as_deref().unwrap_or("unknown"),
    }))
    .map_err(|e| e.to_string())?];

    let mut parent_id: Option<String> = None;
    for msg in &session.messages {
        let has_tool_data = !msg.tool_calls.is_empty() || !msg.tool_results.is_empty();
        if msg.content.trim().is_empty() && !has_tool_data {
            continue;
        }

        let id = format!("{}-{:04}", target_session_id, msg.idx);
        let role_str = match msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "toolResult",
            MessageRole::Other(ref r) => r.as_str(),
        };

        let effective_content = if msg.content.trim().is_empty() && msg.tool_calls.is_empty() && !msg.tool_results.is_empty() { msg.tool_results.iter().map(|tr| tr.content.clone()).collect::<Vec<_>>().join("\n") } else { msg.content.clone() };

        let is_reasoning = is_reasoning_message(msg);
        let mut blocks = Vec::new();
        if !effective_content.trim().is_empty() {
            if is_reasoning {
                blocks.push(json!({"type": "thinking", "thinking": effective_content}));
            } else {
                blocks.push(json!({"type": "text", "text": effective_content}));
            }
        }
        for tc in &msg.tool_calls {
            blocks.push(json!({
                "type": "toolCall",
                "id": tc.id,
                "name": tc.name,
                "arguments": tc.arguments,
            }));
        }
        let mut inner = json!({"role": role_str, "content": Value::Array(blocks)});
        if let Some(ref author) = msg.author {
            if !is_reasoning {
                inner["model"] = Value::String(author.clone());
            }
        }
        if matches!(msg.role, MessageRole::Tool) {
            if let Some(result) = msg.tool_results.first() {
                if let Some(call_id) = &result.call_id {
                    inner["toolCallId"] = Value::String(call_id.clone());
                }
                inner["isError"] = Value::Bool(result.is_error);
            }
        }

        lines.push(
            serde_json::to_string(&json!({
                "type": "message",
                "id": id,
                "parentId": parent_id,
                "timestamp": msg.timestamp.and_then(chrono::DateTime::from_timestamp_millis).unwrap_or_else(chrono::Utc::now).to_rfc3339(),
                "message": inner,
            }))
            .map_err(|e| e.to_string())?,
        );
        parent_id = Some(id);
    }

    Ok(lines.join("\n"))
}

fn flatten_pi_content(content: &Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        return arr
            .iter()
            .filter_map(|block| match block.get("type").and_then(|t| t.as_str()) {
                Some("text") => block.get("text").and_then(|t| t.as_str()).map(String::from),
                Some("thinking") => block.get("thinking").and_then(|t| t.as_str()).map(String::from),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    String::new()
}

fn extract_tool_calls(content: &Value) -> Vec<ToolCall> {
    let Some(arr) = content.as_array() else {
        return vec![];
    };
    arr.iter()
        .filter_map(|block| {
            if block.get("type").and_then(|t| t.as_str()) != Some("toolCall") {
                return None;
            }
            Some(ToolCall { id: block.get("id").and_then(|v| v.as_str()).map(String::from), name: block.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(), arguments: block.get("arguments").cloned().unwrap_or(Value::Null) })
        })
        .collect()
}

fn is_reasoning_message(msg: &CanonicalMessage) -> bool {
    msg.author.as_deref() == Some("reasoning") || original_content_is_thinking_only(&msg.extra)
}

fn original_content_is_thinking_only(extra: &Value) -> bool {
    let Some(Value::Array(blocks)) = extra.pointer("/message/content") else {
        return false;
    };

    let mut has_thinking = false;
    let mut has_non_thinking = false;
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("thinking") => has_thinking = true,
            Some("text") | Some("tool_use") | Some("tool_result") => has_non_thinking = true,
            _ => {}
        }
    }

    has_thinking && !has_non_thinking
}

fn shell_escape(path: &Path) -> String {
    let text = path.to_string_lossy();
    if cfg!(windows) {
        format!("\"{}\"", text.replace('"', "\\\""))
    } else {
        format!("'{}'", text.replace('\'', "'\\''"))
    }
}
