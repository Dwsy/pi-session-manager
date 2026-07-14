//! Embedding Service - Local GGUF model inference via node-llama-cpp
//!
//! Provides HTTP endpoints for text embedding generation using local models.
//! Manages a node-llama-cpp child process for model inference.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tracing::{error, info};

/// Embedding service configuration
#[derive(Clone, Debug)]
pub struct EmbeddingConfig {
    pub enabled: bool,
    pub model_path: PathBuf,
    pub port: u16,
    pub auto_release_minutes: u64,
    pub node_path: Option<String>,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        let home = crate::paths::pi_root_dir().unwrap_or_default();
        Self { enabled: true, model_path: home.join("models/embedding-models/embeddinggemma-300M-Q8_0.gguf"), port: 11435, auto_release_minutes: 5, node_path: None }
    }
}

/// Embedding service state
pub struct EmbeddingService {
    config: EmbeddingConfig,
    child_process: Arc<Mutex<Option<Child>>>,
    last_used: Arc<Mutex<std::time::Instant>>,
}

impl EmbeddingService {
    /// Get the service configuration
    pub fn config(&self) -> &EmbeddingConfig {
        &self.config
    }
    pub fn new(config: EmbeddingConfig) -> Self {
        Self { config, child_process: Arc::new(Mutex::new(None)), last_used: Arc::new(Mutex::new(std::time::Instant::now())) }
    }

    /// Ensure the embedding server is running
    pub async fn ensure_running(&self) -> Result<String, String> {
        let mut child = self.child_process.lock().await;

        if child.is_none() {
            self.start(&mut child).await?;
        }

        // Update last used time
        *self.last_used.lock().await = std::time::Instant::now();

        Ok(format!("http://127.0.0.1:{}", self.config.port))
    }

    /// Start the embedding server process
    async fn start(&self, child: &mut Option<Child>) -> Result<(), String> {
        if !self.config.model_path.exists() {
            return Err(format!("Model file not found: {}", self.config.model_path.display()));
        }

        let node = self.config.node_path.as_deref().unwrap_or("node");
        let script_path = Self::get_server_script_path()?;

        info!("Starting embedding server with model: {}", self.config.model_path.display());

        let new_child = Command::new(node).arg(&script_path).arg("--model").arg(&self.config.model_path).arg("--port").arg(self.config.port.to_string()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("Failed to start embedding server: {e}"))?;

        *child = Some(new_child);

        // Wait for server to be ready
        sleep(Duration::from_secs(2)).await;

        match self.check_health().await {
            Ok(_) => {
                info!("Embedding server ready on port {}", self.config.port);
                Ok(())
            }
            Err(e) => {
                error!("Embedding server failed to start: {}", e);
                if let Some(c) = child.as_mut() {
                    let _ = c.kill();
                }
                *child = None;
                Err(e)
            }
        }
    }

    /// Check if the embedding server is healthy
    async fn check_health(&self) -> Result<(), String> {
        let url = format!("http://127.0.0.1:{}/health", self.config.port);

        match reqwest::get(&url).await {
            Ok(resp) if resp.status().is_success() => Ok(()),
            Ok(resp) => Err(format!("Health check failed: {}", resp.status())),
            Err(e) => Err(format!("Health check error: {e}")),
        }
    }

    /// Stop the embedding server
    pub async fn stop(&self) {
        let mut child = self.child_process.lock().await;
        if let Some(mut c) = child.take() {
            info!("Stopping embedding server");
            let _ = c.kill();
        }
    }

    /// Get the path to the embedding server script
    fn get_server_script_path() -> Result<PathBuf, String> {
        // Try to find the script relative to the executable
        let exe_dir = std::env::current_exe().map_err(|e| format!("Failed to get exe dir: {e}"))?.parent().ok_or("No parent dir")?.to_path_buf();

        let script_path = exe_dir.join("embedding-server.mjs");
        if script_path.exists() {
            return Ok(script_path);
        }

        // Fallback to project directory
        let project_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("scripts").join("embedding-server.mjs");

        if project_path.exists() {
            return Ok(project_path);
        }

        Err("embedding-server.mjs not found".to_string())
    }

    /// Start auto-release background task
    pub fn start_auto_release(self: Arc<Self>) {
        let minutes = self.config.auto_release_minutes;
        if minutes == 0 {
            return;
        }

        tokio::spawn(async move {
            loop {
                sleep(Duration::from_secs(60)).await;

                let last_used = *self.last_used.lock().await;
                let idle_duration = std::time::Instant::now() - last_used;

                if idle_duration > Duration::from_secs(minutes * 60) {
                    let child_exists = self.child_process.lock().await.is_some();
                    if child_exists {
                        info!("Auto-releasing embedding server after {} minutes idle", minutes);
                        self.stop().await;
                    }
                }
            }
        });
    }
}

// ============================================================================
// HTTP Handlers
// ============================================================================

#[derive(Deserialize)]
pub struct EmbeddingRequest {
    pub text: String,
    #[serde(default)]
    pub normalize: bool,
}

#[derive(Deserialize)]
pub struct EmbeddingBatchRequest {
    pub texts: Vec<String>,
    #[serde(default)]
    pub normalize: bool,
}

#[derive(Serialize)]
pub struct EmbeddingResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<EmbeddingData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct EmbeddingData {
    pub embedding: Vec<f32>,
    pub dimensions: usize,
    pub model: String,
    pub normalized: bool,
}

#[derive(Serialize)]
pub struct EmbeddingStatusResponse {
    pub ready: bool,
    pub model_loaded: bool,
    pub model: Option<String>,
    pub dimensions: usize,
    pub memory_mb: Option<u64>,
}

fn cors_headers() -> [(&'static str, &'static str); 4] {
    [("access-control-allow-origin", "http://localhost:1420"), ("access-control-allow-methods", "GET, POST, OPTIONS"), ("access-control-allow-headers", "content-type, authorization"), ("vary", "Origin")]
}

/// POST /v1/embedding - Generate embedding for single text
pub async fn v1_embedding(State(service): State<Arc<EmbeddingService>>, Json(req): Json<EmbeddingRequest>) -> impl IntoResponse {
    let endpoint = match service.ensure_running().await {
        Ok(url) => url,
        Err(e) => {
            return (StatusCode::SERVICE_UNAVAILABLE, cors_headers(), Json(EmbeddingResponse { success: false, data: None, error: Some(e) })).into_response();
        }
    };

    let client = reqwest::Client::new();
    let url = format!("{endpoint}/embed");

    let payload = serde_json::json!({
        "text": req.text,
        "normalize": req.normalize,
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(data) => {
                let embedding = data.get("embedding").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect::<Vec<_>>()).unwrap_or_default();

                (StatusCode::OK, cors_headers(), Json(EmbeddingResponse { success: true, data: Some(EmbeddingData { dimensions: embedding.len(), embedding, model: "embeddinggemma-300m-qat-q8_0".to_string(), normalized: req.normalize }), error: None })).into_response()
            }
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, cors_headers(), Json(EmbeddingResponse { success: false, data: None, error: Some(format!("Failed to parse response: {e}")) })).into_response(),
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, cors_headers(), Json(EmbeddingResponse { success: false, data: None, error: Some(format!("Request failed: {e}")) })).into_response(),
    }
}

/// POST /v1/embedding/batch - Generate embeddings for multiple texts
pub async fn v1_embedding_batch(State(service): State<Arc<EmbeddingService>>, Json(req): Json<EmbeddingBatchRequest>) -> impl IntoResponse {
    let endpoint = match service.ensure_running().await {
        Ok(url) => url,
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                cors_headers(),
                Json(serde_json::json!({
                    "success": false,
                    "error": e
                })),
            )
                .into_response();
        }
    };

    let client = reqwest::Client::new();
    let url = format!("{endpoint}/embed/batch");

    let payload = serde_json::json!({
        "texts": req.texts,
        "normalize": req.normalize,
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(data) => (
                StatusCode::OK,
                cors_headers(),
                Json(serde_json::json!({
                    "success": true,
                    "data": data
                })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                cors_headers(),
                Json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to parse response: {}", e)
                })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            cors_headers(),
            Json(serde_json::json!({
                "success": false,
                "error": format!("Request failed: {}", e)
            })),
        )
            .into_response(),
    }
}

/// GET /v1/embedding/status - Get embedding service status
pub async fn v1_embedding_status(State(service): State<Arc<EmbeddingService>>) -> impl IntoResponse {
    let endpoint = format!("http://127.0.0.1:{}/health", service.config.port);

    let (ready, model_loaded) = match reqwest::get(&endpoint).await {
        Ok(resp) if resp.status().is_success() => (true, true),
        _ => (false, false),
    };

    (StatusCode::OK, cors_headers(), Json(EmbeddingStatusResponse { ready, model_loaded, model: Some("embeddinggemma-300m-qat-q8_0".to_string()), dimensions: 768, memory_mb: None })).into_response()
}
