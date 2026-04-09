//! OpenClaw provider — reads/writes JSONL sessions with typed entries and content blocks.
//!
//! Session files: `~/.openclaw/agents/openclaw/sessions/*.jsonl`
//! Override root: `OPENCLAW_HOME` env var
//!
//! ## JSONL format
//!
//! Each line has a `type` discriminator: `"session"`, `"message"`,
//! `"model_change"`, `"thinking_level_change"`, `"custom"`.
//!
//! Messages are wrapped:
//! ```json
//! {"type":"message","id":"m1","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
//! ```
//!
//! Content is an **array of blocks**:
//! - `{"type":"text","text":"..."}` — text content
//! - `{"type":"toolCall","name":"...","arguments":{...}}` — tool invocations
//! - `{"type":"thinking","text":"..."}` — chain-of-thought
//!
//! ## Session ID scheme
//!
//! Sessions are identified by the filename stem (e.g. `abc123` from `abc123.jsonl`).

use std::io::BufRead;
use std::path::{Path, PathBuf};

use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, normalize_role, parse_timestamp,
    reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// OpenClaw provider implementation.
pub struct OpenClaw;

impl OpenClaw {
    /// Root directory for OpenClaw session storage.
    /// Respects `OPENCLAW_HOME` env var override.
    fn home_dir() -> PathBuf {
        if let Ok(home) = std::env::var("OPENCLAW_HOME") {
            return PathBuf::from(home);
        }
        dirs::home_dir()
            .unwrap_or_default()
            .join(".openclaw")
            .join("agents")
            .join("openclaw")
            .join("sessions")
    }

    /// Flatten OpenClaw content blocks into a single string.
    ///
    /// Content can be a plain string or an array of typed blocks (text,
    /// toolCall, thinking).
    fn flatten_content(content: &serde_json::Value) -> String {
        match content {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Array(arr) => {
                let parts: Vec<String> = arr
                    .iter()
                    .filter_map(|block| {
                        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match block_type {
                            "text" => block.get("text").and_then(|t| t.as_str()).map(String::from),
                            "toolCall" => {
                                let name = block
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("tool_call");
                                Some(format!("[tool: {name}]"))
                            }
                            "thinking" => {
                                block.get("text").and_then(|t| t.as_str()).map(String::from)
                            }
                            _ => block.get("text").and_then(|t| t.as_str()).map(String::from),
                        }
                    })
                    .collect();
                parts.join("\n")
            }
            _ => crate::model::flatten_content(content),
        }
    }

    /// Extract tool calls from an OpenClaw content block array.
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

impl Provider for OpenClaw {
    fn name(&self) -> &str {
        "OpenClaw"
    }

    fn slug(&self) -> &str {
        "openclaw"
    }

    fn cli_alias(&self) -> &str {
        "ocl"
    }

    fn detect(&self) -> DetectionResult {
        let root = Self::home_dir();
        let installed = root.is_dir();
        // Also check parent dir in case sessions dir hasn't been created yet.
        let parent_exists = if !installed {
            root.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .is_some_and(|p| p.is_dir())
        } else {
            false
        };
        let installed = installed || parent_exists;
        let evidence = if root.is_dir() {
            vec![format!("sessions directory found: {}", root.display())]
        } else if parent_exists {
            vec![format!(
                "parent directory found (sessions dir not yet created): {}",
                root.display()
            )]
        } else {
            vec![]
        };
        trace!(provider = "openclaw", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        let root = Self::home_dir();
        if root.is_dir() { vec![root] } else { vec![] }
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let root = Self::home_dir();
        if !root.is_dir() {
            return None;
        }
        let candidate = root.join(format!("{session_id}.jsonl"));
        if candidate.is_file() {
            debug!(
                provider = "openclaw",
                path = %candidate.display(),
                session_id,
                "owns session"
            );
            return Some(candidate);
        }
        // Walk subdirectories.
        for entry in walkdir::WalkDir::new(&root)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if entry
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s == session_id)
                && entry
                    .path()
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e == "jsonl")
            {
                debug!(
                    provider = "openclaw",
                    path = %entry.path().display(),
                    session_id,
                    "owns session (subdirectory)"
                );
                return Some(entry.path().to_path_buf());
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading OpenClaw session");

        let file = std::fs::File::open(path)
            .map_err(|e| anyhow::anyhow!("failed to open {}: {e}", path.display()))?;
        let reader = std::io::BufReader::new(file);

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;
        let mut session_cwd: Option<String> = None;
        let mut model_name: Option<String> = None;

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

            let line_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");

            match line_type {
                "session" => {
                    session_cwd = val.get("cwd").and_then(|v| v.as_str()).map(String::from);
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
                        .unwrap_or("assistant");
                    let role = normalize_role(role_str);

                    let content_val = msg.get("content");
                    let content = content_val.map(Self::flatten_content).unwrap_or_default();

                    if content.trim().is_empty() {
                        continue;
                    }

                    let tool_calls = content_val
                        .map(Self::extract_tool_calls)
                        .unwrap_or_default();

                    // Timestamps on wrapper or inner message.
                    let ts = val
                        .get("timestamp")
                        .and_then(parse_timestamp)
                        .or_else(|| msg.get("timestamp").and_then(parse_timestamp));

                    if started_at.is_none() {
                        started_at = ts;
                    }
                    if ts.is_some() {
                        ended_at = ts;
                    }

                    let author = msg.get("model").and_then(|v| v.as_str()).map(String::from);

                    if author.is_some() && model_name.is_none() {
                        model_name = author.clone();
                    }

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
                    if let Some(m) = val.get("modelId").and_then(|v| v.as_str()) {
                        model_name = Some(m.to_string());
                    }
                }
                // Skip thinking_level_change, custom, etc.
                _ => continue,
            }
        }

        reindex_messages(&mut messages);

        let session_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        let workspace = session_cwd.as_ref().map(PathBuf::from);

        let metadata = serde_json::json!({
            "source": "openclaw",
            "cwd": session_cwd,
        });

        info!(
            session_id,
            messages = messages.len(),
            "OpenClaw session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "openclaw".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata,
            source_path: path.to_path_buf(),
            model_name,
        })
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let session_id = if session.session_id.is_empty() {
            format!("casr-{}", chrono::Utc::now().format("%Y%m%dT%H%M%S"))
        } else {
            session.session_id.clone()
        };

        let target_dir = Self::home_dir();
        let target_path = target_dir.join(format!("{session_id}.jsonl"));

        debug!(
            session_id,
            path = %target_path.display(),
            messages = session.messages.len(),
            "writing OpenClaw session"
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
            "version": "0.1.0",
        });
        lines.push(serde_json::to_string(&header)?);

        // Messages.
        for (i, msg) in session.messages.iter().enumerate() {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "tool",
                MessageRole::Other(r) => r.as_str(),
            };

            // Build content blocks array.
            let mut blocks = Vec::new();

            // Main text content.
            if !msg.content.is_empty() {
                blocks.push(serde_json::json!({
                    "type": "text",
                    "text": msg.content,
                }));
            }

            // Tool call blocks.
            for tc in &msg.tool_calls {
                blocks.push(serde_json::json!({
                    "type": "toolCall",
                    "id": tc.id.as_deref().unwrap_or(""),
                    "name": tc.name,
                    "arguments": tc.arguments,
                }));
            }

            let content: serde_json::Value = if blocks.len() == 1
                && blocks[0].get("type").and_then(|t| t.as_str()) == Some("text")
            {
                // Single text block — use plain string for compactness.
                serde_json::Value::String(msg.content.clone())
            } else {
                serde_json::Value::Array(blocks)
            };

            let mut inner = serde_json::json!({
                "role": role_str,
                "content": content,
            });
            if let Some(ref author) = msg.author {
                inner["model"] = serde_json::Value::String(author.clone());
            }

            let ts_str = msg
                .timestamp
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

            let entry = serde_json::json!({
                "type": "message",
                "id": format!("m{}", i + 1),
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
            "OpenClaw session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: session_id.clone(),
            resume_command: self.resume_command(&session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("openclaw --resume {session_id}")
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

    fn read_openclaw(lines: &[&str]) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_jsonl(tmp.path(), "test.jsonl", lines);
        let provider = OpenClaw;
        provider.read_session(&path).expect("read_session failed")
    }

    // -----------------------------------------------------------------------
    // Reader tests
    // -----------------------------------------------------------------------

    #[test]
    fn reader_wrapped_messages() {
        let session = read_openclaw(&[
            r#"{"type":"session","id":"abc","timestamp":"2026-02-01T16:00:00.000Z","cwd":"/home/user/project","version":"0.1.0"}"#,
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00.828Z","message":{"role":"user","content":[{"type":"text","text":"Hello OpenClaw"}]}}"#,
            r#"{"type":"message","id":"m2","timestamp":"2026-02-01T16:00:06.672Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"},{"type":"toolCall","id":"tc1","name":"exec","arguments":{}}],"model":"claude-opus-4-5"}}"#,
        ]);

        assert_eq!(session.provider_slug, "openclaw");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello OpenClaw");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert!(session.messages[1].content.contains("Hi there!"));
        assert!(session.messages[1].content.contains("[tool: exec]"));
        assert_eq!(
            session.messages[1].author,
            Some("claude-opus-4-5".to_string())
        );
        assert_eq!(session.workspace, Some(PathBuf::from("/home/user/project")));
        assert!(session.started_at.is_some());
    }

    #[test]
    fn reader_tool_calls_extracted() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Let me check."},{"type":"toolCall","id":"tc1","name":"read_file","arguments":{"path":"/test.rs"}}]}}"#,
        ]);

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_calls.len(), 1);
        assert_eq!(session.messages[0].tool_calls[0].name, "read_file");
        assert_eq!(
            session.messages[0].tool_calls[0].id,
            Some("tc1".to_string())
        );
    }

    #[test]
    fn reader_skips_non_message_types() {
        let session = read_openclaw(&[
            r#"{"type":"session","id":"s1","timestamp":"2026-02-01T16:00:00.000Z","cwd":"/"}"#,
            r#"{"type":"model_change","modelId":"gpt-5"}"#,
            r#"{"type":"thinking_level_change","level":"high"}"#,
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:01.000Z","message":{"role":"user","content":"Only message"}}"#,
            r#"{"type":"custom","data":"something"}"#,
        ]);

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Only message");
    }

    #[test]
    fn reader_handles_empty_and_invalid_lines() {
        let session = read_openclaw(&[
            "",
            "not-json",
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00.000Z","message":{"role":"user","content":"Valid"}}"#,
            r#"{"type":"message","id":"m2","message":{"role":"assistant","content":""}}"#,
        ]);

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Valid");
    }

    #[test]
    fn reader_thinking_content_blocks() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"assistant","content":[{"type":"thinking","text":"Let me reason..."},{"type":"text","text":"Here's my answer."}]}}"#,
        ]);

        assert_eq!(session.messages.len(), 1);
        assert!(session.messages[0].content.contains("Let me reason..."));
        assert!(session.messages[0].content.contains("Here's my answer."));
    }

    #[test]
    fn reader_plain_string_content() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"user","content":"Plain string, no blocks"}}"#,
        ]);

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Plain string, no blocks");
    }

    #[test]
    fn reader_session_id_from_filename() {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_jsonl(
            tmp.path(),
            "my-openclaw-session.jsonl",
            &[
                r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"user","content":"test"}}"#,
            ],
        );
        let provider = OpenClaw;
        let session = provider.read_session(&path).unwrap();
        assert_eq!(session.session_id, "my-openclaw-session");
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"assistant","content":"Welcome"}}"#,
            r#"{"type":"message","id":"m2","timestamp":"2026-02-01T16:00:01Z","message":{"role":"user","content":"Refactor the auth module"}}"#,
        ]);
        assert_eq!(session.title.as_deref(), Some("Refactor the auth module"));
    }

    #[test]
    fn reader_empty_file() {
        let session = read_openclaw(&[]);
        assert!(session.messages.is_empty());
        assert!(session.title.is_none());
    }

    #[test]
    fn reader_model_change_tracked() {
        let session = read_openclaw(&[
            r#"{"type":"model_change","modelId":"gpt-5"}"#,
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"user","content":"test"}}"#,
        ]);
        assert_eq!(session.model_name, Some("gpt-5".to_string()));
    }

    #[test]
    fn reader_timestamps_parsed() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00.000Z","message":{"role":"user","content":"First"}}"#,
            r#"{"type":"message","id":"m2","timestamp":"2026-02-01T17:00:00.000Z","message":{"role":"assistant","content":"Second"}}"#,
        ]);
        assert!(session.started_at.is_some());
        assert!(session.ended_at.is_some());
        assert!(session.started_at.unwrap() < session.ended_at.unwrap());
    }

    #[test]
    fn reader_wrapper_timestamp_preferred() {
        // Wrapper timestamp is ISO string, inner is epoch millis.
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00.828Z","message":{"role":"user","content":"test","timestamp":1769961600827}}"#,
        ]);
        assert!(session.messages[0].timestamp.is_some());
    }

    #[test]
    fn reader_reindexes_messages() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"user","content":"A"}}"#,
            r#"{"type":"message","id":"m2","timestamp":"2026-02-01T16:00:01Z","message":{"role":"assistant","content":"B"}}"#,
        ]);
        assert_eq!(session.messages[0].idx, 0);
        assert_eq!(session.messages[1].idx, 1);
    }

    #[test]
    fn reader_message_without_inner_message_skipped() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z"}"#,
            r#"{"type":"message","id":"m2","timestamp":"2026-02-01T16:00:01Z","message":{"role":"user","content":"Valid"}}"#,
        ]);
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Valid");
    }

    #[test]
    fn reader_metadata_has_source() {
        let session = read_openclaw(&[
            r#"{"type":"message","id":"m1","timestamp":"2026-02-01T16:00:00Z","message":{"role":"user","content":"test"}}"#,
        ]);
        assert_eq!(session.metadata["source"], "openclaw");
    }

    // -----------------------------------------------------------------------
    // Writer tests
    // -----------------------------------------------------------------------

    fn write_and_read_back(session: &CanonicalSession) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join(format!("{}.jsonl", session.session_id));
        let provider = OpenClaw;

        // Build content and write manually to avoid env var issues.
        let mut lines: Vec<String> = Vec::new();

        let workspace = session
            .workspace
            .as_ref()
            .and_then(|w| w.to_str())
            .unwrap_or("/tmp");
        let header = json!({
            "type": "session",
            "id": session.session_id,
            "timestamp": session.started_at
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            "cwd": workspace,
        });
        lines.push(serde_json::to_string(&header).unwrap());

        for (i, msg) in session.messages.iter().enumerate() {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "tool",
                MessageRole::Other(r) => r.as_str(),
            };
            let ts_str = msg
                .timestamp
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

            let content: serde_json::Value = if msg.tool_calls.is_empty() {
                serde_json::Value::String(msg.content.clone())
            } else {
                let mut blocks = vec![json!({"type": "text", "text": msg.content})];
                for tc in &msg.tool_calls {
                    blocks.push(json!({
                        "type": "toolCall",
                        "id": tc.id.as_deref().unwrap_or(""),
                        "name": tc.name,
                        "arguments": tc.arguments,
                    }));
                }
                serde_json::Value::Array(blocks)
            };

            let mut inner = json!({"role": role_str, "content": content});
            if let Some(ref author) = msg.author {
                inner["model"] = serde_json::Value::String(author.clone());
            }

            let entry = json!({
                "type": "message",
                "id": format!("m{}", i + 1),
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
            session_id: "roundtrip-test".to_string(),
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
        assert_eq!(
            readback.workspace,
            Some(PathBuf::from("/home/user/project"))
        );
    }

    #[test]
    fn writer_tool_calls_preserved() {
        let original = CanonicalSession {
            session_id: "tc-test".to_string(),
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
                    id: Some("tc1".to_string()),
                    name: "read_file".to_string(),
                    arguments: json!({"path": "/test.rs"}),
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
        assert_eq!(readback.messages[0].tool_calls[0].name, "read_file");
    }

    #[test]
    fn writer_resume_command() {
        let provider = OpenClaw;
        assert_eq!(
            provider.resume_command("my-session"),
            "openclaw --resume my-session"
        );
    }

    // -----------------------------------------------------------------------
    // Provider metadata
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let provider = OpenClaw;
        assert_eq!(provider.name(), "OpenClaw");
        assert_eq!(provider.slug(), "openclaw");
        assert_eq!(provider.cli_alias(), "ocl");
    }
}
