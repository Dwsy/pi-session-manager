//! Trace domain types for Ariadne-style session analytics.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Per-event trace data (one per JSONL entry with meaningful content)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceEvent {
    pub id: String,
    pub parent_id: Option<String>,
    pub timestamp: String,
    pub offset_ms: u64,
    pub duration_ms: u64,
    pub event_type: TraceEventType,
    pub role: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub thinking: Option<String>,

    pub tool_calls: Vec<TraceToolCall>,

    pub tokens: Option<TraceTokens>,
    pub cost: Option<TraceCost>,

    pub content_preview: Option<String>,

    pub is_error: bool,
    pub error_message: Option<String>,

    pub files_read: Vec<String>,
    pub files_written: Vec<String>,
    pub files_edited: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TraceEventType {
    UserPrompt,
    AssistantResponse,
    ToolCall,
    ToolResult,
    ModelChange,
    ThinkingLevelChange,
    Compaction,
    CustomMessage,
    SystemEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceToolCall {
    pub id: String,
    pub name: String,
    pub arguments_preview: String,
    pub status: String,
    pub result_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceTokens {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceCost {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
    pub total: f64,
}

/// Full trace analytics for a single session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTraceAnalytics {
    // === Overview ===
    pub session_id: String,
    pub session_path: String,
    pub cwd: String,
    pub name: Option<String>,
    pub created: String,
    pub modified: String,
    pub duration_secs: u64,
    pub active_secs: u64,

    // === Totals ===
    pub total_events: usize,
    pub total_messages: usize,
    pub total_user_messages: usize,
    pub total_assistant_messages: usize,
    pub total_tool_calls: usize,
    pub total_tool_results: usize,
    pub total_errors: usize,
    pub total_tokens: TraceTokens,
    pub total_cost: TraceCost,
    pub primary_model: String,
    pub models_used: Vec<String>,
    pub compaction_count: usize,

    // === Tool breakdown ===
    pub tool_call_counts: HashMap<String, usize>,

    // === File tracking ===
    pub files_read: Vec<String>,
    pub files_written: Vec<String>,
    pub files_edited: Vec<String>,
    pub files_read_count: usize,
    pub files_written_count: usize,
    pub files_edited_count: usize,

    // === Bash commands ===
    pub bash_commands: Vec<BashCommandStat>,

    // === Timeline events (flat, sorted by timestamp) ===
    pub events: Vec<TraceEvent>,

    // === Token & cost breakdown by model ===
    pub tokens_by_model: HashMap<String, TraceTokens>,
    pub cost_by_model: HashMap<String, TraceCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BashCommandStat {
    pub command_prefix: String,
    pub count: usize,
}
