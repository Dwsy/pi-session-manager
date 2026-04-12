//! Extracts structured trace analytics from a session JSONL file.
//!
//! Single-pass algorithm:
//! 1. Read JSONL file
//! 2. Parse header for session metadata
//! 3. Walk all entries, compute offsets/durations, extract usage data
//! 4. Aggregate tool calls, file tracking, bash commands, tokens, costs
//! 5. Return SessionTraceAnalytics

use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde_json::Value;

use super::types::*;

const CONTENT_PREVIEW_MAX: usize = 200;
const ARGS_PREVIEW_MAX: usize = 200;
const CMD_PREFIX_MAX: usize = 80;

pub fn extract_trace_analytics(session_path: &str) -> Result<SessionTraceAnalytics, String> {
    let content = std::fs::read_to_string(session_path)
        .map_err(|e| format!("Failed to read session file: {e}"))?;

    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() {
        return Err("Session file is empty".to_string());
    }

    // Parse header
    let header: Value = serde_json::from_str(lines[0])
        .map_err(|e| format!("Failed to parse session header: {e}"))?;

    if header["type"].as_str() != Some("session") {
        return Err("Missing session header".to_string());
    }

    let session_id = header["id"].as_str().unwrap_or("").to_string();
    let cwd = header["cwd"].as_str().unwrap_or("").to_string();
    let header_ts_str = header["timestamp"].as_str().unwrap_or("");
    let header_ts = parse_timestamp(header_ts_str);
    let name = extract_session_name(&lines);

    // First pass: collect all entries with timestamps for duration calculation
    struct RawEntry {
        value: Value,
        timestamp_ms: u64,
    }

    let mut raw_entries: Vec<RawEntry> = Vec::with_capacity(lines.len() - 1);

    for line in &lines[1..] {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            let ts_str = value["timestamp"].as_str().unwrap_or(header_ts_str);
            let ts_ms = parse_timestamp(ts_str);
            raw_entries.push(RawEntry {
                value,
                timestamp_ms: ts_ms,
            });
        }
    }

    let total_raw = raw_entries.len();

    // Track tool results for matching with tool calls
    let mut tool_results: HashMap<String, (bool, String)> = HashMap::new();

    // Aggregation state
    let mut events: Vec<TraceEvent> = Vec::with_capacity(total_raw);
    let mut model_counts: HashMap<String, usize> = HashMap::new();
    let mut tokens_by_model: HashMap<String, TraceTokens> = HashMap::new();
    let mut cost_by_model: HashMap<String, TraceCost> = HashMap::new();
    let mut tool_call_counts: HashMap<String, usize> = HashMap::new();
    let mut bash_cmd_counts: HashMap<String, usize> = HashMap::new();

    let mut total_tokens = TraceTokens {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        total: 0,
    };
    let mut total_cost = TraceCost {
        input: 0.0,
        output: 0.0,
        cache_read: 0.0,
        cache_write: 0.0,
        total: 0.0,
    };

    let mut total_user = 0usize;
    let mut total_assistant = 0usize;
    let mut total_tool_calls = 0usize;
    let mut total_tool_results = 0usize;
    let mut total_errors = 0usize;
    let mut compaction_count = 0usize;

    let mut files_read_set: HashSet<String> = HashSet::new();
    let mut files_written_set: HashSet<String> = HashSet::new();
    let mut files_edited_set: HashSet<String> = HashSet::new();
    let mut files_read_count = 0usize;
    let mut files_written_count = 0usize;
    let mut files_edited_count = 0usize;

    let mut first_user_ts: Option<u64> = None;
    let mut last_assistant_ts: Option<u64> = None;

    // Second pass: build trace events
    for (i, raw) in raw_entries.iter().enumerate() {
        let entry_type_str = raw.value["type"].as_str().unwrap_or("unknown");
        let id = raw.value["id"].as_str().unwrap_or("").to_string();
        let parent_id = raw.value["parentId"].as_str().map(|s| s.to_string());
        let ts_ms = raw.timestamp_ms;
        let offset_ms = ts_ms.saturating_sub(header_ts);

        // Duration = time until next event
        let next_ts = if i + 1 < raw_entries.len() {
            raw_entries[i + 1].timestamp_ms
        } else {
            ts_ms
        };
        let duration_ms = next_ts.saturating_sub(ts_ms);

        match entry_type_str {
            "message" => {
                let message = raw.value.get("message");
                if message.is_none() {
                    continue;
                }
                let msg = message.unwrap();
                let role = msg["role"].as_str().unwrap_or("unknown").to_string();

                match role.as_str() {
                    "user" => {
                        total_user += 1;
                        if first_user_ts.is_none() {
                            first_user_ts = Some(ts_ms);
                        }
                        let content_preview =
                            extract_text_content(msg).map(|s| truncate(&s, CONTENT_PREVIEW_MAX));

                        events.push(TraceEvent {
                            id,
                            parent_id,
                            timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                            offset_ms,
                            duration_ms,
                            event_type: TraceEventType::UserPrompt,
                            role: Some(role),
                            model: None,
                            provider: None,
                            thinking: None,
                            tool_calls: vec![],
                            tokens: None,
                            cost: None,
                            content_preview,
                            is_error: false,
                            error_message: None,
                            files_read: vec![],
                            files_written: vec![],
                            files_edited: vec![],
                        });
                    }

                    "assistant" => {
                        total_assistant += 1;
                        last_assistant_ts = Some(ts_ms);

                        let model = msg["model"].as_str().map(|s| s.to_string());
                        let provider = msg["provider"].as_str().map(|s| s.to_string());

                        // Model tracking
                        let model_key = if let (Some(p), Some(m)) = (&provider, &model) {
                            format!("{p}/{m}")
                        } else {
                            model.clone().unwrap_or_else(|| "unknown".to_string())
                        };
                        *model_counts.entry(model_key.clone()).or_insert(0) += 1;

                        // Tokens & cost
                        let (tokens, cost) = extract_usage(msg);
                        if let Some(ref t) = tokens {
                            total_tokens.input += t.input;
                            total_tokens.output += t.output;
                            total_tokens.cache_read += t.cache_read;
                            total_tokens.cache_write += t.cache_write;
                            total_tokens.total += t.total;

                            let mt =
                                tokens_by_model
                                    .entry(model_key.clone())
                                    .or_insert(TraceTokens {
                                        input: 0,
                                        output: 0,
                                        cache_read: 0,
                                        cache_write: 0,
                                        total: 0,
                                    });
                            mt.input += t.input;
                            mt.output += t.output;
                            mt.cache_read += t.cache_read;
                            mt.cache_write += t.cache_write;
                            mt.total += t.total;
                        }
                        if let Some(ref c) = cost {
                            total_cost.input += c.input;
                            total_cost.output += c.output;
                            total_cost.cache_read += c.cache_read;
                            total_cost.cache_write += c.cache_write;
                            total_cost.total += c.total;

                            let mc = cost_by_model.entry(model_key.clone()).or_insert(TraceCost {
                                input: 0.0,
                                output: 0.0,
                                cache_read: 0.0,
                                cache_write: 0.0,
                                total: 0.0,
                            });
                            mc.input += c.input;
                            mc.output += c.output;
                            mc.cache_read += c.cache_read;
                            mc.cache_write += c.cache_write;
                            mc.total += c.total;
                        }

                        // Thinking
                        let thinking = msg
                            .get("thinking")
                            .and_then(|v| v.as_str())
                            .map(|s| truncate(s, CONTENT_PREVIEW_MAX));

                        // Tool calls from content
                        let tool_calls = extract_tool_calls(msg);
                        let mut event_files_read = vec![];
                        let mut event_files_written = vec![];
                        let mut event_files_edited = vec![];

                        for tc in &tool_calls {
                            total_tool_calls += 1;
                            *tool_call_counts.entry(tc.name.clone()).or_insert(0) += 1;

                            // Track files from tool call arguments
                            if let Some(args) = parse_tool_args(msg, &tc.id) {
                                if let Some(path) = args.get("path").and_then(|v| v.as_str()) {
                                    match tc.name.as_str() {
                                        "read" => {
                                            files_read_set.insert(path.to_string());
                                            files_read_count += 1;
                                            event_files_read.push(path.to_string());
                                        }
                                        "write" => {
                                            files_written_set.insert(path.to_string());
                                            files_written_count += 1;
                                            event_files_written.push(path.to_string());
                                        }
                                        "edit" => {
                                            files_edited_set.insert(path.to_string());
                                            files_edited_count += 1;
                                            event_files_edited.push(path.to_string());
                                        }
                                        "bash" => {
                                            if let Some(cmd) =
                                                args.get("command").and_then(|v| v.as_str())
                                            {
                                                let prefix = truncate(cmd, CMD_PREFIX_MAX);
                                                *bash_cmd_counts.entry(prefix).or_insert(0) += 1;
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }

                        let content_preview =
                            extract_text_content(msg).map(|s| truncate(&s, CONTENT_PREVIEW_MAX));

                        events.push(TraceEvent {
                            id: id.clone(),
                            parent_id,
                            timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                            offset_ms,
                            duration_ms,
                            event_type: TraceEventType::AssistantResponse,
                            role: Some(role),
                            model: model.clone(),
                            provider: provider.clone(),
                            thinking,
                            tool_calls,
                            tokens,
                            cost,
                            content_preview,
                            is_error: false,
                            error_message: None,
                            files_read: event_files_read,
                            files_written: event_files_written,
                            files_edited: event_files_edited,
                        });
                    }

                    "toolResult" => {
                        total_tool_results += 1;
                        let tool_call_id = msg["toolCallId"].as_str().unwrap_or("").to_string();
                        let is_error = msg["isError"].as_bool().unwrap_or(false);
                        if is_error {
                            total_errors += 1;
                        }

                        let error_message = if is_error {
                            extract_text_content(msg).map(|s| truncate(&s, CONTENT_PREVIEW_MAX))
                        } else {
                            None
                        };

                        let result_preview =
                            extract_text_content(msg).map(|s| truncate(&s, CONTENT_PREVIEW_MAX));

                        // Store for matching with tool calls
                        tool_results.insert(
                            tool_call_id.clone(),
                            (is_error, result_preview.unwrap_or_default()),
                        );

                        events.push(TraceEvent {
                            id,
                            parent_id,
                            timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                            offset_ms,
                            duration_ms,
                            event_type: TraceEventType::ToolResult,
                            role: Some(role),
                            model: None,
                            provider: None,
                            thinking: None,
                            tool_calls: vec![],
                            tokens: None,
                            cost: None,
                            content_preview: None,
                            is_error,
                            error_message,
                            files_read: vec![],
                            files_written: vec![],
                            files_edited: vec![],
                        });
                    }

                    _ => {}
                }
            }

            "model_change" => {
                events.push(TraceEvent {
                    id,
                    parent_id,
                    timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                    offset_ms,
                    duration_ms,
                    event_type: TraceEventType::ModelChange,
                    role: None,
                    model: raw.value["modelId"].as_str().map(|s| s.to_string()),
                    provider: raw.value["provider"].as_str().map(|s| s.to_string()),
                    thinking: None,
                    tool_calls: vec![],
                    tokens: None,
                    cost: None,
                    content_preview: None,
                    is_error: false,
                    error_message: None,
                    files_read: vec![],
                    files_written: vec![],
                    files_edited: vec![],
                });
            }

            "thinking_level_change" => {
                events.push(TraceEvent {
                    id,
                    parent_id,
                    timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                    offset_ms,
                    duration_ms,
                    event_type: TraceEventType::ThinkingLevelChange,
                    role: None,
                    model: None,
                    provider: None,
                    thinking: raw.value["thinkingLevel"].as_str().map(|s| s.to_string()),
                    tool_calls: vec![],
                    tokens: None,
                    cost: None,
                    content_preview: None,
                    is_error: false,
                    error_message: None,
                    files_read: vec![],
                    files_written: vec![],
                    files_edited: vec![],
                });
            }

            "compaction" => {
                compaction_count += 1;
                events.push(TraceEvent {
                    id,
                    parent_id,
                    timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                    offset_ms,
                    duration_ms,
                    event_type: TraceEventType::Compaction,
                    role: None,
                    model: None,
                    provider: None,
                    thinking: raw
                        .value
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .map(|s| truncate(s, CONTENT_PREVIEW_MAX)),
                    tool_calls: vec![],
                    tokens: None,
                    cost: None,
                    content_preview: raw
                        .value
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .map(|s| truncate(s, CONTENT_PREVIEW_MAX)),
                    is_error: false,
                    error_message: None,
                    files_read: vec![],
                    files_written: vec![],
                    files_edited: vec![],
                });
            }

            "custom_message" => {
                events.push(TraceEvent {
                    id,
                    parent_id,
                    timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                    offset_ms,
                    duration_ms,
                    event_type: TraceEventType::CustomMessage,
                    role: None,
                    model: None,
                    provider: None,
                    thinking: None,
                    tool_calls: vec![],
                    tokens: None,
                    cost: None,
                    content_preview: raw
                        .value
                        .get("content")
                        .and_then(|v| v.as_str())
                        .map(|s| truncate(s, CONTENT_PREVIEW_MAX)),
                    is_error: false,
                    error_message: None,
                    files_read: vec![],
                    files_written: vec![],
                    files_edited: vec![],
                });
            }

            "branch_summary" => {
                events.push(TraceEvent {
                    id,
                    parent_id,
                    timestamp: raw.value["timestamp"].as_str().unwrap_or("").to_string(),
                    offset_ms,
                    duration_ms,
                    event_type: TraceEventType::SystemEvent,
                    role: None,
                    model: None,
                    provider: None,
                    thinking: raw
                        .value
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .map(|s| truncate(s, CONTENT_PREVIEW_MAX)),
                    tool_calls: vec![],
                    tokens: None,
                    cost: None,
                    content_preview: raw
                        .value
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .map(|s| truncate(s, CONTENT_PREVIEW_MAX)),
                    is_error: false,
                    error_message: None,
                    files_read: vec![],
                    files_written: vec![],
                    files_edited: vec![],
                });
            }

            _ => {}
        }
    }

    // Enrich tool calls with result info
    for event in &mut events {
        for tc in &mut event.tool_calls {
            if let Some((is_error, result_preview)) = tool_results.get(&tc.id) {
                tc.status = if *is_error {
                    "error".to_string()
                } else {
                    "completed".to_string()
                };
                tc.result_preview = Some(result_preview.clone());
            }
        }
    }

    // Compute derived values
    let primary_model = model_counts
        .iter()
        .max_by_key(|(_, &count)| count)
        .map(|(model, _)| model.clone())
        .unwrap_or_else(|| "unknown".to_string());

    let mut models_used: Vec<String> = model_counts.keys().cloned().collect();
    models_used.sort();

    let duration_secs = if total_raw > 0 {
        (raw_entries[total_raw - 1]
            .timestamp_ms
            .saturating_sub(header_ts))
            / 1000
    } else {
        0
    };

    let active_secs = match (first_user_ts, last_assistant_ts) {
        (Some(start), Some(end)) => end.saturating_sub(start) / 1000,
        _ => 0,
    };

    let bash_commands: Vec<BashCommandStat> = bash_cmd_counts
        .into_iter()
        .map(|(cmd, count)| BashCommandStat {
            command_prefix: cmd,
            count,
        })
        .collect();

    Ok(SessionTraceAnalytics {
        session_id,
        session_path: session_path.to_string(),
        cwd,
        name,
        created: header_ts_str.to_string(),
        modified: raw_entries
            .last()
            .map(|r| r.value["timestamp"].as_str().unwrap_or("").to_string())
            .unwrap_or_else(|| header_ts_str.to_string()),
        duration_secs,
        active_secs,
        total_events: events.len(),
        total_messages: total_user + total_assistant,
        total_user_messages: total_user,
        total_assistant_messages: total_assistant,
        total_tool_calls,
        total_tool_results,
        total_errors,
        total_tokens,
        total_cost,
        primary_model,
        models_used,
        compaction_count,
        tool_call_counts,
        files_read: files_read_set.into_iter().collect(),
        files_written: files_written_set.into_iter().collect(),
        files_edited: files_edited_set.into_iter().collect(),
        files_read_count,
        files_written_count,
        files_edited_count,
        bash_commands,
        events,
        tokens_by_model,
        cost_by_model,
    })
}

// === Helper functions ===

fn parse_timestamp(s: &str) -> u64 {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return dt.timestamp_millis().max(0) as u64;
    }
    0
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    // Find the largest valid char boundary at or before max
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

fn extract_text_content(msg: &Value) -> Option<String> {
    let content = msg.get("content")?;
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    if let Some(arr) = content.as_array() {
        for block in arr {
            if block["type"].as_str() == Some("text") {
                if let Some(text) = block["text"].as_str() {
                    return Some(text.to_string());
                }
            }
        }
    }
    None
}

fn extract_usage(msg: &Value) -> (Option<TraceTokens>, Option<TraceCost>) {
    let usage = match msg.get("usage") {
        Some(u) => u,
        None => return (None, None),
    };

    let tokens = TraceTokens {
        input: usage["input"].as_u64().unwrap_or(0),
        output: usage["output"].as_u64().unwrap_or(0),
        cache_read: usage["cacheRead"].as_u64().unwrap_or(0),
        cache_write: usage["cacheWrite"].as_u64().unwrap_or(0),
        total: usage["totalTokens"].as_u64().unwrap_or(0),
    };

    let cost_val = usage.get("cost");
    let cost = if let Some(c) = cost_val {
        TraceCost {
            input: c["input"].as_f64().unwrap_or(0.0),
            output: c["output"].as_f64().unwrap_or(0.0),
            cache_read: c["cacheRead"].as_f64().unwrap_or(0.0),
            cache_write: c["cacheWrite"].as_f64().unwrap_or(0.0),
            total: c["total"].as_f64().unwrap_or(0.0),
        }
    } else {
        TraceCost {
            input: 0.0,
            output: 0.0,
            cache_read: 0.0,
            cache_write: 0.0,
            total: 0.0,
        }
    };

    (Some(tokens), Some(cost))
}

fn extract_tool_calls(msg: &Value) -> Vec<TraceToolCall> {
    let content = match msg.get("content").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return vec![],
    };

    content
        .iter()
        .filter(|block| block["type"].as_str() == Some("toolCall"))
        .map(|block| {
            let id = block["id"].as_str().unwrap_or("").to_string();
            let name = block["name"].as_str().unwrap_or("unknown").to_string();
            let args_str = block
                .get("arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args_preview = truncate(args_str, ARGS_PREVIEW_MAX);

            TraceToolCall {
                id,
                name,
                arguments_preview: args_preview,
                arguments_raw: if args_str.is_empty() {
                    None
                } else {
                    Some(args_str.to_string())
                },
                status: "running".to_string(),
                result_preview: None,
            }
        })
        .collect()
}

fn parse_tool_args(msg: &Value, tool_call_id: &str) -> Option<Value> {
    let content = msg.get("content").and_then(|v| v.as_array())?;
    for block in content {
        if block["type"].as_str() == Some("toolCall") && block["id"].as_str() == Some(tool_call_id)
        {
            if let Some(args_str) = block.get("arguments").and_then(|v| v.as_str()) {
                if let Ok(args) = serde_json::from_str::<Value>(args_str) {
                    return Some(args);
                }
            }
        }
    }
    None
}

fn extract_session_name(lines: &[&str]) -> Option<String> {
    // Walk backwards to find the latest session_info entry with a name
    for line in lines.iter().rev() {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            if value["type"].as_str() == Some("session_info") {
                if let Some(name) = value["name"].as_str() {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn extract_from_real_session_file() {
        // Find a real session file
        let sessions_dir = dirs::home_dir()
            .map(|h| h.join(".pi/agent/sessions"))
            .expect("home dir");

        // Find the pi-session-manager sessions
        let psm_dir = sessions_dir.join("--Users-dengwenyu-Dev-AI-pi-session-manager--");
        if !psm_dir.exists() {
            eprintln!("Skipping test: no pi-session-manager sessions found");
            return;
        }

        // Pick the largest file
        let mut files: Vec<_> = fs::read_dir(&psm_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "jsonl"))
            .collect();
        files.sort_by_key(|e| e.metadata().map(|m| m.len()).unwrap_or(0));

        let test_file = files.last().expect("no session files");
        let path = test_file.path();
        let path_str = path.to_string_lossy().to_string();

        let analytics = extract_trace_analytics(&path_str).expect("should parse");

        assert!(!analytics.session_id.is_empty());
        assert!(analytics.total_events > 0, "expected events, got 0");
        assert!(analytics.total_messages > 0);
        assert!(!analytics.primary_model.is_empty());
    }

    #[test]
    fn extract_from_empty_content() {
        let result = extract_trace_analytics("/tmp/nonexistent-session.jsonl");
        assert!(result.is_err());
    }
}
