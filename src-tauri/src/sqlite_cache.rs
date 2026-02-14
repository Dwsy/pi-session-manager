use crate::config::Config;
use crate::models::SessionInfo;
use crate::session_parser::SessionDetails;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub fn get_db_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
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
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {e}"))?;

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

    // 迁移：添加 last_message 和 last_message_role 字段（如果不存在）
    conn.execute("ALTER TABLE sessions ADD COLUMN last_message TEXT", [])
        .ok(); // 忽略错误（字段可能已存在）

    conn.execute("ALTER TABLE sessions ADD COLUMN last_message_role TEXT", [])
        .ok(); // 忽略错误（字段可能已存在）

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

    // Migration: add auto_rules column to tags
    conn.execute("ALTER TABLE tags ADD COLUMN auto_rules TEXT", [])
        .ok();

    // Migration: add parent_id column to tags for hierarchical labels
    conn.execute("ALTER TABLE tags ADD COLUMN parent_id TEXT", [])
        .ok();

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

    if config.enable_fts5 {
        init_fts5(&conn)?;
    }

    Ok(conn)
}

fn init_fts5(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
            path UNINDEXED,
            cwd,
            name,
            first_message,
            all_messages_text,
            content='sessions',
            content_rowid='rowid'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create FTS5 table: {e}"))?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
            INSERT INTO sessions_fts(rowid, path, cwd, name, first_message, all_messages_text)
            VALUES (NEW.rowid, NEW.path, NEW.cwd, NEW.name, NEW.first_message, NEW.all_messages_text);
        END",
        [],
    ).map_err(|e| format!("Failed to create FTS5 insert trigger: {e}"))?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
            INSERT INTO sessions_fts(sessions_fts, rowid, path, cwd, name, first_message, all_messages_text)
            VALUES ('delete', OLD.rowid, OLD.path, OLD.cwd, OLD.name, OLD.first_message, OLD.all_messages_text);
        END",
        [],
    ).map_err(|e| format!("Failed to create FTS5 delete trigger: {e}"))?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
            INSERT INTO sessions_fts(sessions_fts, rowid, path, cwd, name, first_message, all_messages_text)
            VALUES ('delete', OLD.rowid, OLD.path, OLD.cwd, OLD.name, OLD.first_message, OLD.all_messages_text);
            INSERT INTO sessions_fts(rowid, path, cwd, name, first_message, all_messages_text)
            VALUES (NEW.rowid, NEW.path, NEW.cwd, NEW.name, NEW.first_message, NEW.all_messages_text);
        END",
        [],
    ).map_err(|e| format!("Failed to create FTS5 update trigger: {e}"))?;

    Ok(())
}

pub fn upsert_session(
    conn: &Connection,
    session: &SessionInfo,
    file_modified: DateTime<Utc>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, all_messages_text, last_message, last_message_role, cached_at, access_count, last_accessed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, NULL)
         ON CONFLICT(path) DO UPDATE SET
            modified = excluded.modified,
            file_modified = excluded.file_modified,
            message_count = excluded.message_count,
            first_message = excluded.first_message,
            all_messages_text = excluded.all_messages_text,
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
            &session.last_message,
            &session.last_message_role,
            &Utc::now().to_rfc3339(),
        ],
    ).map_err(|e| format!("Failed to upsert session: {e}"))?;

    Ok(())
}

pub fn get_session(conn: &Connection, path: &str) -> Result<Option<SessionInfo>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, last_message, last_message_role
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
                all_messages_text: row.get(8)?,
                last_message: row.get(9)?,
                last_message_role: row.get(10)?,
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
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, last_message, last_message_role
         FROM sessions ORDER BY modified DESC"
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
                all_messages_text: row.get(8)?,
                last_message: row.get(9)?,
                last_message_role: row.get(10)?,
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
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, last_message, last_message_role
         FROM sessions WHERE modified > ? ORDER BY modified DESC"
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
                all_messages_text: row.get(8)?,
                last_message: row.get(9)?,
                last_message_role: row.get(10)?,
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
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, last_message, last_message_role
         FROM sessions WHERE modified <= ? ORDER BY modified DESC"
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
                all_messages_text: row.get(8)?,
                last_message: row.get(9)?,
                last_message_role: row.get(10)?,
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

pub fn delete_session(conn: &Connection, path: &str) -> Result<(), String> {
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
        "SELECT id, path, cwd, name, created, modified, message_count, first_message, all_messages_text, last_message, last_message_role
         FROM sessions
         ORDER BY last_accessed DESC, access_count DESC, modified DESC
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
                all_messages_text: row.get(8)?,
                last_message: row.get(9)?,
                last_message_role: row.get(10)?,
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
         ORDER BY rank
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

/// Clear all cached session data (sessions table and session_details_cache table)
/// Note: favorites table is preserved
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

// Tags
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
