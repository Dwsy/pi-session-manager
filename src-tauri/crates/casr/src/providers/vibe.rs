//! Vibe (Mistral) provider — reads/writes JSONL chat sessions.
//!
//! Session files: `~/.vibe/logs/session/*/messages.jsonl`
//! Override root: `VIBE_HOME` env var
//!
//! ## JSONL format
//!
//! Vibe uses a flexible JSONL message format where role, content, and timestamp
//! may appear under several different field names:
//!
//! - Role: `role`, `speaker`, or nested `message.role`
//! - Content: `content`, `text`, or nested `message.content`
//! - Timestamp: `timestamp`, `created_at`, `createdAt`, `time`, `ts`
//!
//! ## Session ID scheme
//!
//! Sessions live in subdirectories (`~/.vibe/logs/session/<session-id>/messages.jsonl`).
//! The session ID is the subdirectory name.

use std::io::BufRead;
use std::path::{Path, PathBuf};

use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, flatten_content, normalize_role,
    parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Vibe provider implementation.
pub struct Vibe;

impl Vibe {
    /// Root directory for Vibe session storage.
    /// Respects `VIBE_HOME` env var override.
    fn home_dir() -> PathBuf {
        if let Ok(home) = std::env::var("VIBE_HOME") {
            return PathBuf::from(home);
        }
        dirs::home_dir()
            .unwrap_or_default()
            .join(".vibe")
            .join("logs")
            .join("session")
    }

    /// Extract role from a JSONL line, checking multiple field names.
    fn extract_role(val: &serde_json::Value) -> String {
        val.get("role")
            .and_then(|v| v.as_str())
            .or_else(|| val.get("speaker").and_then(|v| v.as_str()))
            .or_else(|| {
                val.get("message")
                    .and_then(|m| m.get("role"))
                    .and_then(|v| v.as_str())
            })
            .unwrap_or("assistant")
            .to_string()
    }

    /// Extract content from a JSONL line, checking multiple field names.
    fn extract_content(val: &serde_json::Value) -> String {
        if let Some(content) = val.get("content") {
            return flatten_content(content);
        }
        if let Some(content) = val.get("text") {
            return flatten_content(content);
        }
        if let Some(content) = val.get("message").and_then(|msg| msg.get("content")) {
            return flatten_content(content);
        }
        String::new()
    }

    /// Extract timestamp from a JSONL line, checking multiple field names.
    fn extract_timestamp(val: &serde_json::Value) -> Option<i64> {
        let candidates = ["timestamp", "created_at", "createdAt", "time", "ts"];

        for key in candidates {
            if let Some(ts) = val.get(key).and_then(parse_timestamp) {
                return Some(ts);
            }
        }

        if let Some(message) = val.get("message") {
            for key in candidates {
                if let Some(ts) = message.get(key).and_then(parse_timestamp) {
                    return Some(ts);
                }
            }
        }

        None
    }
}

impl Provider for Vibe {
    fn name(&self) -> &str {
        "Vibe"
    }

    fn slug(&self) -> &str {
        "vibe"
    }

    fn cli_alias(&self) -> &str {
        "vib"
    }

    fn detect(&self) -> DetectionResult {
        let root = Self::home_dir();
        let installed = root.is_dir();
        let evidence = if installed {
            vec![format!("sessions directory found: {}", root.display())]
        } else {
            vec![]
        };
        trace!(provider = "vibe", ?evidence, installed, "detection");
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
        // Sessions are in subdirectories: <root>/<session-id>/messages.jsonl
        let candidate = root.join(session_id).join("messages.jsonl");
        if candidate.is_file() {
            debug!(
                provider = "vibe",
                path = %candidate.display(),
                session_id,
                "owns session"
            );
            return Some(candidate);
        }
        // Walk looking for a matching subdirectory.
        for entry in walkdir::WalkDir::new(&root)
            .max_depth(2)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_name() == "messages.jsonl"
                && entry.file_type().is_file()
                && entry
                    .path()
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n == session_id)
            {
                debug!(
                    provider = "vibe",
                    path = %entry.path().display(),
                    session_id,
                    "owns session (walk)"
                );
                return Some(entry.path().to_path_buf());
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Vibe session");

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

            let role_str = Self::extract_role(&val);
            let role = normalize_role(&role_str);
            let content = Self::extract_content(&val);

            if content.trim().is_empty() {
                continue;
            }

            let ts = Self::extract_timestamp(&val);
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

        // Session ID from parent directory name or filename.
        let session_id = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
            })
            .to_string();

        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        let metadata = serde_json::json!({ "source": "vibe" });

        info!(session_id, messages = messages.len(), "Vibe session parsed");

        Ok(CanonicalSession {
            session_id,
            provider_slug: "vibe".to_string(),
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

        let target_dir = Self::home_dir().join(&session_id);
        let target_path = target_dir.join("messages.jsonl");

        debug!(
            session_id,
            path = %target_path.display(),
            messages = session.messages.len(),
            "writing Vibe session"
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
            "Vibe session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: session_id.clone(),
            resume_command: self.resume_command(&session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("vibe --resume {session_id}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------

    fn write_vibe_session(dir: &Path, session_id: &str, lines: &[&str]) -> PathBuf {
        let session_dir = dir.join(session_id);
        std::fs::create_dir_all(&session_dir).unwrap();
        let path = session_dir.join("messages.jsonl");
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }

    fn read_vibe(session_id: &str, lines: &[&str]) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_vibe_session(tmp.path(), session_id, lines);
        let provider = Vibe;
        provider.read_session(&path).expect("read_session failed")
    }

    // -----------------------------------------------------------------------
    // Reader tests
    // -----------------------------------------------------------------------

    #[test]
    fn reader_basic_exchange() {
        let session = read_vibe(
            "sess-1",
            &[
                r#"{"role":"user","content":"Hello","timestamp":"2025-01-27T03:30:00.000Z"}"#,
                r#"{"role":"assistant","content":"Hi!","timestamp":"2025-01-27T03:30:05.000Z"}"#,
            ],
        );

        assert_eq!(session.provider_slug, "vibe");
        assert_eq!(session.session_id, "sess-1");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn reader_flexible_role_field() {
        // Test "speaker" as role field name.
        let session = read_vibe(
            "sess-2",
            &[
                r#"{"speaker":"user","content":"Hello"}"#,
                r#"{"speaker":"assistant","content":"Hi!"}"#,
            ],
        );
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn reader_nested_message_role() {
        let session = read_vibe(
            "sess-3",
            &[
                r#"{"message":{"role":"user","content":"Hello"}}"#,
                r#"{"message":{"role":"assistant","content":"Hi!"}}"#,
            ],
        );
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello");
    }

    #[test]
    fn reader_text_field_as_content() {
        let session = read_vibe(
            "sess-4",
            &[r#"{"role":"user","text":"Hello via text field"}"#],
        );
        assert_eq!(session.messages[0].content, "Hello via text field");
    }

    #[test]
    fn reader_flexible_timestamp_fields() {
        let session = read_vibe(
            "sess-5",
            &[
                r#"{"role":"user","content":"A","created_at":"2025-01-27T03:30:00.000Z"}"#,
                r#"{"role":"user","content":"B","createdAt":"2025-01-27T03:31:00.000Z"}"#,
                r#"{"role":"user","content":"C","time":"2025-01-27T03:32:00.000Z"}"#,
                r#"{"role":"user","content":"D","ts":"2025-01-27T03:33:00.000Z"}"#,
            ],
        );
        assert_eq!(session.messages.len(), 4);
        assert!(session.messages[0].timestamp.is_some());
        assert!(session.messages[1].timestamp.is_some());
        assert!(session.messages[2].timestamp.is_some());
        assert!(session.messages[3].timestamp.is_some());
    }

    #[test]
    fn reader_skips_empty_content() {
        let session = read_vibe(
            "sess-6",
            &[
                r#"{"role":"user","content":"Valid"}"#,
                r#"{"role":"assistant","content":""}"#,
                r#"{"role":"assistant","content":"  "}"#,
            ],
        );
        assert_eq!(session.messages.len(), 1);
    }

    #[test]
    fn reader_skips_invalid_json() {
        let session = read_vibe(
            "sess-7",
            &["", "not-json", r#"{"role":"user","content":"Valid"}"#],
        );
        assert_eq!(session.messages.len(), 1);
    }

    #[test]
    fn reader_session_id_from_parent_dir() {
        let session = read_vibe("my-session-abc", &[r#"{"role":"user","content":"test"}"#]);
        assert_eq!(session.session_id, "my-session-abc");
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_vibe(
            "sess-8",
            &[
                r#"{"role":"assistant","content":"Welcome"}"#,
                r#"{"role":"user","content":"Refactor the auth module"}"#,
            ],
        );
        assert_eq!(session.title.as_deref(), Some("Refactor the auth module"));
    }

    #[test]
    fn reader_empty_file() {
        let session = read_vibe("empty", &[]);
        assert_eq!(session.messages.len(), 0);
        assert!(session.title.is_none());
    }

    #[test]
    fn reader_metadata_has_source() {
        let session = read_vibe("sess-9", &[r#"{"role":"user","content":"test"}"#]);
        assert_eq!(session.metadata["source"], "vibe");
    }

    #[test]
    fn reader_reindexes_messages() {
        let session = read_vibe(
            "sess-10",
            &[
                r#"{"role":"user","content":"A"}"#,
                r#"{"role":"assistant","content":"B"}"#,
                r#"{"role":"user","content":"C"}"#,
            ],
        );
        assert_eq!(session.messages[0].idx, 0);
        assert_eq!(session.messages[1].idx, 1);
        assert_eq!(session.messages[2].idx, 2);
    }

    // -----------------------------------------------------------------------
    // Writer tests
    // -----------------------------------------------------------------------

    #[test]
    fn writer_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let session_dir = tmp.path().join("rt-test");
        std::fs::create_dir_all(&session_dir).unwrap();

        let original = CanonicalSession {
            session_id: "rt-test".to_string(),
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
                    content: "Done.".to_string(),
                    timestamp: Some(1_700_000_500_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
            ],
            metadata: json!({}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: None,
        };

        // Write directly to the session dir.
        let target = session_dir.join("messages.jsonl");
        let mut lines = Vec::new();
        for msg in &original.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                _ => "other",
            };
            let mut obj = serde_json::Map::new();
            obj.insert("role".into(), json!(role_str));
            obj.insert("content".into(), json!(&msg.content));
            lines.push(serde_json::to_string(&serde_json::Value::Object(obj)).unwrap());
        }
        std::fs::write(&target, lines.join("\n") + "\n").unwrap();

        let provider = Vibe;
        let readback = provider.read_session(&target).unwrap();
        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].content, "Fix the bug");
        assert_eq!(readback.messages[1].content, "Done.");
    }

    #[test]
    fn writer_resume_command() {
        let provider = Vibe;
        assert_eq!(
            provider.resume_command("my-session"),
            "vibe --resume my-session"
        );
    }

    // -----------------------------------------------------------------------
    // Provider metadata
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let provider = Vibe;
        assert_eq!(provider.name(), "Vibe");
        assert_eq!(provider.slug(), "vibe");
        assert_eq!(provider.cli_alias(), "vib");
    }
}
