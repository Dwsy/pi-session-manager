use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;

use super::common::json_error_response;

#[derive(Embed)]
#[folder = "../dist"]
struct FrontendAssets;

pub(crate) fn has_frontend_assets() -> bool {
    FrontendAssets::get("index.html").is_some()
}

fn serve_embedded(path: &str) -> Option<Response> {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    FrontendAssets::get(path).map(|file| (StatusCode::OK, [(header::CONTENT_TYPE, mime.as_ref())], file.data.to_vec()).into_response())
}

fn is_api_like_path(path: &str) -> bool {
    let normalized = path.trim_start_matches('/');
    normalized == "api" || normalized.starts_with("api/") || normalized == "v1" || normalized.starts_with("v1/") || normalized == "ws" || normalized.starts_with("ws/") || normalized == "metrics" || normalized.starts_with("metrics/")
}

fn should_spa_fallback(path: &str) -> bool {
    let normalized = path.trim_start_matches('/');
    if normalized.is_empty() || is_api_like_path(normalized) {
        return false;
    }
    !normalized.contains('.')
}

pub(crate) async fn serve_static(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return match serve_embedded("index.html") {
            Some(response) => response,
            None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
        };
    }

    if let Some(response) = serve_embedded(path) {
        return response;
    }
    if should_spa_fallback(path) {
        return match serve_embedded("index.html") {
            Some(response) => response,
            None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
        };
    }
    if is_api_like_path(path) {
        return json_error_response(StatusCode::NOT_FOUND, format!("API endpoint not found: /{path}"));
    }

    (StatusCode::NOT_FOUND, [(header::CONTENT_TYPE, "text/plain; charset=utf-8")], format!("Not Found: /{path}")).into_response()
}
