//! Session Summary — AI-generated session metadata via the Pi AI SDK helper.

use crate::data::sqlite::DbPluginRecord;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

const SUMMARY_PROMPT: &str = r#"You are a session analysis assistant. Given a conversation between a user and an AI assistant, produce a JSON object with these fields:

- "summary": A concise 1-3 sentence summary of what was discussed and accomplished
- "topics": An array of 1-5 key topic tags (e.g. "rust", "debugging", "api-design")
- "status": One of "active", "completed", "blocked", "stale", "needs-review"
- "unresolved_tasks": An array of specific tasks/questions that remain unfinished (empty if none)

Respond ONLY with valid JSON, no markdown fences, no explanation."#;

const MAX_CONTEXT_MESSAGES: usize = 60;
const MAX_CONTEXT_CHARS: usize = 30_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummaryResult {
    pub summary: String,
    pub topics: Vec<String>,
    pub status: String,
    pub unresolved_tasks: Vec<String>,
}

fn summary_prompt_for_language(language: Option<&str>) -> String {
    let Some(language) = language.map(str::trim).filter(|value| !value.is_empty()) else {
        return SUMMARY_PROMPT.to_string();
    };
    format!("{SUMMARY_PROMPT}\n\nWrite all human-readable JSON string values in the user's current UI language: {language}. Keep JSON field names exactly as specified.")
}

/// Build a summary context string from session entries (user + assistant messages only).
pub fn build_summary_context(entries: &[crate::types::SessionEntry]) -> String {
    let mut lines = Vec::new();
    let mut total_chars = 0;

    for entry in entries.iter().rev() {
        let Some(ref message) = entry.message else { continue };
        if message.role != "user" && message.role != "assistant" {
            continue;
        }

        let text = extract_text_content(message);
        if text.is_empty() {
            continue;
        }

        let line = format!("{}: {}", message.role, text);
        total_chars += line.len();
        if total_chars > MAX_CONTEXT_CHARS {
            break;
        }
        lines.push(line);

        if lines.len() >= MAX_CONTEXT_MESSAGES {
            break;
        }
    }

    lines.reverse();
    lines.join("\n\n")
}

fn extract_text_content(message: &crate::types::Message) -> String {
    let mut parts = Vec::new();
    for content in &message.content {
        if let Some(text) = &content.text {
            if text.len() > 2000 {
                parts.push(format!("{}...[truncated]", &text[..2000]));
            } else {
                parts.push(text.clone());
            }
        }
    }
    parts.join("\n")
}

/// Call LLM to generate a session summary.
pub async fn generate_session_summary(context: &str, provider: Option<&str>, model: Option<&str>) -> Result<(SessionSummaryResult, String, String), String> {
    generate_session_summary_with_language(context, provider, model, None).await
}

/// Call LLM to generate a session summary in the requested UI language.
pub async fn generate_session_summary_with_language(context: &str, provider: Option<&str>, model: Option<&str>, language: Option<&str>) -> Result<(SessionSummaryResult, String, String), String> {
    let prompt = summary_prompt_for_language(language);
    let provider_name = provider.unwrap_or("auto");
    let model_name = model.unwrap_or("auto");
    info!(target: "session_summary", provider = provider_name, model = model_name, context_chars = context.len(), "Generating session summary");

    let response = crate::invoke_model_text(prompt, context.to_string(), provider.map(str::to_string), model.map(str::to_string), None).await?;
    info!(target: "session_summary", provider = response.provider.as_str(), model = response.model.as_str(), response_chars = response.text.len(), "Received summary response");

    let result = parse_summary_response(&response.text).inspect_err(|_| {
        error!(target: "session_summary", provider = response.provider.as_str(), model = response.model.as_str(), response_chars = response.text.len(), raw_preview = %truncate(&response.text, 500), "Failed to parse summary response");
    })?;
    info!(target: "session_summary", provider = response.provider.as_str(), model = response.model.as_str(), topics = result.topics.len(), unresolved_tasks = result.unresolved_tasks.len(), "Parsed session summary");
    Ok((result, response.provider, response.model))
}

pub(crate) fn parse_summary_response(text: &str) -> Result<SessionSummaryResult, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Session summary model returned empty text".to_string());
    }

    let json_str = extract_json_payload(trimmed).ok_or_else(|| {
        warn!(target: "session_summary", response_chars = trimmed.len(), raw_preview = %truncate(trimmed, 200), "Summary response did not contain JSON");
        "Session summary response did not contain a JSON object".to_string()
    })?;
    serde_json::from_str(json_str).map_err(|error| format!("Failed to parse summary JSON: {error}. Raw text: {}", truncate(trimmed, 300)))
}

fn extract_json_payload(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    if trimmed.starts_with("```") {
        // Find first newline after opening fence
        if let Some(start) = trimmed.find('\n') {
            let after_fence = &trimmed[start + 1..];
            // Remove closing fence
            if let Some(end) = after_fence.rfind("```") {
                let fenced = after_fence[..end].trim();
                return Some(fenced);
            }
            return Some(after_fence.trim());
        }
    }

    if trimmed.starts_with('{') {
        return Some(trimmed);
    }

    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end <= start {
        return None;
    }

    Some(trimmed[start..=end].trim())
}

fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

/// Build a `session.intelligence` plugin record from the summary result.
pub fn to_session_intelligence_record(session_path: &str, result: &SessionSummaryResult, provider: &str, model: &str) -> DbPluginRecord {
    to_session_intelligence_record_with_message_count(session_path, result, provider, model, None)
}

pub fn to_session_intelligence_record_with_message_count(session_path: &str, result: &SessionSummaryResult, provider: &str, model: &str, message_count: Option<usize>) -> DbPluginRecord {
    let now = Utc::now().to_rfc3339();
    let payload = serde_json::json!({
        "summary": result.summary,
        "topics": result.topics,
        "status": result.status,
        "unresolved_tasks": result.unresolved_tasks,
        "unresolvedTasks": result.unresolved_tasks,
        "model_used": model,
        "modelUsed": model,
        "model": model,
        "provider_used": provider,
        "providerUsed": provider,
        "provider": provider,
        "generated_at": now,
        "generatedAt": now,
        "message_count": message_count,
        "messageCount": message_count,
    });
    DbPluginRecord {
        id: format!("builtin.session-summary:{}", session_path),
        plugin_id: "builtin.session-summary".to_string(),
        scope_type: "session".to_string(),
        scope_id: session_path.to_string(),
        record_type: "session.intelligence".to_string(),
        schema_version: 1,
        payload_json: payload.to_string(),
        searchable_text: Some(format!("{} {} {}", result.summary, result.topics.join(" "), result.unresolved_tasks.join(" "))),
        created_at: now.clone(),
        updated_at: now,
    }
}

pub fn refresh_session_intelligence_record_from_summary(conn: &rusqlite::Connection, session_path: &str, entries: &[crate::types::SessionEntry], summary: SessionSummaryResult, provider: &str, model: &str) -> Result<DbPluginRecord, String> {
    let message_count = entries.iter().filter(|entry| entry.message.is_some()).count();
    let record = to_session_intelligence_record_with_message_count(session_path, &summary, provider, model, Some(message_count));
    crate::data::sqlite::upsert_plugin_record(conn, &record, &[])?;
    Ok(record)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_summary_response_accepts_plain_json() {
        let result = parse_summary_response(r#"{"summary":"ok","topics":["rust"],"status":"active","unresolved_tasks":[]}"#).expect("parse");
        assert_eq!(result.summary, "ok");
        assert_eq!(result.topics, vec!["rust"]);
        assert_eq!(result.status, "active");
        assert!(result.unresolved_tasks.is_empty());
    }

    #[test]
    fn parse_summary_response_accepts_fenced_json_with_wrapping_text() {
        let result = parse_summary_response("Here is the summary:\n```json\n{\"summary\":\"ok\",\"topics\":[\"debugging\"],\"status\":\"blocked\",\"unresolved_tasks\":[\"Fix parser\"]}\n```").expect("parse");
        assert_eq!(result.status, "blocked");
        assert_eq!(result.topics, vec!["debugging"]);
        assert_eq!(result.unresolved_tasks, vec!["Fix parser"]);
    }

    #[test]
    fn parse_summary_response_rejects_empty_text() {
        let error = parse_summary_response("   ").expect_err("empty text rejected");
        assert!(error.contains("empty text"));
    }
}
