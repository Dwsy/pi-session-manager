use crate::api_readonly::{ApiReadonlyError, ApiReadonlyErrorKind};
use crate::auth;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use crate::api_readonly::{parse_time_opt, session_matches_scope, ExperienceExtractRequest, FullTextSearchRequest, MemoryRecallRequest, MemoryUnifiedRequest, WorkflowRouteSuggestRequest};

#[derive(Deserialize)]
pub(crate) struct HttpRequest {
    pub(crate) command: String,
    #[serde(default)]
    pub(crate) payload: Value,
}

#[derive(Serialize)]
pub(crate) struct HttpResponse {
    pub(crate) success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct SessionsQuery {
    pub(crate) limit: Option<usize>,
    pub(crate) q: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) project: Option<String>,
    pub(crate) from: Option<String>,
    pub(crate) to: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MilestoneCreateRequest {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) color: Option<String>,
    #[serde(default)]
    pub(crate) icon: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CheckoutRequest {
    pub(crate) target_type: String,
    pub(crate) target_value: String,
    #[serde(default)]
    pub(crate) strategy: Option<String>,
    #[serde(default)]
    pub(crate) carryover_message: Option<String>,
}

pub(crate) fn cors_headers() -> [(&'static str, &'static str); 4] {
    [("access-control-allow-origin", "http://localhost:1420"), ("access-control-allow-methods", "GET, POST, OPTIONS"), ("access-control-allow-headers", "content-type, authorization"), ("vary", "Origin")]
}

pub(crate) fn is_authorized(ip: &std::net::IpAddr, headers: &HeaderMap, _uri: &axum::http::Uri) -> bool {
    let origin_allowed = auth::origin_allowed(headers.get("origin").and_then(|value| value.to_str().ok()), headers.get("host").and_then(|value| value.to_str().ok()));
    if !origin_allowed {
        return false;
    }
    if !auth::auth_required() {
        return ip.is_loopback();
    }
    headers.get("authorization").and_then(|value| value.to_str().ok()).and_then(|value| value.strip_prefix("Bearer ")).map(auth::validate).unwrap_or(false)
}

pub(crate) fn accepts_gzip(headers: &HeaderMap) -> bool {
    headers.get("accept-encoding").and_then(|value| value.to_str().ok()).map(|value| value.to_lowercase().contains("gzip")).unwrap_or(false)
}

pub(crate) fn unauthorized_response() -> Response {
    json_error_response(StatusCode::UNAUTHORIZED, "Unauthorized")
}

pub(crate) fn json_success_response<T>(data: T) -> Response
where
    T: Serialize,
{
    (StatusCode::OK, cors_headers(), Json(serde_json::json!({ "success": true, "data": data }))).into_response()
}

pub(crate) fn json_error_response(status: StatusCode, error: impl Into<String>) -> Response {
    (status, cors_headers(), Json(serde_json::json!({ "success": false, "error": error.into() }))).into_response()
}

pub(crate) fn readonly_error_status(error: &ApiReadonlyError) -> StatusCode {
    match error.kind() {
        ApiReadonlyErrorKind::BadRequest => StatusCode::BAD_REQUEST,
        ApiReadonlyErrorKind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        ApiReadonlyErrorKind::ServiceUnavailable => StatusCode::SERVICE_UNAVAILABLE,
    }
}

pub(crate) fn readonly_error_response(error: ApiReadonlyError) -> Response {
    json_error_response(readonly_error_status(&error), error.to_string())
}
