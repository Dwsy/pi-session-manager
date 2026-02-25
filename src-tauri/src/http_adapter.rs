use crate::app_state::SharedAppState;
use crate::auth;
use crate::ws_adapter::dispatch;
use axum::body::Body;
use axum::extract::ws::{Message as AxumWsMsg, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
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

#[derive(Deserialize, Default)]
struct SessionsQuery {
    limit: Option<usize>,
    q: Option<String>,
    cwd: Option<String>,
    project: Option<String>,
    from: Option<String>,
    to: Option<String>,
}

#[derive(Deserialize)]
struct FullTextSearchRequest {
    query: String,
    #[serde(default)]
    role_filter: Option<String>,
    #[serde(default)]
    glob_pattern: Option<String>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    page: Option<usize>,
    #[serde(default)]
    page_size: Option<usize>,
    #[serde(default)]
    match_mode: Option<String>,
}

#[derive(Deserialize)]
struct MemoryRecallRequest {
    query: String,
    #[serde(default)]
    top_k: Option<usize>,
    #[serde(default)]
    role_filter: Option<String>,
    #[serde(default)]
    glob_pattern: Option<String>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
}

#[derive(Deserialize)]
struct MilestoneCreateRequest {
    name: String,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    icon: Option<String>,
}

#[derive(Deserialize)]
struct CheckoutRequest {
    target_type: String,
    target_value: String,
    #[serde(default)]
    strategy: Option<String>,
    #[serde(default)]
    carryover_message: Option<String>,
}

#[derive(Deserialize)]
struct ExperienceExtractRequest {
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
}

#[derive(Deserialize)]
struct WorkflowRouteSuggestRequest {
    query: String,
    #[serde(default)]
    top_k: Option<usize>,
    #[serde(default)]
    role_filter: Option<String>,
    #[serde(default)]
    glob_pattern: Option<String>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
}

#[derive(Deserialize)]
struct MemoryUnifiedRequest {
    query: String,
    #[serde(default)]
    top_k: Option<usize>,
    #[serde(default)]
    role_filter: Option<String>,
    #[serde(default)]
    glob_pattern: Option<String>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    experience_limit: Option<usize>,
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

fn parse_time_opt(input: &Option<String>) -> Result<Option<DateTime<Utc>>, String> {
    match input {
        Some(s) if !s.trim().is_empty() => DateTime::parse_from_rfc3339(s)
            .map(|dt| Some(dt.with_timezone(&Utc)))
            .map_err(|e| format!("Invalid time format '{s}': {e}")),
        _ => Ok(None),
    }
}

fn session_matches_scope(
    session: &crate::models::SessionInfo,
    project: Option<&str>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> bool {
    if let Some(p) = project {
        let p = p.to_lowercase();
        let hit = session.cwd.to_lowercase().contains(&p)
            || session.path.to_lowercase().contains(&p)
            || session
                .name
                .as_ref()
                .map(|n| n.to_lowercase().contains(&p))
                .unwrap_or(false);
        if !hit {
            return false;
        }
    }

    if let Some(from_t) = from {
        if session.modified < from_t {
            return false;
        }
    }
    if let Some(to_t) = to {
        if session.modified > to_t {
            return false;
        }
    }
    true
}

fn hit_matches_scope(
    hit: &crate::models::FullTextSearchHit,
    project: Option<&str>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> bool {
    if let Some(p) = project {
        if !hit.session_path.to_lowercase().contains(&p.to_lowercase()) {
            return false;
        }
    }
    if let Some(from_t) = from {
        if hit.timestamp < from_t {
            return false;
        }
    }
    if let Some(to_t) = to {
        if hit.timestamp > to_t {
            return false;
        }
    }
    true
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
    // Server-side force compression switch: set env PSM_FORCE_GZIP=1 to force enable compression
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

    // Check if request has compression switch parameter (takes precedence over Accept-Encoding)
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

async fn v1_list_sessions(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    Query(query): Query<SessionsQuery>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let from = match parse_time_opt(&query.from) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let to = match parse_time_opt(&query.to) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let result = dispatch(&app_state, "scan_sessions", &serde_json::json!({})).await;
    match result {
        Ok(data) => {
            let mut sessions: Vec<crate::models::SessionInfo> =
                serde_json::from_value(data).unwrap_or_default();

            if let Some(cwd) = query.cwd {
                sessions.retain(|s| s.cwd == cwd);
            }

            if let Some(q) = query.q {
                let q = q.to_lowercase();
                sessions.retain(|s| {
                    s.id.to_lowercase().contains(&q)
                        || s.path.to_lowercase().contains(&q)
                        || s.name
                            .as_ref()
                            .map(|n| n.to_lowercase().contains(&q))
                            .unwrap_or(false)
                        || s.first_message.to_lowercase().contains(&q)
                });
            }

            sessions.retain(|s| session_matches_scope(s, query.project.as_deref(), from, to));

            if let Some(limit) = query.limit {
                sessions.truncate(limit);
            }

            (
                StatusCode::OK,
                cors_headers(),
                Json(serde_json::json!({ "success": true, "data": sessions })),
            )
                .into_response()
        }
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": error })),
        )
            .into_response(),
    }
}

async fn v1_get_session_entries(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let sessions_value = match dispatch(&app_state, "scan_sessions", &serde_json::json!({})).await {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let sessions: Vec<crate::models::SessionInfo> =
        serde_json::from_value(sessions_value).unwrap_or_default();

    let Some(session_path) = sessions.into_iter().find(|s| s.id == id).map(|s| s.path) else {
        return (
            StatusCode::NOT_FOUND,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Session not found" })),
        )
            .into_response();
    };

    let result = dispatch(
        &app_state,
        "get_session_entries",
        &serde_json::json!({ "path": session_path }),
    )
    .await;

    match result {
        Ok(data) => (
            StatusCode::OK,
            cors_headers(),
            Json(serde_json::json!({ "success": true, "data": data })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": error })),
        )
            .into_response(),
    }
}

async fn v1_full_text_search(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<FullTextSearchRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let from = match parse_time_opt(&req.from) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let to = match parse_time_opt(&req.to) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let effective_glob = req
        .glob_pattern
        .clone()
        .or_else(|| req.project.as_ref().map(|p| format!("*{p}*")));

    let payload = serde_json::json!({
        "query": req.query,
        "role_filter": req.role_filter.unwrap_or_else(|| "all".to_string()),
        "glob_pattern": effective_glob,
        "page": req.page.unwrap_or(0),
        "page_size": req.page_size.unwrap_or(20),
        "match_mode": req.match_mode,
    });

    match dispatch(&app_state, "full_text_search", &payload).await {
        Ok(data) => {
            let mut fts: crate::models::FullTextSearchResponse = serde_json::from_value(data)
                .unwrap_or(crate::models::FullTextSearchResponse {
                    hits: vec![],
                    total_hits: 0,
                    has_more: false,
                });
            fts.hits
                .retain(|h| hit_matches_scope(h, req.project.as_deref(), from, to));
            fts.total_hits = fts.hits.len();
            fts.has_more = false;

            (
                StatusCode::OK,
                cors_headers(),
                Json(serde_json::json!({ "success": true, "data": fts })),
            )
                .into_response()
        }
        Err(error) => (
            StatusCode::BAD_REQUEST,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": error })),
        )
            .into_response(),
    }
}

async fn v1_memory_recall(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<MemoryRecallRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let query_text = req.query;
    let top_k = req.top_k.unwrap_or(8).clamp(1, 50);
    let from = match parse_time_opt(&req.from) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let to = match parse_time_opt(&req.to) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let effective_glob = req
        .glob_pattern
        .clone()
        .or_else(|| req.project.as_ref().map(|p| format!("*{p}*")));

    let payload = serde_json::json!({
        "query": query_text,
        "role_filter": req.role_filter.unwrap_or_else(|| "all".to_string()),
        "glob_pattern": effective_glob,
        "page": 0,
        "page_size": top_k,
        "match_mode": "any",
    });

    let fts_value = match dispatch(&app_state, "full_text_search", &payload).await {
        Ok(data) => data,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let mut fts: crate::models::FullTextSearchResponse = match serde_json::from_value(fts_value) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": format!("Invalid search response: {error}") })),
            )
                .into_response();
        }
    };

    fts.hits
        .retain(|h| hit_matches_scope(h, req.project.as_deref(), from, to));

    let total_hits = fts.hits.len();
    let structured = crate::session_intel::build_structured_recall(&query_text, fts.hits);
    let route_plan =
        crate::session_intel::suggest_workflow(&structured.intent, structured.confidence);

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "success": true,
            "data": {
                "query": query_text,
                "intent": structured.intent,
                "confidence": structured.confidence,
                "total_hits": total_hits,
                "returned": structured.evidence.len(),
                "evidence": structured.evidence,
                "route_plan": route_plan
            }
        })),
    )
        .into_response()
}

async fn v1_experience_extract(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<ExperienceExtractRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let limit = req.limit.unwrap_or(20).clamp(1, 200);
    let from = match parse_time_opt(&req.from) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let to = match parse_time_opt(&req.to) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let mut experiences: Vec<crate::session_intel::ExperienceItem> = Vec::new();

    let sessions_value = match dispatch(&app_state, "scan_sessions", &serde_json::json!({})).await {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let sessions: Vec<crate::models::SessionInfo> =
        serde_json::from_value(sessions_value).unwrap_or_default();

    let mut selected_sessions: Vec<crate::models::SessionInfo> =
        if let Some(session_id) = req.session_id {
            sessions
                .into_iter()
                .filter(|s| s.id == session_id)
                .collect()
        } else {
            sessions.into_iter().collect()
        };

    selected_sessions.retain(|s| session_matches_scope(s, req.project.as_deref(), from, to));
    if selected_sessions.len() > 8 {
        selected_sessions.truncate(8);
    }

    for session in selected_sessions {
        let entries_val = match dispatch(
            &app_state,
            "get_session_entries",
            &serde_json::json!({ "path": session.path }),
        )
        .await
        {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entries: Vec<crate::models::SessionEntry> =
            serde_json::from_value(entries_val).unwrap_or_default();

        let mut items = crate::session_intel::extract_experiences(&session.id, &entries, limit);
        experiences.append(&mut items);
        if experiences.len() >= limit {
            experiences.truncate(limit);
            break;
        }
    }

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "success": true,
            "data": {
                "count": experiences.len(),
                "items": experiences
            }
        })),
    )
        .into_response()
}

async fn v1_workflow_route_suggest(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<WorkflowRouteSuggestRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let top_k = req.top_k.unwrap_or(8).clamp(1, 50);
    let from = match parse_time_opt(&req.from) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let to = match parse_time_opt(&req.to) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let effective_glob = req
        .glob_pattern
        .clone()
        .or_else(|| req.project.as_ref().map(|p| format!("*{p}*")));

    let payload = serde_json::json!({
        "query": req.query,
        "role_filter": req.role_filter.unwrap_or_else(|| "all".to_string()),
        "glob_pattern": effective_glob,
        "page": 0,
        "page_size": top_k,
        "match_mode": "any",
    });

    let fts_value = match dispatch(&app_state, "full_text_search", &payload).await {
        Ok(data) => data,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let mut fts: crate::models::FullTextSearchResponse = match serde_json::from_value(fts_value) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": format!("Invalid search response: {error}") })),
            )
                .into_response();
        }
    };

    fts.hits
        .retain(|h| hit_matches_scope(h, req.project.as_deref(), from, to));

    let structured = crate::session_intel::build_structured_recall(&req.query, fts.hits);
    let next_actions =
        crate::session_intel::suggest_workflow(&structured.intent, structured.confidence);

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "success": true,
            "data": {
                "query": req.query,
                "intent": structured.intent,
                "confidence": structured.confidence,
                "next_actions": next_actions,
                "evidence": structured.evidence
            }
        })),
    )
        .into_response()
}

async fn v1_memory_unified(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<MemoryUnifiedRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let top_k = req.top_k.unwrap_or(8).clamp(1, 50);
    let experience_limit = req.experience_limit.unwrap_or(8).clamp(1, 50);

    let from = match parse_time_opt(&req.from) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let to = match parse_time_opt(&req.to) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let effective_glob = req
        .glob_pattern
        .clone()
        .or_else(|| req.project.as_ref().map(|p| format!("*{p}*")));

    let payload = serde_json::json!({
        "query": req.query,
        "role_filter": req.role_filter.unwrap_or_else(|| "all".to_string()),
        "glob_pattern": effective_glob,
        "page": 0,
        "page_size": top_k,
        "match_mode": "any",
    });

    let fts_value = match dispatch(&app_state, "full_text_search", &payload).await {
        Ok(data) => data,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let mut fts: crate::models::FullTextSearchResponse = match serde_json::from_value(fts_value) {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": format!("Invalid search response: {error}") })),
            )
                .into_response();
        }
    };

    fts.hits
        .retain(|h| hit_matches_scope(h, req.project.as_deref(), from, to));

    let structured = crate::session_intel::build_structured_recall(&req.query, fts.hits);
    let next_actions =
        crate::session_intel::suggest_workflow(&structured.intent, structured.confidence);

    // experience preview: extract from recent candidate sessions
    let sessions_value = match dispatch(&app_state, "scan_sessions", &serde_json::json!({})).await {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };
    let sessions: Vec<crate::models::SessionInfo> =
        serde_json::from_value(sessions_value).unwrap_or_default();

    let mut scoped_sessions: Vec<crate::models::SessionInfo> = sessions
        .into_iter()
        .filter(|s| session_matches_scope(s, req.project.as_deref(), from, to))
        .collect();
    if scoped_sessions.len() > 6 {
        scoped_sessions.truncate(6);
    }

    let mut experience_items: Vec<crate::session_intel::ExperienceItem> = Vec::new();
    for s in scoped_sessions {
        let entries_val = match dispatch(
            &app_state,
            "get_session_entries",
            &serde_json::json!({ "path": s.path }),
        )
        .await
        {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entries: Vec<crate::models::SessionEntry> =
            serde_json::from_value(entries_val).unwrap_or_default();
        let mut items =
            crate::session_intel::extract_experiences(&s.id, &entries, experience_limit);
        experience_items.append(&mut items);
        if experience_items.len() >= experience_limit {
            experience_items.truncate(experience_limit);
            break;
        }
    }

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "success": true,
            "data": {
                "query": req.query,
                "intent": structured.intent,
                "confidence": structured.confidence,
                "evidence": structured.evidence,
                "next_actions": next_actions,
                "experience": experience_items
            }
        })),
    )
        .into_response()
}

async fn v1_analytics_overview(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    match crate::session_intel::collect_sqlite_overview() {
        Ok(data) => (
            StatusCode::OK,
            cors_headers(),
            Json(serde_json::json!({ "success": true, "data": data })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": error })),
        )
            .into_response(),
    }
}

async fn v1_observability_summary(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    match crate::session_intel::collect_sqlite_overview() {
        Ok(overview) => (
            StatusCode::OK,
            cors_headers(),
            Json(serde_json::json!({
                "success": true,
                "data": {
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "mode": "readonly",
                    "capabilities": {
                        "memory_recall": true,
                        "memory_unified": true,
                        "experience_extract": true,
                        "workflow_route_suggest": true,
                        "analytics_overview": true,
                        "checkout_apply": false,
                        "milestone_create": false
                    },
                    "endpoints": [
                        "/v1/sessions",
                        "/v1/memory/recall",
                        "/v1/memory/unified",
                        "/v1/experience/extract",
                        "/v1/workflow/route-suggest",
                        "/v1/analytics/overview"
                    ],
                    "overview": overview
                }
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": error })),
        )
            .into_response(),
    }
}

async fn find_session_path_by_id(
    app_state: &SharedAppState,
    id: &str,
) -> Result<Option<String>, String> {
    let sessions_value = dispatch(app_state, "scan_sessions", &serde_json::json!({})).await?;
    let sessions: Vec<crate::models::SessionInfo> =
        serde_json::from_value(sessions_value).unwrap_or_default();
    Ok(sessions.into_iter().find(|s| s.id == id).map(|s| s.path))
}

async fn v1_create_milestone(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<MilestoneCreateRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let _ = (&id, &app_state, &req);
    (
        StatusCode::FORBIDDEN,
        cors_headers(),
        Json(serde_json::json!({
            "success": false,
            "error": "Read-only mode: creating milestones is disabled"
        })),
    )
        .into_response()
}

async fn v1_list_milestones(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let session_tags =
        match dispatch(&app_state, "get_all_session_tags", &serde_json::json!({})).await {
            Ok(v) => v,
            Err(error) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    cors_headers(),
                    Json(serde_json::json!({ "success": false, "error": error })),
                )
                    .into_response();
            }
        };
    let tags = match dispatch(&app_state, "get_all_tags", &serde_json::json!({})).await {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let session_tags: Vec<crate::commands::SessionTagItem> =
        serde_json::from_value(session_tags).unwrap_or_default();
    let tags: Vec<crate::commands::TagItem> = serde_json::from_value(tags).unwrap_or_default();

    let milestone_tag_ids: std::collections::HashSet<String> = session_tags
        .into_iter()
        .filter(|st| st.session_id == id)
        .map(|st| st.tag_id)
        .collect();

    let milestones: Vec<crate::commands::TagItem> = tags
        .into_iter()
        .filter(|t| milestone_tag_ids.contains(&t.id))
        .filter(|t| t.name.starts_with("milestone/"))
        .collect();

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({ "success": true, "data": milestones })),
    )
        .into_response()
}

async fn v1_session_snapshot(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    let Some(path) = (match find_session_path_by_id(&app_state, &id).await {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    }) else {
        return (
            StatusCode::NOT_FOUND,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Session not found" })),
        )
            .into_response();
    };

    let entries_val = match dispatch(
        &app_state,
        "get_session_entries",
        &serde_json::json!({ "path": path }),
    )
    .await
    {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let entries: Vec<crate::models::SessionEntry> =
        serde_json::from_value(entries_val).unwrap_or_default();

    let mut user_count = 0usize;
    let mut assistant_count = 0usize;
    let mut tool_count = 0usize;
    let mut last_items: Vec<Value> = vec![];

    for e in &entries {
        if e.entry_type != "message" {
            continue;
        }
        if let Some(msg) = &e.message {
            match msg.role.as_str() {
                "user" => user_count += 1,
                "assistant" => assistant_count += 1,
                "toolResult" => tool_count += 1,
                _ => {}
            }
        }
    }

    for e in entries.iter().rev().take(5).rev() {
        let text = e
            .message
            .as_ref()
            .and_then(|m| m.content.first())
            .and_then(|c| c.text.clone())
            .unwrap_or_default();
        let role = e
            .message
            .as_ref()
            .map(|m| m.role.clone())
            .unwrap_or_default();
        last_items.push(serde_json::json!({
            "entry_id": e.id,
            "type": e.entry_type,
            "role": role,
            "timestamp": e.timestamp,
            "text": text,
        }));
    }

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "success": true,
            "data": {
                "session_id": id,
                "entry_count": entries.len(),
                "message_stats": {
                    "user": user_count,
                    "assistant": assistant_count,
                    "toolResult": tool_count
                },
                "recent": last_items
            }
        })),
    )
        .into_response()
}

async fn v1_checkout_session(
    Path(id): Path<String>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<CheckoutRequest>,
) -> impl IntoResponse {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return (
            StatusCode::UNAUTHORIZED,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    }

    if req.target_value.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "target_value is required" })),
        )
            .into_response();
    }

    let Some(path) = (match find_session_path_by_id(&app_state, &id).await {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    }) else {
        return (
            StatusCode::NOT_FOUND,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Session not found" })),
        )
            .into_response();
    };

    let entries_val = match dispatch(
        &app_state,
        "get_session_entries",
        &serde_json::json!({ "path": path }),
    )
    .await
    {
        Ok(v) => v,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({ "success": false, "error": error })),
            )
                .into_response();
        }
    };

    let entries: Vec<crate::models::SessionEntry> =
        serde_json::from_value(entries_val).unwrap_or_default();
    if entries.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            cors_headers(),
            Json(serde_json::json!({ "success": false, "error": "Session has no entries" })),
        )
            .into_response();
    }

    let target_idx = match req.target_type.as_str() {
        "position" => match req.target_value.parse::<usize>() {
            Ok(v) if v < entries.len() => v,
            _ => {
                return (
                    StatusCode::BAD_REQUEST,
                    cors_headers(),
                    Json(serde_json::json!({
                        "success": false,
                        "error": format!("Invalid position: {}", req.target_value)
                    })),
                )
                    .into_response();
            }
        },
        _ => match entries.iter().position(|e| e.id == req.target_value) {
            Some(v) => v,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    cors_headers(),
                    Json(serde_json::json!({
                        "success": false,
                        "error": format!("Target entry not found: {}", req.target_value)
                    })),
                )
                    .into_response();
            }
        },
    };

    let kept_entries = &entries[..=target_idx];
    let preview_messages: Vec<Value> = kept_entries
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|e| {
            let role = e
                .message
                .as_ref()
                .map(|m| m.role.clone())
                .unwrap_or_else(|| "system".to_string());
            let text = e
                .message
                .as_ref()
                .and_then(|m| m.content.iter().find_map(|c| c.text.clone()))
                .unwrap_or_default();
            serde_json::json!({
                "entry_id": e.id,
                "role": role,
                "timestamp": e.timestamp,
                "text": text,
            })
        })
        .collect();

    let strategy = req.strategy.unwrap_or_else(|| "preview".to_string());
    let checkout_id = format!("chk-{}", chrono::Utc::now().timestamp_millis());

    let apply_mode = "preview_only".to_string();
    if strategy == "reset" || strategy == "squash" {
        return (
            StatusCode::FORBIDDEN,
            cors_headers(),
            Json(serde_json::json!({
                "success": false,
                "error": "Read-only mode: checkout apply is disabled, use strategy=preview"
            })),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        cors_headers(),
        Json(serde_json::json!({
            "success": true,
            "data": {
                "checkout_id": checkout_id,
                "session_id": id,
                "strategy": strategy,
                "target": {
                    "type": req.target_type,
                    "value": req.target_value,
                    "resolved_index": target_idx
                },
                "carryover_message": req.carryover_message,
                "result": {
                    "previous_length": entries.len(),
                    "new_length": kept_entries.len(),
                    "messages_removed": entries.len().saturating_sub(kept_entries.len()),
                    "apply_mode": apply_mode
                },
                "preview": {
                    "recent": preview_messages
                }
            }
        })),
    )
        .into_response()
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

// ─── Metrics endpoint ───────────────────────────────────────────────

async fn handle_metrics() -> impl IntoResponse {
    let metrics_text = crate::metrics::render();
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        metrics_text,
    )
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
    init_http_adapter_with_embedding(app_state, bind_addr, port, serve_frontend, None).await
}

pub async fn init_http_adapter_with_embedding(
    app_state: SharedAppState,
    bind_addr: &str,
    port: u16,
    serve_frontend: bool,
    embedding_service: Option<std::sync::Arc<crate::embedding_service::EmbeddingService>>,
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
        .route("/v1/events", get(handle_sse))
        .route("/v1/sessions", get(v1_list_sessions))
        .route("/v1/sessions/{id}/entries", get(v1_get_session_entries))
        .route("/v1/sessions/{id}/snapshot", get(v1_session_snapshot))
        .route("/v1/sessions/{id}/checkout", post(v1_checkout_session))
        .route(
            "/v1/sessions/{id}/milestones",
            post(v1_create_milestone).get(v1_list_milestones),
        )
        .route("/v1/search/fulltext", post(v1_full_text_search))
        .route("/v1/memory/recall", post(v1_memory_recall))
        .route("/v1/memory/unified", post(v1_memory_unified))
        .route("/v1/experience/extract", post(v1_experience_extract))
        .route(
            "/v1/workflow/route-suggest",
            post(v1_workflow_route_suggest),
        )
        .route("/v1/analytics/overview", get(v1_analytics_overview))
        .route("/v1/observability/summary", get(v1_observability_summary))
        .route("/ws", get(handle_ws_upgrade))
        .route("/metrics", get(handle_metrics));

    // Add embedding routes if service is available
    if let Some(svc) = embedding_service {
        log::info!("Embedding service enabled");
        app = app
            .route("/v1/embedding", post(v1_embedding_handler))
            .route("/v1/embedding/batch", post(v1_embedding_batch_handler))
            .route("/v1/embedding/status", get(v1_embedding_status_handler))
            .layer(axum::Extension(svc));
    }

    let mut app = app.with_state(app_state);

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

// ============================================================================
// Embedding Handlers (using Extension)
// ============================================================================

#[cfg(feature = "gui")]
async fn v1_embedding_handler(
    axum::Extension(service): axum::Extension<
        std::sync::Arc<crate::embedding_service::EmbeddingService>,
    >,
    axum::Json(req): axum::Json<crate::embedding_service::EmbeddingRequest>,
) -> impl axum::response::IntoResponse {
    use crate::embedding_service::{EmbeddingData, EmbeddingResponse};
    use axum::http::StatusCode;

    let endpoint = match service.ensure_running().await {
        Ok(url) => url,
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(EmbeddingResponse {
                    success: false,
                    data: None,
                    error: Some(e),
                }),
            );
        }
    };

    let client = reqwest::Client::new();
    let url = format!("{endpoint}/embed");

    let payload = serde_json::json!({
        "text": req.text,
        "normalize": req.normalize,
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(data) => {
                let embedding = data
                    .get("embedding")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_f64().map(|f| f as f32))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();

                (
                    StatusCode::OK,
                    axum::Json(EmbeddingResponse {
                        success: true,
                        data: Some(EmbeddingData {
                            dimensions: embedding.len(),
                            embedding,
                            model: "embeddinggemma-300m-qat-q8_0".to_string(),
                            normalized: req.normalize,
                        }),
                        error: None,
                    }),
                )
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(EmbeddingResponse {
                    success: false,
                    data: None,
                    error: Some(format!("Failed to parse response: {e}")),
                }),
            ),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(EmbeddingResponse {
                success: false,
                data: None,
                error: Some(format!("Request failed: {e}")),
            }),
        ),
    }
}

#[cfg(feature = "gui")]
async fn v1_embedding_batch_handler(
    axum::Extension(service): axum::Extension<
        std::sync::Arc<crate::embedding_service::EmbeddingService>,
    >,
    axum::Json(req): axum::Json<crate::embedding_service::EmbeddingBatchRequest>,
) -> impl axum::response::IntoResponse {
    use serde_json::json;

    let endpoint = match service.ensure_running().await {
        Ok(url) => url,
        Err(e) => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({
                    "success": false,
                    "error": e
                })),
            );
        }
    };

    let client = reqwest::Client::new();
    let url = format!("{endpoint}/embed/batch");

    let payload = serde_json::json!({
        "texts": req.texts,
        "normalize": req.normalize,
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(data) => (
                axum::http::StatusCode::OK,
                axum::Json(json!({"success": true, "data": data})),
            ),
            Err(e) => (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({
                    "success": false,
                    "error": format!("Failed to parse response: {}", e)
                })),
            ),
        },
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(json!({
                "success": false,
                "error": format!("Request failed: {}", e)
            })),
        ),
    }
}

#[cfg(feature = "gui")]
async fn v1_embedding_status_handler(
    axum::Extension(service): axum::Extension<
        std::sync::Arc<crate::embedding_service::EmbeddingService>,
    >,
) -> impl axum::response::IntoResponse {
    use crate::embedding_service::EmbeddingStatusResponse;

    let endpoint = format!("http://127.0.0.1:{}/health", service.config().port);

    let (ready, model_loaded) = match reqwest::get(&endpoint).await {
        Ok(resp) if resp.status().is_success() => (true, true),
        _ => (false, false),
    };

    (
        axum::http::StatusCode::OK,
        axum::Json(EmbeddingStatusResponse {
            ready,
            model_loaded,
            model: Some("embeddinggemma-300m-qat-q8_0".to_string()),
            dimensions: 768,
            memory_mb: None,
        }),
    )
}
