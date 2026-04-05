use pi_session_manager::data::search::embedding::{
    EmbeddingBatchRequest, EmbeddingConfig, EmbeddingData, EmbeddingRequest, EmbeddingResponse,
    EmbeddingService, EmbeddingStatusResponse,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

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

#[derive(Debug, Default)]
struct CliArgs {
    show_help: bool,
    http_port: Option<u16>,
    bind_addr: Option<String>,
    auth_enabled: Option<bool>,
    runtime_token: Option<String>,
}

fn parse_port_arg(value: &str, flag: &str) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|_| format!("Invalid value for {flag}: `{value}`"))
}

fn parse_cli_args() -> Result<CliArgs, String> {
    let raw_args: Vec<String> = std::env::args().skip(1).collect();
    if raw_args.iter().any(|arg| arg == "-h" || arg == "--help") {
        return Ok(CliArgs {
            show_help: true,
            ..CliArgs::default()
        });
    }

    let mut parsed = CliArgs::default();
    let mut iter = raw_args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-p" | "--port" => {
                let value = iter
                    .next()
                    .ok_or_else(|| format!("Missing value for `{arg}`"))?;
                parsed.http_port = Some(parse_port_arg(value, arg)?);
            }
            "-b" | "--bind" => {
                let value = iter
                    .next()
                    .ok_or_else(|| format!("Missing value for `{arg}`"))?;
                if value.trim().is_empty() {
                    return Err(format!("Invalid value for `{arg}`: empty address"));
                }
                parsed.bind_addr = Some(value.clone());
            }
            "--auth" => {
                if parsed.auth_enabled == Some(false) {
                    return Err("Cannot use `--auth` with `--no-auth`".to_string());
                }
                parsed.auth_enabled = Some(true);
            }
            "--no-auth" => {
                if parsed.auth_enabled == Some(true) {
                    return Err("Cannot use `--auth` with `--no-auth`".to_string());
                }
                parsed.auth_enabled = Some(false);
            }
            "--token" => {
                let value = iter
                    .next()
                    .ok_or_else(|| "Missing value for `--token`".to_string())?;
                let token = value.trim();
                if token.is_empty() {
                    return Err("Invalid value for `--token`: empty token".to_string());
                }
                parsed.runtime_token = Some(token.to_string());
            }
            _ => return Err(format!("Unknown argument: `{arg}`")),
        }
    }

    Ok(parsed)
}

fn print_help() {
    let default_path = default_config_path();
    println!(
        "Pi Session Manager CLI\n\
         \n\
         USAGE:\n\
           pi-session-cli [OPTIONS]\n\
         \n\
         OPTIONS:\n\
           -h, --help           Show this help message\n\
           -p, --port <PORT>    HTTP server port (overrides config http_port)\n\
           -b, --bind <ADDR>    Bind address (overrides config bind_addr)\n\
               --auth           Enable auth (requires token for non-local requests)\n\
               --no-auth        Disable auth\n\
               --token <TOKEN>  Runtime-only token, overrides DB tokens for this process\n\
         \n\
         NOTES:\n\
           - Config file default: {}",
        default_path.display()
    );
}

fn apply_cli_overrides(server_cfg: &mut ServerConfig, cli_args: &CliArgs) {
    if let Some(port) = cli_args.http_port {
        server_cfg.http_port = port;
    }
    if let Some(bind_addr) = &cli_args.bind_addr {
        server_cfg.bind_addr = bind_addr.clone();
    }
    if let Some(auth_enabled) = cli_args.auth_enabled {
        server_cfg.auth_enabled = auth_enabled;
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cli_args = match parse_cli_args() {
        Ok(args) => args,
        Err(err) => {
            eprintln!("Error: {err}");
            eprintln!();
            print_help();
            std::process::exit(2);
        }
    };
    if cli_args.show_help {
        print_help();
        return;
    }

    info!("Starting Pi Session Manager - CLI Mode");

    // Load configuration
    let mut server_cfg = load_server_settings();
    apply_cli_overrides(&mut server_cfg, &cli_args);
    let runtime_token = cli_args.runtime_token.clone();

    if server_cfg.auth_enabled {
        match pi_session_manager::auth::init() {
            Ok(token) => {
                if let Some(cli_token) = runtime_token.as_ref() {
                    if let Err(e) =
                        pi_session_manager::auth::set_runtime_tokens(vec![cli_token.clone()])
                    {
                        error!("Failed to set runtime token: {}", e);
                        std::process::exit(2);
                    }
                    info!("Auth enabled (runtime token loaded from CLI)");
                } else {
                    let _ = pi_session_manager::auth::set_runtime_tokens(Vec::new());
                    info!("Auth enabled, token: {}", token);
                }
            }
            Err(e) => error!("Failed to init auth: {}", e),
        }
    } else if runtime_token.is_some() {
        warn!("`--token` is ignored because auth is disabled");
    }

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

        // Embedding is opt-in; default disabled.
        let embedding_service = if server_cfg.embedding_enabled {
            let svc = init_embedding_service();
            if svc.is_some() {
                info!("Embedding service initialized");
            } else {
                info!("Embedding requested but model unavailable; embedding disabled");
            }
            svc
        } else {
            info!("Embedding service disabled by configuration");
            None
        };
        let embedding_enabled = embedding_service.is_some();

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
    embedding_enabled: bool,
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

fn default_config_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("pi-session-manager.json")
}

fn load_server_settings() -> ServerConfig {
    // Load from file or use defaults
    let config_path = default_config_path();

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
                auth_enabled: json["auth_enabled"].as_bool().unwrap_or(true),
                embedding_enabled: json["embedding_enabled"].as_bool().unwrap_or(false),
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
        auth_enabled: true,
        embedding_enabled: false,
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

// CLI HTTP adapter (supports read-only v1 APIs)

// CLI HTTP adapter (supports read-only v1 APIs)

async fn init_http_adapter(
    _state: SharedCliState,
    bind_addr: &str,
    port: u16,
    embedding_service: Option<Arc<EmbeddingService>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use axum::extract::Query;
    use axum::{routing::get, routing::post, Json, Router};
    use pi_session_manager::api_readonly;
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

    async fn cli_dispatch(command: &str, payload: Value) -> Result<Value, String> {
        pi_session_manager::dispatch::dispatch(&None, command, &payload).await
    }

    fn json_error(error: api_readonly::ApiReadonlyError) -> Json<Value> {
        Json(serde_json::json!({
            "success": false,
            "error": error.to_string(),
        }))
    }

    fn embedding_error(error: api_readonly::ApiReadonlyError) -> Json<EmbeddingResponse> {
        Json(EmbeddingResponse {
            success: false,
            data: None,
            error: Some(error.to_string()),
        })
    }

    async fn api_handler(Json(body): Json<CmdReq>) -> Json<Value> {
        match pi_session_manager::dispatch::dispatch(&None, &body.command, &body.payload).await {
            Ok(data) => Json(serde_json::json!({ "success": true, "data": data })),
            Err(error) => Json(serde_json::json!({ "success": false, "error": error })),
        }
    }

    async fn v1_sessions(Query(q): Query<SessionsQuery>) -> Json<Value> {
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

        match pi_session_manager::dispatch::dispatch(&None, "scan_sessions", &payload).await {
            Ok(sessions) => Json(serde_json::json!({ "success": true, "data": sessions })),
            Err(error) => Json(serde_json::json!({ "success": false, "error": error })),
        }
    }

    async fn v1_memory_recall(Json(req): Json<api_readonly::SearchRequest>) -> Json<Value> {
        let query_text = match api_readonly::require_query(req.query.clone()) {
            Ok(query) => query,
            Err(error) => return json_error(error),
        };

        match api_readonly::memory_recall(
            &cli_dispatch,
            api_readonly::MemoryRecallRequest {
                query: query_text,
                top_k: req.top_k,
                role_filter: req.role_filter,
                glob_pattern: req.glob_pattern,
                project: req.project,
                from: req.from,
                to: req.to,
            },
        )
        .await
        {
            Ok(result) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "query": result.query,
                    "intent": result.intent,
                    "confidence": result.confidence,
                    "evidence": result.evidence,
                    "next_actions": result.suggested_actions,
                }
            })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_memory_unified(Json(req): Json<api_readonly::SearchRequest>) -> Json<Value> {
        let query_text = match api_readonly::require_query(req.query.clone()) {
            Ok(query) => query,
            Err(error) => return json_error(error),
        };

        match api_readonly::memory_unified(
            &cli_dispatch,
            api_readonly::MemoryUnifiedRequest {
                query: query_text,
                top_k: req.top_k,
                role_filter: req.role_filter,
                glob_pattern: req.glob_pattern,
                project: req.project,
                from: req.from,
                to: req.to,
                experience_limit: req.experience_limit,
            },
            6,
        )
        .await
        {
            Ok(result) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "query": result.query,
                    "intent": result.intent,
                    "confidence": result.confidence,
                    "evidence": result.evidence,
                    "next_actions": result.suggested_actions,
                    "experience": result.experience,
                }
            })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_experience_extract(Json(req): Json<api_readonly::SearchRequest>) -> Json<Value> {
        match api_readonly::experience_extract(
            &cli_dispatch,
            api_readonly::ExperienceExtractRequest {
                session_id: None,
                limit: req.experience_limit,
                project: req.project,
                from: req.from,
                to: req.to,
            },
            8,
        )
        .await
        {
            Ok(result) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "count": result.count,
                    "items": result.items,
                }
            })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_workflow_route(Json(req): Json<api_readonly::SearchRequest>) -> Json<Value> {
        let query_text = match api_readonly::require_query(req.query.clone()) {
            Ok(query) => query,
            Err(error) => return json_error(error),
        };

        match api_readonly::workflow_route_suggest(
            &cli_dispatch,
            api_readonly::WorkflowRouteSuggestRequest {
                query: query_text,
                top_k: req.top_k,
                role_filter: req.role_filter,
                glob_pattern: req.glob_pattern,
                project: req.project,
                from: req.from,
                to: req.to,
            },
        )
        .await
        {
            Ok(result) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "query": result.query,
                    "intent": result.intent,
                    "confidence": result.confidence,
                    "next_actions": result.suggested_actions,
                    "evidence": result.evidence,
                }
            })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_analytics() -> Json<Value> {
        match api_readonly::analytics_overview() {
            Ok(data) => Json(serde_json::json!({ "success": true, "data": data })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_observability() -> Json<Value> {
        match api_readonly::analytics_overview() {
            Ok(overview) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "mode": "readonly",
                    "capabilities": {
                        "memory_recall": true,
                        "memory_unified": true,
                        "experience_extract": true,
                        "workflow_route_suggest": true,
                        "analytics_overview": true,
                    },
                    "overview": overview,
                }
            })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_search_fulltext(Json(req): Json<api_readonly::SearchRequest>) -> Json<Value> {
        let query_text = match api_readonly::require_query(req.query.clone()) {
            Ok(query) => query,
            Err(error) => return json_error(error),
        };
        let top_k = req.top_k.unwrap_or(10).clamp(1, 100);

        match api_readonly::full_text_search(
            &cli_dispatch,
            api_readonly::FullTextSearchRequest {
                query: query_text.clone(),
                role_filter: req.role_filter,
                glob_pattern: req.glob_pattern,
                project: None,
                from: None,
                to: None,
                page: Some(0),
                page_size: Some(top_k),
                match_mode: Some("any".to_string()),
            },
            false,
        )
        .await
        {
            Ok(fts) => Json(serde_json::json!({
                "success": true,
                "data": {
                    "query": query_text,
                    "hits": fts.hits,
                    "total_hits": fts.total_hits,
                    "has_more": fts.has_more,
                }
            })),
            Err(error) => json_error(error),
        }
    }

    async fn handle_metrics() -> &'static str {
        "# HELP pi_sessions_total Total number of sessions
# TYPE pi_sessions_total gauge
pi_sessions_total 0
"
    }

    async fn v1_embedding(
        axum::Extension(svc): axum::Extension<Arc<EmbeddingService>>,
        Json(req): Json<EmbeddingRequest>,
    ) -> Json<EmbeddingResponse> {
        match api_readonly::embedding(svc, req).await {
            Ok(response) => Json(response),
            Err(error) => embedding_error(error),
        }
    }

    async fn v1_embedding_batch(
        axum::Extension(svc): axum::Extension<Arc<EmbeddingService>>,
        Json(req): Json<EmbeddingBatchRequest>,
    ) -> Json<Value> {
        match api_readonly::embedding_batch(svc, req).await {
            Ok(data) => Json(serde_json::json!({ "success": true, "data": data })),
            Err(error) => json_error(error),
        }
    }

    async fn v1_embedding_status(
        axum::Extension(svc): axum::Extension<Arc<EmbeddingService>>,
    ) -> Json<EmbeddingStatusResponse> {
        Json(api_readonly::embedding_status(svc).await)
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
