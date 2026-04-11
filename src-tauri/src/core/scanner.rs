use crate::config::Config;
use crate::core::write_buffer;
use crate::data::search::index::{extract_message_contents, extract_primary_message_text};
use crate::data::sqlite;
use crate::types::{SessionEntry, SessionInfo, SessionsDiff};
/// Check if an error message indicates database corruption
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use std::fs;
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
    if config.session_source_mode == crate::config::SessionSourceMode::Dataset {
        let mut dataset_dirs = Vec::new();
        if let Some(home) = dirs::home_dir() {
            for active_dataset_id in config.effective_active_dataset_ids() {
                if let Some(dataset) = config
                    .datasets
                    .iter()
                    .find(|item| item.id == active_dataset_id)
                {
                    dataset_dirs.push(
                        home.join(".pi")
                            .join("agent")
                            .join("sessions")
                            .join("datasets")
                            .join(&dataset.slug)
                            .join("sessions"),
                    );
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

        let enabled = config
            .effective_external_session_provider_slugs()
            .iter()
            .any(|slug| slug == &source.slug().replace('_', "-"));
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
pub(crate) fn collect_session_files(all_dirs: &[PathBuf]) -> Vec<PathBuf> {
    fn should_skip_dir(path: &Path, root: &Path, default_root: Option<&Path>) -> bool {
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            return false;
        };

        if matches!(
            name,
            "transcripts" | "subagent-artifacts" | "subagents" | ".timelines" | "checkpoints"
        ) {
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
        walk_dir(
            sessions_dir,
            sessions_dir,
            default_root.as_deref(),
            &mut files,
        );
    }
    files.sort();
    files.dedup();
    files
}

pub(crate) fn collect_jsonl_files(all_dirs: &[PathBuf]) -> Vec<PathBuf> {
    collect_session_files(all_dirs)
        .into_iter()
        .filter(|path| path.extension().map(|ext| ext == "jsonl").unwrap_or(false))
        .collect()
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
            let metadata =
                fs::metadata(crate::domain::session_bridge::backing_file_path(&file_path));
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

        // Collect all files first
        let files = collect_session_files(&all_dirs);
        let total_files = files.len();
        info!("Collected {} JSONL files for scanning", total_files);

        // Load all sessions from DB first (O(1) lookup by path)
        let db_sessions = sqlite::get_all_sessions(&conn)?
            .into_iter()
            .filter(|session| {
                crate::domain::session_bridge::is_session_visible_under_config(
                    Path::new(&session.path),
                    config,
                )
            })
            .collect::<Vec<_>>();
        let db_paths: std::collections::HashSet<&str> =
            db_sessions.iter().map(|s| s.path.as_str()).collect();

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
                    if let Ok(Some(cached_modified)) =
                        sqlite::get_cached_file_modified(&conn, &path_str)
                    {
                        if let Ok(metadata) = std::fs::metadata(
                            crate::domain::session_bridge::backing_file_path(path),
                        ) {
                            let file_modified: chrono::DateTime<chrono::Utc> = DateTime::from(
                                metadata
                                    .modified()
                                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                            );
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

        info!(
            "Need to parse {} files ({} cached, {} to parse)",
            total_files,
            total_files - files_to_parse.len(),
            files_to_parse.len()
        );

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
                    &mut conn,
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
    crate::domain::session_bridge::parse_session_info_from_path(path)
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
    let mut conn = crate::data::sqlite::init_db_with_config(&config)?;

    for path_str in &changed_paths {
        let path = PathBuf::from(path_str);
        let is_opencode_db = crate::domain::session_bridge::is_opencode_db_path(&path);

        if !path.exists() {
            let removed_paths = sessions
                .iter()
                .filter(|session| {
                    session.path == *path_str
                        || crate::domain::session_bridge::backing_file_path(Path::new(
                            &session.path,
                        )) == path
                })
                .map(|session| session.path.clone())
                .collect::<Vec<_>>();

            if !removed_paths.is_empty() {
                sessions.retain(|session| {
                    !removed_paths.iter().any(|removed| removed == &session.path)
                });
                for removed in removed_paths {
                    let _ = crate::data::sqlite::delete_session(&conn, &removed);
                    diff.removed.push(removed);
                }
                info!("Session removed (file deleted): {path_str}");
            }
            continue;
        }

        let expanded_paths = if is_opencode_db {
            crate::domain::session_bridge::expand_opencode_session_paths(&path)
        } else {
            vec![path.clone()]
        };
        let mut seen_paths = std::collections::HashSet::new();

        for expanded_path in expanded_paths {
            match parse_session_info(&expanded_path) {
                Ok((info, entries)) => {
                    seen_paths.insert(info.path.clone());
                    let file_modified = match fs::metadata(
                        crate::domain::session_bridge::backing_file_path(&expanded_path),
                    )
                    .and_then(|m| m.modified())
                    {
                        Ok(mt) => DateTime::from(mt),
                        Err(e) => {
                            warn!(
                                "Failed to get metadata for {}: {}",
                                expanded_path.display(),
                                e
                            );
                            continue;
                        }
                    };

                    if let Err(e) = crate::data::sqlite::upsert_session(
                        &mut conn,
                        &info,
                        file_modified,
                        Some(&entries),
                    ) {
                        warn!("Failed to upsert session for {}: {}", info.path, e);
                    }

                    crate::core::write_buffer::buffer_session_write(&info, file_modified);
                    diff.updated.push(info.clone());

                    if let Some(existing) = sessions.iter_mut().find(|s| s.path == info.path) {
                        *existing = info;
                    } else {
                        sessions.push(info);
                    }
                }
                Err(e) => {
                    warn!("Failed to re-parse {}: {}", expanded_path.display(), e);
                }
            }
        }

        if is_opencode_db {
            let removed_paths = sessions
                .iter()
                .filter(|session| {
                    crate::domain::session_bridge::backing_file_path(Path::new(&session.path))
                        == path
                        && !seen_paths.contains(&session.path)
                })
                .map(|session| session.path.clone())
                .collect::<Vec<_>>();

            for removed in removed_paths {
                sessions.retain(|session| session.path != removed);
                let _ = crate::data::sqlite::delete_session(&conn, &removed);
                diff.removed.push(removed);
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
        let files = collect_session_files(&all_dirs);
        let total_files = files.len();

        if total_files == 0 {
            return Ok("No files to scan".to_string());
        }

        let mut conn = sqlite::init_db_with_config(&self.config)?;
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
                        &mut conn,
                        &result.info,
                        file_modified,
                        Some(&result.entries),
                    )?;
                    updated += 1;
                }
                None => {
                    sqlite::upsert_session(
                        &mut conn,
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
                write_buffer::buffer_session_write(
                    sessions.last().expect("session just pushed"),
                    file_modified,
                );
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

#[cfg(test)]
mod tests {
    use super::{collect_session_files, expand_tilde};
    use crate::config::Config;
    use crate::domain::casr_min::model::{CanonicalMessage, CanonicalSession, MessageRole};
    use crate::types::{SessionEntry, SessionInfo};
    use chrono::Utc;
    use serde_json::Value;

    #[test]
    fn expand_tilde_supports_windows_separator() {
        let Some(home) = dirs::home_dir() else {
            return;
        };

        let expanded = expand_tilde(r"~\.pi\agent\sessions");
        assert_eq!(
            expanded,
            home.join(".pi")
                .join("agent")
                .join("sessions")
                .to_string_lossy()
                .to_string()
        );
    }

    #[test]
    fn collect_session_files_expands_opencode_db_into_virtual_sessions() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace");

        for (idx, title) in ["First session", "Second session"].iter().enumerate() {
            let canonical = CanonicalSession {
                session_id: format!("seed-{idx}"),
                provider_slug: "codex".to_string(),
                workspace: Some(workspace.clone()),
                title: Some((*title).to_string()),
                started_at: Some(1_701_388_800_000 + (idx as i64 * 1000)),
                ended_at: Some(1_701_388_800_500 + (idx as i64 * 1000)),
                messages: vec![CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: format!("message-{idx}"),
                    timestamp: Some(1_701_388_800_000 + (idx as i64 * 1000)),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: Value::Null,
                }],
                metadata: Value::Null,
                source_path: workspace.join(format!("seed-{idx}.jsonl")),
                model_name: None,
            };

            crate::domain::casr_min::providers::opencode::write_session(
                &canonical,
                &format!("opc-session-{idx}"),
            )
            .expect("write opencode session");
        }

        let files = collect_session_files(&[workspace.clone()]);
        assert_eq!(files.len(), 2);
        assert!(
            files
                .iter()
                .all(|path| path.to_string_lossy().contains("opencode.db/")),
            "expected virtual opencode session paths"
        );
    }

    #[tokio::test]
    async fn scan_sessions_with_config_hides_disabled_external_cached_sessions() {
        // Ensure clean state - only remove PPM_TEST_DB, don't touch HOME
        std::env::remove_var("PPM_TEST_DB");

        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("sessions.db");
        std::env::set_var("HOME", temp.path());
        std::env::set_var("PPM_TEST_DB", &db_path);

        let pi_dir = temp
            .path()
            .join(".pi")
            .join("agent")
            .join("sessions")
            .join("local");
        std::fs::create_dir_all(&pi_dir).expect("pi dir");
        let pi_file = pi_dir.join("pi.jsonl");
        std::fs::write(
            &pi_file,
            r#"{"type":"session","id":"pi-1","timestamp":"2026-01-01T00:00:00Z","cwd":"/repo/pi"}
{"type":"message","id":"m1","timestamp":"2026-01-01T00:00:01Z","message":{"role":"user","content":[{"type":"text","text":"pi"}]}}"#,
        )
        .expect("write pi file");

        let mut conn = crate::data::sqlite::init_db_with_config(&Config::default()).expect("db");
        let now = Utc::now();
        let empty_entries: Vec<SessionEntry> = Vec::new();

        let pi_session = SessionInfo {
            path: pi_file.to_string_lossy().to_string(),
            id: "pi-1".to_string(),
            cwd: "/repo/pi".to_string(),
            name: Some("Pi".to_string()),
            created: now,
            modified: now,
            message_count: 10,
            first_message: "pi".to_string(),
            all_messages_text: String::new(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
        };
        let codex_session = SessionInfo {
            path: "/Users/demo/.codex/sessions/2026/01/01/rollout-a.jsonl".to_string(),
            id: "codex-1".to_string(),
            cwd: "/repo/codex".to_string(),
            name: Some("Codex".to_string()),
            created: now,
            modified: now,
            message_count: 20,
            first_message: "codex".to_string(),
            all_messages_text: String::new(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
        };

        crate::data::sqlite::upsert_session(&mut conn, &pi_session, now, Some(&empty_entries))
            .expect("upsert pi");
        crate::data::sqlite::upsert_session(&mut conn, &codex_session, now, Some(&empty_entries))
            .expect("upsert codex");
        drop(conn);

        let mut config = Config::default();
        config.scan_other_agent_jsonl = false;
        config.external_session_provider_slugs.clear();

        let sessions = super::scan_sessions_with_config(&config)
            .await
            .expect("scan");

        assert!(sessions
            .iter()
            .any(|session| session.path == pi_session.path));
        assert!(!sessions
            .iter()
            .any(|session| session.path == codex_session.path));

        std::env::remove_var("PPM_TEST_DB");
        std::env::remove_var("HOME");
    }
}
