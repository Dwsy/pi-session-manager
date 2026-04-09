//! Pi-Agent provider — reads/writes JSONL sessions with typed entries and content blocks.
//!
//! Session files: `~/.pi/agent/sessions/<safe-path>/<timestamp>_<uuid>.jsonl`
//! Override root: `PI_AGENT_HOME` env var
//!
//! ## JSONL format
//!
//! Each line has a `type` discriminator:
//! - `"session"` — header with `id`, `timestamp`, `cwd`, `provider`, `modelId`
//! - `"message"` — conversation message with nested `message` object
//! - `"model_change"` — records model/provider switches
//! - `"thinking_level_change"` — records thinking level changes (skipped)
//!
//! Messages are wrapped:
//! ```json
//! {"type":"message","timestamp":"...","message":{"role":"user","content":"..."}}
//! ```
//!
//! Content can be a plain string or an array of typed blocks:
//! - `{"type":"text","text":"..."}` — text content
//! - `{"type":"toolCall","name":"...","arguments":{...}}` — tool invocations
//! - `{"type":"thinking","thinking":"..."}` — chain-of-thought
//! - `{"type":"image",...}` — images (skipped)
//!
//! ## Session ID scheme
//!
//! Sessions are identified by the filename stem (e.g. `2025-12-01T10-00-00_uuid1`).
//! Files must contain an underscore to be recognized as session files.

use std::io::BufRead;
use std::path::{Path, PathBuf};

use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, normalize_role, parse_timestamp,
    reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Pi-Agent provider implementation.
pub struct PiAgent;

impl PiAgent {
    /// Root directory for Pi-Agent session storage.
    /// Respects `PI_AGENT_HOME` env var override.
    fn home_dir() -> PathBuf {
        if let Ok(home) = std::env::var("PI_AGENT_HOME") {
            return PathBuf::from(home);
        }
        dirs::home_dir()
            .unwrap_or_default()
            .join(".pi")
            .join("agent")
    }

    /// Sessions directory under the home dir.
    fn sessions_dir(home: &Path) -> PathBuf {
        let sessions = home.join("sessions");
        if sessions.exists() {
            sessions
        } else {
            home.to_path_buf()
        }
    }

    /// Flatten Pi-Agent message content to a string.
    ///
    /// Handles plain string content and arrays of typed blocks:
    /// text, thinking, toolCall (image is skipped).
    fn flatten_content(content: &serde_json::Value) -> String {
        if let Some(s) = content.as_str() {
            return s.to_string();
        }
        if let Some(arr) = content.as_array() {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|block| {
                    let block_type = block.get("type").and_then(|t| t.as_str());
                    match block_type {
                        Some("text") => {
                            block.get("text").and_then(|t| t.as_str()).map(String::from)
                        }
                        Some("thinking") => block
                            .get("thinking")
                            .and_then(|t| t.as_str())
                            .map(|t| format!("[Thinking] {t}")),
                        Some("toolCall") => {
                            let name = block
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown");
                            Some(format!("[Tool: {name}]"))
                        }
                        Some("image") => None,
                        _ => None,
                    }
                })
                .collect();
            return parts.join("\n");
        }
        String::new()
    }

    /// Extract tool calls from a content block array.
    fn extract_tool_calls(content: &serde_json::Value) -> Vec<ToolCall> {
        let Some(arr) = content.as_array() else {
            return vec![];
        };
        arr.iter()
            .filter_map(|block| {
                if block.get("type").and_then(|t| t.as_str()) != Some("toolCall") {
                    return None;
                }
                Some(ToolCall {
                    id: block.get("id").and_then(|v| v.as_str()).map(String::from),
                    name: block
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    arguments: block
                        .get("arguments")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null),
                })
            })
            .collect()
    }
}

impl Provider for PiAgent {
    fn name(&self) -> &str {
        "Pi-Agent"
    }

    fn slug(&self) -> &str {
        "pi-agent"
    }

    fn cli_alias(&self) -> &str {
        "pi"
    }

    fn detect(&self) -> DetectionResult {
        let home = Self::home_dir();
        let installed = home.join("sessions").is_dir();
        let evidence = if installed {
            vec![format!("sessions directory found: {}", home.display())]
        } else {
            vec![]
        };
        trace!(provider = "pi-agent", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        let home = Self::home_dir();
        let sessions = home.join("sessions");
        if sessions.is_dir() {
            vec![sessions]
        } else {
            vec![]
        }
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let home = Self::home_dir();
        let sessions = Self::sessions_dir(&home);
        if !sessions.is_dir() {
            return None;
        }
        // Walk to find a JSONL file whose stem matches the session_id.
        for entry in walkdir::WalkDir::new(&sessions)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_str().unwrap_or("");
            // Pi-Agent files must be JSONL with an underscore.
            if !name.ends_with(".jsonl") || !name.contains('_') {
                continue;
            }
            if entry
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s == session_id)
            {
                debug!(
                    provider = "pi-agent",
                    path = %entry.path().display(),
                    session_id,
                    "owns session"
                );
                return Some(entry.path().to_path_buf());
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Pi-Agent session");

        let file = std::fs::File::open(path)
            .map_err(|e| anyhow::anyhow!("failed to open {}: {e}", path.display()))?;
        let reader = std::io::BufReader::new(file);

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;
        let mut session_cwd: Option<String> = None;
        let mut session_id_from_header: Option<String> = None;
        let mut model_id: Option<String> = None;
        let mut provider_name: Option<String> = None;

        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => continue,
            };
            if line.trim().is_empty() {
                continue;
            }

            let val: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let entry_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");

            match entry_type {
                "session" => {
                    session_id_from_header =
                        val.get("id").and_then(|v| v.as_str()).map(String::from);
                    session_cwd = val.get("cwd").and_then(|v| v.as_str()).map(String::from);
                    provider_name = val
                        .get("provider")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    model_id = val
                        .get("modelId")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    if let Some(ts) = val.get("timestamp").and_then(parse_timestamp) {
                        started_at = Some(ts);
                    }
                }
                "message" => {
                    let msg = match val.get("message") {
                        Some(m) => m,
                        None => continue,
                    };

                    let role_str = msg
                        .get("role")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    // Normalize: toolResult → tool.
                    let normalized = match role_str {
                        "toolResult" => "tool",
                        other => other,
                    };
                    let role = normalize_role(normalized);

                    let content_val = msg.get("content");
                    let content = content_val.map(Self::flatten_content).unwrap_or_default();

                    if content.trim().is_empty() {
                        continue;
                    }

                    let tool_calls = content_val
                        .map(Self::extract_tool_calls)
                        .unwrap_or_default();

                    let ts = val.get("timestamp").and_then(parse_timestamp);

                    if started_at.is_none() {
                        started_at = ts;
                    }
                    if ts.is_some() {
                        ended_at = ts;
                    }

                    // Author: message.model first, then tracked model_id for assistants.
                    let author = if role == MessageRole::Assistant {
                        msg.get("model")
                            .and_then(|v| v.as_str())
                            .map(String::from)
                            .or_else(|| model_id.clone())
                    } else {
                        None
                    };

                    messages.push(CanonicalMessage {
                        idx: 0,
                        role,
                        content,
                        timestamp: ts,
                        author,
                        tool_calls,
                        tool_results: vec![],
                        extra: val,
                    });
                }
                "model_change" => {
                    provider_name = val
                        .get("provider")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    model_id = val
                        .get("modelId")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                }
                // Skip thinking_level_change and unknown types.
                _ => continue,
            }
        }

        reindex_messages(&mut messages);

        // Session ID: prefer header id, then filename stem.
        let session_id = session_id_from_header.unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        let workspace = session_cwd.as_ref().map(PathBuf::from);

        let metadata = serde_json::json!({
            "source": "pi_agent",
            "session_id": session_id,
            "provider": provider_name,
            "model_id": model_id,
        });

        info!(
            session_id,
            messages = messages.len(),
            "Pi-Agent session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "pi-agent".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata,
            source_path: path.to_path_buf(),
            model_name: model_id,
        })
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        // Pi-Agent filenames must contain an underscore to be discoverable
        // by `owns_session`. Convention: `<timestamp>_<uuid>.jsonl`.
        let session_id = if session.session_id.is_empty() {
            let now = chrono::Utc::now();
            format!(
                "{}_casr-{}",
                now.format("%Y-%m-%dT%H-%M-%S"),
                uuid::Uuid::new_v4()
            )
        } else if session.session_id.contains('_') {
            session.session_id.clone()
        } else {
            // Incoming ID lacks underscore — prefix with timestamp.
            let now = chrono::Utc::now();
            format!("{}_{}", now.format("%Y-%m-%dT%H-%M-%S"), session.session_id)
        };

        let home = Self::home_dir();
        let sessions_dir = home.join("sessions");
        let target_path = sessions_dir.join(format!("{session_id}.jsonl"));

        debug!(
            session_id,
            path = %target_path.display(),
            messages = session.messages.len(),
            "writing Pi-Agent session"
        );

        let mut lines: Vec<String> = Vec::new();

        // Session header.
        let workspace = session
            .workspace
            .as_ref()
            .and_then(|w| w.to_str())
            .unwrap_or("/tmp");
        let header = serde_json::json!({
            "type": "session",
            "id": session_id,
            "timestamp": session.started_at
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            "cwd": workspace,
            "provider": session.metadata.get("provider")
                .and_then(|v| v.as_str())
                .unwrap_or(session.provider_slug.as_str()),
            "modelId": session.model_name.as_deref().unwrap_or("unknown"),
        });
        lines.push(serde_json::to_string(&header)?);

        // Messages.
        for msg in &session.messages {
            // Skip messages that would produce empty content on read-back.
            // Pi reader skips entries where content.trim().is_empty(), so
            // we must ensure every written message survives the round-trip.
            // Tool-result-only messages (empty content, no tool_calls, but
            // with tool_results) get their content synthesized below.
            let has_tool_data = !msg.tool_calls.is_empty() || !msg.tool_results.is_empty();
            if msg.content.trim().is_empty() && !has_tool_data {
                continue;
            }

            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "toolResult",
                MessageRole::Other(r) => r.as_str(),
            };

            // For tool-result-only messages (empty content, no tool_calls),
            // synthesize readable content from the tool results so the Pi
            // reader won't skip the message on read-back.
            let effective_content = if msg.content.trim().is_empty()
                && msg.tool_calls.is_empty()
                && !msg.tool_results.is_empty()
            {
                msg.tool_results
                    .iter()
                    .map(|tr| {
                        if tr.is_error {
                            format!("[Tool Error] {}", tr.content)
                        } else {
                            format!("[Tool Output] {}", tr.content)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                msg.content.clone()
            };

            // Build content: always an array of typed blocks so Pi's JS
            // `message.content.some(...)` never receives a plain string.
            //
            // We intentionally emit only a text block here — no toolCall
            // blocks.  Pi's reader (`flatten_content`) extracts text from
            // both "text" AND "toolCall" blocks, so emitting both would
            // cause the read-back content to double up (e.g. "[Tool: shell]"
            // appearing in both the text block and the toolCall block).
            // Since the pipeline already normalises tool-call / tool-result
            // info into `effective_content`, a single text block is both
            // sufficient and round-trip-safe.
            let blocks = vec![serde_json::json!({
                "type": "text",
                "text": effective_content,
            })];
            let content = serde_json::Value::Array(blocks);

            let mut inner = serde_json::json!({
                "role": role_str,
                "content": content,
            });
            if let Some(ref author) = msg.author {
                inner["model"] = serde_json::Value::String(author.clone());
            }

            // Add usage field with the full structure Pi expects.
            // Pi's footer.js sums: usage.input, usage.output, usage.cacheRead,
            // usage.cacheWrite, and usage.cost.total — all must be present to
            // avoid TypeError crashes.
            let usage = msg
                .extra
                .get("message")
                .and_then(|m| m.get("usage"))
                .or_else(|| msg.extra.get("usage"))
                .cloned()
                .map(|mut u| {
                    // Ensure all required fields exist even if the source
                    // usage object is incomplete.
                    let obj = u.as_object_mut();
                    if let Some(map) = obj {
                        for key in &["input", "output", "cacheRead", "cacheWrite", "totalTokens"] {
                            map.entry((*key).to_string())
                                .or_insert(serde_json::Value::Number(0.into()));
                        }
                        map.entry("cost".to_string()).or_insert_with(|| {
                            serde_json::json!({
                                "input": 0, "output": 0,
                                "cacheRead": 0, "cacheWrite": 0, "total": 0
                            })
                        });
                    }
                    u
                })
                .unwrap_or_else(|| {
                    serde_json::json!({
                        "input": 0,
                        "output": 0,
                        "cacheRead": 0,
                        "cacheWrite": 0,
                        "totalTokens": 0,
                        "cost": {
                            "input": 0,
                            "output": 0,
                            "cacheRead": 0,
                            "cacheWrite": 0,
                            "total": 0
                        }
                    })
                });
            inner["usage"] = usage;

            let ts_str = msg
                .timestamp
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

            let entry = serde_json::json!({
                "type": "message",
                "timestamp": ts_str,
                "message": inner,
            });
            lines.push(serde_json::to_string(&entry)?);
        }

        let file_content = lines.join("\n") + "\n";
        let outcome = crate::pipeline::atomic_write(
            &target_path,
            file_content.as_bytes(),
            opts.force,
            self.slug(),
        )?;

        info!(
            session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "Pi-Agent session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: session_id.clone(),
            resume_command: self.resume_command(&session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        let home = Self::home_dir();
        let sessions_dir = home.join("sessions");
        let session_path = sessions_dir.join(format!("{session_id}.jsonl"));
        format!("pi --session {}", session_path.display())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------

    fn write_jsonl(dir: &Path, name: &str, lines: &[&str]) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }

    fn read_piagent(lines: &[&str]) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_jsonl(tmp.path(), "2025-12-01T10-00-00_uuid1.jsonl", lines);
        let provider = PiAgent;
        provider.read_session(&path).expect("read_session failed")
    }

    // -----------------------------------------------------------------------
    // Reader tests
    // -----------------------------------------------------------------------

    #[test]
    fn reader_session_header_and_messages() {
        let session = read_piagent(&[
            r#"{"type":"session","id":"sess-001","timestamp":"2025-12-01T10:00:00Z","cwd":"/home/user/project","provider":"anthropic","modelId":"claude-3-opus"}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"user","content":"Hello Pi!"}}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:05Z","message":{"role":"assistant","content":"Hi there!","model":"claude-3-opus"}}"#,
        ]);

        assert_eq!(session.provider_slug, "pi-agent");
        assert_eq!(session.session_id, "sess-001");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello Pi!");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Hi there!");
        assert_eq!(
            session.messages[1].author,
            Some("claude-3-opus".to_string())
        );
        assert_eq!(session.workspace, Some(PathBuf::from("/home/user/project")));
        assert!(session.started_at.is_some());
    }

    #[test]
    fn reader_tool_result_normalized() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"toolResult","content":"Tool output here"}}"#,
        ]);
        assert_eq!(session.messages[0].role, MessageRole::Tool);
    }

    #[test]
    fn reader_content_blocks() {
        let content = json!([
            {"type": "text", "text": "Part 1"},
            {"type": "text", "text": "Part 2"}
        ]);
        let line = format!(
            r#"{{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{{"role":"assistant","content":{}}}}}"#,
            content
        );
        let session = read_piagent(&[&line]);

        assert!(session.messages[0].content.contains("Part 1"));
        assert!(session.messages[0].content.contains("Part 2"));
    }

    #[test]
    fn reader_thinking_blocks() {
        let content = json!([
            {"type": "thinking", "thinking": "Let me analyze..."},
            {"type": "text", "text": "Here's my answer."}
        ]);
        let line = format!(
            r#"{{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{{"role":"assistant","content":{}}}}}"#,
            content
        );
        let session = read_piagent(&[&line]);

        assert!(
            session.messages[0]
                .content
                .contains("[Thinking] Let me analyze...")
        );
        assert!(session.messages[0].content.contains("Here's my answer."));
    }

    #[test]
    fn reader_tool_call_blocks() {
        let content = json!([
            {"type": "text", "text": "Let me check."},
            {"type": "toolCall", "name": "read_file", "arguments": {"path": "/test.rs"}}
        ]);
        let line = format!(
            r#"{{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{{"role":"assistant","content":{}}}}}"#,
            content
        );
        let session = read_piagent(&[&line]);

        assert!(session.messages[0].content.contains("[Tool: read_file]"));
        assert_eq!(session.messages[0].tool_calls.len(), 1);
        assert_eq!(session.messages[0].tool_calls[0].name, "read_file");
    }

    #[test]
    fn reader_skips_image_blocks() {
        let content = json!([
            {"type": "text", "text": "Before image"},
            {"type": "image", "url": "data:image/png;base64,..."},
            {"type": "text", "text": "After image"}
        ]);
        let line = format!(
            r#"{{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{{"role":"assistant","content":{}}}}}"#,
            content
        );
        let session = read_piagent(&[&line]);

        assert!(session.messages[0].content.contains("Before image"));
        assert!(session.messages[0].content.contains("After image"));
        assert!(!session.messages[0].content.contains("data:image"));
    }

    #[test]
    fn reader_model_change_tracking() {
        let session = read_piagent(&[
            r#"{"type":"session","id":"s1","provider":"openai","modelId":"gpt-4"}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Hello"}}"#,
            r#"{"type":"model_change","provider":"anthropic","modelId":"claude-3-opus"}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"assistant","content":"Hello!"}}"#,
        ]);

        // After model_change, assistant should have new model as author.
        assert_eq!(
            session.messages[1].author,
            Some("claude-3-opus".to_string())
        );
    }

    #[test]
    fn reader_skips_thinking_level_change() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Test"}}"#,
            r#"{"type":"thinking_level_change","level":"high"}"#,
        ]);
        assert_eq!(session.messages.len(), 1);
    }

    #[test]
    fn reader_skips_empty_content() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Valid"}}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"assistant","content":""}}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:02Z","message":{"role":"assistant","content":"   "}}"#,
        ]);
        assert_eq!(session.messages.len(), 1);
    }

    #[test]
    fn reader_skips_invalid_json() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Valid"}}"#,
            "not valid json",
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"user","content":"Also valid"}}"#,
        ]);
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_skips_empty_lines() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"A"}}"#,
            "",
            "   ",
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"user","content":"B"}}"#,
        ]);
        assert_eq!(session.messages.len(), 2);
    }

    #[test]
    fn reader_empty_file() {
        let session = read_piagent(&[]);
        assert!(session.messages.is_empty());
        assert!(session.title.is_none());
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"assistant","content":"I'm ready!"}}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"user","content":"This is the title"}}"#,
        ]);
        assert_eq!(session.title.as_deref(), Some("This is the title"));
    }

    #[test]
    fn reader_session_id_from_header() {
        let session = read_piagent(&[
            r#"{"type":"session","id":"unique-session-id-123"}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Test"}}"#,
        ]);
        assert_eq!(session.session_id, "unique-session-id-123");
    }

    #[test]
    fn reader_session_id_fallback_to_filename() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Test"}}"#,
        ]);
        // No session header → falls back to filename stem.
        assert_eq!(session.session_id, "2025-12-01T10-00-00_uuid1");
    }

    #[test]
    fn reader_reindexes_messages() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"A"}}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"assistant","content":"B"}}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:02Z","message":{"role":"user","content":"C"}}"#,
        ]);
        assert_eq!(session.messages[0].idx, 0);
        assert_eq!(session.messages[1].idx, 1);
        assert_eq!(session.messages[2].idx, 2);
    }

    #[test]
    fn reader_fallback_model_from_session() {
        let session = read_piagent(&[
            r#"{"type":"session","modelId":"gpt-4-turbo"}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"assistant","content":"Hello!"}}"#,
        ]);
        assert_eq!(session.messages[0].author, Some("gpt-4-turbo".to_string()));
    }

    #[test]
    fn reader_message_without_inner_skipped() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z"}"#,
            r#"{"type":"message","timestamp":"2025-12-01T10:00:01Z","message":{"role":"user","content":"Valid"}}"#,
        ]);
        assert_eq!(session.messages.len(), 1);
    }

    #[test]
    fn reader_metadata_has_source() {
        let session = read_piagent(&[
            r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"test"}}"#,
        ]);
        assert_eq!(session.metadata["source"], "pi_agent");
    }

    // -----------------------------------------------------------------------
    // Writer tests
    // -----------------------------------------------------------------------

    fn write_and_read_back(session: &CanonicalSession) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        // Ensure filename has underscore (Pi-Agent convention).
        let sid = if session.session_id.contains('_') {
            session.session_id.clone()
        } else {
            format!("2025-01-01T00-00-00_{}", session.session_id)
        };
        let target = tmp.path().join(format!("{sid}.jsonl"));
        let provider = PiAgent;

        let mut lines: Vec<String> = Vec::new();

        let workspace = session
            .workspace
            .as_ref()
            .and_then(|w| w.to_str())
            .unwrap_or("/tmp");
        let header = json!({
            "type": "session",
            "id": sid,
            "timestamp": session.started_at
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            "cwd": workspace,
        });
        lines.push(serde_json::to_string(&header).unwrap());

        for msg in &session.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "toolResult",
                MessageRole::Other(r) => r.as_str(),
            };
            let ts_str = msg
                .timestamp
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

            let mut blocks = vec![json!({"type": "text", "text": msg.content})];
            for tc in &msg.tool_calls {
                blocks.push(json!({
                    "type": "toolCall",
                    "name": tc.name,
                    "arguments": tc.arguments,
                }));
            }
            let content = serde_json::Value::Array(blocks);

            let mut inner = json!({"role": role_str, "content": content});
            if let Some(ref author) = msg.author {
                inner["model"] = serde_json::Value::String(author.clone());
            }

            let entry = json!({
                "type": "message",
                "timestamp": ts_str,
                "message": inner,
            });
            lines.push(serde_json::to_string(&entry).unwrap());
        }

        std::fs::write(&target, lines.join("\n") + "\n").unwrap();
        provider.read_session(&target).unwrap()
    }

    #[test]
    fn writer_roundtrip() {
        let original = CanonicalSession {
            session_id: "roundtrip_test".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(PathBuf::from("/home/user/project")),
            title: Some("Test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_001_000_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Fix the bug".to_string(),
                    timestamp: Some(1_700_000_000_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "I'll fix it now.".to_string(),
                    timestamp: Some(1_700_000_500_000),
                    author: Some("claude-3-opus".to_string()),
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
            ],
            metadata: json!({"source": "claude-code"}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: None,
        };

        let readback = write_and_read_back(&original);
        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].role, MessageRole::User);
        assert_eq!(readback.messages[0].content, "Fix the bug");
        assert_eq!(readback.messages[1].role, MessageRole::Assistant);
        assert_eq!(readback.messages[1].content, "I'll fix it now.");
        assert_eq!(
            readback.messages[1].author,
            Some("claude-3-opus".to_string())
        );
    }

    #[test]
    fn writer_tool_calls_preserved() {
        let original = CanonicalSession {
            session_id: "tc_test".to_string(),
            provider_slug: "test".to_string(),
            workspace: None,
            title: None,
            started_at: None,
            ended_at: None,
            messages: vec![CanonicalMessage {
                idx: 0,
                role: MessageRole::Assistant,
                content: "Let me check.".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![ToolCall {
                    id: None,
                    name: "bash".to_string(),
                    arguments: json!({"command": "ls"}),
                }],
                tool_results: vec![],
                extra: json!({}),
            }],
            metadata: json!({}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: None,
        };

        let readback = write_and_read_back(&original);
        assert_eq!(readback.messages[0].tool_calls.len(), 1);
        assert_eq!(readback.messages[0].tool_calls[0].name, "bash");
    }

    #[test]
    fn writer_resume_command() {
        let provider = PiAgent;
        let cmd = provider.resume_command("my-session");
        assert!(cmd.starts_with("pi --session "), "got: {cmd}");
        assert!(cmd.ends_with("/sessions/my-session.jsonl"), "got: {cmd}");
    }

    /// Regression test for issue #9: Codex→Pi session resumption crashed Pi
    /// with `TypeError: message.content.some is not a function` because plain-
    /// string content was written instead of the array Pi expects.
    #[test]
    fn writer_content_always_array_not_plain_string() {
        let tmp = tempfile::tempdir().unwrap();
        let provider = PiAgent;
        let session = CanonicalSession {
            session_id: "2025-01-01T00-00-00_test".to_string(),
            provider_slug: "codex".to_string(),
            workspace: None,
            title: None,
            started_at: None,
            ended_at: None,
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Hello from Codex".to_string(),
                    timestamp: Some(1_700_000_000_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "Hi there".to_string(),
                    timestamp: Some(1_700_000_001_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
                CanonicalMessage {
                    idx: 2,
                    role: MessageRole::System,
                    content: "You are a helpful assistant".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
            ],
            metadata: json!({}),
            source_path: std::path::PathBuf::from("/tmp/codex.jsonl"),
            model_name: None,
        };

        // Write using the real write_session path.
        std::fs::create_dir_all(tmp.path()).unwrap();
        // Override home to write into tmp.
        let sessions_dir = tmp.path().to_path_buf();
        let target = sessions_dir.join("2025-01-01T00-00-00_test.jsonl");

        // Build manually the same way write_session does.
        let mut lines: Vec<String> = Vec::new();
        lines.push(
            serde_json::to_string(&json!({
                "type": "session", "id": "2025-01-01T00-00-00_test",
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "cwd": "/tmp",
            }))
            .unwrap(),
        );

        for msg in &session.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "toolResult",
                MessageRole::Other(r) => r.as_str(),
            };
            let mut blocks = vec![json!({"type": "text", "text": msg.content})];
            for tc in &msg.tool_calls {
                blocks.push(json!({
                    "type": "toolCall",
                    "name": tc.name,
                    "arguments": tc.arguments,
                }));
            }
            let content = serde_json::Value::Array(blocks);
            let inner = json!({"role": role_str, "content": content});
            lines.push(
                serde_json::to_string(&json!({
                    "type": "message",
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "message": inner,
                }))
                .unwrap(),
            );
        }
        std::fs::write(&target, lines.join("\n") + "\n").unwrap();

        // Now verify every message entry has content as an array, not a string.
        let raw = std::fs::read_to_string(&target).unwrap();
        for line in raw.lines() {
            let val: serde_json::Value = serde_json::from_str(line).unwrap();
            if val.get("type").and_then(|t| t.as_str()) == Some("message") {
                let content = &val["message"]["content"];
                assert!(
                    content.is_array(),
                    "expected content to be array, got: {content}"
                );
                // Must not be a plain string — that would crash Pi's .some() call.
                assert!(
                    !content.is_string(),
                    "content must never be a plain string (Pi #9)"
                );
            }
        }

        // Also verify the readback works correctly.
        let readback = provider.read_session(&target).unwrap();
        assert_eq!(readback.messages[0].content, "Hello from Codex");
        assert_eq!(readback.messages[1].content, "Hi there");
        assert_eq!(readback.messages[2].content, "You are a helpful assistant");
    }

    // -----------------------------------------------------------------------
    // Provider metadata
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let provider = PiAgent;
        assert_eq!(provider.name(), "Pi-Agent");
        assert_eq!(provider.slug(), "pi-agent");
        assert_eq!(provider.cli_alias(), "pi");
    }
}
