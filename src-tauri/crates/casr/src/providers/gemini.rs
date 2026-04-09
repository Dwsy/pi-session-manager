//! Gemini CLI provider — reads/writes JSON sessions under `~/.gemini/tmp/`.
//!
//! Session files: `<hash>/chats/session-<id>.json`
//! Resume command: `gemini --resume <session-id>`
//!
//! ## JSON format
//!
//! Single JSON object per file:
//! ```json
//! {
//!   "sessionId": "…",
//!   "startTime": "…",
//!   "lastUpdated": "…",
//!   "messages": [
//!     { "type": "user"|"gemini"|"model", "content": "…"|[…], "timestamp": "…" }
//!   ]
//! }
//! ```
//!
//! Note: Gemini may use `"gemini"` or `"model"` for assistant responses.

use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, info, trace};
use walkdir::WalkDir;

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content,
    normalize_role, parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Gemini CLI provider implementation.
pub struct Gemini;

/// Compute the Gemini project hash directory name from a workspace path.
///
/// Algorithm: `SHA256(absolute_workspace_path)` as lowercase hex.
///
/// Example: `/data/projects/foo` → `sha256(b"/data/projects/foo")` (64 hex chars)
pub fn project_hash(workspace: &Path) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(workspace.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Generate a Gemini session filename from a session ID and timestamp.
///
/// Convention: `session-YYYY-MM-DDThh-mm-<uuid-prefix>.json`
/// where `<uuid-prefix>` is the first 8 chars of the session UUID.
pub fn session_filename(session_id: &str, now: &chrono::DateTime<chrono::Utc>) -> String {
    let ts = now.format("%Y-%m-%dT%H-%M").to_string();
    let prefix: String = session_id.chars().take(8).collect();
    format!("session-{ts}-{prefix}.json")
}

impl Gemini {
    /// Root directory for Gemini data.
    /// Respects `GEMINI_HOME` env var override.
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("GEMINI_HOME") {
            return Some(PathBuf::from(home));
        }
        dirs::home_dir().map(|h| h.join(".gemini"))
    }

    /// Tmp directory where session hashes live.
    fn tmp_dir() -> Option<PathBuf> {
        Self::home_dir().map(|h| h.join("tmp"))
    }
}

impl Provider for Gemini {
    fn name(&self) -> &str {
        "Gemini CLI"
    }

    fn slug(&self) -> &str {
        "gemini"
    }

    fn cli_alias(&self) -> &str {
        "gmi"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if which::which("gemini").is_ok() {
            evidence.push("gemini binary found in PATH".to_string());
            installed = true;
        }

        if let Some(home) = Self::home_dir()
            && home.is_dir()
        {
            evidence.push(format!("{} exists", home.display()));
            installed = true;
        }

        trace!(provider = "gemini", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        let Some(tmp) = Self::tmp_dir() else {
            return vec![];
        };
        if !tmp.is_dir() {
            return vec![];
        }
        // Each hash directory under tmp/ that has a chats/ subdirectory is a root.
        std::fs::read_dir(&tmp)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|entry| {
                let chats = entry.path().join("chats");
                chats.is_dir().then_some(chats)
            })
            .collect()
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        let tmp = Self::tmp_dir()?;
        if !tmp.is_dir() {
            return Some(vec![]);
        }

        let mut sessions: Vec<(String, PathBuf)> = Vec::new();
        for entry in WalkDir::new(&tmp)
            .max_depth(3)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let Some(parent) = path.parent() else {
                continue;
            };
            if parent.file_name().and_then(|n| n.to_str()) != Some("chats") {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !(name.starts_with("session-") && name.ends_with(".json")) {
                continue;
            }

            let session_id = session_id_from_file(path).unwrap_or_else(|| {
                name.strip_prefix("session-")
                    .and_then(|n| n.strip_suffix(".json"))
                    .unwrap_or(name)
                    .to_string()
            });
            sessions.push((session_id, path.to_path_buf()));
        }

        Some(sessions)
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let tmp = Self::tmp_dir()?;
        if !tmp.is_dir() {
            return None;
        }

        // Gemini sessions are at <hash>/chats/session-*.json.
        //
        // Real filename convention: session-YYYY-MM-DDThh-mm-<uuid_prefix8>.json
        // so we cannot rely on exact filename == session_id.
        let exact_name = format!("session-{session_id}.json");
        let id_prefix = session_id
            .chars()
            .take(8)
            .collect::<String>()
            .to_ascii_lowercase();

        for entry in WalkDir::new(&tmp)
            .max_depth(3)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            // Files must be in a chats/ directory.
            if let Some(parent) = path.parent()
                && parent.file_name().and_then(|n| n.to_str()) == Some("chats")
                && let Some(name) = path.file_name().and_then(|n| n.to_str())
            {
                // Legacy-style exact filename.
                if name == exact_name {
                    debug!(path = %path.display(), "found Gemini session by exact filename");
                    return Some(path.to_path_buf());
                }

                // Prefix-based lookup for modern filenames.
                if !id_prefix.is_empty() {
                    let name_lc = name.to_ascii_lowercase();
                    if name_lc.ends_with(&format!("-{id_prefix}.json"))
                        && session_id_from_file(path).as_deref() == Some(session_id)
                    {
                        debug!(path = %path.display(), "found Gemini session by UUID prefix + sessionId body match");
                        return Some(path.to_path_buf());
                    }
                }
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Gemini session");

        let file = std::fs::File::open(path)
            .with_context(|| format!("failed to open {}", path.display()))?;
        let reader = std::io::BufReader::new(file);
        let root: serde_json::Value = serde_json::from_reader(reader)
            .with_context(|| format!("failed to parse JSON {}", path.display()))?;

        // Session-level fields.
        let session_id = root
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                // Derive from filename: session-<uuid>.json → <uuid>
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .and_then(|s| s.strip_prefix("session-"))
                    .unwrap_or("unknown")
                    .to_string()
            });

        let project_hash = root
            .get("projectHash")
            .and_then(|v| v.as_str())
            .map(String::from);

        let started_at = root.get("startTime").and_then(parse_timestamp);
        let mut ended_at = root.get("lastUpdated").and_then(parse_timestamp);

        // Parse messages array.
        let msg_array = root
            .get("messages")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut messages: Vec<CanonicalMessage> = Vec::new();

        for (i, msg) in msg_array.iter().enumerate() {
            // Role: Gemini uses "type" field with "user" or "model".
            let role_str = msg
                .get("type")
                .or_else(|| msg.get("role"))
                .and_then(|v| v.as_str())
                .unwrap_or("user");
            let role = normalize_role(role_str);

            // Content: string or array of content parts.
            let content_val = msg.get("content");
            let text = gemini_extract_text_content(msg, content_val);
            let tool_calls = gemini_extract_tool_calls(msg, content_val);
            let tool_results = gemini_extract_tool_results(msg, content_val);

            if text.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                trace!(index = i, "skipping empty Gemini message");
                continue;
            }

            // Timestamp.
            let ts = msg.get("timestamp").and_then(parse_timestamp);
            if let Some(t) = ts {
                ended_at = Some(ended_at.map_or(t, |e: i64| e.max(t)));
            }

            messages.push(CanonicalMessage {
                idx: 0,
                role,
                content: text,
                timestamp: ts,
                author: None,
                tool_calls,
                tool_results,
                extra: msg.clone(),
            });
        }

        reindex_messages(&mut messages);

        // Title from first user message.
        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        // Workspace: try to extract from message content (project paths).
        let workspace = extract_workspace_from_messages(&messages);

        // Metadata.
        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("gemini".to_string()),
        );
        if let Some(ref ph) = project_hash {
            metadata.insert("project_hash".into(), serde_json::Value::String(ph.clone()));
        }

        debug!(
            session_id,
            messages = messages.len(),
            "Gemini session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "gemini".to_string(),
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

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let target_session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();

        // Determine target path.
        let tmp_dir = Self::tmp_dir()
            .ok_or_else(|| anyhow::anyhow!("cannot determine Gemini tmp directory"))?;

        // Use workspace hash for project directory, or a fallback hash.
        let workspace_path = session
            .workspace
            .as_deref()
            .unwrap_or(std::path::Path::new("/tmp"));
        let hash = session
            .metadata
            .get("project_hash")
            .or_else(|| session.metadata.get("projectHash"))
            .and_then(serde_json::Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| project_hash(workspace_path));
        let chats_dir = tmp_dir.join(&hash).join("chats");
        let filename = session_filename(&target_session_id, &now);
        let target_path = chats_dir.join(&filename);

        debug!(
            target_session_id,
            target_path = %target_path.display(),
            "writing Gemini session"
        );

        // Build the Gemini JSON structure.
        let start_time = session
            .started_at
            .and_then(chrono::DateTime::from_timestamp_millis)
            .unwrap_or(now)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        let last_updated = session
            .ended_at
            .and_then(chrono::DateTime::from_timestamp_millis)
            .unwrap_or(now)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        let mut json_messages: Vec<serde_json::Value> = Vec::with_capacity(session.messages.len());

        for msg in &session.messages {
            let msg_type = gemini_message_type(msg);

            let ts = msg
                .timestamp
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true));

            let mut entry = serde_json::json!({
                "type": msg_type,
                "content": gemini_message_content(msg),
            });
            if let Some(ref t) = ts {
                entry["timestamp"] = serde_json::Value::String(t.clone());
            }

            merge_gemini_extra_fields(&mut entry, &msg.extra);
            json_messages.push(entry);
        }

        let root = serde_json::json!({
            "sessionId": target_session_id,
            "projectHash": hash,
            "startTime": start_time,
            "lastUpdated": last_updated,
            "messages": json_messages,
        });

        let content_bytes = serde_json::to_string_pretty(&root)?.into_bytes();

        let outcome =
            crate::pipeline::atomic_write(&target_path, &content_bytes, opts.force, self.slug())?;

        info!(
            target_session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "Gemini session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: target_session_id.clone(),
            resume_command: self.resume_command(&target_session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("gemini --resume {session_id}")
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn gemini_message_type(msg: &CanonicalMessage) -> String {
    match msg.role {
        MessageRole::User => "user".to_string(),
        MessageRole::Assistant => "model".to_string(),
        MessageRole::Tool => "tool".to_string(),
        MessageRole::System => "system".to_string(),
        MessageRole::Other(ref other) => other.clone(),
    }
}

fn gemini_extract_text_content(
    message: &serde_json::Value,
    content: Option<&serde_json::Value>,
) -> String {
    let extracted = match content {
        Some(value) => match value {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Array(parts) => {
                let mut text_parts: Vec<String> = Vec::new();
                for part in parts {
                    match part {
                        serde_json::Value::String(s) => text_parts.push(s.clone()),
                        serde_json::Value::Object(obj) => {
                            let block_type = obj.get("type").and_then(|v| v.as_str());
                            if (matches!(
                                block_type,
                                Some("text") | Some("input_text") | Some("output_text")
                            ) || block_type.is_none())
                                && let Some(text) = obj.get("text").and_then(|v| v.as_str())
                            {
                                text_parts.push(text.to_string());
                            }
                        }
                        _ => {}
                    }
                }
                text_parts.join("\n")
            }
            serde_json::Value::Object(obj) => obj
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            _ => String::new(),
        },
        None => String::new(),
    };

    if !extracted.trim().is_empty() {
        return extracted;
    }

    // Gemini often stores assistant prose in `thoughts` while keeping
    // `content` empty when messages are tool-heavy. Preserve this fallback so
    // list/info metrics and cross-provider transforms don't look artificially
    // sparse.
    message
        .get("thoughts")
        .map(gemini_extract_thoughts_text)
        .unwrap_or_default()
}

fn gemini_extract_thoughts_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(items) => {
            let mut parts: Vec<String> = Vec::new();
            for item in items {
                match item {
                    serde_json::Value::String(s) => {
                        if !s.trim().is_empty() {
                            parts.push(s.to_string());
                        }
                    }
                    serde_json::Value::Object(obj) => {
                        let subject = obj
                            .get("subject")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim();
                        let description = obj
                            .get("description")
                            .or_else(|| obj.get("text"))
                            .or_else(|| obj.get("summary"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim();

                        if !subject.is_empty() && !description.is_empty() {
                            parts.push(format!("{subject}: {description}"));
                        } else if !description.is_empty() {
                            parts.push(description.to_string());
                        } else if !subject.is_empty() {
                            parts.push(subject.to_string());
                        }
                    }
                    _ => {
                        let flat = flatten_content(item);
                        if !flat.trim().is_empty() {
                            parts.push(flat);
                        }
                    }
                }
            }
            parts.join("\n\n")
        }
        serde_json::Value::Object(obj) => obj
            .get("description")
            .or_else(|| obj.get("text"))
            .or_else(|| obj.get("summary"))
            .or_else(|| obj.get("subject"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn gemini_extract_tool_calls(
    message: &serde_json::Value,
    content: Option<&serde_json::Value>,
) -> Vec<ToolCall> {
    let mut calls: Vec<ToolCall> = Vec::new();

    if let Some(serde_json::Value::Array(parts)) = content {
        for part in parts {
            let Some(obj) = part.as_object() else {
                continue;
            };
            if obj.get("type").and_then(|v| v.as_str()) != Some("tool_use") {
                continue;
            }

            calls.push(ToolCall {
                id: obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string),
                name: obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("input").cloned().unwrap_or(serde_json::Value::Null),
            });
        }
    }

    if let Some(tool_calls) = message.get("toolCalls").and_then(|v| v.as_array()) {
        for call in tool_calls {
            let Some(obj) = call.as_object() else {
                continue;
            };
            calls.push(ToolCall {
                id: obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string),
                name: obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("args").cloned().unwrap_or(serde_json::Value::Null),
            });
        }
    }

    calls
}

fn gemini_extract_tool_results(
    message: &serde_json::Value,
    content: Option<&serde_json::Value>,
) -> Vec<ToolResult> {
    let mut results: Vec<ToolResult> = Vec::new();

    if let Some(serde_json::Value::Array(parts)) = content {
        for part in parts {
            let Some(obj) = part.as_object() else {
                continue;
            };
            if obj.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
                continue;
            }

            let content_text = obj
                .get("content")
                .map(flatten_content)
                .or_else(|| obj.get("output").map(flatten_content))
                .unwrap_or_default();

            results.push(ToolResult {
                call_id: obj
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string),
                content: content_text,
                is_error: obj
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            });
        }
    }

    if let Some(tool_calls) = message.get("toolCalls").and_then(|v| v.as_array()) {
        for call in tool_calls {
            let Some(obj) = call.as_object() else {
                continue;
            };

            let has_result = obj.get("result").is_some() || obj.get("resultDisplay").is_some();
            if !has_result {
                continue;
            }

            let content_text = gemini_tool_call_result_text(call);
            results.push(ToolResult {
                call_id: obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string),
                content: content_text,
                is_error: obj.get("status").and_then(|v| v.as_str()) == Some("error"),
            });
        }
    }

    results
}

fn gemini_tool_call_result_text(call: &serde_json::Value) -> String {
    if let Some(s) = call.get("resultDisplay").and_then(|v| v.as_str())
        && !s.trim().is_empty()
    {
        return s.to_string();
    }

    if let Some(s) = call
        .pointer("/result/0/functionResponse/response/output")
        .and_then(|v| v.as_str())
        && !s.trim().is_empty()
    {
        return s.to_string();
    }

    if let Some(s) = call
        .pointer("/result/0/functionResponse/response/error")
        .and_then(|v| v.as_str())
        && !s.trim().is_empty()
    {
        return s.to_string();
    }

    if let Some(result) = call.get("result") {
        let flat = flatten_content(result);
        if !flat.trim().is_empty() {
            return flat;
        }
        if let Ok(serialized) = serde_json::to_string(result) {
            return serialized;
        }
    }

    String::new()
}

fn gemini_message_content(msg: &CanonicalMessage) -> serde_json::Value {
    if let Some(content) = msg.extra.get("content")
        && !content.is_null()
    {
        return content.clone();
    }

    if msg.tool_calls.is_empty() && msg.tool_results.is_empty() {
        return serde_json::Value::String(msg.content.clone());
    }

    let mut blocks: Vec<serde_json::Value> = Vec::new();
    if !msg.content.is_empty() {
        blocks.push(serde_json::json!({
            "type": "text",
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

    if blocks.is_empty() {
        serde_json::Value::String(msg.content.clone())
    } else {
        serde_json::Value::Array(blocks)
    }
}

fn merge_gemini_extra_fields(entry: &mut serde_json::Value, extra: &serde_json::Value) {
    let Some(entry_obj) = entry.as_object_mut() else {
        return;
    };
    let Some(extra_obj) = extra.as_object() else {
        return;
    };

    for (k, v) in extra_obj {
        if k == "type" || k == "content" || k == "timestamp" {
            continue;
        }
        entry_obj.entry(k.clone()).or_insert_with(|| v.clone());
    }
}

/// Try to extract a workspace path from message content.
///
/// Scans the first N messages for common path patterns:
/// - `"# AGENTS.md instructions for /data/projects/foo"`
/// - `"Working directory: /path/to/project"`
/// - Any `/data/projects/X` reference
fn extract_workspace_from_messages(messages: &[CanonicalMessage]) -> Option<PathBuf> {
    let scan_limit = messages.len().min(50);
    for msg in &messages[..scan_limit] {
        // Look for /data/projects/ patterns (common convention).
        if let Some(idx) = msg.content.find("/data/projects/") {
            let rest = &msg.content[idx..];
            // Extract project name (next path segment after /data/projects/).
            let project_path: String = rest
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'' && *c != ')')
                .collect();
            // Normalize to just /data/projects/<name>
            let parts: Vec<&str> = project_path.split('/').collect();
            if parts.len() >= 4 {
                let normalized = format!("/{}/{}/{}", parts[1], parts[2], parts[3]);
                return normalize_workspace_candidate(&normalized);
            }
        }
        // Look for absolute paths on common prefixes.
        for prefix in ["/home/", "/Users/", "/root/"] {
            if let Some(idx) = msg.content.find(prefix) {
                let rest = &msg.content[idx..];
                let path: String = rest
                    .chars()
                    .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
                    .collect();
                if path.len() > prefix.len() + 3 {
                    return normalize_workspace_candidate(&path);
                }
            }
        }
    }
    None
}

fn normalize_workspace_candidate(raw: &str) -> Option<PathBuf> {
    let candidate = PathBuf::from(raw);
    if candidate.as_os_str().is_empty() {
        return None;
    }

    if candidate.exists() && candidate.is_file() {
        return candidate
            .parent()
            .map(Path::to_path_buf)
            .or(Some(candidate));
    }

    let looks_like_file = candidate
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|name| name.contains('.') && !name.starts_with('.'));
    if looks_like_file
        && let Some(parent) = candidate.parent()
        && !parent.as_os_str().is_empty()
    {
        return Some(parent.to_path_buf());
    }

    Some(candidate)
}

fn session_id_from_file(path: &Path) -> Option<String> {
    #[derive(serde::Deserialize)]
    struct GeminiHeader {
        #[serde(rename = "sessionId")]
        session_id: Option<String>,
    }
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);
    let header: GeminiHeader = serde_json::from_reader(reader).ok()?;
    header.session_id
}

#[cfg(test)]
mod tests {
    use super::{
        Gemini, gemini_message_content, gemini_message_type, merge_gemini_extra_fields,
        normalize_workspace_candidate, project_hash, session_filename,
    };
    use chrono::{TimeZone, Utc};
    use serde_json::json;
    use std::path::Path;

    use crate::model::{CanonicalMessage, MessageRole, ToolCall, ToolResult};
    use crate::providers::Provider;

    #[test]
    fn project_hash_matches_observed_sha256_mapping() {
        let workspace = Path::new("/data/projects/flywheel_gateway");
        let hash = project_hash(workspace);
        assert_eq!(
            hash,
            "b7da685261f0fff76430fd68dd709a693a8abac1c72c19c49f2fd1c7424c6d4e"
        );
    }

    #[test]
    fn workspace_candidate_file_path_normalizes_to_parent_dir() {
        let got = normalize_workspace_candidate("/data/projects/foo/README.md")
            .expect("workspace should normalize");
        assert_eq!(got, Path::new("/data/projects/foo"));
    }

    #[test]
    fn workspace_candidate_hidden_directory_is_preserved() {
        let got = normalize_workspace_candidate("/home/ubuntu/.config")
            .expect("workspace should normalize");
        assert_eq!(got, Path::new("/home/ubuntu/.config"));
    }

    #[test]
    fn session_filename_uses_timestamp_and_uuid_prefix() {
        let now = Utc
            .with_ymd_and_hms(2026, 1, 10, 2, 6, 44)
            .single()
            .expect("valid timestamp");
        let filename = session_filename("8c1890a5-eb39-4c5c-acff-93790d35dd3f", &now);
        assert_eq!(filename, "session-2026-01-10T02-06-8c1890a5.json");
    }

    #[test]
    fn message_content_prefers_extra_content_and_preserves_blocks() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "fallback".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: json!({
                "content": [
                    {"type": "text", "text": "primary"},
                    {"type": "grounding", "source": "doc://1"}
                ]
            }),
        };

        let content = gemini_message_content(&msg);
        assert_eq!(
            content,
            json!([
                {"type": "text", "text": "primary"},
                {"type": "grounding", "source": "doc://1"}
            ])
        );
    }

    #[test]
    fn message_content_falls_back_to_tool_blocks_when_needed() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![ToolCall {
                id: Some("call-7".to_string()),
                name: "read_file".to_string(),
                arguments: json!({"path":"README.md"}),
            }],
            tool_results: vec![ToolResult {
                call_id: Some("call-7".to_string()),
                content: "ok".to_string(),
                is_error: false,
            }],
            extra: serde_json::Value::Null,
        };

        let content = gemini_message_content(&msg);
        let blocks = content
            .as_array()
            .expect("tool-rich Gemini content should serialize as array");
        assert!(blocks.iter().any(|b| b["type"] == "tool_use"));
        assert!(blocks.iter().any(|b| b["type"] == "tool_result"));
    }

    #[test]
    fn merge_gemini_extra_fields_keeps_annotations() {
        let mut entry = json!({
            "type": "model",
            "content": "hello"
        });
        let extra = json!({
            "groundingMetadata": {"sourceCount": 2},
            "citations": [{"uri":"doc://x"}],
            "timestamp": "should-not-overwrite",
            "content": "should-not-overwrite",
            "type": "should-not-overwrite"
        });

        merge_gemini_extra_fields(&mut entry, &extra);
        assert_eq!(entry["groundingMetadata"]["sourceCount"], 2);
        assert_eq!(entry["citations"][0]["uri"], "doc://x");
        assert_eq!(entry["type"], "model");
        assert_eq!(entry["content"], "hello");
    }

    #[test]
    fn message_type_preserves_non_user_roles() {
        let assistant = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: String::new(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        };
        let tool = CanonicalMessage {
            role: MessageRole::Tool,
            ..assistant.clone()
        };
        let system = CanonicalMessage {
            role: MessageRole::System,
            ..assistant.clone()
        };
        let other = CanonicalMessage {
            role: MessageRole::Other("reviewer".to_string()),
            ..assistant
        };

        assert_eq!(gemini_message_type(&tool), "tool");
        assert_eq!(gemini_message_type(&system), "system");
        assert_eq!(gemini_message_type(&other), "reviewer");
    }

    #[test]
    fn resume_command_uses_resume_flag() {
        let provider = Gemini;
        assert_eq!(
            <Gemini as Provider>::resume_command(&provider, "abc123"),
            "gemini --resume abc123"
        );
    }

    // -----------------------------------------------------------------------
    // Reader unit tests
    // -----------------------------------------------------------------------

    use std::io::Write as _;

    /// Write JSON content to a temp file and read it back.
    fn read_gemini_json(content: &str) -> crate::model::CanonicalSession {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        tmp.write_all(content.as_bytes()).unwrap();
        tmp.flush().unwrap();
        Gemini
            .read_session(tmp.path())
            .unwrap_or_else(|e| panic!("read_session failed: {e}"))
    }

    #[test]
    fn reader_basic_user_model_exchange() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-test-1",
                "startTime": "2026-01-01T00:00:00Z",
                "lastUpdated": "2026-01-01T00:05:00Z",
                "messages": [
                    {"type": "user", "content": "Hello", "timestamp": "2026-01-01T00:00:00Z"},
                    {"type": "model", "content": "Hi there", "timestamp": "2026-01-01T00:01:00Z"}
                ]
            }"#,
        );
        assert_eq!(session.session_id, "gmi-test-1");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Hi there");
        assert!(session.started_at.is_some());
    }

    #[test]
    fn reader_gemini_role_maps_to_assistant() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-role-test",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "gemini", "content": "A"}
                ]
            }"#,
        );
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn reader_array_content_blocks() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-blocks",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": [
                        {"type": "text", "text": "Main answer."},
                        {"type": "grounding", "source": "doc://ref"}
                    ]}
                ]
            }"#,
        );
        assert_eq!(session.messages[1].content, "Main answer.");
    }

    #[test]
    fn reader_falls_back_to_thoughts_when_content_empty() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-thoughts-fallback",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "gemini", "content": "", "thoughts": "Reasoned answer hidden in thoughts"}
                ]
            }"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert_eq!(
            session.messages[1].content,
            "Reasoned answer hidden in thoughts"
        );
    }

    #[test]
    fn reader_extracts_tool_blocks_while_flattening_text() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-tool-blocks",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": [
                        {"type": "text", "text": "Main answer."},
                        {"type": "tool_use", "name": "Bash", "input": {"command": "ls"}},
                        {"type": "tool_result", "tool_use_id": "call-1", "content": "ok"}
                    ]}
                ]
            }"#,
        );
        assert_eq!(session.messages[1].content, "Main answer.");
        assert_eq!(session.messages[1].tool_calls.len(), 1);
        assert_eq!(session.messages[1].tool_calls[0].name, "Bash");
        assert_eq!(session.messages[1].tool_results.len(), 1);
        assert_eq!(session.messages[1].tool_results[0].content, "ok");
    }

    #[test]
    fn reader_extracts_top_level_tool_calls_and_results() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-top-toolcalls",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {
                        "type": "gemini",
                        "content": "A",
                        "toolCalls": [
                            {
                                "id": "call-1",
                                "name": "read_file",
                                "args": {"file_path": "README.md"},
                                "status": "success",
                                "resultDisplay": "file contents"
                            }
                        ]
                    }
                ]
            }"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].tool_calls.len(), 1);
        assert_eq!(session.messages[1].tool_calls[0].name, "read_file");
        assert_eq!(session.messages[1].tool_results.len(), 1);
        assert_eq!(session.messages[1].tool_results[0].content, "file contents");
    }

    #[test]
    fn reader_keeps_tool_only_messages() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-tool-only",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {
                        "type": "model",
                        "content": [
                            {"type": "tool_use", "id": "call-9", "name": "Bash", "input": {"command": "ls"}}
                        ]
                    }
                ]
            }"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].tool_calls.len(), 1);
        assert!(session.messages[1].content.is_empty());
    }

    #[test]
    fn reader_preserves_extra_fields() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-extra",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": "A", "groundingMetadata": {"count": 3}, "citations": []}
                ]
            }"#,
        );
        assert!(session.messages[1].extra.get("groundingMetadata").is_some());
        assert!(session.messages[1].extra.get("citations").is_some());
    }

    #[test]
    fn reader_skips_empty_messages() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-empty",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": ""},
                    {"type": "model", "content": "   "},
                    {"type": "model", "content": "Valid"}
                ]
            }"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "Valid");
    }

    #[test]
    fn reader_keeps_thoughts_only_messages() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-thoughts-only",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": "", "thoughts": "Internal explanation"}
                ]
            }"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "Internal explanation");
    }

    #[test]
    fn reader_extracts_structured_thoughts_array() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-thoughts-array",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {
                        "type": "gemini",
                        "content": "",
                        "thoughts": [
                            {"subject": "Plan", "description": "Investigate parser edge cases"},
                            {"subject": "Result", "description": "Patched fallback extraction"}
                        ]
                    }
                ]
            }"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert!(
            session.messages[1]
                .content
                .contains("Plan: Investigate parser edge cases")
        );
        assert!(
            session.messages[1]
                .content
                .contains("Result: Patched fallback extraction")
        );
    }

    #[test]
    fn reader_session_id_fallback_to_filename() {
        let session = read_gemini_json(
            r#"{
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": "A"}
                ]
            }"#,
        );
        // No sessionId in JSON → falls back to filename stem minus "session-" prefix.
        assert!(!session.session_id.is_empty());
    }

    #[test]
    fn reader_empty_messages_array() {
        let session = read_gemini_json(r#"{"sessionId": "gmi-empty-arr", "messages": []}"#);
        assert_eq!(session.messages.len(), 0);
    }

    #[test]
    fn reader_missing_messages_key() {
        let session = read_gemini_json(r#"{"sessionId": "gmi-no-msgs"}"#);
        assert_eq!(session.messages.len(), 0);
    }

    #[test]
    fn reader_project_hash_preserved_in_metadata() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-hash",
                "projectHash": "abc123def",
                "messages": [
                    {"type": "user", "content": "Q"},
                    {"type": "model", "content": "A"}
                ]
            }"#,
        );
        assert_eq!(session.metadata["project_hash"].as_str(), Some("abc123def"));
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-title",
                "messages": [
                    {"type": "user", "content": "Explain the architecture of this system"},
                    {"type": "model", "content": "The system uses..."}
                ]
            }"#,
        );
        assert_eq!(
            session.title.as_deref(),
            Some("Explain the architecture of this system")
        );
    }

    #[test]
    fn reader_timestamp_tracking() {
        let session = read_gemini_json(
            r#"{
                "sessionId": "gmi-ts",
                "startTime": "2026-01-01T00:00:00Z",
                "lastUpdated": "2026-01-01T01:00:00Z",
                "messages": [
                    {"type": "user", "content": "Q", "timestamp": "2026-01-01T00:30:00Z"},
                    {"type": "model", "content": "A", "timestamp": "2026-01-01T00:45:00Z"}
                ]
            }"#,
        );
        assert!(session.started_at.is_some());
        assert!(session.ended_at.is_some());
        // ended_at should be max of lastUpdated and message timestamps.
        assert!(session.ended_at.unwrap() >= session.started_at.unwrap());
    }

    // -----------------------------------------------------------------------
    // Writer helper unit tests
    // -----------------------------------------------------------------------

    #[test]
    fn writer_content_plain_string_without_extra() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "Simple text".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        };
        let content = gemini_message_content(&msg);
        assert!(
            content.is_string(),
            "Gemini content without extra should be plain string"
        );
        assert_eq!(content.as_str().unwrap(), "Simple text");
    }

    #[test]
    fn writer_user_type_is_user() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: String::new(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        };
        assert_eq!(gemini_message_type(&msg), "user");
    }

    #[test]
    fn writer_assistant_type_is_model() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: String::new(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        };
        assert_eq!(gemini_message_type(&msg), "model");
    }
}
