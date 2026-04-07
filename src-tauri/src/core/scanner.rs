use crate::config::Config;
use crate::core::write_buffer;
use crate::data::search::index::{extract_message_contents, extract_primary_message_text};
use crate::data::sqlite;
use crate::types::{Content, Message, SessionEntry, SessionInfo, SessionsDiff};
/// Check if an error message indicates database corruption
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use tokio::time::{interval, Duration as TokioDuration};
use tracing::{debug, error, info, trace, warn};

fn is_corruption_error(err: &str) -> bool {
    err.contains("malformed")
        || err.contains("disk image")
        || err.contains("not a database")
        || err.contains("vtable constructor failed")
}

static SCAN_CACHE: RwLock<Option<Vec<SessionInfo>>> = RwLock::new(None);
static CACHE_VERSION: AtomicU64 = AtomicU64::new(0);

/// Invalidate the scan cache so the next scan re-reads all directories
pub fn invalidate_cache() {
    if let Ok(mut guard) = SCAN_CACHE.write() {
        *guard = None;
        CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
    }
}

/// Lightweight digest for HTTP polling — just version + count, no session data
pub fn get_session_digest() -> (u64, usize) {
    let version = CACHE_VERSION.load(Ordering::Relaxed);
    let count = SCAN_CACHE
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|v| v.len()))
        .unwrap_or(0);
    (version, count)
}

/// Snapshot cached sessions without forcing a rescan.
/// Returns None when cache is not initialized yet.
pub fn get_cached_sessions() -> Option<Vec<SessionInfo>> {
    SCAN_CACHE.read().ok().and_then(|g| g.as_ref().cloned())
}

fn clone_session_for_list(session: &SessionInfo) -> SessionInfo {
    SessionInfo {
        path: session.path.clone(),
        id: session.id.clone(),
        cwd: session.cwd.clone(),
        name: session.name.clone(),
        created: session.created,
        modified: session.modified,
        message_count: session.message_count,
        first_message: session.first_message.clone(),
        all_messages_text: String::new(),
        user_messages_text: String::new(),
        assistant_messages_text: String::new(),
        last_message: session.last_message.clone(),
        last_message_role: session.last_message_role.clone(),
        parent_session_path: session.parent_session_path.clone(),
    }
}

/// Snapshot cached sessions optimized for list/pagination APIs.
/// Drops heavy conversation blobs to reduce clone cost and memory pressure.
pub fn get_cached_sessions_for_list() -> Option<Vec<SessionInfo>> {
    SCAN_CACHE.read().ok().and_then(|guard| {
        guard
            .as_ref()
            .map(|sessions| sessions.iter().map(clone_session_for_list).collect())
    })
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
    let Some(home) = dirs::home_dir() else {
        return path.to_string();
    };

    if path == "~" {
        return home.to_string_lossy().to_string();
    }

    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        let mut expanded = home;
        for part in rest
            .split(['/', '\\'])
            .filter(|segment| !segment.is_empty())
        {
            expanded = expanded.join(part);
        }
        return expanded.to_string_lossy().to_string();
    }

    path.to_string()
}

pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    // Return cached list if available — file_watcher keeps it fresh
    if let Ok(guard) = SCAN_CACHE.read() {
        if let Some(ref cached) = *guard {
            return Ok(cached.clone());
        }
    }

    // First call: full scan to populate cache
    let config = Config::load().unwrap_or_default();
    let result = scan_sessions_with_config(&config).await?;

    if let Ok(mut guard) = SCAN_CACHE.write() {
        *guard = Some(result.clone());
        CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
    }

    Ok(result)
}

/// Collect all JSONL file paths from all session directories
fn collect_jsonl_files(all_dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for sessions_dir in all_dirs {
        if !sessions_dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(sessions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    // Skip non-pi-session directories
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name == "transcripts" || name == "subagent-artifacts" {
                            continue;
                        }
                    }
                    if let Ok(sub_entries) = fs::read_dir(&path) {
                        for file in sub_entries.flatten() {
                            let file_path = file.path();
                            if file_path
                                .extension()
                                .map(|ext| ext == "jsonl")
                                .unwrap_or(false)
                            {
                                files.push(file_path);
                            }
                        }
                    }
                }
            }
        }
    }
    files
}

/// Parsed result from a single file
#[derive(Clone)]
struct ParsedFileResult {
    info: SessionInfo,
    entries: Vec<SessionEntry>,
    file_modified: DateTime<Utc>,
    path_str: String,
}

/// Parallel scan all JSONL files using tokio tasks
/// Strategy: Parse files in parallel (pure CPU work), return results for caller to handle DB
async fn parallel_parse_files(files: Vec<PathBuf>) -> Vec<ParsedFileResult> {
    use tokio::task::JoinSet;

    let mut set = JoinSet::new();

    // Spawn parsing tasks - each task is independent and Send-safe
    for file_path in files {
        set.spawn(async move {
            let path_str = file_path.to_string_lossy().to_string();
            let metadata = fs::metadata(&file_path);
            let file_modified: DateTime<Utc> = match metadata {
                Ok(m) => DateTime::from(m.modified().unwrap_or(std::time::SystemTime::now())),
                Err(e) => {
                    warn!("Failed to get metadata for {}: {}", path_str, e);
                    return None;
                }
            };

            // Parse the file
            match parse_session_info(&file_path) {
                Ok((info, entries)) => Some(ParsedFileResult {
                    info,
                    entries,
                    file_modified,
                    path_str,
                }),
                Err(e) => {
                    warn!("Failed to parse {}: {}", path_str, e);
                    None
                }
            }
        });
    }

    // Collect all results
    let mut parsed_results: Vec<ParsedFileResult> = Vec::new();
    while let Some(result) = set.join_next().await {
        match result {
            Ok(Some(data)) => {
                parsed_results.push(data);
            }
            Ok(None) => {} // Skipped due to error
            Err(e) => {
                warn!("Task join error: {}", e);
            }
        }
    }

    parsed_results
}

pub async fn scan_sessions_with_config(config: &Config) -> Result<Vec<SessionInfo>, String> {
    let all_dirs = get_all_session_dirs(config);
    let realtime_cutoff = Utc::now() - Duration::days(config.realtime_cutoff_days);
    const MAX_RETRIES: usize = 1;
    let mut attempt = 0;

    loop {
        attempt += 1;
        // Initialize database connection (may fail if corrupted)
        let conn = match sqlite::init_db_with_config(config) {
            Ok(conn) => conn,
            Err(e) => {
                if is_corruption_error(&e) && attempt <= MAX_RETRIES {
                    warn!("[Recovery] Database init failed (corruption suspected): {}. Attempting to recover...", e);
                    // Attempt to delete corrupted DB and retry
                    if let Ok(db_path) = sqlite::get_db_path() {
                        let _ = std::fs::remove_file(&db_path);
                    }
                    continue;
                } else {
                    return Err(e);
                }
            }
        };

        // Collect all files first
        let files = collect_jsonl_files(&all_dirs);
        let total_files = files.len();
        info!("Collected {} JSONL files for scanning", total_files);

        // Load all sessions from DB first (O(1) lookup by path)
        let db_sessions = sqlite::get_all_sessions(&conn)?;
        let db_paths: std::collections::HashSet<&str> = db_sessions.iter().map(|s| s.path.as_str()).collect();

        // Identify files that need parsing: new files or files modified after DB's file_modified
        let files_to_parse: Vec<PathBuf> = files
            .into_iter()
            .filter(|path| {
                let path_str = path.to_string_lossy();
                if !db_paths.contains(path_str.as_ref()) {
                    // New file, needs parsing
                    true
                } else {
                    // Existing file, check if modified
                    if let Ok(Some(cached_modified)) = sqlite::get_cached_file_modified(&conn, &path_str) {
                        if let Ok(metadata) = std::fs::metadata(&path) {
                            let file_modified: chrono::DateTime<chrono::Utc> = DateTime::from(metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH));
                            file_modified > cached_modified
                        } else {
                            false
                        }
                    } else {
                        // No cached file_modified, needs parsing
                        true
                    }
                }
            })
            .collect();

        info!("Need to parse {} files ({} cached, {} to parse)", total_files, total_files - files_to_parse.len(), files_to_parse.len());

        // Parse only files that need updates
        let parsed_results = if files_to_parse.is_empty() {
            Vec::new()
        } else {
            parallel_parse_files(files_to_parse).await
        };

        // Process results: separate realtime vs historical, upsert to DB
        let mut realtime_sessions: Vec<SessionInfo> = Vec::new();
        let mut updated_paths: std::collections::HashSet<String> = std::collections::HashSet::new();

        for result in parsed_results {
            if result.file_modified > realtime_cutoff {
                // Realtime file: add to results, buffer for DB
                realtime_sessions.push(result.info.clone());
                write_buffer::buffer_session_write(&result.info, result.file_modified);
            } else {
                // Historical file: upsert to DB
                if let Err(e) = sqlite::upsert_session(
                    &conn,
                    &result.info,
                    result.file_modified,
                    Some(&result.entries),
                ) {
                    error!(
                        "Failed to upsert historical session {}: {}",
                        result.path_str, e
                    );
                }
            }
            updated_paths.insert(result.info.path.clone());
        }

        // Start with DB sessions, update only those that were re-parsed
        let mut all_sessions: Vec<SessionInfo> = Vec::new();
        for session in db_sessions {
            if updated_paths.contains(&session.path) {
                // This session was updated, skip it from DB (already in realtime_sessions or updated via upsert)
                continue;
            }
            all_sessions.push(session);
        }

        // Add updated realtime sessions
        for session in realtime_sessions {
            all_sessions.push(session);
        }

        all_sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

        let realtime_count = all_sessions
            .iter()
            .filter(|s| s.modified > realtime_cutoff)
            .count();
        let historical_count = all_sessions.len() - realtime_count;

        info!(
            "Parallel scan complete: {} realtime (≤{}d), {} historical (>{}d), {} total",
            realtime_count,
            config.realtime_cutoff_days,
            historical_count,
            config.realtime_cutoff_days,
            all_sessions.len()
        );

        break Ok(all_sessions);
    }
}

/// Parse session info and extract message entries
/// Optimization: Use BufReader for streaming to reduce memory usage on large files
/// Returns: (SessionInfo, Vec<SessionEntry>) - session info and message entry list
pub fn parse_session_info(path: &Path) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // Read and parse header
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
    let parent_session_path = header["parentSession"].as_str().map(|s| s.to_string());

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get metadata: {e}"))?;
    let modified = DateTime::from(
        metadata
            .modified()
            .map_err(|e| format!("Failed to get modified time: {e}"))?,
    );

    let mut message_count = 0;
    let mut first_message = String::new();
    let mut all_messages = Vec::new();
    let mut user_messages = Vec::new();
    let mut assistant_messages = Vec::new();
    let mut name: Option<String> = None;
    let mut last_message = String::new();
    let mut last_message_role = String::new();
    let mut entries = Vec::new();

    // Stream read remaining lines to reduce memory usage
    for (line_num, line_result) in lines.enumerate() {
        let line_num = line_num + 2; // +2 because header is line 1
        let line = match line_result {
            Ok(l) => l,
            Err(e) => {
                warn!(
                    "Failed to read line {} in {}: {}",
                    line_num,
                    path.display(),
                    e
                );
                continue;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let entry: Value = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(e) => {
                warn!(
                    "Failed to parse JSON at line {} in {}: {}",
                    line_num,
                    path.display(),
                    e
                );
                trace!("Problematic line content: {}", &line[..line.len().min(200)]);
                continue;
            }
        };

        if entry["type"] == "session_info" {
            if let Some(n) = entry["name"].as_str() {
                name = Some(n.trim().to_string());
            }
        }

        if entry["type"] == "message" {
            let role = entry["message"]["role"].as_str().unwrap_or("");
            if role == "user" || role == "assistant" {
                message_count += 1;

                let text = extract_primary_message_text(&entry);
                if !text.is_empty() {
                    all_messages.push(text.clone());
                    if first_message.is_empty() && role == "user" {
                        first_message = text.chars().take(100).collect();
                    }
                    // Update last message
                    last_message = text.chars().take(150).collect();
                    last_message_role = role.to_string();

                    // Collect user and assistant message text
                    if role == "user" {
                        user_messages.push(text.clone());
                    } else if role == "assistant" {
                        assistant_messages.push(text.clone());
                    }

                    // Build SessionEntry for message_entries table
                    let entry_id = entry["id"].as_str().unwrap_or("").to_string();
                    let timestamp_str = entry["timestamp"].as_str().unwrap_or("");
                    let timestamp = parse_timestamp(timestamp_str)?;

                    let normalized_content = extract_message_contents(&entry, true)
                        .into_iter()
                        .map(|(content_type, value)| Content {
                            content_type,
                            text: Some(value),
                        })
                        .collect();

                    let session_entry = SessionEntry {
                        entry_type: "message".to_string(),
                        id: entry_id,
                        parent_id: None,
                        timestamp,
                        message: Some(Message {
                            role: role.to_string(),
                            content: normalized_content,
                        }),
                    };
                    entries.push(session_entry);
                }
            }
        }
    }

    let all_messages_text = all_messages.join("\n");
    let user_messages_text = user_messages.join("\n");
    let assistant_messages_text = assistant_messages.join("\n");

    Ok((
        SessionInfo {
            path: path.to_string_lossy().to_string(),
            id,
            cwd,
            name,
            created,
            modified,
            message_count,
            first_message,
            all_messages_text,
            user_messages_text,
            assistant_messages_text,
            last_message,
            last_message_role,
            parent_session_path,
        },
        entries,
    ))
}

pub fn extract_message_text(entry: &Value) -> String {
    extract_primary_message_text(entry)
}

pub fn extract_index_segments(entry: &Value, include_thinking: bool) -> Vec<(String, String)> {
    extract_message_contents(entry, include_thinking)
}

fn parse_timestamp(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Failed to parse timestamp: {e}"))
}

/// Incremental update: re-parse changed files, update cache, return diff for frontend merge.
pub async fn rescan_changed_files(changed_paths: Vec<String>) -> Result<SessionsDiff, String> {
    let mut sessions = if let Ok(guard) = SCAN_CACHE.read() {
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

    let config = Config::load().unwrap_or_default();
    let conn = crate::data::sqlite::init_db_with_config(&config)?;

    for path_str in &changed_paths {
        let path = PathBuf::from(path_str);

        if !path.exists() {
            let before = sessions.len();
            sessions.retain(|s| s.path != *path_str);
            if sessions.len() != before {
                diff.removed.push(path_str.clone());
                info!("Session removed (file deleted): {path_str}");
            }
            continue;
        }

        match parse_session_info(&path) {
            Ok((info, entries)) => {
                let file_modified = match fs::metadata(&path).and_then(|m| m.modified()) {
                    Ok(mt) => DateTime::from(mt),
                    Err(e) => {
                        warn!("Failed to get metadata for {}: {}", path_str, e);
                        continue;
                    }
                };

                // Ensure session row exists (also populates message_entries via insert_message_entries)
                if let Err(e) =
                    crate::data::sqlite::upsert_session(&conn, &info, file_modified, Some(&entries))
                {
                    warn!("Failed to upsert session for {}: {}", info.path, e);
                }

                // Buffer for stats cache updates (periodic flush)
                crate::core::write_buffer::buffer_session_write(&info, file_modified);

                diff.updated.push(info.clone());

                if let Some(existing) = sessions.iter_mut().find(|s| s.path == info.path) {
                    *existing = info;
                } else {
                    sessions.push(info);
                }
            }
            Err(e) => {
                warn!("Failed to re-parse {}: {}", path_str, e);
            }
        }
    }

    if !diff.updated.is_empty() || !diff.removed.is_empty() {
        sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
        if let Ok(mut guard) = SCAN_CACHE.write() {
            *guard = Some(sessions);
            CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
        }
    }

    debug!(
        "Incremental rescan: {} updated, {} removed",
        diff.updated.len(),
        diff.removed.len()
    );

    Ok(diff)
}

#[cfg(test)]
mod tests {
    use super::expand_tilde;

    #[test]
    fn expand_tilde_supports_windows_separator() {
        let Some(home) = dirs::home_dir() else {
            return;
        };

        let expanded = super::expand_tilde(r"~\.pi\agent\sessions");
        assert_eq!(
            expanded,
            home.join(".pi")
                .join("agent")
                .join("sessions")
                .to_string_lossy()
                .to_string()
        );
    }
}

pub struct ScannerScheduler {
    config: Config,
    scan_interval: TokioDuration,
}

impl ScannerScheduler {
    pub fn new(_sessions_dir: PathBuf, scan_interval_secs: u64, config: Config) -> Self {
        Self {
            config,
            scan_interval: TokioDuration::from_secs(scan_interval_secs),
        }
    }

    pub async fn start(&self) {
        info!(
            "Starting scanner scheduler with {}s interval",
            self.scan_interval.as_secs()
        );
        let mut ticker = interval(self.scan_interval);
        ticker.tick().await;

        loop {
            ticker.tick().await;
            if let Err(e) = self.scan_and_update().await {
                error!("Scanner error: {}", e);
            }

            if let Err(e) = self.auto_cleanup().await {
                error!("Auto cleanup error: {}", e);
            }
        }
    }

    async fn scan_and_update(&self) -> Result<String, String> {
        let start = std::time::Instant::now();

        let all_dirs = get_all_session_dirs(&self.config);
        let files = collect_jsonl_files(&all_dirs);
        let total_files = files.len();

        if total_files == 0 {
            return Ok("No files to scan".to_string());
        }

        let conn = sqlite::init_db_with_config(&self.config)?;
        let realtime_cutoff = Utc::now() - Duration::days(self.config.realtime_cutoff_days);

        // Use parallel parse
        let parsed_results = parallel_parse_files(files).await;

        // Process and upsert to DB
        let mut sessions: Vec<SessionInfo> = Vec::with_capacity(parsed_results.len());
        let mut updated = 0;
        let mut added = 0;
        let mut skipped = 0;

        for result in parsed_results {
            let path_str = &result.path_str;
            let file_modified = result.file_modified;
            let cached_mtime = sqlite::get_cached_file_modified(&conn, path_str)?;

            match cached_mtime {
                Some(cached) if file_modified <= cached => {
                    skipped += 1;
                }
                Some(_) => {
                    sqlite::upsert_session(
                        &conn,
                        &result.info,
                        file_modified,
                        Some(&result.entries),
                    )?;
                    updated += 1;
                }
                None => {
                    sqlite::upsert_session(
                        &conn,
                        &result.info,
                        file_modified,
                        Some(&result.entries),
                    )?;
                    added += 1;
                }
            }

            sessions.push(result.info);

            // Buffer realtime files for stats
            if file_modified > realtime_cutoff {
                write_buffer::buffer_session_write(sessions.last().unwrap(), file_modified);
            }
        }

        let elapsed = start.elapsed();
        info!(
            "Scanner complete: +{} added, ~{} updated, {} skipped in {:?}",
            added, updated, skipped, elapsed
        );

        Ok(format!(
            "Scanned: +{added} added, ~{updated} updated, {skipped} skipped"
        ))
    }

    async fn auto_cleanup(&self) -> Result<String, String> {
        if let Some(cleanup_days) = self.config.auto_cleanup_days {
            let _cutoff = Utc::now() - Duration::days(cleanup_days);

            let conn = sqlite::init_db_with_config(&self.config)?;
            let deleted = sqlite::cleanup_missing_files(&conn)?;

            if deleted > 0 {
                info!("Auto cleanup: removed {} missing session records", deleted);
            }

            return Ok(format!("Auto cleanup: {deleted} records removed"));
        }

        Ok("Auto cleanup: disabled".to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileUpdateResult {
    Added,
    Updated,
    Skipped,
}

pub fn start_background_scanner(sessions_dir: PathBuf, interval_secs: u64) {
    let config = Config::load().unwrap_or_default();

    tokio::spawn(async move {
        let scheduler = ScannerScheduler::new(sessions_dir, interval_secs, config);
        scheduler.start().await;
    });
}
