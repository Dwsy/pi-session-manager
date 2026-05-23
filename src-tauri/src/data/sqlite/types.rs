use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct SessionDetailsCache {
    pub file_modified: DateTime<Utc>,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub cache_read_tokens: usize,
    pub cache_write_tokens: usize,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_cost: f64,
    pub models_json: String,
    pub model_usage_json: String,
}

// Favorites functions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbFavoriteItem {
    pub id: String,
    #[serde(rename = "type")]
    pub favorite_type: String,
    pub name: String,
    pub path: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub is_builtin: bool,
    pub created_at: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSessionTag {
    pub session_id: String,
    pub tag_id: String,
    pub position: i64,
    pub assigned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DbPluginRecord {
    pub id: String,
    pub plugin_id: String,
    pub scope_type: String,
    pub scope_id: String,
    pub record_type: String,
    pub schema_version: i64,
    pub payload_json: String,
    pub searchable_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DbPluginRecordIndexValue {
    pub record_id: String,
    pub plugin_id: String,
    pub record_type: String,
    pub index_name: String,
    pub value_text: Option<String>,
    pub value_number: Option<f64>,
    pub value_datetime: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PluginRecordSearchHit {
    pub record: DbPluginRecord,
    pub snippet: String,
    pub rank: f64,
}
