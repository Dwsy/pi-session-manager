//! Claude Code provider — reads/writes JSONL sessions under `~/.claude/projects/`.
//!
//! Session files: `<project-key>/<session-id>.jsonl`
//! Resume command: `claude --resume <session-id>`
//!
//! ## JSONL format
//!
//! Each line is a JSON object with a `type` field:
//! - `"user"` / `"assistant"` — conversational messages (extracted).
//! - `"file-history-snapshot"` / `"summary"` — non-conversational (skipped).
//!
//! Conversational entries carry:
//! - `message.role` / `message.content` / `message.model`
//! - Top-level `cwd`, `sessionId`, `version`, `gitBranch`, `timestamp`
//! - `message.content` may be a string or array of content blocks.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, info, trace, warn};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, normalize_role,
    parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Claude Code provider implementation.
pub struct ClaudeCode;

/// Derive Claude Code's project directory key from a workspace path.
///
/// Reverse-engineered from real Claude Code installations: every non-alphanumeric
/// character is replaced by `-` while alphanumeric characters (including case)
/// are preserved.
///
/// Examples:
/// - `/data/projects/cross_agent_session_resumer` -> `-data-projects-cross-agent-session-resumer`
/// - `/data/projects/jeffreys-skills.md` -> `-data-projects-jeffreys-skills-md`
pub fn project_dir_key(workspace: &Path) -> String {
    workspace
        .to_string_lossy()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect()
}

impl ClaudeCode {
    /// Root directory for Claude Code sessions.
    /// Respects `CLAUDE_HOME` env var override.
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("CLAUDE_HOME") {
            return Some(PathBuf::from(home));
        }
        dirs::home_dir().map(|h| h.join(".claude"))
    }

    /// Projects directory where session files live.
    fn projects_dir() -> Option<PathBuf> {
        Self::home_dir().map(|h| h.join("projects"))
    }
}

impl Provider for ClaudeCode {
    fn name(&self) -> &str {
        "Claude Code"
    }

    fn slug(&self) -> &str {
        "claude-code"
    }

    fn cli_alias(&self) -> &str {
        "cc"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        // Check for binary in PATH.
        if which::which("claude").is_ok() {
            evidence.push("claude binary found in PATH".to_string());
            installed = true;
        }

        // Check for config directory.
        if let Some(home) = Self::home_dir()
            && home.is_dir()
        {
            evidence.push(format!("{} exists", home.display()));
            installed = true;
        }

        trace!(provider = "claude-code", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        match Self::projects_dir() {
            Some(dir) if dir.is_dir() => vec![dir],
            _ => vec![],
        }
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        let projects_dir = Self::projects_dir()?;
        if !projects_dir.is_dir() {
            return Some(vec![]);
        }

        let mut sessions: Vec<(String, PathBuf)> = Vec::new();
        let project_entries = match std::fs::read_dir(&projects_dir) {
            Ok(entries) => entries,
            Err(_) => return Some(vec![]),
        };

        for project_entry in project_entries.flatten() {
            let project_path = project_entry.path();
            if !project_path.is_dir() {
                continue;
            }

            let session_entries = match std::fs::read_dir(&project_path) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for session_entry in session_entries.flatten() {
                let path = session_entry.path();
                if !path.is_file() {
                    continue;
                }
                if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }

                let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                    continue;
                };
                let session_id = claude_session_id_hint(&path).unwrap_or_else(|| stem.to_string());
                if session_id.trim().is_empty() {
                    continue;
                }
                sessions.push((session_id, path));
            }
        }

        Some(sessions)
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let projects_dir = Self::projects_dir()?;
        if !projects_dir.is_dir() {
            return None;
        }
        // Scan project directories for a file matching <session-id>.jsonl
        let target_filename = format!("{session_id}.jsonl");
        for entry in std::fs::read_dir(&projects_dir).ok()?.flatten() {
            if entry.file_type().ok()?.is_dir() {
                let candidate = entry.path().join(&target_filename);
                if candidate.is_file() {
                    debug!(path = %candidate.display(), "found Claude Code session");
                    return Some(candidate);
                }
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Claude Code session");

        let file = std::fs::File::open(path)
            .with_context(|| format!("failed to open {}", path.display()))?;
        let reader = BufReader::new(file);

        // Session-level metadata extracted from the first relevant entry.
        let mut session_id: Option<String> = None;
        let mut workspace: Option<PathBuf> = None;
        let mut git_branch: Option<String> = None;
        let mut version: Option<String> = None;
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;
        let mut model_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut line_num: usize = 0;
        let mut skipped: usize = 0;

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

            let entry: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    warn!(line = line_num, error = %e, "skipping malformed JSON line");
                    skipped += 1;
                    continue;
                }
            };

            // Extract session-level metadata from first entry that has them.
            if session_id.is_none()
                && let Some(sid) = entry.get("sessionId").and_then(|v| v.as_str())
            {
                session_id = Some(sid.to_string());
            }
            if workspace.is_none()
                && let Some(cwd) = entry.get("cwd").and_then(|v| v.as_str())
            {
                workspace = Some(PathBuf::from(cwd));
            }
            if git_branch.is_none()
                && let Some(gb) = entry.get("gitBranch").and_then(|v| v.as_str())
                && gb != "HEAD"
            {
                git_branch = Some(gb.to_string());
            }
            if version.is_none()
                && let Some(v) = entry.get("version").and_then(|v| v.as_str())
            {
                version = Some(v.to_string());
            }

            // Filter: only extract user/assistant conversational messages.
            let entry_type = entry.get("type").and_then(|v| v.as_str());
            let is_conversational = matches!(entry_type, Some("user") | Some("assistant"));
            if !is_conversational {
                trace!(
                    line = line_num,
                    ?entry_type,
                    "skipping non-conversational entry"
                );
                continue;
            }

            // Extract role from message.role → top-level type.
            let role_str = entry
                .pointer("/message/role")
                .and_then(|v| v.as_str())
                .or(entry_type)
                .unwrap_or("user");
            let role = normalize_role(role_str);

            // Extract content from message.content → top-level content.
            let content_value = entry
                .pointer("/message/content")
                .or_else(|| entry.get("content"));
            let content = claude_extract_text_content(content_value);
            let tool_calls = extract_tool_calls(content_value);
            let tool_results = extract_tool_results(content_value);

            // Skip messages that have neither text nor tool payloads.
            if content.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                trace!(line = line_num, "skipping empty content message");
                continue;
            }

            // Extract timestamp.
            let ts_value = entry
                .get("timestamp")
                .or_else(|| entry.pointer("/message/timestamp"));
            let timestamp = ts_value.and_then(parse_timestamp);

            // Track start/end times.
            if let Some(ts) = timestamp {
                started_at = Some(started_at.map_or(ts, |s: i64| s.min(ts)));
                ended_at = Some(ended_at.map_or(ts, |e: i64| e.max(ts)));
            }

            // Extract model name (author).
            let model = entry
                .pointer("/message/model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if let Some(ref m) = model {
                *model_counts.entry(m.clone()).or_insert(0) += 1;
            }

            messages.push(CanonicalMessage {
                idx: 0, // Re-indexed below.
                role,
                content,
                timestamp,
                author: model,
                tool_calls,
                tool_results,
                extra: entry,
            });
        }

        reindex_messages(&mut messages);

        // Derive session ID from filename if not found in content.
        let session_id = session_id.unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

        // Derive title from first user message.
        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        // Most common model name.
        let model_name = model_counts
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(name, _)| name);

        // Build metadata.
        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("claude_code".to_string()),
        );
        if let Some(ref gb) = git_branch {
            metadata.insert("gitBranch".into(), serde_json::Value::String(gb.clone()));
        }
        if let Some(ref v) = version {
            metadata.insert("claudeVersion".into(), serde_json::Value::String(v.clone()));
        }

        debug!(
            session_id,
            messages = messages.len(),
            skipped,
            "Claude Code session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "claude-code".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::Value::Object(metadata),
            source_path: path.to_path_buf(),
            model_name,
        })
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let target_session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let now_iso = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        // Determine the project directory key from workspace.
        let workspace_str = session
            .workspace
            .as_deref()
            .unwrap_or(std::path::Path::new("/tmp"));
        let dir_key = project_dir_key(workspace_str);

        let projects_dir = Self::projects_dir()
            .ok_or_else(|| anyhow::anyhow!("cannot determine Claude Code projects directory"))?;
        let target_dir = projects_dir.join(&dir_key);
        let target_path = target_dir.join(format!("{target_session_id}.jsonl"));

        debug!(
            target_session_id,
            target_path = %target_path.display(),
            "writing Claude Code session"
        );

        // Build JSONL content: one line per message.
        let mut lines: Vec<String> = Vec::with_capacity(session.messages.len());
        let mut prev_uuid: Option<String> = None;

        for msg in &session.messages {
            let entry_uuid = uuid::Uuid::new_v4().to_string();
            let msg_ts = msg
                .timestamp
                .map(|ts| {
                    chrono::DateTime::from_timestamp_millis(ts)
                        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
                        .unwrap_or_else(|| now_iso.clone())
                })
                .unwrap_or_else(|| now_iso.clone());

            let entry_type = claude_entry_type(&msg.role);
            let inner_msg = build_inner_message(msg, session.model_name.as_deref(), entry_type);

            // Build the full JSONL entry.
            let parent_uuid_val = match &prev_uuid {
                Some(u) => serde_json::Value::String(u.clone()),
                None => serde_json::Value::Null,
            };
            let entry = serde_json::json!({
                "parentUuid": parent_uuid_val,
                "isSidechain": false,
                "userType": "external",
                "cwd": workspace_str.to_string_lossy(),
                "sessionId": target_session_id,
                "version": "casr",
                "gitBranch": "main",
                "type": entry_type,
                "message": inner_msg,
                "uuid": entry_uuid,
                "timestamp": msg_ts,
            });

            lines.push(serde_json::to_string(&entry)?);
            prev_uuid = Some(entry_uuid);
        }

        let content_bytes = lines.join("\n").into_bytes();

        // Use atomic write.
        let outcome =
            crate::pipeline::atomic_write(&target_path, &content_bytes, opts.force, self.slug())?;

        info!(
            target_session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "Claude Code session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: target_session_id.clone(),
            resume_command: self.resume_command(&target_session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("claude --resume {session_id}")
    }
}

// ---------------------------------------------------------------------------
// Helpers — tool call/result extraction from content blocks
// ---------------------------------------------------------------------------

/// Extract tool invocations from a content value (array of content blocks).
fn extract_tool_calls(content: Option<&serde_json::Value>) -> Vec<ToolCall> {
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

/// Extract tool results from a content value (array of content blocks).
fn extract_tool_results(content: Option<&serde_json::Value>) -> Vec<ToolResult> {
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
            let text = obj
                .get("content")
                .and_then(|v| v.as_str())
                .or_else(|| obj.get("output").and_then(|v| v.as_str()))
                .unwrap_or("")
                .to_string();
            Some(ToolResult {
                call_id: obj
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                content: text,
                is_error: obj
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn claude_entry_type(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::User => "user",
        MessageRole::Assistant => "assistant",
        MessageRole::Tool | MessageRole::System | MessageRole::Other(_) => "user",
    }
}

fn build_message_content(msg: &CanonicalMessage) -> serde_json::Value {
    match msg.role {
        MessageRole::Assistant => {
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
            serde_json::Value::Array(blocks)
        }
        _ => {
            if !msg.tool_results.is_empty() {
                let mut blocks: Vec<serde_json::Value> = Vec::new();
                for tr in &msg.tool_results {
                    blocks.push(serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": tr.call_id.as_deref().unwrap_or(""),
                        "content": tr.content,
                        "is_error": tr.is_error,
                    }));
                }
                serde_json::Value::Array(blocks)
            } else {
                serde_json::Value::String(msg.content.clone())
            }
        }
    }
}

fn build_inner_message(
    msg: &CanonicalMessage,
    session_model_name: Option<&str>,
    entry_type: &str,
) -> serde_json::Value {
    let mut inner_msg = serde_json::json!({
        "role": entry_type,
        "content": build_message_content(msg),
    });
    if let Some(ref author) = msg.author {
        inner_msg["model"] = serde_json::Value::String(author.clone());
    } else if msg.role == MessageRole::Assistant
        && let Some(model) = session_model_name
    {
        inner_msg["model"] = serde_json::Value::String(model.to_string());
    }
    inner_msg
}

fn claude_session_id_hint(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().map_while(Result::ok).take(8) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let entry: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(session_id) = entry.get("sessionId").and_then(|v| v.as_str()) {
            return Some(session_id.to_string());
        }
    }
    None
}

fn claude_extract_text_content(content: Option<&serde_json::Value>) -> String {
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
                        if (matches!(block_type, Some("text") | Some("input_text"))
                            || block_type.is_none())
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

#[cfg(test)]
mod tests {
    use super::{build_inner_message, build_message_content, claude_entry_type, project_dir_key};
    use crate::model::{CanonicalMessage, MessageRole, ToolCall, ToolResult};
    use std::path::Path;

    #[test]
    fn project_dir_key_matches_observed_workspace_mapping() {
        let got = project_dir_key(Path::new("/data/projects/cross_agent_session_resumer"));
        assert_eq!(got, "-data-projects-cross-agent-session-resumer");
    }

    #[test]
    fn project_dir_key_replaces_dots_underscores_and_slashes() {
        let got = project_dir_key(Path::new("/data/projects/jeffreys-skills.md"));
        assert_eq!(got, "-data-projects-jeffreys-skills-md");
    }

    #[test]
    fn project_dir_key_handles_simple_home_paths() {
        let got = project_dir_key(Path::new("/home/ubuntu"));
        assert_eq!(got, "-home-ubuntu");
    }

    fn sample_message(role: MessageRole, content: &str) -> CanonicalMessage {
        CanonicalMessage {
            idx: 0,
            role,
            content: content.to_string(),
            timestamp: None,
            author: None,
            tool_calls: Vec::new(),
            tool_results: Vec::new(),
            extra: serde_json::Value::Null,
        }
    }

    #[test]
    fn writer_assistant_content_serializes_text_and_tool_use_blocks() {
        let mut msg = sample_message(MessageRole::Assistant, "Plan generated.");
        msg.tool_calls.push(ToolCall {
            id: Some("tool-1".to_string()),
            name: "Read".to_string(),
            arguments: serde_json::json!({"file_path": "src/main.rs"}),
        });

        let content = build_message_content(&msg);
        let blocks = content
            .as_array()
            .expect("assistant content should be serialized as blocks");
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[0]["text"], "Plan generated.");
        assert_eq!(blocks[1]["type"], "tool_use");
        assert_eq!(blocks[1]["id"], "tool-1");
        assert_eq!(blocks[1]["name"], "Read");
    }

    #[test]
    fn writer_non_assistant_tool_results_serialize_as_blocks() {
        let mut msg = sample_message(MessageRole::Tool, "");
        msg.tool_results.push(ToolResult {
            call_id: Some("call-42".to_string()),
            content: "Done".to_string(),
            is_error: false,
        });

        let content = build_message_content(&msg);
        let blocks = content
            .as_array()
            .expect("tool result content should be serialized as blocks");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0]["type"], "tool_result");
        assert_eq!(blocks[0]["tool_use_id"], "call-42");
        assert_eq!(blocks[0]["content"], "Done");
        assert_eq!(blocks[0]["is_error"], false);
    }

    #[test]
    fn writer_inner_message_uses_fallback_model_for_assistant() {
        let msg = sample_message(MessageRole::Assistant, "hi");
        let inner = build_inner_message(&msg, Some("claude-3-7-sonnet"), "assistant");
        assert_eq!(inner["role"], "assistant");
        assert_eq!(inner["model"], "claude-3-7-sonnet");
    }

    #[test]
    fn writer_entry_type_maps_non_assistant_roles_to_user() {
        assert_eq!(claude_entry_type(&MessageRole::User), "user");
        assert_eq!(claude_entry_type(&MessageRole::Assistant), "assistant");
        assert_eq!(claude_entry_type(&MessageRole::Tool), "user");
        assert_eq!(claude_entry_type(&MessageRole::System), "user");
        assert_eq!(
            claude_entry_type(&MessageRole::Other("reviewer".to_string())),
            "user"
        );
    }

    // -----------------------------------------------------------------------
    // Reader unit tests
    // -----------------------------------------------------------------------

    use super::ClaudeCode;
    use crate::providers::Provider;
    use std::io::Write;

    /// Write JSONL content to a temp file and read it back.
    fn read_cc_jsonl(content: &str) -> crate::model::CanonicalSession {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        tmp.write_all(content.as_bytes()).unwrap();
        tmp.flush().unwrap();
        ClaudeCode
            .read_session(tmp.path())
            .unwrap_or_else(|e| panic!("read_session failed: {e}"))
    }

    #[test]
    fn reader_basic_user_assistant_exchange() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s1","cwd":"/tmp/proj","message":{"role":"user","content":"Hello"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s1","cwd":"/tmp/proj","message":{"role":"assistant","content":[{"type":"text","text":"Hi there"}],"model":"claude-3"},"uuid":"u2","timestamp":"2026-01-01T00:00:05Z"}"#,
        );
        assert_eq!(session.session_id, "s1");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Hi there");
        assert_eq!(
            session.workspace,
            Some(std::path::PathBuf::from("/tmp/proj"))
        );
        assert_eq!(session.model_name.as_deref(), Some("claude-3"));
    }

    #[test]
    fn reader_string_content_for_assistant() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s2","message":{"role":"user","content":"Q"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s2","message":{"role":"assistant","content":"A plain string answer"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(session.messages[1].content, "A plain string answer");
    }

    #[test]
    fn reader_skips_non_conversational_types() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s3","message":{"role":"user","content":"Hi"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"file-history-snapshot","data":{"files":{}}}
{"type":"summary","summary":"test summary"}
{"type":"assistant","sessionId":"s3","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}],"model":"m1"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_skips_empty_content_messages() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s4","message":{"role":"user","content":"Real"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s4","message":{"role":"assistant","content":""},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}
{"type":"assistant","sessionId":"s4","message":{"role":"assistant","content":"   "},"uuid":"u3","timestamp":"2026-01-01T00:00:02Z"}
{"type":"assistant","sessionId":"s4","message":{"role":"assistant","content":[{"type":"text","text":"Valid"}],"model":"m1"},"uuid":"u4","timestamp":"2026-01-01T00:00:03Z"}"#,
        );
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "Valid");
    }

    #[test]
    fn reader_extracts_tool_calls() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s5","message":{"role":"user","content":"Read the file"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s5","message":{"role":"assistant","content":[{"type":"text","text":"Reading it now."},{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"main.rs"}}],"model":"m1"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(session.messages[1].content, "Reading it now.");
        assert_eq!(session.messages[1].tool_calls.len(), 1);
        assert_eq!(session.messages[1].tool_calls[0].name, "Read");
        assert_eq!(session.messages[1].tool_calls[0].id.as_deref(), Some("t1"));
    }

    #[test]
    fn reader_extracts_tool_results() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s6","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"file contents here","is_error":false},{"type":"text","text":"Here's the result"}]},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s6","message":{"role":"assistant","content":[{"type":"text","text":"Got it"}],"model":"m1"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        // User message has text + tool_result, so content includes "Here's the result".
        assert_eq!(session.messages[0].tool_results.len(), 1);
        assert_eq!(
            session.messages[0].tool_results[0].content,
            "file contents here"
        );
    }

    #[test]
    fn reader_session_id_fallback_to_filename() {
        let session = read_cc_jsonl(
            r#"{"type":"user","message":{"role":"user","content":"No sessionId field"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":"Reply"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        // No sessionId in content → falls back to filename stem.
        assert!(!session.session_id.is_empty());
    }

    #[test]
    fn reader_tolerates_malformed_lines() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s7","message":{"role":"user","content":"Valid 1"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
not json at all
{"broken json
{"type":"assistant","sessionId":"s7","message":{"role":"assistant","content":"Valid 2"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_preserves_git_branch_in_metadata() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s8","gitBranch":"feature/foo","message":{"role":"user","content":"Hi"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s8","message":{"role":"assistant","content":"Hello"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(session.metadata["gitBranch"].as_str(), Some("feature/foo"));
    }

    #[test]
    fn reader_preserves_version_in_metadata() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s9","version":"1.2.3","message":{"role":"user","content":"Hi"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s9","message":{"role":"assistant","content":"Hello"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(session.metadata["claudeVersion"].as_str(), Some("1.2.3"));
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s10","message":{"role":"user","content":"Fix the authentication bug in login.rs"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s10","message":{"role":"assistant","content":"Done"},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z"}"#,
        );
        assert_eq!(
            session.title.as_deref(),
            Some("Fix the authentication bug in login.rs")
        );
    }

    #[test]
    fn reader_timestamp_tracking() {
        let session = read_cc_jsonl(
            r#"{"type":"user","sessionId":"s11","message":{"role":"user","content":"Start"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z"}
{"type":"assistant","sessionId":"s11","message":{"role":"assistant","content":"Middle"},"uuid":"u2","timestamp":"2026-01-01T00:05:00Z"}
{"type":"user","sessionId":"s11","message":{"role":"user","content":"End"},"uuid":"u3","timestamp":"2026-01-01T00:10:00Z"}
{"type":"assistant","sessionId":"s11","message":{"role":"assistant","content":"Done"},"uuid":"u4","timestamp":"2026-01-01T00:15:00Z"}"#,
        );
        assert!(session.started_at.is_some());
        assert!(session.ended_at.is_some());
        assert!(session.started_at.unwrap() < session.ended_at.unwrap());
    }

    #[test]
    fn reader_empty_file_returns_empty_session() {
        let session = read_cc_jsonl("");
        assert_eq!(session.messages.len(), 0);
    }

    // -----------------------------------------------------------------------
    // Writer helper unit tests
    // -----------------------------------------------------------------------

    #[test]
    fn writer_user_content_serializes_as_plain_string() {
        let msg = sample_message(MessageRole::User, "Just text");
        let content = build_message_content(&msg);
        assert!(
            content.is_string(),
            "CC user content should serialize as plain string"
        );
        assert_eq!(content.as_str().unwrap(), "Just text");
    }

    #[test]
    fn writer_assistant_empty_content_only_tool_calls() {
        let mut msg = sample_message(MessageRole::Assistant, "");
        msg.tool_calls.push(ToolCall {
            id: Some("t1".to_string()),
            name: "Bash".to_string(),
            arguments: serde_json::json!({"command": "ls"}),
        });
        let content = build_message_content(&msg);
        let blocks = content
            .as_array()
            .expect("assistant content should be array");
        // No text block since content is empty, only tool_use.
        assert_eq!(blocks.len(), 1, "should have only tool_use block");
        assert_eq!(blocks[0]["type"], "tool_use");
        assert_eq!(blocks[0]["name"], "Bash");
    }

    #[test]
    fn writer_multiple_tool_calls_all_serialized() {
        let mut msg = sample_message(MessageRole::Assistant, "Running two tools.");
        msg.tool_calls.push(ToolCall {
            id: Some("t1".to_string()),
            name: "Read".to_string(),
            arguments: serde_json::json!({"file_path": "a.rs"}),
        });
        msg.tool_calls.push(ToolCall {
            id: Some("t2".to_string()),
            name: "Write".to_string(),
            arguments: serde_json::json!({"file_path": "b.rs"}),
        });
        let content = build_message_content(&msg);
        let blocks = content.as_array().unwrap();
        assert_eq!(blocks.len(), 3, "text + 2 tool_use blocks");
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[1]["type"], "tool_use");
        assert_eq!(blocks[1]["name"], "Read");
        assert_eq!(blocks[2]["type"], "tool_use");
        assert_eq!(blocks[2]["name"], "Write");
    }

    #[test]
    fn writer_tool_result_error_flag_preserved() {
        let mut msg = sample_message(MessageRole::Tool, "");
        msg.tool_results.push(ToolResult {
            call_id: Some("call-err".to_string()),
            content: "permission denied".to_string(),
            is_error: true,
        });
        let content = build_message_content(&msg);
        let blocks = content.as_array().unwrap();
        assert_eq!(blocks[0]["is_error"], true);
        assert_eq!(blocks[0]["content"], "permission denied");
    }

    #[test]
    fn writer_inner_message_user_no_model_field() {
        let msg = sample_message(MessageRole::User, "question");
        let inner = build_inner_message(&msg, Some("claude-3-opus"), "user");
        assert_eq!(inner["role"], "user");
        // User messages should not have model field.
        assert!(inner.get("model").is_none());
    }

    #[test]
    fn writer_inner_message_assistant_explicit_author_overrides_session() {
        let mut msg = sample_message(MessageRole::Assistant, "answer");
        msg.author = Some("claude-4-opus".to_string());
        let inner = build_inner_message(&msg, Some("claude-3-opus"), "assistant");
        // Explicit author on message should override session model name.
        assert_eq!(inner["model"], "claude-4-opus");
    }
}
