use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, error};

// CLI 专用状态（无 Tauri 依赖）
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
    
    // 加载配置
    let server_cfg = load_server_settings();
    
    // 创建状态
    let state = Arc::new(CliAppState::new());
    
    // 启动 WebSocket 服务
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
    
    // 启动 HTTP 服务
    if server_cfg.http_enabled {
        let http_state = state.clone();
        let http_port = server_cfg.http_port;
        let http_bind = server_cfg.bind_addr.clone();
        let http_bind_log = http_bind.clone();
        tokio::spawn(async move {
            if let Err(e) = init_http_adapter(http_state, &http_bind, http_port).await {
                error!("HTTP adapter failed: {}", e);
            }
        });
        info!("HTTP: http://{}:{}/api", http_bind_log, http_port);
    }
    
    info!("CLI mode running. Press Ctrl+C to exit.");
    
    // 保持运行
    tokio::signal::ctrl_c().await.expect("Failed to listen for ctrl+c");
    info!("Shutting down...");
}

// 简化的配置加载
#[derive(Debug, Clone)]
struct ServerConfig {
    ws_enabled: bool,
    http_enabled: bool,
    ws_port: u16,
    http_port: u16,
    bind_addr: String,
    auth_enabled: bool,
}

fn load_server_settings() -> ServerConfig {
    // 从文件加载或默认
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
                bind_addr: json["bind_addr"].as_str().unwrap_or("127.0.0.1").to_string(),
                auth_enabled: json["auth_enabled"].as_bool().unwrap_or(false),
            };
        }
    }
    
    // 默认配置
    ServerConfig {
        ws_enabled: true,
        http_enabled: true,
        ws_port: 52130,
        http_port: 52131,
        bind_addr: "127.0.0.1".to_string(),
        auth_enabled: false,
    }
}

// 简化的 WS 适配器（复用原逻辑但适配 CLI 状态）
async fn init_ws_adapter(
    state: SharedCliState,
    bind_addr: &str,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    use tokio::net::TcpListener;
    use tokio_tungstenite::accept_async;
    use futures_util::{SinkExt, StreamExt};
    
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
            
            // 简单 echo + 命令处理
            while let Some(msg) = receiver.next().await {
                if let Ok(msg) = msg {
                    if let Ok(text) = msg.to_text() {
                        // 简单处理：解析 JSON 命令
                        if let Ok(req) = serde_json::from_str::<serde_json::Value>(text) {
                            let cmd = req["command"].as_str().unwrap_or("unknown");
                            let response = match cmd {
                                "scan_sessions" => {
                                    // 简化实现
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
                            let _ = sender.send(tokio_tungstenite::tungstenite::Message::Text(
                                response.to_string()
                            )).await;
                        }
                    }
                }
            }
        });
    }
    
    Ok(())
}

// 简化的 HTTP 适配器
async fn init_http_adapter(
    _state: SharedCliState,
    bind_addr: &str,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    use axum::{Router, routing::post, Json};
    use serde_json::Value;
    
    async fn api_handler(Json(body): Json<Value>) -> Json<Value> {
        let cmd = body["command"].as_str().unwrap_or("unknown");
        Json(serde_json::json!({
            "success": false,
            "error": format!("Command '{}' not implemented in CLI mode", cmd)
        }))
    }
    
    let app = Router::new()
        .route("/api", post(api_handler));
    
    let addr = format!("{bind_addr}:{port}");
    info!("HTTP listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}
