//! Application State - Shared state for both Tauri IPC and WebSocket channels

use crate::pi_rpc::{create_rpc_pool, SharedRPCClient, SharedRPCPool};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;

/// WebSocket event for broadcasting to clients
#[derive(Debug, Clone, serde::Serialize)]
pub struct WsEvent {
    pub event_type: String,
    pub event: String,
    pub payload: serde_json::Value,
}

/// Application state shared across all channels
pub struct AppState {
    pub rpc_client: SharedRPCClient,
    pub rpc_pool: SharedRPCPool,
    pub app_handle: AppHandle,
    pub event_tx: broadcast::Sender<WsEvent>,
}

impl AppState {
    pub fn new(rpc_client: SharedRPCClient, app_handle: AppHandle) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            rpc_client,
            rpc_pool: create_rpc_pool(),
            app_handle,
            event_tx,
        }
    }

    pub fn broadcast_event(&self, event: WsEvent) {
        let _ = self.event_tx.send(event);
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<WsEvent> {
        self.event_tx.subscribe()
    }
}

/// Shared application state type
pub type SharedAppState = Arc<AppState>;

/// Create a new shared application state
pub fn create_app_state(rpc_client: SharedRPCClient, app_handle: AppHandle) -> SharedAppState {
    Arc::new(AppState::new(rpc_client, app_handle))
}
