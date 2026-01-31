use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const CONFIG_FILE: &str = "session-manager-config.toml";

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

impl Default for Config {
    fn default() -> Self {
        Self {
            realtime_cutoff_days: 2,
            scan_interval_seconds: 30,
            enable_fts5: true,
            preload_count: 20,
            auto_cleanup_days: None,
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
}

pub fn get_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".pi").join("agent");
    fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(config_dir.join(CONFIG_FILE))
}

pub fn load_config() -> Result<Config, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        let default_config = Config::default();
        save_config(&default_config)?;
        return Ok(default_config);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: Config = toml::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

pub fn save_config(config: &Config) -> Result<(), String> {
    let config_path = get_config_path()?;

    let content = toml::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

pub fn reset_config() -> Result<Config, String> {
    let config_path = get_config_path()?;

    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove config: {}", e))?;
    }

    Ok(Config::default())
}