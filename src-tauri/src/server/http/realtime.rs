#[cfg(feature = "gui")]
use crate::app_state::SharedAppState;
use crate::auth;
use crate::dispatch::dispatch_with_state;
#[cfg(feature = "gui")]
use crate::server::ws::ws_dispatch;
use axum::extract::ws::{Message as AxumWsMsg, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use std::net::SocketAddr;
#[cfg(feature = "gui")]
use tauri::Emitter;
use tokio::sync::broadcast;

use super::common::{cors_headers, is_authorized};

fn is_pi_live_forward_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "message_start"
            | "message_update"
            | "message_end"
            | "tool_execution_start"
            | "tool_execution_update"
            | "tool_execution_end"
            | "agent_start"
            | "agent_end"
            | "turn_start"
            | "turn_end"
            | "model_select"
            | "auto_compaction_start"
            | "auto_compaction_end"
            | "queue_update"
    )
}

pub(crate) async fn handle_preflight() -> impl IntoResponse {
    (StatusCode::NO_CONTENT, cors_headers())
}

pub(crate) async fn handle_sse(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let mut rx = app_state.subscribe_events();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(ws_event) => {
                    if ws_event.event == "sessions-changed" {
                        let data = serde_json::to_string(&ws_event.payload).unwrap_or_default();
                        yield Ok::<_, Infallible>(
                            SseEvent::default().event("sessions-changed").data(data)
                        );
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    log::warn!("SSE client lagged, skipped {skipped} events");
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    (
        [
            ("access-control-allow-origin", "*"),
            ("cache-control", "no-cache"),
        ],
        Sse::new(stream).keep_alive(KeepAlive::default()),
    )
        .into_response()
}

pub(crate) async fn handle_ws_upgrade(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    ws: WebSocketUpgrade,
) -> Response {
    let pre_authed = is_authorized(&addr.ip(), &headers, &uri);
    let needs_auth = auth::is_auth_required(&addr.ip());
    ws.on_upgrade(move |socket| handle_ws_connection(socket, app_state, pre_authed, needs_auth))
}

async fn handle_ws_connection(
    socket: WebSocket,
    app_state: SharedAppState,
    pre_authed: bool,
    needs_auth: bool,
) {
    let (mut tx, mut rx) = socket.split();

    if needs_auth && !pre_authed {
        let authed = match tokio::time::timeout(std::time::Duration::from_secs(10), rx.next()).await
        {
            Ok(Some(Ok(AxumWsMsg::Text(text)))) => serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|value| value.get("auth")?.as_str().map(String::from))
                .map(|token| auth::validate(&token))
                .unwrap_or(false),
            _ => false,
        };

        if !authed {
            let _ = tx
                .send(AxumWsMsg::Text(r#"{"error":"Unauthorized"}"#.into()))
                .await;
            let _ = tx.close().await;
            return;
        }
        let _ = tx.send(AxumWsMsg::Text(r#"{"auth":"ok"}"#.into())).await;
    }

    let mut event_rx = app_state.subscribe_events();

    // RPC command channel: receives commands from PiAgentRegistry.send_rpc()
    // and forwards them to this Pi CLI WebSocket connection.
    let (rpc_cmd_tx, mut rpc_cmd_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (rpc_resp_tx, _) = tokio::sync::broadcast::channel::<serde_json::Value>(16);

    // Track which Pi agent session is registered on this connection
    let mut registered_session_id: Option<String> = None;

    loop {
        tokio::select! {
            msg = rx.next() => {
                match msg {
                    Some(Ok(AxumWsMsg::Text(text))) => {
                        if text.contains("\"ping\"") {
                            if tx.send(AxumWsMsg::Text(r#"{"pong":true}"#.into())).await.is_err() {
                                break;
                            }
                            continue;
                        }

                        // ── Pi agent protocol: register ─────────────────────
                        if text.contains("\"type\"") && text.contains("\"register\"") {
                            if let Ok(register) = serde_json::from_str::<Value>(&text) {
                                let session_id = register["payload"]["sessionId"].as_str().unwrap_or("");
                                if !session_id.is_empty() {
                                    let session_path = register["payload"]["sessionPath"].as_str().map(|s| s.to_string());
                                    let pid = register["payload"]["pid"].as_u64().map(|p| p as u32);
                                    let cwd = register["payload"]["cwd"].as_str().map(|s| s.to_string());
                                    let entries = register["payload"]["entries"].as_array().cloned().unwrap_or_default();
                                    log::info!("[HTTP-WS] Pi agent registered: session={session_id}, pid={pid:?}, entries={}", entries.len());
                                    app_state.pi_agent_registry.register(session_id.to_string(), session_path, pid, cwd, entries);

                                    // Register RPC connection channels
                                    app_state.pi_agent_registry.register_connection(
                                        session_id.to_string(),
                                        rpc_cmd_tx.clone(),
                                        rpc_resp_tx.clone(),
                                    );
                                    registered_session_id = Some(session_id.to_string());

                                    let _ = app_state.event_tx.send(crate::app_state::WsEvent {
                                        event_type: "event".to_string(),
                                        event: "pi-live:session_registered".to_string(),
                                        payload: register["payload"].clone(),
                                    });
                                    let _ = app_state.app_handle.emit("pi-live:session_registered", &register["payload"]);
                                }
                            }
                            continue;
                        }

                        if let Ok(live_event) = serde_json::from_str::<Value>(&text) {
                            let event_type = live_event["type"].as_str().unwrap_or("");
                            if is_pi_live_forward_event(event_type) {
                                let session_id = live_event["sessionId"].as_str().unwrap_or("");
                                if !session_id.is_empty() {
                                    app_state.pi_agent_registry.record_entry(session_id, event_type);
                                    log::info!("[HTTP-WS] Pi live event: session={session_id}, event={event_type}");
                                    let _ = app_state.event_tx.send(crate::app_state::WsEvent {
                                        event_type: "event".to_string(),
                                        event: event_type.to_string(),
                                        payload: live_event.clone(),
                                    });
                                    let _ = app_state.app_handle.emit(event_type, &live_event);
                                    let _ = tx.send(AxumWsMsg::Text(r#"{"type":"ack"}"#.into())).await;
                                }
                                continue;
                            }
                        }

                        // ── Pi agent protocol: RPC response ─────────────────
                        if text.contains("\"type\"") && text.contains("\"response\"") {
                            log::info!("[HTTP-WS] Received potential RPC response: {text}");
                            if let Ok(resp) = serde_json::from_str::<Value>(&text) {
                                let s_id = resp["sessionId"].as_str().map(|s| s.to_string())
                                    .or_else(|| registered_session_id.clone());
                                if let Some(session_id) = s_id {
                                    log::info!("[HTTP-WS] Forwarding RPC response for session {session_id}, id={:?}, success={:?}", resp["id"], resp["success"]);
                                    app_state.pi_agent_registry.forward_response(&session_id, resp);
                                } else {
                                    log::warn!("[HTTP-WS] Received RPC response but no session_id matched for forwarding: {text}");
                                }
                            }
                            continue;
                        }

                        // ── Pi agent protocol: session state update ─────────
                        if text.contains("\"type\"") && text.contains("\"session_state\"") {
                            if let Ok(state_msg) = serde_json::from_str::<Value>(&text) {
                                if let Some(session_id) = state_msg["payload"]["sessionId"].as_str() {
                                    let model = state_msg["payload"]["model"].clone();
                                    let available_models = state_msg["payload"]["availableModels"]
                                        .as_array()
                                        .cloned();
                                    let thinking_level = state_msg["payload"]["thinkingLevel"].as_str().map(|s| s.to_string());
                                    let context_usage = state_msg["payload"]["contextUsage"].clone();
                                    app_state.pi_agent_registry.update_session_state(
                                        session_id,
                                        if model.is_null() { None } else { Some(model) },
                                        available_models,
                                        thinking_level,
                                        if context_usage.is_null() { None } else { Some(context_usage) },
                                    );
                                    // Also broadcast session_state to frontend
                                    let _ = app_state.event_tx.send(crate::app_state::WsEvent {
                                        event_type: "event".to_string(),
                                        event: "pi-live:state_updated".to_string(),
                                        payload: state_msg["payload"].clone(),
                                    });
                                    let _ = app_state.app_handle.emit("pi-live:state_updated", &state_msg["payload"]);
                                }
                            }
                            continue;
                        }

                        #[derive(Deserialize)]
                        struct WsReq {
                            id: String,
                            command: String,
                            #[serde(default)]
                            payload: Value,
                        }

                        match serde_json::from_str::<WsReq>(&text) {
                            Ok(req) => {
                                let result = dispatch_with_state(&Some(app_state.clone()), &req.command, &req.payload).await;
                                let response = match result {
                                    Ok(data) => json!({
                                        "id": req.id,
                                        "command": req.command,
                                        "success": true,
                                        "data": data,
                                    }),
                                    Err(error) => json!({
                                        "id": req.id,
                                        "command": req.command,
                                        "success": false,
                                        "error": error,
                                    }),
                                };
                                if tx.send(AxumWsMsg::Text(response.to_string())).await.is_err() {
                                    break;
                                }
                            }
                            Err(error) => {
                                let response = json!({
                                    "id": "unknown",
                                    "command": "unknown",
                                    "success": false,
                                    "error": format!("Invalid request: {error}"),
                                });
                                if tx.send(AxumWsMsg::Text(response.to_string())).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Some(Ok(AxumWsMsg::Ping(data))) => {
                        let _ = tx.send(AxumWsMsg::Pong(data)).await;
                    }
                    Some(Ok(AxumWsMsg::Close(_))) | None => break,
                    Some(Err(error)) => {
                        let message = error.to_string();
                        if !message.contains("Connection reset") && !message.contains("Broken pipe") {
                            log::warn!("WebSocket error: {message}");
                        }
                        break;
                    }
                    _ => {}
                }
            }
            event = event_rx.recv() => {
                match event {
                    Ok(ws_event) => {
                        let text = serde_json::to_string(&ws_event).unwrap_or_default();
                        if tx.send(AxumWsMsg::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        log::debug!("WS event channel lagged by {skipped}");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            // Forward RPC commands from PiAgentRegistry to this WebSocket
            rpc_cmd = rpc_cmd_rx.recv() => {
                match rpc_cmd {
                    Some(cmd) => {
                        if tx.send(AxumWsMsg::Text(cmd)).await.is_err() {
                            break;
                        }
                    }
                    None => {
                        // Channel closed, RPC connection dropped
                        break;
                    }
                }
            }
        }
    }

    // Cleanup: remove RPC connection on disconnect
    if let Some(sid) = &registered_session_id {
        log::info!("[HTTP-WS] Pi agent disconnected: session={sid}");
        app_state.pi_agent_registry.remove(sid);

        let ws_event = crate::app_state::WsEvent {
            event_type: "event".to_string(),
            event: "pi-live:session_disconnected".to_string(),
            payload: serde_json::json!({ "sessionId": sid }),
        };
        let _ = app_state.event_tx.send(ws_event.clone());
        let _ = app_state
            .app_handle
            .emit("pi-live:session_disconnected", &ws_event.payload);
    }
}
