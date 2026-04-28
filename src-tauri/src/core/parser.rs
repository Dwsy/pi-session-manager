use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

fn get_u64_field(value: &Value, keys: &[&str]) -> u64 {
    keys.iter().find_map(|key| value.get(*key).and_then(|item| item.as_u64())).unwrap_or(0)
}

fn get_f64_field(value: &Value, keys: &[&str]) -> f64 {
    keys.iter().find_map(|key| value.get(*key).and_then(|item| item.as_f64())).unwrap_or(0.0)
}

fn find_usage_object(value: &Value) -> Option<&Value> {
    match value {
        Value::Object(map) => {
            if map.contains_key("input") || map.contains_key("output") || map.contains_key("cacheRead") || map.contains_key("cacheWrite") || map.contains_key("cache_read") || map.contains_key("cache_write") {
                return Some(value);
            }

            if let Some(usage) = map.get("usage") {
                if let Some(found) = find_usage_object(usage) {
                    return Some(found);
                }
            }

            for nested in map.values() {
                if let Some(found) = find_usage_object(nested) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items.iter().find_map(find_usage_object),
        _ => None,
    }
}

fn apply_usage_to_details(details: &mut SessionDetails, model_name: Option<&str>, usage: &Value) {
    let input = get_u64_field(usage, &["input", "input_tokens"]);
    let output = get_u64_field(usage, &["output", "output_tokens"]);
    let cache_read = get_u64_field(usage, &["cacheRead", "cache_read", "cache_read_tokens"]);
    let cache_write = get_u64_field(usage, &["cacheWrite", "cache_write", "cache_write_tokens"]);

    details.input_tokens += input;
    details.output_tokens += output;
    details.cache_read_tokens += cache_read;
    details.cache_write_tokens += cache_write;

    let input_cost = usage.get("cost").map(|cost| get_f64_field(cost, &["input", "input_cost"])).unwrap_or(0.0);
    let output_cost = usage.get("cost").map(|cost| get_f64_field(cost, &["output", "output_cost"])).unwrap_or(0.0);
    let cache_read_cost = usage.get("cost").map(|cost| get_f64_field(cost, &["cacheRead", "cache_read", "cache_read_cost"])).unwrap_or(0.0);
    let cache_write_cost = usage.get("cost").map(|cost| get_f64_field(cost, &["cacheWrite", "cache_write", "cache_write_cost"])).unwrap_or(0.0);

    details.input_cost += input_cost;
    details.output_cost += output_cost;
    details.cache_read_cost += cache_read_cost;
    details.cache_write_cost += cache_write_cost;

    if let Some(model) = model_name.filter(|value| !value.is_empty()) {
        let model_usage = details.model_usage.entry(model.to_string()).or_default();
        model_usage.input_tokens += input;
        model_usage.output_tokens += output;
        model_usage.cache_read_tokens += cache_read;
        model_usage.cache_write_tokens += cache_write;
        model_usage.cost += input_cost + output_cost + cache_read_cost + cache_write_cost;
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SessionModelUsage {
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub cost: f64,
}

/// Parse session file to extract detailed statistics
pub fn parse_session_details(jsonl_content: &str) -> SessionDetails {
    // Fast path: direct line-by-line parsing without creating CanonicalSession
    let mut details = SessionDetails::default();
    let mut model_set: HashSet<String> = HashSet::new();
    let mut first_message_time: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut last_message_time: Option<chrono::DateTime<chrono::Utc>> = None;

    for line in jsonl_content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(value) = serde_json::from_str::<Value>(line) {
            let entry_type = value["type"].as_str().unwrap_or("unknown");

            if entry_type == "message" {
                if let Some(message) = value.get("message") {
                    let role = message["role"].as_str().unwrap_or("unknown");

                    // Count messages by role
                    if role == "user" {
                        details.user_messages += 1;
                    } else if role == "assistant" {
                        details.assistant_messages += 1;

                        // Extract model and provider
                        let model_name = message["model"].as_str().map(|model| {
                            let provider = message["provider"].as_str().unwrap_or("unknown");
                            if provider != "unknown" {
                                format!("{provider}/{model}")
                            } else {
                                model.to_string()
                            }
                        });

                        if let Some(model_name) = model_name {
                            model_set.insert(model_name.clone());

                            if let Some(usage) = message.get("usage") {
                                let input = usage["input"].as_u64().unwrap_or(0);
                                let output = usage["output"].as_u64().unwrap_or(0);
                                let cache_read = usage["cacheRead"].as_u64().unwrap_or(0);
                                let cache_write = usage["cacheWrite"].as_u64().unwrap_or(0);

                                details.input_tokens += input;
                                details.output_tokens += output;
                                details.cache_read_tokens += cache_read;
                                details.cache_write_tokens += cache_write;

                                let model_usage = details.model_usage.entry(model_name).or_default();
                                model_usage.messages += 1;
                                model_usage.input_tokens += input;
                                model_usage.output_tokens += output;
                                model_usage.cache_read_tokens += cache_read;
                                model_usage.cache_write_tokens += cache_write;

                                if let Some(cost) = usage.get("cost") {
                                    let input_cost = cost["input"].as_f64().unwrap_or(0.0);
                                    let output_cost = cost["output"].as_f64().unwrap_or(0.0);
                                    let cache_read_cost = cost["cacheRead"].as_f64().unwrap_or(0.0);
                                    let cache_write_cost = cost["cacheWrite"].as_f64().unwrap_or(0.0);

                                    details.input_cost += input_cost;
                                    details.output_cost += output_cost;
                                    details.cache_read_cost += cache_read_cost;
                                    details.cache_write_cost += cache_write_cost;
                                    model_usage.cost += input_cost + output_cost + cache_read_cost + cache_write_cost;
                                }
                            }
                        }
                    } else if role == "toolResult" {
                        details.tool_results += 1;
                    }
                }

                // Track message timestamps
                if let Some(timestamp_str) = value["timestamp"].as_str() {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(timestamp_str) {
                        let utc_time = dt.with_timezone(&chrono::Utc);
                        first_message_time = Some(first_message_time.unwrap_or(utc_time).min(utc_time));
                        last_message_time = Some(last_message_time.unwrap_or(utc_time).max(utc_time));
                    }
                }
            } else if entry_type == "compaction" {
                details.compactions += 1;
            } else if entry_type == "branch_summary" {
                details.branch_summaries += 1;
            } else if entry_type == "custom_message" {
                details.custom_messages += 1;
            }
        }
    }

    details.models = model_set.into_iter().collect();
    details.first_message_time = first_message_time;
    details.last_message_time = last_message_time;

    details
}

#[derive(Debug, Clone, Default)]
pub struct SessionDetails {
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub tool_results: usize,
    pub custom_messages: usize,
    pub compactions: usize,
    pub branch_summaries: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_cost: f64,
    pub model_usage: HashMap<String, SessionModelUsage>,
    pub models: Vec<String>,
    pub first_message_time: Option<chrono::DateTime<chrono::Utc>>,
    pub last_message_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Extract basic session details from pre-parsed entries (message counts only).
/// This is much faster than reading the full JSONL file.
pub fn extract_basic_details_from_entries(entries: &[crate::types::SessionEntry]) -> SessionDetails {
    let mut details = SessionDetails::default();

    for entry in entries {
        if let Some(message) = &entry.message {
            match message.role.as_str() {
                "user" => details.user_messages += 1,
                "assistant" => details.assistant_messages += 1,
                _ => {}
            }
        }
    }

    details
}

/// Parse session details from pre-loaded entries (avoids re-reading file).
pub fn parse_session_details_from_entries(entries: &[crate::types::SessionEntry]) -> SessionDetails {
    let mut details = SessionDetails::default();
    let mut model_set: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in entries {
        if let Some(message) = &entry.message {
            match message.role.as_str() {
                "user" => details.user_messages += 1,
                "assistant" => {
                    details.assistant_messages += 1;
                    // Extract model name from content if available
                    for content in &message.content {
                        if content.content_type == "text" {
                            // Try to find model info in the content
                            if let Some(text) = &content.text {
                                if text.contains("model") {
                                    // Simple heuristic: look for model patterns
                                }
                            }
                        }
                    }
                }
                "tool" => details.tool_results += 1,
                _ => {}
            }

            // Extract usage from message content
            for content in &message.content {
                if content.content_type == "text" {
                    if let Some(text) = &content.text {
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
                            if let Some(usage) = find_usage_object(&value) {
                                apply_usage_to_details(&mut details, None, usage);
                            }
                        }
                    }
                }
            }
        }
    }

    details.models = model_set.into_iter().collect();
    details
}

impl SessionDetails {
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }

    pub fn total_cost(&self) -> f64 {
        self.input_cost + self.output_cost + self.cache_read_cost + self.cache_write_cost
    }

    pub fn total_messages(&self) -> usize {
        self.user_messages + self.assistant_messages + self.tool_results + self.custom_messages
    }
}

#[cfg(test)]
mod tests {
    use super::parse_session_details;

    #[test]
    fn parse_session_details_extracts_usage_from_canonical_provider_path() {
        let content = r#"{"type":"session","id":"pi-1","timestamp":"2026-01-01T00:00:00Z","cwd":"/repo"}
{"type":"message","id":"u1","timestamp":"2026-01-01T00:00:01Z","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}
{"type":"message","id":"a1","timestamp":"2026-01-01T00:00:02Z","message":{"role":"assistant","model":"gpt-5","provider":"openai","content":[{"type":"text","text":"hello"}],"usage":{"input":11,"output":29,"cacheRead":7,"cacheWrite":3,"cost":{"input":0.01,"output":0.02,"cacheRead":0.0,"cacheWrite":0.0}}}}"#;

        let details = parse_session_details(content);
        assert_eq!(details.input_tokens, 11);
        assert_eq!(details.output_tokens, 29);
        assert_eq!(details.cache_read_tokens, 7);
        assert_eq!(details.cache_write_tokens, 3);
        assert_eq!(details.total_tokens(), 40);
        assert!(details.total_cost() > 0.0);
    }
}
