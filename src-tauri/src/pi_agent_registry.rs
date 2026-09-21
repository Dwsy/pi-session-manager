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
use std::sync::atomic::{AtomicU64, Ordering};
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
    pub available_models: Option<Vec<serde_json::Value>>,
    pub thinking_level: Option<String>,
    pub context_usage: Option<serde_json::Value>,
    pub pending_message_count: Option<u64>,
    pub steering_queue: Option<Vec<String>>,
    pub follow_up_queue: Option<Vec<String>>,
    pub tags: Option<Vec<serde_json::Value>>,
    pub entries: Vec<serde_json::Value>,
}

#[derive(Debug, Default)]
pub struct PiLiveSessionStateUpdate {
    pub model: Option<serde_json::Value>,
    pub available_models: Option<Vec<serde_json::Value>>,
    pub thinking_level: Option<String>,
    pub context_usage: Option<serde_json::Value>,
    pub is_streaming: Option<bool>,
    pub session_path: Option<String>,
    pub tags: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone)]
pub struct PiAgentConnection {
    pub session_id: String,
    pub connection_id: u64,
    pub sender: Option<mpsc::UnboundedSender<String>>,
    pub response_tx: Option<broadcast::Sender<serde_json::Value>>,
}

#[derive(Debug, Default)]
pub struct PiAgentRegistry {
    sessions: Mutex<HashMap<String, PiLiveSession>>,
    connections: Mutex<HashMap<String, PiAgentConnection>>,
    next_connection_id: AtomicU64,
    next_rpc_id: AtomicU64,
}

impl PiAgentRegistry {
    pub fn new() -> Self {
        Self { sessions: Mutex::new(HashMap::new()), connections: Mutex::new(HashMap::new()), next_connection_id: AtomicU64::new(1), next_rpc_id: AtomicU64::new(1) }
    }

    /// Register a new session
    pub fn register(&self, session_id: String, session_path: Option<String>, pid: Option<u32>, cwd: Option<String>, entries: Vec<serde_json::Value>) {
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
                available_models: None,
                thinking_level: None,
                context_usage: None,
                pending_message_count: None,
                steering_queue: None,
                follow_up_queue: None,
                tags: None,
                entries,
            },
        );
    }

    /// Remove a session
    pub fn remove(&self, session_id: &str) {
        self.sessions.lock().expect("mutex poisoned").remove(session_id);
        self.connections.lock().expect("mutex poisoned").remove(session_id);
    }

    /// Record a new entry for a session
    pub fn record_entry(&self, session_id: &str, event_type: &str) {
        self.touch(session_id);
        if matches!(event_type, "message_end" | "tool_execution_end") {
            self.increment_entry_count(session_id);
        }
        if event_type == "agent_start" {
            self.update_streaming_state(session_id, true);
        }
        if event_type == "agent_end" {
            self.update_streaming_state(session_id, false);
        }
    }

    /// List all sessions
    pub fn list(&self) -> Vec<PiLiveSession> {
        self.sessions.lock().expect("mutex poisoned").values().cloned().collect()
    }

    /// Get a session by id (exact or partial match)
    pub fn get_live_session(&self, session_id: &str) -> Option<PiLiveSession> {
        let guard = self.sessions.lock().expect("mutex poisoned");
        guard.get(session_id).cloned().or_else(|| guard.values().find(|s| s.session_id.contains(session_id)).cloned())
    }

    // ── Connection management for RPC ───────────────────────

    /// Register a bidirectional RPC connection
    pub fn register_connection(&self, session_id: String, sender: mpsc::UnboundedSender<String>, response_tx: broadcast::Sender<serde_json::Value>) -> u64 {
        let connection_id = self.next_connection_id.fetch_add(1, Ordering::Relaxed);
        self.connections.lock().expect("mutex poisoned").insert(session_id.clone(), PiAgentConnection { session_id, connection_id, sender: Some(sender), response_tx: Some(response_tx) });
        connection_id
    }

    /// Send an RPC command and wait for response
    pub async fn send_rpc(&self, session_id: &str, command: serde_json::Value) -> Result<serde_json::Value, String> {
        let (full_id, conn) = {
            let guard = self.connections.lock().expect("mutex poisoned");
            let conn = guard.get(session_id).cloned().or_else(|| guard.iter().find(|(k, _)| k.contains(session_id)).map(|(_, v)| v.clone())).ok_or_else(|| format!("Session not connected: {session_id}"))?;
            let key = guard.get(session_id).map(|_| session_id.to_string()).or_else(|| guard.iter().find(|(k, _)| k.contains(session_id)).map(|(k, _)| k.clone())).unwrap_or_else(|| session_id.to_string());
            (key, conn)
        };

        let sender = conn.sender.ok_or_else(|| "No sender for session".to_string())?;
        let response_tx = conn.response_tx.ok_or_else(|| "No response channel for session".to_string())?;

        let mut response_rx = response_tx.subscribe();
        let rpc_id = self.next_rpc_id.fetch_add(1, Ordering::Relaxed);
        let call_id = format!("{full_id}:{rpc_id}");
        let mut command_val = command.clone();
        command_val["id"] = serde_json::json!(call_id);

        let command_str = serde_json::to_string(&command_val).map_err(|e| e.to_string())?;

        log::info!("[RPC] -> [{full_id}] command={:?} id={call_id}", command_val["type"]);
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
                    if resp["id"].as_str() == Some(&call_id) {
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
        let guard = self.connections.lock().expect("mutex poisoned");
        let conn = guard.get(session_id).or_else(|| guard.iter().find(|(key, _)| key.contains(session_id)).map(|(_, connection)| connection));
        if let Some(tx) = conn.and_then(|connection| connection.response_tx.as_ref()) {
            let _ = tx.send(response);
        }
    }

    /// Update session state (model, thinking level, context usage)
    pub fn update_session_state(&self, session_id: &str, update: PiLiveSessionStateUpdate) {
        if let Some(s) = self.sessions.lock().expect("mutex poisoned").get_mut(session_id) {
            if update.model.is_some() {
                s.model = update.model;
            }
            if update.available_models.is_some() {
                s.available_models = update.available_models;
            }
            if update.thinking_level.is_some() {
                s.thinking_level = update.thinking_level;
            }
            if update.context_usage.is_some() {
                s.context_usage = update.context_usage;
            }
            if let Some(is_streaming) = update.is_streaming {
                s.is_streaming = is_streaming;
            }
            if update.session_path.is_some() {
                s.session_path = update.session_path;
            }
            if update.tags.is_some() {
                s.tags = update.tags;
            }
            s.last_seen = chrono::Utc::now().to_rfc3339();
        }
    }

    pub fn update_queue_state(&self, session_id: &str, steering: Vec<String>, follow_up: Vec<String>) {
        if let Some(s) = self.sessions.lock().expect("mutex poisoned").get_mut(session_id) {
            s.pending_message_count = Some((steering.len() + follow_up.len()) as u64);
            s.steering_queue = Some(steering);
            s.follow_up_queue = Some(follow_up);
            s.last_seen = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Update session entries
    pub fn update_session_entries(&self, session_id: &str, entries: Vec<serde_json::Value>) {
        if let Some(s) = self.sessions.lock().expect("mutex poisoned").get_mut(session_id) {
            s.entries = entries;
            s.entry_count = s.entries.len() as u64;
        }
    }

    /// Update streaming state
    pub fn update_streaming_state(&self, session_id: &str, is_streaming: bool) {
        if let Some(s) = self.sessions.lock().expect("mutex poisoned").get_mut(session_id) {
            s.is_streaming = is_streaming;
        }
    }

    /// Increment entry count
    pub fn increment_entry_count(&self, session_id: &str) {
        if let Some(s) = self.sessions.lock().expect("mutex poisoned").get_mut(session_id) {
            s.entry_count += 1;
        }
    }

    /// Update last_seen timestamp
    pub fn touch(&self, session_id: &str) {
        if let Some(s) = self.sessions.lock().expect("mutex poisoned").get_mut(session_id) {
            s.last_seen = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Remove a session only when the disconnect belongs to the currently registered connection.
    pub fn remove_if_connection(&self, session_id: &str, connection_id: u64) -> bool {
        let mut connections = self.connections.lock().expect("mutex poisoned");
        let is_current = connections.get(session_id).is_some_and(|connection| connection.connection_id == connection_id);
        if !is_current {
            return false;
        }
        connections.remove(session_id);
        drop(connections);
        self.sessions.lock().expect("mutex poisoned").remove(session_id);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_entry_counts_only_completed_entries_and_tracks_streaming() {
        let registry = PiAgentRegistry::new();
        registry.register("session-1".into(), None, None, None, vec![serde_json::json!({"type": "existing"})]);

        registry.record_entry("session-1", "agent_start");
        registry.record_entry("session-1", "message_update");
        assert_eq!(registry.get_live_session("session-1").unwrap().entry_count, 1);
        assert!(registry.get_live_session("session-1").unwrap().is_streaming);

        registry.record_entry("session-1", "message_end");
        registry.record_entry("session-1", "tool_execution_end");
        registry.record_entry("session-1", "agent_end");
        let session = registry.get_live_session("session-1").unwrap();
        assert_eq!(session.entry_count, 3);
        assert!(!session.is_streaming);
    }

    #[tokio::test]
    async fn concurrent_rpc_calls_are_correlated_by_unique_ids() {
        let registry = Arc::new(PiAgentRegistry::new());
        registry.register("pi:session-1".into(), None, None, None, vec![]);
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel();
        let (resp_tx, _) = broadcast::channel(4);
        registry.register_connection("pi:session-1".into(), cmd_tx, resp_tx);

        let first_registry = registry.clone();
        let first = tokio::spawn(async move { first_registry.send_rpc("session-1", serde_json::json!({"type": "get_state"})).await.unwrap() });
        let second_registry = registry.clone();
        let second = tokio::spawn(async move { second_registry.send_rpc("session-1", serde_json::json!({"type": "get_commands"})).await.unwrap() });

        let first_command: serde_json::Value = serde_json::from_str(&cmd_rx.recv().await.unwrap()).unwrap();
        let second_command: serde_json::Value = serde_json::from_str(&cmd_rx.recv().await.unwrap()).unwrap();
        let first_id = first_command["id"].as_str().unwrap().to_string();
        let second_id = second_command["id"].as_str().unwrap().to_string();
        assert_ne!(first_id, second_id);

        registry.forward_response("session-1", serde_json::json!({"type": "response", "id": second_id, "success": true, "data": "second"}));
        registry.forward_response("session-1", serde_json::json!({"type": "response", "id": first_id, "success": true, "data": "first"}));

        let first_response = first.await.unwrap();
        let second_response = second.await.unwrap();
        let payloads = [first_response["data"].as_str().unwrap(), second_response["data"].as_str().unwrap()];
        assert!(payloads.contains(&"first"));
        assert!(payloads.contains(&"second"));
    }

    #[test]
    fn stale_connection_cannot_remove_replacement_session() {
        let registry = PiAgentRegistry::new();
        registry.register("session-1".into(), None, None, None, vec![]);
        let (cmd_tx, _cmd_rx) = mpsc::unbounded_channel();
        let (resp_tx, _) = broadcast::channel(4);
        let old_id = registry.register_connection("session-1".into(), cmd_tx, resp_tx);

        registry.register("session-1".into(), None, None, None, vec![]);
        let (cmd_tx, _cmd_rx) = mpsc::unbounded_channel();
        let (resp_tx, _) = broadcast::channel(4);
        let current_id = registry.register_connection("session-1".into(), cmd_tx, resp_tx);

        assert!(!registry.remove_if_connection("session-1", old_id));
        assert!(registry.get_live_session("session-1").is_some());
        assert!(registry.remove_if_connection("session-1", current_id));
        assert!(registry.get_live_session("session-1").is_none());
    }
}

pub type SharedPiAgentRegistry = Arc<PiAgentRegistry>;
