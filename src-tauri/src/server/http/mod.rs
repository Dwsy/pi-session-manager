#[cfg(feature = "gui")]
use crate::app_state::SharedAppState;
use crate::auth;
use crate::dispatch::dispatch_with_state;
#[cfg(feature = "gui")]
use crate::server::ws::ws_dispatch;
use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use std::net::SocketAddr;

mod common;
#[cfg(feature = "gui")]
mod embedding;
mod plugin_records;
mod readonly_routes;
mod realtime;
mod sessions;
mod static_assets;

async fn handle_command(ConnectInfo(addr): ConnectInfo<SocketAddr>, State(app_state): State<SharedAppState>, headers: HeaderMap, uri: Uri, Json(req): Json<common::HttpRequest>) -> impl IntoResponse {
    if !auth::origin_allowed(headers.get("origin").and_then(|value| value.to_str().ok()), headers.get("host").and_then(|value| value.to_str().ok())) {
        return (StatusCode::FORBIDDEN, common::cors_headers(), Json(common::HttpResponse { success: false, data: None, error: Some("Forbidden origin".to_string()) })).into_response();
    }
    if !common::is_authorized(&addr.ip(), &headers, &uri) {
        return (StatusCode::UNAUTHORIZED, common::cors_headers(), Json(common::HttpResponse { success: false, data: None, error: Some("Unauthorized".to_string()) })).into_response();
    }

    if auth::is_terminal_command(&req.command) && !auth::terminal_capability_allowed(addr.ip(), headers.get("origin").is_some(), auth::origin_allowed(headers.get("origin").and_then(|value| value.to_str().ok()), headers.get("host").and_then(|value| value.to_str().ok())), auth::auth_required(), true, true) {
        return common::json_error_response(StatusCode::FORBIDDEN, "Terminal capability denied");
    }
    let gzip_requested = common::accepts_gzip(&headers);
    let force_gzip = std::env::var("PSM_FORCE_GZIP").unwrap_or_default() == "1";
    let gzip_enabled = gzip_requested || force_gzip;

    log::debug!("HTTP request: gzip_requested={}, force_gzip={}, accept_encoding={:?}", gzip_requested, force_gzip, headers.get("accept-encoding"));

    let result = dispatch_with_state(&Some(app_state.clone()), &req.command, &req.payload).await;
    let resp = match result {
        Ok(data) => common::HttpResponse { success: true, data: Some(data), error: None },
        Err(error) => common::HttpResponse { success: false, data: None, error: Some(error) },
    };

    let compression_disabled = uri.query().is_some_and(|query| query.split('&').any(|pair| pair.split('=').next().is_some_and(|key| matches!(key, "no_gzip" | "disable_compression"))));

    if gzip_enabled && !compression_disabled {
        if let Ok(json_bytes) = serde_json::to_vec(&resp) {
            match crate::compression::gzip_compress(&json_bytes) {
                Ok(compressed) => {
                    log::debug!("Gzip compressed: {} bytes -> {} bytes", json_bytes.len(), compressed.len());
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header("access-control-allow-origin", "http://localhost:1420")
                        .header("access-control-allow-methods", "GET, POST, OPTIONS")
                        .header("access-control-allow-headers", "content-type, authorization")
                        .header("vary", "Origin")
                        .header("content-type", "application/json")
                        .header("content-encoding", "gzip")
                        .body(Body::from(compressed))
                        .expect("build gzip response")
                        .into_response();
                }
                Err(error) => {
                    log::warn!("Gzip compression failed: {error}");
                }
            }
        }
    }

    (StatusCode::OK, common::cors_headers(), Json(resp)).into_response()
}

async fn handle_metrics() -> impl IntoResponse {
    let metrics_text = crate::metrics::render();
    ([(header::CONTENT_TYPE, "text/plain; version=0.0.4")], metrics_text)
}

pub async fn init_http_adapter(app_state: SharedAppState, bind_addr: &str, port: u16) -> Result<(), String> {
    init_http_adapter_with_options(app_state, bind_addr, port, true).await
}

pub async fn init_http_adapter_with_options(app_state: SharedAppState, bind_addr: &str, port: u16, serve_frontend: bool) -> Result<(), String> {
    init_http_adapter_with_embedding(app_state, bind_addr, port, serve_frontend, None).await
}

pub async fn init_http_adapter_with_embedding(app_state: SharedAppState, bind_addr: &str, port: u16, serve_frontend: bool, embedding_service: Option<std::sync::Arc<crate::data::search::embedding::EmbeddingService>>) -> Result<(), String> {
    let has_frontend = static_assets::has_frontend_assets(&app_state);

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
        .route("/api", post(handle_command).options(realtime::handle_preflight))
        .route("/api/events", get(realtime::handle_sse))
        .route("/v1/events", get(realtime::handle_sse))
        .route("/v1/sessions", get(sessions::v1_list_sessions))
        .route("/v1/sessions/{id}/entries", get(sessions::v1_get_session_entries))
        .route("/v1/sessions/{id}/snapshot", get(sessions::v1_session_snapshot))
        .route("/v1/sessions/{id}/checkout", post(sessions::v1_checkout_session))
        .route("/v1/sessions/{id}/milestones", post(sessions::v1_create_milestone).get(sessions::v1_list_milestones))
        .route("/v1/plugin-records", get(plugin_records::v1_list_plugin_records).post(plugin_records::v1_upsert_plugin_record))
        .route("/v1/plugin-records/search", post(plugin_records::v1_search_plugin_records))
        .route("/v1/plugin-records/session-intelligence/refresh", post(plugin_records::v1_refresh_session_intelligence_record))
        .route("/v1/plugin-records/{id}", get(plugin_records::v1_get_plugin_record))
        .route("/v1/search/fulltext", post(readonly_routes::v1_full_text_search))
        .route("/v1/memory/recall", post(readonly_routes::v1_memory_recall))
        .route("/v1/memory/unified", post(readonly_routes::v1_memory_unified))
        .route("/v1/experience/extract", post(readonly_routes::v1_experience_extract))
        .route("/v1/workflow/route-suggest", post(readonly_routes::v1_workflow_route_suggest))
        .route("/v1/analytics/overview", get(readonly_routes::v1_analytics_overview))
        .route("/v1/observability/summary", get(readonly_routes::v1_observability_summary))
        .route("/ws", get(realtime::handle_ws_upgrade))
        .route("/metrics", get(handle_metrics));

    if let Some(svc) = embedding_service {
        log::info!("Embedding service enabled");
        app = app.route("/v1/embedding", post(embedding::v1_embedding_handler)).route("/v1/embedding/batch", post(embedding::v1_embedding_batch_handler)).route("/v1/embedding/status", get(embedding::v1_embedding_status_handler)).layer(axum::Extension(svc));
    }

    if serve_frontend {
        app = app.fallback(get(static_assets::serve_static));
    }
    let app = app.with_state(app_state);

    let addr = format!("{bind_addr}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|error| format!("Failed to bind HTTP: {error}"))?;

    log::info!("HTTP+WS server listening on http://{addr}");

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.map_err(|error| format!("HTTP server error: {error}"))
}
