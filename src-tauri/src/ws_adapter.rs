//! WebSocket Adapter - Dual-channel support for IPC and WebSocket
//!
//! This adapter allows commands to be called via WebSocket,
//! enabling seamless switching between desktop IPC and Web environments.

use crate::app_state::{SharedAppState, WsEvent};
use crate::pi_rpc::ThinkingLevel;
use crate::services::rpc_service;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::Listener;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};

/// WebSocket request message
#[derive(Debug, Deserialize)]
struct WsRequest {
    id: String,
    command: String,
    #[serde(default)]
    payload: Value,
}

/// WebSocket response message
#[derive(Debug, Serialize)]
struct WsResponse {
    id: String,
    command: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn extract_string(payload: &Value, key: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing required parameter: {}", key))
}

fn extract_optional_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn extract_bool(payload: &Value, key: &str) -> Result<bool, String> {
    payload
        .get(key)
        .and_then(|v| v.as_bool())
        .ok_or_else(|| format!("Missing required parameter: {}", key))
}

fn extract_usize(payload: &Value, key: &str) -> Result<usize, String> {
    payload
        .get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .ok_or_else(|| format!("Missing required parameter: {}", key))
}

/// WebSocket adapter
pub struct WsAdapter {
    app_state: SharedAppState,
    port: u16,
}

impl WsAdapter {
    pub fn new(app_state: SharedAppState, port: u16) -> Self {
        Self { app_state, port }
    }

    pub async fn start(self: Arc<Self>) -> Result<(), String> {
        let addr: SocketAddr = format!("127.0.0.1:{}", self.port)
            .parse()
            .map_err(|e| format!("Invalid address: {}", e))?;

        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind: {}", e))?;

        log::info!("WebSocket server listening on ws://{}", addr);

        self.clone().start_event_forwarding();

        while let Ok((stream, peer_addr)) = listener.accept().await {
            log::info!("New WebSocket connection from: {}", peer_addr);
            let adapter = self.clone();
            tokio::spawn(async move {
                if let Err(e) = adapter.handle_connection(stream).await {
                    log::error!("WebSocket connection error: {}", e);
                }
            });
        }

        Ok(())
    }

    async fn handle_connection(
        &self,
        stream: TcpStream,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let mut event_rx = self.app_state.subscribe_events();

        loop {
            tokio::select! {
                msg = ws_receiver.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            match serde_json::from_str::<WsRequest>(&text) {
                                Ok(request) => {
                                    let response = self.handle_request(request).await;
                                    let response_text = serde_json::to_string(&response)?;
                                    ws_sender.send(Message::Text(response_text)).await?;
                                }
                                Err(e) => {
                                    log::error!("Failed to parse request: {}", e);
                                    let error_response = WsResponse {
                                        id: "unknown".to_string(),
                                        command: "unknown".to_string(),
                                        success: false,
                                        data: None,
                                        error: Some(format!("Invalid request format: {}", e)),
                                    };
                                    let error_text = serde_json::to_string(&error_response)?;
                                    ws_sender.send(Message::Text(error_text)).await?;
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            log::info!("WebSocket connection closed");
                            break;
                        }
                        Some(Err(e)) => {
                            log::error!("WebSocket error: {}", e);
                            break;
                        }
                        _ => {}
                    }
                }

                event = event_rx.recv() => {
                    match event {
                        Ok(ws_event) => {
                            let event_text = serde_json::to_string(&ws_event)?;
                            ws_sender.send(Message::Text(event_text)).await?;
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            log::warn!("Event channel lagged");
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn handle_request(&self, request: WsRequest) -> WsResponse {
        log::debug!("Handling command: {} (id: {})", request.command, request.id);

        let result = self
            .dispatch_command(&request.command, &request.payload)
            .await;

        match result {
            Ok(data) => WsResponse {
                id: request.id,
                command: request.command,
                success: true,
                data: Some(data),
                error: None,
            },
            Err(error) => WsResponse {
                id: request.id,
                command: request.command,
                success: false,
                data: None,
                error: Some(error),
            },
        }
    }

    async fn dispatch_command(&self, command: &str, payload: &Value) -> Result<Value, String> {
        let rpc_client = &self.app_state.rpc_client;
        let app_handle = &self.app_state.app_handle;

        match command {
            // RPC commands with state injection
            "detect_pi_rpc_support" => {
                let pi_path = extract_optional_string(payload, "piPath");
                let result = rpc_service::detect_pi_rpc_support_impl(pi_path).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "start_pi_rpc" => {
                let pi_path = extract_optional_string(payload, "piPath");
                let result = rpc_service::start_pi_rpc_impl(
                    app_handle.clone(),
                    rpc_client.clone(),
                    pi_path,
                    None,
                    None,
                )
                .await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "stop_pi_rpc" => {
                rpc_service::stop_pi_rpc_impl(rpc_client).await?;
                Ok(Value::Null)
            }
            "restart_pi_rpc" => {
                let pi_path = extract_optional_string(payload, "piPath");
                let result = rpc_service::restart_pi_rpc_impl(
                    app_handle.clone(),
                    rpc_client.clone(),
                    pi_path,
                    None,
                    None,
                )
                .await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "get_rpc_status" => {
                let result = rpc_service::get_rpc_status_impl(rpc_client).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "send_prompt" => {
                let message = extract_string(payload, "message")?;
                rpc_service::send_prompt_impl(rpc_client, message).await?;
                Ok(Value::Null)
            }
            "send_follow_up" => {
                let message = extract_string(payload, "message")?;
                rpc_service::send_follow_up_impl(rpc_client, message).await?;
                Ok(Value::Null)
            }
            "send_steer" => {
                let message = extract_string(payload, "message")?;
                rpc_service::send_steer_impl(rpc_client, message).await?;
                Ok(Value::Null)
            }
            "send_abort" => {
                rpc_service::send_abort_impl(rpc_client).await?;
                Ok(Value::Null)
            }
            "cycle_rpc_model" => {
                rpc_service::cycle_rpc_model_impl(rpc_client).await?;
                Ok(Value::Null)
            }
            "set_rpc_thinking_level" => {
                let level: ThinkingLevel =
                    serde_json::from_value(payload.get("level").cloned().unwrap_or(Value::Null))
                        .map_err(|e| format!("Invalid thinking level: {}", e))?;
                rpc_service::set_rpc_thinking_level_impl(rpc_client, level).await?;
                Ok(Value::Null)
            }
            "cycle_rpc_thinking_level" => {
                rpc_service::cycle_rpc_thinking_level_impl(rpc_client).await?;
                Ok(Value::Null)
            }
            "compact_rpc_session" => {
                let custom_instructions = extract_optional_string(payload, "customInstructions");
                rpc_service::compact_rpc_session_impl(rpc_client, custom_instructions).await?;
                Ok(Value::Null)
            }
            "set_rpc_auto_compaction" => {
                let enabled = extract_bool(payload, "enabled")?;
                rpc_service::set_rpc_auto_compaction_impl(rpc_client, enabled).await?;
                Ok(Value::Null)
            }
            "send_rpc_bash" => {
                let command = extract_string(payload, "command")?;
                rpc_service::send_rpc_bash_impl(rpc_client, command).await?;
                Ok(Value::Null)
            }
            "abort_rpc_bash" => {
                rpc_service::abort_rpc_bash_impl(rpc_client).await?;
                Ok(Value::Null)
            }
            "switch_session_rpc" => {
                let session_path = extract_string(payload, "sessionPath")?;
                rpc_service::switch_session_rpc_impl(
                    app_handle.clone(),
                    rpc_client.clone(),
                    session_path,
                )
                .await?;
                Ok(Value::Null)
            }
            "get_rpc_messages" => {
                let expected_session_path = extract_optional_string(payload, "expectedSessionPath");
                let result =
                    rpc_service::get_rpc_messages_impl(rpc_client, expected_session_path).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "get_rpc_cached_messages" => {
                let expected_session_path = extract_optional_string(payload, "expectedSessionPath");
                let result =
                    rpc_service::get_rpc_cached_messages_impl(rpc_client, expected_session_path)
                        .await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "sync_rpc_session_cache" => {
                rpc_service::sync_rpc_session_cache_impl(rpc_client).await?;
                Ok(Value::Null)
            }
            "get_rpc_state" => {
                let result = rpc_service::get_rpc_state_impl(rpc_client).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "get_rpc_available_models" => {
                let result = rpc_service::get_rpc_available_models_impl(rpc_client).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "get_rpc_session_stats" => {
                let result = rpc_service::get_rpc_session_stats_impl(rpc_client).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "get_rpc_commands" => {
                let result = rpc_service::get_rpc_commands_impl(rpc_client).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "set_rpc_model" => {
                let provider = extract_string(payload, "provider")?;
                let model_id = extract_string(payload, "modelId")?;
                rpc_service::set_rpc_model_impl(rpc_client, provider, model_id).await?;
                Ok(Value::Null)
            }
            "new_rpc_session" => {
                let parent_session = extract_optional_string(payload, "parentSession");
                rpc_service::new_rpc_session_impl(rpc_client, parent_session).await?;
                Ok(Value::Null)
            }

            // Stateless commands
            "scan_sessions" => {
                let result = crate::scanner::scan_sessions().await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "read_session_file" => {
                let path = extract_string(payload, "path")?;
                let result = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read session file: {}", e))?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "scan_skills" => {
                let result = crate::scan_skills_internal().await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "scan_prompts" => {
                let result = crate::scan_prompts_internal().await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "load_pi_settings" => {
                let result = crate::load_pi_settings_internal().await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "load_app_settings" => {
                let result = crate::load_app_settings_internal().await?;
                Ok(serde_json::to_value(result).unwrap())
            }

            // Session commands
            "read_session_file_incremental" => {
                let path = extract_string(payload, "path")?;
                let from_line = extract_usize(payload, "fromLine")?;
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read session file: {}", e))?;
                let lines: Vec<&str> = content.lines().collect();
                let total_lines = lines.len();
                let new_content = if from_line >= total_lines {
                    String::new()
                } else {
                    lines[from_line..].join("\n")
                };
                Ok(serde_json::json!([total_lines, new_content]))
            }
            "get_file_stats" => {
                let path = extract_string(payload, "path")?;
                let metadata = std::fs::metadata(&path)
                    .map_err(|e| format!("Failed to get file metadata: {}", e))?;
                let modified = metadata
                    .modified()
                    .map_err(|e| format!("Failed to get modified time: {}", e))?;
                let modified_at = modified
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| format!("Failed to convert modified time: {}", e))?
                    .as_millis() as u64;
                Ok(serde_json::json!({
                    "size": metadata.len(),
                    "modified_at": modified_at,
                    "is_file": metadata.is_file()
                }))
            }
            "get_session_entries" => {
                let path = extract_string(payload, "path")?;
                let result = crate::get_session_entries(path).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "delete_session" => {
                let path = extract_string(payload, "path")?;
                std::fs::remove_file(&path)
                    .map_err(|e| format!("Failed to delete session: {}", e))?;
                Ok(Value::Null)
            }
            "export_session" => {
                let path = extract_string(payload, "path")?;
                let format = extract_string(payload, "format")?;
                let output_path = extract_string(payload, "outputPath")?;
                crate::export::export_session(&path, &format, &output_path).await?;
                Ok(Value::Null)
            }
            "rename_session" => {
                let path = extract_string(payload, "path")?;
                let new_name = extract_string(payload, "newName")?;
                crate::rename_session(path, new_name).await?;
                Ok(Value::Null)
            }
            "get_session_stats" => {
                let sessions: Vec<crate::models::SessionInfo> = serde_json::from_value(
                    payload
                        .get("sessions")
                        .cloned()
                        .unwrap_or(Value::Array(vec![])),
                )
                .map_err(|e| format!("Invalid sessions: {}", e))?;
                let result = crate::stats::calculate_stats(&sessions);
                Ok(serde_json::to_value(result).unwrap())
            }
            "search_sessions" => {
                let sessions: Vec<crate::models::SessionInfo> = serde_json::from_value(
                    payload
                        .get("sessions")
                        .cloned()
                        .unwrap_or(Value::Array(vec![])),
                )
                .map_err(|e| format!("Invalid sessions: {}", e))?;
                let query = extract_string(payload, "query")?;
                let search_mode =
                    extract_string(payload, "searchMode").unwrap_or_else(|_| "content".to_string());
                let role_filter =
                    extract_string(payload, "roleFilter").unwrap_or_else(|_| "all".to_string());
                let include_tools = payload
                    .get("includeTools")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let result = crate::search_sessions(
                    sessions,
                    query,
                    search_mode,
                    role_filter,
                    include_tools,
                )
                .await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "search_sessions_fts" => {
                let query = extract_string(payload, "query")?;
                let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
                let result = crate::search_sessions_fts(query, limit).await?;
                Ok(serde_json::to_value(result).unwrap())
            }

            // Favorites commands
            "get_all_favorites" => {
                let result = crate::get_all_favorites().await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "add_favorite" => {
                let id = extract_string(payload, "id")?;
                let favorite_type = extract_string(payload, "favoriteType")?;
                let name = extract_string(payload, "name")?;
                let path = extract_string(payload, "path")?;
                crate::add_favorite(id, favorite_type, name, path).await?;
                Ok(Value::Null)
            }
            "remove_favorite" => {
                let id = extract_string(payload, "id")?;
                crate::remove_favorite(id).await?;
                Ok(Value::Null)
            }
            "is_favorite" => {
                let id = extract_string(payload, "id")?;
                let result = crate::is_favorite(id).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "toggle_favorite" => {
                let id = extract_string(payload, "id")?;
                let favorite_type = extract_string(payload, "favoriteType")?;
                let name = extract_string(payload, "name")?;
                let path = extract_string(payload, "path")?;
                let result = crate::toggle_favorite(id, favorite_type, name, path).await?;
                Ok(serde_json::to_value(result).unwrap())
            }

            // Skills and prompts
            "get_skill_content" => {
                let path = extract_string(payload, "path")?;
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read skill file: {}", e))?;
                Ok(serde_json::to_value(content).unwrap())
            }
            "get_prompt_content" => {
                let path = extract_string(payload, "path")?;
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read prompt file: {}", e))?;
                Ok(serde_json::to_value(content).unwrap())
            }
            "get_system_prompt" => {
                let result = crate::get_system_prompt().await?;
                Ok(serde_json::to_value(result).unwrap())
            }

            // Settings commands
            "save_pi_settings" => {
                let settings = serde_json::from_value(
                    payload
                        .get("settings")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default())),
                )
                .map_err(|e| format!("Invalid settings: {}", e))?;
                crate::save_pi_settings(settings).await?;
                Ok(Value::Null)
            }
            "save_app_settings" => {
                let settings = serde_json::from_value(
                    payload
                        .get("settings")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default())),
                )
                .map_err(|e| format!("Invalid settings: {}", e))?;
                crate::save_app_settings(settings).await?;
                Ok(Value::Null)
            }

            // Model commands
            "list_models" => {
                let search = extract_optional_string(payload, "search");
                let result = crate::list_models(search).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "test_model" => {
                let provider = extract_string(payload, "provider")?;
                let model = extract_string(payload, "model")?;
                let prompt = extract_optional_string(payload, "prompt");
                let result = crate::test_model(provider, model, prompt).await?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "test_models_batch" => {
                let models: Vec<(String, String)> = serde_json::from_value(
                    payload
                        .get("models")
                        .cloned()
                        .unwrap_or(Value::Array(vec![])),
                )
                .map_err(|e| format!("Invalid models: {}", e))?;
                let prompt = extract_optional_string(payload, "prompt");
                let result = crate::test_models_batch(models, prompt).await?;
                Ok(serde_json::to_value(result).unwrap())
            }

            // File commands
            "get_file_completions" => {
                let cwd = extract_string(payload, "cwd")?;
                let query = extract_string(payload, "query")?;
                let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
                let result = crate::get_file_completions(cwd, query, limit).await?;
                Ok(serde_json::to_value(result).unwrap())
            }

            // Desktop-only commands (not supported via WebSocket)
            "open_session_in_browser" => Err("open_session_in_browser is desktop-only".to_string()),
            "open_session_in_terminal" => {
                Err("open_session_in_terminal is desktop-only".to_string())
            }
            "toggle_devtools" => Err("toggle_devtools is not supported via WebSocket".to_string()),
            "open_external_url" => {
                Err("open_external_url should be handled in browser with window.open()".to_string())
            }

            _ => Err(format!("Unknown command: {}", command)),
        }
    }

    fn start_event_forwarding(self: Arc<Self>) {
        let app_handle = self.app_state.app_handle.clone();
        let event_tx = self.app_state.event_tx.clone();

        app_handle.listen("pi-rpc-event", move |event| {
            if let Ok(payload) = serde_json::from_str::<Value>(event.payload()) {
                let ws_event = WsEvent {
                    event_type: "event".to_string(),
                    event: "pi-rpc-event".to_string(),
                    payload,
                };
                let _ = event_tx.send(ws_event);
            }
        });

        let app_handle2 = self.app_state.app_handle.clone();
        let event_tx2 = self.app_state.event_tx.clone();

        app_handle2.listen("pi-rpc-exited", move |_| {
            let ws_event = WsEvent {
                event_type: "event".to_string(),
                event: "pi-rpc-exited".to_string(),
                payload: Value::Null,
            };
            let _ = event_tx2.send(ws_event);
        });
    }
}

/// Initialize and start the WebSocket adapter
pub async fn init_ws_adapter(
    app_state: SharedAppState,
    port: u16,
) -> Result<Arc<WsAdapter>, String> {
    let adapter = Arc::new(WsAdapter::new(app_state, port));
    let adapter_clone = adapter.clone();

    tokio::spawn(async move {
        if let Err(e) = adapter_clone.start().await {
            log::error!("WebSocket server error: {}", e);
        }
    });

    Ok(adapter)
}
