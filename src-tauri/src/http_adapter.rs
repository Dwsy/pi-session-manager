use crate::app_state::SharedAppState;
use crate::auth;
use crate::ws_adapter::dispatch;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::services::ServeDir;

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
        ("access-control-allow-methods", "POST, OPTIONS"),
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
    // Non-local requests require Bearer token (if auth enabled)
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

async fn serve_index() -> impl IntoResponse {
    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi Session Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #eaeaea;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        h1 { font-size: 2.5rem; margin-bottom: 1rem; color: #00d4aa; }
        .status {
            background: rgba(0, 212, 170, 0.1);
            border: 1px solid rgba(0, 212, 170, 0.3);
            padding: 1rem 2rem;
            border-radius: 8px;
            margin: 1rem 0;
        }
        .endpoints {
            margin-top: 2rem;
            text-align: left;
            background: rgba(0,0,0,0.3);
            padding: 1.5rem;
            border-radius: 12px;
        }
        .endpoints h3 { margin-bottom: 1rem; color: #00d4aa; }
        .endpoints ul { list-style: none; }
        .endpoints li { margin: 0.5rem 0; font-family: monospace; }
        .endpoints code {
            background: rgba(255,255,255,0.1);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Pi Session Manager</h1>
        <div class="status">✅ Server is running</div>
        <div class="endpoints">
            <h3>Available Endpoints</h3>
            <ul>
                <li>📡 <code>WS ws://0.0.0.0:52130</code></li>
                <li>🔌 <code>HTTP POST /api</code></li>
            </ul>
        </div>
    </div>
</body>
</html>"#;
    Html(html)
}

pub async fn init_http_adapter(app_state: SharedAppState, port: u16) -> Result<(), String> {
    // Try to find dist directory - first check relative to binary, then current dir
    let dist_path = if std::path::Path::new("../dist").exists() {
        PathBuf::from("../dist")
    } else if std::path::Path::new("./dist").exists() {
        PathBuf::from("./dist")
    } else {
        PathBuf::new() // Empty path - static file service won't work
    };

    let has_static_files = dist_path.exists() && dist_path.is_dir();

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/api", post(handle_command).options(handle_preflight))
        .with_state(app_state);

    // Add static file service if dist exists
    let app = if has_static_files {
        log::info!("Serving static files from: {}", dist_path.display());
        app.fallback_service(ServeDir::new(dist_path).append_index_html_on_directories(true))
    } else {
        log::warn!("No dist directory found, API-only mode");
        app
    };

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
