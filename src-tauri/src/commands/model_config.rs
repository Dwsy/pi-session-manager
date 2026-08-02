//! Model configuration commands - thin command layer delegating to domain
//!
//! All heavy logic moved to `domain/model_config/`

use crate::commands::config_versions::{list_config_versions_internal, ConfigVersionMeta};
use crate::domain::model_config as domain;
use crate::domain::model_config::types::{ModelConfigBackupMeta, ModelHttpTestResult, ModelOption};

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_options_fast() -> Result<Vec<ModelOption>, String> {
    domain::list_model_options_fast_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_options_full() -> Result<Vec<ModelOption>, String> {
    domain::list_model_options_full_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_model_config() -> Result<serde_json::Value, String> {
    domain::load_model_config_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_model_config(content: serde_json::Value, create_backup: Option<bool>) -> Result<(), String> {
    domain::save_model_config_internal(content, create_backup).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn create_model_config_backup(note: Option<String>) -> Result<ModelConfigBackupMeta, String> {
    domain::create_model_config_backup_internal(note)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_config_backups() -> Result<Vec<ModelConfigBackupMeta>, String> {
    domain::list_model_config_backups_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn restore_model_config_backup(id: String) -> Result<(), String> {
    domain::restore_model_config_backup_internal(id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_model_config_backup(id: String) -> Result<(), String> {
    domain::delete_model_config_backup_internal(id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_model_config_content() -> Result<String, String> {
    domain::export_model_config_content_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_model_config_to_path(path: String) -> Result<String, String> {
    domain::export_model_config_to_path_internal(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn import_model_config_content(content: String, mode: Option<String>) -> Result<serde_json::Value, String> {
    domain::import_model_config_content_internal(content, mode).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn import_model_config_from_path(path: String, mode: Option<String>) -> Result<serde_json::Value, String> {
    domain::import_model_config_from_path_internal(path, mode).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_config_versions() -> Result<Vec<ConfigVersionMeta>, String> {
    use crate::domain::model_config::reader::get_models_json_path;
    let file_path = get_models_json_path()?.to_string_lossy().to_string();
    list_config_versions_internal(Some(file_path)).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn test_model_http(provider: String, model: String, prompt: Option<String>, timeout_ms: Option<u64>) -> Result<ModelHttpTestResult, String> {
    domain::test_model_http_internal(provider, model, prompt, timeout_ms).await
}

// Internal helpers (called from the model dispatch adapter)
pub async fn list_model_config_versions_internal() -> Result<Vec<ConfigVersionMeta>, String> {
    use crate::domain::model_config::reader::get_models_json_path;
    let file_path = get_models_json_path()?.to_string_lossy().to_string();
    list_config_versions_internal(Some(file_path)).await
}
