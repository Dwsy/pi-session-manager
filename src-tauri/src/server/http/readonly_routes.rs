#[cfg(feature = "gui")]
use crate::api_readonly;
#[cfg(feature = "gui")]
use crate::app_state::SharedAppState;
use crate::dispatch::dispatch_with_state as dispatch;
#[cfg(feature = "gui")]
use crate::server::ws::ws_dispatch;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, Uri};
use axum::response::Response;
use axum::Json;
use serde_json::{json, Value};
use std::net::SocketAddr;

use super::common::{
    is_authorized, json_success_response, readonly_error_response, unauthorized_response,
    ExperienceExtractRequest, FullTextSearchRequest, MemoryRecallRequest, MemoryUnifiedRequest,
    WorkflowRouteSuggestRequest,
};

async fn dispatch_json(
    app_state: &SharedAppState,
    command: &str,
    payload: Value,
) -> Result<Value, String> {
    dispatch(&Some(app_state.clone()), command, &payload).await
}

pub(crate) async fn v1_full_text_search(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<FullTextSearchRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let dispatch_state = app_state.clone();
    let dispatch_fn = move |command: &'static str, payload: Value| {
        let app_state = dispatch_state.clone();
        async move { dispatch_json(&app_state, command, payload).await }
    };
    match api_readonly::full_text_search(&dispatch_fn, req, true).await {
        Ok(fts) => json_success_response(fts),
        Err(error) => readonly_error_response(error),
    }
}

pub(crate) async fn v1_memory_recall(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<MemoryRecallRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let dispatch_state = app_state.clone();
    let dispatch_fn = move |command: &'static str, payload: Value| {
        let app_state = dispatch_state.clone();
        async move { dispatch_json(&app_state, command, payload).await }
    };
    match api_readonly::memory_recall(&dispatch_fn, req).await {
        Ok(result) => {
            let returned = result.evidence.len();
            json_success_response(json!({
                "query": result.query,
                "intent": result.intent,
                "confidence": result.confidence,
                "total_hits": result.total_hits,
                "returned": returned,
                "evidence": result.evidence,
                "route_plan": result.suggested_actions,
            }))
        }
        Err(error) => readonly_error_response(error),
    }
}

pub(crate) async fn v1_experience_extract(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<ExperienceExtractRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let dispatch_state = app_state.clone();
    let dispatch_fn = move |command: &'static str, payload: Value| {
        let app_state = dispatch_state.clone();
        async move { dispatch_json(&app_state, command, payload).await }
    };
    match api_readonly::experience_extract(&dispatch_fn, req, 8).await {
        Ok(result) => json_success_response(json!({
            "count": result.count,
            "items": result.items,
        })),
        Err(error) => readonly_error_response(error),
    }
}

pub(crate) async fn v1_workflow_route_suggest(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<WorkflowRouteSuggestRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let dispatch_state = app_state.clone();
    let dispatch_fn = move |command: &'static str, payload: Value| {
        let app_state = dispatch_state.clone();
        async move { dispatch_json(&app_state, command, payload).await }
    };
    match api_readonly::workflow_route_suggest(&dispatch_fn, req).await {
        Ok(result) => json_success_response(json!({
            "query": result.query,
            "intent": result.intent,
            "confidence": result.confidence,
            "next_actions": result.suggested_actions,
            "evidence": result.evidence,
        })),
        Err(error) => readonly_error_response(error),
    }
}

pub(crate) async fn v1_memory_unified(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app_state): State<SharedAppState>,
    headers: HeaderMap,
    uri: Uri,
    Json(req): Json<MemoryUnifiedRequest>,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    let dispatch_state = app_state.clone();
    let dispatch_fn = move |command: &'static str, payload: Value| {
        let app_state = dispatch_state.clone();
        async move { dispatch_json(&app_state, command, payload).await }
    };
    match api_readonly::memory_unified(&dispatch_fn, req, 6).await {
        Ok(result) => json_success_response(json!({
            "query": result.query,
            "intent": result.intent,
            "confidence": result.confidence,
            "evidence": result.evidence,
            "next_actions": result.suggested_actions,
            "experience": result.experience,
        })),
        Err(error) => readonly_error_response(error),
    }
}

pub(crate) async fn v1_analytics_overview(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match api_readonly::analytics_overview() {
        Ok(data) => json_success_response(data),
        Err(error) => readonly_error_response(error),
    }
}

pub(crate) async fn v1_observability_summary(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match api_readonly::analytics_overview() {
        Ok(overview) => json_success_response(json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "mode": "readonly",
            "capabilities": api_readonly::readonly_capabilities(false, false),
            "endpoints": [
                "/v1/sessions",
                "/v1/memory/recall",
                "/v1/memory/unified",
                "/v1/experience/extract",
                "/v1/workflow/route-suggest",
                "/v1/analytics/overview",
            ],
            "overview": overview,
        })),
        Err(error) => readonly_error_response(error),
    }
}
