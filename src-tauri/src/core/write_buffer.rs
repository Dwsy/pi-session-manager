use crate::core::parser::SessionDetails;
use crate::types::SessionInfo;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const BUFFER_FLUSH_INTERVAL: Duration = Duration::from_secs(30);
const BUFFER_SIZE_THRESHOLD: usize = 50;
/// Maximum capacity for session and detail buffers to prevent unbounded memory growth.
const MAX_SESSION_BUFFER: usize = 1000;
const MAX_DETAILS_BUFFER: usize = 1000;

#[derive(Clone, Debug)]
pub struct SessionCacheEntry {
    pub session: SessionInfo,
    pub file_modified: DateTime<Utc>,
    pub cached_at: Instant,
}

#[derive(Clone, Debug)]
pub struct DetailsCacheEntry {
    pub path: String,
    pub details: SessionDetails,
    pub file_modified: DateTime<Utc>,
    pub cached_at: Instant,
}

struct WriteBuffer {
    sessions: HashMap<String, SessionCacheEntry>,
    details: HashMap<String, DetailsCacheEntry>,
    last_flush: Instant,
}

impl WriteBuffer {
    fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            details: HashMap::new(),
            last_flush: Instant::now(),
        }
    }

    fn should_flush(&self) -> bool {
        self.last_flush.elapsed() >= BUFFER_FLUSH_INTERVAL
            || self.sessions.len() >= BUFFER_SIZE_THRESHOLD
            || self.details.len() >= BUFFER_SIZE_THRESHOLD
    }
}

static WRITE_BUFFER: OnceLock<Mutex<WriteBuffer>> = OnceLock::new();

fn get_buffer() -> &'static Mutex<WriteBuffer> {
    WRITE_BUFFER.get_or_init(|| Mutex::new(WriteBuffer::new()))
}

/// Buffer session writes to cache, reduce database write frequency
pub fn buffer_session_write(session: &SessionInfo, file_modified: DateTime<Utc>) {
    if let Ok(mut buffer) = get_buffer().lock() {
        let path = session.path.clone();
        buffer.sessions.insert(
            path.clone(),
            SessionCacheEntry {
                session: session.clone(),
                file_modified,
                cached_at: Instant::now(),
            },
        );
        // Evict oldest entries if buffer exceeds max capacity
        while buffer.sessions.len() > MAX_SESSION_BUFFER {
            // Find key of oldest entry
            let key_opt = buffer
                .sessions
                .iter()
                .min_by_key(|(_, entry)| entry.cached_at)
                .map(|(k, _)| k.clone());
            if let Some(key) = key_opt {
                buffer.sessions.remove(&key);
            } else {
                break;
            }
        }
        // Record gauge
        crate::metrics::set_write_buffer_sessions_size(buffer.sessions.len());
    }
}

/// Buffer details writes to cache, reduce database write frequency
pub fn buffer_details_write(path: &str, file_modified: DateTime<Utc>, details: &SessionDetails) {
    if let Ok(mut buffer) = get_buffer().lock() {
        let path_string = path.to_string();
        buffer.details.insert(
            path_string.clone(),
            DetailsCacheEntry {
                path: path_string,
                details: details.clone(),
                file_modified,
                cached_at: Instant::now(),
            },
        );
        // Evict oldest entries if buffer exceeds max capacity
        while buffer.details.len() > MAX_DETAILS_BUFFER {
            let key_opt = buffer
                .details
                .iter()
                .min_by_key(|(_, entry)| entry.cached_at)
                .map(|(k, _)| k.clone());
            if let Some(key) = key_opt {
                buffer.details.remove(&key);
            } else {
                break;
            }
        }
        // Record gauge
        crate::metrics::set_write_buffer_details_size(buffer.details.len());
    }
}

/// Get buffered session from memory (if exists and not expired)
pub fn get_buffered_session(path: &str) -> Option<(SessionInfo, DateTime<Utc>)> {
    if let Ok(buffer) = get_buffer().lock() {
        if let Some(entry) = buffer.sessions.get(path) {
            return Some((entry.session.clone(), entry.file_modified));
        }
    }
    None
}

/// Get buffered details from memory (if exists and not expired)
pub fn get_buffered_details(path: &str) -> Option<(SessionDetails, DateTime<Utc>)> {
    if let Ok(buffer) = get_buffer().lock() {
        if let Some(entry) = buffer.details.get(path) {
            return Some((entry.details.clone(), entry.file_modified));
        }
    }
    None
}

/// Check if buffer needs flushing and get data to write
pub fn check_and_take_flush_data() -> Option<(Vec<SessionCacheEntry>, Vec<DetailsCacheEntry>)> {
    if let Ok(mut buffer) = get_buffer().lock() {
        if buffer.should_flush() && (!buffer.sessions.is_empty() || !buffer.details.is_empty()) {
            let sessions: Vec<SessionCacheEntry> =
                buffer.sessions.drain().map(|(_, v)| v).collect();
            let details: Vec<DetailsCacheEntry> = buffer.details.drain().map(|(_, v)| v).collect();
            buffer.last_flush = Instant::now();
            return Some((sessions, details));
        }
    }
    None
}

/// Force flush all buffered data (called on app exit)
pub fn force_flush_all() -> Option<(Vec<SessionCacheEntry>, Vec<DetailsCacheEntry>)> {
    if let Ok(mut buffer) = get_buffer().lock() {
        if !buffer.sessions.is_empty() || !buffer.details.is_empty() {
            let sessions: Vec<SessionCacheEntry> =
                buffer.sessions.drain().map(|(_, v)| v).collect();
            let details: Vec<DetailsCacheEntry> = buffer.details.drain().map(|(_, v)| v).collect();
            buffer.last_flush = Instant::now();
            return Some((sessions, details));
        }
    }
    None
}

/// Get current buffer statistics (for debugging)
pub fn get_buffer_stats() -> (usize, usize, u64) {
    if let Ok(buffer) = get_buffer().lock() {
        (
            buffer.sessions.len(),
            buffer.details.len(),
            buffer.last_flush.elapsed().as_secs(),
        )
    } else {
        (0, 0, 0)
    }
}
