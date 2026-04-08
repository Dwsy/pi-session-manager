/**
 * Pi Agent Registry - Lightweight In-Memory Session Table
 *
 * Responsibilities:
 * - In-memory session table (HashMap<session_id, PiLiveSession>)
 * - RPC connection channel registration and response forwarding
 * - Basic CRUD operations
 *
 * NOT responsible for:
 * - Protocol parsing
 * - Event type handling
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiLiveSession {
    pub session_id: String,
    pub session_path: Option<String>,
    pub pid: Option<u32>,
    pub cwd: Option<String>,
    pub is_streaming: bool,
    pub entry_count: u64,
    pub last_seen: String,
    pub model: Option<serde_json::Value>,
    pub thinking_level: Option<String>,
    pub context_usage: Option<serde_json::Value>,
    pub entries: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct PiAgentConnection {
    pub session_id: String,
    pub sender: Option<mpsc::UnboundedSender<String>>,
    pub response_tx: Option<broadcast::Sender<serde_json::Value>>,
}

#[derive(Debug, Default)]
pub struct PiAgentRegistry {
    sessions: Mutex<HashMap<String, PiLiveSession>>,
    connections: Mutex<HashMap<String, PiAgentConnection>>,
}

impl PiAgentRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            connections: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new session
    pub fn register(
        &self,
        session_id: String,
        session_path: Option<String>,
        pid: Option<u32>,
        cwd: Option<String>,
        entries: Vec<serde_json::Value>,
    ) {
        let now = chrono::Utc::now().to_rfc3339();
        self.sessions.lock().expect("mutex poisoned").insert(
            session_id.clone(),
            PiLiveSession {
                session_id,
                session_path,
                pid,
                cwd,
                is_streaming: false,
                entry_count: entries.len() as u64,
                last_seen: now,
                model: None,
                thinking_level: None,
                context_usage: None,
                entries,
            },
        );
    }

    /// Remove a session
    pub fn remove(&self, session_id: &str) {
        self.sessions
            .lock()
            .expect("mutex poisoned")
            .remove(session_id);
        self.connections
            .lock()
            .expect("mutex poisoned")
            .remove(session_id);
    }

    /// Record a new entry for a session
    pub fn record_entry(&self, session_id: &str, event_type: &str) {
        self.touch(session_id);
        self.increment_entry_count(session_id);
        if event_type == "agent_start" {
            self.update_streaming_state(session_id, true);
        }
        if event_type == "agent_end" || event_type == "turn_end" {
            self.update_streaming_state(session_id, false);
        }
    }

    /// List all sessions
    pub fn list(&self) -> Vec<PiLiveSession> {
        self.sessions
            .lock()
            .expect("mutex poisoned")
            .values()
            .cloned()
            .collect()
    }

    /// Get a session by id (exact or partial match)
    pub fn get_live_session(&self, session_id: &str) -> Option<PiLiveSession> {
        let guard = self.sessions.lock().expect("mutex poisoned");
        guard.get(session_id).cloned().or_else(|| {
            guard
                .values()
                .find(|s| s.session_id.contains(session_id))
                .cloned()
        })
    }

    // ── Connection management for RPC ───────────────────────

    /// Register a bidirectional RPC connection
    pub fn register_connection(
        &self,
        session_id: String,
        sender: mpsc::UnboundedSender<String>,
        response_tx: broadcast::Sender<serde_json::Value>,
    ) {
        self.connections.lock().expect("mutex poisoned").insert(
            session_id.clone(),
            PiAgentConnection {
                session_id,
                sender: Some(sender),
                response_tx: Some(response_tx),
            },
        );
    }

    /// Send an RPC command and wait for response
    pub async fn send_rpc(
        &self,
        session_id: &str,
        command: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let (full_id, conn) = {
            let guard = self.connections.lock().expect("mutex poisoned");
            let conn = guard
                .get(session_id)
                .cloned()
                .or_else(|| {
                    guard
                        .iter()
                        .find(|(k, _)| k.contains(session_id))
                        .map(|(_, v)| v.clone())
                })
                .ok_or_else(|| format!("Session not connected: {session_id}"))?;
            let key = guard
                .get(session_id)
                .map(|_| session_id.to_string())
                .or_else(|| {
                    guard
                        .iter()
                        .find(|(k, _)| k.contains(session_id))
                        .map(|(k, _)| k.clone())
                })
                .unwrap_or_else(|| session_id.to_string());
            (key, conn)
        };

        let sender = conn
            .sender
            .ok_or_else(|| "No sender for session".to_string())?;
        let response_tx = conn
            .response_tx
            .ok_or_else(|| "No response channel for session".to_string())?;

        let mut response_rx = response_tx.subscribe();
        let call_id = session_id.to_string();
        let mut command_val = command.clone();
        command_val["id"] = serde_json::json!(call_id);

        let command_str = serde_json::to_string(&command_val).map_err(|e| e.to_string())?;

        log::info!(
            "[RPC] -> [{full_id}] command={:?} id={call_id}",
            command_val["type"]
        );
        sender.send(command_str).map_err(|e| e.to_string())?;

        // Wait for response with timeout
        let start = std::time::Instant::now();
        let timeout_duration = std::time::Duration::from_secs(30);

        loop {
            let elapsed = start.elapsed();
            if elapsed >= timeout_duration {
                return Err(format!("RPC timeout for session {full_id} (id={call_id})"));
            }

            match tokio::time::timeout(timeout_duration - elapsed, response_rx.recv()).await {
                Ok(Ok(resp)) => {
                    if resp["id"].as_str() == Some(&call_id) || resp["id"].is_null() {
                        log::info!("[RPC] <- [{full_id}] matched id={call_id}");
                        return Ok(resp);
                    }
                }
                Ok(Err(e)) => return Err(e.to_string()),
                Err(_) => return Err(format!("RPC timeout for session {full_id} (id={call_id})")),
            }
        }
    }

    /// Forward a response to waiting RPC callers
    pub fn forward_response(&self, session_id: &str, response: serde_json::Value) {
        if let Some(conn) = self
            .connections
            .lock()
            .expect("mutex poisoned")
            .get(session_id)
        {
            if let Some(tx) = &conn.response_tx {
                let _ = tx.send(response);
            }
        }
    }

    /// Update session state (model, thinking level, context usage)
    pub fn update_session_state(
        &self,
        session_id: &str,
        model: Option<serde_json::Value>,
        thinking_level: Option<String>,
        context_usage: Option<serde_json::Value>,
    ) {
        if let Some(s) = self
            .sessions
            .lock()
            .expect("mutex poisoned")
            .get_mut(session_id)
        {
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

    /// Update session entries
    pub fn update_session_entries(&self, session_id: &str, entries: Vec<serde_json::Value>) {
        if let Some(s) = self
            .sessions
            .lock()
            .expect("mutex poisoned")
            .get_mut(session_id)
        {
            s.entries = entries;
            s.entry_count = s.entries.len() as u64;
        }
    }

    /// Update streaming state
    pub fn update_streaming_state(&self, session_id: &str, is_streaming: bool) {
        if let Some(s) = self
            .sessions
            .lock()
            .expect("mutex poisoned")
            .get_mut(session_id)
        {
            s.is_streaming = is_streaming;
        }
    }

    /// Increment entry count
    pub fn increment_entry_count(&self, session_id: &str) {
        if let Some(s) = self
            .sessions
            .lock()
            .expect("mutex poisoned")
            .get_mut(session_id)
        {
            s.entry_count += 1;
        }
    }

    /// Update last_seen timestamp
    pub fn touch(&self, session_id: &str) {
        if let Some(s) = self
            .sessions
            .lock()
            .expect("mutex poisoned")
            .get_mut(session_id)
        {
            s.last_seen = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Remove RPC connection only (session data preserved)
    pub fn remove_connection(&self, session_id: &str) {
        self.connections
            .lock()
            .expect("mutex poisoned")
            .remove(session_id);
    }
}

pub type SharedPiAgentRegistry = Arc<PiAgentRegistry>;
