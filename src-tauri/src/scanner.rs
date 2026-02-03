use crate::config::Config;
use crate::models::SessionInfo;
use crate::sqlite_cache;
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

pub fn get_sessions_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(home.join(".pi").join("agent").join("sessions"))
}

pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    let config = Config::load().unwrap_or_default();
    scan_sessions_with_config(&config).await
}

pub async fn scan_sessions_with_config(config: &Config) -> Result<Vec<SessionInfo>, String> {
    let sessions_dir = get_sessions_dir()?;
    let realtime_cutoff = Utc::now() - Duration::days(config.realtime_cutoff_days);

    if !sessions_dir.exists() {
        return Ok(vec![]);
    }

    let conn = sqlite_cache::init_db_with_config(config)?;

    let mut sessions: Vec<SessionInfo> = vec![];

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(files) = fs::read_dir(&path) {
                for file in files.flatten() {
                    let file_path = file.path();
                    if file_path.extension().map(|ext| ext == "jsonl").unwrap_or(false) {
                        let path_str = file_path.to_string_lossy().to_string();

                        let metadata = fs::metadata(&file_path);
                        let file_modified: DateTime<Utc> = match metadata {
                            Ok(m) => DateTime::from(m.modified().unwrap_or(std::time::SystemTime::now())),
                            Err(_) => continue,
                        };

                        if file_modified > realtime_cutoff {
                            if let Ok(info) = parse_session_info(&file_path) {
                                sessions.push(info);
                                sqlite_cache::upsert_session(&conn, &sessions.last().unwrap(), file_modified)?;
                            }
                        } else {
                            if let Some(cached_mtime) = sqlite_cache::get_cached_file_modified(&conn, &path_str)? {
                                if file_modified > cached_mtime {
                                    if let Ok(info) = parse_session_info(&file_path) {
                                        sqlite_cache::upsert_session(&conn, &info, file_modified)?;
                                    }
                                }
                            } else {
                                if let Ok(info) = parse_session_info(&file_path) {
                                    sqlite_cache::upsert_session(&conn, &info, file_modified)?;
                                }
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

    let realtime_count = sessions.iter().filter(|s| s.modified > realtime_cutoff).count();
    let historical_count = sessions.len() - realtime_count;

    eprintln!(
        "Scan complete: {} realtime (≤{}d), {} historical (>{}d), total {}",
        realtime_count, config.realtime_cutoff_days, historical_count, config.realtime_cutoff_days, sessions.len()
    );

    Ok(sessions)
}

/// 解析会话信息
/// 优化：使用 BufReader 流式读取，减少大文件内存占用
pub fn parse_session_info(path: &Path) -> Result<SessionInfo, String> {
    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取并解析头部
    let header_line = lines.next()
        .ok_or("Empty session file")?
        .map_err(|e| format!("Failed to read header: {}", e))?;

    let header: Value = serde_json::from_str(&header_line)
        .map_err(|e| format!("Failed to parse header: {}", e))?;

    if header["type"] != "session" {
        return Err("Invalid session header".to_string());
    }

    let id = header["id"].as_str().unwrap_or("unknown").to_string();
    let cwd = header["cwd"].as_str().unwrap_or("").to_string();
    let timestamp_str = header["timestamp"].as_str().unwrap_or("");
    let created = parse_timestamp(timestamp_str)?;

    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;
    let modified = DateTime::from(metadata.modified().map_err(|e| format!("Failed to get modified time: {}", e))?);

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
        .map_err(|e| format!("Failed to parse timestamp: {}", e))
}