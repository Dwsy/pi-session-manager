use crate::app_state::SharedAppState;
use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use tauri::Manager;

use super::common::json_error_response;

pub(crate) fn has_frontend_assets(app_state: &SharedAppState) -> bool {
    let resolver = app_state.app_handle.asset_resolver();
    tauri::is_dev() && resolver.get("index.html".to_string()).is_some() || resolver.iter().any(|(key, _)| key.as_ref() == embedded_asset_key("index.html"))
}

fn embedded_asset_key(path: &str) -> String {
    format!("/{}", path.trim_start_matches('/'))
}

fn serve_embedded(app_state: &SharedAppState, path: &str) -> Option<Response> {
    let resolver = app_state.app_handle.asset_resolver();

    // In production Tauri's resolver falls back to index.html for unknown
    // paths. Preserve the HTTP server's exact-asset and 404 semantics by
    // checking the embedded asset index before resolving the bytes.
    let asset_key = embedded_asset_key(path);
    if !tauri::is_dev() && !resolver.iter().any(|(key, _)| key.as_ref() == asset_key) {
        return None;
    }

    resolver.get(path.to_string()).map(|asset| {
        let mut response = Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, asset.mime_type);
        if let Some(csp) = asset.csp_header {
            response = response.header(header::CONTENT_SECURITY_POLICY, csp);
        }
        response.body(Body::from(asset.bytes)).expect("build embedded asset response")
    })
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

pub(crate) async fn serve_static(State(app_state): State<SharedAppState>, uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return match serve_embedded(&app_state, "index.html") {
            Some(response) => response,
            None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
        };
    }

    if let Some(response) = serve_embedded(&app_state, path) {
        return response;
    }
    if should_spa_fallback(path) {
        return match serve_embedded(&app_state, "index.html") {
            Some(response) => response,
            None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
        };
    }
    if is_api_like_path(path) {
        return json_error_response(StatusCode::NOT_FOUND, format!("API endpoint not found: /{path}"));
    }

    (StatusCode::NOT_FOUND, [(header::CONTENT_TYPE, "text/plain; charset=utf-8")], format!("Not Found: /{path}")).into_response()
}

#[cfg(test)]
mod tests {
    use super::embedded_asset_key;

    #[test]
    fn normalizes_paths_to_tauri_asset_keys() {
        assert_eq!(embedded_asset_key("index.html"), "/index.html");
        assert_eq!(embedded_asset_key("/assets/app.js"), "/assets/app.js");
    }
}
