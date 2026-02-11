use crate::app_state::{SharedAppState, WsEvent};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::Listener;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[derive(Debug, Deserialize)]
struct WsRequest {
    id: String,
    command: String,
    #[serde(default)]
    payload: Value,
}

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
        .ok_or_else(|| format!("Missing required parameter: {key}"))
}

fn extract_optional_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn extract_usize(payload: &Value, key: &str) -> Result<usize, String> {
    payload
        .get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .ok_or_else(|| format!("Missing required parameter: {key}"))
}

pub struct WsAdapter {
    app_state: SharedAppState,
    port: u16,
}

impl WsAdapter {
    pub fn new(app_state: SharedAppState, port: u16) -> Self {
        Self { app_state, port }
    }

    pub async fn start(self: Arc<Self>) -> Result<(), String> {
        let addr: SocketAddr = format!("0.0.0.0:{}", self.port)
            .parse()
            .map_err(|e| format!("Invalid address: {e}"))?;

        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind: {e}"))?;

        log::info!("WebSocket server listening on ws://{addr}");

        self.clone().start_event_forwarding();

        while let Ok((stream, peer_addr)) = listener.accept().await {
            log::info!("New WebSocket connection from: {peer_addr}");
            let adapter = self.clone();
            tokio::spawn(async move {
                if let Err(e) = adapter.handle_connection(stream, peer_addr).await {
                    let msg = e.to_string();
                    if msg.contains("Connection reset")
                        || msg.contains("Broken pipe")
                        || msg.contains("closing handshake")
                    {
                        log::debug!("WebSocket peer gone: {msg}");
                    } else {
                        log::warn!("WebSocket connection error: {msg}");
                    }
                }
            });
        }

        Ok(())
    }

    async fn handle_connection(
        &self,
        stream: TcpStream,
        peer_addr: SocketAddr,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Non-local connections must authenticate (if auth enabled)
        if crate::auth::is_auth_required(&peer_addr.ip()) {
            let authed =
                match tokio::time::timeout(std::time::Duration::from_secs(10), ws_receiver.next())
                    .await
                {
                    Ok(Some(Ok(Message::Text(text)))) => {
                        serde_json::from_str::<serde_json::Value>(&text)
                            .ok()
                            .and_then(|v| v.get("auth")?.as_str().map(String::from))
                            .map(|t| crate::auth::validate(&t))
                            .unwrap_or(false)
                    }
                    _ => false,
                };

            if !authed {
                let _ = ws_sender
                    .send(Message::Text(r#"{"error":"Unauthorized"}"#.to_string()))
                    .await;
                let _ = ws_sender.send(Message::Close(None)).await;
                return Ok(());
            }
            let _ = ws_sender
                .send(Message::Text(r#"{"auth":"ok"}"#.to_string()))
                .await;
        }

        let mut event_rx = self.app_state.subscribe_events();

        loop {
            tokio::select! {
                msg = ws_receiver.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            if text.contains("\"ping\"") {
                                let _ = ws_sender.send(Message::Text(r#"{"pong":true}"#.to_string())).await;
                                continue;
                            }

                            match serde_json::from_str::<WsRequest>(&text) {
                                Ok(request) => {
                                    let response = self.handle_request(request).await;
                                    let response_text = serde_json::to_string(&response)?;
                                    if ws_sender.send(Message::Text(response_text)).await.is_err() {
                                        break;
                                    }
                                }
                                Err(e) => {
                                    let error_response = WsResponse {
                                        id: "unknown".to_string(),
                                        command: "unknown".to_string(),
                                        success: false,
                                        data: None,
                                        error: Some(format!("Invalid request format: {e}")),
                                    };
                                    let error_text = serde_json::to_string(&error_response)?;
                                    if ws_sender.send(Message::Text(error_text)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                        Some(Ok(Message::Ping(data))) => {
                            let _ = ws_sender.send(Message::Pong(data)).await;
                        }
                        Some(Ok(Message::Close(_))) | None => {
                            log::info!("WebSocket connection closed");
                            break;
                        }
                        Some(Err(e)) => {
                            let msg = e.to_string();
                            if msg.contains("Connection reset") || msg.contains("Broken pipe") {
                                log::debug!("WebSocket peer disconnected: {msg}");
                            } else {
                                log::warn!("WebSocket error: {msg}");
                            }
                            break;
                        }
                        _ => {}
                    }
                }

                event = event_rx.recv() => {
                    match event {
                        Ok(ws_event) => {
                            let event_text = serde_json::to_string(&ws_event)?;
                            if ws_sender.send(Message::Text(event_text)).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            log::debug!("Event channel lagged by {n}");
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

        let result = dispatch(&self.app_state, &request.command, &request.payload).await;

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

    fn start_event_forwarding(self: Arc<Self>) {
        let app_handle = self.app_state.app_handle.clone();
        let event_tx = self.app_state.event_tx.clone();

        app_handle.listen("sessions-changed", move |_event| {
            let ws_event = WsEvent {
                event_type: "event".to_string(),
                event: "sessions-changed".to_string(),
                payload: Value::Null,
            };
            let _ = event_tx.send(ws_event);
        });
    }
}

pub async fn dispatch(
    app_state: &SharedAppState,
    command: &str,
    payload: &Value,
) -> Result<Value, String> {
    match command {
        "scan_sessions" => {
            let result = crate::scanner::scan_sessions().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "read_session_file" => {
            let path = extract_string(payload, "path")?;
            let result = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read session file: {e}"))?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "read_session_file_incremental" => {
            let path = extract_string(payload, "path")?;
            let from_line = extract_usize(payload, "fromLine")?;
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read session file: {e}"))?;
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
                .map_err(|e| format!("Failed to get file metadata: {e}"))?;
            let modified = metadata
                .modified()
                .map_err(|e| format!("Failed to get modified time: {e}"))?;
            let modified_at = modified
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("Failed to convert modified time: {e}"))?
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
            std::fs::remove_file(&path).map_err(|e| format!("Failed to delete session: {e}"))?;
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
            .map_err(|e| format!("Invalid sessions: {e}"))?;
            let result = crate::stats::calculate_stats(&sessions);
            Ok(serde_json::to_value(result).unwrap())
        }
        "get_session_stats_light" => {
            let sessions: Vec<crate::stats::SessionStatsInput> = serde_json::from_value(
                payload
                    .get("sessions")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid sessions: {e}"))?;
            let result = crate::stats::calculate_stats_from_inputs(&sessions);
            Ok(serde_json::to_value(result).unwrap())
        }
        "search_sessions" => {
            let sessions: Vec<crate::models::SessionInfo> = serde_json::from_value(
                payload
                    .get("sessions")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid sessions: {e}"))?;
            let query = extract_string(payload, "query")?;
            let search_mode =
                extract_string(payload, "searchMode").unwrap_or_else(|_| "content".to_string());
            let role_filter =
                extract_string(payload, "roleFilter").unwrap_or_else(|_| "all".to_string());
            let include_tools = payload
                .get("includeTools")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let result =
                crate::search_sessions(sessions, query, search_mode, role_filter, include_tools)
                    .await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "search_sessions_fts" => {
            let query = extract_string(payload, "query")?;
            let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let result = crate::search_sessions_fts(query, limit).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Favorites
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

        // Skills & prompts
        "scan_skills" => {
            let result = crate::scan_skills_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "scan_prompts" => {
            let result = crate::scan_prompts_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "get_skill_content" => {
            let path = extract_string(payload, "path")?;
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read skill file: {e}"))?;
            Ok(serde_json::to_value(content).unwrap())
        }
        "get_prompt_content" => {
            let path = extract_string(payload, "path")?;
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read prompt file: {e}"))?;
            Ok(serde_json::to_value(content).unwrap())
        }
        "get_system_prompt" => {
            let result = crate::get_system_prompt().await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Settings
        "load_pi_settings" => {
            let result = crate::load_pi_settings_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "save_pi_settings" => {
            let settings = serde_json::from_value(
                payload
                    .get("settings")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default())),
            )
            .map_err(|e| format!("Invalid settings: {e}"))?;
            crate::save_pi_settings(settings).await?;
            Ok(Value::Null)
        }
        "load_app_settings" => crate::load_app_settings_internal().await,
        "save_app_settings" => {
            let settings = payload
                .get("settings")
                .cloned()
                .unwrap_or(Value::Object(Default::default()));
            crate::save_app_settings(settings).await?;
            Ok(Value::Null)
        }
        "load_server_settings" => {
            let result = crate::load_server_settings().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "save_server_settings" => {
            let settings = serde_json::from_value(
                payload
                    .get("settings")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default())),
            )
            .map_err(|e| format!("Invalid settings: {e}"))?;
            crate::save_server_settings(settings).await?;
            Ok(Value::Null)
        }

        // Models
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
            .map_err(|e| format!("Invalid models: {e}"))?;
            let prompt = extract_optional_string(payload, "prompt");
            let result = crate::test_models_batch(models, prompt).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Terminal commands
        "terminal_create" => {
            let id = extract_string(payload, "id")?;
            let cwd = extract_string(payload, "cwd")?;
            let shell = extract_string(payload, "shell")?;
            let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let app_handle = app_state.app_handle.clone();
            let event_tx = app_state.event_tx.clone();
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.create_session(id, app_handle, event_tx, cwd, shell, rows, cols)?;
            Ok(serde_json::json!("Terminal created"))
        }
        "terminal_write" => {
            let id = extract_string(payload, "id")?;
            let data = extract_string(payload, "data")?;
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.write_to_session(&id, data)?;
            Ok(Value::Null)
        }
        "terminal_resize" => {
            let id = extract_string(payload, "id")?;
            let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.resize_session(&id, rows, cols)?;
            Ok(Value::Null)
        }
        "terminal_close" => {
            let id = extract_string(payload, "id")?;
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.close_session(&id)?;
            Ok(Value::Null)
        }
        "get_default_shell" => {
            let shells = crate::commands::terminal::scan_shells();
            let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
            Ok(serde_json::json!(shells
                .first()
                .map(|(_, p)| p.as_str())
                .unwrap_or(fallback)))
        }
        "get_available_shells" => Ok(serde_json::json!(crate::commands::terminal::scan_shells())),

        // Tags
        "get_all_tags" => {
            let result = crate::get_all_tags().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "create_tag" => {
            let name = extract_string(payload, "name")?;
            let color = extract_string(payload, "color")?;
            let icon = extract_optional_string(payload, "icon");
            let result = crate::create_tag(name, color, icon).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "update_tag" => {
            let id = extract_string(payload, "id")?;
            let name = extract_optional_string(payload, "name");
            let color = extract_optional_string(payload, "color");
            let icon = extract_optional_string(payload, "icon");
            let sort_order = payload.get("sortOrder").and_then(|v| v.as_i64());
            crate::update_tag(id, name, color, icon, sort_order).await?;
            Ok(Value::Null)
        }
        "delete_tag" => {
            let id = extract_string(payload, "id")?;
            crate::delete_tag(id).await?;
            Ok(Value::Null)
        }
        "get_all_session_tags" => {
            let result = crate::get_all_session_tags().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "assign_tag" => {
            let session_id = extract_string(payload, "sessionId")?;
            let tag_id = extract_string(payload, "tagId")?;
            crate::assign_tag(session_id, tag_id).await?;
            Ok(Value::Null)
        }
        "remove_tag_from_session" => {
            let session_id = extract_string(payload, "sessionId")?;
            let tag_id = extract_string(payload, "tagId")?;
            crate::remove_tag_from_session(session_id, tag_id).await?;
            Ok(Value::Null)
        }
        "move_session_tag" => {
            let session_id = extract_string(payload, "sessionId")?;
            let from_tag_id = extract_optional_string(payload, "fromTagId");
            let to_tag_id = extract_string(payload, "toTagId")?;
            let position = payload
                .get("position")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            crate::move_session_tag(session_id, from_tag_id, to_tag_id, position).await?;
            Ok(Value::Null)
        }
        "reorder_tags" => {
            let tag_ids: Vec<String> = serde_json::from_value(
                payload
                    .get("tagIds")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid tagIds: {e}"))?;
            crate::reorder_tags(tag_ids).await?;
            Ok(Value::Null)
        }
        "update_tag_auto_rules" => {
            let id = extract_string(payload, "id")?;
            let auto_rules = extract_optional_string(payload, "autoRules");
            crate::update_tag_auto_rules(id, auto_rules).await?;
            Ok(Value::Null)
        }
        "evaluate_auto_rules" => {
            let session_id = extract_string(payload, "sessionId")?;
            let text = extract_string(payload, "text")?;
            let result = crate::evaluate_auto_rules(session_id, text).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Desktop-only commands
        "open_session_in_browser" => Err("open_session_in_browser is desktop-only".to_string()),
        "open_session_in_terminal" => Err("open_session_in_terminal is desktop-only".to_string()),
        "toggle_devtools" => Err("toggle_devtools is not supported via WebSocket".to_string()),

        _ => Err(format!("Unknown command: {command}")),
    }
}

pub async fn init_ws_adapter(
    app_state: SharedAppState,
    port: u16,
) -> Result<Arc<WsAdapter>, String> {
    let adapter = Arc::new(WsAdapter::new(app_state, port));
    let adapter_clone = adapter.clone();

    tokio::spawn(async move {
        if let Err(e) = adapter_clone.start().await {
            log::error!("WebSocket server error: {e}");
        }
    });

    Ok(adapter)
}
