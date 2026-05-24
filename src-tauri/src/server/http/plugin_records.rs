#[cfg(feature = "gui")]
use crate::app_state::SharedAppState;
use crate::data::sqlite::DbPluginRecord;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::Response;
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use std::net::SocketAddr;

use super::common::{is_authorized, json_error_response, json_success_response, unauthorized_response};

#[derive(Debug, Deserialize)]
pub(crate) struct PluginRecordListQuery {
    pub(crate) scope_type: String,
    pub(crate) scope_id: String,
    pub(crate) record_type: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PluginRecordSearchRequest {
    pub(crate) query: String,
    pub(crate) record_type: Option<String>,
    pub(crate) plugin_id: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PluginRecordUpsertRequest {
    pub(crate) record: DbPluginRecord,
    #[serde(default)]
    pub(crate) index_values: Vec<crate::data::sqlite::DbPluginRecordIndexValue>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RefreshSessionIntelligenceRequest {
    pub(crate) path: String,
    pub(crate) provider: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) language: Option<String>,
}

pub(crate) async fn v1_get_plugin_record(Path(id): Path<String>, ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, uri: Uri) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match crate::get_plugin_record(id).await {
        Ok(Some(record)) => json_success_response(record),
        Ok(None) => json_error_response(StatusCode::NOT_FOUND, "Plugin record not found"),
        Err(error) => json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

pub(crate) async fn v1_list_plugin_records(ConnectInfo(addr): ConnectInfo<SocketAddr>, State(_app_state): State<SharedAppState>, Query(query): Query<PluginRecordListQuery>, headers: HeaderMap, uri: Uri) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match crate::list_plugin_records_for_scope(query.scope_type, query.scope_id, query.record_type, query.limit).await {
        Ok(records) => json_success_response(records),
        Err(error) => json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

pub(crate) async fn v1_search_plugin_records(ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, uri: Uri, Json(req): Json<PluginRecordSearchRequest>) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match crate::search_plugin_records(req.query, req.record_type, req.plugin_id, req.limit).await {
        Ok(records) => json_success_response(records),
        Err(error) => json_error_response(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

pub(crate) async fn v1_refresh_session_intelligence_record(ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, uri: Uri, Json(req): Json<RefreshSessionIntelligenceRequest>) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match crate::refresh_session_intelligence_record(req.path, req.provider, req.model, req.language).await {
        Ok(record) => json_success_response(record),
        Err(error) => json_error_response(StatusCode::BAD_REQUEST, error),
    }
}

pub(crate) async fn v1_upsert_plugin_record(ConnectInfo(addr): ConnectInfo<SocketAddr>, headers: HeaderMap, uri: Uri, Json(req): Json<PluginRecordUpsertRequest>) -> Response {
    if !is_authorized(&addr.ip(), &headers, &uri) {
        return unauthorized_response();
    }

    match crate::upsert_plugin_record(req.record, Some(req.index_values)).await {
        Ok(()) => json_success_response(json!({ "ok": true })),
        Err(error) => json_error_response(StatusCode::BAD_REQUEST, error),
    }
}
