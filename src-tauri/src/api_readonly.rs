use crate::core::intel::{ExperienceItem, RecallEvidence};
use crate::data::search::embedding::{
    EmbeddingBatchRequest, EmbeddingData, EmbeddingRequest, EmbeddingResponse, EmbeddingService,
    EmbeddingStatusResponse,
};
use crate::types::{FullTextSearchHit, FullTextSearchResponse, SessionInfo};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::future::Future;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiReadonlyErrorKind {
    BadRequest,
    Internal,
    ServiceUnavailable,
}

#[derive(Debug, Clone)]
pub struct ApiReadonlyError {
    kind: ApiReadonlyErrorKind,
    message: String,
}

impl ApiReadonlyError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            kind: ApiReadonlyErrorKind::BadRequest,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            kind: ApiReadonlyErrorKind::Internal,
            message: message.into(),
        }
    }

    pub fn service_unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: ApiReadonlyErrorKind::ServiceUnavailable,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> ApiReadonlyErrorKind {
        self.kind
    }
}

impl std::fmt::Display for ApiReadonlyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiReadonlyError {}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchRequest {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub role_filter: Option<String>,
    #[serde(default)]
    pub glob_pattern: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub experience_limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FullTextSearchRequest {
    pub query: String,
    #[serde(default)]
    pub role_filter: Option<String>,
    #[serde(default)]
    pub glob_pattern: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub page: Option<usize>,
    #[serde(default)]
    pub page_size: Option<usize>,
    #[serde(default)]
    pub match_mode: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemoryRecallRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub role_filter: Option<String>,
    #[serde(default)]
    pub glob_pattern: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExperienceExtractRequest {
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRouteSuggestRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub role_filter: Option<String>,
    #[serde(default)]
    pub glob_pattern: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemoryUnifiedRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub role_filter: Option<String>,
    #[serde(default)]
    pub glob_pattern: Option<String>,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub experience_limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryRecallResult {
    pub query: String,
    pub intent: String,
    pub confidence: f32,
    pub total_hits: usize,
    pub evidence: Vec<RecallEvidence>,
    pub suggested_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExperienceExtractResult {
    pub count: usize,
    pub items: Vec<ExperienceItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryUnifiedResult {
    pub query: String,
    pub intent: String,
    pub confidence: f32,
    pub evidence: Vec<RecallEvidence>,
    pub suggested_actions: Vec<String>,
    pub experience: Vec<ExperienceItem>,
}

pub fn require_query(query: Option<String>) -> Result<String, ApiReadonlyError> {
    let query = query.unwrap_or_default();
    if query.trim().is_empty() {
        return Err(ApiReadonlyError::bad_request("query is required"));
    }
    Ok(query)
}

pub fn parse_time_opt(input: &Option<String>) -> Result<Option<DateTime<Utc>>, ApiReadonlyError> {
    match input {
        Some(s) if !s.trim().is_empty() => DateTime::parse_from_rfc3339(s)
            .map(|dt| Some(dt.with_timezone(&Utc)))
            .map_err(|e| ApiReadonlyError::bad_request(format!("Invalid time format '{s}': {e}"))),
        _ => Ok(None),
    }
}

pub fn session_matches_scope(
    session: &SessionInfo,
    project: Option<&str>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> bool {
    if let Some(project) = project {
        let project = project.to_lowercase();
        let hit = session.cwd.to_lowercase().contains(&project)
            || session.path.to_lowercase().contains(&project)
            || session
                .name
                .as_ref()
                .map(|name| name.to_lowercase().contains(&project))
                .unwrap_or(false);
        if !hit {
            return false;
        }
    }

    if let Some(from_time) = from {
        if session.modified < from_time {
            return false;
        }
    }
    if let Some(to_time) = to {
        if session.modified > to_time {
            return false;
        }
    }
    true
}

pub fn hit_matches_scope(
    hit: &FullTextSearchHit,
    project: Option<&str>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> bool {
    if let Some(project) = project {
        if !hit
            .session_path
            .to_lowercase()
            .contains(&project.to_lowercase())
        {
            return false;
        }
    }
    if let Some(from_time) = from {
        if hit.timestamp < from_time {
            return false;
        }
    }
    if let Some(to_time) = to {
        if hit.timestamp > to_time {
            return false;
        }
    }
    true
}

fn effective_glob(glob_pattern: Option<String>, project: Option<&str>) -> Option<String> {
    glob_pattern.or_else(|| project.map(|value| format!("*{value}*")))
}

async fn scan_sessions<D, Fut>(dispatch: &D) -> Result<Vec<SessionInfo>, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let value = dispatch("scan_sessions", serde_json::json!({}))
        .await
        .map_err(ApiReadonlyError::internal)?;
    serde_json::from_value(value)
        .map_err(|e| ApiReadonlyError::internal(format!("Invalid sessions response: {e}")))
}

async fn load_session_entries<D, Fut>(
    dispatch: &D,
    path: String,
) -> Result<Vec<crate::types::SessionEntry>, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let value = dispatch("get_session_entries", serde_json::json!({ "path": path }))
        .await
        .map_err(ApiReadonlyError::internal)?;
    serde_json::from_value(value)
        .map_err(|e| ApiReadonlyError::internal(format!("Invalid session entries response: {e}")))
}

pub async fn full_text_search<D, Fut>(
    dispatch: &D,
    req: FullTextSearchRequest,
    normalize_filtered: bool,
) -> Result<FullTextSearchResponse, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    if req.query.trim().is_empty() {
        return Err(ApiReadonlyError::bad_request("query is required"));
    }

    let from = parse_time_opt(&req.from)?;
    let to = parse_time_opt(&req.to)?;
    let effective_glob = effective_glob(req.glob_pattern.clone(), req.project.as_deref());
    let payload = serde_json::json!({
        "query": req.query,
        "role_filter": req.role_filter.unwrap_or_else(|| "all".to_string()),
        "glob_pattern": effective_glob,
        "page": req.page.unwrap_or(0),
        "page_size": req.page_size.unwrap_or(20),
        "match_mode": req.match_mode,
    });

    let data = dispatch("full_text_search", payload)
        .await
        .map_err(ApiReadonlyError::bad_request)?;
    let mut response: FullTextSearchResponse = serde_json::from_value(data)
        .map_err(|e| ApiReadonlyError::internal(format!("Invalid search response: {e}")))?;

    response
        .hits
        .retain(|hit| hit_matches_scope(hit, req.project.as_deref(), from, to));
    response.total_hits = response.hits.len();
    if normalize_filtered {
        response.has_more = false;
    }
    Ok(response)
}

pub async fn memory_recall<D, Fut>(
    dispatch: &D,
    req: MemoryRecallRequest,
) -> Result<MemoryRecallResult, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let top_k = req.top_k.unwrap_or(8).clamp(1, 50);
    let response = full_text_search(
        dispatch,
        FullTextSearchRequest {
            query: req.query.clone(),
            role_filter: req.role_filter,
            glob_pattern: req.glob_pattern,
            project: req.project,
            from: req.from,
            to: req.to,
            page: Some(0),
            page_size: Some(top_k),
            match_mode: Some("any".to_string()),
        },
        true,
    )
    .await?;

    let total_hits = response.hits.len();
    let structured = crate::core::intel::build_structured_recall(&req.query, response.hits);
    let suggested_actions =
        crate::core::intel::suggest_workflow(&structured.intent, structured.confidence);

    Ok(MemoryRecallResult {
        query: req.query,
        intent: structured.intent,
        confidence: structured.confidence,
        total_hits,
        evidence: structured.evidence,
        suggested_actions,
    })
}

pub async fn experience_extract<D, Fut>(
    dispatch: &D,
    req: ExperienceExtractRequest,
    session_limit: usize,
) -> Result<ExperienceExtractResult, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let from = parse_time_opt(&req.from)?;
    let to = parse_time_opt(&req.to)?;
    let limit = req.limit.unwrap_or(20).clamp(1, 200);

    let mut sessions = scan_sessions(dispatch).await?;
    if let Some(session_id) = req.session_id {
        sessions.retain(|session| session.id == session_id);
    }
    sessions.retain(|session| session_matches_scope(session, req.project.as_deref(), from, to));
    if sessions.len() > session_limit {
        sessions.truncate(session_limit);
    }

    let mut items = Vec::new();
    for session in sessions {
        let entries = match load_session_entries(dispatch, session.path.clone()).await {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        let mut extracted = crate::core::intel::extract_experiences(&session.id, &entries, limit);
        items.append(&mut extracted);
        if items.len() >= limit {
            items.truncate(limit);
            break;
        }
    }

    Ok(ExperienceExtractResult {
        count: items.len(),
        items,
    })
}

pub async fn workflow_route_suggest<D, Fut>(
    dispatch: &D,
    req: WorkflowRouteSuggestRequest,
) -> Result<MemoryRecallResult, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    memory_recall(
        dispatch,
        MemoryRecallRequest {
            query: req.query,
            top_k: req.top_k,
            role_filter: req.role_filter,
            glob_pattern: req.glob_pattern,
            project: req.project,
            from: req.from,
            to: req.to,
        },
    )
    .await
}

pub async fn memory_unified<D, Fut>(
    dispatch: &D,
    req: MemoryUnifiedRequest,
    preview_session_limit: usize,
) -> Result<MemoryUnifiedResult, ApiReadonlyError>
where
    D: Fn(&'static str, Value) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let experience_limit = req.experience_limit.unwrap_or(8).clamp(1, 50);
    let recall = memory_recall(
        dispatch,
        MemoryRecallRequest {
            query: req.query.clone(),
            top_k: req.top_k,
            role_filter: req.role_filter,
            glob_pattern: req.glob_pattern,
            project: req.project.clone(),
            from: req.from.clone(),
            to: req.to.clone(),
        },
    )
    .await?;
    let experience = experience_extract(
        dispatch,
        ExperienceExtractRequest {
            session_id: None,
            limit: Some(experience_limit),
            project: req.project,
            from: req.from,
            to: req.to,
        },
        preview_session_limit,
    )
    .await?;

    Ok(MemoryUnifiedResult {
        query: req.query,
        intent: recall.intent,
        confidence: recall.confidence,
        evidence: recall.evidence,
        suggested_actions: recall.suggested_actions,
        experience: experience.items,
    })
}

pub fn analytics_overview() -> Result<Value, ApiReadonlyError> {
    crate::core::intel::collect_sqlite_overview().map_err(ApiReadonlyError::internal)
}

pub fn readonly_capabilities(checkout_apply: bool, milestone_create: bool) -> Value {
    serde_json::json!({
        "memory_recall": true,
        "memory_unified": true,
        "experience_extract": true,
        "workflow_route_suggest": true,
        "analytics_overview": true,
        "checkout_apply": checkout_apply,
        "milestone_create": milestone_create,
    })
}

#[cfg(feature = "gui")]
pub async fn embedding(
    service: Arc<EmbeddingService>,
    req: EmbeddingRequest,
) -> Result<EmbeddingResponse, ApiReadonlyError> {
    let endpoint = service
        .ensure_running()
        .await
        .map_err(ApiReadonlyError::service_unavailable)?;
    let client = reqwest::Client::new();
    let url = format!("{endpoint}/embed");
    let payload = serde_json::json!({
        "text": req.text,
        "normalize": req.normalize,
    });

    let data = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| ApiReadonlyError::internal(format!("Request failed: {e}")))?
        .json::<Value>()
        .await
        .map_err(|e| ApiReadonlyError::internal(format!("Failed to parse response: {e}")))?;

    let embedding = data
        .get("embedding")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|value| value.as_f64().map(|number| number as f32))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(EmbeddingResponse {
        success: true,
        data: Some(EmbeddingData {
            dimensions: embedding.len(),
            embedding,
            model: "embeddinggemma-300m-qat-q8_0".to_string(),
            normalized: req.normalize,
        }),
        error: None,
    })
}

#[cfg(feature = "gui")]
pub async fn embedding_batch(
    service: Arc<EmbeddingService>,
    req: EmbeddingBatchRequest,
) -> Result<Value, ApiReadonlyError> {
    let endpoint = service
        .ensure_running()
        .await
        .map_err(ApiReadonlyError::service_unavailable)?;
    let client = reqwest::Client::new();
    let url = format!("{endpoint}/embed/batch");
    let payload = serde_json::json!({
        "texts": req.texts,
        "normalize": req.normalize,
    });

    client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| ApiReadonlyError::internal(format!("Request failed: {e}")))?
        .json::<Value>()
        .await
        .map_err(|e| ApiReadonlyError::internal(format!("Parse error: {e}")))
}

#[cfg(feature = "gui")]
pub async fn embedding_status(service: Arc<EmbeddingService>) -> EmbeddingStatusResponse {
    let endpoint = format!("http://127.0.0.1:{}/health", service.config().port);
    let (ready, model_loaded) = match reqwest::get(&endpoint).await {
        Ok(resp) if resp.status().is_success() => (true, true),
        _ => (false, false),
    };

    EmbeddingStatusResponse {
        ready,
        model_loaded,
        model: Some("embeddinggemma-300m-qat-q8_0".to_string()),
        dimensions: 768,
        memory_mb: None,
    }
}
