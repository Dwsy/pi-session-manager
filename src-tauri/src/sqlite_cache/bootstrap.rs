use super::deps::*;
use super::legacy_fts::drop_sessions_fts_triggers;
use super::message_index::{drop_message_entries_triggers, ensure_message_fts_schema};
use super::migrations::apply_migrations;
use super::schema::{ensure_schema_version_table, get_current_version, LATEST_SCHEMA_VERSION};

pub fn get_db_path() -> Result<PathBuf, String> {
    // Allow explicit test override
    if let Ok(test_db) = std::env::var("PPM_TEST_DB") {
        let path = PathBuf::from(test_db);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create test db dir: {e}"))?;
        }
        return Ok(path);
    }

    // Use HOME env var directly to respect runtime changes (e.g., in tests)
    let home = match std::env::var("HOME") {
        Ok(h) => PathBuf::from(h),
        Err(_) => dirs::home_dir().ok_or("Cannot find home directory")?,
    };
    let sessions_dir = home.join(".pi").join("agent").join("sessions");
    fs::create_dir_all(&sessions_dir).map_err(|e| format!("Failed to create sessions dir: {e}"))?;
    Ok(sessions_dir.join("sessions.db"))
}

pub fn init_db() -> Result<Connection, String> {
    let config = Config::load_config().unwrap_or_default();
    init_db_with_config(&config)
}

pub fn init_db_with_config(config: &Config) -> Result<Connection, String> {
    let db_path = get_db_path()?;

    match open_and_init_db(&db_path, config) {
        Ok(conn) => Ok(conn),
        Err(e)
            if e.contains("malformed")
                || e.contains("disk image")
                || e.contains("not a database")
                || e.contains("vtable constructor failed") =>
        {
            // Attempt recovery: delete corrupted DB and recreate
            warn!(
                "[Recovery] Database corrupted ({}). Deleting and recreating...",
                e
            );
            if db_path.exists() {
                // Backup corrupted DB before deletion
                let backup_path = {
                    let file_name = db_path.file_name().and_then(|s| s.to_str()).unwrap_or("db");
                    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
                    parent.join(format!(
                        "{}.corrupted.{}",
                        file_name,
                        Utc::now().timestamp()
                    ))
                };
                fs::copy(&db_path, &backup_path).map_err(|e| {
                    format!("Failed to backup corrupted DB to {backup_path:?}: {e}")
                })?;
                info!("Backed up corrupted DB to {:?}", backup_path);
                // Increment recovery counter
                crate::metrics::inc_corruption_recovery();
                fs::remove_file(&db_path)
                    .map_err(|err| format!("Failed to delete corrupted DB: {err}"))?;
            }
            open_and_init_db(&db_path, config)
        }
        Err(e) => Err(e),
    }
}

fn open_and_init_db(db_path: &Path, config: &Config) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {e}"))?;

    // Enable WAL mode for better concurrency and reliability
    conn.prepare("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?
        .query_row([], |_| Ok(()))
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

    // Set synchronous mode (does not return a result row)
    conn.execute("PRAGMA synchronous=NORMAL;", [])
        .map_err(|e| format!("Failed to set synchronous mode: {e}"))?;

    // Enable foreign key constraints
    conn.execute("PRAGMA foreign_keys=ON;", [])
        .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

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
            all_messages_text TEXT,
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
            timestamp INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create table subagent_meta_cache: {e}"))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_modified ON sessions(modified DESC)",
        [],
    )
    .map_err(|e| format!("Failed to create index idx_modified: {e}"))?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_cwd ON sessions(cwd)", [])
        .map_err(|e| format!("Failed to create index idx_cwd: {e}"))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_file_modified ON sessions(file_modified)",
        [],
    )
    .map_err(|e| format!("Failed to create index idx_file_modified: {e}"))?;

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
    let is_chinese = std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .or_else(|_| std::env::var("LC_MESSAGES"))
        .map(|lang| lang.to_lowercase().contains("zh") || lang.to_lowercase().contains("cn"))
        .unwrap_or(false);

    let builtins = if is_chinese {
        // Chinese labels
        [
            ("builtin-todo", "待处理", "warning", 0),
            ("builtin-wip", "进行中", "info", 1),
            ("builtin-done", "已完成", "success", 2),
            ("builtin-important", "重要", "destructive", 3),
            ("builtin-archive", "归档", "slate", 4),
        ]
    } else {
        // English labels
        [
            ("builtin-todo", "To Do", "warning", 0),
            ("builtin-wip", "In Progress", "info", 1),
            ("builtin-done", "Done", "success", 2),
            ("builtin-important", "Important", "destructive", 3),
            ("builtin-archive", "Archive", "slate", 4),
        ]
    };

    for (id, name, color, order) in &builtins {
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, color, sort_order, is_builtin, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
            params![id, name, color, order, now],
        ).ok();
    }

    // Create message_entries table for fresh installs.
    // Existing databases may still be on the old schema, so defer new-column index creation
    // until after versioned migrations and schema reconciliation complete.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            source_type TEXT NOT NULL CHECK(source_type IN ('user', 'assistant', 'thinking')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create message_entries table: {e}"))?;

    // Apply versioned schema migrations if needed
    let current_version = get_current_version(&conn)?;
    if current_version < LATEST_SCHEMA_VERSION {
        apply_migrations(&conn, current_version)?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)",
        [],
    )
    .map_err(|e| format!("Failed to create index on message_entries: {e}"))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_entry_id ON message_entries(entry_id)",
        [],
    )
    .map_err(|e| format!("Failed to create entry_id index on message_entries: {e}"))?;

    if config.enable_fts5 {
        // init_fts5(&conn)?; // DISABLED: sessions_fts incompatible with sessions schema (TEXT PRIMARY KEY)
        // Comprehensive schema check for message-level FTS only
        ensure_message_fts_schema(&conn)?;
    } else {
        // FTS disabled: ensure no leftover triggers for both message-level and session-level
        let _ = drop_message_entries_triggers(&conn);
        let _ = drop_sessions_fts_triggers(&conn);
    }

    Ok(conn)
}
