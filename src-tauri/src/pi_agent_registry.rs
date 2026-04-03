use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiLiveSession {
    pub session_id: String,
    pub session_path: Option<String>,
    pub pid: Option<u32>,
    pub cwd: Option<String>,
    pub is_streaming: bool,
    pub entry_count: u64,
    pub last_seen: String,
}

#[derive(Debug, Default)]
pub struct PiAgentRegistry {
    sessions: Mutex<HashMap<String, PiLiveSession>>,
}

impl PiAgentRegistry {
    pub fn new() -> Self {
        Self { sessions: Mutex::new(HashMap::new()) }
    }

    pub fn register(&self, session_id: String, session_path: Option<String>, pid: Option<u32>, cwd: Option<String>) {
        let now = chrono::Utc::now().to_rfc3339();
        self.sessions.lock().unwrap().insert(session_id.clone(), PiLiveSession {
            session_id, session_path, pid, cwd,
            is_streaming: false, entry_count: 0, last_seen: now,
        });
    }

    pub fn record_entry(&self, session_id: &str, event_type: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        if let Some(s) = self.sessions.lock().unwrap().get_mut(session_id) {
            s.last_seen = now;
            s.entry_count += 1;
            if event_type == "agent_start" { s.is_streaming = true; }
            if event_type == "agent_end" || event_type == "turn_end" { s.is_streaming = false; }
        }
    }

    pub fn remove(&self, session_id: &str) {
        self.sessions.lock().unwrap().remove(session_id);
    }

    pub fn list(&self) -> Vec<PiLiveSession> {
        self.sessions.lock().unwrap().values().cloned().collect()
    }
}

pub type SharedPiAgentRegistry = Arc<PiAgentRegistry>;
