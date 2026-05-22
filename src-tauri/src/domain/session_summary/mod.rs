//! Session Summary — AI-generated session metadata via LLM providers configured in models.json.

use crate::data::sqlite::DbSessionSummary;
use crate::domain::model_config::reader::read_models_config_internal;
use crate::utils::string::join_url;
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{info, warn};

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
        match content {
            crate::types::Content::Text { text } => {
                // Truncate very long text blocks
                if text.len() > 2000 {
                    parts.push(format!("{}...[truncated]", &text[..2000]));
                } else {
                    parts.push(text.clone());
                }
            }
            crate::types::Content::ToolResult { content, .. } => {
                // Skip tool results for summary context
                let _ = content;
            }
            _ => {}
        }
    }
    parts.join("\n")
}

/// Resolve provider config from models.json and pick a model.
/// If provider/model not specified, picks the first available model from the first provider.
fn resolve_provider_config(
    config: &Value,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<(String, String, String, String, String), String> {
    let providers = config
        .get("providers")
        .and_then(|v| v.as_object())
        .ok_or("Invalid models.json: missing providers object")?;

    if providers.is_empty() {
        return Err("No providers configured in models.json".to_string());
    }

    // Determine provider name
    let provider_name = if let Some(p) = provider {
        if providers.contains_key(p) {
            p.to_string()
        } else {
            return Err(format!("Provider `{p}` not found in models.json"));
        }
    } else {
        // Pick first provider
        providers.keys().next().unwrap().clone()
    };

    let provider_obj = providers.get(&provider_name).and_then(|v| v.as_object()).ok_or_else(|| format!("Provider `{provider_name}` is not an object"))?;

    let base_url = provider_obj.get("baseUrl").and_then(|v| v.as_str()).ok_or_else(|| format!("Provider `{provider_name}` missing baseUrl"))?.to_string();

    let api = provider_obj.get("api").and_then(|v| v.as_str()).unwrap_or("openai-completions").to_string();

    let api_key_raw = provider_obj.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
    let api_key = resolve_env_value(api_key_raw);

    let auth_header = provider_obj.get("authHeader").and_then(|v| v.as_bool()).unwrap_or(false);

    // Determine model id
    let model_id = if let Some(m) = model {
        // Verify model exists
        let found = provider_obj.get("models").and_then(|v| v.as_array()).map(|models| models.iter().any(|entry| entry.get("id").and_then(|v| v.as_str()) == Some(m))).unwrap_or(false);
        if !found {
            warn!("Model `{m}` not found in provider `{provider_name}`, using anyway");
        }
        m.to_string()
    } else {
        // Pick first model
        provider_obj
            .get("models")
            .and_then(|v| v.as_array())
            .and_then(|models| models.first())
            .and_then(|m| m.get("id"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Provider `{provider_name}` has no models"))?
            .to_string()
    };

    Ok((provider_name, model_id, base_url, api, api_key))
}

fn resolve_env_value(raw: &str) -> String {
    if let Some(var_name) = raw.strip_prefix('$') {
        std::env::var(var_name).unwrap_or_default()
    } else if raw.starts_with('!') {
        // Dynamic command — not supported for summary generation, just use raw
        raw.to_string()
    } else {
        raw.to_string()
    }
}

/// Call LLM to generate a session summary.
pub async fn generate_session_summary(
    context: &str,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<(SessionSummaryResult, String, String), String> {
    let config = read_models_config_internal()?;
    let (provider_name, model_id, base_url, api, api_key) = resolve_provider_config(&config, provider, model)?;

    info!("Generating summary using provider={provider_name} model={model_id} api={api}");

    let response_text = match api.as_str() {
        "openai-completions" => call_openai_completions(&base_url, &model_id, &api_key, context).await?,
        "openai-responses" => call_openai_responses(&base_url, &model_id, &api_key, context).await?,
        "anthropic-messages" => call_anthropic_messages(&base_url, &model_id, &api_key, context).await?,
        _ => return Err(format!("Unsupported API type for summary: {api}")),
    };

    // Try to extract text from response
    let text = extract_response_text(&api, &response_text).ok_or_else(|| format!("Failed to extract text from {api} response: {}", truncate(&response_text, 500)))?;

    // Parse JSON from text (strip markdown fences if present)
    let json_str = strip_markdown_fences(&text);
    let result: SessionSummaryResult = serde_json::from_str(json_str).map_err(|e| format!("Failed to parse summary JSON: {e}. Raw text: {}", truncate(&text, 300)))?;

    Ok((result, provider_name, model_id))
}

fn strip_markdown_fences(text: &str) -> &str {
    let trimmed = text.trim();
    if trimmed.starts_with("```") {
        // Find first newline after opening fence
        if let Some(start) = trimmed.find('\n') {
            let after_fence = &trimmed[start + 1..];
            // Remove closing fence
            if let Some(end) = after_fence.rfind("```") {
                return after_fence[..end].trim();
            }
            return after_fence.trim();
        }
    }
    trimmed
}

fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

fn extract_response_text(api: &str, response_text: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(response_text).ok()?;
    match api {
        "openai-completions" => parsed
            .get("choices")
            .and_then(|v| v.as_array())
            .and_then(|c| c.first())
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string()),
        "openai-responses" => parsed
            .get("output_text")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .or_else(|| {
                parsed
                    .get("output")
                    .and_then(|v| v.as_array())
                    .and_then(|items| items.iter().find_map(|item| item.get("content").and_then(|v| v.as_array()).and_then(|content| content.iter().find_map(|part| part.get("text").and_then(|v| v.as_str()).map(|s| s.trim().to_string())))))
            }),
        "anthropic-messages" => parsed
            .get("content")
            .and_then(|v| v.as_array())
            .and_then(|items| items.iter().find_map(|item| item.get("text").and_then(|v| v.as_str()).map(|s| s.trim().to_string()))),
        _ => None,
    }
}

fn build_auth_headers(api_key: &str, auth_header: bool, api: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if !api_key.is_empty() {
        if api == "anthropic-messages" {
            headers.insert(
                HeaderName::from_static("x-api-key"),
                HeaderValue::from_str(api_key).map_err(|e| format!("Invalid x-api-key: {e}"))?,
            );
            headers.insert(HeaderName::from_static("anthropic-version"), HeaderValue::from_static("2023-06-01"));
        } else if auth_header {
            let bearer = format!("Bearer {api_key}");
            headers.insert(
                HeaderName::from_static("authorization"),
                HeaderValue::from_str(&bearer).map_err(|e| format!("Invalid auth header: {e}"))?,
            );
        }
    }

    Ok(headers)
}

async fn call_openai_completions(base_url: &str, model: &str, api_key: &str, context: &str) -> Result<String, String> {
    let url = join_url(base_url, "chat/completions");
    let headers = build_auth_headers(api_key, true, "openai-completions")?;

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": context}
        ],
        "stream": false,
        "max_tokens": 1024,
        "temperature": 0.3,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .post(&url)
        .headers(headers)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read LLM response: {e}"))?;

    if !status.is_success() {
        return Err(format!("LLM returned {status}: {}", truncate(&text, 500)));
    }

    Ok(text)
}

async fn call_openai_responses(base_url: &str, model: &str, api_key: &str, context: &str) -> Result<String, String> {
    let url = join_url(base_url, "responses");
    let headers = build_auth_headers(api_key, true, "openai-responses")?;

    let body = serde_json::json!({
        "model": model,
        "input": format!("{}\n\n---\n\n{}", SUMMARY_PROMPT, context),
        "max_output_tokens": 1024,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .post(&url)
        .headers(headers)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read LLM response: {e}"))?;

    if !status.is_success() {
        return Err(format!("LLM returned {status}: {}", truncate(&text, 500)));
    }

    Ok(text)
}

async fn call_anthropic_messages(base_url: &str, model: &str, api_key: &str, context: &str) -> Result<String, String> {
    let url = join_url(base_url, "messages");
    let headers = build_auth_headers(api_key, false, "anthropic-messages")?;

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "system": SUMMARY_PROMPT,
        "messages": [
            {"role": "user", "content": context}
        ],
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .post(&url)
        .headers(headers)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read LLM response: {e}"))?;

    if !status.is_success() {
        return Err(format!("LLM returned {status}: {}", truncate(&text, 500)));
    }

    Ok(text)
}

/// Build a DbSessionSummary from the result, ready for SQLite storage.
pub fn to_db_summary(
    session_path: &str,
    result: &SessionSummaryResult,
    provider: &str,
    model: &str,
) -> DbSessionSummary {
    DbSessionSummary {
        session_path: session_path.to_string(),
        summary: result.summary.clone(),
        topics: result.topics.clone(),
        status: result.status.clone(),
        unresolved_tasks: result.unresolved_tasks.clone(),
        generated_at: Utc::now().to_rfc3339(),
        model_used: Some(model.to_string()),
        provider_used: Some(provider.to_string()),
    }
}
