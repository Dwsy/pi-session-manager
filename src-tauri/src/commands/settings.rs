use super::config_versions::save_config_snapshot;
use crate::{config, sqlite_cache};
use serde_json::Value;
use std::path::{Path, PathBuf};
#[cfg(feature = "gui")]
use tauri::Manager;
use tracing::warn;

const SESSION_PATHS_KEY: &str = "session_paths";
const INCLUDE_DEFAULT_PI_SESSION_DIR_KEY: &str = "include_default_pi_session_dir";

fn normalized_provider_slugs(provider_slugs: Vec<String>) -> Vec<String> {
    let mut normalized = provider_slugs.into_iter().map(|value| value.trim().to_ascii_lowercase()).filter(|value| !value.is_empty() && value != "pi").collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

#[cfg(feature = "gui")]
async fn refresh_sessions_after_settings_change(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    let previous = crate::core::scanner::get_cached_sessions().unwrap_or_default();
    crate::core::scanner::invalidate_cache();
    let current = crate::core::scanner::scan_sessions().await?;

    let previous_paths = previous.iter().map(|session| session.path.clone()).collect::<std::collections::HashSet<_>>();
    let current_paths = current.iter().map(|session| session.path.clone()).collect::<std::collections::HashSet<_>>();

    let removed = previous_paths.difference(&current_paths).cloned().collect::<Vec<_>>();

    app_handle.emit("sessions-changed", crate::types::SessionsDiff { updated: current, removed }).map_err(|error| format!("Failed to emit sessions-changed: {error}"))?;

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
    let value = serde_json::to_value(&settings).map_err(|e| format!("Failed to serialize server settings: {e}"))?;
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
        if let Some(value) = session.get("externalSessionsIncludeInStats").and_then(Value::as_bool) {
            config.external_sessions_include_in_stats = value;
        }
        if let Some(value) = session.get("externalSessionsIncludeInSearch").and_then(Value::as_bool) {
            config.external_sessions_include_in_search = value;
        }
        crate::config::save_config(&config)?;
    }
    crate::unified_config::write_section("app", preserve_lightweight_mode(settings))
}

/// lightweightMode is stored separately via get/set_lightweight_mode and is not
/// part of the frontend AppSettings model. Re-merge the current value into a
/// whole-section write, otherwise the next save wipes it (window reverts to
/// quitting on close instead of minimizing to tray).
fn preserve_lightweight_mode(settings: Value) -> Value {
    let mut merged = settings;
    if let Ok(Some(current)) = crate::settings_store::get::<bool>("lightweight_mode") {
        if let Some(obj) = merged.as_object_mut() {
            obj.insert("lightweightMode".to_string(), Value::Bool(current));
        }
    }
    merged
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

    let session_value = root.entry("session".to_string()).or_insert_with(|| serde_json::json!({}));
    if !session_value.is_object() {
        *session_value = serde_json::json!({});
    }
    if let Some(session) = session_value.as_object_mut() {
        session.insert("sourceMode".to_string(), Value::String(mode.to_string()));
        session.insert("activeDatasetId".to_string(), config.active_dataset_id.clone().map(Value::String).unwrap_or(Value::Null));
        session.insert("activeDatasetIds".to_string(), Value::Array(config.effective_active_dataset_ids().into_iter().map(Value::String).collect()));
        session.insert("scanOtherAgentJsonl".to_string(), Value::Bool(config.scan_other_agent_jsonl));
        session.insert("externalSessionProviders".to_string(), Value::Array(config.effective_external_session_provider_slugs().into_iter().map(Value::String).collect()));
        session.insert("externalSessionsIncludeInStats".to_string(), Value::Bool(config.external_sessions_include_in_stats));
        session.insert("externalSessionsIncludeInSearch".to_string(), Value::Bool(config.external_sessions_include_in_search));
    }

    let advanced_value = root.entry("advanced".to_string()).or_insert_with(|| serde_json::json!({}));
    if !advanced_value.is_object() {
        *advanced_value = serde_json::json!({});
    }
    if let Some(advanced) = advanced_value.as_object_mut() {
        advanced.insert("includeDefaultPiSessionDir".to_string(), Value::Bool(config.include_default_pi_session_dir));
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
pub async fn save_session_paths(paths: Vec<String>, app_handle: tauri::AppHandle) -> Result<(), String> {
    if !save_session_paths_core(paths).await? {
        return Ok(());
    }

    // Restart file watcher with new paths
    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) = crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone()) {
        warn!("Failed to restart file watcher: {}", e);
    }

    Ok(())
}

pub async fn save_default_pi_session_dir_enabled_core(enabled: bool) -> Result<bool, String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    if config.include_default_pi_session_dir == enabled {
        return Ok(false);
    }

    config.include_default_pi_session_dir = enabled;
    crate::config::save_config(&config)?;
    crate::settings_store::set(INCLUDE_DEFAULT_PI_SESSION_DIR_KEY, &enabled)?;

    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    let _ = crate::data::sqlite::clear_all_cache(&conn)?;
    crate::core::scanner::invalidate_cache();
    Ok(true)
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn save_default_pi_session_dir_enabled(enabled: bool, app_handle: tauri::AppHandle) -> Result<(), String> {
    if !save_default_pi_session_dir_enabled_core(enabled).await? {
        return Ok(());
    }

    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) = crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone()) {
        warn!("Failed to restart file watcher after save_default_pi_session_dir_enabled: {}", e);
    }

    if let Err(e) = refresh_sessions_after_settings_change(app_handle.clone()).await {
        warn!("Failed to refresh sessions after save_default_pi_session_dir_enabled: {}", e);
    }

    Ok(())
}

pub async fn save_session_scan_other_agents_core(enabled: bool) -> Result<bool, String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    if config.scan_other_agent_jsonl == enabled {
        return Ok(false);
    }
    let disabled_slugs = if enabled { Vec::new() } else { config.effective_external_session_provider_slugs() };
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
pub async fn save_session_scan_other_agents(enabled: bool, app_handle: tauri::AppHandle) -> Result<(), String> {
    if !save_session_scan_other_agents_core(enabled).await? {
        return Ok(());
    }

    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) = crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone()) {
        warn!("Failed to restart file watcher after save_session_scan_other_agents: {}", e);
    }

    if let Err(e) = refresh_sessions_after_settings_change(app_handle.clone()).await {
        warn!("Failed to refresh sessions after save_session_scan_other_agents: {}", e);
    }

    Ok(())
}

pub async fn save_external_session_providers_core(provider_slugs: Vec<String>) -> Result<bool, String> {
    let mut config = crate::config::Config::load().unwrap_or_default();
    let previous = config.effective_external_session_provider_slugs();
    let normalized = normalized_provider_slugs(provider_slugs);
    if config.external_session_provider_slugs == normalized && config.scan_other_agent_jsonl != normalized.is_empty() {
        return Ok(false);
    }
    config.external_session_provider_slugs = normalized.clone();
    config.scan_other_agent_jsonl = !normalized.is_empty();
    crate::config::save_config(&config)?;
    let disabled_slugs = previous.into_iter().filter(|slug| !normalized.iter().any(|enabled| enabled == slug)).collect::<Vec<_>>();
    if !disabled_slugs.is_empty() {
        let conn = crate::data::sqlite::init_db_with_config(&config)?;
        let _ = crate::data::sqlite::delete_sessions_by_source_slugs(&conn, &disabled_slugs)?;
    }
    crate::core::scanner::invalidate_cache();
    Ok(true)
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn save_external_session_providers(provider_slugs: Vec<String>, app_handle: tauri::AppHandle) -> Result<(), String> {
    if !save_external_session_providers_core(provider_slugs).await? {
        return Ok(());
    }

    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) = crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone()) {
        warn!("Failed to restart file watcher after save_external_session_providers: {}", e);
    }

    if let Err(e) = refresh_sessions_after_settings_change(app_handle.clone()).await {
        warn!("Failed to refresh sessions after save_external_session_providers: {}", e);
    }

    Ok(())
}

/// Get all resolved session directories (default + configured)
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_session_dirs() -> Result<Vec<String>, String> {
    let config = crate::config::Config::load().unwrap_or_default();
    let dirs = crate::core::scanner::get_all_session_dirs(&config);
    Ok(dirs.iter().map(|d| d.to_string_lossy().to_string()).collect())
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

fn settings_path_for_scope(scope: &str, cwd: Option<&str>) -> Result<PathBuf, String> {
    match scope {
        "project" => {
            let cwd_path = match cwd {
                Some(value) if !value.trim().is_empty() => PathBuf::from(value),
                _ => std::env::current_dir().map_err(|e| format!("Failed to get cwd: {e}"))?,
            };
            Ok(crate::paths::project_pi_dir(&cwd_path).join("settings.json"))
        }
        _ => crate::paths::pi_agent_settings_path().map_err(|e| format!("Failed to get home directory: {e}")),
    }
}

fn user_settings_path() -> Result<PathBuf, String> {
    settings_path_for_scope("user", None)
}

fn read_settings_json(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(path).map_err(|e| format!("Failed to read settings: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))
}

fn write_settings_json(path: &Path, json: &Value, save_snapshot: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(json).map_err(|e| format!("Failed to serialize settings: {e}"))?;
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
    json.get(key).and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default()
}

pub async fn load_pi_settings_internal() -> Result<PiSettings, String> {
    let path = user_settings_path()?;
    let json = read_settings_json(&path)?;

    Ok(PiSettings { skills: read_string_array(&json, "skills"), prompts: read_string_array(&json, "prompts"), extensions: read_string_array(&json, "extensions") })
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

fn validate_resource_state(state: &str) -> Result<(), String> {
    match state {
        "inherit" | "enabled" | "disabled" => Ok(()),
        _ => Err(format!("Invalid resource state: {state}")),
    }
}

fn exact_resource_override(entry: &str, path: &str) -> bool {
    let Some(prefix) = entry.chars().next() else {
        return false;
    };
    matches!(prefix, '+' | '-' | '!') && entry[1..] == *path
}

fn update_resource_entries(entries: &[Value], path: &str, state: &str) -> Result<Vec<String>, String> {
    validate_resource_state(state)?;
    let mut updated: Vec<String> = entries.iter().filter_map(|value| value.as_str().map(String::from)).filter(|entry| !exact_resource_override(entry, path)).collect();
    match state {
        "enabled" => updated.push(format!("+{path}")),
        "disabled" => updated.push(format!("-{path}")),
        "inherit" => {}
        _ => unreachable!("validated resource state"),
    }
    Ok(updated)
}

pub async fn set_resource_state_internal(resource_type: String, path: String, state: String, scope: String, cwd: Option<String>, origin: Option<String>, source: Option<String>) -> Result<(), String> {
    validate_resource_state(&state)?;
    if scope == "project" {
        let project_cwd = cwd.as_deref().filter(|value| !value.trim().is_empty()).ok_or_else(|| "Project cwd is required for project resource changes".to_string())?;
        if !super::resource_trust::is_project_trusted(Path::new(project_cwd))? {
            return Err("Project is not trusted; refusing to write project resource settings".to_string());
        }
    }

    let settings_path = settings_path_for_scope(&scope, cwd.as_deref())?;
    let mut json = read_settings_json(&settings_path)?;
    let is_package = origin.as_deref() == Some("package") || source.as_ref().is_some_and(|value| !value.is_empty() && value != "auto" && value != "local");

    if is_package {
        let package_source = source.as_deref().map(str::trim).filter(|value| !value.is_empty()).ok_or_else(|| "Missing package source for package resource state".to_string())?;
        set_package_resource_filter(&mut json, package_source, &resource_type, &path, &state)?;
    } else {
        let entries = json.get(&resource_type).and_then(Value::as_array).cloned().unwrap_or_default();
        let updated = update_resource_entries(&entries, &path, &state)?;
        if updated.is_empty() {
            json.as_object_mut().ok_or_else(|| "Invalid settings root".to_string())?.remove(&resource_type);
        } else {
            json[&resource_type] = serde_json::json!(updated);
        }
    }

    write_settings_json(&settings_path, &json, true)
}

fn set_package_resource_filter(json: &mut Value, package_source: &str, resource_type: &str, path: &str, state: &str) -> Result<(), String> {
    let packages = json.get_mut("packages").and_then(Value::as_array_mut).ok_or_else(|| "No packages array in settings.json".to_string())?;
    let pkg = packages
        .iter_mut()
        .find(|package| {
            let source = if let Some(value) = package.as_str() { value.trim_start_matches(['+', '-']) } else { package.get("source").and_then(Value::as_str).unwrap_or("").trim_start_matches(['+', '-']) };
            source == package_source
        })
        .ok_or_else(|| format!("Package not found in settings: {package_source}"))?;

    if pkg.is_string() && state == "inherit" {
        return Ok(());
    }
    if pkg.is_string() {
        *pkg = serde_json::json!({ "source": package_source });
    }

    let obj = pkg.as_object_mut().ok_or_else(|| "Invalid package entry".to_string())?;
    obj.entry("source").or_insert_with(|| serde_json::json!(package_source));
    let entries = obj.get(resource_type).and_then(Value::as_array).cloned().unwrap_or_default();
    let updated = update_resource_entries(&entries, path, state)?;
    if updated.is_empty() {
        obj.remove(resource_type);
    } else {
        obj.insert(resource_type.to_string(), serde_json::json!(updated));
    }

    let collapse_to_source = obj.len() == 1 && obj.contains_key("source");
    if collapse_to_source {
        *pkg = serde_json::json!(package_source);
    }
    Ok(())
}

pub async fn toggle_resource_internal(resource_type: String, path: String, enabled: bool, scope: String, cwd: Option<String>, origin: Option<String>, source: Option<String>) -> Result<(), String> {
    set_resource_state_internal(resource_type, path, if enabled { "enabled" } else { "disabled" }.to_string(), scope, cwd, origin, source).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn set_resource_state(resource_type: String, path: String, state: String, scope: String, cwd: Option<String>, origin: Option<String>, source: Option<String>) -> Result<(), String> {
    set_resource_state_internal(resource_type, path, state, scope, cwd, origin, source).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn toggle_resource(resource_type: String, path: String, enabled: bool, scope: String, cwd: Option<String>, origin: Option<String>, source: Option<String>) -> Result<(), String> {
    toggle_resource_internal(resource_type, path, enabled, scope, cwd, origin, source).await
}

#[cfg(test)]
mod resource_state_tests {
    use super::*;

    #[test]
    fn exact_state_changes_preserve_plain_and_broad_patterns() {
        let entries = vec![serde_json::json!("custom/skill.md"), serde_json::json!("!skills/**"), serde_json::json!("-skills/demo/SKILL.md")];

        let inherited = update_resource_entries(&entries, "skills/demo/SKILL.md", "inherit").unwrap();
        assert_eq!(inherited, vec!["custom/skill.md", "!skills/**"]);

        let enabled = update_resource_entries(&entries, "skills/demo/SKILL.md", "enabled").unwrap();
        assert_eq!(enabled.last().map(String::as_str), Some("+skills/demo/SKILL.md"));
    }
}

#[cfg(test)]
mod lightweight_mode_preservation_tests {
    use super::*;

    #[test]
    fn save_app_settings_keeps_lightweight_mode_when_frontend_omits_it() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let _env_lock = crate::paths::acquire_test_env_lock();
            let home = tempfile::tempdir().unwrap();
            let _home = crate::paths::TestHomeGuard::set(home.path());

            // Enable lightweight mode through its dedicated store path.
            crate::settings_store::set("lightweight_mode", &true).unwrap();

            // Frontend saves a full app-settings object that has no lightweightMode key.
            let frontend_settings = serde_json::json!({
                "appearance": { "theme": "light" },
                "language": { "locale": "zh-CN" }
            });
            save_app_settings(frontend_settings).await.unwrap();

            // The orphaned key must survive the whole-section overwrite.
            let stored = crate::settings_store::get::<bool>("lightweight_mode")
                .unwrap()
                .unwrap_or(false);
            assert!(stored, "lightweight_mode should persist after save_app_settings");
        });
    }

    #[test]
    fn preserve_lightweight_mode_merges_existing_value() {
        let _env_lock = crate::paths::acquire_test_env_lock();
        let home = tempfile::tempdir().unwrap();
        let _home = crate::paths::TestHomeGuard::set(home.path());

        crate::settings_store::set("lightweight_mode", &true).unwrap();

        let merged = preserve_lightweight_mode(serde_json::json!({
            "appearance": { "theme": "light" }
        }));
        assert_eq!(merged["lightweightMode"], serde_json::json!(true));
        assert_eq!(merged["appearance"]["theme"], serde_json::json!("light"));
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_psm_config_dir() -> Result<String, String> {
    Ok(crate::unified_config::config_root_dir()?.to_string_lossy().to_string())
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
    Ok(ClearCacheResult { sessions_deleted, details_deleted })
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
