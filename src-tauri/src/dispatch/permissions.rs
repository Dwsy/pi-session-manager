//! Plugin command permission parsing and enforcement.

use serde_json::Value;
use std::collections::HashSet;

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
    UsageRead,
    TerminalRead,
}

#[derive(Debug, Clone, Default)]
struct PluginPermissionContext {
    plugin_id: Option<String>,
    permissions: HashSet<PluginPermission>,
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
        "usage:read" => Some(PluginPermission::UsageRead),
        "terminal:read" => Some(PluginPermission::TerminalRead),
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
        "get_agent_usage_status" => &[PluginPermission::UsageRead],
        "plugin_terminal_history_list" | "plugin_terminal_history_read" => &[PluginPermission::TerminalRead],
        _ => &[],
    }
}

pub(super) fn enforce_plugin_permission(command: &str, payload: &Value) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn terminal_history_requires_terminal_read_for_plugins() {
        let denied = json!({
            "__psm": {
                "pluginId": "example.terminal-history",
                "permissions": ["sessions:read"]
            }
        });
        assert!(enforce_plugin_permission("plugin_terminal_history_list", &denied).is_err());
        assert!(enforce_plugin_permission("plugin_terminal_history_read", &denied).is_err());

        let allowed = json!({
            "__psm": {
                "pluginId": "example.terminal-history",
                "permissions": ["terminal:read"]
            }
        });
        assert!(enforce_plugin_permission("plugin_terminal_history_list", &allowed).is_ok());
        assert!(enforce_plugin_permission("plugin_terminal_history_read", &allowed).is_ok());
    }
}
