use crate::config::Config;
use crate::models::{SessionEntry, SessionInfo};
use crate::session_parser::SessionDetails;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tracing::{debug, error, info, warn};

/// Current schema version for migrations
const LATEST_SCHEMA_VERSION: i64 = 2;

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

/// Ensure the schema_version table exists and initialize to 0 if empty.
fn ensure_schema_version_table(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create schema_version table: {e}"))?;

    // Check if any row exists; if not, insert version 0.
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);
    if count == 0 {
        conn.execute("INSERT INTO schema_version (version) VALUES (0)", [])
            .map_err(|e| format!("Failed to insert initial schema version: {e}"))?;
    }
    Ok(())
}

/// Get the current schema version (assumes table exists and has at least one row)
fn get_current_version(conn: &Connection) -> Result<i64, String> {
    let version: i64 = conn
        .query_row("SELECT version FROM schema_version LIMIT 1", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Failed to get schema version: {e}"))?;
    Ok(version)
}

/// Set the current schema version
fn set_schema_version(conn: &Connection, version: i64) -> Result<(), String> {
    conn.execute("UPDATE schema_version SET version = ?", params![version])
        .map_err(|e| format!("Failed to set schema version: {e}"))?;
    Ok(())
}

/// Run migrations from current_version+1 up to LATEST_SCHEMA_VERSION.
fn apply_migrations(conn: &Connection, from_version: i64) -> Result<(), String> {
    let mut current = from_version;
    while current < LATEST_SCHEMA_VERSION {
        current += 1;
        match current {
            1 => migration_1(conn)?,
            2 => migration_2(conn)?,
            _ => return Err(format!("Unknown migration version: {current}")),
        }
        // Update version after successful migration
        set_schema_version(conn, current)?;
    }
    Ok(())
}

/// Migration to version 1: adds columns that were previously added via ad-hoc ALTER TABLE.
fn migration_1(conn: &Connection) -> Result<(), String> {
    // Helper to check if a column exists in a table
    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| format!("Failed to prepare PRAGMA table_info for {table}: {e}"))?;
        let column_names: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns for {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;
        Ok(column_names.iter().any(|name| name == column))
    }

    // For sessions table
    if !column_exists(conn, "sessions", "last_message")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message TEXT", [])
            .map_err(|e| format!("Failed to add last_message column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "last_message_role")? {
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message_role TEXT", [])
            .map_err(|e| format!("Failed to add last_message_role column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "user_messages_text")? {
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN user_messages_text TEXT",
            [],
        )
        .map_err(|e| format!("Failed to add user_messages_text column: {e}"))?;
    }
    if !column_exists(conn, "sessions", "assistant_messages_text")? {
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN assistant_messages_text TEXT",
            [],
        )
        .map_err(|e| format!("Failed to add assistant_messages_text column: {e}"))?;
    }

    // For tags table
    if !column_exists(conn, "tags", "auto_rules")? {
        conn.execute("ALTER TABLE tags ADD COLUMN auto_rules TEXT", [])
            .map_err(|e| format!("Failed to add auto_rules column: {e}"))?;
    }
    if !column_exists(conn, "tags", "parent_id")? {
        conn.execute("ALTER TABLE tags ADD COLUMN parent_id TEXT", [])
            .map_err(|e| format!("Failed to add parent_id column: {e}"))?;
    }

    Ok(())
}

/// Migration to version 2: add performance indexes.
fn migration_2(conn: &Connection) -> Result<(), String> {
    // Composite index on session_path and timestamp for per-session ordering
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session_time ON message_entries(session_path, timestamp)",
        [],
    )
    .map_err(|e| format!("Migration 2 failed: {e}"))?;

    Ok(())
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
            models_json TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create table session_details_cache: {e}"))?;

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

    // Create message_entries table for per-message FTS (avoids re-reading files)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create message_entries table: {e}"))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)",
        [],
    )
    .map_err(|e| format!("Failed to create index on message_entries: {e}"))?;

    // Migrate message_entries schema: add missing columns (non-destructive)
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(message_entries)")
            .map_err(|e| e.to_string())?;
        let me_columns: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let required_me_columns = ["id", "session_path", "role", "content", "timestamp"];
        let mut migrated = false;
        for &col in &required_me_columns {
            if !me_columns.contains(&col.to_string()) {
                eprintln!("[Migration] Adding missing column '{col}' to message_entries");
                let sql = format!("ALTER TABLE message_entries ADD COLUMN {col}");
                conn.execute(&sql, [])
                    .map_err(|e| format!("Failed to add column {col}: {e}"))?;
                migrated = true;
            }
        }
        if migrated {
            info!("[Migration] message_entries schema updated with missing columns");
        }
    }

    // Apply versioned schema migrations if needed
    let current_version = get_current_version(&conn)?;
    if current_version < LATEST_SCHEMA_VERSION {
        apply_migrations(&conn, current_version)?;
    }

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

fn init_fts5(conn: &Connection) -> Result<(), String> {
    // Check if we need to upgrade FTS5 table
    let mut stmt = conn
        .prepare("PRAGMA table_info(sessions_fts)")
        .map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if columns.is_empty() || !columns.contains(&"user_messages_text".to_string()) {
        full_rebuild_fts(conn)?;
    } else {
        // Table exists, ensure it is auto-sync (content='sessions') and triggers are removed
        let mut stmt_sql = conn
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions_fts'")
            .map_err(|e| e.to_string())?;
        let sql: String = stmt_sql
            .query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let is_auto_sync =
            sql.contains("content='sessions'") || sql.contains("content=\"sessions\"");
        if !is_auto_sync {
            // legacy manual FTS, rebuild
            full_rebuild_fts(conn)?;
        } else {
            // Auto-sync, but drop any leftover triggers from older versions
            drop_sessions_fts_triggers(conn)?;
        }
    }

    // Ensure triggers exist for sessions_fts to keep index in sync
    create_sessions_triggers(conn)?;

    Ok(())
}

pub fn ensure_message_fts_schema(conn: &Connection) -> Result<(), String> {
    // Check and migrate message_entries schema: add any missing columns (non-destructive)
    let mut stmt = conn
        .prepare("PRAGMA table_info(message_entries)")
        .map_err(|e| format!("Failed to query message_entries schema: {e}"))?;
    let me_columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| format!("Failed to read message_entries columns: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message_entries columns: {e}"))?;
    let required_me_columns = ["id", "session_path", "role", "content", "timestamp"];
    let mut migrated = false;
    for &col in &required_me_columns {
        if !me_columns.contains(&col.to_string()) {
            warn!(
                "[Migration] message_entries missing column '{}', adding...",
                col
            );
            let sql = format!("ALTER TABLE message_entries ADD COLUMN {col}");
            conn.execute(&sql, [])
                .map_err(|e| format!("Failed to add column {col}: {e}"))?;
            migrated = true;
        }
    }
    if migrated {
        info!("[Migration] message_entries schema updated by adding missing columns");
    } else {
        debug!("[Schema] message_entries columns OK: {:?}", me_columns);
    }

    // Ensure message_fts exists with correct schema (no triggers needed for content-bearing FTS5)
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_fts'")
        .map_err(|e| format!("Failed to check message_fts existence: {e}"))?;
    let fts_exists = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_fts"))
        .unwrap_or(false);

    if !fts_exists {
        info!("[FTS] Creating message_fts virtual table");
        create_message_fts5(conn)?;
        rebuild_message_fts_index(conn)?;
        // Create triggers to keep the index in sync with message_entries.
        create_message_entries_triggers(conn)?;
        return Ok(());
    }

    // Check if FTS has required columns
    let mut stmt = conn
        .prepare("PRAGMA table_info(message_fts)")
        .map_err(|e| format!("Failed to query message_fts schema: {e}"))?;
    let fts_columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| format!("Failed to read message_fts columns: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message_fts columns: {e}"))?;
    let required_fts_columns = ["session_path", "role", "content"];
    let fts_has_all = required_fts_columns
        .iter()
        .all(|&col| fts_columns.contains(&col.to_string()));

    if !fts_has_all {
        error!("[Migration] message_fts schema incomplete. Has columns: {:?}. Recreating virtual table...", fts_columns);
        conn.execute("DROP TABLE IF EXISTS message_fts", [])
            .map_err(|e| format!("Failed to drop old message_fts: {e}"))?;
        create_message_fts5(conn)?;
        rebuild_message_fts_index(conn)?;
        // Index will be automatically rebuilt from message_entries content.
        info!("[Migration] Recreated message_fts virtual table");
    } else {
        debug!("[Schema] message_fts columns OK: {:?}", fts_columns);
        // Check if it's using auto-sync with content='message_entries'
        let mut stmt_sql = conn
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='message_fts'")
            .map_err(|e| format!("Failed to query message_fts definition: {e}"))?;
        let sql: String = stmt_sql
            .query_row([], |row| row.get(0))
            .map_err(|e| format!("Failed to read message_fts sql: {e}"))?;
        // Detect if content='message_entries' is present
        let is_auto_sync = sql.contains("content='message_entries'")
            || sql.contains("content=\"message_entries\"");
        if !is_auto_sync {
            error!("[Migration] message_fts is manual (no content=). Converting to auto-sync...");
            conn.execute("DROP TABLE IF EXISTS message_fts", [])
                .map_err(|e| format!("Failed to drop manual message_fts: {e}"))?;
            create_message_fts5(conn)?;
            rebuild_message_fts_index(conn)?;
            // Index will be automatically rebuilt from message_entries content.
            info!("[Migration] Converted message_fts to auto-sync");
        } else {
            debug!("[Schema] message_fts already auto-sync");
        }
    }

    // Ensure triggers exist to keep message_fts in sync with message_entries.
    create_message_entries_triggers(conn)?;

    // Backfill message_entries if empty: ensures message-level FTS has data after migration or fresh install with existing sessions.
    // This runs once when message_entries is empty but there are sessions in the DB.
    match conn.query_row("SELECT COUNT(*) FROM message_entries", [], |row| {
        row.get::<_, i64>(0)
    }) {
        Ok(0) => {
            // Check if there are sessions to backfill from
            if let Ok(sessions_count) = conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| {
                row.get::<_, i64>(0)
            }) {
                if sessions_count > 0 {
                    info!("[Migration] message_entries empty but {} sessions exist. Backfilling message entries from session files...", sessions_count);
                    // Get all session paths
                    let mut stmt = match conn.prepare("SELECT path FROM sessions") {
                        Ok(stmt) => stmt,
                        Err(e) => {
                            error!(
                                "[Migration] Failed to prepare statement for session paths: {}",
                                e
                            );
                            return Ok(());
                        }
                    };
                    let paths: Vec<String> = match stmt.query_map([], |row| row.get(0)) {
                        Ok(iter) => {
                            let mut vec = Vec::new();
                            for row_result in iter {
                                match row_result {
                                    Ok(path) => vec.push(path),
                                    Err(e) => {
                                        error!("[Migration] Failed to read session path: {}", e)
                                    }
                                }
                            }
                            vec
                        }
                        Err(e) => {
                            error!("[Migration] Failed to query session paths: {}", e);
                            return Ok(());
                        }
                    };
                    let total_paths = paths.len();
                    // For each path, create a minimal SessionInfo and insert message entries
                    let mut backfilled = 0;
                    for path in &paths {
                        let session = SessionInfo {
                            path: path.clone(),
                            id: String::new(),
                            cwd: String::new(),
                            name: None,
                            created: Utc::now(),
                            modified: Utc::now(),
                            message_count: 0,
                            first_message: String::new(),
                            all_messages_text: String::new(),
                            user_messages_text: String::new(),
                            assistant_messages_text: String::new(),
                            last_message: String::new(),
                            last_message_role: String::new(),
                        };
                        if let Err(e) = insert_message_entries(conn, &session) {
                            error!(
                                "[Migration] Failed to backfill messages for session {}: {}",
                                path, e
                            );
                        } else {
                            backfilled += 1;
                        }
                    }
                    info!(
                        "[Migration] Backfilled message entries for {} sessions (attempted {})",
                        backfilled, total_paths
                    );
                }
            }
        }
        Err(e) => {
            error!("[Migration] Failed to check message_entries count: {}", e);
        }
        _ => {} // Non-zero count, nothing to do
    }

    Ok(())
}

fn drop_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    // Drop legacy manual triggers; with content='message_entries' auto-sync, they are not needed.
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ai", [])
        .map_err(|e| format!("Failed to drop trigger message_entries_ai: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_ad", [])
        .map_err(|e| format!("Failed to drop trigger message_entries_ad: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS message_entries_au", [])
        .map_err(|e| format!("Failed to drop trigger message_entries_au: {e}"))?;
    Ok(())
}

fn drop_sessions_fts_triggers(conn: &Connection) -> Result<(), String> {
    // Drop legacy manual triggers; with content='sessions' auto-sync, they are not needed.
    conn.execute("DROP TRIGGER IF EXISTS sessions_ai", [])
        .map_err(|e| format!("Failed to drop trigger sessions_ai: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_ad", [])
        .map_err(|e| format!("Failed to drop trigger sessions_ad: {e}"))?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_au", [])
        .map_err(|e| format!("Failed to drop trigger sessions_au: {e}"))?;
    Ok(())
}

// Create triggers to keep message_fts in sync with message_entries
fn create_message_entries_triggers(conn: &Connection) -> Result<(), String> {
    // Insert trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_ai AFTER INSERT ON message_entries BEGIN
         INSERT INTO message_fts(rowid, session_path, role, content)
         VALUES (new.rowid, new.session_path, new.role, new.content); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_ai: {e}"))?;

    // Delete trigger (use 'delete' command)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_ad AFTER DELETE ON message_entries BEGIN
         INSERT INTO message_fts(message_fts, rowid, session_path, role, content)
         VALUES('delete', old.rowid, old.session_path, old.role, old.content); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_ad: {e}"))?;

    // Update trigger (delete old, insert new)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS message_entries_au AFTER UPDATE ON message_entries BEGIN
         INSERT INTO message_fts(message_fts, rowid, session_path, role, content)
         VALUES('delete', old.rowid, old.session_path, old.role, old.content);
         INSERT INTO message_fts(rowid, session_path, role, content)
         VALUES (new.rowid, new.session_path, new.role, new.content); END;",
        [],
    )
    .map_err(|e| format!("Failed to create trigger message_entries_au: {e}"))?;

    debug!("[FTS] Created message_entries sync triggers");
    Ok(())
}

// Create triggers to keep sessions_fts in sync with sessions
fn create_sessions_triggers(conn: &Connection) -> Result<(), String> {
    // Insert trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
         INSERT INTO sessions_fts(rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES (new.rowid, new.path, new.cwd, new.name, new.first_message, new.all_messages_text, new.user_messages_text, new.assistant_messages_text); END;",
        [],
    ).map_err(|e| format!("Failed to create trigger sessions_ai: {e}"))?;

    // Delete trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
         INSERT INTO sessions_fts(sessions_fts, rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES('delete', old.rowid, old.path, old.cwd, old.name, old.first_message, old.all_messages_text, old.user_messages_text, old.assistant_messages_text); END;",
        [],
    ).map_err(|e| format!("Failed to create trigger sessions_ad: {e}"))?;

    // Update trigger
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
         INSERT INTO sessions_fts(sessions_fts, rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES('delete', old.rowid, old.path, old.cwd, old.name, old.first_message, old.all_messages_text, old.user_messages_text, old.assistant_messages_text);
         INSERT INTO sessions_fts(rowid, path, cwd, name, first_message, all_messages_text, user_messages_text, assistant_messages_text)
         VALUES (new.rowid, new.path, new.cwd, new.name, new.first_message, new.all_messages_text, new.user_messages_text, new.assistant_messages_text); END;",
        [],
    ).map_err(|e| format!("Failed to create trigger sessions_au: {e}"))?;

    debug!("[FTS] Created sessions sync triggers");
    Ok(())
}

// Ensure the triggers on message_entries exist and are up-to-date

fn create_message_fts5(conn: &Connection) -> Result<(), String> {
    // Create virtual FTS5 table that is automatically maintained by SQLite
    // because it specifies content='message_entries'. No triggers needed.
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
            session_path UNINDEXED,
            role,
            content,
            content='message_entries',
            content_rowid='rowid',
            tokenize='unicode61'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create message_fts: {e}"))?;

    info!("[FTS] Created message_fts virtual table (content auto-sync enabled)");
    Ok(())
}

fn rebuild_message_fts_index(conn: &Connection) -> Result<(), String> {
    info!("[FTS] Rebuilding message_fts index from message_entries...");
    conn.execute("INSERT INTO message_fts(message_fts) VALUES('rebuild')", [])
        .map_err(|e| format!("Failed to rebuild FTS index: {e}"))?;
    Ok(())
}

pub fn upsert_session(
    conn: &Connection,
    session: &SessionInfo,
    file_modified: DateTime<Utc>,
    entries: Option<&[SessionEntry]>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at, access_count, last_accessed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, NULL)
         ON CONFLICT(path) DO UPDATE SET
            modified = excluded.modified,
            file_modified = excluded.file_modified,
            message_count = excluded.message_count,
            first_message = excluded.first_message,
            all_messages_text = excluded.all_messages_text,
            user_messages_text = excluded.user_messages_text,
            assistant_messages_text = excluded.assistant_messages_text,
            last_message = excluded.last_message,
            last_message_role = excluded.last_message_role,
            cached_at = excluded.cached_at",
        params![
            &session.id,
            &session.path,
            &session.cwd,
            &session.name,
            &session.created.to_rfc3339(),
            &session.modified.to_rfc3339(),
            &file_modified.to_rfc3339(),
            session.message_count as i64,
            &session.first_message,
            &session.all_messages_text,
            &session.user_messages_text,
            &session.assistant_messages_text,
            &session.last_message,
            &session.last_message_role,
            &Utc::now().to_rfc3339(),
        ],
    ).map_err(|e| format!("Failed to upsert session: {e}"))?;

    // Populate message_entries table if it exists (for per-message FTS)
    if conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|_| true)
        .unwrap_or(false)
    {
        debug!(
            "[Upsert] Updating message entries for session: {}",
            session.path
        );
        // Clear existing entries for this session to avoid duplicates
        delete_message_entries_for_session(conn, &session.path)?;
        // Insert fresh entries (use pre-parsed if available to avoid re-reading file)
        if let Some(entries) = entries {
            upsert_message_entries(conn, &session.path, entries)?;
        } else {
            insert_message_entries(conn, session)?;
        }
        debug!(
            "[Upsert] Completed message entries for session: {}",
            session.path
        );
    } else {
        debug!("[Upsert] message_entries table does not exist, skipping");
    }

    Ok(())
}

pub fn get_session(conn: &Connection, path: &str) -> Result<Option<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role
         FROM sessions WHERE path = ?"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let session = stmt
        .query_row(params![path], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
            })
        })
        .ok();

    if session.is_some() {
        conn.execute(
            "UPDATE sessions SET access_count = access_count + 1, last_accessed = ? WHERE path = ?",
            params![Utc::now().to_rfc3339(), path],
        )
        .ok();
    }

    Ok(session)
}

pub fn get_all_sessions(conn: &Connection) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role
         FROM sessions ORDER BY modified DESC, path ASC"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}

pub fn get_sessions_modified_after(
    conn: &Connection,
    cutoff: DateTime<Utc>,
) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role
         FROM sessions WHERE modified > ? ORDER BY modified DESC, path ASC"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map(params![cutoff.to_rfc3339()], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}

pub fn get_sessions_modified_before(
    conn: &Connection,
    cutoff: DateTime<Utc>,
) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role
         FROM sessions WHERE modified <= ? ORDER BY modified DESC, path ASC"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map(params![cutoff.to_rfc3339()], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}

pub fn get_cached_file_modified(
    conn: &Connection,
    path: &str,
) -> Result<Option<DateTime<Utc>>, String> {
    let mut stmt = conn
        .prepare("SELECT file_modified FROM sessions WHERE path = ?")
        .map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let result = stmt
        .query_row(params![path], |row| {
            Ok(parse_timestamp(&row.get::<_, String>(0)?))
        })
        .ok();

    Ok(result)
}

pub fn needs_reindexing(conn: &Connection, path: &str) -> Result<bool, String> {
    let mut stmt = conn.prepare(
        "SELECT user_messages_text IS NULL OR assistant_messages_text IS NULL FROM sessions WHERE path = ?"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let result = stmt
        .query_row(params![path], |row| row.get::<_, bool>(0))
        .optional()
        .map_err(|e| format!("Failed to query needs_reindexing: {e}"))?;

    Ok(result.unwrap_or(false))
}

pub fn delete_session(conn: &Connection, path: &str) -> Result<(), String> {
    // Also delete from message_entries (FOREIGN KEY CASCADE should handle but we do explicitly for safety)
    let _ = delete_message_entries_for_session(conn, path);

    conn.execute("DELETE FROM sessions WHERE path = ?", params![path])
        .map_err(|e| format!("Failed to delete session: {e}"))?;
    Ok(())
}

pub fn get_session_count(conn: &Connection) -> Result<usize, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count sessions: {e}"))?;
    Ok(count as usize)
}

#[derive(Debug, Clone)]
pub struct SessionDetailsCache {
    pub file_modified: DateTime<Utc>,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub cache_read_tokens: usize,
    pub cache_write_tokens: usize,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_cost: f64,
    pub models_json: String,
}

pub fn get_session_details_cache(
    conn: &Connection,
    path: &str,
) -> Result<Option<SessionDetailsCache>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT file_modified, user_messages, assistant_messages, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost,
                cache_write_cost, models_json
         FROM session_details_cache
         WHERE path = ?",
        )
        .map_err(|e| format!("Failed to prepare session_details_cache statement: {e}"))?;

    let row = stmt
        .query_row(params![path], |row| {
            Ok(SessionDetailsCache {
                file_modified: parse_timestamp(&row.get::<_, String>(0)?),
                user_messages: row.get::<_, i64>(1)? as usize,
                assistant_messages: row.get::<_, i64>(2)? as usize,
                input_tokens: row.get::<_, i64>(3)? as usize,
                output_tokens: row.get::<_, i64>(4)? as usize,
                cache_read_tokens: row.get::<_, i64>(5)? as usize,
                cache_write_tokens: row.get::<_, i64>(6)? as usize,
                input_cost: row.get::<_, f64>(7)?,
                output_cost: row.get::<_, f64>(8)?,
                cache_read_cost: row.get::<_, f64>(9)?,
                cache_write_cost: row.get::<_, f64>(10)?,
                models_json: row.get::<_, String>(11)?,
            })
        })
        .ok();

    Ok(row)
}

pub fn upsert_session_details_cache(
    conn: &Connection,
    path: &str,
    file_modified: DateTime<Utc>,
    details: &SessionDetails,
) -> Result<(), String> {
    let models_json = serde_json::to_string(&details.models)
        .map_err(|e| format!("Failed to serialize models: {e}"))?;

    conn.execute(
        "INSERT INTO session_details_cache (
            path, file_modified, user_messages, assistant_messages, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, input_cost, output_cost, cache_read_cost,
            cache_write_cost, models_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ON CONFLICT(path) DO UPDATE SET
            file_modified = excluded.file_modified,
            user_messages = excluded.user_messages,
            assistant_messages = excluded.assistant_messages,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            cache_read_tokens = excluded.cache_read_tokens,
            cache_write_tokens = excluded.cache_write_tokens,
            input_cost = excluded.input_cost,
            output_cost = excluded.output_cost,
            cache_read_cost = excluded.cache_read_cost,
            cache_write_cost = excluded.cache_write_cost,
            models_json = excluded.models_json",
        params![
            path,
            &file_modified.to_rfc3339(),
            details.user_messages as i64,
            details.assistant_messages as i64,
            details.input_tokens as i64,
            details.output_tokens as i64,
            details.cache_read_tokens as i64,
            details.cache_write_tokens as i64,
            details.input_cost,
            details.output_cost,
            details.cache_read_cost,
            details.cache_write_cost,
            models_json,
        ],
    )
    .map_err(|e| format!("Failed to upsert session_details_cache: {e}"))?;

    Ok(())
}

pub fn vacuum(conn: &Connection) -> Result<(), String> {
    conn.execute("VACUUM", [])
        .map_err(|e| format!("Failed to vacuum database: {e}"))?;
    Ok(())
}

pub fn cleanup_missing_files(conn: &Connection) -> Result<usize, String> {
    let mut stmt = conn
        .prepare("SELECT path FROM sessions")
        .map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let paths: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Failed to query paths: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect paths: {e}"))?;

    let mut deleted = 0;
    for path in paths {
        if !Path::new(&path).exists() {
            delete_session(conn, &path)?;
            deleted += 1;
        }
    }

    Ok(deleted)
}

pub fn preload_recent_sessions(
    conn: &Connection,
    count: usize,
) -> Result<Vec<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role
         FROM sessions
         ORDER BY last_accessed DESC, access_count DESC, modified DESC, path ASC
         LIMIT ?"
    ).map_err(|e| format!("Failed to prepare statement: {e}"))?;

    let sessions = stmt
        .query_map(params![count as i64], |row| {
            Ok(SessionInfo {
                path: row.get(1)?,
                id: row.get(0)?,
                cwd: row.get(2)?,
                name: row.get(3)?,
                created: parse_timestamp(&row.get::<_, String>(4)?),
                modified: parse_timestamp(&row.get::<_, String>(5)?),
                message_count: row.get(6)?,
                first_message: row.get(7)?,
                all_messages_text: row.get(8).unwrap_or_default(),
                user_messages_text: row.get(9).unwrap_or_default(),
                assistant_messages_text: row.get(10).unwrap_or_default(),
                last_message: row.get(11).unwrap_or_default(),
                last_message_role: row.get(12).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Failed to query sessions: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sessions: {e}"))?;

    Ok(sessions)
}

pub fn search_fts5(conn: &Connection, query: &str, limit: usize) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT path FROM sessions_fts
         WHERE sessions_fts MATCH ?
         ORDER BY rowid DESC
         LIMIT ?",
        )
        .map_err(|e| format!("Failed to prepare FTS5 statement: {e}"))?;

    let paths: Vec<String> = stmt
        .query_map(params![query, limit as i64], |row| row.get(0))
        .map_err(|e| format!("Failed to query FTS5: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect FTS5 results: {e}"))?;

    Ok(paths)
}

pub fn optimize_database(conn: &Connection) -> Result<(), String> {
    vacuum(conn)?;
    conn.execute("ANALYZE", [])
        .map_err(|e| format!("Failed to analyze database: {e}"))?;
    Ok(())
}

// ============ Message-level FTS support ============

/// Delete all message entries for a session (used before re-inserting)
pub fn delete_message_entries_for_session(
    conn: &Connection,
    session_path: &str,
) -> Result<(), String> {
    debug!(
        "[Delete] Attempting to delete message entries for session: {}",
        session_path
    );

    // Check if message_entries table exists
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'")
        .map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists: bool = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries"))
        .unwrap_or(false);

    if !exists {
        debug!("[Delete] message_entries table does not exist, skipping delete");
        return Ok(());
    }

    // Validate schema has all required columns before attempting DELETE
    let mut col_stmt = conn
        .prepare("PRAGMA table_info(message_entries)")
        .map_err(|e| format!("Failed to query message_entries schema: {e}"))?;
    let column_names: Vec<String> = col_stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| format!("Failed to read message_entries column names: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message_entries column names: {e}"))?;

    let required = ["id", "session_path", "role", "content", "timestamp"];
    let has_all = required
        .iter()
        .all(|&col| column_names.contains(&col.to_string()));

    if !has_all {
        error!("[Delete] message_entries schema incomplete. Columns: {:?}. Required: {:?}. Triggering migration...", 
            column_names, required);
        crate::sqlite_cache::ensure_message_fts_schema(conn)?;
        // Retry after migration
        let mut col_stmt2 = conn
            .prepare("PRAGMA table_info(message_entries)")
            .map_err(|e| format!("Failed to prepare PRAGMA after migration: {e}"))?;
        let columns2: Vec<String> = col_stmt2
            .query_map([], |row| row.get(1))
            .map_err(|e| format!("Failed to query columns after migration: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect columns after migration: {e}"))?;
        if !required
            .iter()
            .all(|&col| columns2.contains(&col.to_string()))
        {
            return Err(format!(
                "message_entries schema still incomplete after migration: {columns2:?}"
            ));
        }
        debug!("[Delete] Schema migration successful, retrying delete");
        return delete_message_entries_for_session(conn, session_path);
    }

    // Debug logging
    if cfg!(debug_assertions) {
        debug!("[Delete] message_entries schema OK: {:?}", column_names);
    }

    match conn.execute(
        "DELETE FROM message_entries WHERE session_path = ?",
        params![session_path],
    ) {
        Ok(_) => {
            debug!(
                "[Delete] Deleted message entries for session: {}",
                session_path
            );
        }
        Err(e) => {
            let err_str = format!("{e:?}");
            error!(
                "[Delete] Failed to delete message entries for session '{}': {:?} (code: {:?})",
                session_path,
                e,
                e.sqlite_error_code()
            );

            // Always attempt recovery via migration, then retry
            error!("[Delete] Attempting schema migration recovery...");
            if let Err(migrate_err) = crate::sqlite_cache::ensure_message_fts_schema(conn) {
                error!("[Delete] Migration recovery failed: {}", migrate_err);
            } else if let Ok(count) = conn.execute(
                "DELETE FROM message_entries WHERE session_path = ?",
                params![session_path],
            ) {
                debug!("[Delete] Recovered: deleted {} rows", count);
                return Ok(());
            }

            return Err(format!("Failed to delete message entries: {err_str}"));
        }
    }
    Ok(())
}

/// Insert message entries from a session file into message_entries table
pub fn insert_message_entries(conn: &Connection, session: &SessionInfo) -> Result<(), String> {
    use serde_json::Value;
    use std::io::BufReader;

    // Check if message_entries table exists (FTS may be disabled)
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'")
        .map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists: bool = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries"))
        .unwrap_or(false);

    if !exists {
        // FTS is disabled or table not created yet - skip
        return Ok(());
    }

    let file = fs::File::open(&session.path)
        .map_err(|e| format!("Failed to open file for message entries: {e}"))?;
    let reader = BufReader::new(file);

    let mut inserted_count = 0;
    for line_result in reader.lines() {
        let line: String = line_result.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<Value>(&line) {
            if entry["type"] == "message" {
                if let Some(message) = entry.get("message") {
                    let role = message["role"].as_str().unwrap_or("");
                    if role == "user" || role == "assistant" {
                        let entry_id = entry["id"].as_str().unwrap_or("").to_string();
                        if entry_id.is_empty() {
                            continue;
                        }

                        let timestamp = entry["timestamp"].as_str().unwrap_or("").to_string();

                        // Extract text content (exclude thinking)
                        let mut content = String::new();
                        if let Some(content_arr) = message["content"].as_array() {
                            for item in content_arr {
                                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                    content.push_str(text);
                                }
                            }
                        }

                        if !content.is_empty() {
                            // Insert into message_entries
                            conn.execute(
                                "INSERT OR REPLACE INTO message_entries (id, session_path, role, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                                params![
                                    &entry_id,
                                    &session.path,
                                    role,
                                    &content,
                                    &timestamp,
                                ],
                            ).map_err(|e| format!("Failed to insert message entry (session: {}, entry: {}): {}", 
                                session.path, entry_id, e))?;
                            inserted_count += 1;
                        }
                    }
                }
            }
        }
    }

    debug!(
        "Inserted {} message entries for session: {}",
        inserted_count, session.path
    );
    Ok(())
}

/// Upsert message entries into message_entries table from a pre-parsed list.
/// This is more efficient than insert_message_entries because it avoids re-reading the session file.
pub fn upsert_message_entries(
    conn: &Connection,
    session_path: &str,
    entries: &[SessionEntry],
) -> Result<(), String> {
    use rusqlite::OptionalExtension;

    // Check if message_entries table exists (FTS may be disabled)
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='message_entries'")
        .map_err(|e| format!("Failed to check message_entries existence: {e}"))?;
    let exists: bool = stmt
        .query_row([], |row| Ok(row.get::<_, String>(0)? == "message_entries"))
        .unwrap_or(false);

    if !exists {
        // FTS is disabled or table not created yet - skip
        return Ok(());
    }

    // Drop the statement to release borrow
    drop(stmt);

    // Delete existing entries for this session (non-transactional, each execute is auto-committed)
    conn.execute(
        "DELETE FROM message_entries WHERE session_path = ?",
        params![session_path],
    )
    .map_err(|e| format!("Failed to delete existing message entries for {session_path}: {e}"))?;

    // Insert each entry (could be batched but ok)
    for entry in entries {
        if let Some(ref msg) = entry.message {
            // Concatenate all text content parts into a single string
            let content = msg
                .content
                .iter()
                .filter_map(|c| c.text.as_deref())
                .collect::<String>();

            if content.is_empty() {
                continue;
            }

            conn.execute(
                "INSERT OR REPLACE INTO message_entries (id, session_path, role, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    &entry.id,
                    session_path,
                    &msg.role,
                    &content,
                    &entry.timestamp.to_rfc3339(),
                ],
            )
            .map_err(|e| format!("Failed to insert message entry {}: {}", entry.id, e))?;
        }
    }

    debug!(
        "Upserted {} message entries for session: {}",
        entries.len(),
        session_path
    );
    Ok(())
}

/// Search message-level FTS5 index and return matching message entries
/// Returns (entry_id, session_path, role, snippet, timestamp, rank)
#[allow(clippy::type_complexity)]
pub fn search_message_fts(
    conn: &Connection,
    query: &str,
    role_filter: Option<&str>,
    limit: usize,
) -> Result<Vec<(String, String, String, String, String, f32)>, String> {
    // Escape and treat query as a literal phrase for FTS5 MATCH
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    // Escape double quotes and backslashes per FTS5 requirements
    let mut escaped = String::new();
    for ch in trimmed.chars() {
        match ch {
            '"' => escaped.push_str("\"\""),
            '\\' => escaped.push_str("\\\\"),
            _ => escaped.push(ch),
        }
    }
    // Wrap in double quotes to match as a phrase
    let fts_query = format!("\"{escaped}\"");

    // Build role filter condition
    let role_condition = match role_filter {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };

    let sql = format!(
        "SELECT \
            m.id, \
            m.session_path, \
            m.role, \
            snippet(message_fts, 2, '<b>', '</b>', '...', 80) as snippet, \
            m.timestamp, \
            m.rowid as rank \
         FROM message_entries m \
         JOIN message_fts ON m.rowid = message_fts.rowid \
         WHERE message_fts MATCH ? \
         AND {role_condition} \
         ORDER BY m.rowid \
         LIMIT ?"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare message FTS query: {e}"))?;

    let rows = stmt
        .query_map(params![fts_query, limit as i64], |row| {
            Ok((
                row.get::<_, String>(0)?, // entry_id
                row.get::<_, String>(1)?, // session_path
                row.get::<_, String>(2)?, // role
                row.get::<_, String>(3)?, // snippet with <b> tags
                row.get::<_, String>(4)?, // timestamp
                row.get::<_, f32>(5)?,    // rank
            ))
        })
        .map_err(|e| format!("Failed to query message FTS: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message FTS results: {e}"))?;

    Ok(rows)
}

fn parse_timestamp(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

// Favorites functions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbFavoriteItem {
    pub id: String,
    #[serde(rename = "type")]
    pub favorite_type: String,
    pub name: String,
    pub path: String,
    pub added_at: String,
}

pub fn add_favorite(
    conn: &Connection,
    id: &str,
    favorite_type: &str,
    name: &str,
    path: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO favorites (id, type, name, path, added_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, favorite_type, name, path, Utc::now().to_rfc3339()],
    ).map_err(|e| format!("Failed to add favorite: {e}"))?;
    Ok(())
}

pub fn remove_favorite(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM favorites WHERE id = ?", params![id])
        .map_err(|e| format!("Failed to remove favorite: {e}"))?;
    Ok(())
}

pub fn get_all_favorites(conn: &Connection) -> Result<Vec<DbFavoriteItem>, String> {
    let mut stmt = conn
        .prepare("SELECT id, type, name, path, added_at FROM favorites ORDER BY added_at DESC")
        .map_err(|e| format!("Failed to prepare favorites statement: {e}"))?;

    let favorites = stmt
        .query_map([], |row| {
            Ok(DbFavoriteItem {
                id: row.get(0)?,
                favorite_type: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                added_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query favorites: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect favorites: {e}"))?;

    Ok(favorites)
}

pub fn is_favorite(conn: &Connection, id: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM favorites WHERE id = ?",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check favorite: {e}"))?;
    Ok(count > 0)
}

pub fn toggle_favorite(
    conn: &Connection,
    id: &str,
    favorite_type: &str,
    name: &str,
    path: &str,
) -> Result<bool, String> {
    let exists = is_favorite(conn, id)?;
    if exists {
        remove_favorite(conn, id)?;
        Ok(false)
    } else {
        add_favorite(conn, id, favorite_type, name, path)?;
        Ok(true)
    }
}

pub fn full_rebuild_fts(conn: &Connection) -> Result<(), String> {
    conn.execute("DROP TABLE IF EXISTS sessions_fts", [])
        .map_err(|e| e.to_string())?;
    // Drop any legacy triggers (they will be removed with the table drop, but do it explicitly for safety)
    conn.execute("DROP TRIGGER IF EXISTS sessions_ai", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_ad", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DROP TRIGGER IF EXISTS sessions_au", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE VIRTUAL TABLE sessions_fts USING fts5(
            path UNINDEXED,
            cwd,
            name,
            first_message,
            all_messages_text,
            user_messages_text,
            assistant_messages_text,
            content='sessions',
            content_rowid='rowid',
            tokenize='unicode61'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create FTS5 table: {e}"))?;

    // No manual triggers: auto-sync maintains the index

    // Rebuild the index from existing sessions
    conn.execute(
        "INSERT INTO sessions_fts(sessions_fts) VALUES('rebuild')",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ============ Utility & Tag Management ============

// Clear all cached session data (sessions table and session_details_cache table)
// Note: favorites table is preserved
pub fn clear_all_cache(conn: &Connection) -> Result<(usize, usize), String> {
    // Delete all sessions
    let sessions_deleted = conn
        .execute("DELETE FROM sessions", [])
        .map_err(|e| format!("Failed to delete sessions: {e}"))?;

    // Delete all session details cache
    let details_deleted = conn
        .execute("DELETE FROM session_details_cache", [])
        .map_err(|e| format!("Failed to delete session details cache: {e}"))?;

    // Vacuum to reclaim space
    vacuum(conn)?;

    Ok((sessions_deleted, details_deleted))
}

// Tag management structs and functions

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub is_builtin: bool,
    pub created_at: String,
    pub auto_rules: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSessionTag {
    pub session_id: String,
    pub tag_id: String,
    pub position: i64,
    pub assigned_at: String,
}

pub fn get_all_tags(conn: &Connection) -> Result<Vec<DbTag>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, icon, sort_order, is_builtin, created_at, auto_rules, parent_id FROM tags ORDER BY sort_order"
    ).map_err(|e| format!("Failed to prepare tags statement: {e}"))?;

    let tags = stmt
        .query_map([], |row| {
            Ok(DbTag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
                sort_order: row.get(4)?,
                is_builtin: row.get(5)?,
                created_at: row.get(6)?,
                auto_rules: row.get(7)?,
                parent_id: row.get(8)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect tags: {e}"))?;

    Ok(tags)
}

pub fn create_tag(
    conn: &Connection,
    id: &str,
    name: &str,
    color: &str,
    icon: Option<&str>,
    parent_id: Option<&str>,
) -> Result<(), String> {
    let max_order: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM tags", [], |r| {
            r.get(0)
        })
        .unwrap_or(-1);
    conn.execute(
        "INSERT INTO tags (id, name, color, icon, sort_order, is_builtin, created_at, parent_id) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        params![id, name, color, icon, max_order + 1, Utc::now().to_rfc3339(), parent_id],
    ).map_err(|e| format!("Failed to create tag: {e}"))?;
    Ok(())
}

pub fn update_tag(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
    icon: Option<&str>,
    sort_order: Option<i64>,
    parent_id: Option<Option<&str>>,
) -> Result<(), String> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(v) = name {
        sets.push("name = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = color {
        sets.push("color = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = icon {
        sets.push("icon = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = sort_order {
        sets.push("sort_order = ?");
        values.push(Box::new(v));
    }
    if let Some(v) = parent_id {
        sets.push("parent_id = ?");
        values.push(Box::new(v.map(|s| s.to_string())));
    }
    if sets.is_empty() {
        return Ok(());
    }
    values.push(Box::new(id.to_string()));
    let sql = format!("UPDATE tags SET {} WHERE id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|b| b.as_ref()).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| format!("Failed to update tag: {e}"))?;
    Ok(())
}

pub fn delete_tag(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM session_tags WHERE tag_id = ?", params![id])
        .map_err(|e| format!("Failed to remove tag associations: {e}"))?;
    conn.execute("DELETE FROM tags WHERE id = ?", params![id])
        .map_err(|e| format!("Failed to delete tag: {e}"))?;
    Ok(())
}

pub fn get_all_session_tags(conn: &Connection) -> Result<Vec<DbSessionTag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT session_id, tag_id, position, assigned_at FROM session_tags ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare session_tags statement: {e}"))?;

    let items = stmt
        .query_map([], |row| {
            Ok(DbSessionTag {
                session_id: row.get(0)?,
                tag_id: row.get(1)?,
                position: row.get(2)?,
                assigned_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query session_tags: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect session_tags: {e}"))?;

    Ok(items)
}

pub fn assign_tag(conn: &Connection, session_id: &str, tag_id: &str) -> Result<(), String> {
    let max_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM session_tags WHERE tag_id = ?",
            params![tag_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);
    conn.execute(
        "INSERT OR IGNORE INTO session_tags (session_id, tag_id, position, assigned_at) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, tag_id, max_pos + 1, Utc::now().to_rfc3339()],
    ).map_err(|e| format!("Failed to assign tag: {e}"))?;
    Ok(())
}

pub fn remove_tag_from_session(
    conn: &Connection,
    session_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?",
        params![session_id, tag_id],
    )
    .map_err(|e| format!("Failed to remove tag: {e}"))?;
    Ok(())
}

pub fn move_session_tag(
    conn: &Connection,
    session_id: &str,
    from_tag_id: Option<&str>,
    to_tag_id: &str,
    position: i64,
) -> Result<(), String> {
    if let Some(from) = from_tag_id {
        conn.execute(
            "DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?",
            params![session_id, from],
        )
        .map_err(|e| format!("Failed to remove old tag: {e}"))?;
    }
    conn.execute(
        "INSERT OR REPLACE INTO session_tags (session_id, tag_id, position, assigned_at) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, to_tag_id, position, Utc::now().to_rfc3339()],
    ).map_err(|e| format!("Failed to move session tag: {e}"))?;
    Ok(())
}

pub fn reorder_tags(conn: &Connection, tag_ids: &[String]) -> Result<(), String> {
    for (i, id) in tag_ids.iter().enumerate() {
        conn.execute(
            "UPDATE tags SET sort_order = ? WHERE id = ?",
            params![i as i64, id],
        )
        .map_err(|e| format!("Failed to reorder tag: {e}"))?;
    }
    Ok(())
}

pub fn update_tag_auto_rules(
    conn: &Connection,
    id: &str,
    auto_rules: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE tags SET auto_rules = ? WHERE id = ?",
        params![auto_rules, id],
    )
    .map_err(|e| format!("Failed to update auto_rules: {e}"))?;
    Ok(())
}

pub fn evaluate_auto_rules(
    conn: &Connection,
    session_id: &str,
    text: &str,
) -> Result<Vec<String>, String> {
    let tags = get_all_tags(conn)?;
    let mut matched = Vec::new();
    for tag in &tags {
        let rules_json = match &tag.auto_rules {
            Some(r) if !r.is_empty() => r,
            _ => continue,
        };
        let rules: Vec<serde_json::Value> = serde_json::from_str(rules_json).unwrap_or_default();
        for rule in &rules {
            let enabled = rule
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let pattern = rule.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
            if !enabled || pattern.is_empty() {
                continue;
            }
            if let Ok(re) = regex::Regex::new(pattern) {
                if re.is_match(text) {
                    assign_tag(conn, session_id, &tag.id)?;
                    matched.push(tag.id.clone());
                    break;
                }
            }
        }
    }
    Ok(matched)
}
