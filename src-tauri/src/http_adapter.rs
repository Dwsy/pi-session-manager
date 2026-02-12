use crate::app_state::SharedAppState;
use crate::auth;
use crate::ws_adapter::dispatch;
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::SocketAddr;

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

async fn handle_command(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    Json(req): Json<HttpRequest>,
) -> impl IntoResponse {
    if auth::is_auth_required(&addr.ip()) {
        let valid = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(auth::validate)
            .unwrap_or(false);

        if !valid {
            return (
                StatusCode::UNAUTHORIZED,
                cors_headers(),
                Json(HttpResponse {
                    success: false,
                    data: None,
                    error: Some("Unauthorized".to_string()),
                }),
            );
        }
    }

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
    (StatusCode::OK, cors_headers(), Json(resp))
}

async fn handle_preflight() -> impl IntoResponse {
    (StatusCode::NO_CONTENT, cors_headers())
}

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

pub async fn init_http_adapter(app_state: SharedAppState, port: u16) -> Result<(), String> {
    let has_frontend = FrontendAssets::get("index.html").is_some();
    if has_frontend {
        log::info!("Frontend assets embedded in binary");
    } else {
        log::warn!("No embedded frontend assets, API-only mode");
    }

    let app = Router::new()
        .route("/api", post(handle_command).options(handle_preflight))
        .fallback(get(serve_static))
        .with_state(app_state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind HTTP: {e}"))?;

    log::info!("HTTP server listening on http://{addr}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .map_err(|e| format!("HTTP server error: {e}"))
}
