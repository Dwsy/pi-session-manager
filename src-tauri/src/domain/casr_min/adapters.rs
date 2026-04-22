use std::path::Path;

use chrono::{DateTime, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::types::{Content, Message, SessionEntry, SessionInfo};

use super::model::{CanonicalMessage, CanonicalSession, MessageRole};

pub fn canonical_to_session_info(canonical: &CanonicalSession, path: &Path, modified: DateTime<Utc>) -> SessionInfo {
    let entries = canonical_to_session_entries(canonical);
    let mut message_count = 0usize;
    let mut first_message = String::new();
    let mut last_message = String::new();
    let mut last_message_role = String::new();
    let mut all_messages = Vec::new();
    let mut user_messages = Vec::new();
    let mut assistant_messages = Vec::new();

    for entry in &entries {
        let Some(message) = &entry.message else {
            continue;
        };
        if message.role != "user" && message.role != "assistant" {
            continue;
        }
        message_count += 1;
        let text = message.content.iter().filter_map(|item| item.text.as_ref()).map(|v| v.trim()).filter(|v| !v.is_empty()).collect::<Vec<_>>().join("\n");
        if text.is_empty() {
            continue;
        }
        if first_message.is_empty() && message.role == "user" {
            first_message = truncate_text(&text, 100);
        }
        last_message = truncate_text(&text, 150);
        last_message_role = message.role.clone();
        all_messages.push(text.clone());
        if message.role == "user" {
            user_messages.push(text);
        } else {
            assistant_messages.push(text);
        }
    }

    SessionInfo {
        path: path.to_string_lossy().to_string(),
        id: canonical_session_cache_id(canonical, path),
        cwd: canonical.workspace.as_ref().map(|value| value.to_string_lossy().to_string()).unwrap_or_default(),
        name: canonical.title.clone(),
        created: canonical.started_at.and_then(DateTime::<Utc>::from_timestamp_millis).unwrap_or(modified),
        modified,
        message_count,
        first_message,
        user_messages_text: user_messages.join("\n"),
        assistant_messages_text: assistant_messages.join("\n"),
        last_message,
        last_message_role,
        parent_session_path: None,
    }
}

pub fn canonical_to_session_entries(canonical: &CanonicalSession) -> Vec<SessionEntry> {
    let mut entries = Vec::new();
    let mut previous_id: Option<String> = None;

    for message in &canonical.messages {
        let id = canonical_message_id(canonical, message);
        let mut content = Vec::new();

        if !message.content.trim().is_empty() {
            let content_type = if message.author.as_deref() == Some("reasoning") { "thinking".to_string() } else { "text".to_string() };
            content.push(Content { content_type, text: Some(message.content.trim().to_string()) });
        }
        for tool_call in &message.tool_calls {
            content.push(Content { content_type: "toolCall".to_string(), text: Some(tool_call.name.clone()) });
        }
        if matches!(message.role, MessageRole::Tool) {
            for tool_result in &message.tool_results {
                if !tool_result.content.trim().is_empty() {
                    content.push(Content { content_type: "text".to_string(), text: Some(tool_result.content.trim().to_string()) });
                }
            }
        }
        if content.is_empty() {
            continue;
        }

        let role = match message.role {
            MessageRole::Tool => "toolResult".to_string(),
            MessageRole::User => "user".to_string(),
            MessageRole::Assistant => "assistant".to_string(),
            MessageRole::System => "system".to_string(),
            MessageRole::Other(ref other) => other.clone(),
        };
        let timestamp = message.timestamp.and_then(DateTime::<Utc>::from_timestamp_millis).unwrap_or_else(Utc::now);

        entries.push(SessionEntry { entry_type: "message".to_string(), id: id.clone(), parent_id: previous_id.clone(), timestamp, message: Some(Message { role, content }), target_id: None, label: None });
        previous_id = Some(id);
    }

    entries
}

fn canonical_session_cache_id(canonical: &CanonicalSession, path: &Path) -> String {
    if canonical.provider_slug == "pi-agent" || canonical.provider_slug == "pi" {
        return canonical.session_id.clone();
    }

    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let short = &digest[..12];

    format!("{}:{}:{}", canonical.provider_slug.replace('_', "-"), canonical.session_id, short)
}

fn canonical_message_id(canonical: &CanonicalSession, message: &CanonicalMessage) -> String {
    message
        .extra
        .get("uuid")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| message.extra.pointer("/payload/id").and_then(Value::as_str).map(str::to_string))
        .or_else(|| message.extra.pointer("/payload/call_id").and_then(Value::as_str).map(str::to_string))
        .or_else(|| message.extra.get("id").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| format!("{}-{:04}", canonical.session_id, message.idx))
}

fn truncate_text(text: &str, max_len: usize) -> String {
    let first_line = text.lines().next().unwrap_or("").trim();
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
