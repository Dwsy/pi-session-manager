use crate::data::search::embedding::{
    EmbeddingBatchRequest, EmbeddingRequest, EmbeddingResponse, EmbeddingService,
    EmbeddingStatusResponse,
};
#[cfg(feature = "gui")]
use crate::api_readonly;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use std::sync::Arc;

use super::common::readonly_error_status;

pub(crate) async fn v1_embedding_handler(
    axum::Extension(service): axum::Extension<Arc<EmbeddingService>>,
    axum::Json(req): axum::Json<EmbeddingRequest>,
) -> impl IntoResponse {
    match api_readonly::embedding(service, req).await {
        Ok(response) => (StatusCode::OK, Json(response)),
        Err(error) => (
            readonly_error_status(&error),
            Json(EmbeddingResponse {
                success: false,
                data: None,
                error: Some(error.to_string()),
            }),
        ),
    }
}

pub(crate) async fn v1_embedding_batch_handler(
    axum::Extension(service): axum::Extension<Arc<EmbeddingService>>,
    axum::Json(req): axum::Json<EmbeddingBatchRequest>,
) -> impl IntoResponse {
    match api_readonly::embedding_batch(service, req).await {
        Ok(data) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "data": data })),
        ),
        Err(error) => (
            readonly_error_status(&error),
            Json(serde_json::json!({ "success": false, "error": error.to_string() })),
        ),
    }
}

pub(crate) async fn v1_embedding_status_handler(
    axum::Extension(service): axum::Extension<Arc<EmbeddingService>>,
) -> impl IntoResponse {
    let status: EmbeddingStatusResponse = api_readonly::embedding_status(service).await;
    (StatusCode::OK, Json(status))
}
