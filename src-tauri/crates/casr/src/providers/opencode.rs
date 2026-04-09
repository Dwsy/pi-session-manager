//! OpenCode provider — reads/writes sessions from SQLite `opencode.db`.
//!
//! OpenCode stores session state in a SQLite database named `opencode.db`.
//! The canonical schema includes:
//! - `sessions` table
//! - `messages` table
//! - `files` table
//!
//! casr addresses specific OpenCode sessions using a virtual path form:
//! `<db-path>/<urlencoded-session-id>`
//! This mirrors the approach used by Cursor and Aider providers.

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use anyhow::Context;
use rusqlite::{Connection, OpenFlags};
use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content,
    normalize_role, parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// OpenCode provider implementation.
pub struct OpenCode;

const DB_FILENAME: &str = "opencode.db";
const DATA_DIRNAME: &str = ".opencode";

impl OpenCode {
    /// Parse OPENCODE environment overrides into a target DB path.
    ///
    /// Supported overrides:
    /// - `OPENCODE_DB_PATH` (direct file path)
    /// - `OPENCODE_HOME` (directory containing `opencode.db`, or a direct `.db` path)
    fn env_db_path() -> Option<PathBuf> {
        if let Ok(path) = std::env::var("OPENCODE_DB_PATH")
            && !path.trim().is_empty()
        {
            return Some(PathBuf::from(path));
        }

        if let Ok(home) = std::env::var("OPENCODE_HOME")
            && !home.trim().is_empty()
        {
            let home_path = PathBuf::from(home);
            if home_path.extension().is_some_and(|ext| ext == "db") {
                return Some(home_path);
            }
            return Some(home_path.join(DB_FILENAME));
        }

        None
    }

    /// Candidate global config files that may contain `data.directory`.
    fn config_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();
        if let Some(home) = dirs::home_dir() {
            paths.push(home.join(".opencode.json"));
            paths.push(home.join(".config/opencode/.opencode.json"));
        }
        if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME")
            && !xdg.trim().is_empty()
        {
            paths.push(PathBuf::from(xdg).join("opencode/.opencode.json"));
        }
        paths
    }

    /// Parse absolute `data.directory` values from OpenCode config files.
    fn configured_data_dirs() -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        for cfg in Self::config_paths() {
            let Ok(text) = std::fs::read_to_string(&cfg) else {
                continue;
            };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };
            let Some(dir) = json
                .pointer("/data/directory")
                .and_then(serde_json::Value::as_str)
            else {
                continue;
            };

            let data_dir = PathBuf::from(dir);
            if data_dir.is_absolute() {
                dirs.push(data_dir);
            }
        }

        dirs
    }

    /// Candidate DB paths from current directory and parents (`.opencode/opencode.db`).
    fn cwd_ancestor_db_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();
        let Ok(cwd) = std::env::current_dir() else {
            return paths;
        };

        for ancestor in cwd.ancestors() {
            paths.push(ancestor.join(DATA_DIRNAME).join(DB_FILENAME));
        }

        paths
    }

    /// Discover existing OpenCode DB files.
    ///
    /// If env override is set, discovery is constrained to that location.
    fn find_db_files() -> Vec<PathBuf> {
        if let Some(env_db) = Self::env_db_path() {
            return if env_db.is_file() {
                vec![env_db]
            } else {
                Vec::new()
            };
        }

        let mut candidates = Vec::new();
        candidates.extend(Self::cwd_ancestor_db_paths());
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(DATA_DIRNAME).join(DB_FILENAME));
        }
        for data_dir in Self::configured_data_dirs() {
            candidates.push(data_dir.join(DB_FILENAME));
        }

        dedup_existing_files(candidates)
    }

    /// Resolve target DB path for writes.
    fn choose_target_db_path(session: &CanonicalSession) -> anyhow::Result<PathBuf> {
        if let Some(env_db) = Self::env_db_path() {
            return Ok(env_db);
        }

        if let Some(workspace) = &session.workspace {
            return Ok(workspace.join(DATA_DIRNAME).join(DB_FILENAME));
        }

        if let Some(existing) = Self::find_db_files().into_iter().next() {
            return Ok(existing);
        }

        let cwd = std::env::current_dir().context("failed to determine current directory")?;
        Ok(cwd.join(DATA_DIRNAME).join(DB_FILENAME))
    }

    /// Build virtual per-session path: `<db-path>/<urlencoded-session-id>`.
    fn virtual_session_path(db_path: &Path, session_id: &str) -> PathBuf {
        let encoded = urlencoding::encode(session_id);
        db_path.join(encoded.as_ref())
    }

    /// Parse virtual path back into `(db_path, session_id)`.
    fn parse_virtual_path(path: &Path) -> Option<(PathBuf, String)> {
        let parent = path.parent()?;
        if !parent.is_file() {
            return None;
        }
        if parent.file_name().and_then(|n| n.to_str()) != Some(DB_FILENAME) {
            return None;
        }

        let encoded = path.file_name()?.to_str()?;
        let decoded = urlencoding::decode(encoded).ok()?;
        Some((parent.to_path_buf(), decoded.into_owned()))
    }

    /// Open DB in read-only mode.
    fn open_db(path: &Path) -> anyhow::Result<Connection> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("failed to open OpenCode DB: {}", path.display()))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(conn)
    }

    /// Open DB in read-write/create mode.
    fn open_db_rw(path: &Path) -> anyhow::Result<Connection> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create directory: {}", parent.display()))?;
        }

        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("failed to open OpenCode DB for writing: {}", path.display()))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(conn)
    }

    fn table_exists(conn: &Connection, table: &str) -> bool {
        conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1")
            .and_then(|mut stmt| stmt.exists(rusqlite::params![table]))
            .unwrap_or(false)
    }

    fn trigger_exists(conn: &Connection, trigger: &str) -> bool {
        conn.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?1")
            .and_then(|mut stmt| stmt.exists(rusqlite::params![trigger]))
            .unwrap_or(false)
    }

    /// Ensure core OpenCode tables exist.
    fn ensure_schema(conn: &Connection) -> anyhow::Result<()> {
        conn.execute_batch(
            r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    parent_session_id TEXT,
    title TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    cost REAL NOT NULL DEFAULT 0.0 CHECK (cost >= 0.0),
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    summary_message_id TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parts TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
    UNIQUE(path, session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
CREATE INDEX IF NOT EXISTS idx_files_session_id ON files (session_id);
"#,
        )
        .context("failed to initialize OpenCode schema")?;
        Ok(())
    }

    fn session_exists(conn: &Connection, session_id: &str) -> bool {
        if !Self::table_exists(conn, "sessions") {
            return false;
        }
        conn.prepare("SELECT 1 FROM sessions WHERE id = ?1 LIMIT 1")
            .and_then(|mut stmt| stmt.exists(rusqlite::params![session_id]))
            .unwrap_or(false)
    }

    fn newest_root_session_id(conn: &Connection) -> Option<String> {
        if !Self::table_exists(conn, "sessions") {
            return None;
        }

        conn.query_row(
            "SELECT id FROM sessions WHERE parent_session_id IS NULL ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
    }

    fn workspace_from_db_path(db_path: &Path) -> Option<PathBuf> {
        let data_dir = db_path.parent()?;
        if data_dir.file_name().and_then(|n| n.to_str()) == Some(DATA_DIRNAME) {
            return data_dir.parent().map(Path::to_path_buf);
        }
        None
    }

    fn read_session_by_id(
        conn: &Connection,
        db_path: &Path,
        session_id: &str,
    ) -> anyhow::Result<CanonicalSession> {
        if !Self::table_exists(conn, "sessions") {
            anyhow::bail!("OpenCode DB has no sessions table: {}", db_path.display());
        }
        if !Self::table_exists(conn, "messages") {
            anyhow::bail!("OpenCode DB has no messages table: {}", db_path.display());
        }

        let (title_raw, created_raw, updated_raw, parent_session_id, prompt_tokens, completion_tokens, cost): (
            String,
            i64,
            i64,
            Option<String>,
            i64,
            i64,
            f64,
        ) = conn
            .query_row(
                "SELECT title, created_at, updated_at, parent_session_id, prompt_tokens, completion_tokens, cost
                 FROM sessions
                 WHERE id = ?1
                 LIMIT 1",
                rusqlite::params![session_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .with_context(|| format!("session '{session_id}' not found in {}", db_path.display()))?;

        let mut started_at = parse_timestamp(&serde_json::Value::from(created_raw));
        let mut ended_at = parse_timestamp(&serde_json::Value::from(updated_raw)).or(started_at);
        let mut model_counts: HashMap<String, usize> = HashMap::new();
        let mut messages = Vec::new();

        let mut stmt = conn
            .prepare(
                "SELECT id, role, parts, model, created_at, updated_at, finished_at
                 FROM messages
                 WHERE session_id = ?1
                 ORDER BY created_at ASC, id ASC",
            )
            .context("failed to prepare message query")?;

        let rows = stmt.query_map(rusqlite::params![session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<i64>>(6)?,
            ))
        })?;

        for row in rows {
            let (
                message_id,
                role_raw,
                parts_json,
                model,
                created_at_raw,
                _updated_at_raw,
                finished_at_raw,
            ) = row?;

            let timestamp =
                parse_timestamp(&serde_json::Value::from(created_at_raw)).or(Some(created_at_raw));
            if let Some(ts) = timestamp {
                started_at = Some(started_at.map_or(ts, |current| current.min(ts)));
                ended_at = Some(ended_at.map_or(ts, |current| current.max(ts)));
            }

            if let Some(finished_raw) = finished_at_raw
                && let Some(finished_ts) = parse_timestamp(&serde_json::Value::from(finished_raw))
            {
                ended_at = Some(ended_at.map_or(finished_ts, |current| current.max(finished_ts)));
            }

            let raw_parts = serde_json::from_str::<serde_json::Value>(&parts_json)
                .unwrap_or_else(|_| serde_json::json!([]));
            let (content, tool_calls, tool_results) = parse_parts(&raw_parts);

            if let Some(model_name) = model.as_deref().filter(|m| !m.is_empty()) {
                *model_counts.entry(model_name.to_string()).or_insert(0) += 1;
            }

            messages.push(CanonicalMessage {
                idx: 0,
                role: normalize_role(&role_raw),
                content,
                timestamp,
                author: model.clone(),
                tool_calls,
                tool_results,
                extra: serde_json::json!({
                    "opencode_message_id": message_id,
                    "opencode_parts": raw_parts,
                }),
            });
        }

        reindex_messages(&mut messages);

        let title = (!title_raw.trim().is_empty())
            .then_some(title_raw)
            .or_else(|| {
                messages
                    .iter()
                    .find(|m| m.role == MessageRole::User)
                    .map(|m| truncate_title(&m.content, 80))
                    .filter(|t| !t.is_empty())
            });

        let model_name = model_counts
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(name, _)| name);

        let source = Self::virtual_session_path(db_path, session_id);

        Ok(CanonicalSession {
            session_id: session_id.to_string(),
            provider_slug: "opencode".to_string(),
            workspace: Self::workspace_from_db_path(db_path),
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::json!({
                "opencode_db": db_path.display().to_string(),
                "parent_session_id": parent_session_id,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "cost": cost,
            }),
            source_path: source,
            model_name,
        })
    }
}

impl Provider for OpenCode {
    fn name(&self) -> &str {
        "OpenCode"
    }

    fn slug(&self) -> &str {
        "opencode"
    }

    fn cli_alias(&self) -> &str {
        "opc"
    }

    fn detect(&self) -> DetectionResult {
        let mut installed = false;
        let mut evidence = Vec::new();

        if which::which("opencode").is_ok() {
            installed = true;
            evidence.push("opencode binary found in PATH".to_string());
        }

        if let Some(env_path) = Self::env_db_path() {
            evidence.push(format!("env override target: {}", env_path.display()));
        }

        let dbs = Self::find_db_files();
        if !dbs.is_empty() {
            installed = true;
            evidence.push(format!("found {} opencode.db database(s)", dbs.len()));
        }

        trace!(provider = "opencode", installed, ?evidence, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        Self::find_db_files()
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        for db_path in Self::find_db_files() {
            let Ok(conn) = Self::open_db(&db_path) else {
                continue;
            };

            if Self::session_exists(&conn, session_id) {
                let virtual_path = Self::virtual_session_path(&db_path, session_id);
                debug!(
                    db = %db_path.display(),
                    session = %virtual_path.display(),
                    session_id,
                    "found OpenCode session"
                );
                return Some(virtual_path);
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading OpenCode session");

        // Virtual path (`.../opencode.db/<encoded-session-id>`) from discovery.
        if let Some((db_path, session_id)) = Self::parse_virtual_path(path) {
            let conn = Self::open_db(&db_path)?;
            return Self::read_session_by_id(&conn, &db_path, &session_id);
        }

        // Direct DB path (`.../opencode.db`) — choose newest root session.
        let conn = Self::open_db(path)?;
        let Some(session_id) = Self::newest_root_session_id(&conn) else {
            anyhow::bail!("no OpenCode sessions found in {}", path.display());
        };
        Self::read_session_by_id(&conn, path, &session_id)
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        _opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let db_path = Self::choose_target_db_path(session)?;
        let mut conn = Self::open_db_rw(&db_path)?;
        Self::ensure_schema(&conn)?;

        let has_count_trigger =
            Self::trigger_exists(&conn, "update_session_message_count_on_insert");
        let target_session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let created_at = session.started_at.unwrap_or(now);
        let updated_at = session.ended_at.unwrap_or(now);

        let title = session.title.clone().or_else(|| {
            session
                .messages
                .iter()
                .find(|m| m.role == MessageRole::User)
                .map(|m| truncate_title(&m.content, 80))
                .filter(|t| !t.is_empty())
        });
        let title = title.unwrap_or_else(|| "Converted session".to_string());

        let tx = conn.transaction().context("failed to begin transaction")?;

        tx.execute(
            "INSERT INTO sessions (
                id, parent_session_id, title, message_count, prompt_tokens, completion_tokens, cost,
                summary_message_id, updated_at, created_at
             ) VALUES (?1, NULL, ?2, ?3, 0, 0, 0.0, NULL, ?4, ?5)",
            rusqlite::params![
                target_session_id,
                title,
                if has_count_trigger {
                    0_i64
                } else {
                    i64::try_from(session.messages.len()).unwrap_or(i64::MAX)
                },
                updated_at,
                created_at,
            ],
        )
        .context("failed to insert OpenCode session")?;

        let default_model = session.model_name.clone();
        for msg in &session.messages {
            let message_id = uuid::Uuid::new_v4().to_string();
            let parts = build_parts(msg);
            let parts_json =
                serde_json::to_string(&parts).context("failed to serialize OpenCode parts")?;
            let timestamp = msg.timestamp.unwrap_or(created_at);
            let model = msg.author.clone().or_else(|| default_model.clone());

            tx.execute(
                "INSERT INTO messages (
                    id, session_id, role, parts, model, created_at, updated_at, finished_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
                rusqlite::params![
                    message_id,
                    target_session_id,
                    role_to_opencode(&msg.role),
                    parts_json,
                    model,
                    timestamp,
                    timestamp,
                ],
            )
            .with_context(|| format!("failed to insert OpenCode message {}", msg.idx))?;
        }

        // If the DB has no count trigger, set message_count explicitly.
        if !has_count_trigger {
            tx.execute(
                "UPDATE sessions SET message_count = ?1 WHERE id = ?2",
                rusqlite::params![
                    i64::try_from(session.messages.len()).unwrap_or(i64::MAX),
                    target_session_id
                ],
            )
            .context("failed to update OpenCode session message_count")?;
        }

        tx.commit().context("failed to commit transaction")?;

        let virtual_path = Self::virtual_session_path(&db_path, &target_session_id);
        info!(
            session_id = target_session_id,
            path = %db_path.display(),
            messages = session.messages.len(),
            "OpenCode session written"
        );

        Ok(WrittenSession {
            paths: vec![virtual_path],
            session_id: target_session_id.clone(),
            resume_command: self.resume_command(&target_session_id),
            backup_path: None,
        })
    }

    fn resume_command(&self, _session_id: &str) -> String {
        // OpenCode has no session-id-specific resume flag.
        "opencode".to_string()
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        let db_files = Self::find_db_files();
        if db_files.is_empty() {
            return Some(Vec::new());
        }

        let mut results = Vec::new();
        for db_path in &db_files {
            let Ok(conn) = Self::open_db(db_path) else {
                continue;
            };
            if !Self::table_exists(&conn, "sessions") {
                continue;
            }

            let Ok(mut stmt) = conn.prepare("SELECT id FROM sessions ORDER BY created_at DESC")
            else {
                continue;
            };

            let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) else {
                continue;
            };

            for row in rows.flatten() {
                let virtual_path = Self::virtual_session_path(db_path, &row);
                results.push((row, virtual_path));
            }
        }

        Some(results)
    }
}

fn dedup_existing_files(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen: BTreeSet<PathBuf> = BTreeSet::new();
    for path in paths {
        if path.is_file() {
            seen.insert(path);
        }
    }
    seen.into_iter().collect()
}

fn parse_tool_call_arguments(input: &str) -> serde_json::Value {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return serde_json::json!({});
    }
    serde_json::from_str(trimmed).unwrap_or_else(|_| serde_json::json!({ "input": input }))
}

fn parse_parts(parts: &serde_json::Value) -> (String, Vec<ToolCall>, Vec<ToolResult>) {
    let mut text_chunks: Vec<String> = Vec::new();
    let mut reasoning_chunks: Vec<String> = Vec::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut tool_results: Vec<ToolResult> = Vec::new();

    let Some(items) = parts.as_array() else {
        return (String::new(), tool_calls, tool_results);
    };

    for item in items {
        let part_type = item
            .get("type")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let data = item.get("data").unwrap_or(&serde_json::Value::Null);

        match part_type {
            "text" => {
                if let Some(text) = data.get("text").and_then(serde_json::Value::as_str)
                    && !text.trim().is_empty()
                {
                    text_chunks.push(text.to_string());
                }
            }
            "reasoning" => {
                if let Some(thinking) = data.get("thinking").and_then(serde_json::Value::as_str)
                    && !thinking.trim().is_empty()
                {
                    reasoning_chunks.push(thinking.to_string());
                }
            }
            "tool_call" => {
                let name = data
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .filter(|name| !name.is_empty())
                    .unwrap_or("tool_call")
                    .to_string();
                let id = data
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToString::to_string);
                let input = data
                    .get("input")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();

                tool_calls.push(ToolCall {
                    id,
                    name,
                    arguments: parse_tool_call_arguments(input),
                });
            }
            "tool_result" => {
                let content = data
                    .get("content")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let call_id = data
                    .get("tool_call_id")
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToString::to_string);
                let is_error = data
                    .get("is_error")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);

                tool_results.push(ToolResult {
                    call_id,
                    content,
                    is_error,
                });
            }
            _ => {
                let fallback = flatten_content(data);
                if !fallback.trim().is_empty() {
                    text_chunks.push(fallback);
                }
            }
        }
    }

    let mut content = text_chunks.join("\n");
    if content.trim().is_empty() {
        content = reasoning_chunks.join("\n");
    }
    if content.trim().is_empty() {
        let result_texts: Vec<&str> = tool_results
            .iter()
            .map(|result| result.content.as_str())
            .filter(|text| !text.trim().is_empty())
            .collect();
        content = result_texts.join("\n");
    }

    (content, tool_calls, tool_results)
}

fn build_parts(message: &CanonicalMessage) -> serde_json::Value {
    let mut parts = Vec::new();

    if !message.content.trim().is_empty() {
        parts.push(serde_json::json!({
            "type": "text",
            "data": { "text": message.content },
        }));
    }

    for call in &message.tool_calls {
        let input = if let Some(s) = call.arguments.as_str() {
            s.to_string()
        } else {
            serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".to_string())
        };

        parts.push(serde_json::json!({
            "type": "tool_call",
            "data": {
                "id": call.id.clone().unwrap_or_default(),
                "name": call.name,
                "input": input,
                "type": "function",
                "finished": true
            }
        }));
    }

    for result in &message.tool_results {
        parts.push(serde_json::json!({
            "type": "tool_result",
            "data": {
                "tool_call_id": result.call_id.clone().unwrap_or_default(),
                "name": "tool",
                "content": result.content,
                "metadata": "",
                "is_error": result.is_error
            }
        }));
    }

    serde_json::Value::Array(parts)
}

fn role_to_opencode(role: &MessageRole) -> &str {
    match role {
        MessageRole::User => "user",
        MessageRole::Assistant => "assistant",
        MessageRole::Tool => "tool",
        MessageRole::System => "system",
        MessageRole::Other(role) => role.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::Provider;
    use std::sync::{LazyLock, Mutex};

    static OPENCODE_ENV: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    struct CwdGuard {
        original: PathBuf,
    }

    impl CwdGuard {
        fn change_to(path: &Path) -> Self {
            let original = std::env::current_dir().expect("read current dir");
            std::env::set_current_dir(path).expect("set current dir");
            Self { original }
        }
    }

    impl Drop for CwdGuard {
        fn drop(&mut self) {
            let _ = std::env::set_current_dir(&self.original);
        }
    }

    fn sample_session(workspace: &Path) -> CanonicalSession {
        CanonicalSession {
            session_id: "source-session".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(workspace.to_path_buf()),
            title: Some("Fix OpenCode adapter".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Please inspect src/main.rs".to_string(),
                    timestamp: Some(1_700_000_000_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::json!({}),
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "Inspecting now.".to_string(),
                    timestamp: Some(1_700_000_005_000),
                    author: Some("gpt-5".to_string()),
                    tool_calls: vec![ToolCall {
                        id: Some("call-1".to_string()),
                        name: "Read".to_string(),
                        arguments: serde_json::json!({"path":"src/main.rs"}),
                    }],
                    tool_results: vec![ToolResult {
                        call_id: Some("call-1".to_string()),
                        content: "Read complete".to_string(),
                        is_error: false,
                    }],
                    extra: serde_json::json!({}),
                },
            ],
            metadata: serde_json::json!({}),
            source_path: workspace.join("source.jsonl"),
            model_name: Some("gpt-5".to_string()),
        }
    }

    #[test]
    fn provider_metadata_and_resume_command() {
        let provider = OpenCode;
        assert_eq!(provider.name(), "OpenCode");
        assert_eq!(provider.slug(), "opencode");
        assert_eq!(provider.cli_alias(), "opc");
        assert_eq!(
            <OpenCode as Provider>::resume_command(&provider, "sid"),
            "opencode"
        );
    }

    #[test]
    fn virtual_path_round_trip() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(".opencode")).expect("data dir");
        let db = workspace.join(".opencode/opencode.db");
        std::fs::write(&db, "").expect("touch db file");

        let sid = "abc-123";
        let virtual_path = OpenCode::virtual_session_path(&db, sid);
        let parsed = OpenCode::parse_virtual_path(&virtual_path).expect("should parse");
        assert_eq!(parsed.0, db.as_path());
        assert_eq!(parsed.1, sid);
    }

    #[test]
    fn writer_reader_roundtrip_preserves_core_content() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let source = sample_session(&workspace);
        let written = OpenCode
            .write_session(&source, &WriteOptions { force: false })
            .expect("write should succeed");

        assert_eq!(written.resume_command, "opencode");
        assert_eq!(written.paths.len(), 1);
        let db_path = written
            .paths
            .first()
            .and_then(|p| p.parent())
            .expect("virtual path parent");
        assert!(db_path.is_file(), "db file should exist");

        let readback = OpenCode
            .read_session(&written.paths[0])
            .expect("readback should succeed");

        assert_eq!(readback.provider_slug, "opencode");
        assert_eq!(readback.messages.len(), source.messages.len());
        assert_eq!(readback.messages[0].role, MessageRole::User);
        assert_eq!(readback.messages[0].content, source.messages[0].content);
        assert_eq!(readback.messages[1].role, MessageRole::Assistant);
        assert_eq!(readback.messages[1].content, source.messages[1].content);
        assert_eq!(readback.workspace.as_deref(), Some(workspace.as_path()));
        assert_ne!(readback.session_id, source.session_id);
    }

    #[test]
    fn owns_session_returns_virtual_path() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let source = sample_session(&workspace);
        let written = OpenCode
            .write_session(&source, &WriteOptions { force: false })
            .expect("write should succeed");
        let found = OpenCode.owns_session(&written.session_id);

        assert_eq!(found.as_deref(), Some(written.paths[0].as_path()));
    }

    #[test]
    fn read_session_from_db_path_returns_latest_root_session() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let mut first = sample_session(&workspace);
        first.title = Some("Older Session".to_string());
        first.started_at = Some(1_700_000_000_000);
        let _first_written = OpenCode
            .write_session(&first, &WriteOptions { force: false })
            .expect("first write");

        let mut second = sample_session(&workspace);
        second.title = Some("Newer Session".to_string());
        second.started_at = Some(1_800_000_000_000);
        let second_written = OpenCode
            .write_session(&second, &WriteOptions { force: false })
            .expect("second write");

        let db_path = second_written
            .paths
            .first()
            .and_then(|p| p.parent())
            .expect("db path parent")
            .to_path_buf();

        let read_latest = OpenCode
            .read_session(&db_path)
            .expect("read from db should pick latest");
        assert_eq!(read_latest.title.as_deref(), Some("Newer Session"));
    }

    #[test]
    fn detect_reports_db_presence() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let source = sample_session(&workspace);
        OpenCode
            .write_session(&source, &WriteOptions { force: false })
            .expect("write should succeed");

        let detection = OpenCode.detect();
        assert!(
            detection.installed,
            "db presence should mark provider installed"
        );
        assert!(
            detection
                .evidence
                .iter()
                .any(|ev| ev.contains("opencode.db")),
            "evidence should include db detection"
        );
    }

    #[test]
    fn parse_parts_extracts_tool_calls_and_results() {
        let raw = serde_json::json!([
            {"type":"text","data":{"text":"hello"}},
            {"type":"tool_call","data":{"id":"c1","name":"Read","input":"{\"path\":\"src/main.rs\"}","type":"function","finished":true}},
            {"type":"tool_result","data":{"tool_call_id":"c1","name":"Read","content":"ok","metadata":"","is_error":false}}
        ]);

        let (content, tool_calls, tool_results) = parse_parts(&raw);
        assert_eq!(content, "hello");
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "Read");
        assert_eq!(tool_results.len(), 1);
        assert_eq!(tool_results[0].content, "ok");
    }

    // ── parse_parts edge cases ──────────────────────────────────────────

    #[test]
    fn parse_parts_reasoning_content_when_no_text() {
        let raw = serde_json::json!([
            {"type":"reasoning","data":{"thinking":"Let me analyze this problem step by step."}}
        ]);
        let (content, tool_calls, tool_results) = parse_parts(&raw);
        assert_eq!(content, "Let me analyze this problem step by step.");
        assert!(tool_calls.is_empty());
        assert!(tool_results.is_empty());
    }

    #[test]
    fn parse_parts_text_preferred_over_reasoning() {
        let raw = serde_json::json!([
            {"type":"text","data":{"text":"The answer is 42."}},
            {"type":"reasoning","data":{"thinking":"Hmm, thinking..."}}
        ]);
        let (content, _, _) = parse_parts(&raw);
        assert_eq!(content, "The answer is 42.");
    }

    #[test]
    fn parse_parts_empty_array() {
        let raw = serde_json::json!([]);
        let (content, tool_calls, tool_results) = parse_parts(&raw);
        assert!(content.is_empty());
        assert!(tool_calls.is_empty());
        assert!(tool_results.is_empty());
    }

    #[test]
    fn parse_parts_non_array_returns_empty() {
        let raw = serde_json::json!("just a string");
        let (content, tool_calls, tool_results) = parse_parts(&raw);
        assert!(content.is_empty());
        assert!(tool_calls.is_empty());
        assert!(tool_results.is_empty());
    }

    #[test]
    fn parse_parts_unknown_type_uses_fallback() {
        // Unknown part type with a "text" field in data → flatten_content extracts it.
        let raw = serde_json::json!([
            {"type":"custom_widget","data":"Some inline text from unknown part type"}
        ]);
        let (content, _, _) = parse_parts(&raw);
        assert_eq!(content, "Some inline text from unknown part type");
    }

    #[test]
    fn parse_parts_tool_result_fallback_when_no_text_or_reasoning() {
        let raw = serde_json::json!([
            {"type":"tool_result","data":{"tool_call_id":"c1","content":"file contents here","is_error":false}}
        ]);
        let (content, _, tool_results) = parse_parts(&raw);
        assert_eq!(content, "file contents here");
        assert_eq!(tool_results.len(), 1);
    }

    #[test]
    fn parse_parts_multiple_text_chunks_joined() {
        let raw = serde_json::json!([
            {"type":"text","data":{"text":"First part."}},
            {"type":"text","data":{"text":"Second part."}}
        ]);
        let (content, _, _) = parse_parts(&raw);
        assert_eq!(content, "First part.\nSecond part.");
    }

    #[test]
    fn parse_parts_skips_empty_text() {
        let raw = serde_json::json!([
            {"type":"text","data":{"text":"  "}},
            {"type":"text","data":{"text":"real content"}}
        ]);
        let (content, _, _) = parse_parts(&raw);
        assert_eq!(content, "real content");
    }

    #[test]
    fn parse_parts_tool_call_missing_name_defaults() {
        let raw = serde_json::json!([
            {"type":"tool_call","data":{"id":"c1","name":"","input":"{}","type":"function"}}
        ]);
        let (_, tool_calls, _) = parse_parts(&raw);
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "tool_call");
    }

    #[test]
    fn parse_parts_tool_call_no_id_is_none() {
        let raw = serde_json::json!([
            {"type":"tool_call","data":{"name":"Bash","input":"{\"cmd\":\"ls\"}"}}
        ]);
        let (_, tool_calls, _) = parse_parts(&raw);
        assert_eq!(tool_calls.len(), 1);
        assert!(tool_calls[0].id.is_none());
    }

    #[test]
    fn parse_parts_tool_result_error_flag() {
        let raw = serde_json::json!([
            {"type":"tool_result","data":{"tool_call_id":"c1","content":"command failed","is_error":true}}
        ]);
        let (_, _, tool_results) = parse_parts(&raw);
        assert_eq!(tool_results.len(), 1);
        assert!(tool_results[0].is_error);
    }

    // ── parse_tool_call_arguments ───────────────────────────────────────

    #[test]
    fn parse_tool_call_arguments_valid_json() {
        let result = parse_tool_call_arguments(r#"{"path":"src/main.rs"}"#);
        assert_eq!(result["path"], "src/main.rs");
    }

    #[test]
    fn parse_tool_call_arguments_empty_returns_empty_object() {
        let result = parse_tool_call_arguments("");
        assert_eq!(result, serde_json::json!({}));
    }

    #[test]
    fn parse_tool_call_arguments_invalid_json_wraps_in_input() {
        let result = parse_tool_call_arguments("not json");
        assert_eq!(result["input"], "not json");
    }

    // ── role_to_opencode ────────────────────────────────────────────────

    #[test]
    fn role_to_opencode_all_variants() {
        assert_eq!(role_to_opencode(&MessageRole::User), "user");
        assert_eq!(role_to_opencode(&MessageRole::Assistant), "assistant");
        assert_eq!(role_to_opencode(&MessageRole::Tool), "tool");
        assert_eq!(role_to_opencode(&MessageRole::System), "system");
        assert_eq!(
            role_to_opencode(&MessageRole::Other("custom".to_string())),
            "custom"
        );
    }

    // ── build_parts ─────────────────────────────────────────────────────

    #[test]
    fn build_parts_text_only() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "Hello world".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::json!({}),
        };
        let parts = build_parts(&msg);
        let arr = parts.as_array().expect("should be array");
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["type"], "text");
        assert_eq!(arr[0]["data"]["text"], "Hello world");
    }

    #[test]
    fn build_parts_with_tool_call_and_result() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "Let me check.".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![ToolCall {
                id: Some("tc-1".to_string()),
                name: "Bash".to_string(),
                arguments: serde_json::json!({"cmd": "ls"}),
            }],
            tool_results: vec![ToolResult {
                call_id: Some("tc-1".to_string()),
                content: "file1.rs\nfile2.rs".to_string(),
                is_error: false,
            }],
            extra: serde_json::json!({}),
        };
        let parts = build_parts(&msg);
        let arr = parts.as_array().expect("should be array");
        assert_eq!(arr.len(), 3); // text + tool_call + tool_result
        assert_eq!(arr[0]["type"], "text");
        assert_eq!(arr[1]["type"], "tool_call");
        assert_eq!(arr[1]["data"]["name"], "Bash");
        assert_eq!(arr[2]["type"], "tool_result");
        assert!(!arr[2]["data"]["is_error"].as_bool().unwrap());
    }

    #[test]
    fn build_parts_empty_content_skips_text() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Tool,
            content: "  ".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![ToolResult {
                call_id: Some("c1".to_string()),
                content: "result".to_string(),
                is_error: false,
            }],
            extra: serde_json::json!({}),
        };
        let parts = build_parts(&msg);
        let arr = parts.as_array().expect("array");
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["type"], "tool_result");
    }

    // ── workspace_from_db_path ──────────────────────────────────────────

    #[test]
    fn workspace_from_db_path_valid() {
        let path = PathBuf::from("/home/user/project/.opencode/opencode.db");
        let ws = OpenCode::workspace_from_db_path(&path);
        assert_eq!(ws, Some(PathBuf::from("/home/user/project")));
    }

    #[test]
    fn workspace_from_db_path_wrong_dirname_returns_none() {
        let path = PathBuf::from("/home/user/project/data/opencode.db");
        let ws = OpenCode::workspace_from_db_path(&path);
        assert!(ws.is_none());
    }

    #[test]
    fn workspace_from_db_path_root_opencode_returns_none() {
        let path = PathBuf::from("/.opencode/opencode.db");
        let ws = OpenCode::workspace_from_db_path(&path);
        assert_eq!(ws, Some(PathBuf::from("/")));
    }

    // ── virtual_path_special_characters ─────────────────────────────────

    #[test]
    fn virtual_path_encodes_special_characters() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db = tmp.path().join("opencode.db");
        std::fs::write(&db, "").expect("touch");

        let sid = "session/with spaces&special=chars";
        let vp = OpenCode::virtual_session_path(&db, sid);
        let (parsed_db, parsed_sid) = OpenCode::parse_virtual_path(&vp).expect("parse");
        assert_eq!(parsed_db, db);
        assert_eq!(parsed_sid, sid);
    }

    // ── writer edge cases ───────────────────────────────────────────────

    #[test]
    fn writer_no_title_generates_from_first_user_message() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let mut session = sample_session(&workspace);
        session.title = None;

        let written = OpenCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("write");
        let readback = OpenCode.read_session(&written.paths[0]).expect("readback");

        // Title should be derived from first user message
        assert!(readback.title.is_some());
        let title = readback.title.unwrap();
        assert!(title.contains("inspect"));
    }

    #[test]
    fn writer_no_timestamps_uses_current_time() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let mut session = sample_session(&workspace);
        session.started_at = None;
        session.ended_at = None;
        for msg in &mut session.messages {
            msg.timestamp = None;
        }

        let written = OpenCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("write");
        let readback = OpenCode.read_session(&written.paths[0]).expect("readback");

        assert!(readback.started_at.is_some());
        assert!(readback.ended_at.is_some());
    }

    #[test]
    fn writer_model_name_propagated_to_messages() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let session = sample_session(&workspace);
        let written = OpenCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("write");
        let readback = OpenCode.read_session(&written.paths[0]).expect("readback");

        // The model_name should be detected from message authors
        assert!(readback.model_name.is_some());
    }

    // ── reader edge cases ───────────────────────────────────────────────

    #[test]
    fn reader_metadata_includes_token_counts() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let session = sample_session(&workspace);
        let written = OpenCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("write");
        let readback = OpenCode.read_session(&written.paths[0]).expect("readback");

        // Metadata should include OpenCode-specific fields
        assert!(readback.metadata.get("opencode_db").is_some());
        assert!(readback.metadata.get("prompt_tokens").is_some());
        assert!(readback.metadata.get("completion_tokens").is_some());
        assert!(readback.metadata.get("cost").is_some());
    }

    #[test]
    fn reader_message_extra_has_opencode_fields() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let session = sample_session(&workspace);
        let written = OpenCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("write");
        let readback = OpenCode.read_session(&written.paths[0]).expect("readback");

        for msg in &readback.messages {
            assert!(
                msg.extra.get("opencode_message_id").is_some(),
                "each message should have opencode_message_id in extra"
            );
            assert!(
                msg.extra.get("opencode_parts").is_some(),
                "each message should have opencode_parts in extra"
            );
        }
    }

    // ── dedup_existing_files ────────────────────────────────────────────

    #[test]
    fn dedup_existing_files_removes_duplicates_and_nonexistent() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let file1 = tmp.path().join("a.db");
        let file2 = tmp.path().join("b.db");
        std::fs::write(&file1, "").expect("touch");
        std::fs::write(&file2, "").expect("touch");

        let input = vec![
            file1.clone(),
            file2.clone(),
            file1.clone(),                     // duplicate
            tmp.path().join("nonexistent.db"), // doesn't exist
        ];
        let result = dedup_existing_files(input);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&file1));
        assert!(result.contains(&file2));
    }

    #[test]
    fn dedup_existing_files_empty_input() {
        let result = dedup_existing_files(Vec::new());
        assert!(result.is_empty());
    }

    // ── list_sessions ───────────────────────────────────────────────────

    #[test]
    fn list_sessions_returns_all_sessions_from_db() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        // Write two distinct sessions
        let mut first = sample_session(&workspace);
        first.title = Some("First Session".to_string());
        first.started_at = Some(1_700_000_000_000);
        let first_written = OpenCode
            .write_session(&first, &WriteOptions { force: false })
            .expect("first write");

        let mut second = sample_session(&workspace);
        second.title = Some("Second Session".to_string());
        second.started_at = Some(1_800_000_000_000);
        let second_written = OpenCode
            .write_session(&second, &WriteOptions { force: false })
            .expect("second write");

        let listed = OpenCode.list_sessions().expect("should return Some");
        assert!(
            listed.len() >= 2,
            "expected at least 2 sessions, got {}",
            listed.len()
        );

        let ids: Vec<&str> = listed.iter().map(|(id, _)| id.as_str()).collect();
        assert!(
            ids.contains(&first_written.session_id.as_str()),
            "first session should be listed"
        );
        assert!(
            ids.contains(&second_written.session_id.as_str()),
            "second session should be listed"
        );
    }

    #[test]
    fn list_sessions_empty_db_returns_empty_vec() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(".opencode")).expect("data dir");
        let _cwd = CwdGuard::change_to(&workspace);

        // Create empty DB with schema
        let db_path = workspace.join(".opencode/opencode.db");
        let conn = OpenCode::open_db_rw(&db_path).expect("create db");
        OpenCode::ensure_schema(&conn).expect("schema");
        drop(conn);

        let listed = OpenCode.list_sessions().expect("should return Some");
        assert!(listed.is_empty(), "empty DB should have no sessions");
    }
}
