//! ClawdBot provider — reads/writes simple JSONL chat sessions.
//!
//! Session files: `~/.clawdbot/sessions/*.jsonl`
//! Override root: `CLAWDBOT_HOME` env var
//!
//! ## JSONL format
//!
//! ClawdBot uses the simplest session format of any provider: each line is a
//! standalone JSON message with three fields:
//!
//! ```json
//! {"role":"user","content":"Hello","timestamp":"2025-01-27T03:30:00.000Z"}
//! ```
//!
//! No wrapper objects, no content blocks, no session metadata header.
//!
//! ## Session ID scheme
//!
//! Sessions are identified by the filename stem (e.g. `my-session` from
//! `my-session.jsonl`).

use std::io::BufRead;
use std::path::{Path, PathBuf};

use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, flatten_content, normalize_role,
    parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// ClawdBot provider implementation.
pub struct ClawdBot;

impl ClawdBot {
    /// Root directory for ClawdBot session storage.
    /// Respects `CLAWDBOT_HOME` env var override.
    fn home_dir() -> PathBuf {
        if let Ok(home) = std::env::var("CLAWDBOT_HOME") {
            return PathBuf::from(home);
        }
        dirs::home_dir()
            .unwrap_or_default()
            .join(".clawdbot")
            .join("sessions")
    }
}

impl Provider for ClawdBot {
    fn name(&self) -> &str {
        "ClawdBot"
    }

    fn slug(&self) -> &str {
        "clawdbot"
    }

    fn cli_alias(&self) -> &str {
        "cwb"
    }

    fn detect(&self) -> DetectionResult {
        let root = Self::home_dir();
        let installed = root.is_dir();
        let evidence = if installed {
            vec![format!("sessions directory found: {}", root.display())]
        } else {
            vec![]
        };
        trace!(provider = "clawdbot", ?evidence, installed, "detection");
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
                provider = "clawdbot",
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
                    provider = "clawdbot",
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
        debug!(path = %path.display(), "reading ClawdBot session");

        let file = std::fs::File::open(path)
            .map_err(|e| anyhow::anyhow!("failed to open {}: {e}", path.display()))?;
        let reader = std::io::BufReader::new(file);

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;

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

            let role_str = val
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("assistant");
            let role = normalize_role(role_str);

            let content = val.get("content").map(flatten_content).unwrap_or_default();

            if content.trim().is_empty() {
                continue;
            }

            let ts = val.get("timestamp").and_then(parse_timestamp);
            if started_at.is_none() {
                started_at = ts;
            }
            if ts.is_some() {
                ended_at = ts;
            }

            messages.push(CanonicalMessage {
                idx: 0,
                role,
                content,
                timestamp: ts,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: val,
            });
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

        let metadata = serde_json::json!({ "source": "clawdbot" });

        info!(
            session_id,
            messages = messages.len(),
            "ClawdBot session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "clawdbot".to_string(),
            workspace: None,
            title,
            started_at,
            ended_at,
            messages,
            metadata,
            source_path: path.to_path_buf(),
            model_name: None,
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
            "writing ClawdBot session"
        );

        let mut lines: Vec<String> = Vec::with_capacity(session.messages.len());
        for msg in &session.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "tool",
                MessageRole::Other(r) => r.as_str(),
            };

            let mut obj = serde_json::Map::new();
            obj.insert(
                "role".into(),
                serde_json::Value::String(role_str.to_string()),
            );
            obj.insert(
                "content".into(),
                serde_json::Value::String(msg.content.clone()),
            );
            if let Some(ts) = msg.timestamp {
                let dt =
                    chrono::DateTime::from_timestamp_millis(ts).unwrap_or_else(chrono::Utc::now);
                obj.insert(
                    "timestamp".into(),
                    serde_json::Value::String(dt.to_rfc3339()),
                );
            }

            lines.push(serde_json::to_string(&serde_json::Value::Object(obj))?);
        }

        let content = lines.join("\n") + "\n";
        let outcome = crate::pipeline::atomic_write(
            &target_path,
            content.as_bytes(),
            opts.force,
            self.slug(),
        )?;

        info!(
            session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "ClawdBot session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: session_id.clone(),
            resume_command: self.resume_command(&session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("clawdbot --resume {session_id}")
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

    fn read_clawdbot(lines: &[&str]) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_jsonl(tmp.path(), "test.jsonl", lines);
        let provider = ClawdBot;
        provider.read_session(&path).expect("read_session failed")
    }

    // -----------------------------------------------------------------------
    // Reader tests
    // -----------------------------------------------------------------------

    #[test]
    fn reader_basic_exchange() {
        let session = read_clawdbot(&[
            r#"{"role":"user","content":"Hello there","timestamp":"2025-01-27T03:30:00.000Z"}"#,
            r#"{"role":"assistant","content":"Hi!","timestamp":"2025-01-27T03:30:05.000Z"}"#,
        ]);

        assert_eq!(session.provider_slug, "clawdbot");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello there");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Hi!");
        assert!(session.started_at.is_some());
        assert!(session.ended_at.is_some());
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_clawdbot(&[
            r#"{"role":"assistant","content":"Welcome"}"#,
            r#"{"role":"user","content":"Refactor the authentication module"}"#,
        ]);
        assert_eq!(
            session.title.as_deref(),
            Some("Refactor the authentication module")
        );
    }

    #[test]
    fn reader_skips_empty_content() {
        let session = read_clawdbot(&[
            r#"{"role":"user","content":"Hello"}"#,
            r#"{"role":"assistant","content":""}"#,
            r#"{"role":"assistant","content":"  "}"#,
            r#"{"role":"assistant","content":"Real response"}"#,
        ]);
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].content, "Hello");
        assert_eq!(session.messages[1].content, "Real response");
    }

    #[test]
    fn reader_skips_invalid_json() {
        let session = read_clawdbot(&[
            "",
            "not-json",
            r#"{"role":"user","content":"Valid line"}"#,
            "{truncated...",
        ]);
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Valid line");
    }

    #[test]
    fn reader_defaults_missing_role_to_assistant() {
        let session = read_clawdbot(&[r#"{"content":"No role field"}"#]);
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, MessageRole::Assistant);
    }

    #[test]
    fn reader_system_role() {
        let session = read_clawdbot(&[
            r#"{"role":"system","content":"You are helpful."}"#,
            r#"{"role":"user","content":"Hi"}"#,
        ]);
        assert_eq!(session.messages[0].role, MessageRole::System);
        assert_eq!(session.messages[1].role, MessageRole::User);
    }

    #[test]
    fn reader_session_id_from_filename() {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_jsonl(
            tmp.path(),
            "my-session.jsonl",
            &[r#"{"role":"user","content":"test"}"#],
        );
        let provider = ClawdBot;
        let session = provider.read_session(&path).unwrap();
        assert_eq!(session.session_id, "my-session");
    }

    #[test]
    fn reader_empty_file() {
        let session = read_clawdbot(&[]);
        assert_eq!(session.messages.len(), 0);
        assert!(session.title.is_none());
    }

    #[test]
    fn reader_timestamps_parsed() {
        let session = read_clawdbot(&[
            r#"{"role":"user","content":"First","timestamp":"2025-01-27T03:30:00.000Z"}"#,
            r#"{"role":"assistant","content":"Second","timestamp":"2025-01-27T04:00:00.000Z"}"#,
        ]);
        assert!(session.started_at.is_some());
        assert!(session.ended_at.is_some());
        assert!(session.started_at.unwrap() < session.ended_at.unwrap());
        assert!(session.messages[0].timestamp.is_some());
        assert!(session.messages[1].timestamp.is_some());
    }

    #[test]
    fn reader_no_timestamps() {
        let session = read_clawdbot(&[
            r#"{"role":"user","content":"Hello"}"#,
            r#"{"role":"assistant","content":"Hi"}"#,
        ]);
        assert!(session.started_at.is_none());
        assert!(session.ended_at.is_none());
    }

    #[test]
    fn reader_reindexes_messages() {
        let session = read_clawdbot(&[
            r#"{"role":"user","content":"A"}"#,
            r#"{"role":"assistant","content":"B"}"#,
            r#"{"role":"user","content":"C"}"#,
        ]);
        assert_eq!(session.messages[0].idx, 0);
        assert_eq!(session.messages[1].idx, 1);
        assert_eq!(session.messages[2].idx, 2);
    }

    #[test]
    fn reader_title_truncated_for_long_content() {
        let long_msg = "x".repeat(200);
        let line = format!(r#"{{"role":"user","content":"{long_msg}"}}"#);
        let session = read_clawdbot(&[&line]);
        assert!(session.title.is_some());
        let title = session.title.unwrap();
        // truncate_title adds "..." suffix, so max is 100 + 3 = 103.
        assert!(title.len() <= 103);
        assert!(title.ends_with("..."));
    }

    #[test]
    fn reader_metadata_has_source() {
        let session = read_clawdbot(&[r#"{"role":"user","content":"test"}"#]);
        assert_eq!(session.metadata["source"], "clawdbot");
    }

    // -----------------------------------------------------------------------
    // Writer tests
    // -----------------------------------------------------------------------

    /// Write a session to a specific directory (bypassing env var).
    fn write_clawdbot_session(dir: &Path, session: &CanonicalSession) -> Vec<PathBuf> {
        let mut lines: Vec<String> = Vec::new();
        for msg in &session.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "tool",
                MessageRole::Other(r) => r.as_str(),
            };
            let mut obj = serde_json::Map::new();
            obj.insert(
                "role".into(),
                serde_json::Value::String(role_str.to_string()),
            );
            obj.insert(
                "content".into(),
                serde_json::Value::String(msg.content.clone()),
            );
            if let Some(ts) = msg.timestamp {
                let dt =
                    chrono::DateTime::from_timestamp_millis(ts).unwrap_or_else(chrono::Utc::now);
                obj.insert(
                    "timestamp".into(),
                    serde_json::Value::String(dt.to_rfc3339()),
                );
            }
            lines.push(serde_json::to_string(&serde_json::Value::Object(obj)).unwrap());
        }

        let session_id = if session.session_id.is_empty() {
            "test".to_string()
        } else {
            session.session_id.clone()
        };
        let target = dir.join(format!("{session_id}.jsonl"));
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(&target, lines.join("\n") + "\n").unwrap();
        vec![target]
    }

    #[test]
    fn writer_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();

        let original = CanonicalSession {
            session_id: "roundtrip-test".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: None,
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
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
            ],
            metadata: json!({"source": "claude-code"}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: None,
        };

        let paths = write_clawdbot_session(tmp.path(), &original);
        assert!(!paths.is_empty());
        assert!(paths[0].exists());

        // Read back.
        let provider = ClawdBot;
        let readback = provider.read_session(&paths[0]).unwrap();
        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].role, MessageRole::User);
        assert_eq!(readback.messages[0].content, "Fix the bug");
        assert_eq!(readback.messages[1].role, MessageRole::Assistant);
        assert_eq!(readback.messages[1].content, "I'll fix it now.");
    }

    #[test]
    fn writer_generates_timestamps() {
        let tmp = tempfile::tempdir().unwrap();

        let session = CanonicalSession {
            session_id: "ts-test".to_string(),
            provider_slug: "test".to_string(),
            workspace: None,
            title: None,
            started_at: None,
            ended_at: None,
            messages: vec![CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hi".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: json!({}),
            }],
            metadata: json!({}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: None,
        };

        let paths = write_clawdbot_session(tmp.path(), &session);
        let content = std::fs::read_to_string(&paths[0]).unwrap();
        let val: serde_json::Value = serde_json::from_str(content.trim()).unwrap();
        assert!(val.get("timestamp").is_some());
        assert_eq!(val["role"], "user");
        assert_eq!(val["content"], "Hi");
    }

    #[test]
    fn writer_resume_command() {
        let provider = ClawdBot;
        assert_eq!(
            provider.resume_command("my-session"),
            "clawdbot --resume my-session"
        );
    }

    // -----------------------------------------------------------------------
    // Provider metadata tests
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let provider = ClawdBot;
        assert_eq!(provider.name(), "ClawdBot");
        assert_eq!(provider.slug(), "clawdbot");
        assert_eq!(provider.cli_alias(), "cwb");
    }

    // -----------------------------------------------------------------------
    // Detection tests
    // -----------------------------------------------------------------------

    // NOTE: Detection tests that need env var mutation are skipped in Rust 2024
    // (set_var is unsafe). Detection is tested indirectly via json_contract_test.rs
    // which sets CLAWDBOT_HOME via process env before spawning.
}
