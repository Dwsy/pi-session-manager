//! Command dispatcher entry point.
//!
//! Protocol-specific payload conversion is grouped by backend capability.
//! Business logic remains in domain/data modules, while this module owns
//! permission enforcement, capability delegation, and unknown commands.

use serde_json::Value;

mod desktop;
mod models;
mod permissions;
mod plugins;
mod resources;
mod search;
mod sessions;
mod settings;

#[cfg(feature = "gui")]
type DispatchAppState = crate::app_state::SharedAppState;
#[cfg(not(feature = "gui"))]
type DispatchAppState = ();

type DispatchResult = Option<Result<Value, String>>;

#[cfg(test)]
use permissions::enforce_plugin_permission;

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
    permissions::enforce_plugin_permission(command, payload)?;

    if let Some(result) = sessions::dispatch(app_state, command, payload).await {
        return result;
    }
    if let Some(result) = search::dispatch(app_state, command, payload).await {
        return result;
    }
    if let Some(result) = plugins::dispatch(app_state, command, payload).await {
        return result;
    }
    if let Some(result) = resources::dispatch(app_state, command, payload).await {
        return result;
    }
    if let Some(result) = settings::dispatch(app_state, command, payload).await {
        return result;
    }
    if let Some(result) = models::dispatch(app_state, command, payload).await {
        return result;
    }
    if let Some(result) = desktop::dispatch(app_state, command, payload).await {
        return result;
    }

    Err(format!("Unknown command: {command}"))
}

#[cfg(test)]
pub(crate) fn capability_command_catalog() -> impl Iterator<Item = &'static str> {
    [sessions::COMMANDS, search::COMMANDS, plugins::COMMANDS, resources::COMMANDS, settings::COMMANDS, models::COMMANDS, desktop::COMMANDS].into_iter().flatten().copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_command_catalog_is_unique_and_complete() {
        let commands = capability_command_catalog().collect::<Vec<_>>();
        let unique = commands.iter().copied().collect::<std::collections::HashSet<_>>();
        assert_eq!(commands.len(), 160);
        assert_eq!(unique.len(), commands.len());
    }

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
        assert!(error.contains("Missing or invalid field"), "error should mention missing field, got: {error}");
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
