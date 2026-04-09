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

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, info, trace, warn};
use walkdir::WalkDir;

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content,
    normalize_role, parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Codex provider implementation.
pub struct Codex;

/// Generate the Codex rollout file path for a new session.
///
/// Convention: `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-<session-id>.jsonl`
///
/// The session ID is a ULID (timestamp-prefixed UUID).
pub fn rollout_path(
    sessions_dir: &Path,
    session_id: &str,
    now: &chrono::DateTime<chrono::Utc>,
) -> PathBuf {
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
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
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
        for entry in WalkDir::new(&sessions_dir)
            .max_depth(5)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !(name.starts_with("rollout-")
                && (name.ends_with(".jsonl") || name.ends_with(".json")))
            {
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
            let candidate = if ext.is_empty() {
                as_path.clone()
            } else {
                as_path.with_extension(&ext[1..])
            };
            if candidate.is_file() {
                debug!(path = %candidate.display(), "found Codex session by path");
                return Some(candidate);
            }
        }

        // Scan rollout files recursively.
        for entry in WalkDir::new(&sessions_dir)
            .max_depth(5)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str())
                && (name.starts_with("rollout-")
                    && (name.ends_with(".jsonl") || name.ends_with(".json")))
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
                let name_no_ext = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
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
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))?;

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

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let target_session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let now_iso = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        let sessions_dir = Self::sessions_dir()
            .ok_or_else(|| anyhow::anyhow!("cannot determine Codex sessions directory"))?;
        let target_path = rollout_path(&sessions_dir, &target_session_id, &now);

        debug!(
            target_session_id,
            target_path = %target_path.display(),
            "writing Codex session"
        );

        let mut lines: Vec<String> = Vec::with_capacity(session.messages.len() + 1);

        // 1. session_meta line.
        let cwd = session
            .workspace
            .as_deref()
            .unwrap_or(std::path::Path::new("/tmp"))
            .to_string_lossy()
            .to_string();

        lines.push(serde_json::to_string(&serde_json::json!({
            "type": "session_meta",
            "timestamp": now_iso,
            "payload": {
                "id": target_session_id,
                "cwd": cwd,
                "timestamp": now_iso,
                "originator": "casr",
                "cli_version": env!("CARGO_PKG_VERSION"),
                "source": "cli",
                "model_provider": "openai",
            }
        }))?);

        // 2. Messages.
        for msg in &session.messages {
            let msg_ts = msg
                .timestamp
                .and_then(|ts| chrono::DateTime::from_timestamp_millis(ts))
                .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
                .unwrap_or_else(|| now_iso.clone());

            for event in codex_events_for_message(msg, &msg_ts) {
                lines.push(serde_json::to_string(&event)?);
            }
        }

        let content_bytes = lines.join("\n").into_bytes();

        let outcome =
            crate::pipeline::atomic_write(&target_path, &content_bytes, opts.force, self.slug())?;

        info!(
            target_session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "Codex session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: target_session_id.clone(),
            resume_command: self.resume_command(&target_session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("codex resume {session_id}")
    }
}

fn codex_events_for_message(msg: &CanonicalMessage, msg_ts: &str) -> Vec<serde_json::Value> {
    // User messages that carry tool payloads must be serialized as response_item
    // envelopes; event_msg/user_message cannot represent tool_use/tool_result blocks.
    let user_needs_response_item = msg.role == MessageRole::User
        && (!msg.tool_calls.is_empty() || !msg.tool_results.is_empty());

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
        MessageRole::Assistant
        | MessageRole::Tool
        | MessageRole::System
        | MessageRole::Other(_) => {
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
    let text_type = if msg.role == MessageRole::Assistant {
        "output_text"
    } else {
        "input_text"
    };

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

fn insert_token_count(
    out: &mut serde_json::Map<String, serde_json::Value>,
    obj: &serde_json::Map<String, serde_json::Value>,
    snake: &str,
    camel: &str,
) {
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
                        let role_str = p
                            .get("role")
                            .and_then(|v| v.as_str())
                            .unwrap_or("assistant");
                        let role = normalize_role(role_str);

                        let content_val = p.get("content");
                        let text = codex_extract_text_content(content_val);
                        let mut tool_calls = codex_extract_tool_calls(content_val);
                        tool_calls.extend(codex_extract_payload_tool_calls(p));
                        let mut tool_results = codex_extract_tool_results(content_val);
                        tool_results.extend(codex_extract_payload_tool_results(p));

                        if text.trim().is_empty()
                            && tool_calls.is_empty()
                            && tool_results.is_empty()
                        {
                            trace!(line = line_num, "skipping empty response_item");
                            continue;
                        }

                        let next_message = CanonicalMessage {
                            idx: 0,
                            role,
                            content: text,
                            timestamp: ts,
                            author: None,
                            tool_calls,
                            tool_results,
                            extra: envelope,
                        };

                        // Some Codex files mirror user turns in both
                        // `response_item(message:user)` and `event_msg(user_message)`.
                        // Drop exact adjacent duplicates to preserve clean alternation.
                        let is_adjacent_user_duplicate = messages.last().is_some_and(|prev| {
                            prev.role == MessageRole::User
                                && next_message.role == MessageRole::User
                                && prev.content == next_message.content
                                && prev.timestamp == next_message.timestamp
                        });
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
                                let text = p
                                    .get("message")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !text.trim().is_empty() {
                                    let next_message = CanonicalMessage {
                                        idx: 0,
                                        role: MessageRole::User,
                                        content: text,
                                        timestamp: ts,
                                        author: None,
                                        tool_calls: vec![],
                                        tool_results: vec![],
                                        extra: envelope,
                                    };

                                    let is_adjacent_user_duplicate =
                                        messages.last().is_some_and(|prev| {
                                            prev.role == MessageRole::User
                                                && prev.content == next_message.content
                                                && prev.timestamp == next_message.timestamp
                                        });
                                    if is_adjacent_user_duplicate {
                                        trace!(
                                            line = line_num,
                                            "skipping duplicate user event_msg"
                                        );
                                        continue;
                                    }

                                    messages.push(next_message);
                                }
                            }
                            "agent_reasoning" => {
                                let text = p
                                    .get("text")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !text.trim().is_empty() {
                                    messages.push(CanonicalMessage {
                                        idx: 0,
                                        role: MessageRole::Assistant,
                                        content: text,
                                        timestamp: ts,
                                        author: Some("reasoning".to_string()),
                                        tool_calls: vec![],
                                        tool_results: vec![],
                                        extra: envelope,
                                    });
                                }
                            }
                            _ => {
                                trace!(
                                    line = line_num,
                                    sub_type, "skipping non-conversational event_msg"
                                );
                            }
                        }
                    }
                }
                _ => {
                    trace!(line = line_num, event_type, "skipping unknown event type");
                }
            }
        }

        reindex_messages(&mut messages);
        self.build_session(
            path, session_id, workspace, started_at, ended_at, messages, skipped,
        )
    }

    /// Parse legacy single-JSON format: `{ "session": {…}, "items": […] }`.
    fn read_legacy_json(&self, path: &Path, content: &str) -> anyhow::Result<CanonicalSession> {
        let root: serde_json::Value = serde_json::from_str(content)
            .with_context(|| format!("failed to parse legacy JSON {}", path.display()))?;

        let session_obj = root.get("session");
        let session_id = session_obj
            .and_then(|s| s.get("id"))
            .and_then(|v| v.as_str())
            .map(String::from);
        let workspace = session_obj
            .and_then(|s| s.get("cwd"))
            .and_then(|v| v.as_str())
            .map(PathBuf::from);

        let items = root
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut messages = Vec::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;

        for item in &items {
            let role_str = item
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("assistant");
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

            messages.push(CanonicalMessage {
                idx: 0,
                role,
                content: text,
                timestamp: ts,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: item.clone(),
            });
        }

        reindex_messages(&mut messages);
        self.build_session(
            path, session_id, workspace, started_at, ended_at, messages, 0,
        )
    }

    /// Assemble the final `CanonicalSession` from parsed data.
    #[expect(
        clippy::too_many_arguments,
        reason = "internal builder; clarity > refactoring"
    )]
    fn build_session(
        &self,
        path: &Path,
        session_id: Option<String>,
        workspace: Option<PathBuf>,
        started_at: Option<i64>,
        ended_at: Option<i64>,
        messages: Vec<CanonicalMessage>,
        skipped: usize,
    ) -> anyhow::Result<CanonicalSession> {
        // Derive session ID from relative path if not in content.
        let session_id = session_id.unwrap_or_else(|| {
            if let Some(sessions_dir) = Self::sessions_dir()
                && let Ok(rel) = path.strip_prefix(&sessions_dir)
            {
                return rel.with_extension("").to_string_lossy().to_string();
            }
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("codex".to_string()),
        );

        debug!(
            session_id,
            messages = messages.len(),
            skipped,
            "Codex session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "codex".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::Value::Object(metadata),
            source_path: path.to_path_buf(),
            model_name: None,
        })
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
                        if (matches!(
                            block_type,
                            Some("text") | Some("input_text") | Some("output_text")
                        ) || block_type.is_none())
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
        serde_json::Value::Object(obj) => obj
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
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
            Some(ToolCall {
                id: obj.get("id").and_then(|v| v.as_str()).map(String::from),
                name: obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("input").cloned().unwrap_or(serde_json::Value::Null),
            })
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
                call_id: obj
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                content: obj
                    .get("content")
                    .and_then(|v| v.as_str())
                    .or_else(|| obj.get("output").and_then(|v| v.as_str()))
                    .unwrap_or("")
                    .to_string(),
                is_error: obj
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn codex_extract_payload_tool_calls(payload: &serde_json::Value) -> Vec<ToolCall> {
    let payload_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if !matches!(payload_type, "function_call" | "custom_tool_call") {
        return vec![];
    }

    let arguments = payload
        .get("arguments")
        .or_else(|| payload.get("input"))
        .or_else(|| payload.get("args"))
        .map(codex_parse_arguments_value)
        .unwrap_or(serde_json::Value::Null);

    vec![ToolCall {
        id: payload
            .get("call_id")
            .or_else(|| payload.get("id"))
            .or_else(|| payload.get("tool_use_id"))
            .and_then(|v| v.as_str())
            .map(String::from),
        name: payload
            .get("name")
            .or_else(|| payload.pointer("/function/name"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        arguments,
    }]
}

fn codex_extract_payload_tool_results(payload: &serde_json::Value) -> Vec<ToolResult> {
    let payload_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    if !matches!(
        payload_type,
        "function_call_output" | "custom_tool_call_output"
    ) {
        return vec![];
    }

    let content = payload
        .get("output")
        .or_else(|| payload.get("content"))
        .or_else(|| payload.get("result"))
        .map(flatten_content)
        .unwrap_or_default();
    let is_error = payload
        .get("is_error")
        .and_then(|v| v.as_bool())
        .or_else(|| {
            payload
                .get("status")
                .and_then(|v| v.as_str())
                .map(|status| status == "error")
        })
        .unwrap_or(false);

    vec![ToolResult {
        call_id: payload
            .get("call_id")
            .or_else(|| payload.get("tool_use_id"))
            .or_else(|| payload.get("id"))
            .and_then(|v| v.as_str())
            .map(String::from),
        content,
        is_error,
    }]
}

fn codex_parse_arguments_value(value: &serde_json::Value) -> serde_json::Value {
    if let Some(text) = value.as_str() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(text) {
            parsed
        } else {
            serde_json::Value::String(text.to_string())
        }
    } else {
        value.clone()
    }
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
            return envelope
                .pointer("/payload/id")
                .and_then(|v| v.as_str())
                .map(ToString::to_string);
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
        let now = Utc
            .with_ymd_and_hms(2026, 2, 9, 6, 7, 8)
            .single()
            .expect("valid timestamp");
        let path = rollout_path(
            Path::new("/tmp/codex/sessions"),
            "019c40fd-3c51-7621-a418-68203585f589",
            &now,
        );
        let path_str = path.to_string_lossy();
        assert!(
            path_str.ends_with(
                "2026/02/09/rollout-2026-02-09T06-07-08-019c40fd-3c51-7621-a418-68203585f589.jsonl"
            ),
            "{path_str}"
        );
    }

    #[test]
    fn assistant_events_include_tool_calls_results_and_token_count() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "Applied the patch".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![ToolCall {
                id: Some("call-1".to_string()),
                name: "apply_patch".to_string(),
                arguments: json!({"path":"src/providers/codex.rs"}),
            }],
            tool_results: vec![ToolResult {
                call_id: Some("call-1".to_string()),
                content: "ok".to_string(),
                is_error: false,
            }],
            extra: json!({
                "usage": {
                    "input_tokens": 11,
                    "output_tokens": 22,
                    "total_tokens": 33
                }
            }),
        };

        let events = codex_events_for_message(&msg, "2023-11-14T22:13:20.000Z");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["type"], "response_item");
        assert_eq!(events[0]["payload"]["type"], "message");
        let content_blocks = events[0]["payload"]["content"]
            .as_array()
            .expect("response_item content should be array");
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
            tool_calls: vec![ToolCall {
                id: Some("call-7".to_string()),
                name: "Read".to_string(),
                arguments: json!({"file_path":"src/main.rs"}),
            }],
            tool_results: vec![ToolResult {
                call_id: Some("call-7".to_string()),
                content: "fn main() {}".to_string(),
                is_error: false,
            }],
            extra: json!({}),
        };

        let events = codex_events_for_message(&msg, "2023-11-14T22:13:20.000Z");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "response_item");
        assert_eq!(events[0]["payload"]["type"], "message");
        assert_eq!(events[0]["payload"]["role"], "user");
        let blocks = events[0]["payload"]["content"]
            .as_array()
            .expect("response_item content should be array");
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
        let session = provider
            .read_jsonl(Path::new("/tmp/rollout-test.jsonl"), &file_text)
            .expect("Codex JSONL reader should parse tool_result-only response_item");

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
        let session = provider
            .read_jsonl(Path::new("/tmp/rollout-fc.jsonl"), &file_text)
            .expect("Codex JSONL reader should parse payload-level function_call");

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_calls.len(), 1);
        assert_eq!(session.messages[0].tool_calls[0].name, "Read");
        assert_eq!(
            session.messages[0].tool_calls[0].id.as_deref(),
            Some("call-42")
        );
        assert_eq!(
            session.messages[0].tool_calls[0].arguments["file_path"],
            "src/main.rs"
        );
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
        let session = provider
            .read_jsonl(Path::new("/tmp/rollout-fco.jsonl"), &file_text)
            .expect("Codex JSONL reader should parse payload-level function_call_output");

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_results.len(), 1);
        assert_eq!(
            session.messages[0].tool_results[0].call_id.as_deref(),
            Some("call-42")
        );
        assert_eq!(session.messages[0].tool_results[0].content, "done");
    }

    #[test]
    fn resume_command_uses_subcommand_form() {
        let provider = Codex;
        assert_eq!(
            <Codex as Provider>::resume_command(&provider, "abc123"),
            "codex resume abc123"
        );
    }

    // -----------------------------------------------------------------------
    // Reader unit tests
    // -----------------------------------------------------------------------

    /// Read Codex JSONL from an inline string.
    fn read_codex_jsonl(content: &str) -> crate::model::CanonicalSession {
        let provider = Codex;
        provider
            .read_jsonl(Path::new("/tmp/test-rollout.jsonl"), content)
            .unwrap_or_else(|e| panic!("read_jsonl failed: {e}"))
    }

    /// Read Codex legacy JSON from an inline string.
    fn read_codex_legacy(content: &str) -> crate::model::CanonicalSession {
        let provider = Codex;
        provider
            .read_legacy_json(Path::new("/tmp/test-legacy.json"), content)
            .unwrap_or_else(|e| panic!("read_legacy_json failed: {e}"))
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
        assert_eq!(
            session.workspace,
            Some(std::path::PathBuf::from("/data/proj"))
        );
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
        assert_eq!(
            session.workspace,
            Some(std::path::PathBuf::from("/home/user/proj"))
        );
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
        assert_eq!(
            session.title.as_deref(),
            Some("Optimize the database query")
        );
    }

    // -----------------------------------------------------------------------
    // Writer helper unit tests
    // -----------------------------------------------------------------------

    use super::codex_role_string;

    #[test]
    fn writer_user_event_format() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "Hello from user".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: json!({}),
        };
        let events = codex_events_for_message(&msg, "2023-11-14T22:13:20.000Z");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "event_msg");
        assert_eq!(events[0]["payload"]["type"], "user_message");
        assert_eq!(events[0]["payload"]["message"], "Hello from user");
    }

    #[test]
    fn writer_reasoning_event_format() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "Deep thought".to_string(),
            timestamp: None,
            author: Some("reasoning".to_string()),
            tool_calls: vec![],
            tool_results: vec![],
            extra: json!({}),
        };
        let events = codex_events_for_message(&msg, "2023-11-14T22:13:20.000Z");
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
        assert_eq!(
            codex_role_string(&MessageRole::Other("custom".to_string())),
            "custom"
        );
    }

    #[test]
    fn writer_assistant_without_token_count_produces_one_event() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "Simple reply".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: json!(null),
        };
        let events = codex_events_for_message(&msg, "2023-11-14T22:13:20.000Z");
        assert_eq!(
            events.len(),
            1,
            "Assistant without usage should produce one response_item"
        );
        assert_eq!(events[0]["type"], "response_item");
    }
}
