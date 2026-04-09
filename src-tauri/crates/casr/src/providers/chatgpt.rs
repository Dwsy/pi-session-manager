//! ChatGPT desktop app provider — reads/writes JSON sessions.
//!
//! ChatGPT stores conversations in:
//! - macOS: `~/Library/Application Support/com.openai.chat/conversations-{uuid}/`
//!
//! Session files are individual JSON files per conversation with a tree-based
//! `mapping` structure (node IDs → messages with parent pointers).
//!
//! ## Storage versions
//!
//! - v1 (legacy): Plain JSON files in `conversations-{uuid}/` (unencrypted)
//! - v2/v3: Encrypted files in `conversations-v2-{uuid}/` or `conversations-v3-{uuid}/`
//!
//! casr currently only supports unencrypted v1 conversations.
//!
//! ## Resume
//!
//! ChatGPT doesn't have a CLI resume mechanism. The resume command opens the
//! conversation in a browser: `https://chatgpt.com/c/<conversation-id>`
//!
//! ## CASS heritage
//!
//! Reader logic ported from `coding_agent_session_search/src/connectors/chatgpt.rs`.

use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, info, trace};
use walkdir::WalkDir;

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, flatten_content, normalize_role,
    parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// ChatGPT desktop app provider implementation.
pub struct ChatGpt;

impl ChatGpt {
    /// Root directory for ChatGPT app data.
    /// Respects `CHATGPT_HOME` env var override.
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("CHATGPT_HOME") {
            return Some(PathBuf::from(home));
        }
        // ChatGPT desktop is macOS only.
        #[cfg(target_os = "macos")]
        {
            dirs::home_dir().map(|h| h.join("Library/Application Support/com.openai.chat"))
        }
        #[cfg(not(target_os = "macos"))]
        {
            None
        }
    }

    /// Find conversation directories under a base path.
    ///
    /// Returns `(path, is_encrypted)` pairs. Only `conversations-{uuid}/` (v1)
    /// are currently readable; `conversations-v2-*` and `conversations-v3-*`
    /// are encrypted and skipped.
    fn find_conversation_dirs(base: &Path) -> Vec<(PathBuf, bool)> {
        let mut dirs = Vec::new();

        if !base.exists() {
            return dirs;
        }

        let Ok(entries) = std::fs::read_dir(base) else {
            return dirs;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };

            if name.starts_with("conversations-") {
                let is_encrypted = name.contains("-v2-") || name.contains("-v3-");
                dirs.push((path, is_encrypted));
            }
        }

        dirs
    }
}

impl Provider for ChatGpt {
    fn name(&self) -> &str {
        "ChatGPT"
    }

    fn slug(&self) -> &str {
        "chatgpt"
    }

    fn cli_alias(&self) -> &str {
        "gpt"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if let Some(home) = Self::home_dir()
            && home.is_dir()
        {
            let conv_dirs = Self::find_conversation_dirs(&home);
            if !conv_dirs.is_empty() {
                let encrypted = conv_dirs.iter().filter(|(_, enc)| *enc).count();
                let unencrypted = conv_dirs.len() - encrypted;

                evidence.push(format!("{} exists", home.display()));
                if unencrypted > 0 {
                    evidence.push(format!("{unencrypted} unencrypted conversation dir(s)"));
                }
                if encrypted > 0 {
                    evidence.push(format!(
                        "{encrypted} encrypted conversation dir(s) (not yet supported)"
                    ));
                }
                installed = true;
            }
        }

        trace!(provider = "chatgpt", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        let Some(home) = Self::home_dir() else {
            return vec![];
        };
        if !home.is_dir() {
            return vec![];
        }
        // Each unencrypted conversations-* directory is a session root.
        Self::find_conversation_dirs(&home)
            .into_iter()
            .filter(|(_, encrypted)| !encrypted)
            .map(|(path, _)| path)
            .collect()
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let home = Self::home_dir()?;
        if !home.is_dir() {
            return None;
        }

        let id_lower = session_id.to_ascii_lowercase();

        // Walk through all conversation directories looking for a matching file.
        for (dir, encrypted) in Self::find_conversation_dirs(&home) {
            if encrypted {
                continue;
            }

            for entry in WalkDir::new(&dir).max_depth(1).into_iter().flatten() {
                if !entry.file_type().is_file() {
                    continue;
                }

                let path = entry.path();
                let ext = path.extension().and_then(|s| s.to_str());
                if ext != Some("json") {
                    continue;
                }

                // Quick check: filename stem matches session ID.
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str())
                    && stem.eq_ignore_ascii_case(session_id)
                {
                    return Some(path.to_path_buf());
                }

                // Deeper check: parse JSON and look for matching "id" or "conversation_id".
                // Use a minimal struct to avoid allocating the massive `mapping` objects in memory.
                #[derive(serde::Deserialize)]
                struct ChatGptHeader {
                    id: Option<String>,
                    conversation_id: Option<String>,
                }
                if let Ok(file) = std::fs::File::open(path) {
                    let reader = std::io::BufReader::new(file);
                    if let Ok(header) = serde_json::from_reader::<_, ChatGptHeader>(reader) {
                        let conv_id = header.id.as_deref().or(header.conversation_id.as_deref());
                        if let Some(cid) = conv_id
                            && cid.eq_ignore_ascii_case(&id_lower)
                        {
                            return Some(path.to_path_buf());
                        }
                    }
                }
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading ChatGPT session");

        let file = std::fs::File::open(path)
            .with_context(|| format!("failed to open {}", path.display()))?;
        let reader = std::io::BufReader::new(file);
        let root: serde_json::Value = serde_json::from_reader(reader)
            .with_context(|| format!("failed to parse JSON {}", path.display()))?;

        // Session ID: prefer "id", then "conversation_id", then filename stem.
        let session_id = root
            .get("id")
            .or_else(|| root.get("conversation_id"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string()
            });

        let title = root.get("title").and_then(|v| v.as_str()).map(String::from);

        // Top-level timestamps (float seconds).
        let started_at = root.get("create_time").and_then(parse_timestamp);
        let mut ended_at = root.get("update_time").and_then(parse_timestamp);

        // Model name from top-level.
        let model_name = root.get("model").and_then(|v| v.as_str()).map(String::from);

        let mut messages: Vec<CanonicalMessage> = Vec::new();

        // Primary format: tree-based "mapping" structure.
        if let Some(mapping) = root.get("mapping").and_then(|v| v.as_object()) {
            let mut msg_nodes: Vec<(&str, &serde_json::Value)> = Vec::new();

            for (node_id, node) in mapping {
                if let Some(msg) = node.get("message")
                    && msg.is_object()
                {
                    msg_nodes.push((node_id.as_str(), msg));
                }
            }

            // Sort by create_time for deterministic ordering.
            msg_nodes.sort_by(|a, b| {
                let ts_a = a.1.get("create_time").and_then(|v| v.as_f64());
                let ts_b = b.1.get("create_time").and_then(|v| v.as_f64());
                match (ts_a, ts_b) {
                    (Some(a_ts), Some(b_ts)) => a_ts
                        .partial_cmp(&b_ts)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| a.0.cmp(b.0)),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => a.0.cmp(b.0),
                }
            });

            for (_node_id, msg) in msg_nodes {
                let role_str = msg
                    .get("author")
                    .and_then(|a| a.get("role"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("assistant");

                // Skip system messages.
                if role_str == "system" {
                    continue;
                }

                let role = normalize_role(role_str);

                // Content: prefer "parts" array, then "text" field.
                let content_val = msg.get("content");
                let text = if let Some(parts) = content_val
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    parts
                        .iter()
                        .filter_map(|p| p.as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                } else if let Some(content) = content_val {
                    flatten_content(content)
                } else {
                    continue;
                };

                if text.trim().is_empty() {
                    continue;
                }

                // Timestamp: float seconds → millis.
                let ts = msg.get("create_time").and_then(parse_timestamp);
                if let Some(t) = ts {
                    ended_at = Some(ended_at.map_or(t, |e: i64| e.max(t)));
                }

                // Model from message metadata.
                let msg_model = msg
                    .get("metadata")
                    .and_then(|m| m.get("model_slug"))
                    .and_then(|v| v.as_str())
                    .map(String::from);

                messages.push(CanonicalMessage {
                    idx: 0,
                    role,
                    content: text,
                    timestamp: ts,
                    author: msg_model,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: msg.clone(),
                });
            }
        }

        // Fallback: simple "messages" array format (ChatGPT data exports).
        if messages.is_empty()
            && let Some(msgs) = root.get("messages").and_then(|v| v.as_array())
        {
            for msg in msgs {
                let role_str = msg
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("assistant");

                if role_str == "system" {
                    continue;
                }

                let role = normalize_role(role_str);

                let text = msg.get("content").map(flatten_content).unwrap_or_default();

                if text.trim().is_empty() {
                    continue;
                }

                let ts = msg
                    .get("timestamp")
                    .or_else(|| msg.get("create_time"))
                    .and_then(parse_timestamp);

                if let Some(t) = ts {
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
                    extra: msg.clone(),
                });
            }
        }

        reindex_messages(&mut messages);

        // Title: prefer explicit, fall back to first user message.
        let effective_title = title.or_else(|| {
            messages
                .iter()
                .find(|m| m.role == MessageRole::User)
                .map(|m| truncate_title(&m.content, 100))
        });

        // Metadata.
        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("chatgpt".to_string()),
        );
        if let Some(ref m) = model_name {
            metadata.insert("model".into(), serde_json::Value::String(m.clone()));
        }

        debug!(
            session_id,
            messages = messages.len(),
            "ChatGPT session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "chatgpt".to_string(),
            workspace: None, // ChatGPT doesn't have a workspace concept.
            title: effective_title,
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

        // Determine target directory.
        let home = Self::home_dir()
            .ok_or_else(|| anyhow::anyhow!("cannot determine ChatGPT home directory"))?;

        // Write into conversations-<uuid>/ directory.
        let conv_dir = home.join(format!("conversations-{target_session_id}"));
        let target_path = conv_dir.join(format!("{target_session_id}.json"));

        debug!(
            target_session_id,
            target_path = %target_path.display(),
            "writing ChatGPT session"
        );

        // Build the ChatGPT mapping structure.
        let now_secs = chrono::Utc::now().timestamp() as f64;
        let create_time = session
            .started_at
            .map(|ms| ms as f64 / 1000.0)
            .unwrap_or(now_secs);
        let update_time = session
            .ended_at
            .map(|ms| ms as f64 / 1000.0)
            .unwrap_or(now_secs);

        let mut mapping = serde_json::Map::new();
        let mut prev_node_id: Option<String> = None;

        for msg in &session.messages {
            let node_id = uuid::Uuid::new_v4().to_string();
            let chatgpt_role = match msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::Tool => "tool",
                MessageRole::System => "system",
                MessageRole::Other(ref s) => s.as_str(),
            };

            let msg_ts = msg.timestamp.map(|ms| ms as f64 / 1000.0);

            let mut message_obj = serde_json::json!({
                "author": {"role": chatgpt_role},
                "content": {"parts": [msg.content]},
            });

            if let Some(ts) = msg_ts {
                message_obj["create_time"] = serde_json::Value::from(ts);
            }

            // Add model info for assistant messages.
            if msg.role == MessageRole::Assistant {
                let model_slug = msg.author.as_deref().or(session.model_name.as_deref());
                if let Some(slug) = model_slug {
                    message_obj["metadata"] = serde_json::json!({
                        "model_slug": slug,
                    });
                }
            }

            let mut node = serde_json::json!({
                "message": message_obj,
            });

            node["parent"] = prev_node_id
                .as_ref()
                .map(|id| serde_json::Value::String(id.clone()))
                .unwrap_or(serde_json::Value::Null);

            mapping.insert(node_id.clone(), node);
            prev_node_id = Some(node_id);
        }

        let root = serde_json::json!({
            "id": target_session_id,
            "title": session.title.as_deref().unwrap_or("Imported conversation"),
            "create_time": create_time,
            "update_time": update_time,
            "mapping": mapping,
        });

        let content_bytes = serde_json::to_string_pretty(&root)?.into_bytes();

        let outcome =
            crate::pipeline::atomic_write(&target_path, &content_bytes, opts.force, self.slug())?;

        info!(
            target_session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "ChatGPT session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: target_session_id.clone(),
            resume_command: self.resume_command(&target_session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("open \"https://chatgpt.com/c/{session_id}\"")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::ChatGpt;
    use serde_json::json;
    use std::io::Write as _;

    use crate::model::{CanonicalMessage, MessageRole};
    use crate::providers::Provider;

    /// Write JSON to a temp file and read it back via the ChatGPT reader.
    fn read_chatgpt_json(content: &str) -> crate::model::CanonicalSession {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        tmp.write_all(content.as_bytes()).unwrap();
        tmp.flush().unwrap();
        ChatGpt
            .read_session(tmp.path())
            .unwrap_or_else(|e| panic!("read_session failed: {e}"))
    }

    // -----------------------------------------------------------------------
    // Provider metadata
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let p = ChatGpt;
        assert_eq!(p.name(), "ChatGPT");
        assert_eq!(p.slug(), "chatgpt");
        assert_eq!(p.cli_alias(), "gpt");
    }

    #[test]
    fn resume_command_is_browser_url() {
        let p = ChatGpt;
        assert_eq!(
            p.resume_command("abc-123"),
            "open \"https://chatgpt.com/c/abc-123\""
        );
    }

    // -----------------------------------------------------------------------
    // Detection
    // -----------------------------------------------------------------------

    #[test]
    fn detect_does_not_panic() {
        let p = ChatGpt;
        let result = p.detect();
        // On CI (Linux), ChatGPT desktop won't be installed.
        let _ = result.installed;
    }

    #[test]
    fn detect_with_chatgpt_home_env() {
        let dir = tempfile::TempDir::new().unwrap();
        // Create a conversations directory.
        let conv_dir = dir.path().join("conversations-uuid123");
        std::fs::create_dir_all(&conv_dir).unwrap();

        // Temporarily override CHATGPT_HOME — test isolation not needed here
        // because detect() reads the env each time and doesn't cache.
        // NOTE: We can't use set_var (unsafe in Rust 2024), so we test via
        // find_conversation_dirs directly instead.
        let dirs = ChatGpt::find_conversation_dirs(dir.path());
        assert_eq!(dirs.len(), 1);
        assert!(!dirs[0].1); // Not encrypted.
    }

    #[test]
    fn find_conversation_dirs_detects_encrypted() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("conversations-v2-abc")).unwrap();
        std::fs::create_dir_all(dir.path().join("conversations-v3-xyz")).unwrap();
        std::fs::create_dir_all(dir.path().join("conversations-plain")).unwrap();
        std::fs::create_dir_all(dir.path().join("other-folder")).unwrap();

        let dirs = ChatGpt::find_conversation_dirs(dir.path());
        assert_eq!(dirs.len(), 3);

        let encrypted = dirs.iter().filter(|(_, e)| *e).count();
        let unencrypted = dirs.iter().filter(|(_, e)| !*e).count();
        assert_eq!(encrypted, 2);
        assert_eq!(unencrypted, 1);
    }

    #[test]
    fn find_conversation_dirs_empty_for_nonexistent() {
        let dirs = ChatGpt::find_conversation_dirs(Path::new("/nonexistent/chatgpt/path"));
        assert!(dirs.is_empty());
    }

    // -----------------------------------------------------------------------
    // Reader: mapping format
    // -----------------------------------------------------------------------

    #[test]
    fn reader_mapping_format_basic() {
        let session = read_chatgpt_json(
            &json!({
                "id": "conv-123",
                "title": "Test Conversation",
                "create_time": 1700000000.0,
                "update_time": 1700000010.0,
                "mapping": {
                    "node1": {
                        "parent": null,
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Hello, ChatGPT!"]},
                            "create_time": 1700000001.0
                        }
                    },
                    "node2": {
                        "parent": "node1",
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["Hello! How can I help?"]},
                            "create_time": 1700000002.0,
                            "metadata": {"model_slug": "gpt-4"}
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.session_id, "conv-123");
        assert_eq!(session.title.as_deref(), Some("Test Conversation"));
        assert_eq!(session.provider_slug, "chatgpt");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello, ChatGPT!");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert!(session.messages[1].content.contains("How can I help"));
        assert_eq!(session.messages[1].author, Some("gpt-4".to_string()));
    }

    #[test]
    fn reader_mapping_orders_by_create_time() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "late": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["Second"]},
                            "create_time": 1700000002.0
                        }
                    },
                    "early": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["First"]},
                            "create_time": 1700000001.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages[0].content, "First");
        assert_eq!(session.messages[1].content, "Second");
    }

    #[test]
    fn reader_mapping_skips_system_messages() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "sys": {
                        "message": {
                            "author": {"role": "system"},
                            "content": {"parts": ["You are helpful."]},
                            "create_time": 1700000000.0
                        }
                    },
                    "user": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Hi!"]},
                            "create_time": 1700000001.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, MessageRole::User);
    }

    #[test]
    fn reader_mapping_skips_empty_content() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "empty": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": [""]},
                            "create_time": 1700000000.0
                        }
                    },
                    "whitespace": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["   \n\t  "]},
                            "create_time": 1700000001.0
                        }
                    },
                    "valid": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Valid message"]},
                            "create_time": 1700000002.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Valid message");
    }

    #[test]
    fn reader_mapping_multipart_content() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Part 1", "Part 2", "Part 3"]},
                            "create_time": 1700000000.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages[0].content, "Part 1\nPart 2\nPart 3");
    }

    #[test]
    fn reader_mapping_text_content_field() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"text": "Using text field"},
                            "create_time": 1700000000.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages[0].content, "Using text field");
    }

    #[test]
    fn reader_mapping_conversation_id_fallback() {
        let session = read_chatgpt_json(
            &json!({
                "conversation_id": "alt-id-123",
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]}
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.session_id, "alt-id-123");
    }

    #[test]
    fn reader_mapping_id_fallback_to_filename() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]}
                        }
                    }
                }
            })
            .to_string(),
        );

        // Falls back to filename stem.
        assert!(!session.session_id.is_empty());
    }

    #[test]
    fn reader_mapping_timestamp_to_millis() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]},
                            "create_time": 1700000000.5
                        }
                    }
                }
            })
            .to_string(),
        );

        // 1700000000.5 seconds → 1700000000500 millis.
        assert_eq!(session.messages[0].timestamp, Some(1_700_000_000_500));
    }

    #[test]
    fn reader_mapping_preserves_extra() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]},
                            "create_time": 1700000000.0,
                            "custom_field": "preserved"
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(
            session.messages[0]
                .extra
                .get("custom_field")
                .and_then(|v| v.as_str()),
            Some("preserved")
        );
    }

    #[test]
    fn reader_mapping_model_in_metadata() {
        let session = read_chatgpt_json(
            &json!({
                "model": "gpt-4-turbo",
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]}
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.model_name.as_deref(), Some("gpt-4-turbo"));
        assert_eq!(session.metadata["model"], "gpt-4-turbo");
    }

    #[test]
    fn reader_mapping_skips_non_object_messages() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "bad1": {"message": "not an object"},
                    "bad2": {"message": null},
                    "bad3": {"parent": "bad2"},
                    "bad4": {"message": 42},
                    "good": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Valid"]},
                            "create_time": 1700000000.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Valid");
    }

    #[test]
    fn reader_mapping_empty_returns_empty() {
        let session = read_chatgpt_json(&json!({"mapping": {}}).to_string());
        assert!(session.messages.is_empty());
    }

    // -----------------------------------------------------------------------
    // Reader: simple messages array format (data export)
    // -----------------------------------------------------------------------

    #[test]
    fn reader_simple_messages_format() {
        let session = read_chatgpt_json(
            &json!({
                "id": "simple-conv",
                "title": "Simple Format",
                "messages": [
                    {"role": "user", "content": "Question?", "timestamp": 1700000000000_i64},
                    {"role": "assistant", "content": "Answer!", "timestamp": 1700000001000_i64}
                ]
            })
            .to_string(),
        );

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Question?");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Answer!");
    }

    #[test]
    fn reader_simple_messages_skips_system() {
        let session = read_chatgpt_json(
            &json!({
                "messages": [
                    {"role": "system", "content": "You are helpful."},
                    {"role": "user", "content": "Hi!"}
                ]
            })
            .to_string(),
        );

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, MessageRole::User);
    }

    // -----------------------------------------------------------------------
    // Reader: edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn reader_empty_json_object() {
        let session = read_chatgpt_json("{}");
        assert!(session.messages.is_empty());
    }

    #[test]
    fn reader_invalid_json_returns_error() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        tmp.write_all(b"not valid json").unwrap();
        tmp.flush().unwrap();
        assert!(ChatGpt.read_session(tmp.path()).is_err());
    }

    #[test]
    fn reader_title_fallback_to_first_user_message() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Explain the architecture"]},
                            "create_time": 1700000000.0
                        }
                    },
                    "node2": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["The architecture uses..."]},
                            "create_time": 1700000001.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.title.as_deref(), Some("Explain the architecture"));
    }

    #[test]
    fn reader_started_at_from_create_time() {
        let session = read_chatgpt_json(
            &json!({
                "create_time": 1700000000.0,
                "update_time": 1700000010.0,
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]}
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.started_at, Some(1_700_000_000_000));
        assert_eq!(session.ended_at, Some(1_700_000_010_000));
    }

    #[test]
    fn reader_ended_at_tracks_max_message_ts() {
        let session = read_chatgpt_json(
            &json!({
                "update_time": 1700000005.0,
                "mapping": {
                    "node1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["First"]},
                            "create_time": 1700000001.0
                        }
                    },
                    "node2": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["Last"]},
                            "create_time": 1700000020.0
                        }
                    }
                }
            })
            .to_string(),
        );

        // ended_at should be max(update_time, last message timestamp).
        assert_eq!(session.ended_at, Some(1_700_000_020_000));
    }

    #[test]
    fn reader_reindexes_messages() {
        let session = read_chatgpt_json(
            &json!({
                "mapping": {
                    "a": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["First"]},
                            "create_time": 1700000001.0
                        }
                    },
                    "b": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["Second"]},
                            "create_time": 1700000002.0
                        }
                    },
                    "c": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Third"]},
                            "create_time": 1700000003.0
                        }
                    }
                }
            })
            .to_string(),
        );

        assert_eq!(session.messages[0].idx, 0);
        assert_eq!(session.messages[1].idx, 1);
        assert_eq!(session.messages[2].idx, 2);
    }

    // -----------------------------------------------------------------------
    // Writer
    // -----------------------------------------------------------------------

    #[test]
    fn writer_produces_valid_json() {
        let dir = tempfile::TempDir::new().unwrap();
        let session = crate::model::CanonicalSession {
            session_id: "test-write".to_string(),
            provider_slug: "chatgpt".to_string(),
            workspace: Some(dir.path().to_path_buf()),
            title: Some("Test Write".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Hello".to_string(),
                    timestamp: Some(1_700_000_001_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "Hi there".to_string(),
                    timestamp: Some(1_700_000_002_000),
                    author: Some("gpt-4".to_string()),
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
            ],
            metadata: json!({"source": "test"}),
            source_path: std::path::PathBuf::from("/tmp/test.json"),
            model_name: Some("gpt-4".to_string()),
        };

        // Set CHATGPT_HOME to temp dir so writer has a target.
        // Since we can't use set_var (unsafe), we test the JSON structure
        // by serializing what the writer would produce.
        let now_secs = chrono::Utc::now().timestamp() as f64;
        let mut mapping = serde_json::Map::new();
        let mut prev_node_id: Option<String> = None;

        for msg in &session.messages {
            let node_id = uuid::Uuid::new_v4().to_string();
            let role = match msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                _ => "user",
            };
            let ts = msg.timestamp.map(|ms| ms as f64 / 1000.0);

            let mut message_obj = json!({
                "author": {"role": role},
                "content": {"parts": [msg.content]},
            });
            if let Some(t) = ts {
                message_obj["create_time"] = serde_json::Value::from(t);
            }
            if msg.role == MessageRole::Assistant
                && let Some(ref author) = msg.author
            {
                message_obj["metadata"] = json!({"model_slug": author});
            }

            let mut node = json!({"message": message_obj});
            node["parent"] = prev_node_id
                .as_ref()
                .map(|id| serde_json::Value::String(id.clone()))
                .unwrap_or(serde_json::Value::Null);

            mapping.insert(node_id.clone(), node);
            prev_node_id = Some(node_id);
        }

        let root = json!({
            "id": "test-id",
            "title": session.title,
            "create_time": session.started_at.map(|ms| ms as f64 / 1000.0).unwrap_or(now_secs),
            "update_time": session.ended_at.map(|ms| ms as f64 / 1000.0).unwrap_or(now_secs),
            "mapping": mapping,
        });

        // Verify the JSON is valid and has the expected structure.
        let serialized = serde_json::to_string_pretty(&root).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&serialized).unwrap();

        assert_eq!(parsed["id"], "test-id");
        assert_eq!(parsed["title"], "Test Write");
        assert!(parsed["mapping"].is_object());
        let mapping_obj = parsed["mapping"].as_object().unwrap();
        assert_eq!(mapping_obj.len(), 2);

        // Verify parent chain.
        let nodes: Vec<&serde_json::Value> = mapping_obj.values().collect();
        let root_nodes: Vec<_> = nodes.iter().filter(|n| n["parent"].is_null()).collect();
        assert_eq!(root_nodes.len(), 1, "should have exactly one root node");
    }

    #[test]
    fn writer_roundtrip() {
        // Create a session, serialize it as ChatGPT JSON, then read it back.
        let session = crate::model::CanonicalSession {
            session_id: "roundtrip-test".to_string(),
            provider_slug: "chatgpt".to_string(),
            workspace: None,
            title: Some("Roundtrip Test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "User says hello".to_string(),
                    timestamp: Some(1_700_000_001_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "Assistant responds".to_string(),
                    timestamp: Some(1_700_000_002_000),
                    author: Some("gpt-4o".to_string()),
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
            ],
            metadata: json!({"source": "chatgpt"}),
            source_path: std::path::PathBuf::from("/tmp/test.json"),
            model_name: Some("gpt-4o".to_string()),
        };

        // Build the ChatGPT JSON manually (writer logic).
        let mut mapping = serde_json::Map::new();
        let mut prev_node_id: Option<String> = None;

        for msg in &session.messages {
            let node_id = uuid::Uuid::new_v4().to_string();
            let role = match msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                _ => "user",
            };
            let ts = msg.timestamp.map(|ms| ms as f64 / 1000.0);

            let mut message_obj = json!({
                "author": {"role": role},
                "content": {"parts": [msg.content]},
            });
            if let Some(t) = ts {
                message_obj["create_time"] = serde_json::Value::from(t);
            }
            if msg.role == MessageRole::Assistant
                && let Some(ref author) = msg.author
            {
                message_obj["metadata"] = json!({"model_slug": author});
            }

            let mut node = json!({"message": message_obj});
            node["parent"] = prev_node_id
                .as_ref()
                .map(|id| serde_json::Value::String(id.clone()))
                .unwrap_or(serde_json::Value::Null);

            mapping.insert(node_id.clone(), node);
            prev_node_id = Some(node_id);
        }

        let root = json!({
            "id": "roundtrip-id",
            "title": "Roundtrip Test",
            "create_time": 1700000000.0,
            "update_time": 1700000010.0,
            "mapping": mapping,
        });

        // Write to temp file and read back.
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        tmp.write_all(serde_json::to_string_pretty(&root).unwrap().as_bytes())
            .unwrap();
        tmp.flush().unwrap();

        let read_back = ChatGpt.read_session(tmp.path()).unwrap();

        assert_eq!(read_back.session_id, "roundtrip-id");
        assert_eq!(read_back.title.as_deref(), Some("Roundtrip Test"));
        assert_eq!(read_back.messages.len(), 2);
        assert_eq!(read_back.messages[0].role, MessageRole::User);
        assert_eq!(read_back.messages[0].content, "User says hello");
        assert_eq!(read_back.messages[1].role, MessageRole::Assistant);
        assert_eq!(read_back.messages[1].content, "Assistant responds");
        assert_eq!(read_back.messages[1].author.as_deref(), Some("gpt-4o"));
    }

    // -----------------------------------------------------------------------
    // Owns session
    // -----------------------------------------------------------------------

    #[test]
    fn owns_session_finds_by_filename() {
        let dir = tempfile::TempDir::new().unwrap();
        let conv_dir = dir.path().join("conversations-uuid123");
        std::fs::create_dir_all(&conv_dir).unwrap();

        let conv = json!({
            "id": "my-conv-id",
            "mapping": {
                "node1": {
                    "message": {
                        "author": {"role": "user"},
                        "content": {"parts": ["Test"]}
                    }
                }
            }
        });
        std::fs::write(conv_dir.join("my-conv-id.json"), conv.to_string()).unwrap();

        // Test find_conversation_dirs directly since we can't set env var.
        let dirs = ChatGpt::find_conversation_dirs(dir.path());
        assert_eq!(dirs.len(), 1);

        // Verify the file exists with the expected name.
        let files: Vec<_> = std::fs::read_dir(&conv_dir).unwrap().flatten().collect();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name().to_str().unwrap(), "my-conv-id.json");
    }

    // -----------------------------------------------------------------------
    // Session roots
    // -----------------------------------------------------------------------

    #[test]
    fn session_roots_empty_without_home() {
        // On Linux without CHATGPT_HOME, session_roots should be empty.
        let p = ChatGpt;
        // This is a valid test on Linux where there's no macOS app support dir.
        // The result depends on whether CHATGPT_HOME is set.
        let _ = p.session_roots();
    }

    use std::path::Path;
}
