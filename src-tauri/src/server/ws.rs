#[cfg(feature = "gui")]
use crate::app_state::{SharedAppState, WsEvent};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
#[cfg(feature = "gui")]
use tauri::{Emitter, Listener};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_hdr_async, tungstenite::Message};

#[derive(Debug, Deserialize)]
struct WsRequest {
    id: String,
    command: String,
    #[serde(default)]
    payload: Value,
    /// Whether request data uses Gzip compression (Base64 encoded)
    #[serde(default)]
    compressed: bool,
    /// Whether response should use Gzip compression
    #[serde(default)]
    accept_gzip: bool,
    /// Whether this connection explicitly requests terminal capability
    #[serde(default)]
    terminal_capability: bool,
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
    /// Whether response data uses Gzip compression (Base64 encoded)
    #[serde(skip_serializing_if = "Option::is_none")]
    compressed: Option<bool>,
}

use crate::utils::payload::{extract_string, extract_usize};

fn is_pi_live_forward_event(event_type: &str) -> bool {
    matches!(event_type, "message_start" | "message_update" | "message_end" | "tool_execution_start" | "tool_execution_update" | "tool_execution_end" | "agent_start" | "agent_end" | "turn_start" | "turn_end" | "model_select" | "auto_compaction_start" | "auto_compaction_end" | "queue_update")
}

fn should_emit_pi_live_to_tauri(event_type: &str) -> bool {
    matches!(event_type, "message_start" | "message_end" | "tool_execution_start" | "tool_execution_end" | "agent_start" | "agent_end" | "turn_start" | "turn_end" | "auto_compaction_start" | "auto_compaction_end" | "queue_update")
}

pub struct WsAdapter {
    app_state: SharedAppState,
    bind_addr: String,
    port: u16,
}

impl WsAdapter {
    pub fn new(app_state: SharedAppState, bind_addr: &str, port: u16) -> Self {
        Self { app_state, bind_addr: bind_addr.to_string(), port }
    }

    pub async fn start(self: Arc<Self>) -> Result<(), String> {
        let addr: SocketAddr = format!("{}:{}", self.bind_addr, self.port).parse().map_err(|e| format!("Invalid address: {e}"))?;

        let listener = TcpListener::bind(&addr).await.map_err(|e| format!("Failed to bind: {e}"))?;

        log::info!("WebSocket server listening on ws://{addr}");

        self.clone().start_event_forwarding();

        while let Ok((stream, peer_addr)) = listener.accept().await {
            log::info!("New WebSocket connection from: {peer_addr}");
            let adapter = self.clone();
            tokio::spawn(async move {
                if let Err(e) = adapter.handle_connection(stream, peer_addr).await {
                    let msg = e.to_string();
                    if msg.contains("Connection reset") || msg.contains("Broken pipe") || msg.contains("closing handshake") {
                        log::debug!("WebSocket peer gone: {msg}");
                    } else {
                        log::warn!("WebSocket connection error: {msg}");
                    }
                }
            });
        }

        Ok(())
    }

    async fn handle_connection(&self, stream: TcpStream, peer_addr: SocketAddr) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut origin: Option<String> = None;
        let mut host: Option<String> = None;
        let ws_stream = accept_hdr_async(stream, |request: &tokio_tungstenite::tungstenite::handshake::server::Request, _response: tokio_tungstenite::tungstenite::handshake::server::Response| {
            origin = request.headers().get("origin").and_then(|value| value.to_str().ok()).map(str::to_string);
            host = request.headers().get("host").and_then(|value| value.to_str().ok()).map(str::to_string);
            Ok(_response)
        })
        .await?;
        let auth_required = crate::auth::auth_required();
        let origin_is_allowed = crate::auth::origin_allowed(origin.as_deref(), host.as_deref());
        if !origin_is_allowed {
            return Ok(());
        }
        let has_origin = origin.is_some();
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Non-local connections must authenticate (if auth enabled)
        let mut authenticated = !auth_required;
        if auth_required {
            let authed = match tokio::time::timeout(std::time::Duration::from_secs(10), ws_receiver.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v.get("auth")?.as_str().map(String::from)).map(|t| crate::auth::validate(&t)).unwrap_or(false),
                _ => false,
            };

            if !authed {
                let _ = ws_sender.send(Message::Text(r#"{"error":"Unauthorized"}"#.to_string())).await;
                let _ = ws_sender.send(Message::Close(None)).await;
                return Ok(());
            }
            authenticated = true;
            let _ = ws_sender.send(Message::Text(r#"{"auth":"ok"}"#.to_string())).await;
        }

        let mut event_rx = self.app_state.subscribe_events();

        // RPC command channel for Pi agent connections
        let (rpc_cmd_tx, mut rpc_cmd_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let (rpc_resp_tx, _) = tokio::sync::broadcast::channel::<serde_json::Value>(16);
        let mut registered_session_id: Option<String> = None;

        loop {
            tokio::select! {
                msg = ws_receiver.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                                if value.get("ping").and_then(Value::as_bool) == Some(true) {
                                    let _ = ws_sender.send(Message::Text(r#"{"pong":true}"#.to_string())).await;
                                    continue;
                                }
                            }
                            // Debug: log raw message start for pi-agent detection
                            let has_type = text.contains("\"type\"");
                            let has_register = text.contains("\"register\"");
                            let has_live_event = text.contains("\"message_update\"")
                                || text.contains("\"turn_end\"")
                                || text.contains("\"tool_execution_\"");
                            if has_type || has_register || has_live_event {
                                log::info!("[WS] Pi agent msg detected: type={} reg={} live={} len={}", has_type, has_register, has_live_event, text.len());
                            }

                            // Pi agent protocol: register with sessionId
                            if text.contains("\"type\"") && text.contains("\"register\"") {
                                log::info!("[WS] Pi register message detected, len={}", text.len());
                                if let Ok(register) = serde_json::from_str::<serde_json::Value>(&text) {
                                    let session_id = register["payload"]["sessionId"].as_str().unwrap_or("");
                                    if !session_id.is_empty() {
                                        let session_path = register["payload"]["sessionPath"].as_str().map(|s| s.to_string());
                                        let pid = register["payload"]["pid"].as_u64().map(|p| p as u32);
                                        let cwd = register["payload"]["cwd"].as_str().map(|s| s.to_string());
                                        let entries = register["payload"]["entries"].as_array().cloned().unwrap_or_default();
                                        log::info!("Pi agent registered: session={session_id}, pid={pid:?}, entries={}", entries.len());

                                        self.app_state.pi_agent_registry.register(
                                            session_id.to_string(), session_path, pid, cwd, entries
                                        );

                                        // Register RPC connection channels
                                        self.app_state.pi_agent_registry.register_connection(
                                            session_id.to_string(),
                                            rpc_cmd_tx.clone(),
                                            rpc_resp_tx.clone(),
                                        );
                                        registered_session_id = Some(session_id.to_string());

                                        // Broadcast to WS clients
                                        let ws_event = WsEvent {
                                            event_type: "event".to_string(),
                                            event: "pi-live:session_registered".to_string(),
                                            payload: register["payload"].clone(),
                                        };
                                        let _ = self.app_state.event_tx.send(ws_event);

                                        // ALSO emit to Tauri frontend so usePiLiveSessions can react
                                        let _ = self.app_state.app_handle.emit("pi-live:session_registered", &register["payload"]);
                                    }
                                }
                                continue;
                            }

                            if let Ok(live_event) = serde_json::from_str::<serde_json::Value>(&text) {
                                let event_type = live_event["type"].as_str().unwrap_or("");
                                if is_pi_live_forward_event(event_type) {
                                    let session_id = live_event["sessionId"].as_str().unwrap_or("");
                                    if !session_id.is_empty() {
                                        self.app_state.pi_agent_registry.record_entry(session_id, event_type);

                                        log::info!("[WS] Pi live event: session={session_id}, event={event_type}");
                                        let _ = self.app_state.event_tx.send(WsEvent {
                                            event_type: "event".to_string(),
                                            event: event_type.to_string(),
                                            payload: live_event.clone(),
                                        });
                                        if should_emit_pi_live_to_tauri(event_type) {
                                            let _ = self.app_state.app_handle.emit(event_type, &live_event);
                                        }
                                        let _ = ws_sender.send(Message::Text(r#"{"type":"ack"}"#.to_string())).await;
                                    }
                                    continue;
                                }
                            }

                             // ── Pi agent protocol: RPC response ─────────────────
                            if text.contains("\"type\"") && text.contains("\"response\"") {
                                log::info!("[WS] Received potential RPC response: {text}");
                                if let Ok(resp) = serde_json::from_str::<serde_json::Value>(&text) {
                                    let s_id = resp["sessionId"].as_str().map(|s| s.to_string())
                                        .or_else(|| registered_session_id.clone());
                                    if let Some(session_id) = s_id {
                                        log::info!("[WS] Forwarding RPC response for session {session_id}, id={:?}, success={:?}", resp["id"], resp["success"]);
                                        self.app_state.pi_agent_registry.forward_response(&session_id, resp);
                                    } else {
                                        log::warn!("[WS] Received RPC response but no session_id matched for forwarding: {text}");
                                    }
                                }
                                continue;
                            }

                            // ── Pi agent protocol: session state update ─────────
                            if text.contains("\"type\"") && text.contains("\"session_state\"") {
                                if let Ok(state_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                    if let Some(session_id) = state_msg["payload"]["sessionId"].as_str() {
                                        let model = state_msg["payload"]["model"].clone();
                                        let available_models = state_msg["payload"]["availableModels"]
                                            .as_array()
                                            .cloned();
                                        let thinking_level = state_msg["payload"]["thinkingLevel"].as_str().map(|s| s.to_string());
                                        let context_usage = state_msg["payload"]["contextUsage"].clone();
                                        self.app_state.pi_agent_registry.update_session_state(
                                            session_id,
                                            if model.is_null() { None } else { Some(model) },
                                            available_models,
                                            thinking_level,
                                            if context_usage.is_null() { None } else { Some(context_usage) },
                                        );
                                        // Also broadcast session_state to frontend
                                        let ws_event = WsEvent {
                                            event_type: "event".to_string(),
                                            event: "pi-live:state_updated".to_string(),
                                            payload: state_msg["payload"].clone(),
                                        };
                                        let _ = self.app_state.event_tx.send(ws_event.clone());
                                        let _ = self.app_state.app_handle.emit("pi-live:state_updated", &ws_event.payload);
                                    }
                                }
                                continue;
                            }

                            match serde_json::from_str::<WsRequest>(&text) {
                                Ok(mut request) => {
                                    if crate::auth::is_terminal_command(&request.command) {
                                        let requested = request.terminal_capability;
                                        if !crate::auth::terminal_capability_allowed(peer_addr.ip(), has_origin, origin_is_allowed, auth_required, authenticated, requested) {
                                            let response = WsResponse { id: request.id, command: request.command, success: false, data: None, error: Some("Terminal capability denied".to_string()), compressed: None };
                                            let msg = self.compress_response_if_needed(response, request.accept_gzip)?;
                                            if ws_sender.send(msg).await.is_err() { break; }
                                            continue;
                                        }
                                    }

                                    // Handle compressed request payload
                                    if request.compressed {
                                        if let Some(payload_str) = request.payload.as_str() {
                                            match crate::compression::gzip_decompress_from_base64(payload_str) {
                                                Ok(decompressed) => {
                                                    if let Ok(decompressed_json) = serde_json::from_slice(&decompressed) {
                                                        request.payload = decompressed_json;
                                                    }
                                                }
                                                Err(e) => {
                                                    log::warn!("Failed to decompress request: {e}");
                                                }
                                            }
                                        }
                                    }

                                    let result = crate::dispatch::dispatch_with_state(&Some(self.app_state.clone()), &request.command, &request.payload).await;
                                    let accept_gzip = request.accept_gzip;
                                    let response = self.build_response(&request, result);

                                    let msg = self.compress_response_if_needed(response, accept_gzip)?;
                                    if ws_sender.send(msg).await.is_err() {
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
                                        compressed: None,
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
                // Forward RPC commands from PiAgentRegistry to this WebSocket
                rpc_cmd = rpc_cmd_rx.recv() => {
                    match rpc_cmd {
                        Some(cmd) => {
                            if ws_sender.send(Message::Text(cmd)).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
            }
        }

        // Cleanup: remove RPC connection on disconnect
        if let Some(sid) = &registered_session_id {
            log::info!("[WS] Pi agent disconnected: session={sid}");
            self.app_state.pi_agent_registry.remove(sid);

            let ws_event = WsEvent { event_type: "event".to_string(), event: "pi-live:session_disconnected".to_string(), payload: serde_json::json!({ "sessionId": sid }) };
            let _ = self.app_state.event_tx.send(ws_event.clone());
            let _ = self.app_state.app_handle.emit("pi-live:session_disconnected", &ws_event.payload);
        }

        Ok(())
    }

    async fn handle_request(&self, request: WsRequest) -> WsResponse {
        log::debug!("Handling command: {} (id: {})", request.command, request.id);

        let result = crate::dispatch::dispatch_with_state(&Some(self.app_state.clone()), &request.command, &request.payload).await;

        match result {
            Ok(data) => WsResponse { id: request.id, command: request.command, success: true, data: Some(data), error: None, compressed: None },
            Err(error) => WsResponse { id: request.id, command: request.command, success: false, data: None, error: Some(error), compressed: None },
        }
    }

    fn build_response(&self, request: &WsRequest, result: Result<Value, String>) -> WsResponse {
        match result {
            Ok(data) => WsResponse { id: request.id.clone(), command: request.command.clone(), success: true, data: Some(data), error: None, compressed: None },
            Err(error) => WsResponse { id: request.id.clone(), command: request.command.clone(), success: false, data: None, error: Some(error), compressed: None },
        }
    }

    fn compress_response_if_needed(&self, response: WsResponse, accept_gzip: bool) -> Result<Message, Box<dyn std::error::Error + Send + Sync>> {
        if !accept_gzip {
            return Ok(Message::Text(serde_json::to_string(&response)?));
        }

        let json_str = serde_json::to_string(&response)?;
        match crate::compression::gzip_compress_to_base64(json_str.as_bytes()) {
            Ok(compressed_b64) => {
                let mut compressed_response = serde_json::Map::new();
                compressed_response.insert("id".to_string(), serde_json::Value::String(response.id));
                compressed_response.insert("command".to_string(), serde_json::Value::String(response.command));
                compressed_response.insert("success".to_string(), serde_json::Value::Bool(response.success));
                compressed_response.insert("data".to_string(), serde_json::Value::String(compressed_b64));
                compressed_response.insert("compressed".to_string(), serde_json::Value::Bool(true));
                if let Some(error) = response.error {
                    compressed_response.insert("error".to_string(), serde_json::Value::String(error));
                }
                Ok(Message::Text(serde_json::to_string(&compressed_response)?))
            }
            Err(e) => {
                log::warn!("Failed to compress response: {e}");
                Ok(Message::Text(json_str))
            }
        }
    }

    fn start_event_forwarding(self: Arc<Self>) {
        let app_handle = self.app_state.app_handle.clone();
        let event_tx = self.app_state.event_tx.clone();

        app_handle.listen("sessions-changed", move |event| {
            let payload = serde_json::from_str::<Value>(event.payload()).unwrap_or(Value::Null);
            let ws_event = WsEvent { event_type: "event".to_string(), event: "sessions-changed".to_string(), payload };
            let _ = event_tx.send(ws_event);
        });
    }
}

pub async fn ws_dispatch(app_state: &SharedAppState, command: &str, payload: &Value) -> Result<Value, String> {
    // GUI-only overrides that need AppState (terminal, save_session_paths with watcher)
    match command {
        "save_session_paths" => {
            let paths: Vec<String> = serde_json::from_value(payload.get("paths").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid paths: {e}"))?;
            let app_handle = app_state.app_handle.clone();
            crate::save_session_paths(paths, app_handle).await?;
            return Ok(Value::Null);
        }
        "terminal_create" => {
            let id = extract_string(payload, "id")?;
            let cwd = extract_string(payload, "cwd")?;
            let shell = extract_string(payload, "shell")?;
            let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let app_handle = app_state.app_handle.clone();
            let event_tx = app_state.event_tx.clone();
            let manager = app_state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.create_session(id, app_handle, event_tx, cwd, shell, rows, cols)?;
            return Ok(serde_json::json!("Terminal created"));
        }
        "terminal_write" => {
            let id = extract_string(payload, "id")?;
            let data = extract_string(payload, "data")?;
            let manager = app_state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.write_to_session(&id, data)?;
            return Ok(Value::Null);
        }
        "terminal_resize" => {
            let id = extract_string(payload, "id")?;
            let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let manager = app_state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.resize_session(&id, rows, cols)?;
            return Ok(Value::Null);
        }
        "terminal_close" => {
            let id = extract_string(payload, "id")?;
            let manager = app_state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.close_session(&id)?;
            return Ok(Value::Null);
        }
        "get_default_shell" => {
            let shells = crate::utils::scan_shells();
            let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
            return Ok(serde_json::json!(shells.first().map(|(_, p)| p.as_str()).unwrap_or(fallback)));
        }
        "get_available_shells" => {
            return Ok(serde_json::json!(crate::utils::scan_shells()));
        }
        "get_pi_live_sessions" => {
            let sessions = app_state.pi_agent_registry.list();
            return Ok(serde_json::to_value(sessions).expect("serialize pi_live_sessions"));
        }
        _ => {}
    }

    // Delegate to shared dispatch (pure business logic)
    crate::dispatch::dispatch(command, payload).await
}

pub async fn init_ws_adapter(app_state: SharedAppState, bind_addr: &str, port: u16) -> Result<Arc<WsAdapter>, String> {
    let adapter = Arc::new(WsAdapter::new(app_state, bind_addr, port));
    let adapter_clone = adapter.clone();

    tokio::spawn(async move {
        if let Err(e) = adapter_clone.start().await {
            log::error!("WebSocket server error: {e}");
        }
    });

    Ok(adapter)
}
