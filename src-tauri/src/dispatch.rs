//! Command dispatcher - routes commands to handlers
//!
//! This file contains ONLY command routing logic.
//! All heavy business logic has been moved to:
//! - `domain/model_config/` - model configuration
//! - `domain/terminal/` - terminal launching
//! - `utils/` - shared utilities

use serde_json::Value;
use std::collections::HashSet;

#[cfg(feature = "gui")]
type DispatchAppState = crate::app_state::SharedAppState;
#[cfg(not(feature = "gui"))]
type DispatchAppState = ();

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum PluginPermission {
    SessionsRead,
    RecordsRead,
    RecordsWrite,
    SearchRead,
    TagsRead,
    TagsWrite,
    ConfigRead,
    ConfigWrite,
    ModelInvoke,
    AgentInvoke,
    FsRead,
    WindowsOpen,
}

#[derive(Debug, Clone, Default)]
struct PluginPermissionContext {
    plugin_id: Option<String>,
    permissions: HashSet<PluginPermission>,
}

// Re-export for backward compatibility
use crate::utils::payload::{extract_bool, extract_optional_string};
pub use crate::utils::payload::{extract_optional_string as extract_optional, extract_string as extract, extract_usize};

/// Serialize to JSON value, returning a descriptive error instead of panicking.
fn to_val<T: serde::Serialize>(value: T, ctx: &str) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| format!("{ctx}: {e}"))
}

fn unpack_pi_rpc_response(response: Value) -> Result<Value, String> {
    if response["success"].as_bool() == Some(false) {
        return Err(response["error"].as_str().map(str::to_string).unwrap_or_else(|| "Pi RPC command failed".to_string()));
    }

    Ok(response.get("data").cloned().unwrap_or(Value::Null))
}

fn parse_plugin_permission(value: &str) -> Option<PluginPermission> {
    match value {
        "sessions:read" => Some(PluginPermission::SessionsRead),
        "records:read" => Some(PluginPermission::RecordsRead),
        "records:write" => Some(PluginPermission::RecordsWrite),
        "search:read" => Some(PluginPermission::SearchRead),
        "tags:read" => Some(PluginPermission::TagsRead),
        "tags:write" => Some(PluginPermission::TagsWrite),
        "config:read" => Some(PluginPermission::ConfigRead),
        "config:write" => Some(PluginPermission::ConfigWrite),
        "model:invoke" => Some(PluginPermission::ModelInvoke),
        "agent:invoke" => Some(PluginPermission::AgentInvoke),
        "fs:read" => Some(PluginPermission::FsRead),
        "windows:open" => Some(PluginPermission::WindowsOpen),
        _ => None,
    }
}

fn extract_plugin_permission_context(payload: &Value) -> PluginPermissionContext {
    let Some(psm) = payload.get("__psm") else {
        return PluginPermissionContext::default();
    };

    let plugin_id = psm.get("pluginId").and_then(|value| value.as_str()).map(str::to_string);
    let permissions = psm.get("permissions").and_then(|value| value.as_array()).into_iter().flatten().filter_map(|value| value.as_str()).filter_map(parse_plugin_permission).collect::<HashSet<_>>();

    PluginPermissionContext { plugin_id, permissions }
}

fn required_permissions_for_command(command: &str) -> &'static [PluginPermission] {
    match command {
        "scan_sessions" | "scan_sessions_paginated" | "get_session_entries" | "read_session_file_chunk" | "get_session_labels" | "open_session_in_browser" | "open_session_in_terminal" => &[PluginPermission::SessionsRead],
        "get_plugin_record" | "list_plugin_records_for_scope" | "search_plugin_records" => &[PluginPermission::RecordsRead],
        "upsert_plugin_record" => &[PluginPermission::RecordsWrite],
        "refresh_session_intelligence_record" => &[PluginPermission::RecordsWrite, PluginPermission::ModelInvoke],
        "full_text_search" => &[PluginPermission::SearchRead],
        "get_all_tags" | "get_all_session_tags" => &[PluginPermission::TagsRead],
        "create_tag" | "assign_tag" | "remove_tag_from_session" => &[PluginPermission::TagsWrite],
        "read_psm_plugin_json_config" => &[PluginPermission::ConfigRead],
        "write_psm_plugin_json_config" => &[PluginPermission::ConfigWrite],
        "invoke_model_text" | "invoke_model_text_stream" => &[PluginPermission::ModelInvoke],
        "list_model_options_fast" => &[PluginPermission::ModelInvoke],
        "plugin_agent_create_session" | "plugin_agent_run" | "plugin_agent_abort" | "plugin_agent_dispose" => &[PluginPermission::AgentInvoke],
        "plugin_fs_roots" | "plugin_fs_list" | "plugin_fs_read" | "plugin_fs_stat" => &[PluginPermission::FsRead],
        "plugin_window_open" | "plugin_window_close" => &[PluginPermission::WindowsOpen],
        _ => &[],
    }
}

fn enforce_plugin_permission(command: &str, payload: &Value) -> Result<(), String> {
    let required = required_permissions_for_command(command);
    if required.is_empty() {
        return Ok(());
    }

    let ctx = extract_plugin_permission_context(payload);
    if ctx.permissions.is_empty() && ctx.plugin_id.is_none() {
        return Ok(());
    }

    if required.iter().all(|permission| ctx.permissions.contains(permission)) {
        return Ok(());
    }

    let plugin_name = ctx.plugin_id.unwrap_or_else(|| "unknown-plugin".to_string());
    Err(format!("Plugin permission denied: {plugin_name} cannot call {command}"))
}

fn extract_plugin_id(payload: &Value) -> Result<String, String> {
    payload.get("__psm").and_then(|psm| psm.get("pluginId")).and_then(Value::as_str).map(str::to_string).ok_or_else(|| "Missing PSM plugin identity".to_string())
}

/// Dispatch a command to the appropriate handler.
/// GUI-only commands (terminal, save_session_paths with watcher) are handled
/// by the caller in ws_adapter.rs.
/// Dispatch a command without app_state (for CLI/external callers).
pub async fn dispatch(command: &str, payload: &Value) -> Result<Value, String> {
    dispatch_impl(&None, command, payload).await
}

#[cfg(feature = "gui")]
pub async fn dispatch_with_state(app_state: &Option<crate::app_state::SharedAppState>, command: &str, payload: &Value) -> Result<Value, String> {
    dispatch_impl(app_state, command, payload).await
}

async fn dispatch_impl(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> Result<Value, String> {
    enforce_plugin_permission(command, payload)?;

    match command {
        // ═══════════════════════════════════════════════════════════════
        // Session scanning
        // ═══════════════════════════════════════════════════════════════
        "scan_sessions" => {
            let result = crate::core::scanner::scan_sessions().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "scan_sessions_paginated" => {
            let offset = payload.get("offset").and_then(|v| v.as_u64()).map(|v| v as usize);
            let limit = payload.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
            let search_query = extract_optional_string(payload, "search_query").or_else(|| extract_optional_string(payload, "searchQuery"));
            let project_filter = extract_optional_string(payload, "project_filter").or_else(|| extract_optional_string(payload, "projectFilter"));
            let filter_tag_ids = payload.get("filter_tag_ids").or_else(|| payload.get("filterTagIds")).and_then(|value| value.as_array()).map(|items| items.iter().filter_map(|item| item.as_str().map(|text| text.to_string())).collect::<Vec<String>>());
            let source_filter_slugs = payload.get("source_filter_slugs").or_else(|| payload.get("sourceFilterSlugs")).and_then(|value| value.as_array()).map(|items| items.iter().filter_map(|item| item.as_str().map(|text| text.to_string())).collect::<Vec<String>>());
            let sort_by = extract_optional_string(payload, "sort_by").or_else(|| extract_optional_string(payload, "sortBy"));
            let result = crate::scan_sessions_paginated(offset, limit, search_query, project_filter, filter_tag_ids, source_filter_slugs, sort_by).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "session_digest" => {
            let (version, count) = crate::core::scanner::get_session_digest();
            Ok(serde_json::json!({ "version": version, "count": count }))
        }

        // ═══════════════════════════════════════════════════════════════
        // Session file reading
        // ═══════════════════════════════════════════════════════════════
        "read_session_file" => {
            let path = extract(payload, "path")?;
            let result = crate::read_session_file(path).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "read_session_file_chunk" => {
            let path = extract(payload, "path")?;
            let offset = payload.get("offset").and_then(|v| v.as_u64());
            let max_bytes = payload.get("maxBytes").and_then(|v| v.as_u64()).map(|v| v as usize);
            let result = crate::read_session_file_chunk(path, offset, max_bytes).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "read_session_file_incremental" => {
            let path = extract(payload, "path")?;
            let from_line = extract_usize(payload, "fromLine")?;
            let result = crate::read_session_file_incremental(path, from_line).await?;
            Ok(serde_json::json!(result))
        }
        "read_session_file_incremental_offset" => {
            let path = extract(payload, "path")?;
            let from_offset = payload.get("fromOffset").and_then(|v| v.as_u64()).ok_or_else(|| "Missing or invalid field: fromOffset".to_string())?;
            let (new_offset, new_content) = crate::read_session_file_incremental_offset(path, from_offset).await?;
            Ok(serde_json::json!([new_offset, new_content]))
        }
        "get_file_stats" => {
            let path = extract(payload, "path")?;
            let result = crate::get_file_stats(path).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "get_session_entries" => {
            let path = extract(payload, "path")?;
            let result = crate::get_session_entries(path).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "get_session_labels" => {
            let path = extract(payload, "path")?;
            let result = crate::get_session_labels(path).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "detect_session_format" => {
            let path = extract(payload, "path")?;
            let result = crate::detect_session_format(path).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "list_supported_session_providers" => {
            let result = crate::list_supported_session_providers().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "convert_session_format" => {
            let path = extract(payload, "path")?;
            let target_format = extract_optional_string(payload, "target_format").or_else(|| extract_optional_string(payload, "targetFormat")).ok_or_else(|| "Missing field: target_format".to_string())?;
            let dry_run = payload.get("dry_run").or_else(|| payload.get("dryRun")).and_then(|value| value.as_bool());
            let force = payload.get("force").and_then(|value| value.as_bool());
            let result = crate::convert_session_format(path, target_format, dry_run, force).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "get_session_by_path" => {
            let path = extract(payload, "path")?;
            let result = crate::get_session_by_path(path).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "get_session_by_id" => {
            let id = extract(payload, "id")?;
            let result = crate::get_session_by_id(id).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "open_url_in_system" => {
            let url = extract(payload, "url")?;
            crate::open_url_in_system(url).await?;
            Ok(Value::Null)
        }
        "open_path_with_default_app" => {
            let path = extract(payload, "path")?;
            crate::open_path_with_default_app(path).await?;
            Ok(Value::Null)
        }
        "open_path_in_system" => {
            let path = extract(payload, "path")?;
            crate::open_path_in_system(path).await?;
            Ok(Value::Null)
        }

        // ═══════════════════════════════════════════════════════════════
        // Session management
        // ═══════════════════════════════════════════════════════════════
        "delete_session" => {
            let path = extract(payload, "path")?;
            crate::core::delete::delete_session_file_and_cache(&path)?;
            Ok(Value::Null)
        }
        "delete_sessions" => {
            let paths: Vec<String> = serde_json::from_value(payload.get("paths").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid paths: {e}"))?;
            let result = crate::delete_sessions(paths).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "export_session" => {
            let path = extract(payload, "path")?;
            let format = extract(payload, "format")?;
            let output_path = extract(payload, "outputPath")?;
            crate::export::export_session(&path, &format, &output_path).await?;
            Ok(Value::Null)
        }
        "rename_session" => {
            let path = extract(payload, "path")?;
            let new_name = extract(payload, "newName")?;
            crate::rename_session(path, new_name).await?;
            Ok(Value::Null)
        }
        "fork_session" => {
            let source_path = extract(payload, "sourcePath")?;
            let target_name = payload.get("targetName").and_then(|v| v.as_str()).map(|s| s.to_string());
            let result = crate::commands::session_file::fork_session_impl(source_path, target_name).await?;
            Ok(to_val(result, "serialize result")?)
        }

        // ═══════════════════════════════════════════════════════════════
        // Statistics
        // ═══════════════════════════════════════════════════════════════
        "get_session_stats" => {
            let sessions: Vec<crate::types::SessionInfo> = serde_json::from_value(payload.get("sessions").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid sessions: {e}"))?;
            let result = crate::stats::calculate_stats(&sessions);
            Ok(to_val(result, "serialize result")?)
        }
        "get_session_stats_light" => {
            let sessions: Vec<crate::stats::SessionStatsInput> = serde_json::from_value(payload.get("sessions").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid sessions: {e}"))?;
            let result = crate::stats::calculate_stats_from_inputs(&sessions);
            Ok(to_val(result, "serialize result")?)
        }
        // ═══════════════════════════════════════════════════════════════
        // Search
        // ═══════════════════════════════════════════════════════════════
        "search_sessions" => {
            let sessions: Vec<crate::types::SessionInfo> = serde_json::from_value(payload.get("sessions").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid sessions: {e}"))?;
            let query = extract(payload, "query")?;
            let search_mode = extract(payload, "searchMode").unwrap_or_else(|_| "content".to_string());
            let role_filter = extract(payload, "roleFilter").unwrap_or_else(|_| "all".to_string());
            let include_tools = payload.get("includeTools").and_then(|v| v.as_bool()).unwrap_or(false);
            let result = crate::search_sessions(sessions, query, search_mode, role_filter, include_tools).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "search_sessions_fts" => {
            let query = extract(payload, "query")?;
            let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let result = crate::search_sessions_fts(query, limit).await?;
            Ok(to_val(result, "serialize result")?)
        }
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
        "full_text_search" => {
            let query = extract(payload, "query")?;
            let role_filter = extract(payload, "role_filter").or_else(|_| extract(payload, "roleFilter")).map_err(|_| "Missing required field: role_filter or roleFilter")?;
            let glob_pattern = payload.get("glob_pattern").or_else(|| payload.get("globPattern")).and_then(|v| v.as_str()).map(String::from);
            let project_path = payload.get("project_path").or_else(|| payload.get("projectPath")).and_then(|v| v.as_str()).map(String::from);
            let page = payload.get("page").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let page_size = payload.get("page_size").or_else(|| payload.get("pageSize")).and_then(|v| v.as_u64()).unwrap_or(20) as usize;
            let match_mode = payload.get("match_mode").or_else(|| payload.get("matchMode")).and_then(|v| v.as_str()).map(String::from);
            let sort_order = payload.get("sort_order").or_else(|| payload.get("sortOrder")).and_then(|v| v.as_str()).map(String::from);
            let source_filter = payload.get("source_filter").or_else(|| payload.get("sourceFilter")).and_then(|v| v.as_str()).map(String::from);
            let from = payload.get("from").and_then(|v| v.as_str()).map(String::from);
            let to = payload.get("to").and_then(|v| v.as_str()).map(String::from);
            let result = crate::full_text_search(query, role_filter, glob_pattern, project_path, page, page_size, match_mode, sort_order, source_filter, from, to).await?;
            Ok(to_val(result, "serialize result")?)
        }

        // ═══════════════════════════════════════════════════════════════
        // Favorites
        // ═══════════════════════════════════════════════════════════════
        "get_all_favorites" => {
            let result = crate::get_all_favorites().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "add_favorite" => {
            let id = extract(payload, "id")?;
            let favorite_type = extract(payload, "favoriteType")?;
            let name = extract(payload, "name")?;
            let path = extract(payload, "path")?;
            crate::add_favorite(id, favorite_type, name, path).await?;
            Ok(Value::Null)
        }
        "remove_favorite" => {
            let id = extract(payload, "id")?;
            crate::remove_favorite(id).await?;
            Ok(Value::Null)
        }
        "is_favorite" => {
            let id = extract(payload, "id")?;
            let result = crate::is_favorite(id).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "toggle_favorite" => {
            let id = extract(payload, "id")?;
            let favorite_type = extract(payload, "favoriteType")?;
            let name = extract(payload, "name")?;
            let path = extract(payload, "path")?;
            let result = crate::toggle_favorite(id, favorite_type, name, path).await?;
            Ok(to_val(result, "serialize result")?)
        }

        // ═══════════════════════════════════════════════════════════════
        // Skills & prompts
        // ═══════════════════════════════════════════════════════════════
        "scan_skills" => {
            let result = crate::scan_skills_internal().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "scan_prompts" => {
            let result = crate::scan_prompts_internal().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "get_skill_content" => {
            let path = extract(payload, "path")?;
            let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read skill file: {e}"))?;
            Ok(to_val(content, "serialize content")?)
        }
        "get_prompt_content" => {
            let path = extract(payload, "path")?;
            let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read prompt file: {e}"))?;
            Ok(to_val(content, "serialize content")?)
        }
        "get_system_prompt" => {
            let result = crate::get_system_prompt().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "get_session_system_prompt" => {
            let path = extract(payload, "path")?;
            let result = crate::get_session_system_prompt_internal(path).await?;
            Ok(to_val(result, "serialize result")?)
        }

        // ═══════════════════════════════════════════════════════════════
        // Settings
        // ═══════════════════════════════════════════════════════════════
        "load_pi_settings" => {
            let result = crate::load_pi_settings_internal().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "save_pi_settings" => {
            let settings = serde_json::from_value(payload.get("settings").cloned().unwrap_or(Value::Object(Default::default()))).map_err(|e| format!("Invalid settings: {e}"))?;
            crate::save_pi_settings(settings).await?;
            Ok(Value::Null)
        }
        "scan_all_resources" => {
            let cwd = extract_optional_string(payload, "cwd");
            let result = crate::scan_all_resources_internal(cwd).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "load_pi_settings_full" => {
            let result = crate::load_pi_settings_full_internal().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "save_pi_setting" => {
            let key = extract(payload, "key")?;
            let value = payload.get("value").cloned().unwrap_or(Value::Null);
            crate::save_pi_setting_internal(key, value).await?;
            Ok(Value::Null)
        }
        "toggle_resource" => {
            let resource_type = extract(payload, "resource_type")?;
            let path = extract(payload, "path")?;
            let enabled = payload.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
            crate::toggle_resource_internal(resource_type, path, enabled, scope).await?;
            Ok(Value::Null)
        }
        "read_resource_file" => {
            let path = extract(payload, "path")?;
            let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
            let result = crate::read_resource_file_internal(path, scope).await?;
            Ok(Value::String(result))
        }

        // ═══════════════════════════════════════════════════════════════
        // Model config (delegates to domain)
        // ═══════════════════════════════════════════════════════════════
        "list_model_options_fast" => {
            let result = crate::domain::model_config::list_model_options_fast_internal().await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "list_model_options_full" => {
            let result = crate::domain::model_config::list_model_options_full_internal().await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "load_model_config" => {
            let result = crate::domain::model_config::load_model_config_internal().await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "save_model_config" => {
            let content = payload.get("content").cloned().ok_or("Missing content")?;
            let create_backup = payload.get("create_backup").or_else(|| payload.get("createBackup")).and_then(|v| v.as_bool());
            crate::domain::model_config::save_model_config_internal(content, create_backup).await?;
            Ok(Value::Null)
        }
        "export_model_config_content" => {
            let result = crate::domain::model_config::export_model_config_content_internal().await?;
            Ok(Value::String(result))
        }
        "export_model_config_to_path" => {
            let path = extract(payload, "path")?;
            let result = crate::domain::model_config::export_model_config_to_path_internal(path).await?;
            Ok(Value::String(result))
        }
        "import_model_config_content" => {
            let content = payload.get("content").and_then(|v| v.as_str()).ok_or("Missing content")?.to_string();
            let mode = extract_optional_string(payload, "mode");
            let result = crate::domain::model_config::import_model_config_content_internal(content, mode).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "import_model_config_from_path" => {
            let path = extract(payload, "path")?;
            let mode = extract_optional_string(payload, "mode");
            let result = crate::domain::model_config::import_model_config_from_path_internal(path, mode).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "create_model_config_backup" => {
            let note = extract_optional_string(payload, "note");
            let result = crate::domain::model_config::create_model_config_backup_internal(note)?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "list_model_config_backups" => {
            let result = crate::domain::model_config::list_model_config_backups_internal()?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "restore_model_config_backup" => {
            let id = extract(payload, "id")?;
            crate::domain::model_config::restore_model_config_backup_internal(id)?;
            Ok(Value::Null)
        }
        "delete_model_config_backup" => {
            let id = extract(payload, "id")?;
            crate::domain::model_config::delete_model_config_backup_internal(id)?;
            Ok(Value::Null)
        }
        "list_model_config_versions" => {
            let result = crate::domain::model_config::list_model_config_versions_internal().await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "test_model_http" => {
            let provider = extract(payload, "provider")?;
            let model = extract(payload, "model")?;
            let prompt = extract_optional_string(payload, "prompt");
            let timeout_ms = payload.get("timeout_ms").or_else(|| payload.get("timeoutMs")).and_then(|v| v.as_u64());
            let result = crate::domain::model_config::test_model_http_internal(provider, model, prompt, timeout_ms).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // ═══════════════════════════════════════════════════════════════
        // PSM plugin config / lifecycle
        // ═══════════════════════════════════════════════════════════════
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
        // ═══════════════════════════════════════════════════════════════
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
        // ═══════════════════════════════════════════════════════════════
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
        // ═══════════════════════════════════════════════════════════════
        "list_models" => {
            let search = extract_optional_string(payload, "search");
            let result = crate::list_models(search).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "test_model" => {
            let provider = extract(payload, "provider")?;
            let model = extract(payload, "model")?;
            let prompt = extract_optional_string(payload, "prompt");
            let result = crate::test_model(provider, model, prompt).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "test_models_batch" => {
            let models: Vec<(String, String)> = serde_json::from_value(payload.get("models").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid models: {e}"))?;
            let prompt = extract_optional_string(payload, "prompt");
            let result = crate::test_models_batch(models, prompt).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "invoke_model_text" => {
            let system_prompt = extract_optional_string(payload, "systemPrompt").or_else(|| extract_optional_string(payload, "system_prompt")).ok_or_else(|| "Missing field: systemPrompt".to_string())?;
            let prompt = extract(payload, "prompt")?;
            let provider = extract_optional_string(payload, "provider");
            let model = extract_optional_string(payload, "model");
            let reasoning = extract_optional_string(payload, "reasoning").or_else(|| extract_optional_string(payload, "thinkingLevel")).or_else(|| extract_optional_string(payload, "thinking_level"));
            let result = crate::invoke_model_text(system_prompt, prompt, provider, model, reasoning).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "invoke_model_text_stream" => {
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or_else(|| "Streaming model text requires GUI app state".to_string())?.clone();
                let request_id = extract_optional_string(payload, "requestId").or_else(|| extract_optional_string(payload, "request_id")).ok_or_else(|| "Missing field: requestId".to_string())?;
                if payload.get("protocol").and_then(Value::as_str) == Some("pi-agent") {
                    let result = crate::invoke_model_agent_stream(state, request_id, payload.clone()).await?;
                    return Ok(result);
                }
                let system_prompt = extract_optional_string(payload, "systemPrompt").or_else(|| extract_optional_string(payload, "system_prompt")).ok_or_else(|| "Missing field: systemPrompt".to_string())?;
                let prompt = extract(payload, "prompt")?;
                let provider = extract_optional_string(payload, "provider");
                let model = extract_optional_string(payload, "model");
                let reasoning = extract_optional_string(payload, "reasoning").or_else(|| extract_optional_string(payload, "thinkingLevel")).or_else(|| extract_optional_string(payload, "thinking_level"));
                let result = crate::invoke_model_text_stream(state, request_id, system_prompt, prompt, provider, model, reasoning).await?;
                Ok(to_val(result, "serialize result")?)
            }
            #[cfg(not(feature = "gui"))]
            {
                Err("Streaming model text requires GUI app state".to_string())
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // Version Check
        // ═══════════════════════════════════════════════════════════════
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
        // ═══════════════════════════════════════════════════════════════
        "get_all_tags" => {
            let result = crate::get_all_tags().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "create_tag" => {
            let name = extract(payload, "name")?;
            let color = extract(payload, "color")?;
            let icon = extract_optional_string(payload, "icon");
            let parent_id = extract_optional_string(payload, "parentId");
            let result = crate::create_tag(name, color, icon, parent_id).await?;
            Ok(to_val(result, "serialize result")?)
        }
        "update_tag" => {
            let id = extract(payload, "id")?;
            let name = extract_optional_string(payload, "name");
            let color = extract_optional_string(payload, "color");
            let icon = extract_optional_string(payload, "icon");
            let sort_order = payload.get("sortOrder").and_then(|v| v.as_i64());
            let parent_id = if payload.get("parentId").is_some() { Some(extract_optional_string(payload, "parentId")) } else { None };
            crate::update_tag(id, name, color, icon, sort_order, parent_id).await?;
            Ok(Value::Null)
        }
        "delete_tag" => {
            let id = extract(payload, "id")?;
            crate::delete_tag(id).await?;
            Ok(Value::Null)
        }
        "get_all_session_tags" => {
            let result = crate::get_all_session_tags().await?;
            Ok(to_val(result, "serialize result")?)
        }
        "assign_tag" => {
            let session_id = extract(payload, "sessionId")?;
            let tag_id = extract(payload, "tagId")?;
            crate::assign_tag(session_id, tag_id).await?;
            Ok(Value::Null)
        }
        "remove_tag_from_session" => {
            let session_id = extract(payload, "sessionId")?;
            let tag_id = extract(payload, "tagId")?;
            crate::remove_tag_from_session(session_id, tag_id).await?;
            Ok(Value::Null)
        }
        "move_session_tag" => {
            let session_id = extract(payload, "sessionId")?;
            let from_tag_id = extract_optional_string(payload, "fromTagId");
            let to_tag_id = extract(payload, "toTagId")?;
            let position = payload.get("position").and_then(|v| v.as_i64()).unwrap_or(0);
            crate::move_session_tag(session_id, from_tag_id, to_tag_id, position).await?;
            Ok(Value::Null)
        }
        "reorder_tags" => {
            let tag_ids: Vec<String> = serde_json::from_value(payload.get("tagIds").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid tagIds: {e}"))?;
            crate::reorder_tags(tag_ids).await?;
            Ok(Value::Null)
        }

        // ═══════════════════════════════════════════════════════════════
        // Auth / API keys
        // ═══════════════════════════════════════════════════════════════
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
        // ═══════════════════════════════════════════════════════════════
        "get_pi_live_sessions" => {
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let sessions = state.pi_agent_registry.list();
                Ok(to_val(sessions, "serialize pi_live_sessions")?)
            }
            #[cfg(not(feature = "gui"))]
            {
                Ok(serde_json::json!([]))
            }
        }
        "get_pi_agent_entries" => {
            let session_id = extract(payload, "sessionId")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                if let Some(session) = state.pi_agent_registry.get_live_session(&session_id) {
                    Ok(to_val(session.entries, "serialize agent_entries")?)
                } else {
                    Err(format!("Live session not found: {session_id}"))
                }
            }
            #[cfg(not(feature = "gui"))]
            {
                Err("pi_agent_get_entries unavailable in CLI mode".to_string())
            }
        }
        "pi_agent_prompt" => {
            let session_id = extract(payload, "sessionId")?;
            let message = extract(payload, "message")?;
            let images = payload.get("images").cloned();
            let streaming_behavior = payload.get("streamingBehavior").and_then(|v| v.as_str()).map(|s| s.to_string());

            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({
                    "type": "prompt",
                    "sessionId": session_id,
                    "message": message,
                    "images": images,
                    "streamingBehavior": streaming_behavior,
                });
                let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                unpack_pi_rpc_response(response)?;
            }
            Ok(serde_json::json!({ "status": "sent" }))
        }
        "pi_agent_steer" => {
            let session_id = extract(payload, "sessionId")?;
            let message = extract(payload, "message")?;
            let images = payload.get("images").cloned();
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({
                    "type": "steer",
                    "sessionId": session_id,
                    "message": message,
                    "images": images,
                });
                let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                unpack_pi_rpc_response(response)?;
            }
            Ok(serde_json::json!({ "status": "sent" }))
        }
        "pi_agent_follow_up" => {
            let session_id = extract(payload, "sessionId")?;
            let message = extract(payload, "message")?;
            let images = payload.get("images").cloned();
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({
                    "type": "follow_up",
                    "sessionId": session_id,
                    "message": message,
                    "images": images,
                });
                let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                unpack_pi_rpc_response(response)?;
            }
            Ok(serde_json::json!({ "status": "sent" }))
        }

        // ═══════════════════════════════════════════════════════════════
        // Pi agent RPC
        // ═══════════════════════════════════════════════════════════════
        "pi_agent_set_model" => {
            let session_id = extract(payload, "sessionId")?;
            let provider = extract(payload, "provider")?;
            let model_id = extract(payload, "modelId")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({
                    "type": "set_model", "sessionId": session_id, "provider": provider, "modelId": model_id,
                });
                let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                unpack_pi_rpc_response(response)?;
            }
            Ok(serde_json::json!({ "status": "sent" }))
        }
        "pi_agent_set_thinking_level" => {
            let session_id = extract(payload, "sessionId")?;
            let level = extract(payload, "level")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({
                    "type": "set_thinking_level", "sessionId": session_id, "level": level,
                });
                let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                unpack_pi_rpc_response(response)?;
            }
            Ok(serde_json::json!({ "status": "sent" }))
        }
        "pi_agent_get_state" => {
            let session_id = extract(payload, "sessionId")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({ "type": "get_state", "sessionId": session_id });
                let result = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                Ok(unpack_pi_rpc_response(result)?)
            }
            #[cfg(not(feature = "gui"))]
            {
                Ok(serde_json::json!({}))
            }
        }
        "pi_agent_get_commands" => {
            let session_id = extract(payload, "sessionId")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({ "type": "get_commands", "sessionId": session_id });
                let result = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                Ok(unpack_pi_rpc_response(result)?)
            }
            #[cfg(not(feature = "gui"))]
            {
                Ok(serde_json::json!({ "commands": [] }))
            }
        }
        "pi_agent_get_available_models" => {
            let session_id = extract(payload, "sessionId")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({ "type": "get_available_models", "sessionId": session_id });
                let result = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                Ok(unpack_pi_rpc_response(result)?)
            }
            #[cfg(not(feature = "gui"))]
            {
                Ok(serde_json::json!({ "models": [] }))
            }
        }
        "pi_agent_abort" => {
            let session_id = extract(payload, "sessionId")?;
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("App state not available")?;
                let command = serde_json::json!({ "type": "abort", "sessionId": session_id });
                let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                unpack_pi_rpc_response(response)?;
            }
            Ok(serde_json::json!({ "status": "sent" }))
        }

        // ═══════════════════════════════════════════════════════════════
        // Desktop/GUI-only commands
        // ═══════════════════════════════════════════════════════════════
        "get_default_shell" => {
            let shells = crate::utils::scan_shells();
            let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
            let default_shell = shells.first().map(|(_, p)| p.clone()).unwrap_or_else(|| fallback.to_string());
            Ok(serde_json::json!(default_shell))
        }
        "get_available_shells" => {
            let shells = crate::utils::scan_shells();
            Ok(serde_json::json!(shells))
        }
        "terminal_create" | "terminal_write" | "terminal_resize" | "terminal_close" => {
            #[cfg(feature = "gui")]
            {
                let state = app_state.as_ref().ok_or("Terminal commands require GUI mode")?;
                match command {
                    "terminal_create" => {
                        let id = extract(payload, "id")?;
                        let cwd = extract(payload, "cwd")?;
                        let shell = extract(payload, "shell")?;
                        let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
                        let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
                        let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                        manager.create_session(id, state.app_handle.clone(), state.event_tx.clone(), cwd, shell, rows, cols)?;
                        Ok(serde_json::json!("Terminal created"))
                    }
                    "terminal_write" => {
                        let id = extract(payload, "id")?;
                        let data = extract(payload, "data")?;
                        let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                        manager.write_to_session(&id, data)?;
                        Ok(Value::Null)
                    }
                    "terminal_resize" => {
                        let id = extract(payload, "id")?;
                        let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
                        let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
                        let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                        manager.resize_session(&id, rows, cols)?;
                        Ok(Value::Null)
                    }
                    "terminal_close" => {
                        let id = extract(payload, "id")?;
                        let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                        manager.close_session(&id)?;
                        Ok(Value::Null)
                    }
                    _ => unreachable!(),
                }
            }
            #[cfg(not(feature = "gui"))]
            {
                Err(format!("Command '{command}' requires GUI mode (terminal not available in CLI)"))
            }
        }
        "open_session_in_browser" => {
            #[cfg(feature = "gui")]
            {
                let path = extract(payload, "path")?;
                crate::open_session_in_browser(path).await?;
                Ok(Value::Null)
            }
            #[cfg(not(feature = "gui"))]
            {
                Err("open_session_in_browser is desktop-only".to_string())
            }
        }
        "open_session_in_terminal" => {
            #[cfg(feature = "gui")]
            {
                let path = extract(payload, "path")?;
                let cwd = extract_optional_string(payload, "cwd").unwrap_or_default();
                let terminal = extract_optional_string(payload, "terminal");
                let pi_path = extract_optional_string(payload, "piPath").or_else(|| extract_optional_string(payload, "pi_path"));
                let resume_command = extract_optional_string(payload, "resumeCommand").or_else(|| extract_optional_string(payload, "resume_command"));
                crate::open_session_in_terminal(path, cwd, terminal, pi_path, resume_command).await?;
                Ok(Value::Null)
            }
            #[cfg(not(feature = "gui"))]
            {
                Err("open_session_in_terminal is desktop-only".to_string())
            }
        }
        "list_available_terminals" => {
            let terminals = crate::domain::terminal::utils::scan_available_terminals();
            Ok(serde_json::json!(terminals))
        }
        "toggle_devtools" => Err("toggle_devtools is not supported via WebSocket".to_string()),

        _ => Err(format!("Unknown command: {command}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn cli_dispatch_supports_scan_sessions_paginated() {
        let result = dispatch(
            "scan_sessions_paginated",
            &serde_json::json!({
                "offset": 0,
                "limit": 1,
                "sortBy": "modified_desc"
            }),
        )
        .await;

        assert!(result.is_ok(), "expected CLI dispatch to support scan_sessions_paginated, got {result:?}");

        let parsed: crate::domain::session_list::PaginatedSessionsResult = serde_json::from_value(result.expect("dispatch result")).expect("valid paginated sessions result");
        assert_eq!(parsed.offset, 0);
        assert_eq!(parsed.limit, 1);
    }

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn dispatch_returns_error_for_unknown_command() {
        let result = dispatch("nonexistent_command", &serde_json::json!({})).await;
        assert!(result.is_err(), "expected error for unknown command");
        let error = result.unwrap_err();
        assert!(error.contains("Unknown command"), "error should mention unknown command, got: {error}");
    }

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn dispatch_extracts_required_string_payload() {
        // Test that missing required field returns appropriate error
        let result = dispatch("read_session_file", &serde_json::json!({})).await;
        assert!(result.is_err(), "expected error for missing required field");
        let error = result.unwrap_err();
        assert!(error.contains("Missing required field"), "error should mention missing field, got: {error}");
    }

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn dispatch_extracts_optional_string_payload() {
        // Test scan_sessions_paginated with optional fields
        let result = dispatch(
            "scan_sessions_paginated",
            &serde_json::json!({
                "offset": 0,
                "limit": 5
            }),
        )
        .await;
        assert!(result.is_ok(), "expected success with optional fields omitted, got {result:?}");
    }

    #[tokio::test]
    async fn dispatch_allows_plugin_commands_with_declared_permission() {
        let payload = serde_json::json!({
            "__psm": {
                "pluginId": "builtin.session-summary",
                "permissions": ["sessions:read"]
            }
        });
        let result = enforce_plugin_permission("scan_sessions_paginated", &payload);

        assert!(result.is_ok(), "expected permissioned plugin scan to pass permission checks, got {result:?}");
    }

    #[tokio::test]
    async fn dispatch_allows_plugin_json_config_with_declared_permission() {
        let payload = serde_json::json!({
            "__psm": {
                "pluginId": "builtin.config-test",
                "permissions": ["config:read"]
            }
        });
        let result = enforce_plugin_permission("read_psm_plugin_json_config", &payload);

        assert!(result.is_ok(), "expected plugin config read to pass permission checks, got {result:?}");
    }

    #[tokio::test]
    async fn dispatch_allows_plugin_agent_commands_with_declared_permission() {
        let payload = serde_json::json!({
            "__psm": {
                "pluginId": "builtin.agent-search",
                "permissions": ["agent:invoke"]
            }
        });
        let result = enforce_plugin_permission("plugin_agent_create_session", &payload);

        assert!(result.is_ok(), "expected plugin agent command to pass permission checks, got {result:?}");
    }

    #[tokio::test]
    async fn dispatch_rejects_plugin_agent_commands_without_required_permission() {
        let payload = serde_json::json!({
            "__psm": {
                "pluginId": "builtin.agent-search",
                "permissions": ["model:invoke"]
            }
        });
        let result = enforce_plugin_permission("plugin_agent_create_session", &payload);

        assert!(result.is_err(), "expected agent permission denial");
        let error = result.unwrap_err();
        assert!(error.contains("Plugin permission denied"), "error should mention permission denial, got: {error}");
        assert!(error.contains("plugin_agent_create_session"), "error should mention denied command, got: {error}");
    }

    #[tokio::test]
    async fn dispatch_rejects_plugin_commands_without_required_permission() {
        let result = dispatch(
            "scan_sessions_paginated",
            &serde_json::json!({
                "offset": 0,
                "limit": 1,
                "sortBy": "modified_desc",
                "__psm": {
                    "pluginId": "builtin.session-summary",
                    "permissions": ["records:read"]
                }
            }),
        )
        .await;

        assert!(result.is_err(), "expected permission denial");
        let error = result.unwrap_err();
        assert!(error.contains("Plugin permission denied"), "error should mention permission denial, got: {error}");
        assert!(error.contains("scan_sessions_paginated"), "error should mention denied command, got: {error}");
    }

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn dispatch_handles_session_digest_command() {
        let result = dispatch("session_digest", &serde_json::json!({})).await;
        assert!(result.is_ok(), "expected success for session_digest, got {result:?}");
        let value = result.unwrap();
        assert!(value.get("version").is_some(), "response should have version field");
        assert!(value.get("count").is_some(), "response should have count field");
    }

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn dispatch_handles_list_supported_session_providers() {
        let result = dispatch("list_supported_session_providers", &serde_json::json!({})).await;
        assert!(result.is_ok(), "expected success for list_supported_session_providers, got {result:?}");
    }

    #[cfg(not(feature = "gui"))]
    #[tokio::test]
    async fn dispatch_rejects_empty_command() {
        let result = dispatch("", &serde_json::json!({})).await;
        assert!(result.is_err(), "expected error for empty command");
    }

    #[test]
    fn to_val_serializes_valid_data() {
        let data = serde_json::json!({"key": "value"});
        let result = to_val(data.clone(), "test");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), data);
    }

    #[test]
    fn to_val_returns_error_for_invalid_data() {
        // Create a value that can't be serialized (this is tricky, but we can test the error path)
        let result = to_val("valid", "test context");
        assert!(result.is_ok());
    }

    #[test]
    fn unpack_pi_rpc_response_extracts_data() {
        let response = serde_json::json!({
            "success": true,
            "data": {"key": "value"}
        });
        let result = unpack_pi_rpc_response(response);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), serde_json::json!({"key": "value"}));
    }

    #[test]
    fn unpack_pi_rpc_response_handles_error() {
        let response = serde_json::json!({
            "success": false,
            "error": "Something went wrong"
        });
        let result = unpack_pi_rpc_response(response);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Something went wrong");
    }

    #[test]
    fn unpack_pi_rpc_response_handles_missing_data() {
        let response = serde_json::json!({
            "success": true
        });
        let result = unpack_pi_rpc_response(response);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), serde_json::Value::Null);
    }

    #[test]
    fn unpack_pi_rpc_response_handles_generic_error() {
        let response = serde_json::json!({
            "success": false
        });
        let result = unpack_pi_rpc_response(response);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Pi RPC command failed");
    }
}
