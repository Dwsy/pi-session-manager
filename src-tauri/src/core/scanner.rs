use crate::config::Config;
use crate::core::write_buffer;
use crate::data::search::index::{extract_message_contents, extract_primary_message_text};
use crate::data::sqlite;
use crate::types::{SessionEntry, SessionInfo, SessionsDiff};
/// Check if an error message indicates database corruption
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use std::fs;
use std::io::{BufRead, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::Instant;
use tokio::time::{interval, Duration as TokioDuration};
use tracing::{debug, error, info, trace, warn};

fn is_corruption_error(err: &str) -> bool {
    err.contains("malformed") || err.contains("disk image") || err.contains("not a database") || err.contains("vtable constructor failed")
}

static SCAN_CACHE: RwLock<Option<Vec<SessionInfo>>> = RwLock::new(None);
static SCAN_ENTRIES_CACHE: RwLock<Option<std::collections::HashMap<String, Vec<SessionEntry>>>> = RwLock::new(None);
static CACHE_VERSION: AtomicU64 = AtomicU64::new(0);
static SCAN_IN_PROGRESS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Timestamp (epoch seconds) of last file watcher activity.
/// Scanner skips full directory walk when watcher is recently active.
static WATCHER_LAST_ACTIVE: AtomicU64 = AtomicU64::new(0);

/// Mark watcher as active (called from file_watcher on each event batch)
pub fn mark_watcher_active() {
    WATCHER_LAST_ACTIVE.store(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(), Ordering::Relaxed);
}

/// Check if watcher has been active within the last `secs` seconds
fn watcher_active_within(secs: u64) -> bool {
    let last = WATCHER_LAST_ACTIVE.load(Ordering::Relaxed);
    if last == 0 {
        return false;
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    now.saturating_sub(last) < secs
}

/// Cached directory listing to avoid repeated recursive walks
static FILE_LIST_CACHE: RwLock<Option<CachedFileList>> = RwLock::new(None);
const FILE_LIST_CACHE_TTL_SECS: u64 = 30;

struct CachedFileList {
    files: Vec<PathBuf>,
    updated_at: std::time::Instant,
}

struct ScanInProgressGuard;

impl Drop for ScanInProgressGuard {
    fn drop(&mut self) {
        SCAN_IN_PROGRESS.store(false, Ordering::Release);
    }
}

/// Invalidate the scan cache so the next scan re-reads all directories
pub fn invalidate_cache() {
    if let Ok(mut guard) = SCAN_CACHE.write() {
        *guard = None;
        CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
    }
    if let Ok(mut guard) = SCAN_ENTRIES_CACHE.write() {
        *guard = None;
    }
    if let Ok(mut guard) = FILE_LIST_CACHE.write() {
        *guard = None;
    }
}

pub fn upsert_cached_session(session: SessionInfo) {
    if let Ok(mut guard) = SCAN_CACHE.write() {
        let sessions = guard.get_or_insert_with(Vec::new);
        if let Some(existing) = sessions.iter_mut().find(|existing| existing.path == session.path) {
            *existing = session;
        } else {
            sessions.push(session);
        }
        sessions.sort_by_key(|b| std::cmp::Reverse(b.modified));
        CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
    }
}

fn set_cached_entries(path: &str, entries: Vec<SessionEntry>) {
    if let Ok(mut guard) = SCAN_ENTRIES_CACHE.write() {
        guard.get_or_insert_with(std::collections::HashMap::new).insert(path.to_string(), entries);
    }
}

fn get_cached_entries(path: &str) -> Option<Vec<SessionEntry>> {
    SCAN_ENTRIES_CACHE.read().ok().and_then(|g| g.as_ref().and_then(|m| m.get(path).cloned()))
}

fn get_cached_session_info(path: &str) -> Option<SessionInfo> {
    SCAN_CACHE.read().ok().and_then(|g| g.as_ref().and_then(|sessions| sessions.iter().find(|s| s.path == path).cloned()))
}

pub fn remove_cached_sessions(paths: &[String]) {
    if paths.is_empty() {
        return;
    }
    if let Ok(mut guard) = SCAN_CACHE.write() {
        if let Some(sessions) = guard.as_mut() {
            let before = sessions.len();
            sessions.retain(|session| !paths.iter().any(|p| p == &session.path));
            if sessions.len() != before {
                CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
    if let Ok(mut guard) = SCAN_ENTRIES_CACHE.write() {
        if let Some(entries_map) = guard.as_mut() {
            for p in paths {
                entries_map.remove(p);
            }
        }
    }
}

/// Lightweight digest for HTTP polling — just version + count, no session data
pub fn get_session_digest() -> (u64, usize) {
    let version = CACHE_VERSION.load(Ordering::Relaxed);
    let count = SCAN_CACHE.read().ok().and_then(|g| g.as_ref().map(|v| v.len())).unwrap_or(0);
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
    SCAN_CACHE.read().ok().and_then(|guard| guard.as_ref().map(|sessions| sessions.iter().map(clone_session_for_list).collect()))
}

pub fn get_sessions_dir() -> Result<PathBuf, String> {
    crate::paths::pi_agent_sessions_dir()
}

/// Returns all session directories: the default one plus any user-configured paths.
pub fn get_all_session_dirs(config: &Config) -> Vec<PathBuf> {
    if config.session_source_mode == crate::config::SessionSourceMode::Dataset {
        let mut dataset_dirs = Vec::new();
        if let Ok(home) = crate::paths::home_dir() {
            for active_dataset_id in config.effective_active_dataset_ids() {
                if let Some(dataset) = config.datasets.iter().find(|item| item.id == active_dataset_id) {
                    dataset_dirs.push(home.join(".pi").join("agent").join("sessions").join("datasets").join(&dataset.slug).join("sessions"));
                }
            }
        }
        dataset_dirs.sort();
        dataset_dirs.dedup();
        return dataset_dirs;
    }

    let mut dirs = vec![];

    for source in crate::domain::session_bridge::SessionBridgeSource::ALL {
        if source == crate::domain::session_bridge::SessionBridgeSource::Pi {
            for root in source.session_roots() {
                if root.exists() && !dirs.iter().any(|existing| existing == &root) {
                    dirs.push(root);
                }
            }
            continue;
        }

        let enabled = config.effective_external_session_provider_slugs().iter().any(|slug| slug == &source.slug().replace('_', "-"));
        if !enabled {
            continue;
        }

        for root in source.session_roots() {
            if root.exists() && !dirs.iter().any(|existing| existing == &root) {
                dirs.push(root);
            }
        }
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
    let Ok(home) = crate::paths::home_dir() else {
        return path.to_string();
    };

    if path == "~" {
        return home.to_string_lossy().to_string();
    }

    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        let mut expanded = home;
        for part in rest.split(['/', '\\']).filter(|segment| !segment.is_empty()) {
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

    // Wait for in-progress scan to complete instead of starting a duplicate
    while SCAN_IN_PROGRESS.load(Ordering::Acquire) {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        if let Ok(guard) = SCAN_CACHE.read() {
            if let Some(ref cached) = *guard {
                return Ok(cached.clone());
            }
        }
    }

    // Mark scan in progress
    SCAN_IN_PROGRESS.store(true, Ordering::Release);
    let _scan_guard = ScanInProgressGuard;

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
pub(crate) fn collect_session_files(all_dirs: &[PathBuf]) -> Vec<PathBuf> {
    let walk_start = std::time::Instant::now();
    // Check cache first
    if let Ok(guard) = FILE_LIST_CACHE.read() {
        if let Some(cached) = guard.as_ref() {
            if cached.updated_at.elapsed().as_secs() < FILE_LIST_CACHE_TTL_SECS {
                return cached.files.clone();
            }
        }
    }

    fn should_skip_dir(path: &Path, root: &Path, default_root: Option<&Path>) -> bool {
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            return false;
        };

        if matches!(name, "transcripts" | "subagent-artifacts" | "subagents" | ".timelines" | "checkpoints") {
            return true;
        }

        default_root.is_some_and(|default_root| root == default_root && name == "datasets")
    }

    fn extend_candidate(path: &Path, files: &mut Vec<PathBuf>) {
        let is_jsonl = path.extension().map(|ext| ext == "jsonl").unwrap_or(false);
        let is_gemini_json = crate::domain::session_bridge::is_gemini_session_file(path);
        let is_opencode_db = crate::domain::session_bridge::is_opencode_db_path(path);

        if !is_jsonl && !is_opencode_db && !is_gemini_json {
            return;
        }

        if is_opencode_db {
            let paths = crate::domain::session_bridge::expand_opencode_session_paths(path);
            if paths.is_empty() {
                files.push(path.to_path_buf());
            } else {
                files.extend(paths);
            }
            return;
        }

        files.push(path.to_path_buf());
    }

    fn walk_dir(dir: &Path, root: &Path, default_root: Option<&Path>, files: &mut Vec<PathBuf>) {
        if dir.is_file() {
            extend_candidate(dir, files);
            return;
        }

        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if should_skip_dir(&path, root, default_root) {
                    continue;
                }
                walk_dir(&path, root, default_root, files);
                continue;
            }

            extend_candidate(&path, files);
        }
    }

    let mut files = Vec::new();
    let default_root = get_sessions_dir().ok();
    for sessions_dir in all_dirs {
        if !sessions_dir.exists() {
            continue;
        }
        walk_dir(sessions_dir, sessions_dir, default_root.as_deref(), &mut files);
    }
    files.sort();
    files.dedup();

    let walk_elapsed = walk_start.elapsed();
    super::io_trace::trace_scan("collect_files", &format!("{} files in {:?}", files.len(), walk_elapsed));

    // Update cache
    if let Ok(mut guard) = FILE_LIST_CACHE.write() {
        *guard = Some(CachedFileList { files: files.clone(), updated_at: std::time::Instant::now() });
    }

    files
}

pub(crate) fn collect_jsonl_files(all_dirs: &[PathBuf]) -> Vec<PathBuf> {
    collect_session_files(all_dirs).into_iter().filter(|path| path.extension().map(|ext| ext == "jsonl").unwrap_or(false)).collect()
}

/// Parsed result from a single file
#[derive(Clone)]
pub(crate) struct ParsedFileResult {
    pub(crate) info: SessionInfo,
    pub(crate) entries: Vec<SessionEntry>,
    pub(crate) file_modified: DateTime<Utc>,
    pub(crate) path_str: String,
}

/// Parallel scan all JSONL files using tokio tasks (header-only, fast initial scan)
/// Returns minimal SessionInfo with empty message fields for DB bootstrap
pub(crate) async fn parallel_parse_headers_only(files: Vec<PathBuf>) -> Vec<ParsedFileResult> {
    use tokio::task::JoinSet;

    let mut set = JoinSet::new();

    for file_path in files {
        set.spawn(async move {
            let path_str = file_path.to_string_lossy().to_string();
            let metadata = fs::metadata(crate::domain::session_bridge::backing_file_path(&file_path));
            let file_modified: DateTime<Utc> = match metadata {
                Ok(m) => DateTime::from(m.modified().unwrap_or(std::time::SystemTime::now())),
                Err(e) => {
                    warn!("Failed to get metadata for {}: {}", path_str, e);
                    return None;
                }
            };

            // Lightweight header-only parse
            match crate::domain::session_bridge::parse_session_info_header_only(&file_path, file_modified) {
                Ok(info) => Some(ParsedFileResult { info, entries: vec![], file_modified, path_str }),
                Err(e) => {
                    warn!("Failed to parse header {}: {}", path_str, e);
                    None
                }
            }
        });
    }

    let mut parsed_results: Vec<ParsedFileResult> = Vec::new();
    while let Some(result) = set.join_next().await {
        match result {
            Ok(Some(data)) => parsed_results.push(data),
            Ok(None) => {}
            Err(e) => warn!("Task join error: {}", e),
        }
    }

    parsed_results
}

/// Parallel scan all JSONL files using tokio tasks
/// Strategy: Parse files in parallel (pure CPU work), return results for caller to handle DB
pub(crate) async fn parallel_parse_files(files: Vec<PathBuf>) -> Vec<ParsedFileResult> {
    use tokio::task::JoinSet;

    let mut set = JoinSet::new();

    // Spawn parsing tasks - each task is independent and Send-safe
    for file_path in files {
        set.spawn(async move {
            let path_str = file_path.to_string_lossy().to_string();
            let metadata = fs::metadata(crate::domain::session_bridge::backing_file_path(&file_path));
            let file_modified: DateTime<Utc> = match metadata {
                Ok(m) => DateTime::from(m.modified().unwrap_or(std::time::SystemTime::now())),
                Err(e) => {
                    warn!("Failed to get metadata for {}: {}", path_str, e);
                    return None;
                }
            };

            // Parse the file
            match parse_session_info(&file_path) {
                Ok((info, entries)) => Some(ParsedFileResult { info, entries, file_modified, path_str }),
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
    let scan_started_at = Instant::now();
    let dirs_started_at = Instant::now();
    let all_dirs = get_all_session_dirs(config);
    let dirs_elapsed_ms = dirs_started_at.elapsed().as_millis();
    let realtime_cutoff = Utc::now() - Duration::days(config.realtime_cutoff_days);
    const MAX_RETRIES: usize = 1;
    let mut attempt = 0;

    loop {
        attempt += 1;
        let db_init_started_at = Instant::now();
        // Initialize database connection (may fail if corrupted)
        let mut conn = match sqlite::init_db_with_config(config) {
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
        let db_init_elapsed_ms = db_init_started_at.elapsed().as_millis();

        // Collect all files first
        let collect_started_at = Instant::now();
        let files = collect_session_files(&all_dirs);
        let collect_elapsed_ms = collect_started_at.elapsed().as_millis();
        let total_files = files.len();
        info!("Collected {} session files for scanning from {} roots in {}ms (dirs={}ms, db_init={}ms)", total_files, all_dirs.len(), collect_elapsed_ms, dirs_elapsed_ms, db_init_elapsed_ms);

        // Load all sessions from DB first (O(1) lookup by path)
        let db_load_started_at = Instant::now();
        let db_sessions = sqlite::get_all_sessions(&conn)?.into_iter().filter(|session| crate::domain::session_bridge::is_session_visible_under_config(Path::new(&session.path), config)).collect::<Vec<_>>();
        let db_load_elapsed_ms = db_load_started_at.elapsed().as_millis();
        let db_paths: std::collections::HashSet<&str> = db_sessions.iter().map(|s| s.path.as_str()).collect();
        let scan_state_by_path = sqlite::get_all_scan_state(&conn)?;

        // Identify files that need parsing: new files or files whose scan_state metadata is stale
        let classify_started_at = Instant::now();
        let files_to_parse: Vec<PathBuf> = files
            .into_iter()
            .filter(|path| {
                let path_str = path.to_string_lossy();
                if !db_paths.contains(path_str.as_ref()) {
                    return true;
                }

                let Some(scan_state) = scan_state_by_path.get(path_str.as_ref()) else {
                    return true;
                };

                let backing_path = crate::domain::session_bridge::backing_file_path(path);
                let Ok(metadata) = std::fs::metadata(&backing_path) else {
                    return true;
                };
                let file_modified: chrono::DateTime<chrono::Utc> = DateTime::from(metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH));
                let file_size = metadata.len();

                scan_state.backing_path != backing_path.to_string_lossy() || scan_state.file_modified != file_modified || scan_state.file_size != file_size || scan_state.last_parse_status != "ok"
            })
            .collect();
        let classify_elapsed_ms = classify_started_at.elapsed().as_millis();

        info!("Need to parse {} files ({} cached, {} to parse) [db_load={}ms classify={}ms]", total_files, total_files - files_to_parse.len(), files_to_parse.len(), db_load_elapsed_ms, classify_elapsed_ms);

        // Parse only files that need updates
        // Use lightweight header-only parse for initial DB bootstrap (many files, empty DB)
        let is_initial_bootstrap = db_sessions.is_empty() && files_to_parse.len() > 100;
        let parse_started_at = Instant::now();
        let parsed_results = if files_to_parse.is_empty() {
            Vec::new()
        } else if is_initial_bootstrap {
            info!("Initial bootstrap: using lightweight header-only parse for {} files", files_to_parse.len());
            parallel_parse_headers_only(files_to_parse).await
        } else {
            parallel_parse_files(files_to_parse).await
        };
        let parse_elapsed_ms = parse_started_at.elapsed().as_millis();

        // Process results: separate realtime vs historical, upsert to DB
        let upsert_started_at = Instant::now();
        let mut updated_sessions: Vec<SessionInfo> = Vec::new();
        let mut updated_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut historical_upserts = 0usize;
        let mut realtime_buffered = 0usize;

        for result in parsed_results {
            let info = result.info.clone();
            set_cached_entries(&result.path_str, result.entries.clone());
            if result.file_modified > realtime_cutoff {
                // Realtime file: add to results, buffer for DB
                write_buffer::buffer_session_write(&info, result.file_modified);
                // Buffer full details (token/model/cost) from already-parsed entries
                if !result.entries.is_empty() {
                    let details = crate::core::parser::parse_session_details_from_entries(&result.entries);
                    write_buffer::buffer_details_write(&result.path_str, result.file_modified, &details);
                }
                let _ = sqlite::upsert_scan_state_for_session(&conn, &info, result.file_modified, "ok");
                realtime_buffered += 1;
            } else {
                // Historical file: upsert to DB and warm details cache
                if let Err(e) = sqlite::upsert_session(&mut conn, &info, result.file_modified, Some(&result.entries)) {
                    error!("Failed to upsert historical session {}: {}", result.path_str, e);
                    continue;
                } else {
                    // Populate session_details_cache from already-parsed entries
                    if !result.entries.is_empty() {
                        let details = crate::core::parser::parse_session_details_from_entries(&result.entries);
                        let _ = sqlite::upsert_session_details_cache(&conn, &result.path_str, result.file_modified, &details);
                    }
                    let _ = sqlite::upsert_scan_state_for_session(&conn, &info, result.file_modified, "ok");
                    historical_upserts += 1;
                }
            }
            updated_paths.insert(info.path.clone());
            updated_sessions.push(info);
        }
        let upsert_elapsed_ms = upsert_started_at.elapsed().as_millis();

        // Start with DB sessions, update only those that were re-parsed
        let merge_started_at = Instant::now();
        let mut all_sessions: Vec<SessionInfo> = Vec::new();
        for session in db_sessions {
            if updated_paths.contains(&session.path) {
                // This session was updated, skip stale DB snapshot and use reparsed value instead.
                continue;
            }
            all_sessions.push(session);
        }

        for session in updated_sessions {
            all_sessions.push(session);
        }

        all_sessions.sort_by_key(|b| std::cmp::Reverse(b.modified));

        let merge_elapsed_ms = merge_started_at.elapsed().as_millis();
        let realtime_count = all_sessions.iter().filter(|s| s.modified > realtime_cutoff).count();
        let historical_count = all_sessions.len() - realtime_count;

        info!(
            "Parallel scan complete: {} realtime (≤{}d), {} historical (>{}d), {} total [parse={}ms upsert={}ms merge={}ms total={}ms buffered={} historical_upserts={}]",
            realtime_count,
            config.realtime_cutoff_days,
            historical_count,
            config.realtime_cutoff_days,
            all_sessions.len(),
            parse_elapsed_ms,
            upsert_elapsed_ms,
            merge_elapsed_ms,
            scan_started_at.elapsed().as_millis(),
            realtime_buffered,
            historical_upserts,
        );
        // Details cache will be populated by the next full scan (30s) via parse_session_details_from_entries.
        // No need for a background warming task that re-reads all files.

        break Ok(all_sessions);
    }
}

/// Parse session info and extract message entries
/// Optimization: Use BufReader for streaming to reduce memory usage on large files
/// Returns: (SessionInfo, Vec<SessionEntry>) - session info and message entry list
pub fn parse_session_info(path: &Path) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    let start = std::time::Instant::now();
    let backing = crate::domain::session_bridge::backing_file_path(path);
    let file_size = fs::metadata(&backing).map(|m| m.len()).unwrap_or(0);
    let result = crate::domain::session_bridge::parse_session_info_from_path(path)?;
    let elapsed = start.elapsed();
    super::io_trace::trace_file_read(&path.to_string_lossy(), file_size, elapsed);
    info!("[IO:full_parse] path={} size={}bytes entries={} elapsed={:?}", path.display(), file_size, result.1.len(), elapsed);
    Ok(result)
}

pub fn extract_message_text(entry: &Value) -> String {
    extract_primary_message_text(entry)
}

pub fn extract_index_segments(entry: &Value, include_thinking: bool) -> Vec<(String, String)> {
    extract_message_contents(entry, include_thinking)
}

fn parse_timestamp(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s).map(|dt| dt.with_timezone(&Utc)).map_err(|e| format!("Failed to parse timestamp: {e}"))
}

/// Safely read only the tail of an append-only JSONL file.
/// Returns (new_offset, new_entries) on success, or Err("fallback") if the file
/// appears to have been rewritten in-place (size shrank, mtime changed without size change,
/// or JSON parse fails at the expected offset).
fn safe_append_only_read_jsonl(path: &Path, last_offset: u64) -> Result<(u64, Vec<SessionEntry>), String> {
    let metadata = fs::metadata(path).map_err(|e| format!("stat failed for {}: {}", path.display(), e))?;
    let current_size = metadata.len();
    let current_mtime = metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);

    // Layer 1: size/mtime guards
    if current_size < last_offset {
        return Err("fallback".to_string());
    }
    if current_size == last_offset {
        // No new bytes. If mtime changed anyway, something was rewritten in-place.
        // We can't detect mtime easily without storing it, so we rely on the caller
        // to only invoke us when the watcher has genuinely fired for this path.
        return Ok((last_offset, vec![]));
    }

    let file = std::fs::File::open(path).map_err(|e| format!("open failed for {}: {}", path.display(), e))?;
    let mut reader = std::io::BufReader::new(file);
    reader.seek(std::io::SeekFrom::Start(last_offset)).map_err(|_| "fallback".to_string())?;

    let delta = current_size - last_offset;
    let read_start = std::time::Instant::now();
    let mut new_content = String::new();
    use std::io::Read;
    reader.read_to_string(&mut new_content).map_err(|_| "fallback".to_string())?;
    let read_elapsed = read_start.elapsed();
    super::io_trace::trace_file_seek_read(&path.to_string_lossy(), last_offset, new_content.len() as u64, read_elapsed);
    info!("[IO:incremental] path={} offset={} delta={}bytes read={}bytes elapsed={:?}", path.display(), last_offset, delta, new_content.len(), read_elapsed);

    // Layer 2: trailing-newline guard against half-written lines
    let effective_bytes = if !new_content.ends_with('\n') {
        if let Some(pos) = new_content.rfind('\n') {
            new_content.truncate(pos + 1);
            new_content.len() as u64
        } else {
            // Not even one complete line
            return Ok((last_offset, vec![]));
        }
    } else {
        new_content.len() as u64
    };

    // Layer 3: parse validation. If the first new line is malformed,
    // the offset is wrong (someone rewrote earlier content).
    let mut entries = Vec::new();
    for line in new_content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<SessionEntry>(trimmed) {
            Ok(entry) => entries.push(entry),
            Err(_) => return Err("fallback".to_string()),
        }
    }

    Ok((last_offset + effective_bytes, entries))
}

/// Incrementally update SessionInfo by appending new entries.
fn incremental_update_session_info(old: &SessionInfo, new_entries: &[SessionEntry], file_modified: DateTime<Utc>) -> SessionInfo {
    let mut info = old.clone();
    info.user_messages_text.clear();
    info.assistant_messages_text.clear();
    let mut modified = info.modified;

    for entry in new_entries {
        if entry.entry_type == "message" {
            if let Some(ref message) = entry.message {
                info.message_count += 1;

                let text = message.content.iter().filter(|c| c.content_type == "text").filter_map(|c| c.text.as_ref()).cloned().collect::<Vec<String>>().join("");

                if message.role == "user" || message.role == "assistant" {
                    if info.first_message.is_empty() && message.role == "user" {
                        info.first_message = text.clone();
                    }
                    info.last_message = text;
                    info.last_message_role = message.role.clone();
                }
            }
        } else if entry.entry_type == "session_info" {
            if let Some(ref name) = entry.name {
                info.name = Some(name.clone());
            }
        }

        if entry.timestamp > modified {
            modified = entry.timestamp;
        }
    }

    // Use the most recent of entry timestamps or file mtime
    if file_modified > modified {
        modified = file_modified;
    }
    info.modified = modified;
    info
}

/// Incremental update: re-parse changed files, update cache, return diff for frontend merge.
pub async fn rescan_changed_files(changed_paths: Vec<String>) -> Result<SessionsDiff, String> {
    let rescan_start = std::time::Instant::now();
    super::io_trace::trace_scan("rescan_start", &format!("{} files", changed_paths.len()));
    let mut sessions = if let Ok(guard) = SCAN_CACHE.read() { guard.clone().unwrap_or_default() } else { vec![] };

    if sessions.is_empty() {
        sessions = scan_sessions().await?;
    }

    let mut diff = SessionsDiff { updated: vec![], removed: vec![] };
    // Collect updates for single batch DB commit (avoids per-file transaction overhead)
    let mut batch_updates: Vec<(SessionInfo, DateTime<Utc>)> = Vec::new();
    // Track offset/trust updates to apply after batch commit
    let mut offset_updates: Vec<(String, u64, u32)> = Vec::new();

    let config = Config::load().unwrap_or_default();
    let mut conn = crate::data::sqlite::init_db_with_config(&config)?;

    for path_str in &changed_paths {
        let path = PathBuf::from(path_str);
        let is_opencode_db = crate::domain::session_bridge::is_opencode_db_path(&path);

        if !path.exists() {
            let removed_paths = sessions.iter().filter(|session| session.path == *path_str || crate::domain::session_bridge::backing_file_path(Path::new(&session.path)) == path).map(|session| session.path.clone()).collect::<Vec<_>>();

            if !removed_paths.is_empty() {
                sessions.retain(|session| !removed_paths.iter().any(|removed| removed == &session.path));
                for removed in removed_paths {
                    let _ = crate::data::sqlite::delete_session(&conn, &removed);
                    let _ = crate::data::sqlite::delete_scan_state(&conn, &removed);
                    diff.removed.push(removed);
                }
                info!("Session removed (file deleted): {path_str}");
            }
            continue;
        }

        let expanded_paths = if is_opencode_db { crate::domain::session_bridge::expand_opencode_session_paths(&path) } else { vec![path.clone()] };
        let mut seen_paths = std::collections::HashSet::new();

        for expanded_path in expanded_paths {
            let session_path_str = expanded_path.to_string_lossy().to_string();
            let backing = crate::domain::session_bridge::backing_file_path(&expanded_path);
            let file_modified = match fs::metadata(&backing).and_then(|m| m.modified()) {
                Ok(mt) => DateTime::from(mt),
                Err(e) => {
                    warn!("Failed to get metadata for {}: {}", expanded_path.display(), e);
                    continue;
                }
            };

            let scan_state = sqlite::get_scan_state(&conn, &session_path_str).ok().flatten();
            let trust = scan_state.as_ref().map(|s| s.append_trust_count).unwrap_or(0);
            let last_offset = scan_state.as_ref().map(|s| s.read_offset).unwrap_or(0);

            // Try incremental tail-read if trust level is high enough
            let parse_result: Option<(SessionInfo, Vec<SessionEntry>, u64, u32)> = if trust >= 3 {
                match safe_append_only_read_jsonl(&backing, last_offset) {
                    Ok((new_offset, new_entries)) if !new_entries.is_empty() => {
                        if let Some(old_entries) = get_cached_entries(&session_path_str) {
                            // Try in-memory first, then DB, then construct minimal info
                            let old_info = sessions.iter().find(|s| s.path == session_path_str).cloned().or_else(|| sqlite::get_session(&conn, &session_path_str).ok().flatten());
                            if let Some(old_info) = old_info {
                                let mut all_entries = old_entries;
                                all_entries.extend(new_entries.clone());
                                let info = incremental_update_session_info(&old_info, &new_entries, file_modified);
                                set_cached_entries(&session_path_str, all_entries.clone());
                                let _ = sqlite::append_message_entries(&conn, &session_path_str, &new_entries);
                                let _ = sqlite::update_labels_for_entries(&conn, &session_path_str, &all_entries);
                                Some((info, all_entries, new_offset, trust.saturating_add(1)))
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    }
                    Ok((new_offset, _)) => {
                        // No new complete lines; just refresh offset
                        let _ = sqlite::update_scan_state_offset_and_trust(&conn, &session_path_str, new_offset, trust);
                        continue;
                    }
                    Err(_) => None,
                }
            } else {
                None
            };

            let is_incremental = parse_result.is_some();
            let (info, entries, new_offset, new_trust) = match parse_result {
                Some(triple) => triple,
                None => {
                    // Fallback: full re-parse
                    match parse_session_info(&expanded_path) {
                        Ok((info, entries)) => {
                            let file_size = fs::metadata(&backing).map(|m| m.len()).unwrap_or(0);
                            set_cached_entries(&session_path_str, entries.clone());
                            // After successful full parse, set trust to 3 so next event uses incremental read.
                            // No need to wait for 3 full parses — the file is verified as valid JSONL.
                            (info, entries, file_size, 3u32)
                        }
                        Err(e) => {
                            warn!("Failed to re-parse {}: {}", expanded_path.display(), e);
                            continue;
                        }
                    }
                }
            };

            seen_paths.insert(info.path.clone());

            // For incremental updates: append_message_entries already inserted new entries.
            // For full-parse fallback: sync message entries now.
            if !is_incremental && !entries.is_empty() {
                let _ = sqlite::sync_message_entries(&conn, &session_path_str, &entries);
                let _ = sqlite::update_labels_for_entries(&conn, &session_path_str, &entries);
            }

            // Collect for batch DB commit (avoids per-file transaction overhead)
            batch_updates.push((info.clone(), file_modified));
            offset_updates.push((session_path_str.clone(), new_offset, new_trust));

            crate::core::write_buffer::buffer_session_write(&info, file_modified);

            // Buffer details from already-parsed entries (avoids re-reading file)
            // For incremental case, details will be computed from DB on next stats request.
            if new_trust == 3 && !entries.is_empty() {
                let details = crate::core::parser::parse_session_details_from_entries(&entries);
                write_buffer::buffer_details_write(&session_path_str, file_modified, &details);
            }

            diff.updated.push(info.clone());

            if let Some(existing) = sessions.iter_mut().find(|s| s.path == info.path) {
                *existing = info;
            } else {
                sessions.push(info);
            }
        }

        if is_opencode_db {
            let removed_paths = sessions.iter().filter(|session| crate::domain::session_bridge::backing_file_path(Path::new(&session.path)) == path && !seen_paths.contains(&session.path)).map(|session| session.path.clone()).collect::<Vec<_>>();

            for removed in removed_paths {
                sessions.retain(|session| session.path != removed);
                let _ = crate::data::sqlite::delete_session(&conn, &removed);
                let _ = crate::data::sqlite::delete_scan_state(&conn, &removed);
                diff.removed.push(removed);
            }
        }
    }

    // Batch commit all session + scan_state updates in a single transaction
    if !batch_updates.is_empty() {
        if let Err(e) = sqlite::upsert_sessions_batch(&mut conn, &batch_updates) {
            warn!("Batch upsert failed: {}", e);
        }
        // Apply offset/trust updates individually (lightweight, no message_entries)
        for (path, offset, trust) in &offset_updates {
            let _ = sqlite::update_scan_state_offset_and_trust(&conn, path, *offset, *trust);
        }
    }

    if !diff.updated.is_empty() || !diff.removed.is_empty() {
        sessions.sort_by_key(|b| std::cmp::Reverse(b.modified));
        if let Ok(mut guard) = SCAN_CACHE.write() {
            *guard = Some(sessions);
            CACHE_VERSION.fetch_add(1, Ordering::Relaxed);
        }
    }

    let rescan_elapsed = rescan_start.elapsed();
    super::io_trace::trace_scan("rescan_done", &format!("updated={} removed={} elapsed={:?}", diff.updated.len(), diff.removed.len(), rescan_elapsed));
    debug!("Incremental rescan: {} updated, {} removed in {:?}", diff.updated.len(), diff.removed.len(), rescan_elapsed);

    Ok(diff)
}

pub struct ScannerScheduler {
    config: Config,
    scan_interval: TokioDuration,
}

impl ScannerScheduler {
    pub fn new(_sessions_dir: PathBuf, scan_interval_secs: u64, config: Config) -> Self {
        Self { config, scan_interval: TokioDuration::from_secs(scan_interval_secs) }
    }

    pub async fn start(&self) {
        info!("Starting scanner scheduler with {}s interval", self.scan_interval.as_secs());
        let mut ticker = interval(self.scan_interval);
        ticker.tick().await;

        loop {
            ticker.tick().await;

            // Skip full scan if file watcher has been active recently (within 2x interval).
            // Watcher handles real-time changes; scanner is only a safety net.
            let interval_secs = self.scan_interval.as_secs();
            if watcher_active_within(interval_secs * 2) {
                trace!("Scanner: watcher recently active, skipping full scan");
                continue;
            }

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
        let files = collect_session_files(&all_dirs);
        let total_files = files.len();

        if total_files == 0 {
            return Ok("No files to scan".to_string());
        }

        let mut conn = sqlite::init_db_with_config(&self.config)?;
        let realtime_cutoff = Utc::now() - Duration::days(self.config.realtime_cutoff_days);

        let cached_file_modified = sqlite::get_all_cached_file_modified(&conn)?;
        let all_scan_states = sqlite::get_all_scan_state(&conn).unwrap_or_default();

        // Separate changed files into incremental (high trust) vs full-parse (low trust/new)
        let mut incremental_files: Vec<(PathBuf, DateTime<Utc>, u64)> = Vec::new();
        let mut files_to_parse = Vec::new();
        let mut skipped = 0;

        for path in files {
            let path_str = path.to_string_lossy().to_string();
            let backing_path = crate::domain::session_bridge::backing_file_path(&path);
            let file_modified: DateTime<Utc> = match fs::metadata(&backing_path).and_then(|metadata| metadata.modified()) {
                Ok(modified) => DateTime::from(modified),
                Err(error) => {
                    warn!("Failed to get metadata for {}: {}", path.display(), error);
                    continue;
                }
            };

            if cached_file_modified.get(&path_str).is_some_and(|cached| file_modified <= *cached) {
                skipped += 1;
                continue;
            }

            // Skip files recently processed by file watcher (within 10s) to avoid duplicate work
            if let Some(ss) = all_scan_states.get(&path_str) {
                let recently_scanned = Utc::now().signed_duration_since(ss.last_scanned_at).num_seconds() < 10;
                if recently_scanned {
                    skipped += 1;
                    continue;
                }
            }

            // Check if we can do incremental read (trust >= 3 and has offset)
            if let Some(ss) = all_scan_states.get(&path_str) {
                if ss.append_trust_count >= 3 && ss.read_offset > 0 {
                    incremental_files.push((path, file_modified, ss.read_offset));
                    continue;
                }
            }

            files_to_parse.push(path);
        }

        let mut updated = 0;
        let mut added = 0;

        // Process high-trust files with incremental tail-read (seek to offset, read only new bytes)
        for (path, file_modified, last_offset) in incremental_files {
            let path_str = path.to_string_lossy().to_string();
            let backing = crate::domain::session_bridge::backing_file_path(&path);

            match safe_append_only_read_jsonl(&backing, last_offset) {
                Ok((new_offset, new_entries)) if !new_entries.is_empty() => {
                    // Merge new entries into cached session info
                    if let (Some(old_entries), Some(old_info)) = (get_cached_entries(&path_str), get_cached_session_info(&path_str)) {
                        let mut all_entries = old_entries;
                        all_entries.extend(new_entries.clone());
                        let info = incremental_update_session_info(&old_info, &new_entries, file_modified);
                        set_cached_entries(&path_str, all_entries.clone());
                        let _ = sqlite::append_message_entries(&conn, &path_str, &new_entries);
                        let _ = sqlite::update_labels_for_entries(&conn, &path_str, &all_entries);
                        // Update sessions table (pass None to skip redundant sync_message_entries)
                        let _ = sqlite::upsert_session(&mut conn, &info, file_modified, None);
                        upsert_cached_session(info);
                        let trust = all_scan_states.get(&path_str).map(|s| s.append_trust_count).unwrap_or(3);
                        let _ = sqlite::update_scan_state_offset_and_trust(&conn, &path_str, new_offset, trust.saturating_add(1));
                        updated += 1;
                    } else {
                        // No cached entries/info, fall back to full parse
                        files_to_parse.push(path);
                    }
                }
                Ok((new_offset, _)) => {
                    // No new complete lines, just update offset
                    let trust = all_scan_states.get(&path_str).map(|s| s.append_trust_count).unwrap_or(3);
                    let _ = sqlite::update_scan_state_offset_and_trust(&conn, &path_str, new_offset, trust);
                    skipped += 1;
                }
                Err(_) => {
                    // Incremental read failed (file truncated/rewritten), fall back to full parse
                    files_to_parse.push(path);
                }
            }
        }

        // Full parse only for low-trust/new files
        let parsed_results = parallel_parse_files(files_to_parse).await;

        for result in parsed_results {
            let path_str = &result.path_str;
            let file_modified = result.file_modified;
            let was_cached = cached_file_modified.contains_key(path_str);

            sqlite::upsert_session(&mut conn, &result.info, file_modified, Some(&result.entries))?;
            if was_cached {
                updated += 1;
            } else {
                added += 1;
            }

            // Buffer realtime files for stats
            if file_modified > realtime_cutoff {
                write_buffer::buffer_session_write(&result.info, file_modified);
                if !result.entries.is_empty() {
                    let details = crate::core::parser::parse_session_details_from_entries(&result.entries);
                    write_buffer::buffer_details_write(path_str, file_modified, &details);
                }
            }
        }

        let elapsed = start.elapsed();
        super::io_trace::trace_scan("scan_complete", &format!("+{added} added ~{updated} updated {skipped} skipped elapsed={elapsed:?}"));
        info!("Scanner complete: +{} added, ~{} updated, {} skipped in {:?}", added, updated, skipped, elapsed);

        Ok(format!("Scanned: +{added} added, ~{updated} updated, {skipped} skipped"))
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
