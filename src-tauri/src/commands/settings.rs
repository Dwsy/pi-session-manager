use serde_json::Value;
use std::fs;

const APP_SETTINGS_KEY: &str = "app_settings";
const SERVER_SETTINGS_KEY: &str = "server_settings";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ServerSettings {
    pub ws_enabled: bool,
    pub ws_port: u16,
    pub http_enabled: bool,
    pub http_port: u16,
    pub auth_enabled: bool,
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            ws_enabled: true,
            ws_port: 52130,
            http_enabled: true,
            http_port: 52131,
            auth_enabled: true,
        }
    }
}

pub fn load_server_settings_sync() -> ServerSettings {
    crate::settings_store::get_or_default::<ServerSettings>(SERVER_SETTINGS_KEY)
        .unwrap_or_default()
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
