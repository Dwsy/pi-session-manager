use crate::session_parser::SessionDetails;
use crate::models::SessionInfo;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const BUFFER_FLUSH_INTERVAL: Duration = Duration::from_secs(30);
const BUFFER_SIZE_THRESHOLD: usize = 50;

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

/// 缓冲写入会话缓存，减少数据库写入频率
pub fn buffer_session_write(session: &SessionInfo, file_modified: DateTime<Utc>) {
    if let Ok(mut buffer) = get_buffer().lock() {
        let path = session.path.clone();
        buffer.sessions.insert(
            path,
            SessionCacheEntry {
                session: session.clone(),
                file_modified,
                cached_at: Instant::now(),
            },
        );
    }
}

/// 缓冲写入详情缓存，减少数据库写入频率
pub fn buffer_details_write(path: &str, file_modified: DateTime<Utc>, details: &SessionDetails) {
    if let Ok(mut buffer) = get_buffer().lock() {
        buffer.details.insert(
            path.to_string(),
            DetailsCacheEntry {
                path: path.to_string(),
                details: details.clone(),
                file_modified,
                cached_at: Instant::now(),
            },
        );
    }
}

/// 获取内存中缓冲的会话（如果存在且未过期）
pub fn get_buffered_session(path: &str) -> Option<(SessionInfo, DateTime<Utc>)> {
    if let Ok(buffer) = get_buffer().lock() {
        if let Some(entry) = buffer.sessions.get(path) {
            return Some((entry.session.clone(), entry.file_modified));
        }
    }
    None
}

/// 获取内存中缓冲的详情（如果存在且未过期）
pub fn get_buffered_details(path: &str) -> Option<(SessionDetails, DateTime<Utc>)> {
    if let Ok(buffer) = get_buffer().lock() {
        if let Some(entry) = buffer.details.get(path) {
            return Some((entry.details.clone(), entry.file_modified));
        }
    }
    None
}

/// 检查是否需要刷新缓冲并获取待写入的数据
pub fn check_and_take_flush_data() -> Option<(Vec<SessionCacheEntry>, Vec<DetailsCacheEntry>)> {
    if let Ok(mut buffer) = get_buffer().lock() {
        if buffer.should_flush() && (!buffer.sessions.is_empty() || !buffer.details.is_empty()) {
            let sessions: Vec<SessionCacheEntry> = buffer.sessions.drain().map(|(_, v)| v).collect();
            let details: Vec<DetailsCacheEntry> = buffer.details.drain().map(|(_, v)| v).collect();
            buffer.last_flush = Instant::now();
            return Some((sessions, details));
        }
    }
    None
}

/// 强制刷新所有缓冲数据（应用退出时调用）
pub fn force_flush_all() -> Option<(Vec<SessionCacheEntry>, Vec<DetailsCacheEntry>)> {
    if let Ok(mut buffer) = get_buffer().lock() {
        if !buffer.sessions.is_empty() || !buffer.details.is_empty() {
            let sessions: Vec<SessionCacheEntry> = buffer.sessions.drain().map(|(_, v)| v).collect();
            let details: Vec<DetailsCacheEntry> = buffer.details.drain().map(|(_, v)| v).collect();
            buffer.last_flush = Instant::now();
            return Some((sessions, details));
        }
    }
    None
}

/// 获取当前缓冲统计信息（用于调试）
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
