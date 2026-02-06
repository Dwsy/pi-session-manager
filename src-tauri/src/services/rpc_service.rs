//! RPC Service - Core business logic for Pi RPC operations
//!
//! This module contains pure functions that receive explicit state parameters,
//! allowing them to be called from both Tauri commands and WebSocket adapter.

use crate::pi_rpc::{
    detect_rpc_support, find_pi_path, PiRPCClient, ProjectInfo, RPCCommand, RPCEvent, RPCMessage,
    RPCModel, RPCPhase, RPCSessionState, RPCSessionStats, SharedRPCClient, SharedRPCPool,
    SlashCommandInfo, ThinkingLevel,
};
use crate::{scanner, sqlite_cache};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter};

/// RPC connection status
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RPCConnectionStatus {
    pub connected: bool,
    pub phase: String,
    pub session_file: Option<String>,
    pub last_error: Option<String>,
}

fn parse_response_data<T>(data: Option<Value>, context: &str) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
{
    let data = data.ok_or_else(|| format!("No data in RPC response: {}", context))?;
    serde_json::from_value(data).map_err(|e| format!("Failed to parse {}: {}", context, e))
}

fn parse_array_field<T>(data: Option<Value>, field: &str) -> Result<Vec<T>, String>
where
    T: serde::de::DeserializeOwned,
{
    let data = data.ok_or_else(|| format!("No data in RPC response: {}", field))?;
    let array = data
        .get(field)
        .and_then(|v| v.as_array())
        .ok_or_else(|| format!("Missing '{}' in RPC response", field))?;
    serde_json::from_value(Value::Array(array.clone()))
        .map_err(|e| format!("Failed to parse {}: {}", field, e))
}

fn normalize_rpc_message_value(value: &Value, index: usize) -> Value {
    let mut obj = match value.as_object() {
        Some(map) => map.clone(),
        None => return value.clone(),
    };

    if let Some(role) = obj.get("role").and_then(|v| v.as_str()) {
        match role {
            "toolResult" | "tool_result" => {
                obj.insert("role".to_string(), Value::String("tool".to_string()));
                if !obj.contains_key("id") {
                    if let Some(tool_call_id) = obj.get("toolCallId").and_then(|v| v.as_str()) {
                        obj.insert("id".to_string(), Value::String(tool_call_id.to_string()));
                    }
                }
            }
            "user" | "assistant" | "tool" => {}
            _ => {
                obj.insert("role".to_string(), Value::String("assistant".to_string()));
            }
        }
    }

    let missing_id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true);
    if missing_id {
        let mut hasher = DefaultHasher::new();
        value.to_string().hash(&mut hasher);
        index.hash(&mut hasher);
        let synthetic = format!("rpc-msg-{:x}", hasher.finish());
        obj.insert("id".to_string(), Value::String(synthetic));
    }

    if !obj.contains_key("role") {
        obj.insert("role".to_string(), Value::String("assistant".to_string()));
    }

    Value::Object(obj)
}

fn parse_rpc_messages(values: &[Value]) -> Result<Vec<RPCMessage>, String> {
    let mut parsed: Vec<RPCMessage> = Vec::new();

    for (index, value) in values.iter().enumerate() {
        let normalized = normalize_rpc_message_value(value, index);
        match serde_json::from_value::<RPCMessage>(normalized) {
            Ok(message) => parsed.push(message),
            Err(err) => {
                log::warn!(
                    "[RPC-TRACE] skip invalid message at index={} error={} raw={}",
                    index,
                    err,
                    value
                );
            }
        }
    }

    if parsed.is_empty() && !values.is_empty() {
        return Err("Failed to parse messages: all message items invalid".to_string());
    }

    Ok(parsed)
}

fn normalize_session_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // Keep draft URI untouched to avoid changing protocol semantics.
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
    if path.starts_with('/') {
        return true;
    }
    if path.starts_with("//") {
        return true;
    }
    let bytes = path.as_bytes();
    bytes.len() >= 3 && bytes[1] == b':' && bytes[2] == b'/' && bytes[0].is_ascii_alphabetic()
}

fn is_windows_like_path(path: &str) -> bool {
    path.starts_with("//") || {
        let bytes = path.as_bytes();
        bytes.len() >= 3 && bytes[1] == b':' && bytes[2] == b'/' && bytes[0].is_ascii_alphabetic()
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

    // Absolute paths must match as full paths. This prevents collisions when
    // different projects contain same-named session files.
    if is_absolute_path(&expected_normalized) && is_absolute_path(&actual_normalized) {
        return false;
    }

    // Compatibility fallback for runtimes that may return only short file names.
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

fn is_rpc_transport_error(err: &str) -> bool {
    err.contains("Broken pipe")
        || err.contains("Failed to write to stdin")
        || err.contains("Response channel closed")
        || err.contains("Timeout waiting for response")
}

async fn refresh_session_file_from_state(client: &mut PiRPCClient) -> Option<String> {
    match client
        .send_command_with_response(RPCCommand::GetState, 4)
        .await
    {
        Ok(response) => {
            if let Ok(state) = parse_response_data::<RPCSessionState>(response.data, "get_state") {
                if let Some(session_file) = state.session_file {
                    client.set_session_file(session_file.clone()).await;
                    return Some(session_file);
                }
            }
            client.get_session_file().await
        }
        Err(err) => {
            log::debug!(
                "[RPC-TRACE] refresh_session_file_from_state failed: {}",
                err
            );
            client.get_session_file().await
        }
    }
}

async fn switch_session_on_client(
    client: &mut PiRPCClient,
    session_path: &str,
    _timeout: Duration,
) -> Result<(), String> {
    if let Some(current) = client.get_session_file().await {
        if session_path_matches(session_path, &current) {
            log::info!("[RPC-TRACE] switch_session: already on target session");
            return Ok(());
        }
    }

    log::info!(
        "[RPC-TRACE] switch_session: sending command for {}",
        session_path
    );
    client
        .send_command(RPCCommand::SwitchSession {
            session_path: session_path.to_string(),
        })
        .await
        .map_err(|e| format!("Failed to send switch_session command: {}", e))?;

    // Update local cache immediately — don't poll get_state.
    // Polling caused 4s timeouts and infinite restart loops when Pi CLI
    // reports a different path format in get_state.
    client.set_session_file(session_path.to_string()).await;
    log::info!("[RPC-TRACE] switch_session: command sent, cache updated");
    Ok(())
}

/// Sync RPC session cache to SQLite
pub async fn sync_rpc_session_cache_impl(rpc_client: &SharedRPCClient) -> Result<(), String> {
    let session_file = {
        let client_guard = rpc_client.lock().await;
        let client = client_guard.as_ref().ok_or("RPC client not connected")?;
        client
            .get_session_file()
            .await
            .ok_or("RPC session file not available")?
    };

    let path = std::path::Path::new(&session_file);
    let session_info = scanner::parse_session_info(path)?;

    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Failed to read session file metadata: {}", e))?;
    let file_modified = metadata.modified().unwrap_or(SystemTime::now());
    let file_modified: DateTime<Utc> = file_modified.into();

    let conn = sqlite_cache::init_db()?;
    sqlite_cache::upsert_session(&conn, &session_info, file_modified)?;

    Ok(())
}

/// Detect Pi CLI RPC support
pub async fn detect_pi_rpc_support_impl(pi_path: Option<String>) -> Result<bool, String> {
    let pi_path = match pi_path {
        Some(path) => path,
        None => find_pi_path()
            .await
            .ok_or("Pi CLI not found. Please install Pi or provide the path.")?,
    };

    log::info!("[RPC-TRACE] detect support pi_path={}", pi_path);
    let result = detect_rpc_support(&pi_path).await;
    log::info!(
        "[RPC-TRACE] detect support result supported={} error={:?}",
        result.supported,
        result.error
    );
    Ok(result.supported)
}

/// Start RPC connection (internal implementation)
pub async fn start_pi_rpc_impl(
    app_handle: AppHandle,
    rpc_client: SharedRPCClient,
    pi_path: Option<String>,
    session_path: Option<String>,
    working_dir: Option<String>,
) -> Result<RPCConnectionStatus, String> {
    log::info!("Starting Pi RPC connection");

    {
        let client_guard = rpc_client.lock().await;
        if client_guard.is_some() {
            let state = client_guard.as_ref().unwrap().get_state().await;
            return Ok(RPCConnectionStatus {
                connected: state.is_connected,
                phase: format!("{:?}", state.phase).to_lowercase(),
                session_file: state.session_file,
                last_error: state.last_error,
            });
        }
    }

    let pi_path = match pi_path {
        Some(path) => path,
        None => find_pi_path()
            .await
            .ok_or("Pi CLI not found. Please install Pi or provide the path.")?,
    };

    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<RPCEvent>(100);

    let client = PiRPCClient::new(&pi_path, event_tx, session_path.clone(), working_dir)
        .await
        .map_err(|e| format!("Failed to create RPC client: {}", e))?;

    let exit_rx = client.subscribe_exit();
    {
        let mut client_guard = rpc_client.lock().await;
        *client_guard = Some(client);
    }

    let app_handle_clone = app_handle.clone();
    let rpc_client_clone = rpc_client.clone();
    let (sync_tx, mut sync_rx) = tokio::sync::mpsc::channel::<()>(20);
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            if matches!(
                event.r#type.as_str(),
                "message_update" | "agent_end" | "tool_execution_end"
            ) {
                let _ = sync_tx.send(()).await;
            }
            if let Err(e) = app_handle_clone.emit("pi-rpc-event", &event) {
                log::error!("Failed to emit RPC event: {}", e);
                break;
            }
        }
        log::info!("RPC event forwarding stopped");
    });

    tokio::spawn(async move {
        loop {
            if sync_rx.recv().await.is_none() {
                break;
            }

            loop {
                match tokio::time::timeout(Duration::from_millis(800), sync_rx.recv()).await {
                    Ok(Some(_)) => continue,
                    Ok(None) => return,
                    Err(_) => break,
                }
            }

            if let Err(err) = sync_rpc_session_cache_impl(&rpc_client_clone).await {
                log::debug!("RPC cache sync skipped: {}", err);
            }
        }
    });

    let app_handle_exit = app_handle.clone();
    tokio::spawn(async move {
        let mut rx = exit_rx;
        if rx.changed().await.is_err() {
            return;
        }
        if *rx.borrow() {
            let _ = app_handle_exit.emit("pi-rpc-exited", ());
        }
    });

    let mut client = {
        let mut client_guard = rpc_client.lock().await;
        client_guard.take().unwrap()
    };

    let response = client
        .send_command_with_response(RPCCommand::GetState, 10)
        .await
        .map_err(|e| format!("Failed to get state: {}", e))?;
    let mut fallback_session_path = session_path.clone();
    if let Ok(session_state) =
        parse_response_data::<RPCSessionState>(response.data.clone(), "get_state")
    {
        if let Some(session_file) = session_state.session_file {
            client.set_session_file(session_file).await;
            fallback_session_path = None;
        }
    }
    if let Some(session_file) = fallback_session_path {
        client.set_session_file(session_file).await;
    }
    let state = client.get_state().await;

    {
        let mut client_guard = rpc_client.lock().await;
        *client_guard = Some(client);
    }

    log::info!("Pi RPC connection started successfully");

    Ok(RPCConnectionStatus {
        connected: state.is_connected,
        phase: format!("{:?}", state.phase).to_lowercase(),
        session_file: state.session_file,
        last_error: state.last_error,
    })
}

/// Stop RPC connection
pub async fn stop_pi_rpc_impl(rpc_client: &SharedRPCClient) -> Result<(), String> {
    log::info!("Stopping Pi RPC connection");

    let mut client_guard = rpc_client.lock().await;
    if let Some(mut client) = client_guard.take() {
        client
            .shutdown()
            .await
            .map_err(|e| format!("Failed to shutdown RPC client: {}", e))?;
    }

    log::info!("Pi RPC connection stopped");
    Ok(())
}

/// Restart RPC connection (internal implementation)
pub async fn restart_pi_rpc_impl(
    app_handle: AppHandle,
    rpc_client: SharedRPCClient,
    pi_path: Option<String>,
    session_path: Option<String>,
    working_dir: Option<String>,
) -> Result<RPCConnectionStatus, String> {
    let mut existing_client = {
        let mut client_guard = rpc_client.lock().await;
        client_guard.take()
    };

    if let Some(mut client) = existing_client.take() {
        client
            .shutdown()
            .await
            .map_err(|e| format!("Failed to shutdown RPC client: {}", e))?;
    }

    let resolved_path = if let Some(path) = pi_path {
        path
    } else {
        let client_guard = rpc_client.lock().await;
        if let Some(client) = client_guard.as_ref() {
            client.get_pi_path().to_string()
        } else {
            find_pi_path()
                .await
                .ok_or("Pi CLI not found. Please install Pi or provide the path.")?
        }
    };

    start_pi_rpc_impl(
        app_handle,
        rpc_client,
        Some(resolved_path),
        session_path,
        working_dir,
    )
    .await
}

/// Get RPC connection status
pub async fn get_rpc_status_impl(
    rpc_client: &SharedRPCClient,
) -> Result<RPCConnectionStatus, String> {
    let client_guard = rpc_client.lock().await;

    if let Some(client) = client_guard.as_ref() {
        let state = client.get_state().await;
        Ok(RPCConnectionStatus {
            connected: state.is_connected,
            phase: format!("{:?}", state.phase).to_lowercase(),
            session_file: state.session_file,
            last_error: state.last_error,
        })
    } else {
        Ok(RPCConnectionStatus {
            connected: false,
            phase: "disconnected".to_string(),
            session_file: None,
            last_error: None,
        })
    }
}

/// Send prompt command
pub async fn send_prompt_impl(rpc_client: &SharedRPCClient, message: String) -> Result<(), String> {
    log::info!("[RPC-TRACE] service send_prompt len={}", message.len());
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::Prompt {
            message,
            images: None,
            streaming_behavior: None,
        })
        .await
        .map_err(|e| format!("Failed to send prompt: {}", e))?;

    Ok(())
}

/// Send follow-up message
pub async fn send_follow_up_impl(
    rpc_client: &SharedRPCClient,
    message: String,
) -> Result<(), String> {
    log::info!("[RPC-TRACE] service send_follow_up len={}", message.len());
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::FollowUp { message })
        .await
        .map_err(|e| format!("Failed to send follow-up: {}", e))?;

    Ok(())
}

/// Send steer command
pub async fn send_steer_impl(rpc_client: &SharedRPCClient, message: String) -> Result<(), String> {
    log::info!("[RPC-TRACE] service send_steer len={}", message.len());
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::Steer { message })
        .await
        .map_err(|e| format!("Failed to send steer: {}", e))?;

    Ok(())
}

/// Cycle RPC model
pub async fn cycle_rpc_model_impl(rpc_client: &SharedRPCClient) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::CycleModel)
        .await
        .map_err(|e| format!("Failed to cycle model: {}", e))?;

    Ok(())
}

/// Set thinking level
pub async fn set_rpc_thinking_level_impl(
    rpc_client: &SharedRPCClient,
    level: ThinkingLevel,
) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::SetThinkingLevel { level })
        .await
        .map_err(|e| format!("Failed to set thinking level: {}", e))?;

    Ok(())
}

/// Cycle thinking level
pub async fn cycle_rpc_thinking_level_impl(rpc_client: &SharedRPCClient) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::CycleThinkingLevel)
        .await
        .map_err(|e| format!("Failed to cycle thinking level: {}", e))?;

    Ok(())
}

/// Compact RPC session
pub async fn compact_rpc_session_impl(
    rpc_client: &SharedRPCClient,
    custom_instructions: Option<String>,
) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::Compact {
            custom_instructions,
        })
        .await
        .map_err(|e| format!("Failed to compact session: {}", e))?;

    Ok(())
}

/// Set auto compaction
pub async fn set_rpc_auto_compaction_impl(
    rpc_client: &SharedRPCClient,
    enabled: bool,
) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::SetAutoCompaction { enabled })
        .await
        .map_err(|e| format!("Failed to set auto compaction: {}", e))?;

    Ok(())
}

/// Send RPC bash command
pub async fn send_rpc_bash_impl(
    rpc_client: &SharedRPCClient,
    command: String,
) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::Bash { command })
        .await
        .map_err(|e| format!("Failed to execute bash: {}", e))?;

    Ok(())
}

/// Abort RPC bash command
pub async fn abort_rpc_bash_impl(rpc_client: &SharedRPCClient) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;
    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::AbortBash)
        .await
        .map_err(|e| format!("Failed to abort bash: {}", e))?;

    Ok(())
}

/// Send abort command
pub async fn send_abort_impl(rpc_client: &SharedRPCClient) -> Result<(), String> {
    log::info!("[RPC-TRACE] service send_abort");
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::Abort)
        .await
        .map_err(|e| format!("Failed to send abort: {}", e))?;

    Ok(())
}

/// Switch session RPC (internal implementation)
///
/// Simple 2-step strategy:
/// 1. Try in-place switch on active client (fast for same/different project)
/// 2. If failed, restart Pi process with the target session
pub async fn switch_session_rpc_impl(
    app_handle: AppHandle,
    rpc_client: SharedRPCClient,
    session_path: String,
) -> Result<(), String> {
    log::info!("[RPC-TRACE] service switch_session {}", session_path);
    let target_cwd = scanner::parse_session_info(std::path::Path::new(&session_path))
        .ok()
        .map(|session| session.cwd)
        .filter(|cwd| !cwd.trim().is_empty());

    // Step 1: Try in-place switch on active client
    {
        let mut client_guard = rpc_client.lock().await;
        if let Some(client) = client_guard.as_mut() {
            // Quick check: already on this session
            if let Some(current_sf) = client.get_session_file().await {
                if session_path_matches(&session_path, &current_sf) {
                    log::info!("[RPC-TRACE] session already active, no switch needed");
                    return Ok(());
                }
            }
            match switch_session_on_client(client, &session_path, Duration::from_secs(4)).await {
                Ok(()) => return Ok(()),
                Err(err) => {
                    log::warn!("[RPC-TRACE] in-place switch failed: {}", err);
                }
            }
        }
    }

    // Step 2: Restart with target session
    log::info!(
        "[RPC-TRACE] restarting Pi process for session switch (target_cwd={:?})",
        target_cwd
    );
    let status = restart_pi_rpc_impl(
        app_handle,
        rpc_client.clone(),
        None,
        Some(session_path.clone()),
        target_cwd,
    )
    .await?;

    if !status.connected {
        return Err("RPC reconnect failed while switching session".to_string());
    }

    // Process was started with session_path — no need to call switch again.
    log::info!(
        "[RPC-TRACE] restarted for session, session_file={:?}",
        status.session_file
    );
    Ok(())
}

/// List all active RPC projects (active + parked)
pub async fn list_rpc_projects_impl(
    rpc_client: &SharedRPCClient,
    rpc_pool: &SharedRPCPool,
) -> Result<Vec<ProjectInfo>, String> {
    let mut projects = Vec::new();

    // Active client
    let client_guard = rpc_client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        if let Some(cwd) = client.get_working_dir() {
            projects.push(ProjectInfo {
                cwd: cwd.to_string(),
                is_active: true,
                session_file: client.get_session_file().await,
            });
        }
    }
    drop(client_guard);

    // Parked clients
    let pool = rpc_pool.lock().await;
    for info in pool.list_projects() {
        if !projects.iter().any(|p| p.cwd == info.cwd) {
            projects.push(info);
        }
    }

    Ok(projects)
}

/// Stop a specific project's RPC client
pub async fn stop_rpc_project_impl(
    rpc_client: &SharedRPCClient,
    rpc_pool: &SharedRPCPool,
    cwd: String,
) -> Result<(), String> {
    // Check if it's the active client
    {
        let mut client_guard = rpc_client.lock().await;
        if let Some(client) = client_guard.as_ref() {
            if client.get_working_dir().map(|s| s.to_string()).as_deref() == Some(cwd.as_str()) {
                if let Some(mut client) = client_guard.take() {
                    let _ = client.shutdown().await;
                }
                return Ok(());
            }
        }
    }

    // Check pool
    let mut pool = rpc_pool.lock().await;
    if let Some(mut client) = pool.remove(&cwd) {
        let _ = client.shutdown().await;
    }

    Ok(())
}

/// Get RPC messages
pub async fn get_rpc_messages_impl(
    rpc_client: &SharedRPCClient,
    expected_session_path: Option<String>,
) -> Result<Vec<RPCMessage>, String> {
    log::debug!("[RPC-TRACE] service get_rpc_messages");
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    if let Some(expected) = expected_session_path {
        let current = client
            .get_session_file()
            .await
            .ok_or("RPC session file not available")?;
        if !session_path_matches(&expected, &current) {
            return Err(format!(
                "RPC session mismatch: expected={}, actual={}",
                expected, current
            ));
        }
    }

    let response = match client
        .send_command_with_response(RPCCommand::GetMessages, 3)
        .await
    {
        Ok(response) => response,
        Err(err) => {
            log::debug!("get_rpc_messages fallback to cache: {}", err);
            return Ok(client.get_cached_messages().await);
        }
    };

    if let Some(messages) = response.messages {
        let parsed = match parse_rpc_messages(&messages) {
            Ok(parsed) => parsed,
            Err(err) => {
                log::warn!(
                    "[RPC-TRACE] parse messages failed, fallback to cache: {}",
                    err
                );
                return Ok(client.get_cached_messages().await);
            }
        };
        log::debug!(
            "[RPC-TRACE] get_rpc_messages parsed={} source=response.messages",
            parsed.len()
        );
        return Ok(parsed);
    }

    if let Some(data) = response.data {
        if let Some(messages) = data.get("messages").and_then(|v| v.as_array()) {
            let parsed = match parse_rpc_messages(messages) {
                Ok(parsed) => parsed,
                Err(err) => {
                    log::warn!(
                        "[RPC-TRACE] parse data.messages failed, fallback to cache: {}",
                        err
                    );
                    return Ok(client.get_cached_messages().await);
                }
            };
            log::debug!(
                "[RPC-TRACE] get_rpc_messages parsed={} source=response.data.messages",
                parsed.len()
            );
            return Ok(parsed);
        }
    }

    Err("No messages found in response".to_string())
}

/// Get RPC cached messages
pub async fn get_rpc_cached_messages_impl(
    rpc_client: &SharedRPCClient,
    expected_session_path: Option<String>,
) -> Result<Vec<RPCMessage>, String> {
    let client_guard = rpc_client.lock().await;
    let client = client_guard.as_ref().ok_or("RPC client not connected")?;
    if let Some(expected) = expected_session_path {
        let current = client
            .get_session_file()
            .await
            .ok_or("RPC session file not available")?;
        if !session_path_matches(&expected, &current) {
            return Err(format!(
                "RPC session mismatch: expected={}, actual={}",
                expected, current
            ));
        }
    }
    Ok(client.get_cached_messages().await)
}

/// Get RPC state
pub async fn get_rpc_state_impl(rpc_client: &SharedRPCClient) -> Result<RPCSessionState, String> {
    let mut client_guard = rpc_client.lock().await;
    let response_result = {
        let client = client_guard.as_mut().ok_or("RPC client not connected")?;
        client
            .send_command_with_response(RPCCommand::GetState, 10)
            .await
    };
    let response = match response_result {
        Ok(response) => response,
        Err(err) => {
            if is_rpc_transport_error(&err) {
                log::warn!(
                    "[RPC-TRACE] get_rpc_state transport error, reset client: {}",
                    err
                );
                if let Some(mut stale_client) = client_guard.take() {
                    let _ = stale_client.shutdown().await;
                }
                return Err("RPC client not connected".to_string());
            }
            return Err(format!("Failed to get state: {}", err));
        }
    };
    let mut state: RPCSessionState = parse_response_data(response.data.clone(), "get_state")?;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;
    if let Some(session_file) = state.session_file.clone() {
        client.set_session_file(session_file).await;
    } else if let Some(cached) = client.get_session_file().await {
        state.session_file = Some(cached);
    }

    Ok(state)
}

/// Get RPC available models
pub async fn get_rpc_available_models_impl(
    rpc_client: &SharedRPCClient,
) -> Result<Vec<RPCModel>, String> {
    let mut client_guard = rpc_client.lock().await;
    let response_result = {
        let client = client_guard.as_mut().ok_or("RPC client not connected")?;
        client
            .send_command_with_response(RPCCommand::GetAvailableModels, 10)
            .await
    };
    let response = match response_result {
        Ok(response) => response,
        Err(err) => {
            if is_rpc_transport_error(&err) {
                log::warn!(
                    "[RPC-TRACE] get_rpc_available_models transport error, reset client: {}",
                    err
                );
                if let Some(mut stale_client) = client_guard.take() {
                    let _ = stale_client.shutdown().await;
                }
                return Err("RPC client not connected".to_string());
            }
            return Err(format!("Failed to get available models: {}", err));
        }
    };

    if let Some(data) = response.data {
        if let Some(models) = data.get("models").and_then(|v| v.as_array()) {
            let json = serde_json::to_value(models)
                .map_err(|e| format!("Failed to serialize models: {}", e))?;
            let parsed: Vec<RPCModel> = serde_json::from_value(json)
                .map_err(|e| format!("Failed to parse models: {}", e))?;
            return Ok(parsed);
        }
    }

    Err("No models found in response".to_string())
}

/// Get RPC session stats
pub async fn get_rpc_session_stats_impl(
    rpc_client: &SharedRPCClient,
) -> Result<RPCSessionStats, String> {
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    let response = client
        .send_command_with_response(RPCCommand::GetSessionStats, 10)
        .await
        .map_err(|e| format!("Failed to get session stats: {}", e))?;

    parse_response_data(response.data, "get_session_stats")
}

/// Get RPC commands
pub async fn get_rpc_commands_impl(
    rpc_client: &SharedRPCClient,
) -> Result<Vec<SlashCommandInfo>, String> {
    let mut client_guard = rpc_client.lock().await;
    let response_result = {
        let client = client_guard.as_mut().ok_or("RPC client not connected")?;
        client
            .send_command_with_response(RPCCommand::GetCommands, 10)
            .await
    };
    let response = match response_result {
        Ok(response) => response,
        Err(err) => {
            if is_rpc_transport_error(&err) {
                log::warn!(
                    "[RPC-TRACE] get_rpc_commands transport error, reset client: {}",
                    err
                );
                if let Some(mut stale_client) = client_guard.take() {
                    let _ = stale_client.shutdown().await;
                }
                return Err("RPC client not connected".to_string());
            }
            return Err(format!("Failed to get commands: {}", err));
        }
    };

    parse_array_field(response.data, "commands")
}

/// Set RPC model
pub async fn set_rpc_model_impl(
    rpc_client: &SharedRPCClient,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::SetModel { provider, model_id })
        .await
        .map_err(|e| format!("Failed to set model: {}", e))?;

    Ok(())
}

/// Create new RPC session
pub async fn new_rpc_session_impl(
    rpc_client: &SharedRPCClient,
    parent_session: Option<String>,
) -> Result<Option<String>, String> {
    let mut client_guard = rpc_client.lock().await;

    let client = client_guard.as_mut().ok_or("RPC client not connected")?;

    client
        .send_command(RPCCommand::NewSession { parent_session })
        .await
        .map_err(|e| format!("Failed to create new session: {}", e))?;

    let mut last_seen: Option<String> = None;
    for _ in 0..6 {
        let response = client
            .send_command_with_response(RPCCommand::GetState, 6)
            .await
            .map_err(|e| format!("Failed to refresh state: {}", e))?;
        if let Ok(state) = parse_response_data::<RPCSessionState>(response.data, "get_state") {
            if let Some(session_file) = state.session_file {
                client.set_session_file(session_file.clone()).await;
                return Ok(Some(session_file));
            }
        }
        last_seen = client.get_session_file().await;
        tokio::time::sleep(Duration::from_millis(250)).await;
    }

    Ok(last_seen)
}
