use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::domain::casr_min::model::{flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};

pub fn session_roots() -> Vec<PathBuf> {
    if std::env::var("FACTORY_HOME").is_ok() {
        let root = home_dir();
        return root.is_dir().then_some(vec![root]).unwrap_or_default();
    }
    crate::paths::existing_home_relative_dirs(&[".factory", "sessions"])
}

pub fn matches_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    normalized.contains("/.factory/sessions/") && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl")
}

pub fn build_target_path(session: &CanonicalSession, target_session_id: &str) -> Result<PathBuf, String> {
    let workspace_slug = session.workspace.as_ref().map(|path| encode_workspace_slug(path)).unwrap_or_else(|| "-tmp".to_string());
    Ok(home_dir().join(workspace_slug).join(format!("{target_session_id}.jsonl")))
}

pub fn resume_command(session_id: &str) -> String {
    format!("factory --resume {session_id}")
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    read_session_from_reader(path, BufReader::new(file))
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    read_session_from_reader(path, BufReader::new(content.as_bytes()))
}

pub fn render_session(session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
    let mut lines = Vec::with_capacity(session.messages.len() + 1);
    lines.push(
        serde_json::to_string(&json!({
            "type": "session_start",
            "id": target_session_id,
            "title": session.title,
            "cwd": session.workspace.as_ref().map(|path| path.to_string_lossy().to_string()),
            "owner": session.metadata.get("owner").and_then(Value::as_str),
        }))
        .map_err(|e| e.to_string())?,
    );

    for msg in &session.messages {
        let role_str = match &msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
            MessageRole::Other(role) => role.as_str(),
        };
        let mut message_obj = Map::new();
        message_obj.insert("role".into(), Value::String(role_str.to_string()));
        message_obj.insert("content".into(), Value::String(msg.content.clone()));
        if let Some(author) = &msg.author {
            message_obj.insert("model".into(), Value::String(author.clone()));
        }

        let mut entry = Map::new();
        entry.insert("type".into(), Value::String("message".to_string()));
        if let Some(ts) = msg.timestamp.and_then(chrono::DateTime::from_timestamp_millis) {
            entry.insert("timestamp".into(), Value::String(ts.to_rfc3339()));
        }
        entry.insert("message".into(), Value::Object(message_obj));
        lines.push(serde_json::to_string(&Value::Object(entry)).map_err(|e| e.to_string())?);
    }

    Ok(lines.join("\n") + "\n")
}

fn home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("FACTORY_HOME") {
        return PathBuf::from(home);
    }
    dirs::home_dir().unwrap_or_default().join(".factory").join("sessions")
}

fn decode_workspace_slug(slug: &str) -> Option<PathBuf> {
    if slug.starts_with('-') {
        Some(PathBuf::from(slug.replace('-', "/")))
    } else {
        None
    }
}

fn encode_workspace_slug(path: &Path) -> String {
    path.to_string_lossy().replace('/', "-")
}

fn read_session_from_reader<R: BufRead>(path: &Path, reader: R) -> Result<CanonicalSession, String> {
    let mut messages = Vec::new();
    let mut session_id_from_header = None;
    let mut title_from_header = None;
    let mut workspace = None;
    let mut owner = None;
    let mut started_at = None;
    let mut ended_at = None;
    let mut model_from_settings = None;

    let parent_dir_name = path.parent().and_then(|parent| parent.file_name()).and_then(|name| name.to_str());

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(line) => line,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }

        let val: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match val.get("type").and_then(Value::as_str) {
            Some("session_start") => {
                session_id_from_header = val.get("id").and_then(Value::as_str).map(ToString::to_string);
                title_from_header = val.get("title").and_then(Value::as_str).map(ToString::to_string);
                owner = val.get("owner").and_then(Value::as_str).map(ToString::to_string);
                workspace = val.get("cwd").and_then(Value::as_str).map(PathBuf::from).or_else(|| parent_dir_name.and_then(decode_workspace_slug));
            }
            Some("message") => {
                let ts = val.get("timestamp").and_then(parse_timestamp);
                if started_at.is_none() {
                    started_at = ts;
                }
                if ts.is_some() {
                    ended_at = ts;
                }

                let message_obj = val.get("message");
                let role_str = message_obj.and_then(|msg| msg.get("role")).and_then(Value::as_str).unwrap_or("unknown");
                let role = normalize_role(role_str);
                let content_value = message_obj.and_then(|msg| msg.get("content"));
                let content = content_value.map(flatten_content).unwrap_or_default();
                let tool_calls = extract_tool_calls(message_obj, content_value);
                let tool_results = extract_tool_results(message_obj, content_value);

                if content.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                    continue;
                }

                let author = message_obj.and_then(|msg| msg.get("model")).and_then(Value::as_str).map(ToString::to_string);

                messages.push(CanonicalMessage { idx: 0, role, content, timestamp: ts, author, tool_calls, tool_results, extra: val });
            }
            _ => {}
        }
    }

    reindex_messages(&mut messages);

    let session_id = session_id_from_header.unwrap_or_else(|| path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("unknown").to_string());

    if workspace.is_none() {
        workspace = parent_dir_name.and_then(decode_workspace_slug);
    }

    let title = title_from_header.or_else(|| messages.iter().find(|message| message.role == MessageRole::User).map(|message| truncate_title(&message.content, 100)));

    let settings_path = path.with_extension("settings.json");
    if settings_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                model_from_settings = val.get("model").and_then(Value::as_str).map(ToString::to_string);
            }
        }
    }

    Ok(CanonicalSession {
        session_id: session_id.clone(),
        provider_slug: "factory".to_string(),
        workspace,
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({
            "source": "factory",
            "sessionId": session_id,
            "owner": owner,
            "model": model_from_settings,
        }),
        source_path: path.to_path_buf(),
        model_name: model_from_settings,
    })
}

fn extract_tool_calls(message_obj: Option<&Value>, content_value: Option<&Value>) -> Vec<ToolCall> {
    let mut calls = Vec::new();

    if let Some(Value::Array(blocks)) = content_value {
        for block in blocks {
            let Some(obj) = block.as_object() else {
                continue;
            };
            let Some(block_type) = obj.get("type").and_then(Value::as_str) else {
                continue;
            };
            if !matches!(block_type, "tool_use" | "tool_call" | "function_call" | "custom_tool_call") {
                continue;
            }
            calls.push(ToolCall {
                id: obj.get("id").or_else(|| obj.get("call_id")).or_else(|| obj.get("tool_use_id")).and_then(Value::as_str).map(ToString::to_string),
                name: obj.get("name").or_else(|| obj.get("function").and_then(|value| value.get("name"))).and_then(Value::as_str).unwrap_or("unknown").to_string(),
                arguments: obj.get("input").or_else(|| obj.get("arguments")).or_else(|| obj.get("args")).cloned().unwrap_or(Value::Null),
            });
        }
    }

    if let Some(tool_calls) = message_obj.and_then(|message| message.get("toolCalls")).and_then(Value::as_array) {
        for call in tool_calls {
            let Some(obj) = call.as_object() else {
                continue;
            };
            calls.push(ToolCall {
                id: obj.get("id").or_else(|| obj.get("call_id")).and_then(Value::as_str).map(ToString::to_string),
                name: obj.get("name").or_else(|| obj.get("function").and_then(|value| value.get("name"))).and_then(Value::as_str).unwrap_or("unknown").to_string(),
                arguments: obj.get("input").or_else(|| obj.get("arguments")).or_else(|| obj.get("args")).cloned().unwrap_or(Value::Null),
            });
        }
    }

    calls
}

fn extract_tool_results(message_obj: Option<&Value>, content_value: Option<&Value>) -> Vec<ToolResult> {
    let mut results = Vec::new();

    if let Some(Value::Array(blocks)) = content_value {
        for block in blocks {
            let Some(obj) = block.as_object() else {
                continue;
            };
            let Some(block_type) = obj.get("type").and_then(Value::as_str) else {
                continue;
            };
            if !matches!(block_type, "tool_result" | "function_call_output" | "custom_tool_call_output") {
                continue;
            }
            let content = obj.get("content").or_else(|| obj.get("output")).or_else(|| obj.get("result")).map(flatten_content).unwrap_or_default();
            results.push(ToolResult {
                call_id: obj.get("tool_use_id").or_else(|| obj.get("call_id")).or_else(|| obj.get("id")).and_then(Value::as_str).map(ToString::to_string),
                content,
                is_error: obj.get("is_error").and_then(Value::as_bool).or_else(|| obj.get("status").and_then(Value::as_str).map(|status| status == "error")).unwrap_or(false),
            });
        }
    }

    if let Some(tool_results) = message_obj.and_then(|message| message.get("toolResults")).and_then(Value::as_array) {
        for result in tool_results {
            let Some(obj) = result.as_object() else {
                continue;
            };
            results.push(ToolResult {
                call_id: obj.get("tool_use_id").or_else(|| obj.get("call_id")).or_else(|| obj.get("id")).and_then(Value::as_str).map(ToString::to_string),
                content: obj.get("content").or_else(|| obj.get("output")).or_else(|| obj.get("result")).map(flatten_content).unwrap_or_default(),
                is_error: obj.get("is_error").and_then(Value::as_bool).or_else(|| obj.get("status").and_then(Value::as_str).map(|status| status == "error")).unwrap_or(false),
            });
        }
    }

    results
}
