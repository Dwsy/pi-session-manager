use crate::config::Config;
use crate::core::write_buffer;
use crate::data::search::index::{extract_message_contents, extract_primary_message_text};
use crate::data::sqlite;
use crate::types::{SessionEntry, SessionInfo, SessionsDiff};
/// Check if an error message indicates database corruption
use chrono::{DateTime, Duration, Utc};
use rusqlite::Connection;
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
static SCAN_STATE_CACHE: RwLock<Option<std::collections::HashMap<String, sqlite::scan_state::ScanStateEntry>>> = RwLock::new(None);
static CACHED_FILE_MODIFIED: RwLock<Option<std::collections::HashMap<String, chrono::DateTime<chrono::Utc>>>> = RwLock::new(None);
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
    if let Ok(mut guard) = SCAN_STATE_CACHE.write() {
        *guard = None;
    }
    if let Ok(mut guard) = CACHED_FILE_MODIFIED.write() {
        *guard = None;
    }
}

/// Get cached file modified timestamps from cache or DB. Populates cache on first access.
pub fn get_cached_file_modified_cached(conn: &Connection) -> std::collections::HashMap<String, chrono::DateTime<chrono::Utc>> {
    // Try cache first
    if let Ok(guard) = CACHED_FILE_MODIFIED.read() {
        if let Some(ref cached) = *guard {
            super::io_trace::trace_scan("cached_file_modified_hit", &format!("count={}", cached.len()));
            return cached.clone();
        }
    }
    // Cache miss: load from DB and populate cache
    let start = Instant::now();
    let modified = sqlite::get_all_cached_file_modified(conn).unwrap_or_default();
    super::io_trace::trace_db("get_all_cached_file_modified", "sessions", modified.len(), start.elapsed());
    if let Ok(mut guard) = CACHED_FILE_MODIFIED.write() {
        *guard = Some(modified.clone());
    }
    modified
}

/// Update cached file modified after a session write
pub fn update_cached_file_modified(path: String, file_modified: chrono::DateTime<chrono::Utc>) {
    if let Ok(mut guard) = CACHED_FILE_MODIFIED.write() {
        if let Some(ref mut cached) = *guard {
            cached.insert(path, file_modified);
        }
    }
}

/// Get scan state from cache or DB. Populates cache on first access.
pub fn get_scan_state_cached(conn: &Connection) -> std::collections::HashMap<String, sqlite::scan_state::ScanStateEntry> {
    // Try cache first
    if let Ok(guard) = SCAN_STATE_CACHE.read() {
        if let Some(ref cached) = *guard {
            super::io_trace::trace_scan("scan_state_hit", &format!("count={}", cached.len()));
            return cached.clone();
        }
    }
    // Cache miss: load from DB and populate cache
    let start = Instant::now();
    let states = sqlite::get_all_scan_state(conn).unwrap_or_default();
    super::io_trace::trace_db("get_all_scan_state", "scan_state", states.len(), start.elapsed());
    if let Ok(mut guard) = SCAN_STATE_CACHE.write() {
        *guard = Some(states.clone());
    }
    states
}

/// Update scan state cache after a write (call after upsert_scan_state/update_scan_state)
pub fn update_scan_state_cache(path: String, entry: sqlite::scan_state::ScanStateEntry) {
    if let Ok(mut guard) = SCAN_STATE_CACHE.write() {
        if let Some(ref mut cached) = *guard {
            cached.insert(path, entry);
        }
    }
}

/// Remove a path from scan state cache
pub fn remove_from_scan_state_cache(path: &str) {
    if let Ok(mut guard) = SCAN_STATE_CACHE.write() {
        if let Some(ref mut cached) = *guard {
            cached.remove(path);
        }
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
    SCAN_CACHE.read().ok().and_then(|g| g.as_ref().map(|sessions| sessions.iter().map(clone_session_for_list).collect()))
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
        model: session.model.clone(),
        models: session.models.clone(),
    }
}

/// Snapshot cached sessions optimized for list/pagination APIs.
/// Drops heavy conversation blobs to reduce clone cost and memory pressure.
pub fn get_cached_sessions_for_list() -> Option<Vec<SessionInfo>> {
    get_cached_sessions()
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
            if config.include_default_pi_session_dir {
                for root in source.session_roots() {
                    if root.exists() && !dirs.iter().any(|existing| existing == &root) {
                        dirs.push(root);
                    }
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
            return Ok(cached.iter().map(clone_session_for_list).collect());
        }
    }

    // Wait for in-progress scan to complete instead of starting a duplicate
    while SCAN_IN_PROGRESS.load(Ordering::Acquire) {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        if let Ok(guard) = SCAN_CACHE.read() {
            if let Some(ref cached) = *guard {
                return Ok(cached.iter().map(clone_session_for_list).collect());
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
        let is_cursor_db = crate::domain::session_bridge::is_cursor_db_path(path);
        let is_antigravity_jsonl = crate::domain::session_bridge::is_antigravity_session_file(path);

        if !is_jsonl && !is_opencode_db && !is_gemini_json && !is_cursor_db && !is_antigravity_jsonl {
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

        if is_cursor_db {
            let paths = crate::domain::session_bridge::expand_cursor_session_paths(path);
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
        let scan_state_by_path = get_scan_state_cached(&conn);

        // Identify files that need parsing: new files or files whose scan_state metadata is stale
        let classify_started_at = Instant::now();
        let mut files_to_parse: Vec<PathBuf> = Vec::new();
        let mut stale_new_file = 0usize;
        let mut stale_no_scan_state = 0usize;
        let mut stale_metadata_error = 0usize;
        let mut stale_backing_path = 0usize;
        let mut stale_modified = 0usize;
        let mut stale_size = 0usize;
        let mut stale_status = 0usize;
        let mut parse_candidate_bytes = 0u64;
        let mut stale_samples: Vec<String> = Vec::new();

        for path in files {
            let path_str = path.to_string_lossy();
            let reason = if !db_paths.contains(path_str.as_ref()) {
                stale_new_file += 1;
                Some("new")
            } else {
                match scan_state_by_path.get(path_str.as_ref()) {
                    None => {
                        stale_no_scan_state += 1;
                        Some("no_scan_state")
                    }
                    Some(scan_state) => {
                        let backing_path = crate::domain::session_bridge::backing_file_path(&path);
                        match std::fs::metadata(&backing_path) {
                            Err(_) => {
                                stale_metadata_error += 1;
                                Some("metadata_error")
                            }
                            Ok(metadata) => {
                                let file_modified: chrono::DateTime<chrono::Utc> = DateTime::from(metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH));
                                let file_size = metadata.len();
                                if scan_state.backing_path != backing_path.to_string_lossy() {
                                    stale_backing_path += 1;
                                    Some("backing_path")
                                } else if scan_state.file_modified != file_modified {
                                    stale_modified += 1;
                                    Some("modified")
                                } else if scan_state.file_size != file_size {
                                    stale_size += 1;
                                    Some("size")
                                } else if scan_state.last_parse_status != "ok" {
                                    stale_status += 1;
                                    Some("status")
                                } else {
                                    None
                                }
                            }
                        }
                    }
                }
            };

            if let Some(reason) = reason {
                let backing_path = crate::domain::session_bridge::backing_file_path(&path);
                let bytes = std::fs::metadata(&backing_path).map(|metadata| metadata.len()).unwrap_or(0);
                parse_candidate_bytes = parse_candidate_bytes.saturating_add(bytes);
                if stale_samples.len() < 12 {
                    stale_samples.push(format!("{reason}:{}:{}B", path.display(), bytes));
                }
                files_to_parse.push(path);
            }
        }
        let classify_elapsed_ms = classify_started_at.elapsed().as_millis();

        info!(
            "[IO:classify] total={} cached={} parse={} parse_bytes={} new={} no_scan_state={} metadata_error={} backing_path={} modified={} size={} status={} elapsed={}ms samples={:?}",
            total_files,
            total_files - files_to_parse.len(),
            files_to_parse.len(),
            parse_candidate_bytes,
            stale_new_file,
            stale_no_scan_state,
            stale_metadata_error,
            stale_backing_path,
            stale_modified,
            stale_size,
            stale_status,
            classify_elapsed_ms,
            stale_samples
        );
        super::io_trace::trace_scan(
            "classify",
            &format!(
                "total={} cached={} parse={} parse_bytes={} new={} no_scan_state={} metadata_error={} backing_path={} modified={} size={} status={} elapsed={}ms",
                total_files,
                total_files - files_to_parse.len(),
                files_to_parse.len(),
                parse_candidate_bytes,
                stale_new_file,
                stale_no_scan_state,
                stale_metadata_error,
                stale_backing_path,
                stale_modified,
                stale_size,
                stale_status,
                classify_elapsed_ms
            ),
        );

        info!("Need to parse {} files ({} cached, {} to parse) [db_load={}ms classify={}ms]", total_files, total_files - files_to_parse.len(), files_to_parse.len(), db_load_elapsed_ms, classify_elapsed_ms);

        // Parse only files that need updates
        let parse_started_at = Instant::now();
        let parsed_results = if files_to_parse.is_empty() { Vec::new() } else { parallel_parse_files(files_to_parse).await };
        let parse_elapsed_ms = parse_started_at.elapsed().as_millis();

        // Process results: separate realtime vs historical, upsert to DB
        let upsert_started_at = Instant::now();
        let mut updated_sessions: Vec<SessionInfo> = Vec::new();
        let mut updated_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut historical_upserts = 0usize;
        let mut realtime_buffered = 0usize;

        // Separate realtime vs historical results for batched transaction writes
        let mut realtime_results: Vec<_> = Vec::new();
        let mut historical_results: Vec<_> = Vec::new();
        for result in parsed_results {
            set_cached_entries(&result.path_str, result.entries.clone());
            if result.file_modified > realtime_cutoff {
                write_buffer::buffer_session_write(&result.info, result.file_modified);
                realtime_results.push(result);
            } else {
                historical_results.push(result);
            }
        }

        // Batch realtime SQLite writes in a single transaction (details_cache + scan_state)
        if !realtime_results.is_empty() {
            match conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate) {
                Ok(tx) => {
                    for result in &realtime_results {
                        if !result.entries.is_empty() {
                            let details = crate::core::parser::parse_session_details_from_entries(&result.entries);
                            let _ = sqlite::upsert_session_details_cache_in_tx(&tx, &result.path_str, result.file_modified, &details);
                        }
                        let _ = sqlite::upsert_scan_state_for_session_in_tx(&tx, &result.info, result.file_modified, "ok");
                    }
                    if let Err(e) = tx.commit() {
                        error!("Failed to commit realtime batch transaction: {e}");
                    }
                }
                Err(e) => error!("Failed to begin realtime batch transaction: {e}"),
            }
            realtime_buffered = realtime_results.len();
            for result in &realtime_results {
                updated_paths.insert(result.info.path.clone());
                updated_sessions.push(result.info.clone());
            }
        }

        // Batch historical SQLite writes in a single transaction (session + details_cache + scan_state)
        if !historical_results.is_empty() {
            match conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate) {
                Ok(tx) => {
                    for result in &historical_results {
                        if let Err(e) = sqlite::upsert_session_in_tx(&tx, &result.info, result.file_modified, Some(&result.entries)) {
                            error!("Failed to upsert historical session {}: {}", result.path_str, e);
                            continue;
                        }
                        if !result.entries.is_empty() {
                            let details = crate::core::parser::parse_session_details_from_entries(&result.entries);
                            let _ = sqlite::upsert_session_details_cache_in_tx(&tx, &result.path_str, result.file_modified, &details);
                        }
                        let _ = sqlite::upsert_scan_state_for_session_in_tx(&tx, &result.info, result.file_modified, "ok");
                        historical_upserts += 1;
                    }
                    if let Err(e) = tx.commit() {
                        error!("Failed to commit historical batch transaction: {e}");
                    }
                }
                Err(e) => error!("Failed to begin historical batch transaction: {e}"),
            }

            for result in &historical_results {
                updated_paths.insert(result.info.path.clone());
                updated_sessions.push(result.info.clone());
            }
        }
        let upsert_elapsed_ms = upsert_started_at.elapsed().as_millis();

        // Invalidate scan state cache after batch upserts
        if let Ok(mut guard) = SCAN_STATE_CACHE.write() {
            *guard = None;
        }
        if let Ok(mut guard) = CACHED_FILE_MODIFIED.write() {
            *guard = None;
        }

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
    super::io_trace::trace_scan("full_parse", &format!("path={} bytes={} entries={} elapsed={:?}", path.display(), file_size, result.1.len(), elapsed));
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

        let is_cursor_db = crate::domain::session_bridge::is_cursor_db_path(&path);
        let expanded_paths = if is_opencode_db {
            crate::domain::session_bridge::expand_opencode_session_paths(&path)
        } else if is_cursor_db {
            crate::domain::session_bridge::expand_cursor_session_paths(&path)
        } else {
            vec![path.clone()]
        };
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

            // Quick skip: if file mtime and size match last scan, nothing changed.
            if let Some(ref state) = scan_state {
                let current_size = fs::metadata(&backing).map(|m| m.len()).unwrap_or(0);
                if state.file_modified == file_modified && state.file_size == current_size {
                    continue;
                }
            }

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

            // Update session_details_cache with cumulative data.
            // For incremental reads, `entries` contains ALL entries (old cached + new appended),
            // so parse_session_details_from_entries produces correct cumulative stats.
            // Previously this wrote only-delta data to write_buffer via buffer_details_write,
            // causing stats to undercount for active sessions.
            if !entries.is_empty() {
                let details = crate::core::parser::parse_session_details_from_entries(&entries);
                if let Err(e) = sqlite::upsert_session_details_cache(&conn, &session_path_str, file_modified, &details) {
                    warn!("Failed to update session_details_cache for {}: {}", session_path_str, e);
                }
            }

            diff.updated.push(info.clone());

            if let Some(existing) = sessions.iter_mut().find(|s| s.path == info.path) {
                *existing = info;
            } else {
                sessions.push(info);
            }
        }

        if is_opencode_db || is_cursor_db {
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

        let cached_file_modified = get_cached_file_modified_cached(&conn);
        let all_scan_states = get_scan_state_cached(&conn);

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
                        // Batch all incremental DB writes into a single transaction
                        // to avoid per-op commit overhead (WAL checkpoint + FTS trigger cost).
                        match conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate) {
                            Ok(tx) => {
                                let _ = sqlite::append_message_entries(&tx, &path_str, &new_entries);
                                let _ = sqlite::update_labels_for_entries(&tx, &path_str, &all_entries);
                                let _ = sqlite::upsert_session_in_tx(&tx, &info, file_modified, None);
                                let trust = all_scan_states.get(&path_str).map(|s| s.append_trust_count).unwrap_or(3);
                                let _ = sqlite::update_scan_state_offset_and_trust(&tx, &path_str, new_offset, trust.saturating_add(1));
                                if let Err(e) = tx.commit() {
                                    warn!("Failed to commit incremental update for {}: {}", path_str, e);
                                }
                            }
                            Err(e) => warn!("Failed to begin incremental transaction for {}: {}", path_str, e),
                        }
                        upsert_cached_session(info);
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

            // Buffer realtime files for stats and update session_details_cache
            if file_modified > realtime_cutoff {
                write_buffer::buffer_session_write(&result.info, file_modified);
            }
            // Update session_details_cache for all parsed files (realtime + historical)
            if !result.entries.is_empty() {
                let details = crate::core::parser::parse_session_details_from_entries(&result.entries);
                let _ = sqlite::upsert_session_details_cache(&conn, path_str, file_modified, &details);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_all_session_dirs_respects_default_pi_toggle() {
        let temp = tempfile::tempdir().expect("tempdir");
        let extra_path = temp.path().to_path_buf();
        let mut config = Config::default();
        config.include_default_pi_session_dir = false;
        config.session_paths = vec![extra_path.to_string_lossy().to_string()];

        let dirs = get_all_session_dirs(&config);

        assert!(dirs.iter().any(|dir| dir == &extra_path));
        if let Ok(pi_root) = crate::paths::pi_agent_sessions_dir() {
            assert!(!dirs.iter().any(|dir| dir == &pi_root));
        }
    }

    #[test]
    fn test_full_parse_populates_details_and_message_entries() {
        let test_dir = std::path::PathBuf::from("/Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu-.pi-agent-extensions--");
        if !test_dir.exists() {
            eprintln!("Skipping: test directory not found");
            return;
        }

        // Use a temp DB directly (no env var to avoid test isolation issues)
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("sessions.db");
        let config = Config::default();
        let conn = sqlite::init_db_with_path(&db_path, &config).expect("db init");

        // Find one file to test with
        let mut test_file: Option<PathBuf> = None;
        for entry in std::fs::read_dir(&test_dir).expect("read_dir").flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "jsonl") {
                test_file = Some(path);
                break;
            }
        }
        let test_file = test_file.expect("should find a jsonl file");
        eprintln!("Testing with: {}", test_file.display());

        // Full parse
        let (info, entries) = parse_session_info(&test_file).expect("parse");
        assert!(entries.len() > 0, "full parse should return entries, got {}", entries.len());
        assert!(info.message_count > 0, "should have messages");

        // Upsert session with entries → populates message_entries
        let file_modified = Utc::now();
        let mut c = conn;
        sqlite::upsert_session(&mut c, &info, file_modified, Some(&entries)).expect("upsert");

        // Upsert details cache → populates tokens/cost
        let details = crate::core::parser::parse_session_details_from_entries(&entries);
        assert!(details.user_messages + details.assistant_messages > 0, "details should have messages");
        sqlite::upsert_session_details_cache(&c, &info.path, file_modified, &details).expect("details cache");

        // Verify message_entries
        let me_count: i64 = c.query_row("SELECT COUNT(*) FROM message_entries WHERE session_path = ?1", rusqlite::params![info.path], |row| row.get(0)).unwrap_or(0);
        assert!(me_count > 0, "message_entries should be populated, got {}", me_count);

        // Verify session_details_cache
        let cached = sqlite::get_session_details_cache(&c, &info.path).expect("get cache").expect("cache should exist");
        assert!(cached.user_messages + cached.assistant_messages > 0, "cached details should have messages");

        eprintln!("OK: entries={} message_entries={} details: user={} assistant={} tokens={}/{} cost={}", entries.len(), me_count, cached.user_messages, cached.assistant_messages, cached.input_tokens, cached.output_tokens, cached.input_cost + cached.output_cost);

        // temp dir drops here, cleaning up the DB file
    }
}
