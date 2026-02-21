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
    #[serde(skip_serializing)]
    pub all_messages_text: String,
    pub user_messages_text: String,
    pub assistant_messages_text: String,
    pub last_message: String,
    pub last_message_role: String,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: Vec<Content>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    #[serde(rename = "type")]
    pub content_type: String,
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
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub score: f32,
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
        Self {
            total_cost: 0.0,
            total_runs: 0,
            total_tokens: 0,
            runs_by_agent: HashMap::new(),
            runs_by_model: HashMap::new(),
        }
    }
}
