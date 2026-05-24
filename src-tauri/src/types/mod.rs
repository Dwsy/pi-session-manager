use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub path: String,
    pub id: String,
    pub cwd: String,
    pub name: Option<String>,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    pub message_count: usize,
    pub first_message: String,
    #[serde(default, skip_serializing)]
    pub user_messages_text: String,
    #[serde(default, skip_serializing)]
    pub assistant_messages_text: String,
    pub last_message: String,
    pub last_message_role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_session_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Incremental diff emitted by file_watcher after rescan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionsDiff {
    pub updated: Vec<SessionInfo>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub id: String,
    pub parent_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub message: Option<Message>,
    #[serde(rename = "targetId", skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: Vec<Content>,
    #[serde(rename = "toolCallId", default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(rename = "toolName", default, skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(rename = "isError", default, skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
    /// Model name (e.g. "gpt-5", "claude-sonnet-4-20250514")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Provider name (e.g. "openai", "anthropic")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Token usage and cost data from the raw JSONL
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub session_id: String,
    pub session_path: String,
    pub session_name: Option<String>,
    pub first_message: String,
    pub matches: Vec<Match>,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Match {
    pub entry_id: String,
    pub role: String,
    pub snippet: String,
    pub timestamp: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullTextSearchHit {
    pub session_id: String,
    pub session_path: String,
    pub session_name: Option<String>,
    pub entry_id: String,
    pub role: String,
    pub source_type: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub score: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullTextSearchResponse {
    pub hits: Vec<FullTextSearchHit>,
    pub total_hits: usize,
    pub has_more: bool,
}

/// Parsed stats from a single subagent run's meta.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentRunInfo {
    pub run_id: String,
    pub agent: String,
    pub model: String,
    pub exit_code: i32,
    pub cost: f64,
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub cache_read_tokens: usize,
    pub cache_write_tokens: usize,
    pub duration_ms: u64,
    pub tool_count: usize,
    pub timestamp: i64,
    /// Number of agentic turns (added for @tintinweb/pi-subagents compatibility)
    #[serde(default)]
    pub turns: usize,
}

/// Per-agent-type aggregated stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStats {
    pub runs: usize,
    pub cost: f64,
    pub tokens: usize,
}

/// Aggregated subagent stats across all runs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentSummary {
    pub total_cost: f64,
    pub total_runs: usize,
    pub total_tokens: usize,
    pub runs_by_agent: HashMap<String, AgentStats>,
    pub runs_by_model: HashMap<String, f64>,
}

impl Default for SubagentSummary {
    fn default() -> Self {
        Self { total_cost: 0.0, total_runs: 0, total_tokens: 0, runs_by_agent: HashMap::new(), runs_by_model: HashMap::new() }
    }
}

#[cfg(test)]
mod tests {
    use super::SessionInfo;

    #[test]
    fn session_info_deserializes_without_removed_large_text_field() {
        let json = serde_json::json!({
            "path": "/tmp/session.jsonl",
            "id": "abc",
            "cwd": "/Users/demo/workspace/project-a",
            "name": "session-a",
            "created": "2026-01-18T00:00:00Z",
            "modified": "2026-01-18T01:00:00Z",
            "message_count": 12,
            "first_message": "hello",
            "user_messages_text": "",
            "assistant_messages_text": "",
            "last_message": "ok",
            "last_message_role": "assistant"
        });

        let parsed: SessionInfo = serde_json::from_value(json).expect("should deserialize");
        assert_eq!(parsed.user_messages_text, "");
    }

    #[test]
    fn session_info_serialization_skips_large_text_fields() {
        let created = chrono::DateTime::parse_from_rfc3339("2026-01-18T00:00:00Z").expect("valid created timestamp").with_timezone(&chrono::Utc);
        let modified = chrono::DateTime::parse_from_rfc3339("2026-01-18T01:00:00Z").expect("valid modified timestamp").with_timezone(&chrono::Utc);

        let session = SessionInfo {
            path: "/tmp/session.jsonl".to_string(),
            id: "abc".to_string(),
            cwd: "/Users/demo/workspace/project-a".to_string(),
            name: Some("session-a".to_string()),
            created,
            modified,
            message_count: 12,
            first_message: "hello".to_string(),
            user_messages_text: "user-text".to_string(),
            assistant_messages_text: "assistant-text".to_string(),
            last_message: "ok".to_string(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
            model: None,
        };

        let serialized = serde_json::to_value(&session).expect("should serialize");
        let object = serialized.as_object().expect("serialized object");

        assert!(!object.contains_key("user_messages_text"));
        assert!(!object.contains_key("assistant_messages_text"));
    }
}
