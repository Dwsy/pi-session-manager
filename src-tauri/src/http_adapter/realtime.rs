use crate::app_state::SharedAppState;
use crate::auth;
use crate::ws_adapter::dispatch;
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
use tokio::sync::broadcast;

use super::common::{cors_headers, is_authorized};

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

                        #[derive(Deserialize)]
                        struct WsReq {
                            id: String,
                            command: String,
                            #[serde(default)]
                            payload: Value,
                        }

                        match serde_json::from_str::<WsReq>(&text) {
                            Ok(req) => {
                                let result = dispatch(&app_state, &req.command, &req.payload).await;
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
        }
    }
}
