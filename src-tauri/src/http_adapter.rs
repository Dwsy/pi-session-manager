use crate::app_state::SharedAppState;
use crate::auth;
use crate::ws_adapter::dispatch;
use axum::body::Body;
use axum::extract::ws::{Message as AxumWsMsg, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::stream::Stream;
use futures_util::{SinkExt, StreamExt};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::convert::Infallible;
use std::net::SocketAddr;
use tokio::sync::broadcast;

#[derive(Embed)]
#[folder = "../dist"]
struct FrontendAssets;

#[derive(Deserialize)]
struct HttpRequest {
    command: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Serialize)]
struct HttpResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn cors_headers() -> [(&'static str, &'static str); 3] {
    [
        ("access-control-allow-origin", "*"),
        ("access-control-allow-methods", "GET, POST, OPTIONS"),
        (
            "access-control-allow-headers",
            "content-type, authorization",
        ),
    ]
}

fn query_param(uri: &Uri, key: &str) -> Option<String> {
    uri.query().and_then(|q| {
        q.split('&').find_map(|pair| {
            let mut it = pair.splitn(2, '=');
            let k = it.next()?;
            let v = it.next().unwrap_or("");
            (k == key).then(|| v.to_string())
        })
    })
}

fn is_authorized(ip: &std::net::IpAddr, headers: &HeaderMap, uri: &Uri) -> bool {
    if !auth::is_auth_required(ip) {
        return true;
    }
    let header_ok = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(auth::validate)
        .unwrap_or(false);
    if header_ok {
        return true;
    }
    query_param(uri, "token")
        .as_deref()
        .map(auth::validate)
        .unwrap_or(false)
}

// ─── HTTP POST /api ──────────────────────────────────────────

fn accepts_gzip(headers: &HeaderMap) -> bool {
    headers
        .get("accept-encoding")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_lowercase().contains("gzip"))
        .unwrap_or(false)
}

async fn handle_command(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<HttpRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(HttpResponse {
                success: false,
                data: None,
                error: Some("Unauthorized".to_string()),
            }),
        )
            .into_response();
    }

    let gzip_requested = accepts_gzip(&headers);
    // 服务端强制压缩开关：设置环境变量 PSM_FORCE_GZIP=1 可强制启用压缩
    let force_gzip = std::env::var("PSM_FORCE_GZIP").unwrap_or_default() == "1";
    let gzip_enabled = gzip_requested || force_gzip;

    log::debug!(
        "HTTP request: gzip_requested={}, force_gzip={}, accept_encoding={:?}",
        gzip_requested,
        force_gzip,
        headers.get("accept-encoding")
    );

    let result = dispatch(&app_state, &req.command, &req.payload).await;
    let resp = match result {
        Ok(data) => HttpResponse {
            success: true,
            data: Some(data),
            error: None,
        },
        Err(e) => HttpResponse {
            success: false,
            data: None,
            error: Some(e),
        },
    };

    // 检查请求中是否有压缩开关参数（优先于 Accept-Encoding）
    let compression_disabled = query_param(&uri, "no_gzip").is_some()
        || query_param(&uri, "disable_compression").is_some();

    if gzip_enabled && !compression_disabled {
        if let Ok(json_bytes) = serde_json::to_vec(&resp) {
            match crate::compression::gzip_compress(&json_bytes) {
                Ok(compressed) => {
                    log::debug!(
                        "Gzip compressed: {} bytes -> {} bytes",
                        json_bytes.len(),
                        compressed.len()
                    );
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header("access-control-allow-origin", "*")
                        .header("access-control-allow-methods", "GET, POST, OPTIONS")
                        .header(
                            "access-control-allow-headers",
                            "content-type, authorization",
                        )
                        .header("content-type", "application/json")
                        .header("content-encoding", "gzip")
                        .body(Body::from(compressed))
                        .unwrap()
                        .into_response();
                }
                Err(e) => {
                    log::warn!("Gzip compression failed: {e}");
                }
            }
        }
    }

    (StatusCode::OK, cors_headers(), Json(resp)).into_response()
}

async fn handle_preflight() -> impl IntoResponse {
    (StatusCode::NO_CONTENT, cors_headers())
}

// ─── SSE /api/events ─────────────────────────────────────────

async fn handle_sse(
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
                        let data = serde_json::to_string(&ws_event.payload)
                            .unwrap_or_default();
                        yield Ok::<_, Infallible>(SseEvent::default()
                            .event("sessions-changed")
                            .data(data));
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("SSE client lagged, skipped {n} events");
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

// ─── WebSocket /ws ───────────────────────────────────────────

async fn handle_ws_upgrade(
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

    // Auth: pre-authed via query param, or need first message with { auth: "token" }
    if needs_auth && !pre_authed {
        let authed = match tokio::time::timeout(std::time::Duration::from_secs(10), rx.next()).await
        {
            Ok(Some(Ok(AxumWsMsg::Text(text)))) => serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v.get("auth")?.as_str().map(String::from))
                .map(|t| auth::validate(&t))
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
                            if tx.send(AxumWsMsg::Text(r#"{"pong":true}"#.into())).await.is_err() { break; }
                            continue;
                        }

                        #[derive(Deserialize)]
                        struct WsReq { id: String, command: String, #[serde(default)] payload: Value }

                        match serde_json::from_str::<WsReq>(&text) {
                            Ok(req) => {
                                let result = dispatch(&app_state, &req.command, &req.payload).await;
                                let resp = match result {
                                    Ok(data) => serde_json::json!({ "id": req.id, "command": req.command, "success": true, "data": data }),
                                    Err(e) => serde_json::json!({ "id": req.id, "command": req.command, "success": false, "error": e }),
                                };
                                if tx.send(AxumWsMsg::Text(resp.to_string())).await.is_err() { break; }
                            }
                            Err(e) => {
                                let resp = serde_json::json!({ "id": "unknown", "command": "unknown", "success": false, "error": format!("Invalid request: {e}") });
                                if tx.send(AxumWsMsg::Text(resp.to_string())).await.is_err() { break; }
                            }
                        }
                    }
                    Some(Ok(AxumWsMsg::Ping(data))) => {
                        let _ = tx.send(AxumWsMsg::Pong(data)).await;
                    }
                    Some(Ok(AxumWsMsg::Close(_))) | None => break,
                    Some(Err(e)) => {
                        let msg = e.to_string();
                        if !msg.contains("Connection reset") && !msg.contains("Broken pipe") {
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
                        let text = serde_json::to_string(&ws_event).unwrap_or_default();
                        if tx.send(AxumWsMsg::Text(text)).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        log::debug!("WS event channel lagged by {n}");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

// ─── Static files ────────────────────────────────────────────

fn serve_embedded(path: &str) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    match FrontendAssets::get(path) {
        Some(file) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, mime.as_ref())],
            file.data.to_vec(),
        )
            .into_response(),
        None => match FrontendAssets::get("index.html") {
            Some(file) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/html")],
                file.data.to_vec(),
            )
                .into_response(),
            None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
        },
    }
}

async fn serve_static(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return serve_embedded("index.html");
    }
    serve_embedded(path)
}

// ─── Init ────────────────────────────────────────────────────

pub async fn init_http_adapter(
    app_state: SharedAppState,
    bind_addr: &str,
    port: u16,
) -> Result<(), String> {
    init_http_adapter_with_options(app_state, bind_addr, port, true).await
}

pub async fn init_http_adapter_with_options(
    app_state: SharedAppState,
    bind_addr: &str,
    port: u16,
    serve_frontend: bool,
) -> Result<(), String> {
    let has_frontend = FrontendAssets::get("index.html").is_some();

    if serve_frontend {
        if has_frontend {
            log::info!("Frontend assets embedded in binary");
        } else {
            log::warn!("No embedded frontend assets, API-only mode");
        }
    } else {
        log::info!("HTTP adapter in API-only mode (GUI dev mode)");
    }

    let mut app = Router::new()
        .route("/api", post(handle_command).options(handle_preflight))
        .route("/api/events", get(handle_sse))
        .route("/ws", get(handle_ws_upgrade))
        .with_state(app_state);

    // Only serve static files in CLI mode or production GUI mode
    if serve_frontend {
        app = app.fallback(get(serve_static));
    }

    let addr = format!("{bind_addr}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind HTTP: {e}"))?;

    log::info!("HTTP+WS server listening on http://{addr}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .map_err(|e| format!("HTTP server error: {e}"))
}
