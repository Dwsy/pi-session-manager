//! Settings command adapter routes.

use super::*;

pub(super) const COMMANDS: &[&str] = &[
    "list_config_versions",
    "get_config_version",
    "restore_config_version",
    "load_app_settings",
    "save_app_settings",
    "list_datasets",
    "start_dataset_import",
    "get_dataset_import_status",
    "save_session_source",
    "save_session_scan_other_agents",
    "save_external_session_providers",
    "load_server_settings",
    "save_server_settings",
    "get_psm_config_dir",
    "get_session_paths",
    "save_session_paths",
    "save_default_pi_session_dir_enabled",
    "get_all_session_dirs",
    "check_version_downgrade",
    "allow_version_downgrade",
    "backup_database",
    "reset_database",
    "list_api_keys",
    "create_api_key",
    "revoke_api_key",
];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "list_config_versions" => {
                    let file_path = payload.get("file_path").and_then(|v| v.as_str()).map(String::from);
                    let result = crate::list_config_versions_internal(file_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "get_config_version" => {
                    let id = payload.get("id").and_then(|v| v.as_i64()).ok_or("Missing id")?;
                    let result = crate::get_config_version_internal(id).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "restore_config_version" => {
                    let id = payload.get("id").and_then(|v| v.as_i64()).ok_or("Missing id")?;
                    crate::restore_config_version_internal(id).await?;
                    Ok(Value::Null)
                }

                // ═══════════════════════════════════════════════════════════════
                // App settings
                // ═══════════════════════════════════════════════════════════════,
                "load_app_settings" => crate::load_app_settings_internal().await,
                "save_app_settings" => {
                    let settings = payload.get("settings").cloned().unwrap_or(Value::Object(Default::default()));
                    crate::save_app_settings(settings).await?;
                    Ok(Value::Null)
                }
                "list_datasets" => {
                    let result = crate::list_datasets().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "start_dataset_import" => {
                    let source = payload.get("source").and_then(|value| value.as_str()).ok_or("Missing source")?.to_string();
                    let result = crate::start_dataset_import(source).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_dataset_import_status" => {
                    let task_id = payload.get("task_id").or_else(|| payload.get("taskId")).and_then(|value| value.as_str()).ok_or("Missing task_id")?.to_string();
                    let result = crate::get_dataset_import_status(task_id).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "save_session_source" => {
                    let mode = payload.get("mode").and_then(|value| value.as_str()).unwrap_or("local").to_string();
                    let active_dataset_id = payload.get("active_dataset_id").or_else(|| payload.get("activeDatasetId")).and_then(|value| value.as_str()).map(ToString::to_string);
                    let active_dataset_ids = payload.get("active_dataset_ids").or_else(|| payload.get("activeDatasetIds")).and_then(|value| value.as_array()).map(|values| values.iter().filter_map(|value| value.as_str().map(ToString::to_string)).collect::<Vec<_>>());
                    crate::save_session_source_core(mode, active_dataset_id, active_dataset_ids).await?;
                    Ok(Value::Null)
                }
                "save_session_scan_other_agents" => {
                    let enabled = payload.get("enabled").and_then(|value| value.as_bool()).unwrap_or(true);
                    crate::save_session_scan_other_agents_core(enabled).await?;
                    Ok(Value::Null)
                }
                "save_external_session_providers" => {
                    let provider_slugs = payload.get("providerSlugs").or_else(|| payload.get("provider_slugs")).and_then(|value| value.as_array()).map(|items| items.iter().filter_map(|item| item.as_str().map(ToString::to_string)).collect::<Vec<_>>()).unwrap_or_default();
                    crate::save_external_session_providers_core(provider_slugs).await?;
                    Ok(Value::Null)
                }
                "load_server_settings" => {
                    let result = crate::load_server_settings().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "save_server_settings" => {
                    let settings = serde_json::from_value(payload.get("settings").cloned().unwrap_or(Value::Object(Default::default()))).map_err(|e| format!("Invalid settings: {e}"))?;
                    crate::save_server_settings(settings).await?;
                    Ok(Value::Null)
                }
                "get_psm_config_dir" => {
                    let result = crate::get_psm_config_dir().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_paths" => {
                    let result = crate::get_session_paths().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "save_session_paths" => {
                    let paths: Vec<String> = serde_json::from_value(payload.get("paths").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid paths: {e}"))?;
                    crate::save_session_paths_core(paths).await?;
                    Ok(Value::Null)
                }
                "save_default_pi_session_dir_enabled" => {
                    let enabled = extract_bool(payload, "enabled", true);
                    crate::save_default_pi_session_dir_enabled_core(enabled).await?;
                    Ok(Value::Null)
                }
                "get_all_session_dirs" => {
                    let result = crate::get_all_session_dirs().await?;
                    Ok(to_val(result, "serialize result")?)
                }

                // ═══════════════════════════════════════════════════════════════
                // Models
                // ═══════════════════════════════════════════════════════════════,
                "check_version_downgrade" => {
                    let result = crate::check_version_downgrade().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "allow_version_downgrade" => {
                    let allow = payload.get("allow").and_then(|value| value.as_bool()).unwrap_or(false);
                    crate::allow_version_downgrade(allow).await?;
                    Ok(Value::Null)
                }
                "backup_database" => {
                    let result = crate::backup_database().await?;
                    Ok(serde_json::json!({ "path": result }))
                }
                "reset_database" => {
                    let result = crate::reset_database().await?;
                    Ok(serde_json::json!({ "message": result }))
                }

                // ═══════════════════════════════════════════════════════════════
                // Tags
                // ═══════════════════════════════════════════════════════════════,
                "list_api_keys" => {
                    let result = crate::list_api_keys().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "create_api_key" => {
                    let name = extract_optional_string(payload, "name");
                    let key = extract_optional_string(payload, "key");
                    let value = extract_optional_string(payload, "value");
                    let result = crate::create_api_key(name, key, value).await?;
                    Ok(serde_json::json!(result))
                }
                "revoke_api_key" => {
                    let key_preview = extract(payload, "keyPreview")?;
                    crate::revoke_api_key(key_preview).await?;
                    Ok(Value::Null)
                }

                // ═══════════════════════════════════════════════════════════════
                // Pi agent live sessions
                // ═══════════════════════════════════════════════════════════════,
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}
