use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::config_versions::save_config_snapshot;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PiSettings {
    pub skills: Vec<String>,
    pub prompts: Vec<String>,
    pub extensions: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompactionSettings {
    pub enabled: Option<bool>,
    pub reserve_tokens: Option<u32>,
    pub keep_recent_tokens: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RetrySettings {
    pub enabled: Option<bool>,
    pub max_retries: Option<u32>,
    pub base_delay_ms: Option<u32>,
    pub max_delay_ms: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    pub show_images: Option<bool>,
    pub clear_on_shrink: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImagesSettings {
    pub auto_resize: Option<bool>,
    pub block_images: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSettings {
    pub code_block_indent: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummarySettings {
    pub reserve_tokens: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PiSettingsFull {
    pub default_provider: Option<String>,
    pub default_model: Option<String>,
    pub default_thinking_level: Option<String>,
    pub enabled_models: Option<Vec<String>>,
    pub steering_mode: Option<String>,
    pub follow_up_mode: Option<String>,
    pub hide_thinking_block: Option<bool>,
    pub quiet_startup: Option<bool>,
    pub collapse_changelog: Option<bool>,
    pub enable_skill_commands: Option<bool>,
    pub double_escape_action: Option<String>,
    pub shell_path: Option<String>,
    pub shell_command_prefix: Option<String>,
    #[serde(default)]
    pub compaction: Option<CompactionSettings>,
    #[serde(default)]
    pub retry: Option<RetrySettings>,
    #[serde(default)]
    pub terminal: Option<TerminalSettings>,
    #[serde(default)]
    pub images: Option<ImagesSettings>,
    #[serde(default)]
    pub markdown: Option<MarkdownSettings>,
    #[serde(default)]
    pub branch_summary: Option<BranchSummarySettings>,
    pub theme: Option<String>,
    pub show_hardware_cursor: Option<bool>,
    pub editor_padding_x: Option<u8>,
    pub autocomplete_max_visible: Option<u8>,
    #[serde(default)]
    pub packages: Vec<Value>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub prompts: Vec<String>,
    #[serde(default)]
    pub themes: Vec<String>,
}

fn settings_path_for_scope(scope: &str) -> Result<PathBuf, String> {
    match scope {
        "project" => {
            let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {e}"))?;
            Ok(cwd.join(".pi/settings.json"))
        }
        _ => {
            let home = dirs::home_dir().ok_or("Failed to get home directory")?;
            Ok(home.join(".pi/agent/settings.json"))
        }
    }
}

fn user_settings_path() -> Result<PathBuf, String> {
    settings_path_for_scope("user")
}

fn read_settings_json(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read settings: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))
}

fn write_settings_json(path: &Path, json: &Value, save_snapshot: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(json)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(path, &content).map_err(|e| format!("Failed to write settings: {e}"))?;

    if save_snapshot {
        let path_str = path.to_string_lossy().to_string();
        if let Err(e) = save_config_snapshot(&path_str, &content) {
            eprintln!("Warning: failed to save config snapshot: {e}");
        }
    }
    Ok(())
}

fn read_string_array(json: &Value, key: &str) -> Vec<String> {
    json.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

pub async fn load_pi_settings_internal() -> Result<PiSettings, String> {
    let path = user_settings_path()?;
    let json = read_settings_json(&path)?;

    Ok(PiSettings {
        skills: read_string_array(&json, "skills"),
        prompts: read_string_array(&json, "prompts"),
        extensions: read_string_array(&json, "extensions"),
    })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_pi_settings() -> Result<PiSettings, String> {
    load_pi_settings_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_pi_settings(settings: PiSettings) -> Result<(), String> {
    let path = user_settings_path()?;
    let mut json = read_settings_json(&path)?;

    json["skills"] = serde_json::json!(settings.skills);
    json["prompts"] = serde_json::json!(settings.prompts);
    json["extensions"] = serde_json::json!(settings.extensions);

    write_settings_json(&path, &json, false)
}

pub async fn load_pi_settings_full_internal() -> Result<PiSettingsFull, String> {
    let path = user_settings_path()?;
    let json = read_settings_json(&path)?;
    serde_json::from_value(json).map_err(|e| format!("Failed to parse settings: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_pi_settings_full() -> Result<PiSettingsFull, String> {
    load_pi_settings_full_internal().await
}

pub async fn save_pi_setting_internal(key: String, value: Value) -> Result<(), String> {
    let path = user_settings_path()?;
    let mut json = read_settings_json(&path)?;

    let parts: Vec<&str> = key.split('.').collect();
    if parts.len() == 1 {
        json[&key] = value;
    } else {
        let mut target = &mut json;
        for part in &parts[..parts.len() - 1] {
            if !target.get(*part).is_some_and(|v| v.is_object()) {
                target[*part] = serde_json::json!({});
            }
            target = target.get_mut(*part).unwrap();
        }
        target[*parts.last().unwrap()] = value;
    }

    write_settings_json(&path, &json, true)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_pi_setting(key: String, value: Value) -> Result<(), String> {
    save_pi_setting_internal(key, value).await
}

pub async fn toggle_resource_internal(
    resource_type: String,
    path: String,
    enabled: bool,
    scope: String,
) -> Result<(), String> {
    let settings_path = settings_path_for_scope(&scope)?;
    let mut json = read_settings_json(&settings_path)?;

    let arr = json
        .get(&resource_type)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut new_arr: Vec<String> = arr
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .filter(|entry| {
            let clean = entry.trim_start_matches('+').trim_start_matches('-');
            clean != path
        })
        .collect();

    if enabled {
        new_arr.push(format!("+{path}"));
    } else {
        new_arr.push(format!("-{path}"));
    }

    json[&resource_type] = serde_json::json!(new_arr);
    write_settings_json(&settings_path, &json, true)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn toggle_resource(
    resource_type: String,
    path: String,
    enabled: bool,
    scope: String,
) -> Result<(), String> {
    toggle_resource_internal(resource_type, path, enabled, scope).await
}
