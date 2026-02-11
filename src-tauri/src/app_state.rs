use crate::terminal::TerminalManager;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;
use tokio::sync::broadcast;

#[derive(Debug, Clone, serde::Serialize)]
pub struct WsEvent {
    pub event_type: String,
    pub event: String,
    pub payload: serde_json::Value,
}

pub struct AppState {
    pub app_handle: AppHandle,
    pub event_tx: broadcast::Sender<WsEvent>,
    pub terminal_manager: Mutex<TerminalManager>,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            app_handle,
            event_tx,
            terminal_manager: Mutex::new(TerminalManager::new()),
        }
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<WsEvent> {
        self.event_tx.subscribe()
    }
}

pub type SharedAppState = Arc<AppState>;

pub fn create_app_state(app_handle: AppHandle) -> SharedAppState {
    Arc::new(AppState::new(app_handle))
}
