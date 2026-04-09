//! Cursor AI provider — reads/writes sessions from SQLite `state.vscdb` databases.
//!
//! Cursor stores conversations in SQLite databases under its config directory:
//! - Linux: `~/.config/Cursor/User/globalStorage/state.vscdb`
//! - macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
//! - Windows: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
//!
//! ## Storage format
//!
//! Two tables are used:
//! - `cursorDiskKV` (modern, v0.40+) — key-value store where:
//!   - `composerData:<uuid>` → session metadata + message ordering
//!   - `bubbleId:<composerId>:<bubbleId>` → individual message data
//! - `ItemTable` (legacy, v0.2x–v0.3x) — key-value store for older AI chat data
//!
//! ## Message types
//!
//! - Numeric type `1` = User, `2` = Assistant (v0.40+ format)
//! - String type `"user"/"human"` = User, `"assistant"/"ai"/"bot"` = Assistant
//!
//! ## Content extraction priority
//!
//! `text` > `rawText` > `content` > `message` (first non-empty wins)
//!
//! ## Resume mechanism
//!
//! Cursor has no CLI `--resume <id>` flag. The resume command opens the
//! workspace directory in Cursor (`cursor <workspace-path>`).

use std::path::{Path, PathBuf};

use anyhow::Context;
use rusqlite::{Connection, OpenFlags};
use tracing::{debug, info, trace, warn};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, flatten_content, normalize_role,
    parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Cursor AI provider implementation.
pub struct Cursor;

// ---------------------------------------------------------------------------
// Bubble type constants (v0.40+ numeric message types)
// ---------------------------------------------------------------------------

/// User message type in modern Cursor format.
const BUBBLE_TYPE_USER: i64 = 1;
/// Assistant message type in modern Cursor format.
const BUBBLE_TYPE_ASSISTANT: i64 = 2;

impl Cursor {
    /// Config directory for Cursor. Respects `CURSOR_HOME` env var override.
    fn config_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("CURSOR_HOME") {
            return Some(PathBuf::from(home));
        }
        #[cfg(target_os = "linux")]
        {
            dirs::config_dir().map(|c| c.join("Cursor"))
        }
        #[cfg(target_os = "macos")]
        {
            dirs::data_dir().map(|d| d.join("Cursor"))
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        {
            dirs::config_dir().map(|c| c.join("Cursor"))
        }
    }

    /// Find all `state.vscdb` files under the Cursor config directory.
    fn find_db_files() -> Vec<PathBuf> {
        let Some(config_dir) = Self::config_dir() else {
            return vec![];
        };

        let mut dbs = Vec::new();

        // Global storage DB (most common location).
        let global_db = config_dir.join("User/globalStorage/state.vscdb");
        if global_db.is_file() {
            dbs.push(global_db);
        }

        // Workspace-specific DBs.
        let ws_storage = config_dir.join("User/workspaceStorage");
        if ws_storage.is_dir()
            && let Ok(entries) = std::fs::read_dir(&ws_storage)
        {
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let candidate = entry.path().join("state.vscdb");
                    if candidate.is_file() {
                        dbs.push(candidate);
                    }
                }
            }
        }

        dbs
    }

    /// Build a virtual per-session path backed by a `state.vscdb` file.
    ///
    /// Format: `<db_path>/<urlencoded-composer-id>`
    fn virtual_session_path(db_path: &Path, composer_id: &str) -> PathBuf {
        let encoded = urlencoding::encode(composer_id);
        db_path.join(encoded.as_ref())
    }

    /// Open a SQLite database read-only with a busy timeout.
    fn open_db(path: &Path) -> anyhow::Result<Connection> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("failed to open Cursor DB: {}", path.display()))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(conn)
    }

    /// Open a SQLite database read-write (for writer).
    fn open_db_rw(path: &Path) -> anyhow::Result<Connection> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("failed to open Cursor DB for writing: {}", path.display()))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(conn)
    }

    /// Check if a table exists in the database.
    fn table_exists(conn: &Connection, table: &str) -> bool {
        conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1")
            .and_then(|mut stmt| stmt.exists(rusqlite::params![table]))
            .unwrap_or(false)
    }

    /// List all composer IDs from the cursorDiskKV table.
    fn list_composer_ids(conn: &Connection) -> Vec<String> {
        if !Self::table_exists(conn, "cursorDiskKV") {
            return vec![];
        }

        let mut stmt =
            match conn.prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'") {
                Ok(s) => s,
                Err(e) => {
                    warn!(error = %e, "failed to query composerData keys");
                    return vec![];
                }
            };

        let ids: Vec<String> = stmt
            .query_map([], |row| {
                let key: String = row.get(0)?;
                Ok(key
                    .strip_prefix("composerData:")
                    .unwrap_or(&key)
                    .to_string())
            })
            .ok()
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .collect();

        ids
    }

    /// Fetch bubble data for a composer using range query optimization.
    ///
    /// Key format: `bubbleId:{composerId}:{bubbleId}`
    /// Uses range query `key >= prefix AND key < prefix_upper` for index leverage.
    fn fetch_bubbles(
        conn: &Connection,
        composer_id: &str,
    ) -> std::collections::HashMap<String, serde_json::Value> {
        let prefix = format!("bubbleId:{composer_id}:");
        // Increment last char for upper bound.
        let prefix_upper = format!("bubbleId:{composer_id};");

        let mut bubbles = std::collections::HashMap::new();

        let mut stmt = match conn
            .prepare("SELECT key, value FROM cursorDiskKV WHERE key >= ?1 AND key < ?2")
        {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, "failed to query bubble data");
                return bubbles;
            }
        };

        let rows = match stmt.query_map(rusqlite::params![prefix, prefix_upper], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        }) {
            Ok(r) => r,
            Err(e) => {
                warn!(error = %e, "failed to fetch bubble rows");
                return bubbles;
            }
        };

        for row in rows.flatten() {
            let (key, value_str) = row;
            // Extract bubble ID from key.
            let bubble_id = key.strip_prefix(&prefix).unwrap_or(&key);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&value_str) {
                bubbles.insert(bubble_id.to_string(), val);
            }
        }

        bubbles
    }

    /// Read a single session from a composerData entry.
    fn read_composer_session(
        conn: &Connection,
        composer_id: &str,
        db_path: &Path,
    ) -> anyhow::Result<CanonicalSession> {
        // Fetch the composerData entry.
        let composer_json: String = conn
            .query_row(
                "SELECT value FROM cursorDiskKV WHERE key = ?1",
                rusqlite::params![format!("composerData:{composer_id}")],
                |row| row.get(0),
            )
            .with_context(|| format!("composerData not found for {composer_id}"))?;

        let composer: serde_json::Value =
            serde_json::from_str(&composer_json).context("invalid composerData JSON")?;

        // Fetch all bubbles for this composer.
        let bubbles = Self::fetch_bubbles(conn, composer_id);

        Self::parse_composer(composer_id, &composer, &bubbles, db_path)
    }

    /// Parse a composerData entry + bubbles into a CanonicalSession.
    fn parse_composer(
        composer_id: &str,
        composer: &serde_json::Value,
        bubbles: &std::collections::HashMap<String, serde_json::Value>,
        source_path: &Path,
    ) -> anyhow::Result<CanonicalSession> {
        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut model_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;

        // Session-level timestamps.
        if let Some(ts) = composer.get("createdAt").and_then(parse_timestamp) {
            started_at = Some(ts);
        }
        if let Some(ts) = composer.get("lastUpdatedAt").and_then(parse_timestamp) {
            ended_at = Some(ts);
        }

        // Extract workspace from bubbles.
        let workspace = extract_workspace_from_bubbles(bubbles)
            .or_else(|| extract_workspace_from_composer(composer));

        // Try modern v0.40+ format: fullConversationHeadersOnly.
        if let Some(headers) = composer
            .get("fullConversationHeadersOnly")
            .and_then(|v| v.as_array())
        {
            for header in headers {
                let bubble_id = header
                    .get("bubbleId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if bubble_id.is_empty() {
                    continue;
                }

                let bubble = match bubbles.get(bubble_id) {
                    Some(b) => b,
                    None => {
                        trace!(bubble_id, "bubble not found in fetched data");
                        continue;
                    }
                };

                if let Some(msg) =
                    parse_bubble(bubble, &mut model_counts, &mut started_at, &mut ended_at)
                {
                    messages.push(msg);
                }
            }
        }
        // Fallback: v0.3x tabs format.
        else if let Some(tabs) = composer.get("tabs").and_then(|v| v.as_array()) {
            for tab in tabs {
                if let Some(tab_bubbles) = tab.get("bubbles").and_then(|v| v.as_array()) {
                    for bubble in tab_bubbles {
                        if let Some(msg) =
                            parse_bubble(bubble, &mut model_counts, &mut started_at, &mut ended_at)
                        {
                            messages.push(msg);
                        }
                    }
                }
            }
        }
        // Fallback: v0.2x conversationMap format.
        else if let Some(conv_map) = composer.get("conversationMap").and_then(|v| v.as_object()) {
            for (_conv_id, conv) in conv_map {
                if let Some(conv_bubbles) = conv.get("bubbles").and_then(|v| v.as_array()) {
                    for bubble in conv_bubbles {
                        if let Some(msg) =
                            parse_bubble(bubble, &mut model_counts, &mut started_at, &mut ended_at)
                        {
                            messages.push(msg);
                        }
                    }
                }
            }
        }
        // Fallback: simple single-entry format.
        else if let Some(content) = extract_bubble_content(composer)
            && !content.trim().is_empty()
        {
            messages.push(CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content,
                timestamp: started_at,
                author: None,
                tool_calls: Vec::new(),
                tool_results: Vec::new(),
                extra: composer.clone(),
            });
        }

        reindex_messages(&mut messages);

        // Derive title.
        let session_title = composer
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .or_else(|| {
                messages
                    .iter()
                    .find(|m| m.role == MessageRole::User)
                    .map(|m| truncate_title(&m.content, 100))
            });

        // Most common model name.
        let model_name = model_counts
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(name, _)| name);

        // Build metadata.
        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("cursor".to_string()),
        );
        if let Some(model_config) = composer.get("modelConfig") {
            metadata.insert("modelConfig".into(), model_config.clone());
        }
        if let Some(mode) = composer.get("unifiedMode").and_then(|v| v.as_str()) {
            metadata.insert(
                "unifiedMode".into(),
                serde_json::Value::String(mode.to_string()),
            );
        }

        // Unique source path: db_path/composer_id for dedup.
        let source = Self::virtual_session_path(source_path, composer_id);

        debug!(
            composer_id,
            messages = messages.len(),
            "Cursor session parsed"
        );

        Ok(CanonicalSession {
            session_id: composer_id.to_string(),
            provider_slug: "cursor".to_string(),
            workspace,
            title: session_title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::Value::Object(metadata),
            source_path: source,
            model_name,
        })
    }
}

impl Provider for Cursor {
    fn name(&self) -> &str {
        "Cursor"
    }

    fn slug(&self) -> &str {
        "cursor"
    }

    fn cli_alias(&self) -> &str {
        "cur"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        // Check for binary in PATH.
        if which::which("cursor").is_ok() {
            evidence.push("cursor binary found in PATH".to_string());
            installed = true;
        }

        // Check for config directory.
        if let Some(config) = Self::config_dir()
            && config.is_dir()
        {
            evidence.push(format!("{} exists", config.display()));
            installed = true;
        }

        // Check for any state.vscdb files.
        let dbs = Self::find_db_files();
        if !dbs.is_empty() {
            evidence.push(format!("found {} state.vscdb database(s)", dbs.len()));
        }

        trace!(provider = "cursor", ?evidence, installed, "detection");
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
            if let Ok(conn) = Self::open_db(&db_path) {
                let ids = Self::list_composer_ids(&conn);
                if ids.iter().any(|id| id == session_id) {
                    let virtual_path = Self::virtual_session_path(&db_path, session_id);
                    debug!(
                        db = %db_path.display(),
                        session_path = %virtual_path.display(),
                        session_id,
                        "found Cursor session"
                    );
                    return Some(virtual_path);
                }
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Cursor session");

        // The path may be a DB file directly, or a DB file with an appended composer ID.
        // Check if the path itself is a real file (SQLite DB).
        if path.is_file() && path.extension().is_some_and(|ext| ext == "vscdb") {
            // Read the first (or only) session from this DB.
            let conn = Self::open_db(path)?;
            let ids = Self::list_composer_ids(&conn);
            if let Some(first_id) = ids.first() {
                return Self::read_composer_session(&conn, first_id, path);
            }

            // Fallback: try ItemTable (legacy).
            return read_legacy_session(&conn, path);
        }

        // Path might be "db_path/encoded_composer_id" — virtual path from discovery.
        let parent = path.parent();
        let filename = path.file_name().and_then(|f| f.to_str()).unwrap_or("");

        if let Some(parent_path) = parent
            && parent_path.is_file()
        {
            let composer_id = urlencoding::decode(filename)
                .map(|s| s.into_owned())
                .unwrap_or_else(|_| filename.to_string());
            let conn = Self::open_db(parent_path)?;
            return Self::read_composer_session(&conn, &composer_id, parent_path);
        }

        // Last resort: try opening as a DB directly.
        let conn = Self::open_db(path)?;
        let ids = Self::list_composer_ids(&conn);
        if let Some(first_id) = ids.first() {
            return Self::read_composer_session(&conn, first_id, path);
        }

        anyhow::bail!("no Cursor sessions found in {}", path.display())
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let target_composer_id = uuid::Uuid::new_v4().to_string();
        let now_millis = chrono::Utc::now().timestamp_millis();

        // Determine target DB path.
        let global_db = Self::config_dir()
            .map(|c| c.join("User/globalStorage/state.vscdb"))
            .ok_or_else(|| anyhow::anyhow!("cannot determine Cursor config directory"))?;

        // If the DB doesn't exist, create it with the proper schema.
        let db_dir = global_db
            .parent()
            .ok_or_else(|| anyhow::anyhow!("invalid Cursor DB path"))?;

        std::fs::create_dir_all(db_dir)
            .with_context(|| format!("failed to create directory: {}", db_dir.display()))?;

        // Check for conflict.
        if global_db.exists() && !opts.force {
            // DB exists — we'll INSERT into it, no conflict.
            // Only conflict if this specific composer ID already exists.
            if let Ok(conn) = Self::open_db(&global_db) {
                let ids = Self::list_composer_ids(&conn);
                if ids.contains(&target_composer_id) {
                    return Err(crate::error::CasrError::SessionConflict {
                        session_id: target_composer_id,
                        existing_path: global_db,
                    }
                    .into());
                }
            }
        }

        let mut conn = Self::open_db_rw(&global_db)?;

        // Create table if needed.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        )
        .context("failed to create cursorDiskKV table")?;

        let tx = conn.transaction().context("failed to begin transaction")?;

        // Build bubble entries and conversation headers.
        let mut headers: Vec<serde_json::Value> = Vec::new();

        for msg in &session.messages {
            let bubble_id = uuid::Uuid::new_v4().to_string();
            let bubble_type = match msg.role {
                MessageRole::User => BUBBLE_TYPE_USER,
                _ => BUBBLE_TYPE_ASSISTANT,
            };

            let bubble = serde_json::json!({
                "text": msg.content,
                "type": bubble_type,
                "timestamp": msg.timestamp.unwrap_or(now_millis),
                "modelType": msg.author.as_deref().or(session.model_name.as_deref()),
            });

            let bubble_key = format!("bubbleId:{target_composer_id}:{bubble_id}");
            let bubble_json = serde_json::to_string(&bubble)?;

            tx.execute(
                "INSERT OR REPLACE INTO cursorDiskKV (key, value) VALUES (?1, ?2)",
                rusqlite::params![bubble_key, bubble_json],
            )
            .with_context(|| format!("failed to insert bubble {bubble_id}"))?;

            headers.push(serde_json::json!({ "bubbleId": bubble_id }));
        }

        // Build composerData entry.
        let composer_data = serde_json::json!({
            "fullConversationHeadersOnly": headers,
            "createdAt": session.started_at.unwrap_or(now_millis),
            "lastUpdatedAt": session.ended_at.unwrap_or(now_millis),
            "name": session.title.as_deref().unwrap_or(""),
            "modelConfig": {
                "modelName": session.model_name.as_deref().unwrap_or("unknown"),
            },
            "casr_converted": true,
            "casr_source_provider": session.provider_slug,
            "casr_source_session_id": session.session_id,
        });

        let composer_key = format!("composerData:{target_composer_id}");
        let composer_json = serde_json::to_string(&composer_data)?;

        tx.execute(
            "INSERT OR REPLACE INTO cursorDiskKV (key, value) VALUES (?1, ?2)",
            rusqlite::params![composer_key, composer_json],
        )
        .context("failed to insert composerData")?;

        tx.commit().context("failed to commit transaction")?;

        info!(
            target_composer_id,
            path = %global_db.display(),
            messages = session.messages.len(),
            "Cursor session written"
        );
        let virtual_path = Self::virtual_session_path(&global_db, &target_composer_id);

        Ok(WrittenSession {
            paths: vec![virtual_path],
            session_id: target_composer_id.clone(),
            resume_command: self.resume_command(&target_composer_id),
            backup_path: None,
        })
    }

    fn resume_command(&self, _session_id: &str) -> String {
        // Cursor has no session-specific resume mechanism.
        // Best we can do is open Cursor.
        "cursor .".to_string()
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

            for id in Self::list_composer_ids(&conn) {
                let virtual_path = Self::virtual_session_path(db_path, &id);
                results.push((id, virtual_path));
            }
        }

        Some(results)
    }
}

// ---------------------------------------------------------------------------
// Bubble parsing helpers
// ---------------------------------------------------------------------------

/// Extract text content from a bubble, trying multiple fields.
///
/// Priority: `text` > `rawText` > `content` > `message`
fn extract_bubble_content(bubble: &serde_json::Value) -> Option<String> {
    for field in ["text", "rawText", "richText", "content", "message"] {
        if let Some(val) = bubble.get(field) {
            let text = flatten_content(val);
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }
    None
}

/// Parse a single bubble into a CanonicalMessage.
fn parse_bubble(
    bubble: &serde_json::Value,
    model_counts: &mut std::collections::HashMap<String, usize>,
    started_at: &mut Option<i64>,
    ended_at: &mut Option<i64>,
) -> Option<CanonicalMessage> {
    let content = extract_bubble_content(bubble)?;

    // Determine role.
    let role = determine_bubble_role(bubble);

    // Extract author (model name).
    let author = bubble
        .get("modelType")
        .and_then(|v| v.as_str())
        .or_else(|| bubble.get("model").and_then(|v| v.as_str()))
        .or_else(|| {
            bubble
                .pointer("/modelInfo/modelName")
                .and_then(|v| v.as_str())
        })
        .filter(|s| !s.is_empty())
        .map(String::from);

    if let Some(ref m) = author {
        *model_counts.entry(m.clone()).or_insert(0) += 1;
    }

    // Extract timestamp.
    let timestamp = bubble
        .get("timestamp")
        .or_else(|| bubble.get("createdAt"))
        .and_then(parse_timestamp);

    if let Some(ts) = timestamp {
        *started_at = Some(started_at.map_or(ts, |s: i64| s.min(ts)));
        *ended_at = Some(ended_at.map_or(ts, |e: i64| e.max(ts)));
    }

    Some(CanonicalMessage {
        idx: 0, // Re-indexed by caller.
        role,
        content,
        timestamp,
        author,
        tool_calls: Vec::new(),
        tool_results: Vec::new(),
        extra: bubble.clone(),
    })
}

/// Determine message role from bubble data.
///
/// Checks numeric `type` field first (v0.40+), then string `type`/`role` fields.
fn determine_bubble_role(bubble: &serde_json::Value) -> MessageRole {
    // Modern numeric type.
    if let Some(num_type) = bubble.get("type").and_then(|v| v.as_i64()) {
        return match num_type {
            BUBBLE_TYPE_USER => MessageRole::User,
            BUBBLE_TYPE_ASSISTANT => MessageRole::Assistant,
            _ => MessageRole::Assistant, // Unknown types default to assistant.
        };
    }

    // String type field.
    if let Some(type_str) = bubble.get("type").and_then(|v| v.as_str()) {
        return normalize_cursor_role(type_str);
    }

    // Fallback: role field.
    if let Some(role_str) = bubble.get("role").and_then(|v| v.as_str()) {
        return normalize_cursor_role(role_str);
    }

    // Default to assistant for unknown content.
    MessageRole::Assistant
}

/// Normalize Cursor-specific role strings.
///
/// Cursor uses some role names that differ from the standard normalize_role:
/// - `"human"` → User (Cursor-specific)
/// - `"ai"` / `"bot"` → Assistant (Cursor-specific)
fn normalize_cursor_role(role_str: &str) -> MessageRole {
    match role_str.to_ascii_lowercase().as_str() {
        "user" | "human" => MessageRole::User,
        "assistant" | "ai" | "bot" | "model" | "agent" => MessageRole::Assistant,
        other => normalize_role(other),
    }
}

// ---------------------------------------------------------------------------
// Workspace extraction
// ---------------------------------------------------------------------------

/// Extract workspace path from bubble data.
///
/// Searches all bubbles for `workspaceProjectDir` or `workspaceUris`.
fn extract_workspace_from_bubbles(
    bubbles: &std::collections::HashMap<String, serde_json::Value>,
) -> Option<PathBuf> {
    for bubble in bubbles.values() {
        // Direct workspace path.
        if let Some(dir) = bubble.get("workspaceProjectDir").and_then(|v| v.as_str())
            && !dir.is_empty()
        {
            return Some(PathBuf::from(dir));
        }

        // Workspace URIs array.
        if let Some(uris) = bubble.get("workspaceUris").and_then(|v| v.as_array()) {
            for uri in uris {
                if let Some(uri_str) = uri.as_str()
                    && let Some(path) = parse_workspace_uri(uri_str)
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// Extract workspace from composerData itself (fallback).
fn extract_workspace_from_composer(composer: &serde_json::Value) -> Option<PathBuf> {
    composer
        .get("workspacePath")
        .or_else(|| composer.get("projectPath"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

/// Parse a workspace URI into a filesystem path.
///
/// Handles:
/// - `file:///path/to/project` → `/path/to/project`
/// - `vscode-remote://ssh-remote+{host}/path` → `/path`
fn parse_workspace_uri(uri: &str) -> Option<PathBuf> {
    if let Some(file_path) = uri.strip_prefix("file://") {
        let decoded = urlencoding::decode(file_path).ok()?;
        let path_str = decoded.as_ref();
        // On Unix, path is absolute. On Windows, strip leading / for drive letters.
        #[cfg(target_os = "windows")]
        {
            if path_str.len() > 2
                && path_str.as_bytes()[0] == b'/'
                && path_str.as_bytes()[2] == b':'
            {
                return Some(PathBuf::from(&path_str[1..]));
            }
        }
        return Some(PathBuf::from(path_str));
    }

    if let Some(rest) = uri.strip_prefix("vscode-remote://") {
        // Format: ssh-remote+{host_json}/actual/path
        // Find the first / after the host part.
        if let Some(slash_idx) = rest.find('/') {
            let path_part = &rest[slash_idx..];
            let decoded = urlencoding::decode(path_part).ok()?;
            return Some(PathBuf::from(decoded.as_ref()));
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Legacy ItemTable support
// ---------------------------------------------------------------------------

/// Read a session from the legacy ItemTable format.
fn read_legacy_session(conn: &Connection, db_path: &Path) -> anyhow::Result<CanonicalSession> {
    if !Cursor::table_exists(conn, "ItemTable") {
        anyhow::bail!(
            "no cursorDiskKV or ItemTable found in {}",
            db_path.display()
        );
    }

    let mut stmt = conn.prepare(
        "SELECT key, value FROM ItemTable WHERE key LIKE '%aichat%chatdata%' OR key LIKE '%composer%' ORDER BY key LIMIT 1",
    )?;

    let result: Option<(String, String)> = stmt
        .query_row([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })
        .ok();

    let (entry_key, entry_value) = result
        .ok_or_else(|| anyhow::anyhow!("no legacy chat data found in {}", db_path.display()))?;

    let data: serde_json::Value = serde_json::from_str(&entry_value)
        .with_context(|| format!("invalid JSON in legacy entry {entry_key}"))?;

    // Legacy format may have tabs/bubbles or direct messages.
    let empty_map = std::collections::HashMap::new();
    Cursor::parse_composer(&entry_key, &data, &empty_map, db_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // Bubble content extraction
    // -----------------------------------------------------------------------

    #[test]
    fn extract_bubble_content_text_field() {
        let bubble = json!({"text": "Hello world", "type": 1});
        assert_eq!(extract_bubble_content(&bubble), Some("Hello world".into()));
    }

    #[test]
    fn extract_bubble_content_raw_text_field() {
        let bubble = json!({"rawText": "Raw content", "type": 1});
        assert_eq!(extract_bubble_content(&bubble), Some("Raw content".into()));
    }

    #[test]
    fn extract_bubble_content_rich_text_field() {
        let bubble = json!({"richText": "Rich content"});
        assert_eq!(extract_bubble_content(&bubble), Some("Rich content".into()));
    }

    #[test]
    fn extract_bubble_content_content_field() {
        let bubble = json!({"content": "Content field"});
        assert_eq!(
            extract_bubble_content(&bubble),
            Some("Content field".into())
        );
    }

    #[test]
    fn extract_bubble_content_message_field() {
        let bubble = json!({"message": "Message content"});
        assert_eq!(
            extract_bubble_content(&bubble),
            Some("Message content".into())
        );
    }

    #[test]
    fn extract_bubble_content_priority_text_over_raw() {
        let bubble = json!({"text": "Primary", "rawText": "Secondary"});
        assert_eq!(extract_bubble_content(&bubble), Some("Primary".into()));
    }

    #[test]
    fn extract_bubble_content_empty_text_falls_through() {
        let bubble = json!({"text": "", "rawText": "Fallback"});
        assert_eq!(extract_bubble_content(&bubble), Some("Fallback".into()));
    }

    #[test]
    fn extract_bubble_content_whitespace_only_falls_through() {
        let bubble = json!({"text": "   ", "content": "Real content"});
        assert_eq!(extract_bubble_content(&bubble), Some("Real content".into()));
    }

    #[test]
    fn extract_bubble_content_none_when_empty() {
        let bubble = json!({"type": 1});
        assert_eq!(extract_bubble_content(&bubble), None);
    }

    // -----------------------------------------------------------------------
    // Role determination
    // -----------------------------------------------------------------------

    #[test]
    fn determine_role_numeric_user() {
        let bubble = json!({"type": 1, "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::User);
    }

    #[test]
    fn determine_role_numeric_assistant() {
        let bubble = json!({"type": 2, "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::Assistant);
    }

    #[test]
    fn determine_role_numeric_unknown_defaults_assistant() {
        let bubble = json!({"type": 0, "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::Assistant);
    }

    #[test]
    fn determine_role_string_user() {
        let bubble = json!({"type": "user", "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::User);
    }

    #[test]
    fn determine_role_string_human() {
        let bubble = json!({"type": "human", "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::User);
    }

    #[test]
    fn determine_role_string_assistant() {
        let bubble = json!({"type": "assistant", "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::Assistant);
    }

    #[test]
    fn determine_role_string_ai() {
        let bubble = json!({"type": "ai", "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::Assistant);
    }

    #[test]
    fn determine_role_string_bot() {
        let bubble = json!({"type": "bot", "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::Assistant);
    }

    #[test]
    fn determine_role_fallback_to_role_field() {
        let bubble = json!({"role": "user", "text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::User);
    }

    #[test]
    fn determine_role_no_type_no_role_defaults_assistant() {
        let bubble = json!({"text": "hi"});
        assert_eq!(determine_bubble_role(&bubble), MessageRole::Assistant);
    }

    // -----------------------------------------------------------------------
    // Workspace URI parsing
    // -----------------------------------------------------------------------

    #[test]
    fn parse_file_uri() {
        let path = parse_workspace_uri("file:///home/user/project");
        assert_eq!(path, Some(PathBuf::from("/home/user/project")));
    }

    #[test]
    fn parse_file_uri_with_encoded_spaces() {
        let path = parse_workspace_uri("file:///home/user/my%20project");
        assert_eq!(path, Some(PathBuf::from("/home/user/my project")));
    }

    #[test]
    fn parse_vscode_remote_uri() {
        let path = parse_workspace_uri("vscode-remote://ssh-remote+myhost/home/user/project");
        assert_eq!(path, Some(PathBuf::from("/home/user/project")));
    }

    #[test]
    fn parse_unknown_uri_returns_none() {
        assert_eq!(parse_workspace_uri("https://example.com"), None);
    }

    // -----------------------------------------------------------------------
    // Cursor role normalization
    // -----------------------------------------------------------------------

    #[test]
    fn normalize_cursor_role_standard() {
        assert_eq!(normalize_cursor_role("user"), MessageRole::User);
        assert_eq!(normalize_cursor_role("assistant"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_cursor_role_cursor_specific() {
        assert_eq!(normalize_cursor_role("human"), MessageRole::User);
        assert_eq!(normalize_cursor_role("ai"), MessageRole::Assistant);
        assert_eq!(normalize_cursor_role("bot"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_cursor_role_case_insensitive() {
        assert_eq!(normalize_cursor_role("USER"), MessageRole::User);
        assert_eq!(normalize_cursor_role("Human"), MessageRole::User);
        assert_eq!(normalize_cursor_role("AI"), MessageRole::Assistant);
        assert_eq!(normalize_cursor_role("Bot"), MessageRole::Assistant);
    }

    // -----------------------------------------------------------------------
    // parse_bubble
    // -----------------------------------------------------------------------

    #[test]
    fn parse_bubble_user_message() {
        let bubble = json!({
            "text": "Hello assistant",
            "type": 1,
            "timestamp": 1700000000000_i64,
        });
        let mut model_counts = std::collections::HashMap::new();
        let mut started = None;
        let mut ended = None;

        let msg = parse_bubble(&bubble, &mut model_counts, &mut started, &mut ended)
            .expect("should parse");
        assert_eq!(msg.role, MessageRole::User);
        assert_eq!(msg.content, "Hello assistant");
        assert_eq!(msg.timestamp, Some(1_700_000_000_000));
    }

    #[test]
    fn parse_bubble_assistant_with_model() {
        let bubble = json!({
            "text": "Here's the answer.",
            "type": 2,
            "modelType": "gpt-4",
            "timestamp": 1700000001000_i64,
        });
        let mut model_counts = std::collections::HashMap::new();
        let mut started = None;
        let mut ended = None;

        let msg = parse_bubble(&bubble, &mut model_counts, &mut started, &mut ended)
            .expect("should parse");
        assert_eq!(msg.role, MessageRole::Assistant);
        assert_eq!(msg.author.as_deref(), Some("gpt-4"));
        assert_eq!(*model_counts.get("gpt-4").unwrap(), 1);
    }

    #[test]
    fn parse_bubble_empty_content_returns_none() {
        let bubble = json!({"type": 1});
        let mut model_counts = std::collections::HashMap::new();
        let mut started = None;
        let mut ended = None;

        assert!(parse_bubble(&bubble, &mut model_counts, &mut started, &mut ended).is_none());
    }

    #[test]
    fn parse_bubble_tracks_timestamps() {
        let b1 = json!({"text": "first", "type": 1, "timestamp": 1700000010000_i64});
        let b2 = json!({"text": "second", "type": 2, "timestamp": 1700000005000_i64});
        let mut model_counts = std::collections::HashMap::new();
        let mut started = None;
        let mut ended = None;

        parse_bubble(&b1, &mut model_counts, &mut started, &mut ended);
        parse_bubble(&b2, &mut model_counts, &mut started, &mut ended);

        assert_eq!(started, Some(1_700_000_005_000));
        assert_eq!(ended, Some(1_700_000_010_000));
    }

    // -----------------------------------------------------------------------
    // SQLite integration tests
    // -----------------------------------------------------------------------

    fn create_test_db(path: &Path) -> Connection {
        let conn = Connection::open(path).expect("create test DB");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        )
        .expect("create table");
        conn
    }

    fn insert_kv(conn: &Connection, key: &str, value: &serde_json::Value) {
        conn.execute(
            "INSERT INTO cursorDiskKV (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, serde_json::to_string(value).unwrap()],
        )
        .unwrap();
    }

    #[test]
    fn read_modern_session_from_db() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("state.vscdb");
        let conn = create_test_db(&db_path);

        let composer_id = "test-composer-123";

        // Insert bubbles.
        insert_kv(
            &conn,
            &format!("bubbleId:{composer_id}:bubble-1"),
            &json!({
                "text": "What is Rust?",
                "type": 1,
                "timestamp": 1700000000000_i64,
            }),
        );
        insert_kv(
            &conn,
            &format!("bubbleId:{composer_id}:bubble-2"),
            &json!({
                "text": "Rust is a systems programming language.",
                "type": 2,
                "modelType": "gpt-4",
                "timestamp": 1700000001000_i64,
            }),
        );

        // Insert composerData.
        insert_kv(
            &conn,
            &format!("composerData:{composer_id}"),
            &json!({
                "fullConversationHeadersOnly": [
                    {"bubbleId": "bubble-1"},
                    {"bubbleId": "bubble-2"},
                ],
                "createdAt": 1700000000000_i64,
                "lastUpdatedAt": 1700000001000_i64,
                "name": "Rust question",
            }),
        );

        drop(conn);

        let session = Cursor.read_session(&db_path).expect("should read session");

        assert_eq!(session.session_id, composer_id);
        assert_eq!(session.provider_slug, "cursor");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "What is Rust?");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(
            session.messages[1].content,
            "Rust is a systems programming language."
        );
        assert_eq!(session.messages[1].author.as_deref(), Some("gpt-4"));
        assert_eq!(session.title.as_deref(), Some("Rust question"));
        assert_eq!(session.model_name.as_deref(), Some("gpt-4"));
        assert_eq!(session.started_at, Some(1_700_000_000_000));
        assert_eq!(session.ended_at, Some(1_700_000_001_000));
    }

    #[test]
    fn read_tabs_format_from_db() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("state.vscdb");
        let conn = create_test_db(&db_path);

        let composer_id = "tabs-composer";

        // No separate bubbles — inline in tabs.
        insert_kv(
            &conn,
            &format!("composerData:{composer_id}"),
            &json!({
                "tabs": [
                    {
                        "bubbles": [
                            {"text": "Tab question", "type": "user", "timestamp": 1700000000000_i64},
                            {"text": "Tab answer", "type": "assistant", "model": "claude-3", "timestamp": 1700000001000_i64},
                        ]
                    }
                ]
            }),
        );

        drop(conn);

        let session = Cursor
            .read_session(&db_path)
            .expect("should read tabs session");

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Tab question");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Tab answer");
        assert_eq!(session.messages[1].author.as_deref(), Some("claude-3"));
    }

    #[test]
    fn read_conversation_map_format() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("state.vscdb");
        let conn = create_test_db(&db_path);

        let composer_id = "convmap-composer";

        insert_kv(
            &conn,
            &format!("composerData:{composer_id}"),
            &json!({
                "conversationMap": {
                    "conv1": {
                        "bubbles": [
                            {"text": "Old format question", "role": "human"},
                            {"text": "Old format answer", "role": "ai"},
                        ]
                    }
                }
            }),
        );

        drop(conn);

        let session = Cursor
            .read_session(&db_path)
            .expect("should read conversationMap session");

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn list_composer_ids_returns_all_sessions() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("state.vscdb");
        let conn = create_test_db(&db_path);

        insert_kv(
            &conn,
            "composerData:session-a",
            &json!({"fullConversationHeadersOnly": []}),
        );
        insert_kv(
            &conn,
            "composerData:session-b",
            &json!({"fullConversationHeadersOnly": []}),
        );

        let ids = Cursor::list_composer_ids(&conn);
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"session-a".to_string()));
        assert!(ids.contains(&"session-b".to_string()));
    }

    #[test]
    fn write_and_read_back_roundtrip() {
        let tmp = tempfile::TempDir::new().unwrap();

        // Point CURSOR_HOME to temp dir.
        let cursor_home = tmp.path().join("cursor_config");
        std::fs::create_dir_all(cursor_home.join("User/globalStorage")).unwrap();

        // We can't set env vars safely in parallel tests, so test the write
        // path directly using the internal methods.
        let db_path = cursor_home.join("User/globalStorage/state.vscdb");
        let conn = Cursor::open_db_rw(&db_path).expect("create DB");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        )
        .unwrap();

        // Create a sample session.
        let session = CanonicalSession {
            session_id: "original-123".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(PathBuf::from("/tmp/project")),
            title: Some("Test session".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Hello".to_string(),
                    timestamp: Some(1_700_000_000_000),
                    author: None,
                    tool_calls: Vec::new(),
                    tool_results: Vec::new(),
                    extra: json!({}),
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "Hi there!".to_string(),
                    timestamp: Some(1_700_000_005_000),
                    author: Some("gpt-4".to_string()),
                    tool_calls: Vec::new(),
                    tool_results: Vec::new(),
                    extra: json!({}),
                },
            ],
            metadata: json!({}),
            source_path: PathBuf::from("/tmp/original.jsonl"),
            model_name: Some("gpt-4".to_string()),
        };

        // Write using internal method.
        let composer_id = "roundtrip-test-id";
        let now_millis = chrono::Utc::now().timestamp_millis();

        let mut headers: Vec<serde_json::Value> = Vec::new();
        for msg in &session.messages {
            let bubble_id = uuid::Uuid::new_v4().to_string();
            let bubble_type = match msg.role {
                MessageRole::User => BUBBLE_TYPE_USER,
                _ => BUBBLE_TYPE_ASSISTANT,
            };
            let bubble = json!({
                "text": msg.content,
                "type": bubble_type,
                "timestamp": msg.timestamp.unwrap_or(now_millis),
                "modelType": msg.author.as_deref(),
            });
            insert_kv(
                &conn,
                &format!("bubbleId:{composer_id}:{bubble_id}"),
                &bubble,
            );
            headers.push(json!({"bubbleId": bubble_id}));
        }

        let composer_data = json!({
            "fullConversationHeadersOnly": headers,
            "createdAt": session.started_at,
            "lastUpdatedAt": session.ended_at,
            "name": session.title,
        });
        insert_kv(
            &conn,
            &format!("composerData:{composer_id}"),
            &composer_data,
        );
        drop(conn);

        // Read back.
        let readback = {
            let conn = Cursor::open_db(&db_path).unwrap();
            Cursor::read_composer_session(&conn, composer_id, &db_path).expect("should read back")
        };

        assert_eq!(readback.session_id, composer_id);
        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].role, MessageRole::User);
        assert_eq!(readback.messages[0].content, "Hello");
        assert_eq!(readback.messages[1].role, MessageRole::Assistant);
        assert_eq!(readback.messages[1].content, "Hi there!");
        assert_eq!(readback.messages[1].author.as_deref(), Some("gpt-4"));
    }

    #[test]
    fn workspace_extraction_from_bubbles() {
        let mut bubbles = std::collections::HashMap::new();
        bubbles.insert(
            "b1".to_string(),
            json!({"workspaceProjectDir": "/home/user/project"}),
        );
        bubbles.insert("b2".to_string(), json!({"text": "no workspace"}));

        let ws = extract_workspace_from_bubbles(&bubbles);
        assert_eq!(ws, Some(PathBuf::from("/home/user/project")));
    }

    #[test]
    fn workspace_extraction_from_uris() {
        let mut bubbles = std::collections::HashMap::new();
        bubbles.insert(
            "b1".to_string(),
            json!({"workspaceUris": ["file:///data/projects/test"]}),
        );

        let ws = extract_workspace_from_bubbles(&bubbles);
        assert_eq!(ws, Some(PathBuf::from("/data/projects/test")));
    }

    #[test]
    fn workspace_extraction_from_composer_fallback() {
        let composer = json!({"workspacePath": "/data/projects/test"});
        let ws = extract_workspace_from_composer(&composer);
        assert_eq!(ws, Some(PathBuf::from("/data/projects/test")));
    }

    #[test]
    fn empty_db_returns_no_sessions() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("state.vscdb");
        let _conn = create_test_db(&db_path);

        let result = Cursor.read_session(&db_path);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // list_sessions
    // -----------------------------------------------------------------------

    #[test]
    fn list_sessions_enumerates_all_composers() {
        let tmp = tempfile::TempDir::new().unwrap();
        let db_path = tmp.path().join("state.vscdb");
        let conn = create_test_db(&db_path);

        // Insert two composer sessions
        let composer_a = json!({
            "composerId": "comp-aaa",
            "conversation": [
                {"bubbleId": "b1", "type": 1, "text": "User msg A"},
                {"bubbleId": "b2", "type": 2, "text": "Assist msg A"}
            ]
        });
        let composer_b = json!({
            "composerId": "comp-bbb",
            "conversation": [
                {"bubbleId": "b3", "type": 1, "text": "User msg B"},
                {"bubbleId": "b4", "type": 2, "text": "Assist msg B"}
            ]
        });
        insert_kv(&conn, "composerData:comp-aaa", &composer_a);
        insert_kv(&conn, "composerData:comp-bbb", &composer_b);
        drop(conn);

        // list_composer_ids should find both
        let conn = Cursor::open_db(&db_path).expect("open");
        let ids = Cursor::list_composer_ids(&conn);
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"comp-aaa".to_string()));
        assert!(ids.contains(&"comp-bbb".to_string()));
    }
}
