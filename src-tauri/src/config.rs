use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SessionSourceMode {
    #[default]
    Local,
    Dataset,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DatasetRegistryEntry {
    pub id: String,
    pub slug: String,
    pub display_name: String,
    pub source_url: String,
    pub repo_id: String,
    #[serde(default = "default_dataset_revision")]
    pub revision: String,
    #[serde(default)]
    pub imported_at: Option<String>,
    #[serde(default)]
    pub total_files: usize,
    #[serde(default)]
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_realtime_cutoff_days")]
    pub realtime_cutoff_days: i64,

    #[serde(default = "default_scan_interval_seconds")]
    pub scan_interval_seconds: u64,

    #[serde(default = "default_enable_fts5")]
    pub enable_fts5: bool,

    #[serde(default = "default_preload_count")]
    pub preload_count: usize,

    #[serde(default = "default_auto_cleanup_days")]
    pub auto_cleanup_days: Option<i64>,

    #[serde(default)]
    pub session_paths: Vec<String>,

    #[serde(default = "default_scan_other_agent_jsonl")]
    pub scan_other_agent_jsonl: bool,

    #[serde(default)]
    pub external_session_provider_slugs: Vec<String>,

    #[serde(default = "default_external_sessions_include_in_stats")]
    pub external_sessions_include_in_stats: bool,

    #[serde(default = "default_external_sessions_include_in_search")]
    pub external_sessions_include_in_search: bool,

    #[serde(default)]
    pub session_source_mode: SessionSourceMode,

    #[serde(default)]
    pub active_dataset_id: Option<String>,

    #[serde(default)]
    pub active_dataset_ids: Vec<String>,

    #[serde(default)]
    pub datasets: Vec<DatasetRegistryEntry>,

    #[serde(default = "default_metrics_enabled")]
    pub metrics_enabled: bool,

    #[serde(default = "default_metrics_port")]
    pub metrics_port: u16,
}

fn default_realtime_cutoff_days() -> i64 {
    2
}

fn default_scan_interval_seconds() -> u64 {
    30
}

fn default_enable_fts5() -> bool {
    true
}

fn default_preload_count() -> usize {
    20
}

fn default_auto_cleanup_days() -> Option<i64> {
    None
}

fn default_scan_other_agent_jsonl() -> bool {
    false
}

fn default_external_sessions_include_in_stats() -> bool {
    false
}

fn default_external_sessions_include_in_search() -> bool {
    false
}

fn default_metrics_enabled() -> bool {
    false
}

fn default_metrics_port() -> u16 {
    9090
}

fn default_dataset_revision() -> String {
    "main".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            realtime_cutoff_days: 2,
            scan_interval_seconds: 30,
            enable_fts5: true,
            preload_count: 20,
            auto_cleanup_days: None,
            session_paths: vec![],
            scan_other_agent_jsonl: false,
            external_session_provider_slugs: vec![],
            external_sessions_include_in_stats: false,
            external_sessions_include_in_search: false,
            session_source_mode: SessionSourceMode::Local,
            active_dataset_id: None,
            active_dataset_ids: vec![],
            datasets: vec![],
            metrics_enabled: false,
            metrics_port: 9090,
        }
    }
}

impl Config {
    pub fn load() -> Result<Self, String> {
        load_config()
    }

    pub fn load_config() -> Result<Self, String> {
        load_config()
    }

    pub fn effective_active_dataset_ids(&self) -> Vec<String> {
        let mut values = self.active_dataset_ids.iter().map(|value| value.trim().to_string()).filter(|value| !value.is_empty()).collect::<Vec<_>>();

        if values.is_empty() {
            if let Some(value) = self.active_dataset_id.as_ref().map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
                values.push(value);
            }
        }

        values.sort();
        values.dedup();
        values
    }

    pub fn effective_external_session_provider_slugs(&self) -> Vec<String> {
        let mut values = self.external_session_provider_slugs.iter().map(|value| value.trim().to_ascii_lowercase()).filter(|value| !value.is_empty()).collect::<Vec<_>>();

        if values.is_empty() && self.scan_other_agent_jsonl {
            values = crate::domain::session_bridge::default_external_session_provider_slugs();
        }

        values.sort();
        values.dedup();
        values
    }
}

pub fn get_config_path() -> Result<PathBuf, String> {
    crate::unified_config::config_file_path()
}

pub fn load_config() -> Result<Config, String> {
    let value = crate::unified_config::read_section("session")?;
    serde_json::from_value::<Config>(value).map_err(|e| format!("Failed to parse session config: {e}"))
}

pub fn save_config(config: &Config) -> Result<(), String> {
    let value = serde_json::to_value(config).map_err(|e| format!("Failed to serialize session config: {e}"))?;
    crate::unified_config::write_section("session", value)
}

pub fn reset_config() -> Result<Config, String> {
    let default_config = Config::default();
    save_config(&default_config)?;
    Ok(default_config)
}
