use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const CONFIG_FILE: &str = "session-manager-config.toml";

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
        let mut values = self
            .active_dataset_ids
            .iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();

        if values.is_empty() {
            if let Some(value) = self
                .active_dataset_id
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
            {
                values.push(value);
            }
        }

        values.sort();
        values.dedup();
        values
    }

    pub fn effective_external_session_provider_slugs(&self) -> Vec<String> {
        let mut values = self
            .external_session_provider_slugs
            .iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();

        if values.is_empty() && self.scan_other_agent_jsonl {
            values = crate::domain::casr_min::providers::ProviderKind::ALL
                .into_iter()
                .filter(|provider| {
                    *provider != crate::domain::casr_min::providers::ProviderKind::Pi
                })
                .map(|provider| provider.slug().replace('_', "-"))
                .collect();
        }

        values.sort();
        values.dedup();
        values
    }
}

pub fn get_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".pi").join("agent");
    fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    Ok(config_dir.join(CONFIG_FILE))
}

pub fn load_config() -> Result<Config, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        let default_config = Config::default();
        save_config(&default_config)?;
        return Ok(default_config);
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {e}"))?;

    let config: Config =
        toml::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))?;

    Ok(config)
}

pub fn save_config(config: &Config) -> Result<(), String> {
    let config_path = get_config_path()?;

    let content =
        toml::to_string_pretty(config).map_err(|e| format!("Failed to serialize config: {e}"))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {e}"))?;

    Ok(())
}

pub fn reset_config() -> Result<Config, String> {
    let config_path = get_config_path()?;

    if config_path.exists() {
        fs::remove_file(&config_path).map_err(|e| format!("Failed to remove config: {e}"))?;
    }

    Ok(Config::default())
}
