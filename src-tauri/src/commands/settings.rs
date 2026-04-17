use super::config_versions::save_config_snapshot;
use crate::{config, sqlite_cache};
use serde_json::Value;
use std::path::{Path, PathBuf};
#[cfg(feature = "gui")]
use tauri::Manager;
use tracing::warn;

const SESSION_PATHS_KEY: &str = "session_paths";

fn normalized_provider_slugs(provider_slugs: Vec<String>) -> Vec<String> {
    let mut normalized = provider_slugs
        .into_iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty() && value != "pi")
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

#[cfg(feature = "gui")]
async fn refresh_sessions_after_settings_change(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Emitter;

    let previous = crate::core::scanner::get_cached_sessions().unwrap_or_default();
    crate::core::scanner::invalidate_cache();
    let current = crate::core::scanner::scan_sessions().await?;

    let previous_paths = previous
        .iter()
        .map(|session| session.path.clone())
        .collect::<std::collections::HashSet<_>>();
    let current_paths = current
        .iter()
        .map(|session| session.path.clone())
        .collect::<std::collections::HashSet<_>>();

    let removed = previous_paths
        .difference(&current_paths)
        .cloned()
        .collect::<Vec<_>>();

    app_handle
        .emit(
            "sessions-changed",
            crate::types::SessionsDiff {
                updated: current,
                removed,
            },
        )
        .map_err(|error| format!("Failed to emit sessions-changed: {error}"))?;

    Ok(())
}

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
            ws_port: 52131, // Single-port architecture: same as HTTP port
            http_enabled: true,
            http_port: 52131,
            auth_enabled: true,
            bind_addr: default_bind_addr(),
        }
    }
}

pub fn load_server_settings_sync() -> ServerSettings {
    load_server_settings_blocking().unwrap_or_default()
}

fn load_server_settings_blocking() -> Result<ServerSettings, String> {
    let value = crate::unified_config::read_section("server")?;
    serde_json::from_value(value).map_err(|e| format!("Failed to parse server settings: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_server_settings() -> Result<ServerSettings, String> {
    let value = crate::unified_config::read_section("server")?;
    serde_json::from_value(value).map_err(|e| format!("Failed to parse server settings: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_server_settings(settings: ServerSettings) -> Result<(), String> {
    let value = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize server settings: {e}"))?;
    crate::unified_config::write_section("server", value)
}

pub async fn load_app_settings_internal() -> Result<Value, String> {
    let mut value = crate::unified_config::read_section("app")?;
    inject_session_source_settings(&mut value);
    Ok(value)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_app_settings() -> Result<Value, String> {
    load_app_settings_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_app_settings(settings: Value) -> Result<(), String> {
    if let Some(session) = settings.get("session").and_then(Value::as_object) {
        let mut config = crate::config::Config::load().unwrap_or_default();
        if let Some(value) = session
            .get("externalSessionsIncludeInStats")
            .and_then(Value::as_bool)
        {
            config.external_sessions_include_in_stats = value;
        }
        if let Some(value) = session
            .get("externalSessionsIncludeInSearch")
            .and_then(Value::as_bool)
        {
            config.external_sessions_include_in_search = value;
        }
        crate::config::save_config(&config)?;
    }
    crate::unified_config::write_section("app", settings)
}

fn inject_session_source_settings(settings: &mut Value) {
    let config = crate::config::Config::load().unwrap_or_default();
    let mode = match config.session_source_mode {
        crate::config::SessionSourceMode::Dataset => "dataset",
        crate::config::SessionSourceMode::Local => "local",
    };

    let Some(root) = settings.as_object_mut() else {
        *settings = serde_json::json!({
            "session": {
                "sourceMode": mode,
                "activeDatasetId": config.active_dataset_id,
            }
        });
        return;
    };

    let session_value = root
        .entry("session".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !session_value.is_object() {
        *session_value = serde_json::json!({});
    }
    if let Some(session) = session_value.as_object_mut() {
        session.insert("sourceMode".to_string(), Value::String(mode.to_string()));
        session.insert(
            "activeDatasetId".to_string(),
            config
                .active_dataset_id
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        );
        session.insert(
            "activeDatasetIds".to_string(),
            Value::Array(
                config
                    .effective_active_dataset_ids()
                    .into_iter()
                    .map(Value::String)
                    .collect(),
            ),
        );
        session.insert(
            "scanOtherAgentJsonl".to_string(),
            Value::Bool(config.scan_other_agent_jsonl),
        );
        session.insert(
            "externalSessionProviders".to_string(),
            Value::Array(
                config
                    .effective_external_session_provider_slugs()
                    .into_iter()
                    .map(Value::String)
                    .collect(),
            ),
        );
        session.insert(
            "externalSessionsIncludeInStats".to_string(),
            Value::Bool(config.external_sessions_include_in_stats),
        );
        session.insert(
            "externalSessionsIncludeInSearch".to_string(),
            Value::Bool(config.external_sessions_include_in_search),
        );
    }
}

/// Get configured session paths (extra paths beyond the default)
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_paths() -> Result<Vec<String>, String> {
    let config = crate::config::Config::load().unwrap_or_default();
    Ok(config.session_paths)
}

/// Save session paths to config (pure logic, no GUI dependency)
pub async fn save_session_paths_core(paths: Vec<String>) -> Result<bool, String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    if config.session_paths == paths {
        return Ok(false);
    }
    config.session_paths = paths.clone();
    crate::config::save_config(&config)?;
    crate::settings_store::set(SESSION_PATHS_KEY, &paths)?;
    crate::core::scanner::invalidate_cache();
    Ok(true)
}

/// Save session paths to config and sync to settings store
#[cfg(feature = "gui")]
#[tauri::command]
pub async fn save_session_paths(
    paths: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if !save_session_paths_core(paths).await? {
        return Ok(());
    }

    // Restart file watcher with new paths
    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) =
        crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone())
    {
        warn!("Failed to restart file watcher: {}", e);
    }

    Ok(())
}

pub async fn save_session_scan_other_agents_core(enabled: bool) -> Result<bool, String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    if config.scan_other_agent_jsonl == enabled {
        return Ok(false);
    }
    let disabled_slugs = if enabled {
        Vec::new()
    } else {
        config.effective_external_session_provider_slugs()
    };
    config.scan_other_agent_jsonl = enabled;
    if !enabled {
        config.external_session_provider_slugs.clear();
    }
    crate::config::save_config(&config)?;
    if !disabled_slugs.is_empty() {
        let conn = crate::data::sqlite::init_db_with_config(&config)?;
        let _ = crate::data::sqlite::delete_sessions_by_source_slugs(&conn, &disabled_slugs)?;
    }
    crate::core::scanner::invalidate_cache();
    Ok(true)
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn save_session_scan_other_agents(
    enabled: bool,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if !save_session_scan_other_agents_core(enabled).await? {
        return Ok(());
    }

    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) =
        crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone())
    {
        warn!(
            "Failed to restart file watcher after save_session_scan_other_agents: {}",
            e
        );
    }

    if let Err(e) = refresh_sessions_after_settings_change(app_handle.clone()).await {
        warn!(
            "Failed to refresh sessions after save_session_scan_other_agents: {}",
            e
        );
    }

    Ok(())
}

pub async fn save_external_session_providers_core(
    provider_slugs: Vec<String>,
) -> Result<bool, String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    let previous = config.effective_external_session_provider_slugs();
    let normalized = normalized_provider_slugs(provider_slugs);
    if config.external_session_provider_slugs == normalized
        && config.scan_other_agent_jsonl != normalized.is_empty()
    {
        return Ok(false);
    }
    config.external_session_provider_slugs = normalized.clone();
    config.scan_other_agent_jsonl = !normalized.is_empty();
    crate::config::save_config(&config)?;
    let disabled_slugs = previous
        .into_iter()
        .filter(|slug| !normalized.iter().any(|enabled| enabled == slug))
        .collect::<Vec<_>>();
    if !disabled_slugs.is_empty() {
        let conn = crate::data::sqlite::init_db_with_config(&config)?;
        let _ = crate::data::sqlite::delete_sessions_by_source_slugs(&conn, &disabled_slugs)?;
    }
    crate::core::scanner::invalidate_cache();
    Ok(true)
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn save_external_session_providers(
    provider_slugs: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if !save_external_session_providers_core(provider_slugs).await? {
        return Ok(());
    }

    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) =
        crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone())
    {
        warn!(
            "Failed to restart file watcher after save_external_session_providers: {}",
            e
        );
    }

    if let Err(e) = refresh_sessions_after_settings_change(app_handle.clone()).await {
        warn!(
            "Failed to refresh sessions after save_external_session_providers: {}",
            e
        );
    }

    Ok(())
}

/// Get all resolved session directories (default + configured)
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_session_dirs() -> Result<Vec<String>, String> {
    let config = crate::config::Config::load().unwrap_or_default();
    let dirs = crate::core::scanner::get_all_session_dirs(&config);
    Ok(dirs
        .iter()
        .map(|d| d.to_string_lossy().to_string())
        .collect())
}

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
            Ok(crate::paths::project_pi_dir(&cwd).join("settings.json"))
        }
        _ => crate::paths::pi_agent_settings_path()
            .map_err(|e| format!("Failed to get home directory: {e}")),
    }
}

fn user_settings_path() -> Result<PathBuf, String> {
    settings_path_for_scope("user")
}

fn read_settings_json(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read settings: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))
}

fn write_settings_json(path: &Path, json: &Value, save_snapshot: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(json)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    std::fs::write(path, &content).map_err(|e| format!("Failed to write settings: {e}"))?;

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
            target = target.get_mut(*part).expect("ensure_object path exists");
        }
        target[*parts.last().expect("ensure_non_empty_path")] = value;
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

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_psm_config_dir() -> Result<String, String> {
    Ok(crate::unified_config::config_root_dir()?
        .to_string_lossy()
        .to_string())
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ClearCacheResult {
    pub sessions_deleted: usize,
    pub details_deleted: usize,
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn clear_cache() -> Result<ClearCacheResult, String> {
    let config = config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    let (sessions_deleted, details_deleted) = crate::data::sqlite::clear_all_cache(&conn)?;
    Ok(ClearCacheResult {
        sessions_deleted,
        details_deleted,
    })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn reset_app_settings() -> Result<(), String> {
    let mut root = crate::unified_config::load_root()?;
    let Some(map) = root.as_object_mut() else {
        return Err("Unified config root is not an object".to_string());
    };
    map.insert("app".to_string(), serde_json::json!({}));
    crate::unified_config::save_root(&serde_json::Value::Object(map.clone()))
}
