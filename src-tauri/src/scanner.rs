use crate::config::Config;
use crate::models::{SessionInfo, SessionsDiff};
use crate::sqlite_cache;
use crate::write_buffer;
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

static SCAN_CACHE: Mutex<Option<Vec<SessionInfo>>> = Mutex::new(None);
static CACHE_VERSION: AtomicU64 = AtomicU64::new(0);

/// Invalidate the scan cache so the next scan re-reads all directories
pub fn invalidate_cache() {
    if let Ok(mut guard) = SCAN_CACHE.lock() {
        *guard = None;
        CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
    }
}

/// Lightweight digest for HTTP polling — just version + count, no session data
pub fn get_session_digest() -> (u64, usize) {
    let version = CACHE_VERSION.load(Ordering::Relaxed);
    let count = SCAN_CACHE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|v| v.len()))
        .unwrap_or(0);
    (version, count)
}

pub fn get_sessions_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(home.join(".pi").join("agent").join("sessions"))
}

/// Returns all session directories: the default one plus any user-configured paths.
pub fn get_all_session_dirs(config: &Config) -> Vec<PathBuf> {
    let mut dirs = vec![];

    // Default path always included
    if let Ok(default_dir) = get_sessions_dir() {
        dirs.push(default_dir);
    }

    // User-configured extra paths
    for p in &config.session_paths {
        let expanded = expand_tilde(p);
        let path = PathBuf::from(&expanded);
        if path.is_absolute() && !dirs.iter().any(|d| d == &path) {
            dirs.push(path);
        }
    }

    dirs
}

/// Expand ~ to home directory
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    // Return cached list if available — file_watcher keeps it fresh
    if let Ok(guard) = SCAN_CACHE.lock() {
        if let Some(ref cached) = *guard {
            return Ok(cached.clone());
        }
    }

    // First call: full scan to populate cache
    let config = Config::load().unwrap_or_default();
    let result = scan_sessions_with_config(&config).await?;

    if let Ok(mut guard) = SCAN_CACHE.lock() {
        *guard = Some(result.clone());
        CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
    }

    Ok(result)
}

pub async fn scan_sessions_with_config(config: &Config) -> Result<Vec<SessionInfo>, String> {
    let all_dirs = get_all_session_dirs(config);
    let realtime_cutoff = Utc::now() - Duration::days(config.realtime_cutoff_days);

    let conn = sqlite_cache::init_db_with_config(config)?;

    let mut sessions: Vec<SessionInfo> = vec![];

    for sessions_dir in &all_dirs {
        if !sessions_dir.exists() {
            continue;
        }

        let entries = match fs::read_dir(sessions_dir) {
            Ok(e) => e,
            Err(e) => {
                log::warn!("Failed to read sessions directory {sessions_dir:?}: {e}");
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Skip non-pi-session directories (gateway transcripts, subagent artifacts, etc.)
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name == "transcripts" || name == "subagent-artifacts" {
                        continue;
                    }
                }
                if let Ok(files) = fs::read_dir(&path) {
                    for file in files.flatten() {
                        let file_path = file.path();
                        if file_path
                            .extension()
                            .map(|ext| ext == "jsonl")
                            .unwrap_or(false)
                        {
                            let path_str = file_path.to_string_lossy().to_string();

                            let metadata = fs::metadata(&file_path);
                            let file_modified: DateTime<Utc> = match metadata {
                                Ok(m) => {
                                    DateTime::from(m.modified().unwrap_or(std::time::SystemTime::now()))
                                }
                                Err(_) => continue,
                            };

                            if file_modified > realtime_cutoff {
                                if let Ok(info) = parse_session_info(&file_path) {
                                    sessions.push(info);
                                    write_buffer::buffer_session_write(
                                        sessions.last().unwrap(),
                                        file_modified,
                                    );
                                }
                            } else if let Some(cached_mtime) =
                                sqlite_cache::get_cached_file_modified(&conn, &path_str)?
                            {
                                if file_modified > cached_mtime {
                                    if let Ok(info) = parse_session_info(&file_path) {
                                        write_buffer::buffer_session_write(&info, file_modified);
                                    }
                                }
                            } else if let Ok(info) = parse_session_info(&file_path) {
                                write_buffer::buffer_session_write(&info, file_modified);
                            }
                        }
                    }
                }
            }
        }
    }

    let historical_sessions = sqlite_cache::get_sessions_modified_before(&conn, realtime_cutoff)?;

    for session in historical_sessions {
        if !sessions.iter().any(|s| s.path == session.path) {
            sessions.push(session);
        }
    }

    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    let realtime_count = sessions
        .iter()
        .filter(|s| s.modified > realtime_cutoff)
        .count();
    let historical_count = sessions.len() - realtime_count;

    log::trace!(
        "Scan complete: {} realtime (≤{}d), {} historical (>{}d), total {}",
        realtime_count,
        config.realtime_cutoff_days,
        historical_count,
        config.realtime_cutoff_days,
        sessions.len()
    );

    Ok(sessions)
}

/// 解析会话信息
/// 优化：使用 BufReader 流式读取，减少大文件内存占用
pub fn parse_session_info(path: &Path) -> Result<SessionInfo, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取并解析头部
    let header_line = lines
        .next()
        .ok_or("Empty session file")?
        .map_err(|e| format!("Failed to read header: {e}"))?;

    let header: Value =
        serde_json::from_str(&header_line).map_err(|e| format!("Failed to parse header: {e}"))?;

    if header["type"] != "session" {
        return Err("Invalid session header".to_string());
    }

    let id = header["id"].as_str().unwrap_or("unknown").to_string();
    let cwd = header["cwd"].as_str().unwrap_or("").to_string();
    let timestamp_str = header["timestamp"].as_str().unwrap_or("");
    let created = parse_timestamp(timestamp_str)?;

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get metadata: {e}"))?;
    let modified = DateTime::from(
        metadata
            .modified()
            .map_err(|e| format!("Failed to get modified time: {e}"))?,
    );

    let mut message_count = 0;
    let mut first_message = String::new();
    let mut all_messages = Vec::new();
    let mut name: Option<String> = None;
    let mut last_message = String::new();
    let mut last_message_role = String::new();

    // 流式读取剩余行，减少内存占用
    for line_result in lines {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<Value>(&line) {
            if entry["type"] == "session_info" {
                if let Some(n) = entry["name"].as_str() {
                    name = Some(n.trim().to_string());
                }
            }

            if entry["type"] == "message" {
                let role = entry["message"]["role"].as_str().unwrap_or("");
                if role == "user" || role == "assistant" {
                    message_count += 1;

                    let text = extract_message_text(&entry);
                    if !text.is_empty() {
                        all_messages.push(text.clone());
                        if first_message.is_empty() && role == "user" {
                            first_message = text.chars().take(100).collect();
                        }
                        // 更新最后一条消息
                        last_message = text.chars().take(150).collect();
                        last_message_role = role.to_string();
                    }
                }
            }
        }
    }

    let all_messages_text = all_messages.join("\n");

    Ok(SessionInfo {
        path: path.to_string_lossy().to_string(),
        id,
        cwd,
        name,
        created,
        modified,
        message_count,
        first_message,
        all_messages_text,
        last_message,
        last_message_role,
    })
}

fn extract_message_text(entry: &Value) -> String {
    if let Some(message) = entry.get("message") {
        if let Some(content) = message.get("content") {
            if content.is_array() {
                for item in content.as_array().unwrap() {
                    if let Some(text) = item.get("text") {
                        if let Some(s) = text.as_str() {
                            return s.to_string();
                        }
                    }
                }
            }
        }
    }
    String::new()
}

fn parse_timestamp(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Failed to parse timestamp: {e}"))
}

/// Incremental update: re-parse changed files, update cache, return diff for frontend merge.
pub async fn rescan_changed_files(changed_paths: Vec<String>) -> Result<SessionsDiff, String> {
    let mut sessions = if let Ok(guard) = SCAN_CACHE.lock() {
        guard.clone().unwrap_or_default()
    } else {
        vec![]
    };

    if sessions.is_empty() {
        sessions = scan_sessions().await?;
    }

    let mut diff = SessionsDiff {
        updated: vec![],
        removed: vec![],
    };

    for path_str in &changed_paths {
        let path = PathBuf::from(path_str);

        if !path.exists() {
            let before = sessions.len();
            sessions.retain(|s| s.path != *path_str);
            if sessions.len() != before {
                diff.removed.push(path_str.clone());
                log::info!("Session removed (file deleted): {path_str}");
            }
            continue;
        }

        match parse_session_info(&path) {
            Ok(info) => {
                if let Ok(m) = fs::metadata(&path) {
                    if let Ok(mt) = m.modified() {
                        let file_modified: DateTime<Utc> = DateTime::from(mt);
                        write_buffer::buffer_session_write(&info, file_modified);
                    }
                }

                diff.updated.push(info.clone());

                if let Some(existing) = sessions.iter_mut().find(|s| s.path == info.path) {
                    *existing = info;
                } else {
                    sessions.push(info);
                }
            }
            Err(e) => {
                log::warn!("Failed to re-parse {path_str}: {e}");
            }
        }
    }

    if !diff.updated.is_empty() || !diff.removed.is_empty() {
        sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
        if let Ok(mut guard) = SCAN_CACHE.lock() {
            *guard = Some(sessions);
            CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
        }
    }

    log::info!(
        "Incremental rescan: {} updated, {} removed",
        diff.updated.len(),
        diff.removed.len()
    );

    Ok(diff)
}
