//! Stats domain types
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    pub total_sessions: usize,
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub total_tokens: usize,
    pub sessions_by_project: HashMap<String, usize>,
    pub sessions_by_model: HashMap<String, usize>,
    pub model_usage_by_project: HashMap<String, HashMap<String, usize>>,
    pub messages_by_date: HashMap<String, usize>,
    pub messages_by_hour: HashMap<String, usize>,
    pub messages_by_day_of_week: HashMap<String, usize>,
    pub average_messages_per_session: f32,
    pub heatmap_data: Vec<HeatmapPoint>,
    pub time_distribution: Vec<TimeDistributionPoint>,
    pub token_details: TokenDetails,
    pub subagent_summary: crate::types::SubagentSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatsInput {
    pub path: String,
    pub cwd: String,
    pub modified: String,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenDetails {
    pub total_input: usize,
    pub total_output: usize,
    pub total_cache_read: usize,
    pub total_cache_write: usize,
    pub total_cost: f64,
    pub tokens_by_model: HashMap<String, ModelTokenStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelTokenStats {
    pub messages: usize,
    pub input: usize,
    pub output: usize,
    pub cache_read: usize,
    pub cache_write: usize,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapPoint {
    pub date: String,
    pub level: usize,
    pub total_messages: usize,
    pub total_tokens: usize,
    pub session_count: usize,
    pub top_project: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayProjectBreakdown {
    pub project_path: String,
    pub project_name: String,
    pub session_count: usize,
    pub message_count: usize,
    pub token_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaySession {
    pub path: String,
    pub cwd: String,
    pub name: Option<String>,
    pub first_message: String,
    pub message_count: usize,
    pub token_count: usize,
    pub model: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayStats {
    pub date: String,
    pub total_messages: usize,
    pub total_tokens: usize,
    pub session_count: usize,
    pub project_count: usize,
    pub project_breakdown: Vec<DayProjectBreakdown>,
    pub sessions: Vec<DaySession>,
    pub hourly_distribution: Vec<usize>,
    pub models_used: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeDistributionPoint {
    pub hour: usize,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String,
    pub message_count: usize,
    pub session_count: usize,
}
