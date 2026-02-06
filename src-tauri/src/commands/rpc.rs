//! RPC Tauri Commands - Thin wrappers around service layer

use crate::pi_rpc::{
    ProjectInfo, RPCMessage, RPCModel, RPCSessionState, RPCSessionStats, SharedRPCClient,
    SharedRPCPool, SlashCommandInfo, ThinkingLevel,
};
use crate::services::rpc_service::{self, RPCConnectionStatus};
use tauri::{AppHandle, State};

/// Detect Pi CLI RPC support
#[tauri::command]
pub async fn detect_pi_rpc_support(pi_path: Option<String>) -> Result<bool, String> {
    rpc_service::detect_pi_rpc_support_impl(pi_path).await
}

/// Start RPC connection
#[tauri::command]
pub async fn start_pi_rpc(
    app_handle: AppHandle,
    rpc_client: State<'_, SharedRPCClient>,
    pi_path: Option<String>,
) -> Result<RPCConnectionStatus, String> {
    rpc_service::start_pi_rpc_impl(app_handle, rpc_client.inner().clone(), pi_path, None, None)
        .await
}

/// Stop RPC connection
#[tauri::command]
pub async fn stop_pi_rpc(rpc_client: State<'_, SharedRPCClient>) -> Result<(), String> {
    rpc_service::stop_pi_rpc_impl(rpc_client.inner()).await
}

/// Restart RPC connection
#[tauri::command]
pub async fn restart_pi_rpc(
    app_handle: AppHandle,
    rpc_client: State<'_, SharedRPCClient>,
    pi_path: Option<String>,
) -> Result<RPCConnectionStatus, String> {
    rpc_service::restart_pi_rpc_impl(app_handle, rpc_client.inner().clone(), pi_path, None, None)
        .await
}

/// Get RPC connection status
#[tauri::command]
pub async fn get_rpc_status(
    rpc_client: State<'_, SharedRPCClient>,
) -> Result<RPCConnectionStatus, String> {
    rpc_service::get_rpc_status_impl(rpc_client.inner()).await
}

/// Send prompt command
#[tauri::command]
pub async fn send_prompt(
    rpc_client: State<'_, SharedRPCClient>,
    message: String,
) -> Result<(), String> {
    rpc_service::send_prompt_impl(rpc_client.inner(), message).await
}

/// Send follow-up message
#[tauri::command]
pub async fn send_follow_up(
    rpc_client: State<'_, SharedRPCClient>,
    message: String,
) -> Result<(), String> {
    rpc_service::send_follow_up_impl(rpc_client.inner(), message).await
}

/// Send steer command
#[tauri::command]
pub async fn send_steer(
    rpc_client: State<'_, SharedRPCClient>,
    message: String,
) -> Result<(), String> {
    rpc_service::send_steer_impl(rpc_client.inner(), message).await
}

/// Cycle RPC model
#[tauri::command]
pub async fn cycle_rpc_model(rpc_client: State<'_, SharedRPCClient>) -> Result<(), String> {
    rpc_service::cycle_rpc_model_impl(rpc_client.inner()).await
}

/// Set thinking level
#[tauri::command]
pub async fn set_rpc_thinking_level(
    rpc_client: State<'_, SharedRPCClient>,
    level: ThinkingLevel,
) -> Result<(), String> {
    rpc_service::set_rpc_thinking_level_impl(rpc_client.inner(), level).await
}

/// Cycle thinking level
#[tauri::command]
pub async fn cycle_rpc_thinking_level(
    rpc_client: State<'_, SharedRPCClient>,
) -> Result<(), String> {
    rpc_service::cycle_rpc_thinking_level_impl(rpc_client.inner()).await
}

/// Compact RPC session
#[tauri::command]
pub async fn compact_rpc_session(
    rpc_client: State<'_, SharedRPCClient>,
    custom_instructions: Option<String>,
) -> Result<(), String> {
    rpc_service::compact_rpc_session_impl(rpc_client.inner(), custom_instructions).await
}

/// Set auto compaction
#[tauri::command]
pub async fn set_rpc_auto_compaction(
    rpc_client: State<'_, SharedRPCClient>,
    enabled: bool,
) -> Result<(), String> {
    rpc_service::set_rpc_auto_compaction_impl(rpc_client.inner(), enabled).await
}

/// Execute Bash command
#[tauri::command]
pub async fn send_rpc_bash(
    rpc_client: State<'_, SharedRPCClient>,
    command: String,
) -> Result<(), String> {
    rpc_service::send_rpc_bash_impl(rpc_client.inner(), command).await
}

/// Abort Bash command
#[tauri::command]
pub async fn abort_rpc_bash(rpc_client: State<'_, SharedRPCClient>) -> Result<(), String> {
    rpc_service::abort_rpc_bash_impl(rpc_client.inner()).await
}

/// Send abort command
#[tauri::command]
pub async fn send_abort(rpc_client: State<'_, SharedRPCClient>) -> Result<(), String> {
    rpc_service::send_abort_impl(rpc_client.inner()).await
}

/// Switch session
#[tauri::command]
pub async fn switch_session_rpc(
    app_handle: AppHandle,
    rpc_client: State<'_, SharedRPCClient>,
    session_path: String,
) -> Result<(), String> {
    rpc_service::switch_session_rpc_impl(app_handle, rpc_client.inner().clone(), session_path).await
}

/// Get messages
#[tauri::command]
pub async fn get_rpc_messages(
    rpc_client: State<'_, SharedRPCClient>,
    expected_session_path: Option<String>,
) -> Result<Vec<RPCMessage>, String> {
    rpc_service::get_rpc_messages_impl(rpc_client.inner(), expected_session_path).await
}

/// Get cached messages
#[tauri::command]
pub async fn get_rpc_cached_messages(
    rpc_client: State<'_, SharedRPCClient>,
    expected_session_path: Option<String>,
) -> Result<Vec<RPCMessage>, String> {
    rpc_service::get_rpc_cached_messages_impl(rpc_client.inner(), expected_session_path).await
}

/// Sync RPC session cache
#[tauri::command]
pub async fn sync_rpc_session_cache(rpc_client: State<'_, SharedRPCClient>) -> Result<(), String> {
    rpc_service::sync_rpc_session_cache_impl(rpc_client.inner()).await
}

/// Get current state
#[tauri::command]
pub async fn get_rpc_state(
    rpc_client: State<'_, SharedRPCClient>,
) -> Result<RPCSessionState, String> {
    rpc_service::get_rpc_state_impl(rpc_client.inner()).await
}

/// Get available models
#[tauri::command]
pub async fn get_rpc_available_models(
    rpc_client: State<'_, SharedRPCClient>,
) -> Result<Vec<RPCModel>, String> {
    rpc_service::get_rpc_available_models_impl(rpc_client.inner()).await
}

/// Get session stats
#[tauri::command]
pub async fn get_rpc_session_stats(
    rpc_client: State<'_, SharedRPCClient>,
) -> Result<RPCSessionStats, String> {
    rpc_service::get_rpc_session_stats_impl(rpc_client.inner()).await
}

/// Get available commands
#[tauri::command]
pub async fn get_rpc_commands(
    rpc_client: State<'_, SharedRPCClient>,
) -> Result<Vec<SlashCommandInfo>, String> {
    rpc_service::get_rpc_commands_impl(rpc_client.inner()).await
}

/// Set model
#[tauri::command]
pub async fn set_rpc_model(
    rpc_client: State<'_, SharedRPCClient>,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    rpc_service::set_rpc_model_impl(rpc_client.inner(), provider, model_id).await
}

/// Create new session
#[tauri::command]
pub async fn new_rpc_session(
    rpc_client: State<'_, SharedRPCClient>,
    parent_session: Option<String>,
) -> Result<Option<String>, String> {
    rpc_service::new_rpc_session_impl(rpc_client.inner(), parent_session).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn normalize_rpc_message_value(value: &serde_json::Value, index: usize) -> serde_json::Value {
        let mut obj = match value.as_object() {
            Some(map) => map.clone(),
            None => return value.clone(),
        };

        if let Some(role) = obj.get("role").and_then(|v| v.as_str()) {
            match role {
                "toolResult" | "tool_result" => {
                    obj.insert(
                        "role".to_string(),
                        serde_json::Value::String("tool".to_string()),
                    );
                    if !obj.contains_key("id") {
                        if let Some(tool_call_id) = obj.get("toolCallId").and_then(|v| v.as_str()) {
                            obj.insert(
                                "id".to_string(),
                                serde_json::Value::String(tool_call_id.to_string()),
                            );
                        }
                    }
                }
                "user" | "assistant" | "tool" => {}
                _ => {
                    obj.insert(
                        "role".to_string(),
                        serde_json::Value::String("assistant".to_string()),
                    );
                }
            }
        }

        let missing_id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().is_empty())
            .unwrap_or(true);
        if missing_id {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            value.to_string().hash(&mut hasher);
            index.hash(&mut hasher);
            let synthetic = format!("rpc-msg-{:x}", hasher.finish());
            obj.insert("id".to_string(), serde_json::Value::String(synthetic));
        }

        if !obj.contains_key("role") {
            obj.insert(
                "role".to_string(),
                serde_json::Value::String("assistant".to_string()),
            );
        }

        serde_json::Value::Object(obj)
    }

    fn normalize_session_path(path: &str) -> String {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        if trimmed.starts_with("draft://") {
            return trimmed.to_string();
        }
        let mut normalized = trimmed.replace('\\', "/");
        if normalized.to_ascii_lowercase().starts_with("file://") {
            normalized = normalized[7..].to_string();
        }
        while normalized.len() > 1 && normalized.ends_with('/') {
            normalized.pop();
        }
        normalized
    }

    fn is_absolute_path(path: &str) -> bool {
        if path.starts_with('/') || path.starts_with("//") {
            return true;
        }
        let bytes = path.as_bytes();
        bytes.len() >= 3 && bytes[1] == b':' && bytes[2] == b'/' && bytes[0].is_ascii_alphabetic()
    }

    fn is_windows_like_path(path: &str) -> bool {
        path.starts_with("//") || {
            let bytes = path.as_bytes();
            bytes.len() >= 3
                && bytes[1] == b':'
                && bytes[2] == b'/'
                && bytes[0].is_ascii_alphabetic()
        }
    }

    fn session_path_matches(expected: &str, actual: &str) -> bool {
        let expected_normalized = normalize_session_path(expected);
        let actual_normalized = normalize_session_path(actual);

        if expected_normalized.is_empty() || actual_normalized.is_empty() {
            return false;
        }
        if expected_normalized == actual_normalized {
            return true;
        }
        if (is_windows_like_path(&expected_normalized) || is_windows_like_path(&actual_normalized))
            && expected_normalized.eq_ignore_ascii_case(&actual_normalized)
        {
            return true;
        }
        if is_absolute_path(&expected_normalized) && is_absolute_path(&actual_normalized) {
            return false;
        }
        let expected_name = std::path::Path::new(&expected_normalized)
            .file_name()
            .and_then(|s| s.to_str());
        let actual_name = std::path::Path::new(&actual_normalized)
            .file_name()
            .and_then(|s| s.to_str());
        match (expected_name, actual_name) {
            (Some(a), Some(b))
                if a == b
                    && (!expected_normalized.contains('/') || !actual_normalized.contains('/')) =>
            {
                true
            }
            _ => false,
        }
    }

    #[test]
    fn normalize_tool_result_role_to_tool() {
        let value = json!({
            "role": "toolResult",
            "toolCallId": "tool-1",
            "toolName": "write",
            "content": [{"type":"text","text":"ok"}]
        });
        let normalized = normalize_rpc_message_value(&value, 0);
        assert_eq!(
            normalized.get("role").and_then(|v| v.as_str()),
            Some("tool")
        );
        assert_eq!(
            normalized.get("id").and_then(|v| v.as_str()),
            Some("tool-1")
        );
    }

    #[test]
    fn session_path_does_not_match_different_absolute_paths() {
        let a = "/tmp/a/2026-01-01_xxx.jsonl";
        let b = "/tmp/b/2026-01-01_xxx.jsonl";
        assert!(!session_path_matches(a, b));
    }

    #[test]
    fn session_path_matches_short_name_fallback() {
        let full = "/tmp/a/2026-01-01_xxx.jsonl";
        let short = "2026-01-01_xxx.jsonl";
        assert!(session_path_matches(full, short));
    }

    #[test]
    fn session_path_matches_windows_case_insensitive() {
        let a = "C:/Users/Dev/Sessions/ABC.JSONL";
        let b = "c:/users/dev/sessions/abc.jsonl";
        assert!(session_path_matches(a, b));
    }

    #[test]
    fn normalize_unknown_role_to_assistant() {
        let value = json!({
            "id": "m-1",
            "role": "system",
            "content": [{"type":"text","text":"meta"}]
        });
        let normalized = normalize_rpc_message_value(&value, 0);
        assert_eq!(
            normalized.get("role").and_then(|v| v.as_str()),
            Some("assistant")
        );
    }

    #[test]
    fn normalize_missing_id_generates_stable_id() {
        let value = json!({
            "role": "assistant",
            "content": [{"type":"text","text":"hello"}]
        });
        let normalized = normalize_rpc_message_value(&value, 7);
        let id = normalized.get("id").and_then(|v| v.as_str()).unwrap_or("");
        assert!(id.starts_with("rpc-msg-"));
        assert_eq!(
            normalized.get("role").and_then(|v| v.as_str()),
            Some("assistant")
        );
    }
}
