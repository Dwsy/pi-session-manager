use pi_session_manager::embedding_service::{
    EmbeddingBatchRequest, EmbeddingConfig, EmbeddingData, EmbeddingRequest, EmbeddingResponse,
    EmbeddingService, EmbeddingStatusResponse,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};

// CLI-specific state (no Tauri dependencies)
pub struct CliAppState {
    pub event_tx: broadcast::Sender<WsEvent>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WsEvent {
    pub event_type: String,
    pub event: String,
    pub payload: serde_json::Value,
}

impl Default for CliAppState {
    fn default() -> Self {
        Self::new()
    }
}

impl CliAppState {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self { event_tx }
    }
}

pub type SharedCliState = Arc<CliAppState>;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    info!("Starting Pi Session Manager - CLI Mode");

    // Load configuration
    let server_cfg = load_server_settings();

    // Create state
    let state = Arc::new(CliAppState::new());

    // Start WebSocket service
    if server_cfg.ws_enabled {
        let ws_state = state.clone();
        let ws_port = server_cfg.ws_port;
        let ws_bind = server_cfg.bind_addr.clone();
        let ws_bind_log = ws_bind.clone();
        tokio::spawn(async move {
            if let Err(e) = init_ws_adapter(ws_state, &ws_bind, ws_port).await {
                error!("WS adapter failed: {}", e);
            }
        });
        info!("WebSocket: ws://{}:{}", ws_bind_log, ws_port);
    }

    // Start HTTP service
    if server_cfg.http_enabled {
        let http_state = state.clone();
        let http_port = server_cfg.http_port;
        let http_bind = server_cfg.bind_addr.clone();
        let http_bind_log = http_bind.clone();

        // Initialize embedding service
        let embedding_service = init_embedding_service();
        let embedding_enabled = embedding_service.is_some();
        if embedding_enabled {
            info!("Embedding service initialized");
        }

        tokio::spawn(async move {
            if let Err(e) =
                init_http_adapter(http_state, &http_bind, http_port, embedding_service).await
            {
                error!("HTTP adapter failed: {}", e);
            }
        });
        info!(
            "HTTP: http://{}:{}/api{}",
            http_bind_log,
            http_port,
            if embedding_enabled {
                " (with embedding)"
            } else {
                ""
            }
        );
    }

    info!("CLI mode running. Press Ctrl+C to exit.");

    // Keep running
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to listen for ctrl+c");
    info!("Shutting down...");
}

// Simplified configuration loading
#[derive(Debug, Clone)]
struct ServerConfig {
    ws_enabled: bool,
    http_enabled: bool,
    ws_port: u16,
    http_port: u16,
    bind_addr: String,
    auth_enabled: bool,
}

/// Initialize embedding service if model is available
fn init_embedding_service() -> Option<Arc<EmbeddingService>> {
    let home = dirs::home_dir().unwrap_or_default();
    let model_path = home.join(".pi/models/embedding-models/embeddinggemma-300M-Q8_0.gguf");

    if !model_path.exists() {
        info!(
            "Embedding model not found at {:?}, embedding service disabled",
            model_path
        );
        return None;
    }

    let config = EmbeddingConfig {
        enabled: true,
        model_path,
        port: 11435,
        auto_release_minutes: 5,
        node_path: None,
    };

    let service = Arc::new(EmbeddingService::new(config));

    // Start auto-release background task
    let service_clone = service.clone();
    service_clone.start_auto_release();

    Some(service)
}

fn load_server_settings() -> ServerConfig {
    // Load from file or use defaults
    let config_path = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .join("pi-session-manager.json");

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            return ServerConfig {
                ws_enabled: json["ws_enabled"].as_bool().unwrap_or(true),
                http_enabled: json["http_enabled"].as_bool().unwrap_or(true),
                ws_port: json["ws_port"].as_u64().unwrap_or(52130) as u16,
                http_port: json["http_port"].as_u64().unwrap_or(52131) as u16,
                bind_addr: json["bind_addr"]
                    .as_str()
                    .unwrap_or("127.0.0.1")
                    .to_string(),
                auth_enabled: json["auth_enabled"].as_bool().unwrap_or(false),
            };
        }
    }

    // Default configuration
    ServerConfig {
        ws_enabled: true,
        http_enabled: true,
        ws_port: 52130,
        http_port: 52131,
        bind_addr: "127.0.0.1".to_string(),
        auth_enabled: false,
    }
}

// Simplified WS adapter (reuse original logic but adapt for CLI state)
async fn init_ws_adapter(
    state: SharedCliState,
    bind_addr: &str,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    use futures_util::{SinkExt, StreamExt};
    use tokio::net::TcpListener;
    use tokio_tungstenite::accept_async;

    let addr = format!("{bind_addr}:{port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("WebSocket listening on {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        let state = state.clone();
        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    error!("WS accept error: {}", e);
                    return;
                }
            };

            let (mut sender, mut receiver) = ws_stream.split();

            // Simple echo + command handling
            while let Some(msg) = receiver.next().await {
                if let Ok(msg) = msg {
                    if let Ok(text) = msg.to_text() {
                        // Simple handling: parse JSON command
                        if let Ok(req) = serde_json::from_str::<serde_json::Value>(text) {
                            let cmd = req["command"].as_str().unwrap_or("unknown");
                            let response = match cmd {
                                "scan_sessions" => {
                                    // Simplified implementation
                                    serde_json::json!({
                                        "id": req["id"].as_str().unwrap_or(""),
                                        "command": cmd,
                                        "success": true,
                                        "data": []
                                    })
                                }
                                _ => {
                                    serde_json::json!({
                                        "id": req["id"].as_str().unwrap_or(""),
                                        "command": cmd,
                                        "success": false,
                                        "error": "Command not implemented in CLI mode"
                                    })
                                }
                            };
                            let _ = sender
                                .send(tokio_tungstenite::tungstenite::Message::Text(
                                    response.to_string(),
                                ))
                                .await;
                        }
                    }
                }
            }
        });
    }

    Ok(())
}

// CLI HTTP adapter（支持只读 v1 接口）

// CLI HTTP 适配器（支持只读 v1 接口）

async fn init_http_adapter(
    _state: SharedCliState,
    bind_addr: &str,
    port: u16,
    embedding_service: Option<Arc<EmbeddingService>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use axum::extract::Query;
    use axum::{routing::get, routing::post, Json, Router};
    use chrono::{DateTime, Utc};
    use serde::Deserialize;
    use serde_json::Value;

    #[derive(Deserialize)]
    struct CmdReq {
        command: String,
        #[serde(default)]
        payload: Value,
    }

    #[derive(Deserialize, Default)]
    struct SessionsQuery {
        #[serde(default)]
        limit: Option<usize>,
        #[serde(default)]
        q: Option<String>,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default)]
        project: Option<String>,
        #[serde(default)]
        from: Option<String>,
        #[serde(default)]
        to: Option<String>,
    }

    #[derive(Deserialize)]
    struct SearchReq {
        #[serde(default)]
        query: Option<String>,
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

    fn parse_time_opt(input: &Option<String>) -> Result<Option<DateTime<Utc>>, String> {
        match input {
            Some(s) if !s.trim().is_empty() => DateTime::parse_from_rfc3339(s)
                .map(|dt| Some(dt.with_timezone(&Utc)))
                .map_err(|e| format!("Invalid time format '{s}': {e}")),
            _ => Ok(None),
        }
    }

    fn session_matches_scope(
        session: &pi_session_manager::models::SessionInfo,
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
        if let Some(f) = from {
            if session.modified < f {
                return false;
            }
        }
        if let Some(t) = to {
            if session.modified > t {
                return false;
            }
        }
        true
    }

    async fn api_handler(Json(body): Json<CmdReq>) -> Json<Value> {
        match pi_session_manager::dispatch::dispatch(&body.command, &body.payload).await {
            Ok(data) => Json(serde_json::json!({ "success": true, "data": data })),
            Err(error) => Json(serde_json::json!({ "success": false, "error": error })),
        }
    }

    async fn v1_sessions(Query(q): Query<SessionsQuery>) -> Json<Value> {
        // Build payload with filters
        let mut payload = serde_json::json!({});
        if let Some(limit) = q.limit {
            payload["limit"] = serde_json::json!(limit);
        }
        if let Some(ref cwd) = q.cwd {
            payload["cwd"] = serde_json::json!(cwd);
        }
        if let Some(ref project) = q.project {
            payload["project"] = serde_json::json!(project);
        }
        if let Some(ref text) = q.q {
            payload["q"] = serde_json::json!(text);
        }

        // Directly return dispatch result
        match pi_session_manager::dispatch::dispatch("scan_sessions", &payload).await {
            Ok(sessions) => Json(serde_json::json!({ "success": true, "data": sessions })),
            Err(error) => Json(serde_json::json!({ "success": false, "error": error })),
        }
    }

    async fn v1_memory_recall(Json(req): Json<SearchReq>) -> Json<Value> {
        let query_text = req.query.clone().unwrap_or_default();
        if query_text.trim().is_empty() {
            return Json(serde_json::json!({
                "success": false,
                "error": "query is required"
            }));
        }

        let from = match parse_time_opt(&req.from) {
            Ok(v) => v,
            Err(error) => return Json(serde_json::json!({ "success": false, "error": error })),
        };
        let to = match parse_time_opt(&req.to) {
            Ok(v) => v,
            Err(error) => return Json(serde_json::json!({ "success": false, "error": error })),
        };
        let top_k = req.top_k.unwrap_or(8).clamp(1, 50);
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
            "match_mode": "any"
        });

        let value = match pi_session_manager::dispatch::dispatch("full_text_search", &payload).await
        {
            Ok(v) => v,
            Err(error) => return Json(serde_json::json!({ "success": false, "error": error })),
        };
        let mut fts: pi_session_manager::models::FullTextSearchResponse = serde_json::from_value(
            value,
        )
        .unwrap_or(pi_session_manager::models::FullTextSearchResponse {
            hits: vec![],
            total_hits: 0,
            has_more: false,
        });
        fts.hits.retain(|h| {
            if let Some(p) = req.project.as_deref() {
                if !h.session_path.to_lowercase().contains(&p.to_lowercase()) {
                    return false;
                }
            }
            if let Some(f) = from {
                if h.timestamp < f {
                    return false;
                }
            }
            if let Some(t) = to {
                if h.timestamp > t {
                    return false;
                }
            }
            true
        });

        let structured =
            pi_session_manager::session_intel::build_structured_recall(&query_text, fts.hits);
        let next_actions = pi_session_manager::session_intel::suggest_workflow(
            &structured.intent,
            structured.confidence,
        );

        Json(serde_json::json!({
            "success": true,
            "data": {
                "query": query_text,
                "intent": structured.intent,
                "confidence": structured.confidence,
                "evidence": structured.evidence,
                "next_actions": next_actions
            }
        }))
    }

    async fn v1_memory_unified(Json(req): Json<SearchReq>) -> Json<Value> {
        let query_text = req.query.clone().unwrap_or_default();
        if query_text.trim().is_empty() {
            return Json(serde_json::json!({
                "success": false,
                "error": "query is required"
            }));
        }

        let experience_limit = req.experience_limit.unwrap_or(8).clamp(1, 50);
        let recall = v1_memory_recall(Json(SearchReq {
            query: Some(query_text.clone()),
            top_k: req.top_k,
            role_filter: req.role_filter.clone(),
            glob_pattern: req.glob_pattern.clone(),
            project: req.project.clone(),
            from: req.from.clone(),
            to: req.to.clone(),
            experience_limit: req.experience_limit,
        }))
        .await;

        let exp = v1_experience_extract(Json(SearchReq {
            query: Some(query_text.clone()),
            top_k: req.top_k,
            role_filter: req.role_filter.clone(),
            glob_pattern: req.glob_pattern.clone(),
            project: req.project.clone(),
            from: req.from.clone(),
            to: req.to.clone(),
            experience_limit: Some(experience_limit),
        }))
        .await;

        let recall_v = recall.0;
        let exp_v = exp.0;
        Json(serde_json::json!({
            "success": true,
            "data": {
                "query": query_text,
                "intent": recall_v["data"]["intent"],
                "confidence": recall_v["data"]["confidence"],
                "evidence": recall_v["data"]["evidence"],
                "next_actions": recall_v["data"]["next_actions"],
                "experience": exp_v["data"]["items"]
            }
        }))
    }

    async fn v1_experience_extract(Json(req): Json<SearchReq>) -> Json<Value> {
        let from = match parse_time_opt(&req.from) {
            Ok(v) => v,
            Err(error) => return Json(serde_json::json!({ "success": false, "error": error })),
        };
        let to = match parse_time_opt(&req.to) {
            Ok(v) => v,
            Err(error) => return Json(serde_json::json!({ "success": false, "error": error })),
        };
        let limit = req.experience_limit.unwrap_or(20).clamp(1, 200);
        let sessions_value =
            match pi_session_manager::dispatch::dispatch("scan_sessions", &serde_json::json!({}))
                .await
            {
                Ok(v) => v,
                Err(error) => return Json(serde_json::json!({ "success": false, "error": error })),
            };
        let mut sessions: Vec<pi_session_manager::models::SessionInfo> =
            serde_json::from_value(sessions_value).unwrap_or_default();
        sessions.retain(|s| session_matches_scope(s, req.project.as_deref(), from, to));
        if sessions.len() > 8 {
            sessions.truncate(8);
        }

        let mut items = Vec::new();
        for s in sessions {
            let evalue = match pi_session_manager::dispatch::dispatch(
                "get_session_entries",
                &serde_json::json!({"path": s.path}),
            )
            .await
            {
                Ok(v) => v,
                Err(_) => continue,
            };
            let entries: Vec<pi_session_manager::models::SessionEntry> =
                serde_json::from_value(evalue).unwrap_or_default();
            let mut xs =
                pi_session_manager::session_intel::extract_experiences(&s.id, &entries, limit);
            items.append(&mut xs);
            if items.len() >= limit {
                items.truncate(limit);
                break;
            }
        }
        Json(serde_json::json!({"success": true, "data": {"count": items.len(), "items": items}}))
    }

    async fn v1_workflow_route(Json(req): Json<SearchReq>) -> Json<Value> {
        let query_text = req.query.clone().unwrap_or_default();
        if query_text.trim().is_empty() {
            return Json(serde_json::json!({
                "success": false,
                "error": "query is required"
            }));
        }

        let recall = v1_memory_recall(Json(SearchReq {
            query: Some(query_text.clone()),
            top_k: req.top_k,
            role_filter: req.role_filter,
            glob_pattern: req.glob_pattern,
            project: req.project,
            from: req.from,
            to: req.to,
            experience_limit: req.experience_limit,
        }))
        .await;
        let v = recall.0;
        Json(serde_json::json!({
            "success": true,
            "data": {
                "query": query_text,
                "intent": v["data"]["intent"],
                "confidence": v["data"]["confidence"],
                "next_actions": v["data"]["next_actions"],
                "evidence": v["data"]["evidence"]
            }
        }))
    }

    async fn v1_analytics() -> Json<Value> {
        match pi_session_manager::session_intel::collect_sqlite_overview() {
            Ok(data) => Json(serde_json::json!({"success": true, "data": data})),
            Err(error) => Json(serde_json::json!({"success": false, "error": error})),
        }
    }

    async fn v1_observability() -> Json<Value> {
        match pi_session_manager::session_intel::collect_sqlite_overview() {
            Ok(overview) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "mode": "readonly",
                    "capabilities": {
                        "memory_recall": true,
                        "memory_unified": true,
                        "experience_extract": true,
                        "workflow_route_suggest": true,
                        "analytics_overview": true
                    },
                    "overview": overview
                }
            })),
            Err(error) => Json(serde_json::json!({"success": false, "error": error})),
        }
    }

    async fn v1_search_fulltext(Json(req): Json<SearchReq>) -> Json<Value> {
        let query_text = req.query.clone().unwrap_or_default();
        if query_text.trim().is_empty() {
            return Json(serde_json::json!({
                "success": false,
                "error": "query is required"
            }));
        }

        let top_k = req.top_k.unwrap_or(10).clamp(1, 100);
        let payload = serde_json::json!({
            "query": query_text,
            "role_filter": req.role_filter.unwrap_or_else(|| "all".to_string()),
            "glob_pattern": req.glob_pattern,
            "page": 0,
            "page_size": top_k,
            "match_mode": "any"
        });

        match pi_session_manager::dispatch::dispatch("full_text_search", &payload).await {
            Ok(value) => {
                let fts: pi_session_manager::models::FullTextSearchResponse =
                    serde_json::from_value(value).unwrap_or(
                        pi_session_manager::models::FullTextSearchResponse {
                            hits: vec![],
                            total_hits: 0,
                            has_more: false,
                        },
                    );
                Json(serde_json::json!({
                    "success": true,
                    "data": {
                        "query": query_text,
                        "hits": fts.hits,
                        "total_hits": fts.total_hits,
                        "has_more": fts.has_more
                    }
                }))
            }
            Err(error) => Json(serde_json::json!({ "success": false, "error": error })),
        }
    }

    async fn handle_metrics() -> &'static str {
        // Basic Prometheus metrics for CLI mode
        "# HELP pi_sessions_total Total number of sessions\n# TYPE pi_sessions_total gauge\npi_sessions_total 0\n"
    }

    // Embedding handlers
    async fn v1_embedding(
        axum::Extension(svc): axum::Extension<Arc<EmbeddingService>>,
        Json(req): Json<EmbeddingRequest>,
    ) -> Json<EmbeddingResponse> {
        let endpoint = match svc.ensure_running().await {
            Ok(url) => url,
            Err(e) => {
                return Json(EmbeddingResponse {
                    success: false,
                    data: None,
                    error: Some(e),
                });
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

                    Json(EmbeddingResponse {
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
                Err(e) => Json(EmbeddingResponse {
                    success: false,
                    data: None,
                    error: Some(format!("Failed to parse response: {e}")),
                }),
            },
            Err(e) => Json(EmbeddingResponse {
                success: false,
                data: None,
                error: Some(format!("Request failed: {e}")),
            }),
        }
    }

    async fn v1_embedding_batch(
        axum::Extension(svc): axum::Extension<Arc<EmbeddingService>>,
        Json(req): Json<EmbeddingBatchRequest>,
    ) -> Json<serde_json::Value> {
        let endpoint = match svc.ensure_running().await {
            Ok(url) => url,
            Err(e) => return Json(serde_json::json!({"success": false, "error": e})),
        };

        let client = reqwest::Client::new();
        let url = format!("{endpoint}/embed/batch");

        let payload = serde_json::json!({
            "texts": req.texts,
            "normalize": req.normalize,
        });

        match client.post(&url).json(&payload).send().await {
            Ok(resp) => match resp.json::<serde_json::Value>().await {
                Ok(data) => Json(serde_json::json!({"success": true, "data": data})),
                Err(e) => Json(
                    serde_json::json!({"success": false, "error": format!("Parse error: {}", e)}),
                ),
            },
            Err(e) => Json(
                serde_json::json!({"success": false, "error": format!("Request failed: {}", e)}),
            ),
        }
    }

    async fn v1_embedding_status(
        axum::Extension(svc): axum::Extension<Arc<EmbeddingService>>,
    ) -> Json<EmbeddingStatusResponse> {
        let endpoint = format!("http://127.0.0.1:{}/health", svc.config().port);

        let (ready, model_loaded) = match reqwest::get(&endpoint).await {
            Ok(resp) if resp.status().is_success() => (true, true),
            _ => (false, false),
        };

        Json(EmbeddingStatusResponse {
            ready,
            model_loaded,
            model: Some("embeddinggemma-300m-qat-q8_0".to_string()),
            dimensions: 768,
            memory_mb: None,
        })
    }

    let mut app = Router::new()
        .route("/api", post(api_handler))
        .route("/v1/sessions", get(v1_sessions))
        .route("/v1/search/fulltext", post(v1_search_fulltext))
        .route("/v1/memory/recall", post(v1_memory_recall))
        .route("/v1/memory/unified", post(v1_memory_unified))
        .route("/v1/experience/extract", post(v1_experience_extract))
        .route("/v1/workflow/route-suggest", post(v1_workflow_route))
        .route("/v1/analytics/overview", get(v1_analytics))
        .route("/v1/observability/summary", get(v1_observability))
        .route("/metrics", get(handle_metrics));

    // Add embedding routes if service is available
    if let Some(svc) = embedding_service {
        info!("Embedding service enabled on CLI mode");
        app = app
            .route("/v1/embedding", post(v1_embedding))
            .route("/v1/embedding/batch", post(v1_embedding_batch))
            .route("/v1/embedding/status", get(v1_embedding_status))
            .layer(axum::Extension(svc));
    }

    let addr = format!("{bind_addr}:{port}");
    info!("HTTP listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
