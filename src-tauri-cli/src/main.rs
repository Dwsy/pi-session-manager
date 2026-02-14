use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, error};
use axum::{
    Router, routing::{get, post}, Json,
    extract::{ws::{Message as AxumWsMsg, WebSocket, WebSocketUpgrade}, ConnectInfo, State},
    response::{IntoResponse, Response},
    http::{HeaderMap, StatusCode, header, Uri},
};
use rust_embed::Embed;
use serde_json::Value;
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;

#[derive(Embed)]
#[folder = "../dist/"]
struct FrontendAssets;

#[derive(Debug, Clone, serde::Serialize)]
pub struct WsEvent {
    pub event_type: String,
    pub event: String,
    pub payload: Value,
}

pub struct AppState {
    pub event_tx: broadcast::Sender<WsEvent>,
}

pub type SharedState = Arc<AppState>;

#[derive(Debug, Clone, serde::Deserialize)]
struct ServerConfig {
    #[serde(default = "default_true")]
    http_enabled: bool,
    #[serde(default = "default_http_port")]
    http_port: u16,
    #[serde(default = "default_bind")]
    bind_addr: String,
    #[serde(default)]
    auth_enabled: bool,
    #[serde(default)]
    ws_enabled: bool,
    #[serde(default)]
    ws_port: u16,
}

fn default_true() -> bool { true }
fn default_http_port() -> u16 { 52131 }
fn default_bind() -> String { "0.0.0.0".to_string() }

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            http_enabled: true,
            http_port: 52131,
            bind_addr: "0.0.0.0".to_string(),
            auth_enabled: false,
            ws_enabled: false,
            ws_port: 0,
        }
    }
}

fn load_config() -> ServerConfig {
    let config_path = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .join("pi-session-manager.json");
    std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
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
    let real_ip = get_real_ip(ip, headers);
    if !pi_session_manager::auth::is_auth_required(&real_ip) {
        return true;
    }
    let header_ok = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(pi_session_manager::auth::validate)
        .unwrap_or(false);
    if header_ok { return true; }
    query_param(uri, "token")
        .as_deref()
        .map(pi_session_manager::auth::validate)
        .unwrap_or(false)
}

/// Extract real client IP from X-Forwarded-For (ngrok/reverse proxy) or use socket IP
fn get_real_ip(socket_ip: &std::net::IpAddr, headers: &HeaderMap) -> std::net::IpAddr {
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            if let Ok(ip) = first.trim().parse::<std::net::IpAddr>() {
                return ip;
            }
        }
    }
    *socket_ip
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let config = load_config();
    let (event_tx, _) = broadcast::channel(100);
    let state = Arc::new(AppState { event_tx });

    info!("🚀 Pi Session Manager — CLI Mode");
    info!("═══════════════════════════════════════");

    // Init auth
    if config.auth_enabled {
        match pi_session_manager::auth::init() {
            Ok(token) => info!("🔑 Auth enabled, token: {token}"),
            Err(e) => error!("Failed to init auth: {e}"),
        }
    } else {
        info!("🔓 Auth disabled (set auth_enabled=true in config)");
    }

    let addr = format!("{}:{}", config.bind_addr, config.http_port);
    info!("🌐 http://{addr}  (API + WS + Frontend)");
    info!("═══════════════════════════════════════");

    let s = state.clone();
    let handle = tokio::spawn(async move {
        if let Err(e) = run_server(s, &addr).await {
            error!("Server error: {e}");
        }
    });

    tokio::select! {
        _ = tokio::signal::ctrl_c() => info!("👋 Shutting down..."),
        r = handle => { if let Err(e) = r { error!("Server task failed: {e}"); } }
    }
}

// ─── Handlers ───────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct ApiReq { command: String, #[serde(default)] payload: Value }

async fn api_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(_state): State<SharedState>,
    headers: HeaderMap,
    uri: Uri,
    Json(body): Json<ApiReq>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        );
    }
    let result = pi_session_manager::dispatch::dispatch(&body.command, &body.payload).await;
    let resp = match result {
        Ok(data) => serde_json::json!({ "success": true, "data": data }),
        Err(e) => serde_json::json!({ "success": false, "error": e }),
    };
    (StatusCode::OK, cors_headers(), Json(resp))
}

async fn preflight_handler() -> impl IntoResponse {
    (StatusCode::NO_CONTENT, cors_headers())
}

async fn auth_check(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    let real_ip = get_real_ip(&addr.ip(), &headers);
    let needs_auth = pi_session_manager::auth::is_auth_required(&real_ip);
    let is_valid = is_authorized(&addr.ip(), &headers, &uri);
    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "needsAuth": needs_auth,
            "authenticated": is_valid,
        })),
    )
}

async fn health_handler() -> Json<Value> {
    Json(serde_json::json!({ "status": "ok", "version": env!("CARGO_PKG_VERSION"), "mode": "cli" }))
}

async fn ws_upgrade(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<SharedState>,
    headers: HeaderMap,
    uri: Uri,
    ws: WebSocketUpgrade,
) -> Response {
    let pre_authed = is_authorized(&addr.ip(), &headers, &uri);
    let real_ip = get_real_ip(&addr.ip(), &headers);
    let needs_auth = pi_session_manager::auth::is_auth_required(&real_ip);
    ws.on_upgrade(move |socket| handle_ws(socket, state, pre_authed, needs_auth))
}

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if !path.is_empty() {
        if let Some(file) = FrontendAssets::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            return (StatusCode::OK, [(header::CONTENT_TYPE, mime.as_ref())], file.data).into_response();
        }
    }
    match FrontendAssets::get("index.html") {
        Some(f) => (StatusCode::OK, [(header::CONTENT_TYPE, "text/html")], f.data).into_response(),
        None => (StatusCode::NOT_FOUND, "Frontend not embedded").into_response(),
    }
}

// ─── Unified server ─────────────────────────────────────────

async fn run_server(state: SharedState, addr: &str) -> Result<(), Box<dyn std::error::Error>> {

    let app = Router::new()
        .route("/api/auth-check", get(auth_check).options(preflight_handler))
        .route("/api", post(api_handler).options(preflight_handler))
        .route("/health", get(health_handler))
        .route("/ws", get(ws_upgrade))
        .fallback(static_handler)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("Server listening on {addr}");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    Ok(())
}

fn cors_headers() -> [(&'static str, &'static str); 3] {
    [
        ("access-control-allow-origin", "*"),
        ("access-control-allow-methods", "GET, POST, OPTIONS"),
        ("access-control-allow-headers", "content-type, authorization"),
    ]
}

// ─── WebSocket handler ──────────────────────────────────────

async fn handle_ws(socket: WebSocket, state: SharedState, pre_authed: bool, needs_auth: bool) {
    let (mut tx, mut rx) = socket.split();

    // Auth handshake if needed
    if needs_auth && !pre_authed {
        let authed = match tokio::time::timeout(std::time::Duration::from_secs(10), rx.next()).await {
            Ok(Some(Ok(AxumWsMsg::Text(text)))) => {
                serde_json::from_str::<Value>(&text)
                    .ok()
                    .and_then(|v| v.get("auth")?.as_str().map(String::from))
                    .map(|t| pi_session_manager::auth::validate(&t))
                    .unwrap_or(false)
            }
            _ => false,
        };
        if !authed {
            let _ = tx.send(AxumWsMsg::Text(r#"{"error":"Unauthorized"}"#.into())).await;
            let _ = tx.close().await;
            return;
        }
        let _ = tx.send(AxumWsMsg::Text(r#"{"auth":"ok"}"#.into())).await;
    }

    let mut event_rx = state.event_tx.subscribe();

    loop {
        tokio::select! {
            msg = rx.next() => {
                match msg {
                    Some(Ok(AxumWsMsg::Text(text))) => {
                        if text.contains("\"ping\"") {
                            if tx.send(AxumWsMsg::Text(r#"{"pong":true}"#.into())).await.is_err() { break; }
                            continue;
                        }
                        if text.contains("\"auth\"") {
                            let _ = tx.send(AxumWsMsg::Text(r#"{"auth":"ok"}"#.into())).await;
                            continue;
                        }

                        #[derive(serde::Deserialize)]
                        struct WsReq { id: String, command: String, #[serde(default)] payload: Value }

                        match serde_json::from_str::<WsReq>(&text) {
                            Ok(req) => {
                                let result = pi_session_manager::dispatch::dispatch(&req.command, &req.payload).await;
                                let resp = match result {
                                    Ok(data) => serde_json::json!({ "id": req.id, "command": req.command, "success": true, "data": data }),
                                    Err(e) => serde_json::json!({ "id": req.id, "command": req.command, "success": false, "error": e }),
                                };
                                if tx.send(AxumWsMsg::Text(resp.to_string())).await.is_err() { break; }
                            }
                            Err(e) => {
                                let resp = serde_json::json!({ "id": "unknown", "success": false, "error": format!("Invalid request: {e}") });
                                if tx.send(AxumWsMsg::Text(resp.to_string())).await.is_err() { break; }
                            }
                        }
                    }
                    Some(Ok(AxumWsMsg::Ping(data))) => { let _ = tx.send(AxumWsMsg::Pong(data)).await; }
                    Some(Ok(AxumWsMsg::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            evt = event_rx.recv() => {
                if let Ok(e) = evt {
                    let msg = serde_json::json!({ "event_type": e.event_type, "event": e.event, "payload": e.payload });
                    if tx.send(AxumWsMsg::Text(msg.to_string())).await.is_err() { break; }
                }
            }
        }
    }
}
