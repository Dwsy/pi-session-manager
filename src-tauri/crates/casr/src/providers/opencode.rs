//! OpenCode provider — reads/writes sessions from SQLite `opencode.db`.
//!
//! OpenCode stores session state in a SQLite database named `opencode.db`.
//! Three on-disk schemas exist, and the reader detects which one a DB carries
//! by introspecting `sqlite_master` (issues #26, #30):
//!
//! - **Legacy (plural)** — the Go-era layout: `sessions`, `messages` (with a
//!   `parts` JSON column) and `files`. Read and written.
//! - **1.x (singular)** — the event-sourced layout: `session`, `message` and
//!   `part`, where each message/part row carries a `data` JSON blob. Read
//!   only; direct writes into a live 1.x DB are refused.
//! - **2.x** — the OpenCode 2 layout: `session_v2` plus a per-entry
//!   `session_message` log (`type`, app-owned `seq`, `data` JSON blob).
//!   Read only; direct writes into a live 2.x DB are refused.
//!
//! A DB migrated from 1.x to 2.x still carries the stale 1.x tables, so the
//! 2.x layout is probed first; otherwise such a DB would read as 1.x and
//! surface only the dead pre-migration sessions.
//!
//! A DB matching no schema fails loudly naming the missing tables and the
//! tables actually present, instead of reporting zero sessions.
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

/// Which on-disk layout an `opencode.db` carries (see module docs).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DbSchema {
    /// Go-era plural tables: `sessions` / `messages` (`parts` JSON column).
    Legacy,
    /// OpenCode 1.x singular tables: `session` / `message` / `part`, each
    /// message and part row carrying a `data` JSON blob.
    V1,
    /// OpenCode 2.x tables: `session_v2` plus the `session_message` entry
    /// log (`type` + `seq` columns, `data` JSON blob).
    V2,
}

impl DbSchema {
    /// Detection order. 2.x goes first because a DB migrated from 1.x keeps
    /// the stale 1.x tables alongside the live 2.x ones (issue #30).
    const DETECTION_ORDER: [Self; 3] = [Self::V2, Self::Legacy, Self::V1];

    /// Tables a DB must carry to be read as this schema.
    const fn required_tables(self) -> &'static [&'static str] {
        match self {
            Self::Legacy => &["sessions", "messages"],
            Self::V1 => &["session", "message", "part"],
            Self::V2 => &["session_v2", "session_message"],
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::Legacy => "legacy",
            Self::V1 => "1.x",
            Self::V2 => "2.x",
        }
    }

    /// Metadata tag stored in `session.metadata.opencode_schema`.
    const fn metadata_tag(self) -> &'static str {
        match self {
            Self::Legacy => "legacy",
            Self::V1 => "v1",
            Self::V2 => "v2",
        }
    }

    /// Whether casr may write into a DB carrying this schema. Only the
    /// legacy layout is plain row storage; 1.x and 2.x rows are projections
    /// of OpenCode's event log and must not be grafted behind its back.
    const fn writable(self) -> bool {
        matches!(self, Self::Legacy)
    }

    /// Why direct writes into this schema are refused (see [`Self::writable`]).
    const fn write_refusal_reason(self) -> &'static str {
        match self {
            Self::Legacy => "",
            Self::V1 => {
                "its session/message/part rows are projections of an event log, \
                 so rows inserted behind its back would not be picked up and would \
                 leave the DB with two disagreeing schemas"
            }
            Self::V2 => {
                "its session_message rows are a projection of OpenCode's event log \
                 (the seq column is assigned by OpenCode and session_v2 rows are \
                 bound to the project table), so rows inserted behind its back would \
                 be ignored or corrupt the projection"
            }
        }
    }
}

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

    /// Candidate DB paths derived from the XDG data directory.
    ///
    /// OpenCode 1.x stores its database under the XDG data home
    /// (`$XDG_DATA_HOME/opencode/opencode.db`, defaulting to
    /// `~/.local/share/opencode/opencode.db`). Users who redirect
    /// `XDG_DATA_HOME` per project otherwise get no discovery hit at all
    /// (issue #26).
    fn xdg_data_db_candidates(xdg_data_home: Option<&str>, home: Option<&Path>) -> Vec<PathBuf> {
        let mut candidates = Vec::new();
        if let Some(xdg) = xdg_data_home.map(str::trim).filter(|s| !s.is_empty()) {
            candidates.push(PathBuf::from(xdg).join("opencode").join(DB_FILENAME));
        }
        if let Some(home) = home {
            candidates.push(home.join(".local/share/opencode").join(DB_FILENAME));
        }
        candidates
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
        candidates.extend(Self::xdg_data_db_candidates(
            std::env::var("XDG_DATA_HOME").ok().as_deref(),
            dirs::home_dir().as_deref(),
        ));
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
            // Discovery builds its candidates from `current_dir()`, which
            // resolves symlinks (macOS spells `/var/...` cwds as
            // `/private/var/...`). Canonicalize so the DB this write creates
            // is the very path discovery will report; otherwise the same
            // session round-trips under two spellings that compare unequal.
            let workspace = workspace
                .canonicalize()
                .unwrap_or_else(|_| workspace.clone());
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

    /// List every table name in the DB, sorted (from `sqlite_master`).
    fn list_tables(conn: &Connection) -> Vec<String> {
        let Ok(mut stmt) =
            conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        else {
            return Vec::new();
        };
        let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) else {
            return Vec::new();
        };
        rows.flatten().collect()
    }

    /// Detect which OpenCode schema a DB carries by introspecting
    /// `sqlite_master`, or build a loud diagnostic naming the missing
    /// table(s) and the tables actually present.
    ///
    /// The silent-zero behavior this replaces was indistinguishable from
    /// "no sessions yet" (issue #26).
    fn detect_schema(conn: &Connection, db_path: &Path) -> anyhow::Result<DbSchema> {
        let missing_tables = |schema: DbSchema| -> Vec<&'static str> {
            schema
                .required_tables()
                .iter()
                .copied()
                .filter(|table| !Self::table_exists(conn, table))
                .collect()
        };

        let mut missing_by_schema = Vec::with_capacity(DbSchema::DETECTION_ORDER.len());
        for schema in DbSchema::DETECTION_ORDER {
            let missing = missing_tables(schema);
            if missing.is_empty() {
                return Ok(schema);
            }
            missing_by_schema.push((schema, missing));
        }

        // Closest schema for the diagnostic: the one with the most required
        // tables present, so a partial 1.x DB names its own missing tables
        // rather than the legacy ones. Ties fall to the legacy layout, so an
        // empty DB is reported against it.
        let present =
            |schema: DbSchema, missing: &[&str]| schema.required_tables().len() - missing.len();
        let (mut schema, mut missing) = missing_by_schema
            .iter()
            .find(|(schema, _)| *schema == DbSchema::Legacy)
            .cloned()
            .unwrap_or((DbSchema::Legacy, Vec::new()));
        for (candidate, candidate_missing) in missing_by_schema {
            if present(candidate, &candidate_missing) > present(schema, &missing) {
                schema = candidate;
                missing = candidate_missing;
            }
        }

        let found = Self::list_tables(conn);
        let found_desc = if found.is_empty() {
            "no tables at all".to_string()
        } else {
            format!("tables present: {}", found.join(", "))
        };

        anyhow::bail!(
            "OpenCode DB {} does not match any schema casr reads \
             (2.x session_v2/session_message, legacy plural sessions/messages, \
             or 1.x singular session/message/part); \
             closest is the {} schema, missing table(s): {}; {}",
            db_path.display(),
            schema.label(),
            missing.join(", "),
            found_desc,
        )
    }

    /// Refuse to write into a DB whose schema casr only reads (1.x / 2.x).
    ///
    /// Called on a read-only connection BEFORE any read-write open: opening a
    /// live WAL-mode DB read-write, even just to inspect it, can checkpoint
    /// its WAL into the main file on close, which is a write into a database
    /// OpenCode owns.
    fn refuse_read_only_schema(conn: &Connection, db_path: &Path) -> anyhow::Result<()> {
        if let Ok(schema) = Self::detect_schema(conn, db_path)
            && !schema.writable()
        {
            anyhow::bail!(
                "OpenCode DB {} uses the {} schema ({}): {}. casr can read it but does \
                 not write into it. Point OPENCODE_DB_PATH at a separate database, or \
                 use a different target provider.",
                db_path.display(),
                schema.label(),
                schema.required_tables().join("/"),
                schema.write_refusal_reason(),
            );
        }
        Ok(())
    }

    /// The schema diagnostic as a plain message, or `None` when readable.
    #[cfg(test)]
    fn schema_mismatch(conn: &Connection, db_path: &Path) -> Option<String> {
        Self::detect_schema(conn, db_path)
            .err()
            .map(|err| err.to_string())
    }

    /// Pull a column by name, tolerating columns absent in older or newer
    /// OpenCode 1.x revisions (returns `None` instead of failing the row).
    fn col<T: rusqlite::types::FromSql>(row: &rusqlite::Row<'_>, name: &str) -> Option<T> {
        let idx = row.as_ref().column_index(name).ok()?;
        row.get::<_, Option<T>>(idx).ok().flatten()
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

    fn session_exists(conn: &Connection, schema: DbSchema, session_id: &str) -> bool {
        let sql = match schema {
            DbSchema::Legacy => "SELECT 1 FROM sessions WHERE id = ?1 LIMIT 1",
            DbSchema::V1 => "SELECT 1 FROM session WHERE id = ?1 LIMIT 1",
            DbSchema::V2 => "SELECT 1 FROM session_v2 WHERE id = ?1 LIMIT 1",
        };
        conn.prepare(sql)
            .and_then(|mut stmt| stmt.exists(rusqlite::params![session_id]))
            .unwrap_or(false)
    }

    fn newest_root_session_id(conn: &Connection, schema: DbSchema) -> Option<String> {
        let sql = match schema {
            DbSchema::Legacy => {
                "SELECT id FROM sessions WHERE parent_session_id IS NULL \
                 ORDER BY created_at DESC LIMIT 1"
            }
            DbSchema::V1 => {
                "SELECT id FROM session WHERE parent_id IS NULL \
                 ORDER BY time_created DESC, id DESC LIMIT 1"
            }
            DbSchema::V2 => {
                "SELECT id FROM session_v2 WHERE parent_id IS NULL \
                 ORDER BY time_created DESC, id DESC LIMIT 1"
            }
        };
        conn.query_row(sql, [], |row| row.get(0)).ok()
    }

    /// All session ids in the DB, newest first.
    fn all_session_ids(conn: &Connection, schema: DbSchema) -> Vec<String> {
        let sql = match schema {
            DbSchema::Legacy => "SELECT id FROM sessions ORDER BY created_at DESC",
            DbSchema::V1 => "SELECT id FROM session ORDER BY time_created DESC, id DESC",
            DbSchema::V2 => "SELECT id FROM session_v2 ORDER BY time_created DESC, id DESC",
        };
        let Ok(mut stmt) = conn.prepare(sql) else {
            return Vec::new();
        };
        let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) else {
            return Vec::new();
        };
        rows.flatten().collect()
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
        match Self::detect_schema(conn, db_path)? {
            DbSchema::Legacy => Self::read_legacy_session(conn, db_path, session_id),
            DbSchema::V1 => Self::read_v1_session(conn, db_path, session_id),
            DbSchema::V2 => Self::read_v2_session(conn, db_path, session_id),
        }
    }

    /// Read a session from the OpenCode 2.x schema (`session_v2` +
    /// `session_message`).
    ///
    /// 2.x keeps one `session_message` row per transcript entry, ordered by
    /// the app-owned `seq` column, with the entry kind in a dedicated `type`
    /// column and everything else (the `Session.Message.*` payload minus
    /// `id`/`type`) in the `data` JSON blob. Ground truth: upstream
    /// `packages/core/src/session/sql.ts` (tables) and
    /// `packages/schema/src/session-message.ts` (payloads) on the `beta`
    /// branch; the per-type mapping mirrors what OpenCode itself replays to
    /// the model in `packages/core/src/session/runner/to-llm-message.ts`.
    ///
    /// | `type`                                                   | canonical                                          |
    /// |----------------------------------------------------------|----------------------------------------------------|
    /// | `user`                                                   | User: `text` plus `[file: …]` attachment markers    |
    /// | `assistant`                                              | Assistant: `content[]` text / reasoning / tool parts |
    /// | `system`                                                 | System: `text`                                     |
    /// | `synthetic`, `skill`                                     | Tool: injected context, not typed by the user       |
    /// | `shell`                                                  | Tool: the command and its captured output (background shells skipped) |
    /// | `compaction` (`status: completed`)                       | System: the checkpoint summary + recent context    |
    /// | `model-switched`, `agent-switched`, `location-switched`  | skipped (bookkeeping)                              |
    fn read_v2_session(
        conn: &Connection,
        db_path: &Path,
        session_id: &str,
    ) -> anyhow::Result<CanonicalSession> {
        let session_row = conn
            .query_row(
                "SELECT * FROM session_v2 WHERE id = ?1 LIMIT 1",
                rusqlite::params![session_id],
                |row| {
                    Ok(V2SessionRow {
                        title: Self::col(row, "title"),
                        directory: Self::col(row, "directory"),
                        parent_id: Self::col(row, "parent_id"),
                        fork_session_id: Self::col(row, "fork_session_id"),
                        project_id: Self::col(row, "project_id"),
                        workspace_id: Self::col(row, "workspace_id"),
                        slug: Self::col(row, "slug"),
                        version: Self::col(row, "version"),
                        agent: Self::col(row, "agent"),
                        model_json: Self::col(row, "model"),
                        cost: Self::col(row, "cost"),
                        tokens_input: Self::col(row, "tokens_input"),
                        tokens_output: Self::col(row, "tokens_output"),
                        tokens_reasoning: Self::col(row, "tokens_reasoning"),
                        tokens_cache_read: Self::col(row, "tokens_cache_read"),
                        tokens_cache_write: Self::col(row, "tokens_cache_write"),
                        time_created: Self::col(row, "time_created"),
                        time_updated: Self::col(row, "time_updated"),
                        time_archived: Self::col(row, "time_archived"),
                    })
                },
            )
            .with_context(|| {
                format!("session '{session_id}' not found in {}", db_path.display())
            })?;

        let mut started_at = session_row
            .time_created
            .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)));
        let mut ended_at = session_row
            .time_updated
            .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)))
            .or(started_at);
        let mut model_counts: HashMap<String, usize> = HashMap::new();
        let mut messages = Vec::new();

        let mut stmt = conn
            .prepare(
                "SELECT * FROM session_message WHERE session_id = ?1
                 ORDER BY seq ASC, id ASC",
            )
            .context("failed to prepare OpenCode 2.x message query")?;
        let rows = stmt.query_map(rusqlite::params![session_id], |row| {
            Ok((
                row.get::<_, String>("id")?,
                row.get::<_, String>("type")?,
                Self::col::<i64>(row, "seq"),
                Self::col::<i64>(row, "time_created"),
                Self::col::<String>(row, "data"),
            ))
        })?;

        for row in rows {
            let (message_id, message_type, seq, row_time_created, data_json) = row?;
            let mut data = data_json
                .as_deref()
                .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
                .unwrap_or_else(|| serde_json::json!({}));

            let timestamp = data
                .pointer("/time/created")
                .and_then(serde_json::Value::as_i64)
                .or(row_time_created)
                .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)));
            if let Some(ts) = timestamp {
                started_at = Some(started_at.map_or(ts, |current| current.min(ts)));
                ended_at = Some(ended_at.map_or(ts, |current| current.max(ts)));
            }
            if let Some(completed) = data
                .pointer("/time/completed")
                .and_then(serde_json::Value::as_i64)
                .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)))
            {
                ended_at = Some(ended_at.map_or(completed, |current| current.max(completed)));
            }

            let Some(turn) = map_v2_message(&message_type, &data) else {
                trace!(
                    message_id,
                    message_type, "skipping OpenCode 2.x bookkeeping or empty entry"
                );
                continue;
            };

            if turn.role == MessageRole::Assistant
                && let Some(model_id) = &turn.author
            {
                *model_counts.entry(model_id.clone()).or_insert(0) += 1;
            }

            // Attachment payloads are inline base64 (often megabytes); keep
            // the attachment structure in `extra` but not the bytes.
            strip_v2_attachment_payloads(&mut data);

            messages.push(CanonicalMessage {
                idx: 0,
                role: turn.role,
                content: turn.content,
                timestamp,
                author: turn.author,
                tool_calls: turn.tool_calls,
                tool_results: turn.tool_results,
                extra: serde_json::json!({
                    "opencode_message_id": message_id,
                    "opencode_message_type": message_type,
                    "opencode_seq": seq,
                    "opencode_message": data,
                }),
            });
        }

        reindex_messages(&mut messages);

        let title = session_row
            .title
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(ToString::to_string)
            .or_else(|| {
                messages
                    .iter()
                    .find(|m| m.role == MessageRole::User)
                    .map(|m| truncate_title(&m.content, 80))
                    .filter(|t| !t.is_empty())
            });

        let session_model = session_row
            .model_json
            .as_deref()
            .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
            .filter(serde_json::Value::is_object);
        let model_name = model_counts
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(name, _)| name)
            .or_else(|| {
                session_model
                    .as_ref()
                    .and_then(|model| model.get("id"))
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToString::to_string)
            });

        let workspace = session_row
            .directory
            .as_deref()
            .map(str::trim)
            .filter(|d| !d.is_empty())
            .map(PathBuf::from)
            .or_else(|| Self::workspace_from_db_path(db_path));

        Ok(CanonicalSession {
            session_id: session_id.to_string(),
            provider_slug: "opencode".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::json!({
                "opencode_db": db_path.display().to_string(),
                "opencode_schema": DbSchema::V2.metadata_tag(),
                "parent_session_id": session_row.parent_id,
                "fork_session_id": session_row.fork_session_id,
                "project_id": session_row.project_id,
                "workspace_id": session_row.workspace_id,
                "directory": session_row.directory,
                "slug": session_row.slug,
                "opencode_version": session_row.version,
                "agent": session_row.agent,
                "model": session_model,
                "prompt_tokens": session_row.tokens_input.unwrap_or(0),
                "completion_tokens": session_row.tokens_output.unwrap_or(0),
                "reasoning_tokens": session_row.tokens_reasoning.unwrap_or(0),
                "cache_read_tokens": session_row.tokens_cache_read.unwrap_or(0),
                "cache_write_tokens": session_row.tokens_cache_write.unwrap_or(0),
                "cost": session_row.cost.unwrap_or(0.0),
                "time_created": session_row.time_created,
                "time_updated": session_row.time_updated,
                "time_archived": session_row.time_archived,
            }),
            source_path: Self::virtual_session_path(db_path, session_id),
            model_name,
        })
    }

    /// Read a session from the OpenCode 1.x singular schema.
    ///
    /// `session` columns are pulled by name with tolerance for revisions that
    /// lack some of them; `message.data` / `part.data` are the JSON blobs
    /// OpenCode hydrates its `Message`/`Part` values from (ids and
    /// `session_id`/`message_id` live in dedicated columns, not in `data`).
    fn read_v1_session(
        conn: &Connection,
        db_path: &Path,
        session_id: &str,
    ) -> anyhow::Result<CanonicalSession> {
        let session_row = conn
            .query_row(
                "SELECT * FROM session WHERE id = ?1 LIMIT 1",
                rusqlite::params![session_id],
                |row| {
                    Ok(V1SessionRow {
                        title: Self::col(row, "title"),
                        directory: Self::col(row, "directory"),
                        parent_id: Self::col(row, "parent_id"),
                        time_created: Self::col(row, "time_created"),
                        time_updated: Self::col(row, "time_updated"),
                        cost: Self::col(row, "cost"),
                        tokens_input: Self::col(row, "tokens_input"),
                        tokens_output: Self::col(row, "tokens_output"),
                        tokens_reasoning: Self::col(row, "tokens_reasoning"),
                        slug: Self::col(row, "slug"),
                        version: Self::col(row, "version"),
                        project_id: Self::col(row, "project_id"),
                        model_json: Self::col(row, "model"),
                    })
                },
            )
            .with_context(|| {
                format!("session '{session_id}' not found in {}", db_path.display())
            })?;

        // Parts grouped by message id. Join through `message` rather than
        // relying on `part.session_id`, which older 1.x revisions lack.
        let mut parts_by_message: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
        {
            let mut stmt = conn
                .prepare(
                    "SELECT p.message_id, p.id, p.data FROM part p
                     JOIN message m ON m.id = p.message_id
                     WHERE m.session_id = ?1
                     ORDER BY p.message_id ASC, p.id ASC",
                )
                .context("failed to prepare OpenCode 1.x part query")?;
            let rows = stmt.query_map(rusqlite::params![session_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?;
            for row in rows {
                let (message_id, part_id, data_json) = row?;
                let mut part = data_json
                    .as_deref()
                    .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
                    .unwrap_or_else(|| serde_json::json!({}));
                if let Some(obj) = part.as_object_mut() {
                    obj.insert("id".to_string(), serde_json::Value::from(part_id));
                }
                parts_by_message.entry(message_id).or_default().push(part);
            }
        }

        let mut started_at = session_row
            .time_created
            .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)));
        let mut ended_at = session_row
            .time_updated
            .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)))
            .or(started_at);
        let mut model_counts: HashMap<String, usize> = HashMap::new();
        let mut messages = Vec::new();

        let mut stmt = conn
            .prepare(
                "SELECT * FROM message WHERE session_id = ?1
                 ORDER BY time_created ASC, id ASC",
            )
            .context("failed to prepare OpenCode 1.x message query")?;
        let rows = stmt.query_map(rusqlite::params![session_id], |row| {
            Ok((
                row.get::<_, String>("id")?,
                Self::col::<i64>(row, "time_created"),
                Self::col::<String>(row, "data"),
            ))
        })?;

        for row in rows {
            let (message_id, row_time_created, data_json) = row?;
            let info = data_json
                .as_deref()
                .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
                .unwrap_or_else(|| serde_json::json!({}));

            let role_raw = info
                .get("role")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown");
            let created_raw = info
                .pointer("/time/created")
                .and_then(serde_json::Value::as_i64)
                .or(row_time_created);
            let timestamp =
                created_raw.and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)));
            if let Some(ts) = timestamp {
                started_at = Some(started_at.map_or(ts, |current| current.min(ts)));
                ended_at = Some(ended_at.map_or(ts, |current| current.max(ts)));
            }
            if let Some(completed) = info
                .pointer("/time/completed")
                .and_then(serde_json::Value::as_i64)
                .and_then(|ts| parse_timestamp(&serde_json::Value::from(ts)))
            {
                ended_at = Some(ended_at.map_or(completed, |current| current.max(completed)));
            }

            // Assistant rows carry a flat `modelID`; user rows nest it under
            // `model.modelID`. Only assistant turns count toward the session
            // model, matching what actually produced the output.
            let model_id = info
                .get("modelID")
                .or_else(|| info.pointer("/model/modelID"))
                .and_then(serde_json::Value::as_str)
                .filter(|m| !m.is_empty())
                .map(ToString::to_string);
            if role_raw == "assistant"
                && let Some(model_name) = &model_id
            {
                *model_counts.entry(model_name.clone()).or_insert(0) += 1;
            }

            let raw_parts =
                serde_json::Value::Array(parts_by_message.remove(&message_id).unwrap_or_default());
            let (content, tool_calls, tool_results) = parse_v1_parts(&raw_parts);

            messages.push(CanonicalMessage {
                idx: 0,
                role: normalize_role(role_raw),
                content,
                timestamp,
                author: model_id,
                tool_calls,
                tool_results,
                extra: serde_json::json!({
                    "opencode_message_id": message_id,
                    "opencode_message": info,
                    "opencode_parts": raw_parts,
                }),
            });
        }

        reindex_messages(&mut messages);

        let title = session_row
            .title
            .filter(|t| !t.trim().is_empty())
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
            .map(|(name, _)| name)
            .or_else(|| {
                session_row
                    .model_json
                    .as_deref()
                    .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
                    .and_then(|model| {
                        model
                            .get("id")
                            .and_then(serde_json::Value::as_str)
                            .map(ToString::to_string)
                    })
            });

        let workspace = session_row
            .directory
            .as_deref()
            .map(str::trim)
            .filter(|d| !d.is_empty())
            .map(PathBuf::from)
            .or_else(|| Self::workspace_from_db_path(db_path));

        Ok(CanonicalSession {
            session_id: session_id.to_string(),
            provider_slug: "opencode".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::json!({
                "opencode_db": db_path.display().to_string(),
                "opencode_schema": DbSchema::V1.metadata_tag(),
                "parent_session_id": session_row.parent_id,
                "prompt_tokens": session_row.tokens_input.unwrap_or(0),
                "completion_tokens": session_row.tokens_output.unwrap_or(0),
                "reasoning_tokens": session_row.tokens_reasoning.unwrap_or(0),
                "cost": session_row.cost.unwrap_or(0.0),
                "directory": session_row.directory,
                "slug": session_row.slug,
                "opencode_version": session_row.version,
                "project_id": session_row.project_id,
            }),
            source_path: Self::virtual_session_path(db_path, session_id),
            model_name,
        })
    }

    /// Read a session from the legacy (plural) schema.
    fn read_legacy_session(
        conn: &Connection,
        db_path: &Path,
        session_id: &str,
    ) -> anyhow::Result<CanonicalSession> {
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
                "opencode_schema": DbSchema::Legacy.metadata_tag(),
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

            let schema = match Self::detect_schema(&conn, &db_path) {
                Ok(schema) => schema,
                Err(mismatch) => {
                    tracing::warn!("skipping unreadable OpenCode DB: {mismatch}");
                    continue;
                }
            };

            if Self::session_exists(&conn, schema, session_id) {
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
        // Fail loudly on a schema mismatch instead of reporting an empty DB.
        let schema = Self::detect_schema(&conn, path)?;
        let Some(session_id) = Self::newest_root_session_id(&conn, schema) else {
            anyhow::bail!("no OpenCode sessions found in {}", path.display());
        };
        Self::read_session_by_id(&conn, path, &session_id)
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let db_path = Self::choose_target_db_path(session)?;

        // Never graft the legacy plural tables into a live OpenCode 1.x or
        // 2.x DB (see `DbSchema::write_refusal_reason`). Probe with a
        // read-only connection so the refusal itself never touches the file.
        if db_path.is_file() {
            let probe = Self::open_db(&db_path)?;
            Self::refuse_read_only_schema(&probe, &db_path)?;
        }

        let mut conn = Self::open_db_rw(&db_path)?;
        Self::ensure_schema(&conn)?;

        let has_count_trigger =
            Self::trigger_exists(&conn, "update_session_message_count_on_insert");

        // Derive a STABLE target id from the source session so re-converting the
        // same session targets the same row (matching the clawdbot/cursor/pi_agent
        // idiom). This makes `--force` meaningful: without a stable id every run
        // would silently create an orphaned duplicate row, and with a colliding id
        // the INSERT would otherwise fail on the PRIMARY KEY. Fall back to a random
        // UUID only when the source has no id.
        let target_session_id = if session.session_id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            session.session_id.clone()
        };

        // Honor `--force`: if the target session already exists, either overwrite
        // it (delete-then-insert; `ON DELETE CASCADE` clears messages/files) or
        // return a clean conflict error, matching the cursor provider's behavior.
        if Self::session_exists(&conn, DbSchema::Legacy, &target_session_id) {
            if opts.force {
                // `ensure_schema` already enabled `PRAGMA foreign_keys = ON` on
                // this connection, so deleting the session cascades to messages
                // and files. Delete dependents explicitly too, in case the live
                // DB predates the FK constraint or has the pragma disabled.
                let _ = conn.execute(
                    "DELETE FROM files WHERE session_id = ?1",
                    rusqlite::params![target_session_id],
                );
                let _ = conn.execute(
                    "DELETE FROM messages WHERE session_id = ?1",
                    rusqlite::params![target_session_id],
                );
                conn.execute(
                    "DELETE FROM sessions WHERE id = ?1",
                    rusqlite::params![target_session_id],
                )
                .context("failed to delete existing OpenCode session for --force overwrite")?;
            } else {
                return Err(crate::error::CasrError::SessionConflict {
                    session_id: target_session_id,
                    existing_path: db_path,
                }
                .into());
            }
        }

        let now = jiff::Timestamp::now().as_millisecond();
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
            warnings: Vec::new(),
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
            let schema = match Self::detect_schema(&conn, db_path) {
                Ok(schema) => schema,
                Err(mismatch) => {
                    // Surface the mismatch instead of silently listing 0
                    // sessions (the default log filter shows warnings, so
                    // this is visible in plain `casr list` output).
                    tracing::warn!("skipping unreadable OpenCode DB: {mismatch}");
                    continue;
                }
            };

            for session_id in Self::all_session_ids(&conn, schema) {
                let virtual_path = Self::virtual_session_path(db_path, &session_id);
                results.push((session_id, virtual_path));
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

/// One row of the OpenCode 1.x `session` table, pulled by column name so
/// revisions that lack some columns still read.
#[derive(Debug)]
struct V1SessionRow {
    title: Option<String>,
    directory: Option<String>,
    parent_id: Option<String>,
    time_created: Option<i64>,
    time_updated: Option<i64>,
    cost: Option<f64>,
    tokens_input: Option<i64>,
    tokens_output: Option<i64>,
    tokens_reasoning: Option<i64>,
    slug: Option<String>,
    version: Option<String>,
    project_id: Option<String>,
    /// Raw JSON of the `model` column (`{"providerID":…,"modelID":…}` or
    /// `{"id":…}` depending on revision), if present.
    model_json: Option<String>,
}

/// Parse OpenCode 1.x part rows (the `part.data` JSON blobs, `id` grafted
/// in) into canonical content, tool calls and tool results.
///
/// 1.x parts are flat (`{type, …}`) rather than the legacy `{type, data}`
/// envelope, and the tool call and its result share one `tool` part whose
/// `state.status` is `pending` / `running` / `completed` / `error`:
///
/// - `text` → content (`ignored` parts are skipped)
/// - `reasoning` → content only when there is no text
/// - `tool` → a [`ToolCall`] (`callID`, `tool`, `state.input`) plus a
///   [`ToolResult`] once the state is `completed` (`state.output`) or
///   `error` (`state.error`, flagged as an error)
/// - `file` → a short `[file: …]` marker so attachments stay visible
/// - `step-start` / `step-finish` / `snapshot` / `patch` / `agent` and any
///   other bookkeeping part carry no conversational content and are skipped
fn parse_v1_parts(parts: &serde_json::Value) -> (String, Vec<ToolCall>, Vec<ToolResult>) {
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

        match part_type {
            "text" => {
                let ignored = item
                    .get("ignored")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);
                if ignored {
                    continue;
                }
                if let Some(text) = item.get("text").and_then(serde_json::Value::as_str)
                    && !text.trim().is_empty()
                {
                    text_chunks.push(text.to_string());
                }
            }
            "reasoning" => {
                if let Some(text) = item.get("text").and_then(serde_json::Value::as_str)
                    && !text.trim().is_empty()
                {
                    reasoning_chunks.push(text.to_string());
                }
            }
            "tool" => {
                let state = item.get("state").unwrap_or(&serde_json::Value::Null);
                let name = item
                    .get("tool")
                    .and_then(serde_json::Value::as_str)
                    .filter(|name| !name.is_empty())
                    .unwrap_or("tool")
                    .to_string();
                let call_id = item
                    .get("callID")
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToString::to_string);
                let arguments = match state.get("input") {
                    Some(serde_json::Value::String(raw)) => parse_tool_call_arguments(raw),
                    Some(serde_json::Value::Null) | None => serde_json::json!({}),
                    Some(other) => other.clone(),
                };
                tool_calls.push(ToolCall {
                    id: call_id.clone(),
                    name,
                    arguments,
                });

                let status = state
                    .get("status")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                match status {
                    "completed" => {
                        let content = state.get("output").map(flatten_content).unwrap_or_default();
                        tool_results.push(ToolResult {
                            call_id,
                            content,
                            is_error: false,
                        });
                    }
                    "error" => {
                        let content = state.get("error").map(flatten_content).unwrap_or_default();
                        tool_results.push(ToolResult {
                            call_id,
                            content,
                            is_error: true,
                        });
                    }
                    // `pending` / `running`: the call exists but has no result yet.
                    _ => {}
                }
            }
            "file" => {
                let label = item
                    .get("filename")
                    .or_else(|| item.get("url"))
                    .and_then(serde_json::Value::as_str)
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or("attachment");
                text_chunks.push(format!("[file: {label}]"));
            }
            _ => {}
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

/// One row of the OpenCode 2.x `session_v2` table, pulled by column name so
/// beta revisions that lack some columns still read.
#[derive(Debug)]
struct V2SessionRow {
    /// Nullable in 2.x (a fresh session has no title until one is generated).
    title: Option<String>,
    directory: Option<String>,
    parent_id: Option<String>,
    fork_session_id: Option<String>,
    project_id: Option<String>,
    workspace_id: Option<String>,
    slug: Option<String>,
    version: Option<String>,
    agent: Option<String>,
    /// Raw JSON of the `model` column: `{"providerID":…,"id":…,"variant"?:…}`.
    model_json: Option<String>,
    cost: Option<f64>,
    tokens_input: Option<i64>,
    tokens_output: Option<i64>,
    tokens_reasoning: Option<i64>,
    tokens_cache_read: Option<i64>,
    tokens_cache_write: Option<i64>,
    time_created: Option<i64>,
    time_updated: Option<i64>,
    time_archived: Option<i64>,
}

/// The canonical projection of one OpenCode 2.x `session_message` row.
#[derive(Debug)]
struct V2Turn {
    role: MessageRole,
    content: String,
    author: Option<String>,
    tool_calls: Vec<ToolCall>,
    tool_results: Vec<ToolResult>,
}

impl V2Turn {
    fn text(role: MessageRole, content: String) -> Self {
        Self {
            role,
            content,
            author: None,
            tool_calls: Vec::new(),
            tool_results: Vec::new(),
        }
    }

    fn is_empty(&self) -> bool {
        self.content.trim().is_empty() && self.tool_calls.is_empty() && self.tool_results.is_empty()
    }
}

/// Map one OpenCode 2.x `session_message` row (its `type` column and `data`
/// blob) onto a canonical turn, or `None` for bookkeeping rows and entries
/// with nothing to replay (see [`OpenCode::read_v2_session`] for the table).
fn map_v2_message(message_type: &str, data: &serde_json::Value) -> Option<V2Turn> {
    let text = |key: &str| {
        data.get(key)
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string()
    };

    let turn = match message_type {
        "user" => {
            let mut chunks: Vec<String> = Vec::new();
            let prompt = text("text");
            if !prompt.trim().is_empty() {
                chunks.push(prompt);
            }
            // Attachments are inline base64 in `files[]`; keep them visible
            // as short markers the way the 1.x reader does for file parts.
            for file in data
                .get("files")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
            {
                let label = file
                    .get("name")
                    .or_else(|| file.pointer("/source/uri"))
                    .or_else(|| file.get("mime"))
                    .and_then(serde_json::Value::as_str)
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or("attachment");
                chunks.push(format!("[file: {label}]"));
            }
            V2Turn::text(MessageRole::User, chunks.join("\n"))
        }
        "assistant" => {
            let (content, tool_calls, tool_results) =
                parse_v2_assistant_content(data.get("content").unwrap_or(&serde_json::Value::Null));
            V2Turn {
                role: MessageRole::Assistant,
                content,
                author: data
                    .pointer("/model/id")
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToString::to_string),
                tool_calls,
                tool_results,
            }
        }
        "system" => V2Turn::text(MessageRole::System, text("text")),
        // Injected context (shell-failure notices, background-shell results,
        // skill bodies): not typed by the user, not produced by the model.
        "synthetic" | "skill" => V2Turn::text(MessageRole::Tool, text("text")),
        "shell" => {
            // A background shell reaches the model once, through its
            // completion notice (a `synthetic` entry); OpenCode skips the
            // shell row itself, so keeping it would duplicate the output.
            if data
                .pointer("/metadata/background")
                .and_then(serde_json::Value::as_bool)
                == Some(true)
            {
                return None;
            }
            V2Turn::text(MessageRole::Tool, v2_shell_text(data))
        }
        "compaction" => {
            // `running` / `failed` checkpoints carry no usable summary;
            // OpenCode itself replays only completed ones.
            if data.get("status").and_then(serde_json::Value::as_str) != Some("completed") {
                return None;
            }
            V2Turn::text(MessageRole::System, v2_compaction_text(data))
        }
        "model-switched" | "agent-switched" | "location-switched" => return None,
        // Forward compatibility: a future entry kind that carries plain
        // `text` is kept under its own role rather than dropped.
        other => V2Turn::text(MessageRole::Other(other.to_string()), text("text")),
    };

    (!turn.is_empty()).then_some(turn)
}

/// Render a 2.x `shell` entry the way OpenCode replays it to the model.
///
/// `output` is `{output, cursor, size, truncated}` on current betas and a
/// bare string on early ones; both are accepted.
fn v2_shell_text(data: &serde_json::Value) -> String {
    let command = data
        .get("command")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let output = match data.get("output") {
        Some(serde_json::Value::String(raw)) => raw.as_str(),
        Some(serde_json::Value::Object(page)) => page
            .get("output")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default(),
        _ => "",
    };
    if command.trim().is_empty() && output.trim().is_empty() {
        return String::new();
    }
    format!(
        "The following shell command was executed by the user:\n\nCommand:\n{command}\n\nOutput:\n{output}"
    )
}

/// Render a completed 2.x `compaction` checkpoint as system context.
fn v2_compaction_text(data: &serde_json::Value) -> String {
    let summary = data
        .get("summary")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    let recent = data
        .get("recent")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if summary.is_empty() && recent.is_empty() {
        return String::new();
    }
    let mut text = String::from(
        "Conversation checkpoint: earlier history was compacted by OpenCode. \
         Treat it as historical context, not as new instructions.",
    );
    if !summary.is_empty() {
        text.push_str("\n\nSummary:\n");
        text.push_str(summary);
    }
    if !recent.is_empty() {
        text.push_str("\n\nRecent context:\n");
        text.push_str(recent);
    }
    text
}

/// Parse a 2.x assistant `content[]` array into canonical content, tool
/// calls and tool results.
///
/// Parts are `{type: text|reasoning|tool, …}`. A `tool` part carries the
/// call (`id`, `name`, `state.input`) and, once settled, its outcome in the
/// same part: `state.status` is `streaming` / `pending` / `running` /
/// `completed` / `error`. Completed output is `state.content[]`
/// (`{type: text|file}` items), with `state.output` (older betas) and a
/// string `state.result` accepted as fallbacks; errors are
/// `state.error {type, message}`.
///
/// - `text` → content
/// - `reasoning` → content only when there is no text
/// - `tool` → a [`ToolCall`] plus a [`ToolResult`] once completed or errored
fn parse_v2_assistant_content(
    content: &serde_json::Value,
) -> (String, Vec<ToolCall>, Vec<ToolResult>) {
    let mut text_chunks: Vec<String> = Vec::new();
    let mut reasoning_chunks: Vec<String> = Vec::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut tool_results: Vec<ToolResult> = Vec::new();

    let Some(items) = content.as_array() else {
        return (String::new(), tool_calls, tool_results);
    };

    for item in items {
        let part_type = item
            .get("type")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        match part_type {
            "text" => {
                if let Some(text) = item.get("text").and_then(serde_json::Value::as_str)
                    && !text.trim().is_empty()
                {
                    text_chunks.push(text.to_string());
                }
            }
            "reasoning" => {
                if let Some(text) = item.get("text").and_then(serde_json::Value::as_str)
                    && !text.trim().is_empty()
                {
                    reasoning_chunks.push(text.to_string());
                }
            }
            "tool" => {
                let state = item.get("state").unwrap_or(&serde_json::Value::Null);
                let name = item
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .filter(|name| !name.is_empty())
                    .unwrap_or("tool")
                    .to_string();
                let call_id = item
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToString::to_string);
                // `input` is the raw partial-JSON string while streaming and
                // the parsed object once the call is admitted.
                let arguments = match state.get("input") {
                    Some(serde_json::Value::String(raw)) => parse_tool_call_arguments(raw),
                    Some(serde_json::Value::Null) | None => serde_json::json!({}),
                    Some(other) => other.clone(),
                };
                tool_calls.push(ToolCall {
                    id: call_id.clone(),
                    name,
                    arguments,
                });

                let status = state
                    .get("status")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                match status {
                    "completed" => tool_results.push(ToolResult {
                        call_id,
                        content: render_v2_tool_output(state),
                        is_error: false,
                    }),
                    "error" => {
                        let mut content = v2_error_text(state.get("error"));
                        let output = render_v2_tool_output(state);
                        if !output.trim().is_empty() {
                            if !content.is_empty() {
                                content.push('\n');
                            }
                            content.push_str(&output);
                        }
                        tool_results.push(ToolResult {
                            call_id,
                            content,
                            is_error: true,
                        });
                    }
                    // `streaming` / `pending` / `running`: no outcome yet.
                    _ => {}
                }
            }
            _ => {}
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

/// Text of a settled 2.x tool state: `content[]` items (`text` → the text,
/// `file` → a `[file: …]` marker), else the older `output` string, else a
/// string `result`.
fn render_v2_tool_output(state: &serde_json::Value) -> String {
    let from_content: Vec<String> = state
        .get("content")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(
            |item| match item.get("type").and_then(serde_json::Value::as_str) {
                Some("text") => item
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .filter(|text| !text.trim().is_empty())
                    .map(ToString::to_string),
                Some("file") => Some(format!(
                    "[file: {}]",
                    item.get("name")
                        .or_else(|| item.get("uri"))
                        .and_then(serde_json::Value::as_str)
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or("attachment")
                )),
                _ => item
                    .as_str()
                    .filter(|text| !text.trim().is_empty())
                    .map(ToString::to_string),
            },
        )
        .collect();
    if !from_content.is_empty() {
        return from_content.join("\n");
    }
    if let Some(output) = state.get("output").and_then(serde_json::Value::as_str)
        && !output.trim().is_empty()
    {
        return output.to_string();
    }
    state
        .get("result")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Human-readable text of a 2.x structured error (`{type, message, status?}`),
/// tolerating a bare string.
fn v2_error_text(error: Option<&serde_json::Value>) -> String {
    match error {
        Some(serde_json::Value::String(message)) => message.clone(),
        Some(serde_json::Value::Object(fields)) => {
            let message = fields
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            let kind = fields
                .get("type")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            match (kind.is_empty(), message.is_empty()) {
                (false, false) => format!("{kind}: {message}"),
                (true, false) => message.to_string(),
                (false, true) => kind.to_string(),
                (true, true) => String::new(),
            }
        }
        _ => String::new(),
    }
}

/// Drop inline attachment bytes (`files[].data`, base64) from a 2.x user
/// payload before it is kept in `CanonicalMessage::extra`.
fn strip_v2_attachment_payloads(data: &mut serde_json::Value) {
    if let Some(files) = data
        .get_mut("files")
        .and_then(serde_json::Value::as_array_mut)
    {
        for file in files
            .iter_mut()
            .filter_map(serde_json::Value::as_object_mut)
        {
            if let Some(serde_json::Value::String(bytes)) = file.remove("data") {
                file.insert(
                    "data_omitted_bytes".to_string(),
                    serde_json::Value::from(bytes.len()),
                );
            }
        }
    }
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
        // The writer canonicalizes the workspace so the DB it creates is the
        // same file discovery reports; the round trip therefore preserves the
        // *directory*, not the byte spelling (macOS: `/var` vs `/private/var`).
        assert_eq!(
            readback
                .workspace
                .as_deref()
                .and_then(|w| w.canonicalize().ok()),
            workspace.canonicalize().ok(),
            "round trip should preserve the workspace directory"
        );
        // The target id is now derived stably from the source session id so that
        // re-conversion is idempotent and `--force` can overwrite in place.
        assert_eq!(readback.session_id, source.session_id);
    }

    /// Regression for #14: writing the same OpenCode session twice must fail
    /// without `--force` (clean SessionConflict, not a raw SQLite duplicate-key
    /// error) and succeed with `--force`, overwriting the existing row in place
    /// rather than orphaning a duplicate.
    #[test]
    fn write_twice_with_force_overwrites_in_place() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        let _cwd = CwdGuard::change_to(&workspace);

        let source = sample_session(&workspace);

        // First write succeeds.
        let first = OpenCode
            .write_session(&source, &WriteOptions { force: false })
            .expect("first write should succeed");
        let db_path = first.paths[0].parent().expect("db parent").to_path_buf();

        // Second write WITHOUT force must be a clean conflict, not a panic or a
        // raw "failed to insert OpenCode session" error.
        let conflict = OpenCode
            .write_session(&source, &WriteOptions { force: false })
            .expect_err("second write without --force should conflict");
        match conflict.downcast_ref::<crate::error::CasrError>() {
            Some(crate::error::CasrError::SessionConflict { session_id, .. }) => {
                assert_eq!(session_id, &source.session_id);
            }
            other => panic!("expected SessionConflict, got {other:?}"),
        }

        // Second write WITH force succeeds and overwrites in place.
        let second = OpenCode
            .write_session(&source, &WriteOptions { force: true })
            .expect("force write should succeed");

        // Same stable target id both times.
        assert_eq!(first.session_id, second.session_id);
        assert_eq!(second.session_id, source.session_id);

        // Exactly one session row and no orphaned/duplicated message rows.
        let conn = OpenCode::open_db(&db_path).expect("open db");
        let session_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
            .expect("count sessions");
        assert_eq!(session_count, 1, "force must overwrite, not duplicate");

        let message_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
            .expect("count messages");
        assert_eq!(
            message_count,
            source.messages.len() as i64,
            "messages from the prior write must be replaced, not accumulated"
        );

        // The overwritten session still reads back cleanly.
        let readback = OpenCode
            .read_session(&second.paths[0])
            .expect("readback after force overwrite");
        assert_eq!(readback.messages.len(), source.messages.len());
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

        // Distinct source ids so both land as separate root sessions in one DB
        // (target ids are now derived stably from the source session id).
        let mut first = sample_session(&workspace);
        first.session_id = "older-source".to_string();
        first.title = Some("Older Session".to_string());
        first.started_at = Some(1_700_000_000_000);
        let _first_written = OpenCode
            .write_session(&first, &WriteOptions { force: false })
            .expect("first write");

        let mut second = sample_session(&workspace);
        second.session_id = "newer-source".to_string();
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

        // Write two distinct sessions (distinct source ids → distinct rows)
        let mut first = sample_session(&workspace);
        first.session_id = "first-source".to_string();
        first.title = Some("First Session".to_string());
        first.started_at = Some(1_700_000_000_000);
        let first_written = OpenCode
            .write_session(&first, &WriteOptions { force: false })
            .expect("first write");

        let mut second = sample_session(&workspace);
        second.session_id = "second-source".to_string();
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

    // ── OpenCode 1.x schema (issue #26) ─────────────────────────────────

    const V1_SESSION_ID: &str = "ses_9f2c4d81bbfe3aQwErTyUiOp";
    const V1_OLDER_SESSION_ID: &str = "ses_0a1b2c3d4e5f6aOlDeRoNe";

    /// Build a fixture DB carrying the OpenCode 1.x singular, event-sourced
    /// schema (`session`/`message`/`part`, `data` JSON blobs — no plural
    /// tables), populated with a two-turn conversation plus an older session.
    fn create_v1_schema_db(db_path: &Path, directory: &Path) {
        let conn = Connection::open(db_path).expect("create fixture db");
        conn.execute_batch(
            r#"
CREATE TABLE session (
    id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, slug TEXT, directory TEXT,
    title TEXT, version TEXT, time_created INTEGER, time_updated INTEGER
);
CREATE TABLE message (
    id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT
);
CREATE TABLE part (
    id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER,
    time_updated INTEGER, data TEXT
);
CREATE TABLE event (id INTEGER PRIMARY KEY, type TEXT, payload TEXT);
"#,
        )
        .expect("create fixture schema");

        let dir = directory.display().to_string();
        conn.execute(
            "INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
             VALUES (?1, 'prj_1', NULL, 'live-session', ?2, 'live session', '1.18.23', 1700000000000, 1700000020000)",
            rusqlite::params![V1_SESSION_ID, dir],
        )
        .expect("insert session");
        conn.execute(
            "INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated)
             VALUES (?1, 'prj_1', NULL, 'older', ?2, 'older session', '1.18.23', 1600000000000, 1600000001000)",
            rusqlite::params![V1_OLDER_SESSION_ID, dir],
        )
        .expect("insert older session");

        let user_msg = serde_json::json!({
            "role": "user",
            "time": {"created": 1_700_000_001_000_i64},
            "agent": "build",
            "model": {"providerID": "anthropic", "modelID": "claude-sonnet-4"}
        });
        let assistant_msg = serde_json::json!({
            "role": "assistant",
            "time": {"created": 1_700_000_005_000_i64, "completed": 1_700_000_009_000_i64},
            "parentID": "msg_user1",
            "providerID": "anthropic",
            "modelID": "claude-sonnet-4",
            "mode": "build",
            "agent": "build",
            "path": {"cwd": dir, "root": dir},
            "cost": 0.01,
            "tokens": {"input": 10, "output": 20, "reasoning": 5, "cache": {"read": 0, "write": 0}}
        });
        conn.execute(
            "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?1, ?2, 1700000001000, 1700000001000, ?3)",
            rusqlite::params![
                "msg_user1",
                V1_SESSION_ID,
                serde_json::to_string(&user_msg).unwrap()
            ],
        )
        .expect("insert user message");
        conn.execute(
            "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?1, ?2, 1700000005000, 1700000009000, ?3)",
            rusqlite::params![
                "msg_asst1",
                V1_SESSION_ID,
                serde_json::to_string(&assistant_msg).unwrap()
            ],
        )
        .expect("insert assistant message");
        // The older session has one bare user message so it is a real session.
        conn.execute(
            "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?1, ?2, 1600000000000, 1600000000000, ?3)",
            rusqlite::params![
                "msg_old1",
                V1_OLDER_SESSION_ID,
                serde_json::to_string(&user_msg).unwrap()
            ],
        )
        .expect("insert older message");

        let parts: Vec<(&str, &str, serde_json::Value)> = vec![
            (
                "prt_u1",
                "msg_user1",
                serde_json::json!({"type": "text", "text": "Please inspect src/main.rs"}),
            ),
            (
                "prt_a1",
                "msg_asst1",
                serde_json::json!({"type": "step-start"}),
            ),
            (
                "prt_a2",
                "msg_asst1",
                serde_json::json!({"type": "reasoning", "text": "Need to read the file first.", "time": {"start": 1_700_000_005_000_i64, "end": 1_700_000_006_000_i64}}),
            ),
            (
                "prt_a3",
                "msg_asst1",
                serde_json::json!({
                    "type": "tool",
                    "callID": "call_1",
                    "tool": "read",
                    "state": {
                        "status": "completed",
                        "input": {"filePath": "src/main.rs"},
                        "output": "fn main() {}",
                        "title": "src/main.rs",
                        "metadata": {},
                        "time": {"start": 1_700_000_006_000_i64, "end": 1_700_000_007_000_i64}
                    }
                }),
            ),
            (
                "prt_a4",
                "msg_asst1",
                serde_json::json!({"type": "text", "text": "Inspecting now."}),
            ),
            (
                "prt_a5",
                "msg_asst1",
                serde_json::json!({"type": "step-finish", "cost": 0.01, "tokens": {"input": 10, "output": 20, "reasoning": 5, "cache": {"read": 0, "write": 0}}}),
            ),
            (
                "prt_o1",
                "msg_old1",
                serde_json::json!({"type": "text", "text": "older prompt"}),
            ),
        ];
        for (id, message_id, data) in parts {
            let session_id = if message_id == "msg_old1" {
                V1_OLDER_SESSION_ID
            } else {
                V1_SESSION_ID
            };
            conn.execute(
                "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?1, ?2, ?3, 1700000001000, 1700000001000, ?4)",
                rusqlite::params![id, message_id, session_id, serde_json::to_string(&data).unwrap()],
            )
            .expect("insert part");
        }
    }

    #[test]
    fn detect_schema_recognizes_1x_layout() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v1_schema_db(&db_path, tmp.path());
        let conn = OpenCode::open_db(&db_path).expect("open db");
        assert_eq!(
            OpenCode::detect_schema(&conn, &db_path).expect("1.x schema"),
            DbSchema::V1
        );
        assert_eq!(OpenCode::schema_mismatch(&conn, &db_path), None);
    }

    /// Regression for #26: a 1.x DB must actually be read — the id OpenCode
    /// itself prints for `opencode -s <id>` resolves to the conversation.
    #[test]
    fn read_session_by_virtual_path_on_1x_schema_reads_conversation() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        create_v1_schema_db(&db_path, &workspace);

        let virtual_path = OpenCode::virtual_session_path(&db_path, V1_SESSION_ID);
        let session = OpenCode
            .read_session(&virtual_path)
            .expect("1.x session must read");

        assert_eq!(session.session_id, V1_SESSION_ID);
        assert_eq!(session.provider_slug, "opencode");
        assert_eq!(session.title.as_deref(), Some("live session"));
        assert_eq!(session.workspace.as_deref(), Some(workspace.as_path()));
        assert_eq!(session.model_name.as_deref(), Some("claude-sonnet-4"));
        assert_eq!(session.started_at, Some(1_700_000_000_000));
        assert_eq!(session.ended_at, Some(1_700_000_020_000));
        assert_eq!(session.metadata["opencode_schema"], "v1");
        assert_eq!(session.metadata["prompt_tokens"], 0);
        assert_eq!(session.metadata["opencode_version"], "1.18.23");
        assert_eq!(session.source_path, virtual_path);

        assert_eq!(session.messages.len(), 2, "one user + one assistant turn");
        let user = &session.messages[0];
        assert_eq!(user.idx, 0);
        assert_eq!(user.role, MessageRole::User);
        assert_eq!(user.content, "Please inspect src/main.rs");
        assert_eq!(user.timestamp, Some(1_700_000_001_000));
        assert!(user.tool_calls.is_empty());

        let assistant = &session.messages[1];
        assert_eq!(assistant.idx, 1);
        assert_eq!(assistant.role, MessageRole::Assistant);
        assert_eq!(assistant.content, "Inspecting now.");
        assert_eq!(assistant.author.as_deref(), Some("claude-sonnet-4"));
        assert_eq!(assistant.timestamp, Some(1_700_000_005_000));
        assert_eq!(assistant.tool_calls.len(), 1);
        assert_eq!(assistant.tool_calls[0].name, "read");
        assert_eq!(assistant.tool_calls[0].id.as_deref(), Some("call_1"));
        assert_eq!(assistant.tool_calls[0].arguments["filePath"], "src/main.rs");
        assert_eq!(assistant.tool_results.len(), 1);
        assert_eq!(assistant.tool_results[0].call_id.as_deref(), Some("call_1"));
        assert_eq!(assistant.tool_results[0].content, "fn main() {}");
        assert!(!assistant.tool_results[0].is_error);
        assert_eq!(assistant.extra["opencode_message_id"], "msg_asst1");
        assert_eq!(
            assistant.extra["opencode_parts"].as_array().map(Vec::len),
            Some(5),
            "raw 1.x parts are preserved in extra"
        );
    }

    #[test]
    fn read_session_on_1x_db_path_picks_newest_root_session() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v1_schema_db(&db_path, tmp.path());

        let session = OpenCode
            .read_session(&db_path)
            .expect("direct db path must resolve to the newest root session");
        assert_eq!(session.session_id, V1_SESSION_ID);
    }

    #[test]
    fn read_session_on_1x_schema_unknown_id_fails_naming_session() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v1_schema_db(&db_path, tmp.path());

        let virtual_path = OpenCode::virtual_session_path(&db_path, "ses_missing");
        let err = OpenCode
            .read_session(&virtual_path)
            .expect_err("unknown id must fail");
        let msg = format!("{err:#}");
        assert!(msg.contains("ses_missing"), "got: {msg}");
    }

    #[test]
    fn list_sessions_on_1x_schema_lists_every_session_newest_first() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_v1_schema_db(&db_path, &workspace);
        let _cwd = CwdGuard::change_to(&workspace);

        let listed = OpenCode.list_sessions().expect("should return Some");
        let ids: Vec<&str> = listed.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, vec![V1_SESSION_ID, V1_OLDER_SESSION_ID]);
        for (id, path) in &listed {
            assert!(
                path.ends_with(urlencoding::encode(id).as_ref()),
                "virtual path {} must end with the session id",
                path.display()
            );
        }
    }

    #[test]
    fn write_session_into_1x_db_is_refused() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_v1_schema_db(&db_path, &workspace);
        let _cwd = CwdGuard::change_to(&workspace);

        let err = OpenCode
            .write_session(&sample_session(&workspace), &WriteOptions { force: false })
            .expect_err("writing into a live 1.x DB must be refused");
        let msg = format!("{err:#}");
        assert!(msg.contains("1.x"), "got: {msg}");

        // The refusal must happen before any schema is grafted on.
        let conn = OpenCode::open_db(&db_path).expect("open db");
        assert!(!OpenCode::table_exists(&conn, "sessions"));
        assert!(!OpenCode::table_exists(&conn, "messages"));
    }

    /// A DB that matches neither schema must produce a loud diagnostic naming
    /// the missing tables and the tables actually found — not a silent
    /// "0 sessions".
    #[test]
    fn read_session_on_partial_1x_schema_fails_loudly_naming_missing_tables() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let conn = Connection::open(&db_path).expect("create fixture db");
        conn.execute_batch(
            r#"
CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, time_created INTEGER);
CREATE TABLE event (id INTEGER PRIMARY KEY, type TEXT, payload TEXT);
INSERT INTO session (id, title, time_created) VALUES ('ses_partial', 'partial', 1700000000000);
"#,
        )
        .expect("populate fixture schema");
        drop(conn);

        let err = OpenCode
            .read_session(&db_path)
            .expect_err("partial schema must not read as an empty DB");
        let msg = format!("{err:#}");
        assert!(
            msg.contains("closest is the 1.x schema"),
            "error must identify the closest schema, got: {msg}"
        );
        assert!(
            msg.contains("missing table(s): message, part"),
            "error must name the missing 1.x tables, got: {msg}"
        );
        assert!(
            msg.contains("tables present: event, session"),
            "error must list the tables actually present, got: {msg}"
        );
        assert!(
            !msg.contains("no OpenCode sessions found"),
            "must not be misreported as an empty DB, got: {msg}"
        );

        let virtual_path = OpenCode::virtual_session_path(&db_path, "ses_partial");
        let err = OpenCode
            .read_session(&virtual_path)
            .expect_err("partial schema must fail loudly by virtual path too");
        assert!(format!("{err:#}").contains("missing table(s): message, part"));
    }

    #[test]
    fn read_session_on_empty_db_fails_naming_legacy_tables() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let conn = Connection::open(&db_path).expect("create fixture db");
        conn.execute_batch("CREATE TABLE unrelated (id INTEGER PRIMARY KEY);")
            .expect("populate fixture schema");
        drop(conn);

        let err = OpenCode
            .read_session(&db_path)
            .expect_err("unknown schema must fail loudly");
        let msg = format!("{err:#}");
        assert!(msg.contains("closest is the legacy schema"), "got: {msg}");
        assert!(
            msg.contains("missing table(s): sessions, messages"),
            "got: {msg}"
        );
    }

    // ── parse_v1_parts ──────────────────────────────────────────────────

    #[test]
    fn parse_v1_parts_tool_completed_yields_call_and_result() {
        let parts = serde_json::json!([
            {"type": "step-start"},
            {"type": "text", "text": "Reading."},
            {"type": "tool", "callID": "call_1", "tool": "bash",
             "state": {"status": "completed", "input": {"command": "ls"}, "output": "a\nb", "title": "ls"}},
            {"type": "step-finish", "cost": 0.0}
        ]);
        let (content, calls, results) = parse_v1_parts(&parts);
        assert_eq!(content, "Reading.");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "bash");
        assert_eq!(calls[0].id.as_deref(), Some("call_1"));
        assert_eq!(calls[0].arguments, serde_json::json!({"command": "ls"}));
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].call_id.as_deref(), Some("call_1"));
        assert_eq!(results[0].content, "a\nb");
        assert!(!results[0].is_error);
    }

    #[test]
    fn parse_v1_parts_tool_error_flags_result() {
        let parts = serde_json::json!([
            {"type": "tool", "callID": "call_2", "tool": "read",
             "state": {"status": "error", "input": {"filePath": "nope"}, "error": "file not found"}}
        ]);
        let (content, calls, results) = parse_v1_parts(&parts);
        assert_eq!(calls.len(), 1);
        assert_eq!(results.len(), 1);
        assert!(results[0].is_error);
        assert_eq!(results[0].content, "file not found");
        // No text or reasoning: content falls back to the tool result.
        assert_eq!(content, "file not found");
    }

    #[test]
    fn parse_v1_parts_pending_tool_has_call_but_no_result() {
        let parts = serde_json::json!([
            {"type": "tool", "callID": "call_3", "tool": "edit", "state": {"status": "pending"}},
            {"type": "tool", "callID": "call_4", "tool": "grep",
             "state": {"status": "running", "input": "{\"pattern\":\"x\"}"}}
        ]);
        let (content, calls, results) = parse_v1_parts(&parts);
        assert_eq!(content, "");
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].arguments, serde_json::json!({}));
        assert_eq!(calls[1].arguments, serde_json::json!({"pattern": "x"}));
        assert!(results.is_empty());
    }

    #[test]
    fn parse_v1_parts_reasoning_only_when_no_text_and_ignored_text_skipped() {
        let parts = serde_json::json!([
            {"type": "reasoning", "text": "thinking hard"},
            {"type": "text", "text": "hidden", "ignored": true}
        ]);
        let (content, calls, results) = parse_v1_parts(&parts);
        assert_eq!(content, "thinking hard");
        assert!(calls.is_empty());
        assert!(results.is_empty());

        let parts = serde_json::json!([
            {"type": "reasoning", "text": "thinking hard"},
            {"type": "text", "text": "visible"}
        ]);
        let (content, _, _) = parse_v1_parts(&parts);
        assert_eq!(content, "visible");
    }

    #[test]
    fn parse_v1_parts_file_marker_and_unknown_types() {
        let parts = serde_json::json!([
            {"type": "file", "mime": "image/png", "filename": "shot.png", "url": "data:..."},
            {"type": "snapshot", "snapshot": "abc"},
            {"type": "patch", "hash": "abc", "files": ["a.rs"]},
            {"type": "agent", "name": "build"},
            {"type": "text", "text": "see attached"}
        ]);
        let (content, calls, results) = parse_v1_parts(&parts);
        assert_eq!(content, "[file: shot.png]\nsee attached");
        assert!(calls.is_empty());
        assert!(results.is_empty());
    }

    #[test]
    fn parse_v1_parts_non_array_returns_empty() {
        let (content, calls, results) = parse_v1_parts(&serde_json::json!({"type": "text"}));
        assert!(content.is_empty());
        assert!(calls.is_empty());
        assert!(results.is_empty());
    }
    #[test]
    fn schema_mismatch_none_for_legacy_schema() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let conn = OpenCode::open_db_rw(&db_path).expect("create db");
        OpenCode::ensure_schema(&conn).expect("schema");
        assert_eq!(OpenCode::schema_mismatch(&conn, &db_path), None);
    }

    #[test]
    fn schema_mismatch_on_empty_db_reports_no_tables() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let conn = Connection::open(&db_path).expect("create empty db");
        let msg = OpenCode::schema_mismatch(&conn, &db_path).expect("empty db must mismatch");
        assert!(msg.contains("no tables at all"), "got: {msg}");
        assert!(
            msg.contains("closest is the legacy schema"),
            "empty db must be reported against the legacy schema: {msg}"
        );
        assert!(
            !msg.contains("closest is the 1.x schema"),
            "empty db is not a 1.x schema: {msg}"
        );
    }

    // ── XDG_DATA_HOME discovery (issue #26) ─────────────────────────────

    #[test]
    fn xdg_data_db_candidates_prefers_env_then_default() {
        let home = PathBuf::from("/home/user");
        let candidates =
            OpenCode::xdg_data_db_candidates(Some("/custom/data"), Some(home.as_path()));
        assert_eq!(
            candidates,
            vec![
                PathBuf::from("/custom/data/opencode/opencode.db"),
                PathBuf::from("/home/user/.local/share/opencode/opencode.db"),
            ]
        );
    }

    #[test]
    fn xdg_data_db_candidates_ignores_blank_env() {
        let home = PathBuf::from("/home/user");
        let candidates = OpenCode::xdg_data_db_candidates(Some("  "), Some(home.as_path()));
        assert_eq!(
            candidates,
            vec![PathBuf::from(
                "/home/user/.local/share/opencode/opencode.db"
            )]
        );
        assert!(OpenCode::xdg_data_db_candidates(None, None).is_empty());
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

    // ── OpenCode 2.x (session_v2 / session_message, issue #30) ───────────

    const V2_SESSION_ID: &str = "ses_2a7c9e4f1b3d5aLiVeTwO";
    const V2_OLDER_SESSION_ID: &str = "ses_1b6d8f3e2c4a6aOlDeRtWo";
    const V2_CHILD_SESSION_ID: &str = "ses_3c8e0a5f4d6b7aChIlDtWo";

    /// Create the OpenCode 2.x tables (columns per upstream
    /// `packages/core/src/session/sql.ts` on the `beta` branch).
    fn create_v2_tables(conn: &Connection) {
        conn.execute_batch(
            r#"
CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
CREATE TABLE session_v2 (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    workspace_id TEXT, parent_id TEXT, fork_session_id TEXT, fork_boundary TEXT,
    slug TEXT NOT NULL, directory TEXT NOT NULL, path TEXT, title TEXT, version TEXT NOT NULL,
    share_url TEXT, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
    summary_diffs TEXT, metadata TEXT,
    cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, tokens_cache_read INTEGER NOT NULL DEFAULT 0,
    tokens_cache_write INTEGER NOT NULL DEFAULT 0,
    revert TEXT, permission TEXT, agent TEXT, model TEXT,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
    time_idle INTEGER, time_viewed INTEGER, idle_outcome TEXT, time_compacting INTEGER,
    time_archived INTEGER, time_suspended INTEGER, resume_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE session_message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES session_v2(id) ON DELETE CASCADE,
    type TEXT NOT NULL, seq INTEGER NOT NULL,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
    data TEXT NOT NULL
);
CREATE UNIQUE INDEX session_message_session_seq_idx ON session_message (session_id, seq);
INSERT INTO project (id, worktree, name) VALUES ('prj_2', '/work', 'work');
"#,
        )
        .expect("create 2.x fixture schema");
    }

    fn insert_v2_session(
        conn: &Connection,
        id: &str,
        parent_id: Option<&str>,
        title: Option<&str>,
        directory: &str,
        created: i64,
        updated: i64,
    ) {
        conn.execute(
            "INSERT INTO session_v2 (id, project_id, parent_id, slug, directory, title, version,
                agent, model, cost, tokens_input, tokens_output, tokens_reasoning,
                tokens_cache_read, tokens_cache_write, time_created, time_updated)
             VALUES (?1, 'prj_2', ?2, ?3, ?4, ?5, '2.0.0-beta.19187', 'build',
                '{\"providerID\":\"anthropic\",\"id\":\"claude-sonnet-4\",\"variant\":\"max\"}',
                0.42, 1200, 340, 55, 900, 100, ?6, ?7)",
            rusqlite::params![
                id,
                parent_id,
                format!("slug-{id}"),
                directory,
                title,
                created,
                updated
            ],
        )
        .expect("insert session_v2 row");
    }

    fn insert_v2_message(
        conn: &Connection,
        session_id: &str,
        id: &str,
        message_type: &str,
        seq: i64,
        time_created: i64,
        data: &serde_json::Value,
    ) {
        conn.execute(
            "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
            rusqlite::params![
                id,
                session_id,
                message_type,
                seq,
                time_created,
                serde_json::to_string(data).unwrap()
            ],
        )
        .expect("insert session_message row");
    }

    /// The live 2.x transcript used by the fixture: one row per entry kind
    /// OpenCode 2 writes, in `seq` order. Payload shapes follow upstream
    /// `packages/schema/src/session-message.ts` (`beta` branch).
    fn v2_transcript_rows(directory: &str) -> Vec<(&'static str, &'static str, serde_json::Value)> {
        vec![
            (
                "msg_v2_agent",
                "agent-switched",
                serde_json::json!({"agent": "build", "time": {"created": 1_700_000_000_500_i64}}),
            ),
            (
                "msg_v2_model",
                "model-switched",
                serde_json::json!({
                    "model": {"providerID": "anthropic", "id": "claude-sonnet-4", "variant": "max"},
                    "time": {"created": 1_700_000_000_600_i64}
                }),
            ),
            (
                "msg_v2_user1",
                "user",
                serde_json::json!({
                    "text": "Please inspect src/main.rs",
                    "files": [{
                        "data": "QUJDREVGR0g=",
                        "mime": "image/png",
                        "source": {"type": "inline"},
                        "name": "screenshot.png"
                    }],
                    "time": {"created": 1_700_000_001_000_i64}
                }),
            ),
            (
                "msg_v2_asst1",
                "assistant",
                serde_json::json!({
                    "agent": "build",
                    "model": {"providerID": "anthropic", "id": "claude-sonnet-4", "variant": "max"},
                    "content": [
                        {"type": "reasoning", "text": "Need to read the file first."},
                        {
                            "type": "tool",
                            "id": "call_v2_1",
                            "name": "read",
                            "executed": true,
                            "state": {
                                "status": "completed",
                                "input": {"filePath": "src/main.rs"},
                                "content": [{"type": "text", "text": "fn main() {}"}],
                                "metadata": {}
                            },
                            "time": {"created": 1_700_000_005_500_i64, "completed": 1_700_000_006_000_i64}
                        },
                        {
                            "type": "tool",
                            "id": "call_v2_2",
                            "name": "bash",
                            "executed": true,
                            "state": {
                                "status": "error",
                                "input": {"command": "cat missing.txt"},
                                "error": {"type": "Tool.Error", "message": "cat: missing.txt: No such file"}
                            },
                            "time": {"created": 1_700_000_006_100_i64, "completed": 1_700_000_006_500_i64}
                        },
                        {"type": "text", "text": "Inspecting now."}
                    ],
                    "cost": 0.01,
                    "tokens": {"input": 10, "output": 20, "reasoning": 5, "cache": {"read": 0, "write": 0}},
                    "time": {"created": 1_700_000_005_000_i64, "completed": 1_700_000_009_000_i64}
                }),
            ),
            (
                "msg_v2_shell",
                "shell",
                serde_json::json!({
                    "shellID": "sh_1",
                    "command": "ls src",
                    "status": "exited",
                    "exit": 0,
                    "output": {"output": "main.rs\nlib.rs", "cursor": 14, "size": 14, "truncated": false},
                    "time": {"created": 1_700_000_010_000_i64, "completed": 1_700_000_010_200_i64}
                }),
            ),
            (
                "msg_v2_synth",
                "synthetic",
                serde_json::json!({
                    "text": "User shell command failed to start:\nfrobnicate\n\ncommand not found",
                    "description": "frobnicate",
                    "metadata": {"source": "shell", "state": "error"},
                    "time": {"created": 1_700_000_011_000_i64}
                }),
            ),
            (
                "msg_v2_location",
                "location-switched",
                serde_json::json!({
                    "location": {"directory": directory},
                    "time": {"created": 1_700_000_011_500_i64}
                }),
            ),
            (
                "msg_v2_system",
                "system",
                serde_json::json!({
                    "text": "AGENTS.md changed: run cargo fmt before committing.",
                    "description": "instructions updated",
                    "time": {"created": 1_700_000_012_000_i64}
                }),
            ),
            (
                "msg_v2_compact_running",
                "compaction",
                serde_json::json!({
                    "status": "running",
                    "reason": "auto",
                    "summary": "",
                    "recent": "",
                    "time": {"created": 1_700_000_012_500_i64}
                }),
            ),
            (
                "msg_v2_compact",
                "compaction",
                serde_json::json!({
                    "status": "completed",
                    "reason": "auto",
                    "summary": "We inspected src/main.rs and found an empty main.",
                    "recent": "User asked to inspect src/main.rs.",
                    "time": {"created": 1_700_000_013_000_i64}
                }),
            ),
            (
                "msg_v2_user2",
                "user",
                serde_json::json!({
                    "text": "Now add a hello world.",
                    "time": {"created": 1_700_000_014_000_i64}
                }),
            ),
            (
                "msg_v2_asst2",
                "assistant",
                serde_json::json!({
                    "agent": "build",
                    "model": {"providerID": "openai", "id": "gpt-5", "variant": "high"},
                    "content": [
                        {
                            "type": "tool",
                            "id": "call_v2_3",
                            "name": "edit",
                            "state": {"status": "running", "input": {"filePath": "src/main.rs"}, "metadata": {}},
                            "time": {"created": 1_700_000_015_500_i64}
                        }
                    ],
                    "time": {"created": 1_700_000_015_000_i64}
                }),
            ),
        ]
    }

    /// Build a fixture DB carrying ONLY the OpenCode 2.x schema
    /// (`session_v2` + `session_message`), populated with a live session, an
    /// older root session, and a child (sub-agent) session.
    fn create_v2_schema_db(db_path: &Path, directory: &Path) {
        let conn = Connection::open(db_path).expect("create fixture db");
        create_v2_tables(&conn);
        populate_v2_sessions(&conn, directory);
    }

    fn populate_v2_sessions(conn: &Connection, directory: &Path) {
        let dir = directory.display().to_string();
        insert_v2_session(
            conn,
            V2_SESSION_ID,
            None,
            Some("live 2.x session"),
            &dir,
            1_700_000_000_000,
            1_700_000_020_000,
        );
        insert_v2_session(
            conn,
            V2_OLDER_SESSION_ID,
            None,
            None,
            &dir,
            1_600_000_000_000,
            1_600_000_001_000,
        );
        insert_v2_session(
            conn,
            V2_CHILD_SESSION_ID,
            Some(V2_SESSION_ID),
            Some("child"),
            &dir,
            1_700_000_030_000,
            1_700_000_031_000,
        );

        for (seq, (id, message_type, data)) in v2_transcript_rows(&dir).into_iter().enumerate() {
            let created = data
                .pointer("/time/created")
                .and_then(serde_json::Value::as_i64)
                .unwrap();
            insert_v2_message(
                conn,
                V2_SESSION_ID,
                id,
                message_type,
                i64::try_from(seq).unwrap() + 1,
                created,
                &data,
            );
        }
        insert_v2_message(
            conn,
            V2_OLDER_SESSION_ID,
            "msg_v2_old1",
            "user",
            1,
            1_600_000_000_000,
            &serde_json::json!({"text": "older 2.x prompt", "time": {"created": 1_600_000_000_000_i64}}),
        );
        insert_v2_message(
            conn,
            V2_CHILD_SESSION_ID,
            "msg_v2_child1",
            "user",
            1,
            1_700_000_030_000,
            &serde_json::json!({"text": "child prompt", "time": {"created": 1_700_000_030_000_i64}}),
        );
    }

    /// Build a fixture DB as OpenCode 2 leaves it after migrating a 1.x DB:
    /// the stale 1.x `session`/`message`/`part` tables are still present
    /// (with their pre-migration sessions) next to the live 2.x tables.
    fn create_migrated_v1_v2_db(db_path: &Path, directory: &Path) {
        create_v1_schema_db(db_path, directory);
        let conn = Connection::open(db_path).expect("open fixture db");
        create_v2_tables(&conn);
        populate_v2_sessions(&conn, directory);
    }

    #[test]
    fn detect_schema_recognizes_2x_layout() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v2_schema_db(&db_path, tmp.path());
        let conn = OpenCode::open_db(&db_path).expect("open db");
        assert_eq!(
            OpenCode::detect_schema(&conn, &db_path).expect("2.x schema must be detected"),
            DbSchema::V2
        );
        assert!(!DbSchema::V2.writable());
    }

    #[test]
    fn detect_schema_prefers_2x_over_stale_1x_tables_in_migrated_db() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_migrated_v1_v2_db(&db_path, tmp.path());
        let conn = OpenCode::open_db(&db_path).expect("open db");

        assert!(OpenCode::table_exists(&conn, "session"), "fixture premise");
        assert!(OpenCode::table_exists(&conn, "part"), "fixture premise");
        assert_eq!(
            OpenCode::detect_schema(&conn, &db_path).expect("migrated DB must read"),
            DbSchema::V2,
            "a migrated DB must be read through the live 2.x tables"
        );

        // Listing and the newest-root lookup go through the 2.x tables too,
        // so the dead pre-migration sessions never surface.
        let ids = OpenCode::all_session_ids(&conn, DbSchema::V2);
        assert!(ids.contains(&V2_SESSION_ID.to_string()));
        assert!(!ids.contains(&V1_SESSION_ID.to_string()));
        assert_eq!(
            OpenCode::newest_root_session_id(&conn, DbSchema::V2).as_deref(),
            Some(V2_SESSION_ID)
        );
    }

    #[test]
    fn detect_schema_diagnostic_names_2x_when_only_session_v2_present() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let conn = Connection::open(&db_path).expect("create fixture db");
        conn.execute_batch("CREATE TABLE session_v2 (id TEXT PRIMARY KEY, title TEXT);")
            .expect("populate fixture schema");
        let msg = OpenCode::schema_mismatch(&conn, &db_path).expect("partial 2.x must mismatch");
        assert!(msg.contains("closest is the 2.x schema"), "got: {msg}");
        assert!(
            msg.contains("missing table(s): session_message"),
            "got: {msg}"
        );
    }

    #[test]
    fn read_session_by_virtual_path_on_2x_schema_maps_every_entry_kind() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace dir");
        create_v2_schema_db(&db_path, &workspace);

        let virtual_path = OpenCode::virtual_session_path(&db_path, V2_SESSION_ID);
        let session = OpenCode
            .read_session(&virtual_path)
            .expect("2.x session must read");

        assert_eq!(session.session_id, V2_SESSION_ID);
        assert_eq!(session.provider_slug, "opencode");
        assert_eq!(session.title.as_deref(), Some("live 2.x session"));
        assert_eq!(session.workspace.as_deref(), Some(workspace.as_path()));
        assert_eq!(session.started_at, Some(1_700_000_000_000));
        assert_eq!(session.ended_at, Some(1_700_000_020_000));
        assert_eq!(session.source_path, virtual_path);
        // Two assistant turns on different models; the session model is the
        // one that produced the most assistant turns, ties broken arbitrarily
        // — here they tie, so accept either but require one of the two.
        let model = session.model_name.as_deref().expect("model name");
        assert!(matches!(model, "claude-sonnet-4" | "gpt-5"), "got {model}");

        let meta = &session.metadata;
        assert_eq!(meta["opencode_schema"], "v2");
        assert_eq!(meta["opencode_version"], "2.0.0-beta.19187");
        assert_eq!(meta["project_id"], "prj_2");
        assert_eq!(meta["slug"], format!("slug-{V2_SESSION_ID}"));
        assert_eq!(meta["agent"], "build");
        assert_eq!(meta["model"]["providerID"], "anthropic");
        assert_eq!(meta["model"]["id"], "claude-sonnet-4");
        assert_eq!(meta["model"]["variant"], "max");
        assert_eq!(meta["prompt_tokens"], 1200);
        assert_eq!(meta["completion_tokens"], 340);
        assert_eq!(meta["reasoning_tokens"], 55);
        assert_eq!(meta["cache_read_tokens"], 900);
        assert_eq!(meta["cache_write_tokens"], 100);
        assert_eq!(meta["cost"], 0.42);
        assert_eq!(meta["time_created"], 1_700_000_000_000_i64);
        assert_eq!(meta["time_updated"], 1_700_000_020_000_i64);
        assert!(meta["time_archived"].is_null());
        assert!(meta["parent_session_id"].is_null());

        // Bookkeeping rows (agent/model/location-switched) and the running
        // compaction are skipped; everything else maps in `seq` order.
        let roles: Vec<(&MessageRole, &str)> = session
            .messages
            .iter()
            .map(|m| (&m.role, m.extra["opencode_message_type"].as_str().unwrap()))
            .collect();
        assert_eq!(
            roles,
            vec![
                (&MessageRole::User, "user"),
                (&MessageRole::Assistant, "assistant"),
                (&MessageRole::Tool, "shell"),
                (&MessageRole::Tool, "synthetic"),
                (&MessageRole::System, "system"),
                (&MessageRole::System, "compaction"),
                (&MessageRole::User, "user"),
                (&MessageRole::Assistant, "assistant"),
            ]
        );
        for (i, m) in session.messages.iter().enumerate() {
            assert_eq!(m.idx, i);
        }

        let user = &session.messages[0];
        assert_eq!(
            user.content,
            "Please inspect src/main.rs\n[file: screenshot.png]"
        );
        assert_eq!(user.timestamp, Some(1_700_000_001_000));
        assert_eq!(user.extra["opencode_message_id"], "msg_v2_user1");
        assert_eq!(user.extra["opencode_seq"], 3);
        assert!(
            user.extra["opencode_message"]["files"][0]
                .get("data")
                .is_none(),
            "inline attachment bytes must not be duplicated into extra"
        );
        assert_eq!(
            user.extra["opencode_message"]["files"][0]["data_omitted_bytes"],
            12
        );
        assert_eq!(
            user.extra["opencode_message"]["files"][0]["name"],
            "screenshot.png"
        );

        let assistant = &session.messages[1];
        assert_eq!(assistant.content, "Inspecting now.");
        assert_eq!(assistant.author.as_deref(), Some("claude-sonnet-4"));
        assert_eq!(assistant.timestamp, Some(1_700_000_005_000));
        assert_eq!(assistant.tool_calls.len(), 2);
        assert_eq!(assistant.tool_calls[0].id.as_deref(), Some("call_v2_1"));
        assert_eq!(assistant.tool_calls[0].name, "read");
        assert_eq!(assistant.tool_calls[0].arguments["filePath"], "src/main.rs");
        assert_eq!(assistant.tool_calls[1].id.as_deref(), Some("call_v2_2"));
        assert_eq!(assistant.tool_calls[1].name, "bash");
        assert_eq!(assistant.tool_results.len(), 2);
        assert_eq!(
            assistant.tool_results[0].call_id.as_deref(),
            Some("call_v2_1")
        );
        assert_eq!(assistant.tool_results[0].content, "fn main() {}");
        assert!(!assistant.tool_results[0].is_error);
        assert_eq!(
            assistant.tool_results[1].call_id.as_deref(),
            Some("call_v2_2")
        );
        assert_eq!(
            assistant.tool_results[1].content,
            "Tool.Error: cat: missing.txt: No such file"
        );
        assert!(assistant.tool_results[1].is_error);
        assert_eq!(
            assistant.extra["opencode_message"]["model"]["variant"],
            "max"
        );

        let shell = &session.messages[2];
        assert_eq!(
            shell.content,
            "The following shell command was executed by the user:\n\nCommand:\nls src\n\nOutput:\nmain.rs\nlib.rs"
        );
        assert_eq!(shell.extra["opencode_message"]["exit"], 0);

        let synthetic = &session.messages[3];
        assert!(
            synthetic
                .content
                .starts_with("User shell command failed to start:")
        );

        let system = &session.messages[4];
        assert_eq!(
            system.content,
            "AGENTS.md changed: run cargo fmt before committing."
        );

        let compaction = &session.messages[5];
        assert!(compaction.content.starts_with("Conversation checkpoint:"));
        assert!(
            compaction
                .content
                .contains("Summary:\nWe inspected src/main.rs and found an empty main.")
        );
        assert!(
            compaction
                .content
                .contains("Recent context:\nUser asked to inspect src/main.rs.")
        );

        let running_tool = &session.messages[7];
        assert_eq!(running_tool.author.as_deref(), Some("gpt-5"));
        assert_eq!(running_tool.tool_calls.len(), 1);
        assert_eq!(running_tool.tool_calls[0].name, "edit");
        assert!(
            running_tool.tool_results.is_empty(),
            "a running tool has no outcome yet"
        );
        assert_eq!(
            running_tool.content, "",
            "no text, no reasoning, no settled result"
        );
    }

    #[test]
    fn read_session_on_2x_db_path_picks_newest_root_session() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v2_schema_db(&db_path, tmp.path());

        // The child session is newer but has a parent; the live root wins.
        let session = OpenCode
            .read_session(&db_path)
            .expect("direct db path must resolve to the newest root session");
        assert_eq!(session.session_id, V2_SESSION_ID);
    }

    #[test]
    fn read_session_on_2x_schema_untitled_session_derives_title_from_first_user_turn() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v2_schema_db(&db_path, tmp.path());

        let virtual_path = OpenCode::virtual_session_path(&db_path, V2_OLDER_SESSION_ID);
        let session = OpenCode.read_session(&virtual_path).expect("older session");
        assert_eq!(session.title.as_deref(), Some("older 2.x prompt"));
        assert_eq!(session.messages.len(), 1);
        assert_eq!(
            session.model_name.as_deref(),
            Some("claude-sonnet-4"),
            "no assistant turns: fall back to session_v2.model.id"
        );
        assert_eq!(
            session.metadata["parent_session_id"],
            serde_json::Value::Null
        );
    }

    #[test]
    fn read_session_on_2x_schema_child_session_records_parent() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v2_schema_db(&db_path, tmp.path());

        let virtual_path = OpenCode::virtual_session_path(&db_path, V2_CHILD_SESSION_ID);
        let session = OpenCode.read_session(&virtual_path).expect("child session");
        assert_eq!(session.metadata["parent_session_id"], V2_SESSION_ID);
    }

    #[test]
    fn read_session_on_2x_schema_unknown_id_fails_naming_session() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_v2_schema_db(&db_path, tmp.path());

        let virtual_path = OpenCode::virtual_session_path(&db_path, "ses_missing_v2");
        let err = OpenCode
            .read_session(&virtual_path)
            .expect_err("unknown id must fail");
        assert!(format!("{err:#}").contains("ses_missing_v2"));
    }

    #[test]
    fn read_migrated_db_by_virtual_path_serves_2x_sessions_not_stale_1x_ones() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let db_path = tmp.path().join("opencode.db");
        create_migrated_v1_v2_db(&db_path, tmp.path());

        let live = OpenCode
            .read_session(&OpenCode::virtual_session_path(&db_path, V2_SESSION_ID))
            .expect("2.x session must read from a migrated DB");
        assert_eq!(live.metadata["opencode_schema"], "v2");
        assert_eq!(live.messages.len(), 8);

        // Direct DB path → newest root through the 2.x tables.
        let newest = OpenCode.read_session(&db_path).expect("newest root");
        assert_eq!(newest.session_id, V2_SESSION_ID);

        // The stale 1.x session id is not reachable: it only exists in the
        // dead tables.
        let err = OpenCode
            .read_session(&OpenCode::virtual_session_path(&db_path, V1_SESSION_ID))
            .expect_err("stale 1.x ids must not resolve");
        assert!(format!("{err:#}").contains(V1_SESSION_ID));
    }

    #[test]
    fn list_sessions_on_2x_schema_lists_every_session_newest_first() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_v2_schema_db(&db_path, &workspace);
        let _cwd = CwdGuard::change_to(&workspace);

        let listed = OpenCode.list_sessions().expect("should return Some");
        let ids: Vec<&str> = listed.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            vec![V2_CHILD_SESSION_ID, V2_SESSION_ID, V2_OLDER_SESSION_ID]
        );

        // `casr list` renders title / directory / time from a full read of
        // each listed path, so every listed path must read.
        for (id, path) in &listed {
            let session = OpenCode.read_session(path).expect("listed session reads");
            assert_eq!(&session.session_id, id);
            assert!(session.title.is_some(), "{id} must carry a title");
            assert_eq!(session.workspace.as_deref(), Some(workspace.as_path()));
            assert!(session.started_at.is_some(), "{id} must carry a start time");
        }

        // Discovery spells the DB path the way `current_dir()` resolves it
        // (macOS reports `/var/...` tempdirs as `/private/var/...`), so the
        // expectation has to be built from the canonical path too.
        let canonical_db = db_path.canonicalize().expect("db path canonicalizes");
        assert_eq!(
            OpenCode.owns_session(V2_SESSION_ID),
            Some(OpenCode::virtual_session_path(&canonical_db, V2_SESSION_ID))
        );
    }

    #[test]
    fn list_sessions_on_migrated_db_shows_only_2x_sessions() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_migrated_v1_v2_db(&db_path, &workspace);
        let _cwd = CwdGuard::change_to(&workspace);

        let listed = OpenCode.list_sessions().expect("should return Some");
        let ids: Vec<&str> = listed.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            vec![V2_CHILD_SESSION_ID, V2_SESSION_ID, V2_OLDER_SESSION_ID]
        );
        assert!(OpenCode.owns_session(V1_SESSION_ID).is_none());
    }

    #[test]
    fn write_session_into_2x_db_is_refused_without_touching_the_file() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_v2_schema_db(&db_path, &workspace);
        let before = std::fs::read(&db_path).expect("read db bytes");
        let _cwd = CwdGuard::change_to(&workspace);

        let err = OpenCode
            .write_session(&sample_session(&workspace), &WriteOptions { force: true })
            .expect_err("writing into a live 2.x DB must be refused");
        let msg = format!("{err:#}");
        assert!(msg.contains("2.x"), "got: {msg}");
        assert!(msg.contains("session_v2/session_message"), "got: {msg}");
        assert!(msg.contains("projection"), "must explain why: {msg}");
        assert!(
            msg.contains("OPENCODE_DB_PATH"),
            "must say what to do: {msg}"
        );

        assert_eq!(
            std::fs::read(&db_path).expect("read db bytes"),
            before,
            "the refusal must leave the DB byte-identical"
        );
        let conn = OpenCode::open_db(&db_path).expect("open db");
        assert!(!OpenCode::table_exists(&conn, "sessions"));
        assert!(!OpenCode::table_exists(&conn, "messages"));
    }

    #[test]
    fn write_session_into_migrated_db_is_refused_as_2x() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_migrated_v1_v2_db(&db_path, &workspace);
        let _cwd = CwdGuard::change_to(&workspace);

        let err = OpenCode
            .write_session(&sample_session(&workspace), &WriteOptions { force: false })
            .expect_err("writing into a migrated DB must be refused");
        let msg = format!("{err:#}");
        assert!(msg.contains("2.x schema"), "got: {msg}");
    }

    #[test]
    fn write_session_into_1x_db_leaves_file_byte_identical() {
        let _lock = OPENCODE_ENV.lock().expect("mutex lock");
        let tmp = tempfile::tempdir().expect("tmpdir");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(workspace.join(DATA_DIRNAME)).expect("data dir");
        let db_path = workspace.join(DATA_DIRNAME).join(DB_FILENAME);
        create_v1_schema_db(&db_path, &workspace);
        let before = std::fs::read(&db_path).expect("read db bytes");
        let _cwd = CwdGuard::change_to(&workspace);

        let err = OpenCode
            .write_session(&sample_session(&workspace), &WriteOptions { force: false })
            .expect_err("writing into a live 1.x DB must be refused");
        assert!(format!("{err:#}").contains("1.x schema"));
        assert_eq!(std::fs::read(&db_path).expect("read db bytes"), before);
    }

    // Round-trip conversion of a 2.x session into Claude Code lives in
    // `tests/opencode_v2_test.rs`: the Claude Code writer needs `CLAUDE_HOME`,
    // and env mutation is `unsafe` under this crate's `forbid(unsafe_code)`.

    // ── map_v2_message / parse_v2_assistant_content ─────────────────────

    #[test]
    fn map_v2_message_user_with_only_attachment_keeps_marker() {
        let data = serde_json::json!({
            "text": "",
            "files": [{"data": "AAAA", "mime": "image/png", "source": {"type": "inline"}}],
            "time": {"created": 1_i64}
        });
        let turn = map_v2_message("user", &data).expect("attachment-only turn is kept");
        assert_eq!(turn.role, MessageRole::User);
        assert_eq!(turn.content, "[file: image/png]");
    }

    #[test]
    fn map_v2_message_empty_user_and_empty_assistant_are_dropped() {
        assert!(map_v2_message("user", &serde_json::json!({"text": "  "})).is_none());
        assert!(map_v2_message("assistant", &serde_json::json!({"content": []})).is_none());
        assert!(map_v2_message("system", &serde_json::json!({})).is_none());
    }

    #[test]
    fn map_v2_message_skips_bookkeeping_kinds() {
        for kind in ["model-switched", "agent-switched", "location-switched"] {
            assert!(
                map_v2_message(kind, &serde_json::json!({"text": "ignored"})).is_none(),
                "{kind} must be skipped"
            );
        }
    }

    #[test]
    fn map_v2_message_compaction_only_when_completed() {
        let running = serde_json::json!({"status": "running", "summary": "s", "recent": "r"});
        assert!(map_v2_message("compaction", &running).is_none());
        let failed =
            serde_json::json!({"status": "failed", "error": {"type": "x", "message": "y"}});
        assert!(map_v2_message("compaction", &failed).is_none());

        let completed = serde_json::json!({"status": "completed", "summary": "s", "recent": ""});
        let turn = map_v2_message("compaction", &completed).expect("completed");
        assert_eq!(turn.role, MessageRole::System);
        assert!(turn.content.ends_with("Summary:\ns"));
        assert!(!turn.content.contains("Recent context"));
    }

    #[test]
    fn map_v2_message_skill_and_synthetic_are_tool_turns() {
        let skill = serde_json::json!({"skill": "sk_1", "name": "deploy", "text": "how to deploy"});
        let turn = map_v2_message("skill", &skill).expect("skill");
        assert_eq!(turn.role, MessageRole::Tool);
        assert_eq!(turn.content, "how to deploy");

        let synthetic = serde_json::json!({"text": "injected", "description": "d"});
        let turn = map_v2_message("synthetic", &synthetic).expect("synthetic");
        assert_eq!(turn.role, MessageRole::Tool);
        assert_eq!(turn.content, "injected");
    }

    #[test]
    fn map_v2_message_unknown_kind_with_text_keeps_its_own_role() {
        let turn = map_v2_message("future-kind", &serde_json::json!({"text": "hello"}))
            .expect("text-bearing unknown kind is kept");
        assert_eq!(turn.role, MessageRole::Other("future-kind".to_string()));
        assert!(map_v2_message("future-kind", &serde_json::json!({"x": 1})).is_none());
    }

    #[test]
    fn map_v2_message_background_shell_is_skipped_foreground_kept() {
        let background = serde_json::json!({
            "command": "sleep 5", "status": "exited", "exit": 0,
            "output": {"output": "done", "cursor": 4, "size": 4, "truncated": false},
            "metadata": {"background": true}
        });
        assert!(
            map_v2_message("shell", &background).is_none(),
            "background shell output arrives via its synthetic completion notice"
        );
        let foreground = serde_json::json!({
            "command": "pwd", "status": "exited", "exit": 0,
            "output": {"output": "/work", "cursor": 5, "size": 5, "truncated": false},
            "metadata": {"background": false}
        });
        let turn = map_v2_message("shell", &foreground).expect("foreground shell");
        assert_eq!(turn.role, MessageRole::Tool);
        assert!(turn.content.ends_with("Output:\n/work"));
    }

    #[test]
    fn v2_shell_text_accepts_string_and_paged_output() {
        let early = serde_json::json!({"command": "pwd", "output": "/work"});
        assert!(v2_shell_text(&early).ends_with("Command:\npwd\n\nOutput:\n/work"));
        let paged = serde_json::json!({
            "command": "pwd",
            "output": {"output": "/work", "cursor": 5, "size": 5, "truncated": false}
        });
        assert_eq!(v2_shell_text(&paged), v2_shell_text(&early));
        assert_eq!(v2_shell_text(&serde_json::json!({"status": "running"})), "");
    }

    #[test]
    fn parse_v2_assistant_content_streaming_input_is_parsed_from_string() {
        let content = serde_json::json!([{
            "type": "tool", "id": "c1", "name": "read",
            "state": {"status": "streaming", "input": "{\"filePath\": \"a.rs\"}"}
        }]);
        let (text, calls, results) = parse_v2_assistant_content(&content);
        assert_eq!(text, "");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments["filePath"], "a.rs");
        assert!(results.is_empty());
    }

    #[test]
    fn parse_v2_assistant_content_completed_output_fallbacks() {
        // Current betas: content[] with text and file items.
        let content = serde_json::json!([{
            "type": "tool", "id": "c1", "name": "read",
            "state": {"status": "completed", "input": {},
                      "content": [{"type": "text", "text": "hello"},
                                  {"type": "file", "uri": "file:///tmp/x.png", "mime": "image/png", "name": "x.png"}]}
        }]);
        let (text, _, results) = parse_v2_assistant_content(&content);
        assert_eq!(results[0].content, "hello\n[file: x.png]");
        assert_eq!(
            text, "hello\n[file: x.png]",
            "result text stands in when there is no assistant text"
        );

        // Older betas: a bare `output` string.
        let content = serde_json::json!([{
            "type": "tool", "id": "c1", "name": "read",
            "state": {"status": "completed", "input": {}, "output": "legacy output"}
        }]);
        let (_, _, results) = parse_v2_assistant_content(&content);
        assert_eq!(results[0].content, "legacy output");

        // Empty content[] but a string result.
        let content = serde_json::json!([{
            "type": "tool", "id": "c1", "name": "read",
            "state": {"status": "completed", "input": {}, "content": [], "result": "from result"}
        }]);
        let (_, _, results) = parse_v2_assistant_content(&content);
        assert_eq!(results[0].content, "from result");
    }

    #[test]
    fn parse_v2_assistant_content_error_keeps_partial_output() {
        let content = serde_json::json!([{
            "type": "tool", "id": "c1", "name": "bash",
            "state": {"status": "error", "input": {"command": "x"},
                      "error": {"type": "Tool.Error", "message": "boom", "status": 500},
                      "content": [{"type": "text", "text": "partial stdout"}]}
        }]);
        let (_, calls, results) = parse_v2_assistant_content(&content);
        assert_eq!(calls[0].arguments["command"], "x");
        assert!(results[0].is_error);
        assert_eq!(results[0].content, "Tool.Error: boom\npartial stdout");
    }

    #[test]
    fn parse_v2_assistant_content_text_preferred_over_reasoning_and_unknown_parts_skipped() {
        let content = serde_json::json!([
            {"type": "reasoning", "text": "thinking"},
            {"type": "text", "text": "answer"},
            {"type": "mystery", "text": "nope"}
        ]);
        let (text, calls, results) = parse_v2_assistant_content(&content);
        assert_eq!(text, "answer");
        assert!(calls.is_empty() && results.is_empty());

        let (text, _, _) = parse_v2_assistant_content(
            &serde_json::json!([{"type": "reasoning", "text": "thinking"}]),
        );
        assert_eq!(text, "thinking");

        let (text, calls, results) =
            parse_v2_assistant_content(&serde_json::json!({"not": "array"}));
        assert!(text.is_empty() && calls.is_empty() && results.is_empty());
    }

    #[test]
    fn v2_error_text_shapes() {
        assert_eq!(v2_error_text(None), "");
        assert_eq!(v2_error_text(Some(&serde_json::json!("plain"))), "plain");
        assert_eq!(
            v2_error_text(Some(&serde_json::json!({"type": "T", "message": "m"}))),
            "T: m"
        );
        assert_eq!(
            v2_error_text(Some(&serde_json::json!({"message": "m"}))),
            "m"
        );
        assert_eq!(v2_error_text(Some(&serde_json::json!({"type": "T"}))), "T");
        assert_eq!(v2_error_text(Some(&serde_json::json!({}))), "");
    }

    #[test]
    fn strip_v2_attachment_payloads_only_touches_file_data() {
        let mut data = serde_json::json!({
            "text": "t",
            "files": [{"data": "QUJD", "mime": "image/png", "name": "a.png"}, {"mime": "x"}],
            "other": {"data": "keep"}
        });
        strip_v2_attachment_payloads(&mut data);
        assert!(data["files"][0].get("data").is_none());
        assert_eq!(data["files"][0]["data_omitted_bytes"], 4);
        assert_eq!(data["files"][0]["name"], "a.png");
        assert_eq!(data["files"][1], serde_json::json!({"mime": "x"}));
        assert_eq!(data["other"]["data"], "keep");
    }
}
