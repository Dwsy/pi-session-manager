//! Pi CLI RPC 通信模块
//!
//! 提供与 Pi CLI 的 stdin/stdout JSON RPC 通信能力
//!
//! # 架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                        前端 (React)                          │
//! │                    ┌──────────────────┐                     │
//! │                    │   usePiRPC hook   │                     │
//! │                    └────────┬─────────┘                     │
//! └─────────────────────────────┼───────────────────────────────┘
//!                               │ Tauri Event
//! ┌─────────────────────────────┼───────────────────────────────┐
//! │                      Tauri 后端                              │
//! │  ┌──────────────────────────┼───────────────────────────┐   │
//! │  │  ┌──────────────────┐    │    ┌──────────────────┐   │   │
//! │  │  │   PiRPCClient    │◄───┼───►│   Pi CLI Process │   │   │
//! │  │  │   (client.rs)    │    │    │   (--mode rpc)   │   │   │
//! │  │  └──────────────────┘    │    └──────────────────┘   │   │
//! │  │           │              │                           │   │
//! │  │  ┌────────▼─────────┐    │                           │   │
//! │  │  │  Event Forwarder │────┼───► emit("pi-rpc-event")  │   │   │
//! │  │  └──────────────────┘    │                           │   │
//! │  └──────────────────────────┼───────────────────────────┘   │
//! └─────────────────────────────┼───────────────────────────────┘
//! ```
//!
//! # 使用示例
//!
//! ## 后端 - 启动 RPC 客户端
//!
//! ```rust
//! use pi_rpc::{PiRPCClient, RPCEvent};
//! use tokio::sync::mpsc;
//!
//! let (event_tx, mut event_rx) = mpsc::channel(100);
//! let client = PiRPCClient::new("pi", event_tx).await?;
//!
//! // 发送命令
//! client.send_command(RPCCommand::GetMessages).await?;
//! ```
//!
//! ## 前端 - 订阅 RPC 事件
//!
//! ```typescript
//! import { listen } from '@tauri-apps/api/event';
//!
//! const unlisten = await listen<RPCEvent>('pi-rpc-event', (event) => {
//!   console.log('Received:', event.payload);
//! });
//! ```

pub mod client;
pub mod detector;
pub mod types;

// 重新导出主要类型
pub use client::{PiRPCClient, RPCState};
pub use detector::{detect_rpc_support, find_pi_path, RPCDetectionResult};
pub use types::{
    AssistantMessageEvent, RPCCommand, RPCEvent, RPCMessage, RPCMessageRole, RPCModel, RPCPhase,
    RPCSessionState, RPCSessionStats, RPCTokens, RPCToolStatus, SlashCommandInfo,
    StreamingBehavior, ThinkingLevel, ToolCallData,
};

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// 全局 RPC 客户端实例（单客户端，保留向后兼容）
pub type SharedRPCClient = Arc<Mutex<Option<PiRPCClient>>>;

/// 创建新的共享 RPC 客户端实例
pub fn create_shared_client() -> SharedRPCClient {
    Arc::new(Mutex::new(None))
}

/// Multi-project RPC pool: one PiRPCClient per working directory.
/// Inspired by pi-island-ref SessionManager.
pub struct RPCPool {
    clients: HashMap<String, PiRPCClient>,
    active_cwd: Option<String>,
}

impl RPCPool {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
            active_cwd: None,
        }
    }

    pub fn active_cwd(&self) -> Option<&str> {
        self.active_cwd.as_deref()
    }

    pub fn set_active_cwd(&mut self, cwd: Option<String>) {
        self.active_cwd = cwd;
    }

    pub fn get_active(&self) -> Option<&PiRPCClient> {
        self.active_cwd
            .as_ref()
            .and_then(|cwd| self.clients.get(cwd))
    }

    pub fn get_active_mut(&mut self) -> Option<&mut PiRPCClient> {
        let cwd = self.active_cwd.clone()?;
        self.clients.get_mut(&cwd)
    }

    pub fn get(&self, cwd: &str) -> Option<&PiRPCClient> {
        self.clients.get(cwd)
    }

    pub fn get_mut(&mut self, cwd: &str) -> Option<&mut PiRPCClient> {
        self.clients.get_mut(cwd)
    }

    pub fn insert(&mut self, cwd: String, client: PiRPCClient) {
        self.clients.insert(cwd, client);
    }

    pub fn remove(&mut self, cwd: &str) -> Option<PiRPCClient> {
        if self.active_cwd.as_deref() == Some(cwd) {
            self.active_cwd = None;
        }
        self.clients.remove(cwd)
    }

    pub fn contains(&self, cwd: &str) -> bool {
        self.clients.contains_key(cwd)
    }

    pub fn list_projects(&self) -> Vec<ProjectInfo> {
        self.clients
            .iter()
            .map(|(cwd, client)| ProjectInfo {
                cwd: cwd.clone(),
                is_active: self.active_cwd.as_deref() == Some(cwd.as_str()),
                session_file: None, // filled by caller if needed
            })
            .collect()
    }

    pub async fn shutdown_all(&mut self) {
        let cwds: Vec<String> = self.clients.keys().cloned().collect();
        for cwd in cwds {
            if let Some(mut client) = self.clients.remove(&cwd) {
                let _ = client.shutdown().await;
            }
        }
        self.active_cwd = None;
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectInfo {
    pub cwd: String,
    pub is_active: bool,
    pub session_file: Option<String>,
}

pub type SharedRPCPool = Arc<Mutex<RPCPool>>;

pub fn create_rpc_pool() -> SharedRPCPool {
    Arc::new(Mutex::new(RPCPool::new()))
}

/// 模块版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
