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
    /// 请求数据是否使用 Gzip 压缩（Base64 编码）
    #[serde(default)]
    compressed: bool,
    /// 期望响应是否使用 Gzip 压缩
    #[serde(default)]
    accept_gzip: bool,
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
    /// 响应数据是否使用 Gzip 压缩（Base64 编码）
    #[serde(skip_serializing_if = "Option::is_none")]
    compressed: Option<bool>,
}

use crate::dispatch::{extract_string, extract_usize};

pub struct WsAdapter {
    app_state: SharedAppState,
    bind_addr: String,
    port: u16,
}

impl WsAdapter {
    pub fn new(app_state: SharedAppState, bind_addr: &str, port: u16) -> Self {
        Self {
            app_state,
            bind_addr: bind_addr.to_string(),
            port,
        }
    }

    pub async fn start(self: Arc<Self>) -> Result<(), String> {
        let addr: SocketAddr = format!("{}:{}", self.bind_addr, self.port)
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
                                Ok(mut request) => {
                                    // 处理压缩的请求 payload
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

                                    let result = dispatch(&self.app_state, &request.command, &request.payload).await;
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
                compressed: None,
            },
            Err(error) => WsResponse {
                id: request.id,
                command: request.command,
                success: false,
                data: None,
                error: Some(error),
                compressed: None,
            },
        }
    }

    fn build_response(&self, request: &WsRequest, result: Result<Value, String>) -> WsResponse {
        match result {
            Ok(data) => WsResponse {
                id: request.id.clone(),
                command: request.command.clone(),
                success: true,
                data: Some(data),
                error: None,
                compressed: None,
            },
            Err(error) => WsResponse {
                id: request.id.clone(),
                command: request.command.clone(),
                success: false,
                data: None,
                error: Some(error),
                compressed: None,
            },
        }
    }

    fn compress_response_if_needed(
        &self,
        response: WsResponse,
        accept_gzip: bool,
    ) -> Result<Message, Box<dyn std::error::Error + Send + Sync>> {
        if !accept_gzip {
            return Ok(Message::Text(serde_json::to_string(&response)?));
        }

        let json_str = serde_json::to_string(&response)?;
        match crate::compression::gzip_compress_to_base64(json_str.as_bytes()) {
            Ok(compressed_b64) => {
                let mut compressed_response = serde_json::Map::new();
                compressed_response
                    .insert("id".to_string(), serde_json::Value::String(response.id));
                compressed_response.insert(
                    "command".to_string(),
                    serde_json::Value::String(response.command),
                );
                compressed_response.insert(
                    "success".to_string(),
                    serde_json::Value::Bool(response.success),
                );
                compressed_response.insert(
                    "data".to_string(),
                    serde_json::Value::String(compressed_b64),
                );
                compressed_response.insert("compressed".to_string(), serde_json::Value::Bool(true));
                if let Some(error) = response.error {
                    compressed_response
                        .insert("error".to_string(), serde_json::Value::String(error));
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
            let ws_event = WsEvent {
                event_type: "event".to_string(),
                event: "sessions-changed".to_string(),
                payload,
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
    // GUI-only overrides that need AppState (terminal, save_session_paths with watcher)
    match command {
        "save_session_paths" => {
            let paths: Vec<String> = serde_json::from_value(
                payload
                    .get("paths")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid paths: {e}"))?;
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
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.create_session(id, app_handle, event_tx, cwd, shell, rows, cols)?;
            return Ok(serde_json::json!("Terminal created"));
        }
        "terminal_write" => {
            let id = extract_string(payload, "id")?;
            let data = extract_string(payload, "data")?;
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.write_to_session(&id, data)?;
            return Ok(Value::Null);
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
            return Ok(Value::Null);
        }
        "terminal_close" => {
            let id = extract_string(payload, "id")?;
            let manager = app_state
                .terminal_manager
                .lock()
                .map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
            manager.close_session(&id)?;
            return Ok(Value::Null);
        }
        "get_default_shell" => {
            let shells = crate::commands::terminal::scan_shells();
            let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
            return Ok(serde_json::json!(shells
                .first()
                .map(|(_, p)| p.as_str())
                .unwrap_or(fallback)));
        }
        "get_available_shells" => {
            return Ok(serde_json::json!(crate::commands::terminal::scan_shells()));
        }
        _ => {}
    }

    // Delegate to shared dispatch (pure business logic)
    crate::dispatch::dispatch(command, payload).await
}

pub async fn init_ws_adapter(
    app_state: SharedAppState,
    bind_addr: &str,
    port: u16,
) -> Result<Arc<WsAdapter>, String> {
    let adapter = Arc::new(WsAdapter::new(app_state, bind_addr, port));
    let adapter_clone = adapter.clone();

    tokio::spawn(async move {
        if let Err(e) = adapter_clone.start().await {
            log::error!("WebSocket server error: {e}");
        }
    });

    Ok(adapter)
}
