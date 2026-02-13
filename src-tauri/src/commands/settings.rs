use serde_json::Value;
use std::fs;
use tauri::Manager;
use tracing::warn;

const APP_SETTINGS_KEY: &str = "app_settings";
const SERVER_SETTINGS_KEY: &str = "server_settings";
const SESSION_PATHS_KEY: &str = "session_paths";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ServerSettings {
    pub ws_enabled: bool,
    pub ws_port: u16,
    pub http_enabled: bool,
    pub http_port: u16,
    pub auth_enabled: bool,
    #[serde(default = "default_bind_addr")]
    pub bind_addr: String,
}

fn default_bind_addr() -> String {
    "127.0.0.1".to_string()
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            ws_enabled: true,
            ws_port: 52130,
            http_enabled: true,
            http_port: 52131,
            auth_enabled: true,
            bind_addr: default_bind_addr(),
        }
    }
}

pub fn load_server_settings_sync() -> ServerSettings {
    crate::settings_store::get_or_default::<ServerSettings>(SERVER_SETTINGS_KEY).unwrap_or_default()
}

#[tauri::command]
pub async fn load_server_settings() -> Result<ServerSettings, String> {
    crate::settings_store::get_or_default::<ServerSettings>(SERVER_SETTINGS_KEY)
}

#[tauri::command]
pub async fn save_server_settings(settings: ServerSettings) -> Result<(), String> {
    crate::settings_store::set(SERVER_SETTINGS_KEY, &settings)
}

pub async fn load_app_settings_internal() -> Result<Value, String> {
    if let Some(v) = crate::settings_store::get::<Value>(APP_SETTINGS_KEY)? {
        return Ok(v);
    }

    // Migrate from legacy JSON file if exists
    let config_dir = dirs::config_dir().ok_or("Failed to get config directory")?;
    let legacy_path = config_dir.join("pi-session-manager").join("settings.json");
    if legacy_path.exists() {
        if let Ok(content) = fs::read_to_string(&legacy_path) {
            if let Ok(v) = serde_json::from_str::<Value>(&content) {
                crate::settings_store::set(APP_SETTINGS_KEY, &v)?;
                let _ = fs::remove_file(&legacy_path);
                return Ok(v);
            }
        }
    }

    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn load_app_settings() -> Result<Value, String> {
    load_app_settings_internal().await
}

#[tauri::command]
pub async fn save_app_settings(settings: Value) -> Result<(), String> {
    crate::settings_store::set(APP_SETTINGS_KEY, &settings)
}

/// Get configured session paths (extra paths beyond the default)
#[tauri::command]
pub async fn get_session_paths() -> Result<Vec<String>, String> {
    let config = crate::config::Config::load().unwrap_or_default();
    Ok(config.session_paths)
}

/// Save session paths to config and sync to settings store
#[tauri::command]
pub async fn save_session_paths(
    paths: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    config.session_paths = paths.clone();
    crate::config::save_config(&config)?;
    // Also persist in settings store for WS/HTTP access
    crate::settings_store::set(SESSION_PATHS_KEY, &paths)?;
    // Invalidate scan cache so next scan picks up new paths
    crate::scanner::invalidate_cache();

    // Restart file watcher with new paths
    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) = crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone()) {
        warn!("Failed to restart file watcher: {}", e);
    }

    Ok(())
}

/// Get all resolved session directories (default + configured)
#[tauri::command]
pub async fn get_all_session_dirs() -> Result<Vec<String>, String> {
    let config = crate::config::Config::load().unwrap_or_default();
    let dirs = crate::scanner::get_all_session_dirs(&config);
    Ok(dirs.iter().map(|d| d.to_string_lossy().to_string()).collect())
}
