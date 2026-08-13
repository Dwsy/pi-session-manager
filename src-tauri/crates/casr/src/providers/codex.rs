//! Codex provider — reads/writes JSONL sessions under `~/.codex/sessions/`.
//!
//! Session files: `YYYY/MM/DD/rollout-N.jsonl`
//! Resume command: `codex resume <session-id>`
//!
//! ## JSONL format (modern envelope)
//!
//! Each line: `{ "type": "session_meta|response_item|event_msg", "timestamp": …, "payload": {…} }`
//!
//! - `session_meta` → workspace (`payload.cwd`), session ID (`payload.id`).
//! - `response_item` → main conversational messages (`payload.role`, `payload.content`).
//! - `event_msg` → sub-typed: `user_message`, `agent_reasoning` (conversational);
//!   `token_count`, `turn_aborted` (non-conversational).
//!
//! ## Legacy JSON format
//!
//! Single object: `{ "session": { "id", "cwd" }, "items": [ {role, content, timestamp} ] }`

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use anyhow::Context;
use rusqlite::types::Value;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use tracing::{debug, info, trace, warn};
use walkdir::WalkDir;

use crate::discovery::DetectionResult;
use crate::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content, normalize_role, parse_timestamp, reindex_messages, truncate_title};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Codex provider implementation.
pub struct Codex;

/// Generate the Codex rollout file path for a new session.
///
/// Convention: `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-<session-id>.jsonl`
///
/// The session ID is a ULID (timestamp-prefixed UUID).
pub fn rollout_path(sessions_dir: &Path, session_id: &str, now: &chrono::DateTime<chrono::Utc>) -> PathBuf {
    let date_dir = now.format("%Y/%m/%d").to_string();
    let ts_part = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    let filename = format!("rollout-{ts_part}-{session_id}.jsonl");
    sessions_dir.join(date_dir).join(filename)
}

impl Codex {
    /// Root directory for Codex data.
    /// Respects `CODEX_HOME` env var override.
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("CODEX_HOME") {
            return Some(PathBuf::from(home));
        }
        dirs::home_dir().map(|h| h.join(".codex"))
    }

    /// Sessions directory where rollout files live.
    fn sessions_dir() -> Option<PathBuf> {
        Self::home_dir().map(|h| h.join("sessions"))
    }
}

impl Provider for Codex {
    fn name(&self) -> &str {
        "Codex"
    }

    fn slug(&self) -> &str {
        "codex"
    }

    fn cli_alias(&self) -> &str {
        "cod"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if which::which("codex").is_ok() {
            evidence.push("codex binary found in PATH".to_string());
            installed = true;
        }

        if let Some(home) = Self::home_dir()
            && home.is_dir()
        {
            evidence.push(format!("{} exists", home.display()));
            installed = true;
        }

        trace!(provider = "codex", ?evidence, installed, "detection");
        DetectionResult { installed, version: None, evidence }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        match Self::sessions_dir() {
            Some(dir) if dir.is_dir() => vec![dir],
            _ => vec![],
        }
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        let sessions_dir = Self::sessions_dir()?;
        if !sessions_dir.is_dir() {
            return Some(vec![]);
        }

        let mut sessions: Vec<(String, PathBuf)> = Vec::new();
        for entry in WalkDir::new(&sessions_dir).max_depth(5).into_iter().filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !(name.starts_with("rollout-") && (name.ends_with(".jsonl") || name.ends_with(".json"))) {
                continue;
            }

            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };

            // Prefer authoritative ID from session_meta payload; otherwise
            // retain filename stem for best-effort diagnostics.
            let session_id = session_meta_id(path).unwrap_or_else(|| stem.to_string());
            sessions.push((session_id, path.to_path_buf()));
        }

        Some(sessions)
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let sessions_dir = Self::sessions_dir()?;
        if !sessions_dir.is_dir() {
            return None;
        }

        // Codex session IDs can be:
        // 1. A UUID embedded in the file content
        // 2. A relative path like "2026/02/06/rollout-1"
        //
        // Strategy: check if session_id is a relative path first,
        // then scan files for matching UUIDs.

        // Try as relative path (with or without extension).
        let as_path = sessions_dir.join(session_id);
        for ext in ["", ".jsonl", ".json"] {
            let candidate = if ext.is_empty() { as_path.clone() } else { as_path.with_extension(&ext[1..]) };
            if candidate.is_file() {
                debug!(path = %candidate.display(), "found Codex session by path");
                return Some(candidate);
            }
        }

        // Scan rollout files recursively.
        for entry in WalkDir::new(&sessions_dir).max_depth(5).into_iter().filter_map(Result::ok) {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str())
                && (name.starts_with("rollout-") && (name.ends_with(".jsonl") || name.ends_with(".json")))
                && path.is_file()
            {
                // Check if the relative path (minus extension) matches session_id.
                if let Ok(rel) = path.strip_prefix(&sessions_dir) {
                    let rel_str = rel.with_extension("").to_string_lossy().to_string();
                    if rel_str == session_id {
                        debug!(path = %path.display(), "found Codex session");
                        return Some(path.to_path_buf());
                    }
                }

                // Match by UUID suffix embedded in rollout filename:
                // rollout-YYYY-MM-DDThh-mm-ss-<session-id>.jsonl
                let name_no_ext = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
                if name_no_ext.ends_with(session_id) {
                    debug!(path = %path.display(), "found Codex session by filename suffix");
                    return Some(path.to_path_buf());
                }

                // Fallback: inspect `session_meta.payload.id` in file body.
                if session_meta_id(path).as_deref() == Some(session_id) {
                    debug!(path = %path.display(), "found Codex session by session_meta payload.id");
                    return Some(path.to_path_buf());
                }
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Codex session");

        // Try JSONL first, fall back to legacy JSON.
        let content = std::fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;

        // Detect format: if first non-whitespace char is '{' and the file has
        // multiple JSON lines, it's JSONL. If the top-level parse yields a
        // "session" or "items" key, it's legacy JSON.
        let trimmed = content.trim_start();
        if let Some(first_line) = trimmed.lines().next()
            && let Ok(obj) = serde_json::from_str::<serde_json::Value>(first_line)
            && (obj.get("session").is_some() || obj.get("items").is_some())
        {
            return self.read_legacy_json(path, &content);
        }

        self.read_jsonl(path, &content)
    }

    fn write_session(&self, session: &CanonicalSession, opts: &WriteOptions) -> anyhow::Result<WrittenSession> {
        let target_session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();

        let sessions_dir = Self::sessions_dir().ok_or_else(|| anyhow::anyhow!("cannot determine Codex sessions directory"))?;
        let target_path = rollout_path(&sessions_dir, &target_session_id, &now);

        debug!(
            target_session_id,
            target_path = %target_path.display(),
            "writing Codex session"
        );

        let mut lines: Vec<String> = Vec::with_capacity(session.messages.len() + 1);

        // 1. session_meta line.
        // Missing workspace falls back to the invoking cwd (never /tmp) so the
        // resumed thread points at the directory the user actually works in.
        let cwd = crate::model::effective_workspace(session).to_string_lossy().to_string();

        // Current Codex readers deserialize each rollout line's top-level
        // `timestamp` as an RFC3339 *string* (not a numeric epoch). Emit the
        // string form both at the envelope level and inside the payload.
        let now_iso = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        lines.push(serde_json::to_string(&serde_json::json!({
            "type": "session_meta",
            "timestamp": now_iso,
            "payload": {
                // Codex indexes threads by `id`; recent builds also read
                // `session_id`. Emit both so discovery works across versions.
                "id": target_session_id,
                "session_id": target_session_id,
                "cwd": cwd,
                "timestamp": now_iso,
                "originator": "casr",
                "cli_version": env!("CARGO_PKG_VERSION"),
                "source": "cli",
                "thread_source": "user",
                "model_provider": "openai",
            }
        }))?);

        // 2. Messages. Each envelope carries an RFC3339 string timestamp.
        for msg in &session.messages {
            let msg_iso = msg.timestamp.and_then(chrono::DateTime::from_timestamp_millis).unwrap_or(now).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

            for event in codex_events_for_message(msg, &msg_iso) {
                lines.push(serde_json::to_string(&event)?);
            }
        }

        let content_bytes = lines.join("\n").into_bytes();

        let outcome = crate::pipeline::atomic_write(&target_path, &content_bytes, opts.force, self.slug())?;

        info!(
            target_session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "Codex session written"
        );

        // 3. Register the session in Codex's thread index so `codex resume <id>`
        //    can discover it. Codex does not resume from a bare JSONL file — it
        //    looks the id up in `~/.codex/state_*.sqlite` (`threads` table).
        //    Failure here is non-fatal: the rollout file is already written.
        let first_user = session.messages.iter().find(|m| m.role == MessageRole::User).map(|m| m.content.as_str()).unwrap_or("");
        let title = session.title.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| {
            let t = truncate_title(first_user, 100);
            if t.is_empty() { "Resumed session (via casr)".to_string() } else { t }
        });
        let first_user_message = first_user.to_string();
        let preview = if first_user_message.trim().is_empty() { title.clone() } else { first_user_message.clone() };
        let warnings = Self::register_thread(&target_session_id, &outcome.target_path, &cwd, &title, &first_user_message, &preview, &now);

        Ok(WrittenSession { paths: vec![outcome.target_path], session_id: target_session_id.clone(), resume_command: self.resume_command(&target_session_id), backup_path: outcome.backup_path, warnings })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("codex resume {session_id}")
    }
}

// ---------------------------------------------------------------------------
// Codex thread-index (state_*.sqlite) registration
//
// `codex resume <id>` does NOT scan rollout JSONL files. It looks the id up in
// `~/.codex/state_*.sqlite`, table `threads`, whose `rollout_path` column
// points back at the rollout file. Writing the JSONL alone leaves the session
// undiscoverable ("No saved session found with ID"). We therefore register the
// converted session by upserting a `threads` row after the rollout is written.
//
// Safety posture (this mutates a live Codex DB):
//   * Introspect the actual `threads` schema; only write columns that exist.
//   * Never modify or delete rows for any other session id — the id is a fresh
//     UUIDv4, so the upsert only ever touches our own new row.
//   * Refuse to write (degrade with a warning) if the schema has a required
//     column we cannot populate, or if the state DB / `threads` table is absent.
//   * All writes run inside a single transaction with a busy timeout.
// ---------------------------------------------------------------------------

impl Codex {
    /// Locate the newest Codex thread-index database under `CODEX_HOME`/`~/.codex`.
    ///
    /// Matches `state.sqlite` and `state_<N>.sqlite`, preferring the highest
    /// `<N>` (the current schema). Sidecar `-wal`/`-shm` files are ignored.
    fn latest_state_db() -> Option<PathBuf> {
        let home = Self::home_dir()?;
        let mut best: Option<(i64, PathBuf)> = None;
        for entry in std::fs::read_dir(&home).ok()?.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if let Some(version) = state_db_version(name) {
                let replace = best.as_ref().is_none_or(|(v, _)| version > *v);
                if replace {
                    best = Some((version, path));
                }
            }
        }
        best.map(|(_, p)| p)
    }

    /// Register the converted session in Codex's thread index.
    ///
    /// Returns any non-fatal warnings to surface to the user (empty on success).
    /// A rollout file that could not be registered is still on disk, so the
    /// warning includes that path as a fallback.
    fn register_thread(session_id: &str, rollout_path: &Path, cwd: &str, title: &str, first_user_message: &str, preview: &str, now: &chrono::DateTime<chrono::Utc>) -> Vec<String> {
        let Some(db_path) = Self::latest_state_db() else {
            debug!("no Codex state_*.sqlite found; skipping thread registration");
            return vec![format!(
                "Codex thread index (~/.codex/state_*.sqlite) not found, so \
                 `codex resume {session_id}` may not discover this session. \
                 The rollout file was written to {}.",
                rollout_path.display()
            )];
        };

        match register_thread_in_db(&db_path, session_id, rollout_path, cwd, title, first_user_message, preview, now) {
            Ok(()) => {
                debug!(db = %db_path.display(), session_id, "registered Codex thread");
                Vec::new()
            }
            Err(e) => {
                warn!(db = %db_path.display(), error = %e, "failed to register Codex thread");
                vec![format!(
                    "Could not register the session in the Codex thread index \
                     ({db}): {e}. `codex resume {session_id}` may report \
                     \"No saved session found\"; the rollout file is at {path}.",
                    db = db_path.display(),
                    path = rollout_path.display(),
                )]
            }
        }
    }
}

/// Parse the schema version from a Codex state DB filename.
///
/// `state.sqlite` → 0, `state_5.sqlite` → 5. Returns `None` for anything else
/// (including the `-wal`/`-shm` sidecars).
fn state_db_version(name: &str) -> Option<i64> {
    let stem = name.strip_suffix(".sqlite")?;
    if stem == "state" {
        return Some(0);
    }
    stem.strip_prefix("state_")?.parse::<i64>().ok()
}

/// Introspected metadata for one `threads` column.
struct ColInfo {
    notnull: bool,
    has_default: bool,
}

/// Read `PRAGMA table_info(threads)` into a name → [`ColInfo`] map.
/// Returns an empty map if the table does not exist.
fn introspect_threads(conn: &Connection) -> anyhow::Result<HashMap<String, ColInfo>> {
    let mut map = HashMap::new();
    let Ok(mut stmt) = conn.prepare("PRAGMA table_info(threads)") else {
        return Ok(map);
    };
    let rows = stmt.query_map([], |row| {
        let name: String = row.get(1)?;
        let notnull: i64 = row.get(3)?;
        let dflt: Option<String> = row.get(4)?;
        Ok((name, ColInfo { notnull: notnull != 0, has_default: dflt.is_some() }))
    })?;
    for row in rows {
        let (name, info) = row?;
        map.insert(name, info);
    }
    Ok(map)
}

/// Environment-shaped column defaults copied from an existing (Codex-authored)
/// `threads` row, so values like `sandbox_policy` are guaranteed to be ones
/// Codex itself wrote and can parse back. Falls back to conservative literals.
struct EnvTemplate {
    source: String,
    model_provider: String,
    sandbox_policy: String,
    approval_mode: String,
    memory_mode: String,
    cli_version: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

fn read_env_template(conn: &Connection, cols: &HashMap<String, ColInfo>) -> EnvTemplate {
    let mut t = EnvTemplate { source: "cli".to_string(), model_provider: "openai".to_string(), sandbox_policy: r#"{"type":"read-only"}"#.to_string(), approval_mode: "on-request".to_string(), memory_mode: "enabled".to_string(), cli_version: None, model: None, reasoning_effort: None };

    // Prefer real values from the most recent normal user session.
    let wanted = ["source", "model_provider", "sandbox_policy", "approval_mode", "memory_mode", "cli_version", "model", "reasoning_effort"];
    let sel: Vec<&str> = wanted.iter().copied().filter(|c| cols.contains_key(*c)).collect();
    if sel.is_empty() {
        return t;
    }
    let where_clause = if cols.contains_key("thread_source") { "WHERE thread_source = 'user' OR thread_source IS NULL" } else { "" };
    let order = if cols.contains_key("updated_at") { "ORDER BY updated_at DESC, rowid DESC" } else { "ORDER BY rowid DESC" };
    let sql = format!("SELECT {} FROM threads {} {} LIMIT 1", sel.join(", "), where_clause, order);

    let got = conn.query_row(&sql, [], |row| {
        let mut vals: Vec<Option<String>> = Vec::with_capacity(sel.len());
        for i in 0..sel.len() {
            vals.push(row.get::<_, Option<String>>(i)?);
        }
        Ok(vals)
    });

    if let Ok(vals) = got {
        for (name, val) in sel.iter().zip(vals) {
            let Some(v) = val else { continue };
            if v.is_empty() {
                continue;
            }
            match *name {
                "source" => t.source = v,
                "model_provider" => t.model_provider = v,
                "sandbox_policy" => t.sandbox_policy = v,
                "approval_mode" => t.approval_mode = v,
                "memory_mode" => t.memory_mode = v,
                "cli_version" => t.cli_version = Some(v),
                "model" => t.model = Some(v),
                "reasoning_effort" => t.reasoning_effort = Some(v),
                _ => {}
            }
        }
    }
    t
}

/// Upsert one `threads` row for the converted session. See module comment above
/// for the safety posture. Only ever touches the row keyed by `session_id`.
#[expect(clippy::too_many_arguments, reason = "maps the several thread columns Codex needs; a struct would not add clarity")]
fn register_thread_in_db(db_path: &Path, session_id: &str, rollout_path: &Path, cwd: &str, title: &str, first_user_message: &str, preview: &str, now: &chrono::DateTime<chrono::Utc>) -> anyhow::Result<()> {
    let mut conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX).with_context(|| format!("open Codex state DB {}", db_path.display()))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    let cols = introspect_threads(&conn)?;
    if cols.is_empty() {
        anyhow::bail!("`threads` table is absent (unrecognized Codex schema)");
    }

    let env = read_env_template(&conn, &cols);

    // Absolute rollout path (Codex resolves the rollout by this exact value).
    let abs = if rollout_path.is_absolute() { rollout_path.to_path_buf() } else { std::env::current_dir().map(|d| d.join(rollout_path)).unwrap_or_else(|_| rollout_path.to_path_buf()) };
    let abs_str = abs.to_string_lossy().to_string();
    let created = now.timestamp();
    let created_ms = now.timestamp_millis();

    // Desired (column, value) pairs. Filtered to columns that actually exist so
    // the write is resilient across Codex schema versions.
    let mut desired: Vec<(&str, Value)> = vec![
        ("id", Value::Text(session_id.to_string())),
        ("rollout_path", Value::Text(abs_str.clone())),
        ("created_at", Value::Integer(created)),
        ("updated_at", Value::Integer(created)),
        ("created_at_ms", Value::Integer(created_ms)),
        ("updated_at_ms", Value::Integer(created_ms)),
        ("recency_at", Value::Integer(created)),
        ("recency_at_ms", Value::Integer(created_ms)),
        ("source", Value::Text(env.source)),
        ("model_provider", Value::Text(env.model_provider)),
        ("cwd", Value::Text(cwd.to_string())),
        ("title", Value::Text(title.to_string())),
        ("sandbox_policy", Value::Text(env.sandbox_policy)),
        ("approval_mode", Value::Text(env.approval_mode)),
        ("memory_mode", Value::Text(env.memory_mode)),
        ("first_user_message", Value::Text(first_user_message.to_string())),
        ("preview", Value::Text(preview.to_string())),
        ("thread_source", Value::Text("user".to_string())),
        ("has_user_event", Value::Integer(1)),
        ("cli_version", Value::Text(env.cli_version.unwrap_or_default())),
    ];
    // Optional Codex-native model metadata, only when we have a real value.
    if let Some(m) = env.model {
        desired.push(("model", Value::Text(m)));
    }
    if let Some(r) = env.reasoning_effort {
        desired.push(("reasoning_effort", Value::Text(r)));
    }

    let present: Vec<(&str, Value)> = desired.into_iter().filter(|(c, _)| cols.contains_key(*c)).collect();
    let provided: std::collections::HashSet<&str> = present.iter().map(|(c, _)| *c).collect();

    // Defensive: refuse to insert if the schema has a NOT NULL column with no
    // default that we do not populate (an unknown/incompatible schema version).
    let mut missing: Vec<&str> = cols.iter().filter(|(name, info)| info.notnull && !info.has_default && !provided.contains(name.as_str())).map(|(name, _)| name.as_str()).collect();
    if !missing.is_empty() {
        missing.sort_unstable();
        anyhow::bail!("Codex `threads` schema requires column(s) casr cannot populate: {}", missing.join(", "));
    }

    let col_names: Vec<&str> = present.iter().map(|(c, _)| *c).collect();
    let placeholders: Vec<String> = (1..=col_names.len()).map(|i| format!("?{i}")).collect();
    // Preserve original creation columns on conflict; refresh the rest.
    let update_set: Vec<String> = col_names.iter().filter(|c| !matches!(**c, "id" | "created_at" | "created_at_ms")).map(|c| format!("{c} = excluded.{c}")).collect();
    let conflict = if update_set.is_empty() { "ON CONFLICT(id) DO NOTHING".to_string() } else { format!("ON CONFLICT(id) DO UPDATE SET {}", update_set.join(", ")) };
    let sql = format!("INSERT INTO threads ({}) VALUES ({}) {}", col_names.join(", "), placeholders.join(", "), conflict,);
    let params: Vec<Value> = present.into_iter().map(|(_, v)| v).collect();

    let tx = conn.transaction().context("begin transaction")?;
    tx.execute(&sql, rusqlite::params_from_iter(params.iter())).context("insert thread row")?;
    tx.commit().context("commit thread row")?;

    // Verify the row landed and points at our rollout file.
    let ok = conn.query_row("SELECT 1 FROM threads WHERE id = ?1 AND rollout_path = ?2", rusqlite::params![session_id, abs_str], |_| Ok(true)).optional().context("verify thread row")?.unwrap_or(false);
    if !ok {
        anyhow::bail!("post-write verification failed: thread row not found for {session_id}");
    }
    Ok(())
}

/// Build the Codex JSONL event(s) for one canonical message.
///
/// `msg_ts` is the event timestamp as an RFC3339 string, matching the
/// top-level `timestamp` format current Codex readers expect.
fn codex_events_for_message(msg: &CanonicalMessage, msg_ts: &str) -> Vec<serde_json::Value> {
    // User messages that carry tool payloads must be serialized as response_item
    // envelopes; event_msg/user_message cannot represent tool_use/tool_result blocks.
    let user_needs_response_item = msg.role == MessageRole::User && (!msg.tool_calls.is_empty() || !msg.tool_results.is_empty());

    match msg.role {
        MessageRole::User if !user_needs_response_item => vec![serde_json::json!({
            "type": "event_msg",
            "timestamp": msg_ts,
            "payload": {
                "type": "user_message",
                "message": msg.content,
            }
        })],
        MessageRole::User => vec![serde_json::json!({
            "type": "response_item",
            "timestamp": msg_ts,
            "payload": {
                "type": "message",
                "role": codex_role_string(&msg.role),
                "content": codex_response_content(msg),
            }
        })],
        MessageRole::Assistant if msg.author.as_deref() == Some("reasoning") => {
            vec![serde_json::json!({
                "type": "event_msg",
                "timestamp": msg_ts,
                "payload": {
                    "type": "agent_reasoning",
                    "text": msg.content,
                }
            })]
        }
        MessageRole::Assistant | MessageRole::Tool | MessageRole::System | MessageRole::Other(_) => {
            let mut events = vec![serde_json::json!({
                "type": "response_item",
                "timestamp": msg_ts,
                "payload": {
                    "type": "message",
                    "role": codex_role_string(&msg.role),
                    "content": codex_response_content(msg),
                }
            })];

            if let Some(info) = codex_token_count_info(&msg.extra) {
                events.push(serde_json::json!({
                    "type": "event_msg",
                    "timestamp": msg_ts,
                    "payload": {
                        "type": "token_count",
                        "info": info,
                    }
                }));
            }

            events
        }
    }
}

fn codex_role_string(role: &MessageRole) -> String {
    match role {
        MessageRole::User => "user".to_string(),
        MessageRole::Assistant => "assistant".to_string(),
        MessageRole::Tool => "tool".to_string(),
        MessageRole::System => "developer".to_string(),
        MessageRole::Other(other) => other.clone(),
    }
}

fn codex_response_content(msg: &CanonicalMessage) -> serde_json::Value {
    let mut blocks: Vec<serde_json::Value> = Vec::new();

    // Codex expects "output_text" for assistant-generated content blocks,
    // "input_text" for user-supplied content blocks.
    let text_type = if msg.role == MessageRole::Assistant { "output_text" } else { "input_text" };

    if !msg.content.is_empty() {
        blocks.push(serde_json::json!({
            "type": text_type,
            "text": msg.content,
        }));
    }

    for tc in &msg.tool_calls {
        blocks.push(serde_json::json!({
            "type": "tool_use",
            "id": tc.id.as_deref().unwrap_or(""),
            "name": tc.name,
            "input": tc.arguments,
        }));
    }

    for tr in &msg.tool_results {
        blocks.push(serde_json::json!({
            "type": "tool_result",
            "tool_use_id": tr.call_id.as_deref().unwrap_or(""),
            "content": tr.content,
            "is_error": tr.is_error,
        }));
    }

    // Avoid empty response payloads in provider-native output.
    if blocks.is_empty() {
        blocks.push(serde_json::json!({
            "type": text_type,
            "text": msg.content,
        }));
    }

    serde_json::Value::Array(blocks)
}

fn codex_token_count_info(extra: &serde_json::Value) -> Option<serde_json::Value> {
    let mut sources: Vec<&serde_json::Value> = Vec::new();
    sources.push(extra);
    if let Some(payload) = extra.get("payload") {
        sources.push(payload);
    }

    let mut candidates: Vec<&serde_json::Value> = Vec::new();
    for source in sources {
        if let Some(usage) = source.get("usage") {
            candidates.push(usage);
        }
        if let Some(token_count) = source.get("token_count") {
            if let Some(info) = token_count.get("info") {
                candidates.push(info);
            }
            candidates.push(token_count);
        }
        candidates.push(source);
    }

    for candidate in candidates {
        let Some(obj) = candidate.as_object() else {
            continue;
        };

        let mut info = serde_json::Map::new();
        insert_token_count(&mut info, obj, "input_tokens", "inputTokens");
        insert_token_count(&mut info, obj, "output_tokens", "outputTokens");
        insert_token_count(&mut info, obj, "total_tokens", "totalTokens");
        insert_token_count(&mut info, obj, "cached_input_tokens", "cachedInputTokens");
        insert_token_count(&mut info, obj, "reasoning_tokens", "reasoningTokens");

        if !info.is_empty() {
            return Some(serde_json::Value::Object(info));
        }
    }

    None
}

fn insert_token_count(out: &mut serde_json::Map<String, serde_json::Value>, obj: &serde_json::Map<String, serde_json::Value>, snake: &str, camel: &str) {
    if let Some(value) = obj.get(snake).or_else(|| obj.get(camel))
        && let Some(num) = token_count_number(value)
    {
        out.insert(snake.to_string(), serde_json::Value::Number(num.into()));
    }
}

fn token_count_number(value: &serde_json::Value) -> Option<i64> {
    if let Some(i) = value.as_i64() {
        return Some(i);
    }
    if let Some(u) = value.as_u64() {
        return i64::try_from(u).ok();
    }
    value.as_str().and_then(|s| s.parse::<i64>().ok())
}

// ---------------------------------------------------------------------------
// JSONL / legacy JSON parsing
// ---------------------------------------------------------------------------

impl Codex {
    /// Parse modern JSONL envelope format.
    fn read_jsonl(&self, path: &Path, content: &str) -> anyhow::Result<CanonicalSession> {
        let reader = BufReader::new(content.as_bytes());

        let mut session_id: Option<String> = None;
        let mut workspace: Option<PathBuf> = None;
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;
        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut skipped: usize = 0;
        let mut line_num: usize = 0;

        for line_result in reader.lines() {
            line_num += 1;
            let line = match line_result {
                Ok(l) => l,
                Err(e) => {
                    warn!(line = line_num, error = %e, "skipping unreadable line");
                    skipped += 1;
                    continue;
                }
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let envelope: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    warn!(line = line_num, error = %e, "skipping malformed JSON line");
                    skipped += 1;
                    continue;
                }
            };

            let event_type = envelope.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let payload = envelope.get("payload");

            // Extract timestamp from envelope level.
            let ts = envelope.get("timestamp").and_then(parse_timestamp);
            if let Some(t) = ts {
                started_at = Some(started_at.map_or(t, |s: i64| s.min(t)));
                ended_at = Some(ended_at.map_or(t, |e: i64| e.max(t)));
            }

            match event_type {
                "session_meta" => {
                    if let Some(p) = payload {
                        if session_id.is_none() {
                            session_id = p.get("id").and_then(|v| v.as_str()).map(String::from);
                        }
                        if workspace.is_none() {
                            workspace = p.get("cwd").and_then(|v| v.as_str()).map(PathBuf::from);
                        }
                    }
                }
                "response_item" => {
                    if let Some(p) = payload {
                        let content_val = p.get("content");
                        let text = codex_extract_text_content(content_val);
                        let mut tool_calls = codex_extract_tool_calls(content_val);
                        tool_calls.extend(codex_extract_payload_tool_calls(p));
                        let mut tool_results = codex_extract_tool_results(content_val);
                        tool_results.extend(codex_extract_payload_tool_results(p));

                        if text.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                            trace!(line = line_num, "skipping empty response_item");
                            continue;
                        }

                        // `function_call_output` / `custom_tool_call_output` events
                        // carry no `role` field and would otherwise default to
                        // "assistant". The Anthropic API (and Claude Code resume)
                        // require tool results to live in *user* turns, so we
                        // classify them as Tool — target writers map Tool → user side.
                        // Older rollouts omit the payload type, so a payload that
                        // carries nothing but tool results is treated the same way.
                        let payload_type = p.get("type").and_then(|v| v.as_str()).unwrap_or_default();
                        let role = if matches!(payload_type, "function_call_output" | "custom_tool_call_output") || (text.trim().is_empty() && tool_calls.is_empty() && !tool_results.is_empty()) {
                            MessageRole::Tool
                        } else {
                            let role_str = p.get("role").and_then(|v| v.as_str()).unwrap_or("assistant");
                            normalize_role(role_str)
                        };

                        let next_message = CanonicalMessage { idx: 0, role, content: text, timestamp: ts, author: None, tool_calls, tool_results, extra: envelope };

                        // Some Codex files mirror user turns in both
                        // `response_item(message:user)` and `event_msg(user_message)`.
                        // Drop exact adjacent duplicates to preserve clean alternation.
                        let is_adjacent_user_duplicate = messages.last().is_some_and(|prev| prev.role == MessageRole::User && next_message.role == MessageRole::User && prev.content == next_message.content && prev.timestamp == next_message.timestamp);
                        if is_adjacent_user_duplicate {
                            trace!(line = line_num, "skipping duplicate user response_item");
                            continue;
                        }

                        messages.push(next_message);
                    }
                }
                "event_msg" => {
                    if let Some(p) = payload {
                        let sub_type = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        match sub_type {
                            "user_message" => {
                                let text = p.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if !text.trim().is_empty() {
                                    let next_message = CanonicalMessage { idx: 0, role: MessageRole::User, content: text, timestamp: ts, author: None, tool_calls: vec![], tool_results: vec![], extra: envelope };

                                    let is_adjacent_user_duplicate = messages.last().is_some_and(|prev| prev.role == MessageRole::User && prev.content == next_message.content && prev.timestamp == next_message.timestamp);
                                    if is_adjacent_user_duplicate {
                                        trace!(line = line_num, "skipping duplicate user event_msg");
                                        continue;
                                    }

                                    messages.push(next_message);
                                }
                            }
                            "agent_reasoning" => {
                                let text = p.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if !text.trim().is_empty() {
                                    messages.push(CanonicalMessage { idx: 0, role: MessageRole::Assistant, content: text, timestamp: ts, author: Some("reasoning".to_string()), tool_calls: vec![], tool_results: vec![], extra: envelope });
                                }
                            }
                            "tool_call" => {
                                // Legacy Codex event_msg tool calls. Modern rollouts use response_item function_call.
                                let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                                let call_id = p.get("call_id").or_else(|| p.get("id")).and_then(|v| v.as_str()).map(String::from);
                                let arguments = p.get("input").or_else(|| p.get("arguments")).map(codex_parse_arguments_value).unwrap_or(serde_json::Value::Null);
                                messages.push(CanonicalMessage { idx: 0, role: MessageRole::Assistant, content: String::new(), timestamp: ts, author: None, tool_calls: vec![ToolCall { id: call_id, name, arguments }], tool_results: vec![], extra: envelope });
                            }
                            _ => {
                                trace!(line = line_num, sub_type, "skipping non-conversational event_msg");
                            }
                        }
                    }
                }
                "compacted" => {
                    // A compaction event replaces all accumulated history with a
                    // condensed `replacement_history` snapshot — the source
                    // agent's live context at that point. Resetting here means
                    // the converted session mirrors the *live* context rather than
                    // replaying the full on-disk archive (a session can compact
                    // dozens of times; only the final snapshot plus post-compaction
                    // events are actually in context).
                    if let Some(p) = payload {
                        let mut replacement: Vec<CanonicalMessage> = Vec::new();
                        if let Some(items) = p.get("replacement_history").and_then(|v| v.as_array()) {
                            for item in items {
                                let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or_default();
                                let role = if matches!(item_type, "function_call_output" | "custom_tool_call_output") {
                                    MessageRole::Tool
                                } else {
                                    let role_str = item.get("role").and_then(|v| v.as_str()).unwrap_or("assistant");
                                    normalize_role(role_str)
                                };
                                let content_val = item.get("content");
                                let text = codex_extract_text_content(content_val);
                                let mut tool_calls = codex_extract_tool_calls(content_val);
                                tool_calls.extend(codex_extract_payload_tool_calls(item));
                                let mut tool_results = codex_extract_tool_results(content_val);
                                tool_results.extend(codex_extract_payload_tool_results(item));
                                if text.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                                    continue;
                                }
                                replacement.push(CanonicalMessage { idx: 0, role, content: text, timestamp: ts, author: None, tool_calls, tool_results, extra: serde_json::Value::Null });
                            }
                        }
                        // An optional free-text summary accompanying the compaction.
                        if let Some(summary) = p.get("message").and_then(|v| v.as_str())
                            && !summary.trim().is_empty()
                        {
                            replacement.push(CanonicalMessage { idx: 0, role: MessageRole::Assistant, content: summary.to_string(), timestamp: ts, author: Some("summary".to_string()), tool_calls: vec![], tool_results: vec![], extra: serde_json::Value::Null });
                        }
                        debug!(line = line_num, replaced = messages.len(), kept = replacement.len(), "codex compaction: resetting history to replacement_history");
                        messages = replacement;
                    }
                }
                _ => {
                    trace!(line = line_num, event_type, "skipping unknown event type");
                }
            }
        }

        reindex_messages(&mut messages);
        self.build_session(path, session_id, workspace, started_at, ended_at, messages, skipped)
    }

    /// Parse legacy single-JSON format: `{ "session": {…}, "items": […] }`.
    fn read_legacy_json(&self, path: &Path, content: &str) -> anyhow::Result<CanonicalSession> {
        let root: serde_json::Value = serde_json::from_str(content).with_context(|| format!("failed to parse legacy JSON {}", path.display()))?;

        let session_obj = root.get("session");
        let session_id = session_obj.and_then(|s| s.get("id")).and_then(|v| v.as_str()).map(String::from);
        let workspace = session_obj.and_then(|s| s.get("cwd")).and_then(|v| v.as_str()).map(PathBuf::from);

        let items = root.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        let mut messages = Vec::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;

        for item in &items {
            let role_str = item.get("role").and_then(|v| v.as_str()).unwrap_or("assistant");
            let role = normalize_role(role_str);

            let text = item.get("content").map(flatten_content).unwrap_or_default();
            if text.trim().is_empty() {
                continue;
            }

            let ts = item.get("timestamp").and_then(parse_timestamp);
            if let Some(t) = ts {
                started_at = Some(started_at.map_or(t, |s: i64| s.min(t)));
                ended_at = Some(ended_at.map_or(t, |e: i64| e.max(t)));
            }

            messages.push(CanonicalMessage { idx: 0, role, content: text, timestamp: ts, author: None, tool_calls: vec![], tool_results: vec![], extra: item.clone() });
        }

        reindex_messages(&mut messages);
        self.build_session(path, session_id, workspace, started_at, ended_at, messages, 0)
    }

    /// Assemble the final `CanonicalSession` from parsed data.
    #[expect(clippy::too_many_arguments, reason = "internal builder; clarity > refactoring")]
    fn build_session(&self, path: &Path, session_id: Option<String>, workspace: Option<PathBuf>, started_at: Option<i64>, ended_at: Option<i64>, messages: Vec<CanonicalMessage>, skipped: usize) -> anyhow::Result<CanonicalSession> {
        // Derive session ID from relative path if not in content.
        let session_id = session_id.unwrap_or_else(|| {
            if let Some(sessions_dir) = Self::sessions_dir()
                && let Ok(rel) = path.strip_prefix(&sessions_dir)
            {
                return rel.with_extension("").to_string_lossy().to_string();
            }
            path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string()
        });

        let title = messages.iter().find(|m| m.role == MessageRole::User).map(|m| truncate_title(&m.content, 100));

        let mut metadata = serde_json::Map::new();
        metadata.insert("source".into(), serde_json::Value::String("codex".to_string()));

        debug!(session_id, messages = messages.len(), skipped, "Codex session parsed");

        Ok(CanonicalSession { session_id, provider_slug: "codex".to_string(), workspace, title, started_at, ended_at, messages, metadata: serde_json::Value::Object(metadata), source_path: path.to_path_buf(), model_name: None })
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract only plain assistant/user text from Codex content blocks.
///
/// We intentionally ignore `tool_use` and `tool_result` blocks here because
/// those are parsed into structured `tool_calls` / `tool_results` separately.
/// Including tool blocks in flattened text causes read-back content inflation
/// and spurious verification mismatches.
fn codex_extract_text_content(content: Option<&serde_json::Value>) -> String {
    let Some(value) = content else {
        return String::new();
    };

    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(blocks) => {
            let mut parts: Vec<String> = Vec::new();
            for block in blocks {
                match block {
                    serde_json::Value::String(s) => parts.push(s.clone()),
                    serde_json::Value::Object(obj) => {
                        let block_type = obj.get("type").and_then(|v| v.as_str());
                        if (matches!(block_type, Some("text") | Some("input_text") | Some("output_text")) || block_type.is_none())
                            && let Some(text) = obj.get("text").and_then(|v| v.as_str())
                        {
                            parts.push(text.to_string());
                        }
                    }
                    _ => {}
                }
            }
            parts.join("\n")
        }
        serde_json::Value::Object(obj) => obj.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        _ => String::new(),
    }
}

/// Extract tool calls from Codex content blocks.
fn codex_extract_tool_calls(content: Option<&serde_json::Value>) -> Vec<ToolCall> {
    let Some(serde_json::Value::Array(blocks)) = content else {
        return vec![];
    };
    blocks
        .iter()
        .filter_map(|block| {
            let obj = block.as_object()?;
            if obj.get("type")?.as_str()? != "tool_use" {
                return None;
            }
            Some(ToolCall { id: obj.get("id").and_then(|v| v.as_str()).map(String::from), name: obj.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(), arguments: obj.get("input").cloned().unwrap_or(serde_json::Value::Null) })
        })
        .collect()
}

/// Extract tool results from Codex content blocks.
fn codex_extract_tool_results(content: Option<&serde_json::Value>) -> Vec<ToolResult> {
    let Some(serde_json::Value::Array(blocks)) = content else {
        return vec![];
    };
    blocks
        .iter()
        .filter_map(|block| {
            let obj = block.as_object()?;
            if obj.get("type")?.as_str()? != "tool_result" {
                return None;
            }
            Some(ToolResult {
                call_id: obj.get("tool_use_id").and_then(|v| v.as_str()).map(String::from),
                content: obj.get("content").and_then(|v| v.as_str()).or_else(|| obj.get("output").and_then(|v| v.as_str())).unwrap_or("").to_string(),
                is_error: obj.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false),
            })
        })
        .collect()
}

fn codex_extract_payload_tool_calls(payload: &serde_json::Value) -> Vec<ToolCall> {
    let payload_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or_default();
    if !matches!(payload_type, "function_call" | "custom_tool_call") {
        return vec![];
    }

    let arguments = payload.get("arguments").or_else(|| payload.get("input")).or_else(|| payload.get("args")).map(codex_parse_arguments_value).unwrap_or(serde_json::Value::Null);

    vec![ToolCall {
        id: payload.get("call_id").or_else(|| payload.get("id")).or_else(|| payload.get("tool_use_id")).and_then(|v| v.as_str()).map(String::from),
        name: payload.get("name").or_else(|| payload.pointer("/function/name")).and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
        arguments,
    }]
}

fn codex_extract_payload_tool_results(payload: &serde_json::Value) -> Vec<ToolResult> {
    let payload_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or_default();
    if !matches!(payload_type, "function_call_output" | "custom_tool_call_output") {
        return vec![];
    }

    let content = payload.get("output").or_else(|| payload.get("content")).or_else(|| payload.get("result")).map(flatten_content).unwrap_or_default();
    let is_error = payload.get("is_error").and_then(|v| v.as_bool()).or_else(|| payload.get("status").and_then(|v| v.as_str()).map(|status| status == "error")).unwrap_or(false);

    vec![ToolResult { call_id: payload.get("call_id").or_else(|| payload.get("tool_use_id")).or_else(|| payload.get("id")).and_then(|v| v.as_str()).map(String::from), content, is_error }]
}

fn codex_parse_arguments_value(value: &serde_json::Value) -> serde_json::Value {
    if let Some(text) = value.as_str() { if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(text) { parsed } else { serde_json::Value::String(text.to_string()) } } else { value.clone() }
}

/// Extract `session_meta.payload.id` from a Codex rollout file.
fn session_meta_id(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().map_while(Result::ok).take(64) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let envelope: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if envelope.get("type").and_then(|v| v.as_str()) == Some("session_meta") {
            return envelope.pointer("/payload/id").and_then(|v| v.as_str()).map(ToString::to_string);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{Codex, codex_events_for_message, rollout_path};
    use chrono::{TimeZone, Utc};
    use serde_json::json;
    use std::path::Path;

    use crate::model::{CanonicalMessage, MessageRole, ToolCall, ToolResult};
    use crate::providers::Provider;

    #[test]
    fn rollout_path_includes_date_hierarchy_and_uuid_suffix() {
        let now = Utc.with_ymd_and_hms(2026, 2, 9, 6, 7, 8).single().expect("valid timestamp");
        let path = rollout_path(Path::new("/tmp/codex/sessions"), "019c40fd-3c51-7621-a418-68203585f589", &now);
        let path_str = path.to_string_lossy();
        assert!(path_str.ends_with("2026/02/09/rollout-2026-02-09T06-07-08-019c40fd-3c51-7621-a418-68203585f589.jsonl"), "{path_str}");
    }

    #[test]
    fn assistant_events_include_tool_calls_results_and_token_count() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "Applied the patch".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![ToolCall { id: Some("call-1".to_string()), name: "apply_patch".to_string(), arguments: json!({"path":"src/providers/codex.rs"}) }],
            tool_results: vec![ToolResult { call_id: Some("call-1".to_string()), content: "ok".to_string(), is_error: false }],
            extra: json!({
                "usage": {
                    "input_tokens": 11,
                    "output_tokens": 22,
                    "total_tokens": 33
                }
            }),
        };

        let events = codex_events_for_message(&msg, "2026-02-09T06:07:08.000Z");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["type"], "response_item");
        assert_eq!(events[0]["payload"]["type"], "message");
        let content_blocks = events[0]["payload"]["content"].as_array().expect("response_item content should be array");
        assert!(content_blocks.iter().any(|b| b["type"] == "tool_use"));
        assert!(content_blocks.iter().any(|b| b["type"] == "tool_result"));

        assert_eq!(events[1]["type"], "event_msg");
        assert_eq!(events[1]["payload"]["type"], "token_count");
        assert_eq!(events[1]["payload"]["info"]["input_tokens"], 11);
        assert_eq!(events[1]["payload"]["info"]["output_tokens"], 22);
        assert_eq!(events[1]["payload"]["info"]["total_tokens"], 33);
    }

    #[test]
    fn user_message_with_tool_payload_is_serialized_as_response_item() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: String::new(),
            timestamp: None,
            author: None,
            tool_calls: vec![ToolCall { id: Some("call-7".to_string()), name: "Read".to_string(), arguments: json!({"file_path":"src/main.rs"}) }],
            tool_results: vec![ToolResult { call_id: Some("call-7".to_string()), content: "fn main() {}".to_string(), is_error: false }],
            extra: json!({}),
        };

        let events = codex_events_for_message(&msg, "2026-02-09T06:07:08.000Z");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "response_item");
        assert_eq!(events[0]["payload"]["type"], "message");
        assert_eq!(events[0]["payload"]["role"], "user");
        let blocks = events[0]["payload"]["content"].as_array().expect("response_item content should be array");
        assert!(blocks.iter().any(|b| b["type"] == "tool_use"));
        assert!(blocks.iter().any(|b| b["type"] == "tool_result"));
    }

    #[test]
    fn response_item_with_only_tool_result_is_not_dropped() {
        let file_text = serde_json::to_string(&json!({
            "type": "response_item",
            "timestamp": 1700000000.0,
            "payload": {
                "role": "assistant",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "call-2",
                    "content": "lint clean",
                    "is_error": false
                }]
            }
        }))
        .expect("serializable test envelope");

        let provider = Codex;
        let session = provider.read_jsonl(Path::new("/tmp/rollout-test.jsonl"), &file_text).expect("Codex JSONL reader should parse tool_result-only response_item");

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_results.len(), 1);
        assert_eq!(session.messages[0].tool_results[0].content, "lint clean");
    }

    #[test]
    fn payload_function_call_is_parsed_as_tool_call() {
        let file_text = serde_json::to_string(&json!({
            "type": "response_item",
            "timestamp": 1700000000.0,
            "payload": {
                "type": "function_call",
                "role": "assistant",
                "call_id": "call-42",
                "name": "Read",
                "arguments": "{\"file_path\":\"src/main.rs\"}"
            }
        }))
        .expect("serializable test envelope");

        let provider = Codex;
        let session = provider.read_jsonl(Path::new("/tmp/rollout-fc.jsonl"), &file_text).expect("Codex JSONL reader should parse payload-level function_call");

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_calls.len(), 1);
        assert_eq!(session.messages[0].tool_calls[0].name, "Read");
        assert_eq!(session.messages[0].tool_calls[0].id.as_deref(), Some("call-42"));
        assert_eq!(session.messages[0].tool_calls[0].arguments["file_path"], "src/main.rs");
    }

    #[test]
    fn payload_function_call_output_is_parsed_as_tool_result() {
        let file_text = serde_json::to_string(&json!({
            "type": "response_item",
            "timestamp": 1700000000.0,
            "payload": {
                "type": "function_call_output",
                "role": "assistant",
                "call_id": "call-42",
                "output": "done"
            }
        }))
        .expect("serializable test envelope");

        let provider = Codex;
        let session = provider.read_jsonl(Path::new("/tmp/rollout-fco.jsonl"), &file_text).expect("Codex JSONL reader should parse payload-level function_call_output");

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_results.len(), 1);
        assert_eq!(session.messages[0].tool_results[0].call_id.as_deref(), Some("call-42"));
        assert_eq!(session.messages[0].tool_results[0].content, "done");
    }

    #[test]
    fn resume_command_uses_subcommand_form() {
        let provider = Codex;
        assert_eq!(<Codex as Provider>::resume_command(&provider, "abc123"), "codex resume abc123");
    }

    // -----------------------------------------------------------------------
    // Reader unit tests
    // -----------------------------------------------------------------------

    /// Read Codex JSONL from an inline string.
    fn read_codex_jsonl(content: &str) -> crate::model::CanonicalSession {
        let provider = Codex;
        provider.read_jsonl(Path::new("/tmp/test-rollout.jsonl"), content).unwrap_or_else(|e| panic!("read_jsonl failed: {e}"))
    }

    /// Read Codex legacy JSON from an inline string.
    fn read_codex_legacy(content: &str) -> crate::model::CanonicalSession {
        let provider = Codex;
        provider.read_legacy_json(Path::new("/tmp/test-legacy.json"), content).unwrap_or_else(|e| panic!("read_legacy_json failed: {e}"))
    }

    #[test]
    fn reader_jsonl_basic_exchange() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"test-001","cwd":"/data/proj"}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Hello"}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Hi back"}]}}"#,
        );
        assert_eq!(session.session_id, "test-001");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Hi back");
        assert_eq!(session.workspace, Some(std::path::PathBuf::from("/data/proj")));
    }

    #[test]
    fn reader_jsonl_assistant_output_text_is_preserved() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"out-1","cwd":"/tmp"}}
{"type":"response_item","timestamp":1700000001.0,"payload":{"role":"user","content":[{"type":"input_text","text":"Ping"}]}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"role":"assistant","content":[{"type":"output_text","text":"Pong"}]}}"#,
        );

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Ping");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Pong");
    }

    #[test]
    fn reader_jsonl_reasoning_events() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"r1","cwd":"/tmp"}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Q"}}
{"type":"event_msg","timestamp":1700000002.0,"payload":{"type":"agent_reasoning","text":"Thinking about it..."}}
{"type":"response_item","timestamp":1700000003.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Answer"}]}}"#,
        );
        assert_eq!(session.messages.len(), 3);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].author.as_deref(), Some("reasoning"));
        assert_eq!(session.messages[1].content, "Thinking about it...");
    }

    #[test]
    fn reader_jsonl_skips_non_conversational_events() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"skip1","cwd":"/tmp"}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Q"}}
{"type":"event_msg","timestamp":1700000002.0,"payload":{"type":"token_count","info":{"input_tokens":100}}}
{"type":"event_msg","timestamp":1700000003.0,"payload":{"type":"turn_aborted"}}
{"type":"response_item","timestamp":1700000004.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"A"}]}}"#,
        );
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_jsonl_tool_calls_in_response_item() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"tc1","cwd":"/tmp"}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Run it"}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Running"},{"type":"tool_use","id":"call-1","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        assert_eq!(session.messages[1].content, "Running");
        assert_eq!(session.messages[1].tool_calls.len(), 1);
        assert_eq!(session.messages[1].tool_calls[0].name, "Bash");
    }

    #[test]
    fn reader_jsonl_dedupes_mirrored_user_entries() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"dup-u","cwd":"/tmp"}}
{"type":"response_item","timestamp":1700000001.0,"payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Same user turn"}]}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Same user turn"}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Answer"}]}}"#,
        );

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Same user turn");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Answer");
    }

    #[test]
    fn reader_jsonl_tolerates_malformed_lines() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"mf1","cwd":"/tmp"}}
not json
{"broken
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Valid"}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Also valid"}]}}"#,
        );
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_jsonl_empty_content_skipped() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"ec1","cwd":"/tmp"}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":""}}
{"type":"event_msg","timestamp":1700000002.0,"payload":{"type":"user_message","message":"   "}}
{"type":"event_msg","timestamp":1700000003.0,"payload":{"type":"user_message","message":"Valid"}}
{"type":"response_item","timestamp":1700000004.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Reply"}]}}"#,
        );
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_jsonl_session_id_fallback() {
        let session = read_codex_jsonl(
            r#"{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"No meta"}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Reply"}]}}"#,
        );
        // No session_meta → ID falls back to filename stem.
        assert!(!session.session_id.is_empty());
    }

    #[test]
    fn reader_legacy_json_basic() {
        let session = read_codex_legacy(
            r#"{"session":{"id":"legacy-1","cwd":"/home/user/proj"},"items":[
                {"role":"user","content":"Fix the bug","timestamp":1700000000},
                {"role":"assistant","content":"Fixed it","timestamp":1700000010}
            ]}"#,
        );
        assert_eq!(session.session_id, "legacy-1");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.workspace, Some(std::path::PathBuf::from("/home/user/proj")));
        assert!(session.started_at.is_some());
    }

    #[test]
    fn reader_legacy_json_empty_items() {
        let session = read_codex_legacy(r#"{"session":{"id":"empty-1","cwd":"/tmp"},"items":[]}"#);
        assert_eq!(session.messages.len(), 0);
    }

    #[test]
    fn reader_legacy_json_skips_empty_content() {
        let session = read_codex_legacy(
            r#"{"session":{"id":"skip-1","cwd":"/tmp"},"items":[
                {"role":"user","content":"","timestamp":1700000000},
                {"role":"user","content":"Real","timestamp":1700000001},
                {"role":"assistant","content":"Reply","timestamp":1700000002}
            ]}"#,
        );
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_codex_jsonl(
            r#"{"type":"session_meta","timestamp":1700000000.0,"payload":{"id":"t1","cwd":"/tmp"}}
{"type":"event_msg","timestamp":1700000001.0,"payload":{"type":"user_message","message":"Optimize the database query"}}
{"type":"response_item","timestamp":1700000002.0,"payload":{"role":"assistant","content":[{"type":"input_text","text":"Done"}]}}"#,
        );
        assert_eq!(session.title.as_deref(), Some("Optimize the database query"));
    }

    // -----------------------------------------------------------------------
    // Writer helper unit tests
    // -----------------------------------------------------------------------

    use super::codex_role_string;

    #[test]
    fn writer_user_event_format() {
        let msg = CanonicalMessage { idx: 0, role: MessageRole::User, content: "Hello from user".to_string(), timestamp: None, author: None, tool_calls: vec![], tool_results: vec![], extra: json!({}) };
        let events = codex_events_for_message(&msg, "2026-02-09T06:07:08.000Z");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "event_msg");
        assert_eq!(events[0]["payload"]["type"], "user_message");
        assert_eq!(events[0]["payload"]["message"], "Hello from user");
    }

    #[test]
    fn writer_reasoning_event_format() {
        let msg = CanonicalMessage { idx: 0, role: MessageRole::Assistant, content: "Deep thought".to_string(), timestamp: None, author: Some("reasoning".to_string()), tool_calls: vec![], tool_results: vec![], extra: json!({}) };
        let events = codex_events_for_message(&msg, "2026-02-09T06:07:08.000Z");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "event_msg");
        assert_eq!(events[0]["payload"]["type"], "agent_reasoning");
        assert_eq!(events[0]["payload"]["text"], "Deep thought");
    }

    #[test]
    fn writer_codex_role_string_mapping() {
        assert_eq!(codex_role_string(&MessageRole::User), "user");
        assert_eq!(codex_role_string(&MessageRole::Assistant), "assistant");
        assert_eq!(codex_role_string(&MessageRole::Tool), "tool");
        assert_eq!(codex_role_string(&MessageRole::System), "developer");
        assert_eq!(codex_role_string(&MessageRole::Other("custom".to_string())), "custom");
    }

    #[test]
    fn writer_assistant_without_token_count_produces_one_event() {
        let msg = CanonicalMessage { idx: 0, role: MessageRole::Assistant, content: "Simple reply".to_string(), timestamp: None, author: None, tool_calls: vec![], tool_results: vec![], extra: json!(null) };
        let events = codex_events_for_message(&msg, "2026-02-09T06:07:08.000Z");
        assert_eq!(events.len(), 1, "Assistant without usage should produce one response_item");
        assert_eq!(events[0]["type"], "response_item");
    }

    // -----------------------------------------------------------------------
    // Regression tests for cross-provider conversion bugs
    // -----------------------------------------------------------------------

    #[test]
    fn reader_function_call_output_classified_as_tool_role() {
        // `function_call_output` events have no `role` field. Before the fix they
        // defaulted to "assistant", placing tool results in an assistant turn which
        // the Anthropic API rejects. They must now produce a Tool-role message.
        let content = concat!(
            r#"{"type":"session_meta","payload":{"id":"sx","cwd":"/tmp/p"}}"#,
            "\n",
            r#"{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"run something"}]}}"#,
            "\n",
            r#"{"type":"response_item","payload":{"type":"function_call_output","call_id":"c1","output":"done"}}"#,
        );
        let session = read_codex_jsonl(content);
        let tool_msg = session.messages.iter().find(|m| !m.tool_results.is_empty()).expect("tool result message should exist");
        assert_eq!(tool_msg.role, MessageRole::Tool, "function_call_output must produce Tool role, not Assistant");
    }

    #[test]
    fn reader_jsonl_compaction_resets_to_replacement_history() {
        // A `compacted` event replaces all prior history with its
        // replacement_history. Only that snapshot plus post-compaction events
        // should survive — the source agent's live context, not the full archive.
        let content = concat!(
            r#"{"type":"session_meta","payload":{"id":"sx","cwd":"/tmp/p"}}"#,
            "\n",
            r#"{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"PRE-COMPACTION ORIGINAL"}]}}"#,
            "\n",
            r#"{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pre answer"}]}}"#,
            "\n",
            r#"{"type":"compacted","payload":{"replacement_history":[{"type":"message","role":"user","content":[{"type":"input_text","text":"KEPT SUMMARY TASK"}]}]}}"#,
            "\n",
            r#"{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"POST answer"}]}}"#,
        );
        let session = read_codex_jsonl(content);
        let joined = session.messages.iter().map(|m| m.content.as_str()).collect::<Vec<_>>().join("|");
        assert!(!joined.contains("PRE-COMPACTION"), "pre-compaction history must be dropped; got: {joined}");
        assert!(joined.contains("KEPT SUMMARY TASK"), "got: {joined}");
        assert!(joined.contains("POST answer"), "got: {joined}");
    }
}
