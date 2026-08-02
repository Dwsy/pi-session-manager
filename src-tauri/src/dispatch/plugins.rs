//! Plugins command adapter routes.

use super::*;

pub(super) const COMMANDS: &[&str] = &[
    "get_plugin_record",
    "list_plugin_records_for_scope",
    "search_plugin_records",
    "set_psm_plugin_permissions",
    "refresh_session_intelligence_record",
    "upsert_plugin_record",
    "plugin_fs_roots",
    "plugin_fs_list",
    "plugin_fs_read",
    "plugin_fs_stat",
    "plugin_window_open",
    "plugin_window_close",
    "load_psm_plugin_config",
    "set_psm_plugin_enabled",
    "set_psm_plugin_settings",
    "list_npm_psm_plugin_entries",
    "list_path_psm_plugin_entries",
    "list_dev_psm_plugin_entries",
    "search_psm_plugin_market",
    "add_path_psm_plugin",
    "remove_path_psm_plugin",
    "add_dev_psm_plugin",
    "remove_dev_psm_plugin",
    "install_psm_plugin",
    "uninstall_psm_plugin",
    "update_psm_plugins",
    "build_dev_psm_plugin",
    "reload_psm_plugins",
    "read_npm_psm_plugin_module_source",
    "read_path_psm_plugin_module_source",
    "read_dev_psm_plugin_module_source",
    "get_psm_plugin_paths",
    "read_psm_plugin_json_config",
    "write_psm_plugin_json_config",
];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "get_plugin_record" => {
                    let id = extract(payload, "id")?;
                    let result = crate::get_plugin_record(id).await?;
                    Ok(to_val(result, "serialize plugin record")?)
                }
                "list_plugin_records_for_scope" => {
                    let scope_type = extract(payload, "scope_type").or_else(|_| extract(payload, "scopeType"))?;
                    let scope_id = extract(payload, "scope_id").or_else(|_| extract(payload, "scopeId"))?;
                    let record_type = extract_optional_string(payload, "record_type").or_else(|| extract_optional_string(payload, "recordType"));
                    let limit = payload.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
                    let result = crate::list_plugin_records_for_scope(scope_type, scope_id, record_type, limit).await?;
                    Ok(to_val(result, "serialize plugin records")?)
                }
                "search_plugin_records" => {
                    let query = extract(payload, "query")?;
                    let record_type = extract_optional_string(payload, "record_type").or_else(|| extract_optional_string(payload, "recordType"));
                    let plugin_id = extract_optional_string(payload, "plugin_id").or_else(|| extract_optional_string(payload, "pluginId"));
                    let limit = payload.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
                    let result = crate::search_plugin_records(query, record_type, plugin_id, limit).await?;
                    Ok(to_val(result, "serialize plugin record search")?)
                }
                "set_psm_plugin_permissions" => {
                    let plugin_id = extract(payload, "plugin_id").or_else(|_| extract(payload, "pluginId"))?;
                    let permission_overrides = payload.get("permission_overrides").or_else(|| payload.get("permissionOverrides")).cloned().map(serde_json::from_value).transpose().map_err(|e| format!("Invalid plugin permission overrides: {e}"))?.unwrap_or_default();
                    let source = extract_optional_string(payload, "source");
                    let package_name = extract_optional_string(payload, "package_name").or_else(|| extract_optional_string(payload, "packageName"));
                    let entry_path = extract_optional_string(payload, "entry_path").or_else(|| extract_optional_string(payload, "entryPath"));
                    let project_path = extract_optional_string(payload, "project_path").or_else(|| extract_optional_string(payload, "projectPath"));
                    let result = crate::set_psm_plugin_permissions(plugin_id, permission_overrides, source, package_name, entry_path, project_path).await?;
                    Ok(to_val(result, "serialize plugin config")?)
                }
                "refresh_session_intelligence_record" => {
                    let path = extract(payload, "path").or_else(|_| extract(payload, "sessionPath")).or_else(|_| extract(payload, "session_path"))?;
                    let provider = extract_optional_string(payload, "provider");
                    let model = extract_optional_string(payload, "model");
                    let language = extract_optional_string(payload, "language").or_else(|| extract_optional_string(payload, "locale"));
                    let result = crate::refresh_session_intelligence_record(path, provider, model, language).await?;
                    Ok(to_val(result, "serialize refreshed session intelligence record")?)
                }
                "upsert_plugin_record" => {
                    let record = serde_json::from_value(payload.get("record").cloned().ok_or_else(|| "Missing field: record".to_string())?).map_err(|e| format!("Invalid plugin record: {e}"))?;
                    let index_values = payload.get("index_values").or_else(|| payload.get("indexValues")).cloned().map(serde_json::from_value).transpose().map_err(|e| format!("Invalid plugin record index values: {e}"))?;
                    crate::upsert_plugin_record(record, index_values).await?;
                    Ok(Value::Null)
                }
                "plugin_fs_roots" => {
                    let result = crate::plugin_fs_roots().await?;
                    Ok(to_val(result, "serialize plugin fs roots")?)
                }
                "plugin_fs_list" => {
                    let root_id = extract(payload, "root_id").or_else(|_| extract(payload, "rootId"))?;
                    let path = extract_optional_string(payload, "path");
                    let result = crate::plugin_fs_list(root_id, path).await?;
                    Ok(to_val(result, "serialize plugin fs entries")?)
                }
                "plugin_fs_read" => {
                    let root_id = extract(payload, "root_id").or_else(|_| extract(payload, "rootId"))?;
                    let path = extract(payload, "path")?;
                    let encoding = extract_optional_string(payload, "encoding");
                    let max_bytes = payload.get("max_bytes").or_else(|| payload.get("maxBytes")).and_then(|value| value.as_u64());
                    let result = crate::plugin_fs_read(root_id, path, encoding, max_bytes).await?;
                    Ok(to_val(result, "serialize plugin fs read result")?)
                }
                "plugin_fs_stat" => {
                    let root_id = extract(payload, "root_id").or_else(|_| extract(payload, "rootId"))?;
                    let path = extract(payload, "path")?;
                    let result = crate::plugin_fs_stat(root_id, path).await?;
                    Ok(to_val(result, "serialize plugin fs stat")?)
                }
                "plugin_window_open" => {
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or_else(|| "plugin_window_open requires GUI app state".to_string())?;
                        let title = extract(payload, "title")?;
                        let html = extract_optional_string(payload, "html");
                        let url = extract_optional_string(payload, "url");
                        let width = payload.get("width").and_then(|value| value.as_f64());
                        let height = payload.get("height").and_then(|value| value.as_f64());
                        let floating = payload.get("floating").and_then(|value| value.as_bool());
                        let result = crate::plugin_window_open(state.app_handle.clone(), title, html, url, width, height, floating).await?;
                        Ok(to_val(result, "serialize plugin window handle")?)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err("plugin_window_open is desktop-only".to_string())
                    }
                }
                "plugin_window_close" => {
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or_else(|| "plugin_window_close requires GUI app state".to_string())?;
                        let id = extract(payload, "id")?;
                        crate::plugin_window_close(state.app_handle.clone(), id).await?;
                        Ok(Value::Null)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err("plugin_window_close is desktop-only".to_string())
                    }
                }
                "load_psm_plugin_config" => {
                    let result = crate::load_psm_plugin_config().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "set_psm_plugin_enabled" => {
                    let plugin_id = extract(payload, "pluginId")?;
                    let enabled = payload.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                    let source = extract_optional_string(payload, "source");
                    let package_name = extract_optional_string(payload, "packageName");
                    let entry_path = extract_optional_string(payload, "entryPath");
                    let project_path = extract_optional_string(payload, "projectPath");
                    let result = crate::set_psm_plugin_enabled(plugin_id, enabled, source, package_name, entry_path, project_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "set_psm_plugin_settings" => {
                    let plugin_id = extract(payload, "pluginId")?;
                    let settings = serde_json::from_value(payload.get("settings").cloned().unwrap_or(Value::Object(Default::default()))).map_err(|e| format!("Invalid settings: {e}"))?;
                    let source = extract_optional_string(payload, "source");
                    let package_name = extract_optional_string(payload, "packageName");
                    let entry_path = extract_optional_string(payload, "entryPath");
                    let project_path = extract_optional_string(payload, "projectPath");
                    let result = crate::set_psm_plugin_settings(plugin_id, settings, source, package_name, entry_path, project_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "list_npm_psm_plugin_entries" => {
                    let result = crate::list_npm_psm_plugin_entries().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "list_path_psm_plugin_entries" => {
                    let result = crate::list_path_psm_plugin_entries().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "list_dev_psm_plugin_entries" => {
                    let result = crate::list_dev_psm_plugin_entries().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "search_psm_plugin_market" => {
                    let query = extract_optional_string(payload, "query");
                    let size = payload.get("size").and_then(|value| value.as_u64()).and_then(|value| usize::try_from(value).ok());
                    let from = payload.get("from").and_then(|value| value.as_u64()).and_then(|value| usize::try_from(value).ok());
                    let result = crate::search_psm_plugin_market(query, size, from).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "add_path_psm_plugin" => {
                    let entry_path = extract(payload, "entryPath")?;
                    let result = crate::add_path_psm_plugin(entry_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "remove_path_psm_plugin" => {
                    let entry_path = extract(payload, "entryPath")?;
                    let result = crate::remove_path_psm_plugin(entry_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "add_dev_psm_plugin" => {
                    let project_path = extract(payload, "projectPath")?;
                    let result = crate::add_dev_psm_plugin(project_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "remove_dev_psm_plugin" => {
                    let project_path = extract(payload, "projectPath")?;
                    let result = crate::remove_dev_psm_plugin(project_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "install_psm_plugin" => {
                    let package_name = extract(payload, "packageName")?;
                    let result = crate::install_psm_plugin(package_name).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "uninstall_psm_plugin" => {
                    let package_name = extract(payload, "packageName")?;
                    let result = crate::uninstall_psm_plugin(package_name).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "update_psm_plugins" => {
                    let result = crate::update_psm_plugins().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "build_dev_psm_plugin" => {
                    let project_path = extract(payload, "projectPath")?;
                    let result = crate::build_dev_psm_plugin(project_path).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "reload_psm_plugins" => {
                    let result = crate::reload_psm_plugins().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "read_npm_psm_plugin_module_source" => {
                    let entry_path = extract(payload, "entryPath")?;
                    let result = crate::read_npm_psm_plugin_module_source(entry_path).await?;
                    Ok(Value::String(result))
                }
                "read_path_psm_plugin_module_source" => {
                    let entry_path = extract(payload, "entryPath")?;
                    let result = crate::read_path_psm_plugin_module_source(entry_path).await?;
                    Ok(Value::String(result))
                }
                "read_dev_psm_plugin_module_source" => {
                    let entry_path = extract(payload, "entryPath")?;
                    let project_path = extract(payload, "projectPath")?;
                    let result = crate::read_dev_psm_plugin_module_source(entry_path, project_path).await?;
                    Ok(Value::String(result))
                }
                "get_psm_plugin_paths" => {
                    let result = crate::get_psm_plugin_paths().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "read_psm_plugin_json_config" => {
                    let plugin_id = extract_plugin_id(payload)?;
                    let key = extract(payload, "key")?;
                    let default_value = payload.get("defaultValue").or_else(|| payload.get("default_value")).cloned();
                    let result = crate::read_psm_plugin_json_config(plugin_id, key, default_value).await?;
                    Ok(result)
                }
                "write_psm_plugin_json_config" => {
                    let plugin_id = extract_plugin_id(payload)?;
                    let key = extract(payload, "key")?;
                    let value = payload.get("value").cloned().unwrap_or(Value::Null);
                    crate::write_psm_plugin_json_config(plugin_id, key, value).await?;
                    Ok(Value::Null)
                }

                // ═══════════════════════════════════════════════════════════════
                // Config versions
                // ═══════════════════════════════════════════════════════════════,
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}
