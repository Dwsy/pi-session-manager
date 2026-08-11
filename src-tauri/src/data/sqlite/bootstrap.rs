use super::deps::*;
use super::legacy_fts::drop_sessions_fts_triggers;
use super::message_index::ensure_message_fts_schema;
use super::migrations::apply_migrations;
use super::schema::{ensure_app_version_info_table, ensure_schema_version_table, get_app_version_info, get_current_version, set_app_version_info, LATEST_SCHEMA_VERSION};
use rusqlite::OpenFlags;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};

static ALLOW_VERSION_DOWNGRADE: AtomicBool = AtomicBool::new(false);

pub fn set_version_downgrade_override(allow: bool) {
    ALLOW_VERSION_DOWNGRADE.store(allow, Ordering::Relaxed);
}

fn version_downgrade_override_enabled() -> bool {
    ALLOW_VERSION_DOWNGRADE.load(Ordering::Relaxed)
}

/// Compare two semver version strings.
/// Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
/// Handles versions like "0.6.0", "1.2.3", "0.6.0-beta.1"
/// Only compares major.minor.patch, ignores prerelease suffix.
fn compare_versions(v1: &str, v2: &str) -> i32 {
    let parse_version = |v: &str| -> Vec<u32> {
        // Strip v prefix and prerelease suffix
        let normalized = v.trim().trim_start_matches('v');
        // Split on '-' to remove prerelease, take first part
        let core = normalized.split('-').next().unwrap_or(normalized);
        core.split('.').filter_map(|part| part.parse::<u32>().ok()).collect()
    };

    let parts1 = parse_version(v1);
    let parts2 = parse_version(v2);

    let max_len = parts1.len().max(parts2.len());
    for i in 0..max_len {
        let p1 = parts1.get(i).copied().unwrap_or(0);
        let p2 = parts2.get(i).copied().unwrap_or(0);
        if p1 > p2 {
            return 1;
        }
        if p1 < p2 {
            return -1;
        }
    }
    0
}

pub fn get_primary_db_path() -> Result<PathBuf, String> {
    // Allow explicit test override
    if let Ok(test_db) = std::env::var("PPM_TEST_DB") {
        let path = PathBuf::from(test_db);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create test db dir: {e}"))?;
        }
        return Ok(path);
    }

    // Resolve the user home via the shared helper so Windows uses USERPROFILE
    // (HOME may be stale/MSYS-style and unreadable by Win32).
    let home = crate::paths::home_dir()?;
    let sessions_dir = home.join(".pi").join("agent").join("sessions");
    fs::create_dir_all(&sessions_dir).map_err(|e| format!("Failed to create sessions dir: {e}"))?;
    Ok(sessions_dir.join("sessions.db"))
}

pub fn get_db_path_for_config(config: &Config) -> Result<PathBuf, String> {
    if let Ok(test_db) = std::env::var("PPM_TEST_DB") {
        let path = PathBuf::from(test_db);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create test db dir: {e}"))?;
        }
        return Ok(path);
    }

    if config.session_source_mode == crate::config::SessionSourceMode::Dataset {
        let active_dataset_ids = config.effective_active_dataset_ids();
        if active_dataset_ids.len() == 1 {
            if let Some(dataset) = config.datasets.iter().find(|item| item.id == active_dataset_ids[0]) {
                let home = crate::paths::home_dir()?;
                let dataset_dir = home.join(".pi").join("agent").join("sessions").join("datasets").join(&dataset.slug);
                fs::create_dir_all(&dataset_dir).map_err(|e| format!("Failed to create dataset dir: {e}"))?;
                return Ok(dataset_dir.join("sessions.db"));
            }
        } else if active_dataset_ids.len() > 1 {
            let home = crate::paths::home_dir()?;
            let mut hasher = DefaultHasher::new();
            let mut hashed_dataset_ids = active_dataset_ids.clone();
            hashed_dataset_ids.sort();
            hashed_dataset_ids.hash(&mut hasher);
            let selection_hash = format!("{:016x}", hasher.finish());
            let selection_dir = home.join(".pi").join("agent").join("sessions").join("datasets").join("__selection__");
            fs::create_dir_all(&selection_dir).map_err(|e| format!("Failed to create selection dir: {e}"))?;
            return Ok(selection_dir.join(format!("{selection_hash}.db")));
        }
    }

    get_primary_db_path()
}

pub fn get_db_path() -> Result<PathBuf, String> {
    let config = Config::load_config().unwrap_or_default();
    get_db_path_for_config(&config)
}

pub fn init_db() -> Result<Connection, String> {
    let config = Config::load_config().unwrap_or_default();
    init_db_with_config(&config)
}

pub fn init_db_with_config(config: &Config) -> Result<Connection, String> {
    let db_path = get_db_path_for_config(config)?;
    init_db_with_path(&db_path, config)
}

pub fn init_db_with_path(db_path: &Path, config: &Config) -> Result<Connection, String> {
    match open_and_init_db(db_path, config) {
        Ok(conn) => Ok(conn),
        Err(e) if e.contains("malformed") || e.contains("disk image") || e.contains("not a database") || e.contains("vtable constructor failed") => {
            // Attempt recovery: delete corrupted DB and recreate
            warn!("[Recovery] Database corrupted ({}). Deleting and recreating...", e);
            if db_path.exists() {
                // Backup corrupted DB before deletion
                let backup_path = {
                    let file_name = db_path.file_name().and_then(|s| s.to_str()).unwrap_or("db");
                    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
                    parent.join(format!("{}.corrupted.{}", file_name, Utc::now().timestamp()))
                };
                fs::copy(db_path, &backup_path).map_err(|e| format!("Failed to backup corrupted DB to {backup_path:?}: {e}"))?;
                info!("Backed up corrupted DB to {:?}", backup_path);
                // Increment recovery counter
                crate::metrics::inc_corruption_recovery();
                fs::remove_file(db_path).map_err(|err| format!("Failed to delete corrupted DB: {err}"))?;
            }
            open_and_init_db(db_path, config)
        }
        Err(e) => Err(e),
    }
}

fn open_and_init_db(db_path: &Path, config: &Config) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create database parent dir: {e}"))?;
    }
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {e}"))?;

    let init_result = (|| -> Result<(), String> {
        // Enable WAL mode for better concurrency and reliability
        conn.prepare("PRAGMA journal_mode=WAL;").map_err(|e| format!("Failed to set WAL mode: {e}"))?.query_row([], |_| Ok(())).map_err(|e| format!("Failed to set WAL mode: {e}"))?;

        // Set synchronous mode (does not return a result row)
        conn.execute("PRAGMA synchronous=NORMAL;", []).map_err(|e| format!("Failed to set synchronous mode: {e}"))?;

        // Enable busy timeout to handle concurrent write locks gracefully
        conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| format!("Failed to set busy_timeout: {e}"))?;

        // Use execute_batch for PRAGMAs that may return result rows
        conn.execute_batch("PRAGMA cache_size = -262144; PRAGMA wal_autocheckpoint = 1000;").map_err(|e| format!("Failed to set cache_size/wal_autocheckpoint: {e}"))?; // 256MB cache, 4MB checkpoint threshold

        // Memory-map DB file to reduce read() syscalls. 256MB covers hot pages;
        // OS demand-pages the rest via page faults. Uses execute_batch because
        // mmap_size returns the previous value when set.
        conn.execute_batch("PRAGMA mmap_size = 268435456;").map_err(|e| format!("Failed to set mmap_size: {e}"))?;

        // Store temporary tables/results in RAM. Eliminates disk temp files from
        // FTS5 rebuild and ORDER BY/GROUP BY on large result sets.
        conn.execute("PRAGMA temp_store = MEMORY;", []).map_err(|e| format!("Failed to set temp_store: {e}"))?;

        // Limit WAL file to 6MB. wal_autocheckpoint=1000 pages × 4KB = ~4MB;
        // 6MB gives headroom. After checkpoint, WAL is truncated to this size,
        // preventing unbounded growth and large checkpoint IO bursts.
        conn.execute_batch("PRAGMA journal_size_limit = 6144000;").map_err(|e| format!("Failed to set journal_size_limit: {e}"))?;

        // Enable foreign key constraints
        conn.execute("PRAGMA foreign_keys=ON;", []).map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

        // Ensure schema_version table exists for migrations
        ensure_schema_version_table(&conn)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            cwd TEXT NOT NULL,
            name TEXT,
            created TEXT NOT NULL,
            modified TEXT NOT NULL,
            file_modified TEXT NOT NULL,
            message_count INTEGER NOT NULL,
            first_message TEXT,
            user_messages_text TEXT,
            assistant_messages_text TEXT,
            last_message TEXT,
            last_message_role TEXT,
            cached_at TEXT NOT NULL,
            access_count INTEGER DEFAULT 0,
            last_accessed TEXT
        )",
            [],
        )
        .map_err(|e| format!("Failed to create table: {e}"))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS session_details_cache (
            path TEXT PRIMARY KEY,
            file_modified TEXT NOT NULL,
            user_messages INTEGER NOT NULL,
            assistant_messages INTEGER NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            cache_read_tokens INTEGER NOT NULL,
            cache_write_tokens INTEGER NOT NULL,
            input_cost REAL NOT NULL,
            output_cost REAL NOT NULL,
            cache_read_cost REAL NOT NULL,
            cache_write_cost REAL NOT NULL,
            models_json TEXT NOT NULL,
            model_usage_json TEXT NOT NULL DEFAULT '{}'
        )",
            [],
        )
        .map_err(|e| format!("Failed to create table session_details_cache: {e}"))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS subagent_meta_cache (
            path TEXT PRIMARY KEY,
            file_modified TEXT NOT NULL,
            run_id TEXT NOT NULL,
            agent TEXT NOT NULL,
            model TEXT NOT NULL,
            exit_code INTEGER NOT NULL,
            cost REAL NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            cache_read_tokens INTEGER NOT NULL,
            cache_write_tokens INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            tool_count INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            turns INTEGER NOT NULL DEFAULT 0
        )",
            [],
        )
        .map_err(|e| format!("Failed to create table subagent_meta_cache: {e}"))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS scan_state (
            path TEXT PRIMARY KEY,
            backing_path TEXT NOT NULL,
            provider_slug TEXT NOT NULL,
            file_modified TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            last_scanned_at TEXT NOT NULL,
            last_parse_status TEXT NOT NULL,
            read_offset INTEGER NOT NULL DEFAULT 0,
            append_trust_count INTEGER NOT NULL DEFAULT 0
        )",
            [],
        )
        .map_err(|e| format!("Failed to create table scan_state: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_modified ON sessions(modified DESC)", []).map_err(|e| format!("Failed to create index idx_modified: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_cwd ON sessions(cwd)", []).map_err(|e| format!("Failed to create index idx_cwd: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_file_modified ON sessions(file_modified)", []).map_err(|e| format!("Failed to create index idx_file_modified: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_scan_state_backing_path ON scan_state(backing_path)", []).map_err(|e| format!("Failed to create index idx_scan_state_backing_path: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_scan_state_provider_slug ON scan_state(provider_slug)", []).map_err(|e| format!("Failed to create index idx_scan_state_provider_slug: {e}"))?;

        // Create favorites table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('session', 'project')),
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            added_at TEXT NOT NULL
        )",
            [],
        )
        .map_err(|e| format!("Failed to create favorites table: {e}"))?;

        // Create tags table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT 'info',
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )",
            [],
        )
        .map_err(|e| format!("Failed to create tags table: {e}"))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS session_tags (
            session_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            assigned_at TEXT NOT NULL,
            PRIMARY KEY (session_id, tag_id)
        )",
            [],
        )
        .map_err(|e| format!("Failed to create session_tags table: {e}"))?;

        // Insert builtin tags based on system language
        let now = Utc::now().to_rfc3339();

        // Detect system language
        let is_chinese = crate::utils::is_system_chinese_locale();

        let builtins = if is_chinese {
            // Chinese labels
            [("builtin-todo", "待处理", "warning", 0), ("builtin-wip", "进行中", "info", 1), ("builtin-done", "已完成", "success", 2), ("builtin-important", "重要", "destructive", 3), ("builtin-archive", "归档", "slate", 4)]
        } else {
            // English labels
            [("builtin-todo", "To Do", "warning", 0), ("builtin-wip", "In Progress", "info", 1), ("builtin-done", "Done", "success", 2), ("builtin-important", "Important", "destructive", 3), ("builtin-archive", "Archive", "slate", 4)]
        };

        for (id, name, color, order) in &builtins {
            conn.execute("INSERT OR IGNORE INTO tags (id, name, color, sort_order, is_builtin, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)", params![id, name, color, order, now]).ok();
        }

        // Create message_entries table for fresh installs.
        // Existing databases may still be on the old schema, so defer new-column index creation
        // until after versioned migrations and schema reconciliation complete.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'toolResult')),
            source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking', 'label', 'tool_result')),
            content TEXT NOT NULL,
            search_text TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
            [],
        )
        .map_err(|e| format!("Failed to create message_entries table: {e}"))?;

        // Ensure app_version_info table exists for version tracking
        ensure_app_version_info_table(&conn)?;

        // Check for version downgrade before applying migrations
        // Key logic: if database schema version > current app's LATEST_SCHEMA_VERSION,
        // it means the database was created by a newer version, and current version cannot handle it
        let current_app_version = env!("CARGO_PKG_VERSION");
        if let Some((stored_app_version, stored_schema_version, _)) = get_app_version_info(&conn)? {
            // Only check schema version - this is the real compatibility indicator
            if stored_schema_version > LATEST_SCHEMA_VERSION && !version_downgrade_override_enabled() {
                return Err(format!(
                    "VERSION_DOWNGRADE: Database schema is v{} (from app v{}), \
                     but current app (v{}) only supports up to v{}. \
                     Downgrading may cause data loss or corruption. \
                     Please backup your database and reset it before using an older version. \
                     DB path: {}",
                    stored_schema_version,
                    stored_app_version,
                    current_app_version,
                    LATEST_SCHEMA_VERSION,
                    db_path.display()
                ));
            }
        }

        // Apply versioned schema migrations if needed
        let current_version = get_current_version(&conn)?;
        if current_version < LATEST_SCHEMA_VERSION {
            apply_migrations(&conn, current_version)?;
        }

        // Update app version info after successful migrations
        let now = Utc::now().to_rfc3339();
        let final_schema_version = get_current_version(&conn)?;
        set_app_version_info(&conn, current_app_version, final_schema_version, &now)?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id)", []).map_err(|e| format!("Failed to create entry_id index on message_entries: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp)", []).map_err(|e| format!("Failed to create session/timestamp index on message_entries: {e}"))?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_message_entries_timestamp ON message_entries(timestamp DESC)", []).map_err(|e| format!("Failed to create timestamp index on message_entries: {e}"))?;

        // Message-level FTS is the primary search path. Always reconcile it here so
        // legacy config flags cannot leave search_text / message_fts stale.
        ensure_message_fts_schema(&conn)?;
        super::plugin_records::ensure_plugin_records_schema(&conn)?;
        // Legacy session-level FTS remains disabled regardless of config.
        let _ = drop_sessions_fts_triggers(&conn);

        Ok(())
    })();

    match init_result {
        Ok(()) => Ok(conn),
        Err(error) => {
            if let Err((_, close_error)) = conn.close() {
                warn!("Failed to close SQLite connection after initialization error: {}", close_error);
            }
            Err(error)
        }
    }
}

/// Check if the database was created with a newer app version (version downgrade).
/// Returns Ok(None) if no downgrade detected, Ok(Some(info)) if downgrade detected.
/// Key logic: if database schema version > current app's LATEST_SCHEMA_VERSION, it's a downgrade.
pub fn check_version_downgrade(db_path: &Path) -> Result<Option<VersionDowngradeInfo>, String> {
    if !db_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| format!("Failed to open database for version check: {e}"))?;

    // Check if app_version_info table exists
    let table_exists: bool = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='app_version_info'", [], |row| row.get::<_, i64>(0)).map(|count| count > 0).unwrap_or(false);

    if !table_exists {
        return Ok(None);
    }

    let current_app_version = env!("CARGO_PKG_VERSION");

    match get_app_version_info(&conn) {
        Ok(Some((stored_app_version, stored_schema_version, updated_at))) => {
            // Only check schema version - this is the real compatibility indicator
            if stored_schema_version > LATEST_SCHEMA_VERSION {
                Ok(Some(VersionDowngradeInfo { stored_app_version, stored_schema_version, current_app_version: current_app_version.to_string(), max_supported_schema_version: LATEST_SCHEMA_VERSION, updated_at, db_path: db_path.display().to_string() }))
            } else {
                Ok(None)
            }
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to read app version info: {e}")),
    }
}

/// Information about a detected version downgrade.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VersionDowngradeInfo {
    pub stored_app_version: String,
    pub stored_schema_version: i64,
    pub current_app_version: String,
    pub max_supported_schema_version: i64,
    pub updated_at: String,
    pub db_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn uses_primary_db_for_local_mode() {
        let _env_lock = crate::paths::acquire_test_env_lock();
        // Ensure clean state - remove any leftover PPM_TEST_DB
        std::env::remove_var("PPM_TEST_DB");

        let config = Config::default();
        let db_path = get_db_path_for_config(&config).expect("db path");
        assert!(db_path.ends_with("sessions.db"));
    }

    #[test]
    fn uses_dataset_db_for_dataset_mode() {
        let _env_lock = crate::paths::acquire_test_env_lock();
        // Ensure clean state - remove any leftover PPM_TEST_DB
        std::env::remove_var("PPM_TEST_DB");

        let config = Config {
            session_source_mode: crate::config::SessionSourceMode::Dataset,
            active_dataset_id: Some("badlogicgames/pi-mono".to_string()),
            datasets: vec![crate::config::DatasetRegistryEntry {
                id: "badlogicgames/pi-mono".to_string(),
                slug: "badlogicgames__pi-mono".to_string(),
                display_name: "pi-mono".to_string(),
                source_url: "https://huggingface.co/datasets/badlogicgames/pi-mono".to_string(),
                repo_id: "badlogicgames/pi-mono".to_string(),
                revision: "main".to_string(),
                imported_at: None,
                total_files: 0,
                total_bytes: 0,
            }],
            ..Config::default()
        };

        let db_path = get_db_path_for_config(&config).expect("dataset db path");
        let path_str = db_path.to_string_lossy();
        // Use Path instead of string contains for cross-platform compatibility
        assert!(db_path.components().any(|c| c.as_os_str() == "datasets") && db_path.components().any(|c| c.as_os_str() == "badlogicgames__pi-mono"), "Path should contain datasets/badlogicgames__pi-mono: {path_str}");
        assert!(db_path.ends_with("sessions.db"));
    }

    #[test]
    fn test_compare_versions() {
        // Test basic version comparison
        assert_eq!(compare_versions("1.0.0", "1.0.0"), 0);
        assert_eq!(compare_versions("1.0.0", "1.0.1"), -1);
        assert_eq!(compare_versions("1.0.1", "1.0.0"), 1);

        // Test major version differences
        assert_eq!(compare_versions("2.0.0", "1.0.0"), 1);
        assert_eq!(compare_versions("1.0.0", "2.0.0"), -1);

        // Test minor version differences
        assert_eq!(compare_versions("1.2.0", "1.1.0"), 1);
        assert_eq!(compare_versions("1.1.0", "1.2.0"), -1);

        // Test with v prefix
        assert_eq!(compare_versions("v1.0.0", "1.0.0"), 0);

        // Test with prerelease suffix (should be ignored)
        assert_eq!(compare_versions("1.0.0-beta.1", "1.0.0"), 0);
        assert_eq!(compare_versions("1.0.0", "1.0.0-beta.1"), 0);

        // Test real-world versions
        assert_eq!(compare_versions("0.6.0", "0.5.0"), 1);
        assert_eq!(compare_versions("0.5.0", "0.6.0"), -1);
    }

    #[test]
    fn version_downgrade_override_allows_opening_newer_schema_for_current_run() {
        let _env_lock = crate::paths::acquire_test_env_lock();
        set_version_downgrade_override(false);

        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("sessions.db");
        let conn = Connection::open(&db_path).expect("open seed db");

        ensure_schema_version_table(&conn).expect("ensure schema version table");
        conn.execute("UPDATE schema_version SET version = ?1", params![LATEST_SCHEMA_VERSION + 1]).expect("seed newer schema version");
        ensure_app_version_info_table(&conn).expect("ensure app version table");
        set_app_version_info(&conn, "9.9.9", LATEST_SCHEMA_VERSION + 1, "2026-01-01T00:00:00Z").expect("seed app version info");
        drop(conn);

        let err = init_db_with_path(&db_path, &Config::default()).expect_err("expected downgrade guard");
        assert!(err.contains("VERSION_DOWNGRADE"), "unexpected error: {err}");

        set_version_downgrade_override(true);
        let reopened = init_db_with_path(&db_path, &Config::default()).expect("override should allow opening db");
        let stored = get_app_version_info(&reopened).expect("read app version info").expect("stored version info");
        assert_eq!(stored.0, env!("CARGO_PKG_VERSION"));
        assert_eq!(stored.1, LATEST_SCHEMA_VERSION + 1);

        set_version_downgrade_override(false);
    }
}
