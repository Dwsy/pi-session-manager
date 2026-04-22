use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::domain::casr_min::model::{normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};

pub fn session_roots() -> Vec<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects")).filter(|p| p.is_dir()).map(|p| vec![p]).unwrap_or_default()
}

pub fn project_dir_key(workspace: &Path) -> String {
    workspace.to_string_lossy().chars().map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' }).collect()
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    read_session_from_str(path, &content)
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    let reader = BufReader::new(content.as_bytes());

    let mut session_id: Option<String> = None;
    let mut workspace: Option<PathBuf> = None;
    let mut git_branch: Option<String> = None;
    let mut version: Option<String> = None;
    let mut started_at: Option<i64> = None;
    let mut ended_at: Option<i64> = None;
    let mut model_counts: HashMap<String, usize> = HashMap::new();
    let mut messages: Vec<CanonicalMessage> = Vec::new();

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let entry: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if session_id.is_none() {
            if let Some(sid) = entry.get("sessionId").and_then(|v| v.as_str()) {
                session_id = Some(sid.to_string());
            }
        }
        if workspace.is_none() {
            if let Some(cwd) = entry.get("cwd").and_then(|v| v.as_str()) {
                workspace = Some(PathBuf::from(cwd));
            }
        }
        if git_branch.is_none() {
            if let Some(gb) = entry.get("gitBranch").and_then(|v| v.as_str()) {
                if gb != "HEAD" {
                    git_branch = Some(gb.to_string());
                }
            }
        }
        if version.is_none() {
            if let Some(v) = entry.get("version").and_then(|v| v.as_str()) {
                version = Some(v.to_string());
            }
        }

        let entry_type = entry.get("type").and_then(|v| v.as_str());
        if !matches!(entry_type, Some("user") | Some("assistant")) {
            continue;
        }

        let role_str = entry.pointer("/message/role").and_then(|v| v.as_str()).or(entry_type).unwrap_or("user");
        let content_value = entry.pointer("/message/content").or_else(|| entry.get("content"));
        let content = extract_text_content(content_value);
        let tool_calls = extract_tool_calls(content_value);
        let tool_results = extract_tool_results(content_value);
        let role = if role_str == "user" && content.trim().is_empty() && !tool_results.is_empty() { MessageRole::Tool } else { normalize_role(role_str) };
        if content.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
            continue;
        }

        let timestamp = entry.get("timestamp").and_then(parse_timestamp);
        if let Some(ts) = timestamp {
            started_at = Some(started_at.map_or(ts, |v| v.min(ts)));
            ended_at = Some(ended_at.map_or(ts, |v| v.max(ts)));
        }

        let model = entry.pointer("/message/model").and_then(|v| v.as_str()).map(|s| s.to_string());
        if let Some(ref m) = model {
            *model_counts.entry(m.clone()).or_insert(0) += 1;
        }

        messages.push(CanonicalMessage { idx: 0, role, content, timestamp, author: model, tool_calls, tool_results, extra: entry });
    }

    reindex_messages(&mut messages);

    let session_id = session_id.unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string());
    let title = messages.iter().find(|m| m.role == MessageRole::User).map(|m| truncate_title(&m.content, 100));
    let model_name = model_counts.into_iter().max_by_key(|(_, count)| *count).map(|(name, _)| name);

    Ok(CanonicalSession {
        session_id,
        provider_slug: "claude-code".to_string(),
        workspace,
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({
            "source": "claude_code",
            "gitBranch": git_branch,
            "claudeVersion": version,
        }),
        source_path: path.to_path_buf(),
        model_name,
    })
}

pub fn build_target_path(session: &CanonicalSession, target_session_id: &str) -> Result<PathBuf, String> {
    let projects_dir = dirs::home_dir().map(|h| h.join(".claude").join("projects")).ok_or_else(|| "cannot determine Claude Code projects directory".to_string())?;
    let workspace_str = session.workspace.as_deref().unwrap_or(Path::new("/tmp"));
    let dir_key = project_dir_key(workspace_str);
    Ok(projects_dir.join(&dir_key).join(format!("{target_session_id}.jsonl")))
}

pub fn render_session(session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
    let now_iso = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let workspace_str = session.workspace.as_deref().unwrap_or(Path::new("/tmp"));
    let mut lines: Vec<String> = Vec::with_capacity(session.messages.len());
    let mut prev_uuid: Option<String> = None;

    for msg in &session.messages {
        let entry_uuid = format!("{}-{:04}", target_session_id, msg.idx);
        let msg_ts = msg.timestamp.and_then(chrono::DateTime::from_timestamp_millis).map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)).unwrap_or_else(|| now_iso.clone());
        let entry_type = match msg.role {
            MessageRole::Assistant => "assistant",
            _ => "user",
        };
        let entry = json!({
            "parentUuid": prev_uuid,
            "isSidechain": false,
            "userType": "external",
            "cwd": workspace_str.to_string_lossy(),
            "sessionId": target_session_id,
            "version": "psm-bridge",
            "gitBranch": "main",
            "type": entry_type,
            "message": build_inner_message(msg, session.model_name.as_deref(), entry_type),
            "uuid": entry_uuid,
            "timestamp": msg_ts,
        });
        lines.push(serde_json::to_string(&entry).map_err(|e| e.to_string())?);
        prev_uuid = Some(entry_uuid);
    }

    Ok(lines.join("\n"))
}

pub fn resume_command(session_id: &str) -> String {
    format!("claude --resume {session_id}")
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
            Some(ToolCall { id: obj.get("id").and_then(|v| v.as_str()).map(String::from), name: obj.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(), arguments: obj.get("input").cloned().unwrap_or(Value::Null) })
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
            let text = obj.get("content").and_then(|v| v.as_str()).or_else(|| obj.get("output").and_then(|v| v.as_str())).unwrap_or("").to_string();
            Some(ToolResult { call_id: obj.get("tool_use_id").and_then(|v| v.as_str()).map(String::from), content: text, is_error: obj.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false) })
        })
        .collect()
}

fn build_message_content(msg: &CanonicalMessage) -> Value {
    match msg.role {
        MessageRole::Assistant => {
            let mut blocks: Vec<Value> = Vec::new();
            if !msg.content.is_empty() {
                blocks.push(json!({"type":"text","text":msg.content}));
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
            Value::Array(blocks)
        }
        _ => {
            if !msg.tool_results.is_empty() {
                Value::Array(
                    msg.tool_results
                        .iter()
                        .map(|tr| {
                            json!({
                                "type": "tool_result",
                                "tool_use_id": tr.call_id.as_deref().unwrap_or(""),
                                "content": tr.content,
                                "is_error": tr.is_error,
                            })
                        })
                        .collect(),
                )
            } else {
                Value::String(msg.content.clone())
            }
        }
    }
}

fn build_inner_message(msg: &CanonicalMessage, session_model_name: Option<&str>, entry_type: &str) -> Value {
    let mut inner_msg = json!({
        "role": entry_type,
        "content": build_message_content(msg),
    });
    if let Some(ref author) = msg.author {
        inner_msg["model"] = Value::String(author.clone());
    } else if msg.role == MessageRole::Assistant {
        if let Some(model) = session_model_name {
            inner_msg["model"] = Value::String(model.to_string());
        }
    }
    inner_msg
}

fn extract_text_content(content: Option<&Value>) -> String {
    let Some(value) = content else {
        return String::new();
    };
    match value {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| {
                let obj = block.as_object()?;
                match obj.get("type").and_then(|v| v.as_str()) {
                    Some("text") => obj.get("text").and_then(|v| v.as_str()).map(String::from),
                    Some("thinking") => obj.get("thinking").and_then(|v| v.as_str()).map(String::from),
                    _ => None,
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}
