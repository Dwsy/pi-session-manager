use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiLiveSession {
    pub session_id: String,
    pub session_path: Option<String>,
    pub pid: Option<u32>,
    pub cwd: Option<String>,
    pub is_streaming: bool,
    pub entry_count: u64,
    pub last_seen: String,
    // Session state cache (populated by session_state messages from Pi CLI)
    pub model: Option<serde_json::Value>,
    pub thinking_level: Option<String>,
    pub context_usage: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct PiAgentConnection {
    pub session_id: String,
    /// WebSocket sender for RPC commands (PSM → Pi CLI)
    pub sender: Option<mpsc::UnboundedSender<String>>,
    /// Response channel: wait for Pi CLI responses (Pi CLI → PSM)
    pub response_tx: Option<broadcast::Sender<serde_json::Value>>,
}

#[derive(Debug, Default)]
pub struct PiAgentRegistry {
    sessions: Mutex<HashMap<String, PiLiveSession>>,
    /// Connection registry for RPC channels
    connections: Mutex<HashMap<String, PiAgentConnection>>,
}

impl PiAgentRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            connections: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(
        &self,
        session_id: String,
        session_path: Option<String>,
        pid: Option<u32>,
        cwd: Option<String>,
    ) {
        let now = chrono::Utc::now().to_rfc3339();
        self.sessions.lock().unwrap().insert(
            session_id.clone(),
            PiLiveSession {
                session_id,
                session_path,
                pid,
                cwd,
                is_streaming: false,
                entry_count: 0,
                last_seen: now,
                model: None,
                thinking_level: None,
                context_usage: None,
            },
        );
    }

    pub fn record_entry(&self, session_id: &str, event_type: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        if let Some(s) = self.sessions.lock().unwrap().get_mut(session_id) {
            s.last_seen = now;
            s.entry_count += 1;
            if event_type == "agent_start" {
                s.is_streaming = true;
            }
            if event_type == "agent_end" || event_type == "turn_end" {
                s.is_streaming = false;
            }
        }
    }

    pub fn remove(&self, session_id: &str) {
        self.sessions.lock().unwrap().remove(session_id);
        self.connections.lock().unwrap().remove(session_id);
    }

    pub fn list(&self) -> Vec<PiLiveSession> {
        self.sessions.lock().unwrap().values().cloned().collect()
    }

    // ── Connection management for RPC ───────────────────────

    /// Register a bidirectional RPC connection for a Pi CLI session.
    pub fn register_connection(
        &self,
        session_id: String,
        sender: mpsc::UnboundedSender<String>,
        response_tx: broadcast::Sender<serde_json::Value>,
    ) {
        self.connections.lock().unwrap().insert(
            session_id.clone(),
            PiAgentConnection {
                session_id,
                sender: Some(sender),
                response_tx: Some(response_tx),
            },
        );
    }

    /// Send an RPC command to a connected Pi CLI and wait for the response.
    pub async fn send_rpc(
        &self,
        session_id: &str,
        command: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let conn = {
            let guard = self.connections.lock().unwrap();
            guard
                .get(session_id)
                .cloned()
                .ok_or_else(|| format!("Session not connected: {}", session_id))?
        };

        let sender = conn
            .sender
            .ok_or_else(|| "No sender for session".to_string())?;
        let response_tx = conn
            .response_tx
            .ok_or_else(|| "No response channel for session".to_string())?;

        let mut response_rx = response_tx.subscribe();
        let command_str = serde_json::to_string(&command).map_err(|e| e.to_string())?;

        sender.send(command_str).map_err(|e| e.to_string())?;

        // Wait for response with timeout
        tokio::time::timeout(std::time::Duration::from_secs(30), response_rx.recv())
            .await
            .map_err(|_| "RPC timeout".to_string())?
            .map_err(|e| e.to_string())
    }

    /// Forward a response from Pi CLI to waiting RPC callers.
    pub fn forward_response(&self, session_id: &str, response: serde_json::Value) {
        if let Some(conn) = self.connections.lock().unwrap().get(session_id) {
            if let Some(tx) = &conn.response_tx {
                let _ = tx.send(response);
            }
        }
    }

    /// Update the cached session state (model, thinking level, context usage).
    pub fn update_session_state(
        &self,
        session_id: &str,
        model: Option<serde_json::Value>,
        thinking_level: Option<String>,
        context_usage: Option<serde_json::Value>,
    ) {
        if let Some(s) = self.sessions.lock().unwrap().get_mut(session_id) {
            if model.is_some() {
                s.model = model;
            }
            if thinking_level.is_some() {
                s.thinking_level = thinking_level;
            }
            if context_usage.is_some() {
                s.context_usage = context_usage;
            }
        }
    }

    /// Remove the RPC connection for a session (called on WebSocket disconnect).
    pub fn remove_connection(&self, session_id: &str) {
        self.connections.lock().unwrap().remove(session_id);
    }
}

pub type SharedPiAgentRegistry = Arc<PiAgentRegistry>;
