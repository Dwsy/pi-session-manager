use std::path::PathBuf;

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonicalSession {
    pub session_id: String,
    pub provider_slug: String,
    pub workspace: Option<PathBuf>,
    pub title: Option<String>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub messages: Vec<CanonicalMessage>,
    pub metadata: serde_json::Value,
    pub source_path: PathBuf,
    pub model_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonicalMessage {
    pub idx: usize,
    pub role: MessageRole,
    pub content: String,
    pub timestamp: Option<i64>,
    pub author: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub tool_results: Vec<ToolResult>,
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageRole {
    User,
    Assistant,
    Tool,
    System,
    Other(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: Option<String>,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolResult {
    pub call_id: Option<String>,
    pub content: String,
    pub is_error: bool,
}

pub fn flatten_content(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            let mut parts = Vec::new();
            for item in arr {
                match item {
                    serde_json::Value::String(s) => parts.push(s.clone()),
                    serde_json::Value::Object(obj) => {
                        let type_field = obj.get("type").and_then(|v| v.as_str());
                        match type_field {
                            Some("text") | Some("input_text") | Some("output_text") => {
                                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                                    parts.push(text.to_string());
                                }
                            }
                            Some("tool_use") => {
                                let name = obj
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("unknown");
                                let desc =
                                    obj.get("input")
                                        .and_then(|v| v.as_object())
                                        .and_then(|inp| {
                                            inp.get("description")
                                                .or_else(|| inp.get("file_path"))
                                                .and_then(|v| v.as_str())
                                        });
                                match desc {
                                    Some(d) => parts.push(format!("[Tool: {name} - {d}]")),
                                    None => parts.push(format!("[Tool: {name}]")),
                                }
                            }
                            _ => {
                                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                                    parts.push(text.to_string());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            parts.join("\n")
        }
        serde_json::Value::Object(obj) => {
            if let Some(parts) = obj.get("parts").and_then(|v| v.as_array()) {
                let texts: Vec<&str> = parts.iter().filter_map(|p| p.as_str()).collect();
                if !texts.is_empty() {
                    return texts.join("\n");
                }
            }
            obj.get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
        _ => String::new(),
    }
}

pub fn parse_timestamp(value: &serde_json::Value) -> Option<i64> {
    const MILLIS_THRESHOLD: i64 = 100_000_000_000;

    match value {
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(if i < MILLIS_THRESHOLD { i * 1000 } else { i })
            } else {
                n.as_f64().map(|f| {
                    if f < (MILLIS_THRESHOLD as f64) {
                        (f * 1000.0) as i64
                    } else {
                        f as i64
                    }
                })
            }
        }
        serde_json::Value::String(s) => {
            let s = s.trim();
            if s.is_empty() {
                return None;
            }
            if let Ok(i) = s.parse::<i64>() {
                return Some(if i < MILLIS_THRESHOLD { i * 1000 } else { i });
            }
            if let Ok(f) = s.parse::<f64>() {
                if f.is_finite() {
                    return Some(if f < (MILLIS_THRESHOLD as f64) {
                        (f * 1000.0) as i64
                    } else {
                        f as i64
                    });
                }
            }
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                return Some(dt.timestamp_millis());
            }
            if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ") {
                return Some(dt.and_utc().timestamp_millis());
            }
            if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%SZ") {
                return Some(dt.and_utc().timestamp_millis());
            }
            if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                return Some(dt.and_utc().timestamp_millis());
            }
            if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
                return Some(dt.and_utc().timestamp_millis());
            }
            None
        }
        _ => None,
    }
}

pub fn normalize_role(role: &str) -> MessageRole {
    match role.trim().to_ascii_lowercase().as_str() {
        "user" | "human" => MessageRole::User,
        "assistant" | "agent" | "model" | "gemini" => MessageRole::Assistant,
        "tool" | "toolresult" | "tool_result" => MessageRole::Tool,
        "system" | "developer" => MessageRole::System,
        other => MessageRole::Other(other.to_string()),
    }
}

pub fn reindex_messages(messages: &mut [CanonicalMessage]) {
    for (i, msg) in messages.iter_mut().enumerate() {
        msg.idx = i;
    }
}

pub fn truncate_title(content: &str, max_len: usize) -> String {
    let first_line = content.lines().next().unwrap_or("").trim();
    if first_line.chars().count() <= max_len {
        return first_line.to_string();
    }
    let mut truncated = String::new();
    for ch in first_line.chars().take(max_len.saturating_sub(3)) {
        truncated.push(ch);
    }
    truncated.push_str("...");
    truncated
}
