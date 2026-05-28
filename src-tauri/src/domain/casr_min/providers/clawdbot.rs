use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::domain::casr_min::model::{flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole};

pub fn session_roots() -> Vec<PathBuf> {
    if std::env::var("CLAWDBOT_HOME").is_ok() {
        let root = home_dir();
        return root.is_dir().then_some(vec![root]).unwrap_or_default();
    }
    crate::paths::existing_home_relative_dirs(&[".clawdbot", "sessions"])
}

pub fn matches_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    normalized.contains("/.clawdbot/sessions/") && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl")
}

pub fn build_target_path(target_session_id: &str) -> Result<PathBuf, String> {
    Ok(home_dir().join(format!("{target_session_id}.jsonl")))
}

pub fn resume_command(session_id: &str) -> String {
    format!("clawdbot --resume {session_id}")
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    read_session_from_reader(path, BufReader::new(file))
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    read_session_from_reader(path, BufReader::new(content.as_bytes()))
}

pub fn render_session(session: &CanonicalSession, _target_session_id: &str) -> Result<String, String> {
    let mut lines = Vec::with_capacity(session.messages.len());

    for msg in &session.messages {
        let role_str = match &msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
            MessageRole::Other(role) => role.as_str(),
        };
        let mut obj = Map::new();
        obj.insert("role".into(), Value::String(role_str.to_string()));
        obj.insert("content".into(), Value::String(msg.content.clone()));
        if let Some(ts) = msg.timestamp.and_then(chrono::DateTime::from_timestamp_millis) {
            obj.insert("timestamp".into(), Value::String(ts.to_rfc3339()));
        }
        lines.push(serde_json::to_string(&Value::Object(obj)).map_err(|e| e.to_string())?);
    }

    Ok(lines.join("\n") + "\n")
}

fn home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("CLAWDBOT_HOME") {
        return PathBuf::from(home);
    }
    dirs::home_dir().unwrap_or_default().join(".clawdbot").join("sessions")
}

fn read_session_from_reader<R: BufRead>(path: &Path, reader: R) -> Result<CanonicalSession, String> {
    let mut messages = Vec::new();
    let mut started_at = None;
    let mut ended_at = None;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(line) => line,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }

        let val: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let role_str = val.get("role").and_then(Value::as_str).unwrap_or("assistant");
        let role = normalize_role(role_str);
        let content = val.get("content").map(flatten_content).unwrap_or_default();
        if content.trim().is_empty() {
            continue;
        }

        let ts = val.get("timestamp").and_then(parse_timestamp);
        if started_at.is_none() {
            started_at = ts;
        }
        if ts.is_some() {
            ended_at = ts;
        }

        messages.push(CanonicalMessage { idx: 0, role, content, timestamp: ts, author: None, tool_calls: vec![], tool_results: vec![], extra: val });
    }

    reindex_messages(&mut messages);

    Ok(CanonicalSession {
        session_id: path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("unknown").to_string(),
        provider_slug: "clawdbot".to_string(),
        workspace: None,
        title: messages.iter().find(|message| message.role == MessageRole::User).map(|message| truncate_title(&message.content, 100)),
        started_at,
        ended_at,
        messages,
        metadata: json!({ "source": "clawdbot" }),
        source_path: path.to_path_buf(),
        model_name: None,
    })
}
