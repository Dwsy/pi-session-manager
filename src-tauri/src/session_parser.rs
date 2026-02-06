use serde_json::Value;

/// Parse session file to extract detailed statistics
pub fn parse_session_details(jsonl_content: &str) -> SessionDetails {
    let mut details = SessionDetails::default();
    let mut model_set: std::collections::HashSet<String> = std::collections::HashSet::new();
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
                        if let Some(model) = message["model"].as_str() {
                            let provider = message["provider"].as_str().unwrap_or("unknown");
                            let model_name = if provider != "unknown" {
                                format!("{}/{}", provider, model)
                            } else {
                                model.to_string()
                            };
                            model_set.insert(model_name);
                        }

                        // Extract token usage
                        if let Some(usage) = message.get("usage") {
                            let input = usage["input"].as_u64().unwrap_or(0);
                            let output = usage["output"].as_u64().unwrap_or(0);
                            let cache_read = usage["cacheRead"].as_u64().unwrap_or(0);
                            let cache_write = usage["cacheWrite"].as_u64().unwrap_or(0);

                            details.input_tokens += input;
                            details.output_tokens += output;
                            details.cache_read_tokens += cache_read;
                            details.cache_write_tokens += cache_write;

                            // Extract cost
                            if let Some(cost) = usage.get("cost") {
                                let input_cost = cost["input"].as_f64().unwrap_or(0.0);
                                let output_cost = cost["output"].as_f64().unwrap_or(0.0);
                                let cache_read_cost = cost["cacheRead"].as_f64().unwrap_or(0.0);
                                let cache_write_cost = cost["cacheWrite"].as_f64().unwrap_or(0.0);

                                details.input_cost += input_cost;
                                details.output_cost += output_cost;
                                details.cache_read_cost += cache_read_cost;
                                details.cache_write_cost += cache_write_cost;
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
                        first_message_time =
                            Some(first_message_time.unwrap_or(utc_time).min(utc_time));
                        last_message_time =
                            Some(last_message_time.unwrap_or(utc_time).max(utc_time));
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
    pub models: Vec<String>,
    pub first_message_time: Option<chrono::DateTime<chrono::Utc>>,
    pub last_message_time: Option<chrono::DateTime<chrono::Utc>>,
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
