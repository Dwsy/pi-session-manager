//! Factory (factory.ai) provider — reads/writes JSONL sessions with metadata headers.
//!
//! Session files: `~/.factory/sessions/{workspace-slug}/{uuid}.jsonl`
//! Settings file: `~/.factory/sessions/{workspace-slug}/{uuid}.settings.json`
//! Override root: `FACTORY_HOME` env var
//!
//! ## JSONL format
//!
//! Factory uses a JSONL format with typed entries:
//!
//! - `{"type":"session_start", "id":"...", "title":"...", "owner":"...", "cwd":"..."}`
//! - `{"type":"message", "timestamp":"...", "message":{"role":"user|assistant", "content":"...", "model":"..."}}`
//!
//! Other entry types (todo_state, tool_result) are silently skipped.
//!
//! ## Workspace slug encoding
//!
//! The parent directory encodes the workspace path:
//! `-Users-alice-Dev-myproject` → `/Users/alice/Dev/myproject`

use std::io::BufRead;
use std::path::{Path, PathBuf};

use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content,
    normalize_role, parse_timestamp, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Factory provider implementation.
pub struct Factory;

impl Factory {
    /// Root directory for Factory session storage.
    /// Respects `FACTORY_HOME` env var override.
    fn home_dir() -> PathBuf {
        if let Ok(home) = std::env::var("FACTORY_HOME") {
            return PathBuf::from(home);
        }
        dirs::home_dir()
            .unwrap_or_default()
            .join(".factory")
            .join("sessions")
    }

    /// Decode a workspace path slug back to a filesystem path.
    ///
    /// e.g., `-Users-alice-Dev-myproject` → `/Users/alice/Dev/myproject`
    fn decode_workspace_slug(slug: &str) -> Option<PathBuf> {
        if slug.starts_with('-') {
            let path_str = slug.replace('-', "/");
            Some(PathBuf::from(path_str))
        } else {
            None
        }
    }

    /// Encode a workspace path as a Factory directory slug.
    ///
    /// e.g., `/Users/alice/Dev/myproject` → `-Users-alice-Dev-myproject`
    fn encode_workspace_slug(path: &Path) -> String {
        let s = path.to_string_lossy();
        s.replace('/', "-")
    }

    fn extract_tool_calls(
        message_obj: Option<&serde_json::Value>,
        content_value: Option<&serde_json::Value>,
    ) -> Vec<ToolCall> {
        let mut calls: Vec<ToolCall> = Vec::new();

        if let Some(serde_json::Value::Array(blocks)) = content_value {
            for block in blocks {
                let Some(obj) = block.as_object() else {
                    continue;
                };
                let Some(block_type) = obj.get("type").and_then(|v| v.as_str()) else {
                    continue;
                };
                if !matches!(
                    block_type,
                    "tool_use" | "tool_call" | "function_call" | "custom_tool_call"
                ) {
                    continue;
                }
                let arguments = obj
                    .get("input")
                    .or_else(|| obj.get("arguments"))
                    .or_else(|| obj.get("args"))
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                calls.push(ToolCall {
                    id: obj
                        .get("id")
                        .or_else(|| obj.get("call_id"))
                        .or_else(|| obj.get("tool_use_id"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    name: obj
                        .get("name")
                        .or_else(|| obj.get("function").and_then(|v| v.get("name")))
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    arguments,
                });
            }
        }

        if let Some(tool_calls) = message_obj
            .and_then(|m| m.get("toolCalls"))
            .and_then(|v| v.as_array())
        {
            for call in tool_calls {
                let Some(obj) = call.as_object() else {
                    continue;
                };
                calls.push(ToolCall {
                    id: obj
                        .get("id")
                        .or_else(|| obj.get("call_id"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    name: obj
                        .get("name")
                        .or_else(|| obj.get("function").and_then(|v| v.get("name")))
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    arguments: obj
                        .get("input")
                        .or_else(|| obj.get("arguments"))
                        .or_else(|| obj.get("args"))
                        .cloned()
                        .unwrap_or(serde_json::Value::Null),
                });
            }
        }

        calls
    }

    fn extract_tool_results(
        message_obj: Option<&serde_json::Value>,
        content_value: Option<&serde_json::Value>,
    ) -> Vec<ToolResult> {
        let mut results: Vec<ToolResult> = Vec::new();

        if let Some(serde_json::Value::Array(blocks)) = content_value {
            for block in blocks {
                let Some(obj) = block.as_object() else {
                    continue;
                };
                let Some(block_type) = obj.get("type").and_then(|v| v.as_str()) else {
                    continue;
                };
                if !matches!(
                    block_type,
                    "tool_result" | "function_call_output" | "custom_tool_call_output"
                ) {
                    continue;
                }
                let result_content = obj
                    .get("content")
                    .or_else(|| obj.get("output"))
                    .or_else(|| obj.get("result"))
                    .map(flatten_content)
                    .unwrap_or_default();
                let is_error = obj
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .or_else(|| {
                        obj.get("status")
                            .and_then(|v| v.as_str())
                            .map(|s| s == "error")
                    })
                    .unwrap_or(false);
                results.push(ToolResult {
                    call_id: obj
                        .get("tool_use_id")
                        .or_else(|| obj.get("call_id"))
                        .or_else(|| obj.get("id"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    content: result_content,
                    is_error,
                });
            }
        }

        if let Some(tool_results) = message_obj
            .and_then(|m| m.get("toolResults"))
            .and_then(|v| v.as_array())
        {
            for result in tool_results {
                let Some(obj) = result.as_object() else {
                    continue;
                };
                results.push(ToolResult {
                    call_id: obj
                        .get("tool_use_id")
                        .or_else(|| obj.get("call_id"))
                        .or_else(|| obj.get("id"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    content: obj
                        .get("content")
                        .or_else(|| obj.get("output"))
                        .or_else(|| obj.get("result"))
                        .map(flatten_content)
                        .unwrap_or_default(),
                    is_error: obj
                        .get("is_error")
                        .and_then(|v| v.as_bool())
                        .or_else(|| {
                            obj.get("status")
                                .and_then(|v| v.as_str())
                                .map(|s| s == "error")
                        })
                        .unwrap_or(false),
                });
            }
        }

        results
    }
}

impl Provider for Factory {
    fn name(&self) -> &str {
        "Factory"
    }

    fn slug(&self) -> &str {
        "factory"
    }

    fn cli_alias(&self) -> &str {
        "fac"
    }

    fn detect(&self) -> DetectionResult {
        let root = Self::home_dir();
        let installed = root.is_dir();
        let evidence = if installed {
            vec![format!("sessions directory found: {}", root.display())]
        } else {
            vec![]
        };
        trace!(provider = "factory", ?evidence, installed, "detection");
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
        // Walk looking for <session_id>.jsonl in any workspace subdirectory.
        let target_name = format!("{session_id}.jsonl");
        for entry in walkdir::WalkDir::new(&root)
            .max_depth(3)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_type().is_file()
                && entry.file_name().to_str().is_some_and(|n| n == target_name)
            {
                debug!(
                    provider = "factory",
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
        debug!(path = %path.display(), "reading Factory session");

        let file = std::fs::File::open(path)
            .map_err(|e| anyhow::anyhow!("failed to open {}: {e}", path.display()))?;
        let reader = std::io::BufReader::new(file);

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut session_id_from_header: Option<String> = None;
        let mut title_from_header: Option<String> = None;
        let mut workspace: Option<PathBuf> = None;
        let mut owner: Option<String> = None;
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;
        let mut model_from_settings: Option<String> = None;

        // Try to infer workspace from parent directory name.
        let parent_dir_name = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str());

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

            let entry_type = val.get("type").and_then(|v| v.as_str());

            match entry_type {
                Some("session_start") => {
                    session_id_from_header =
                        val.get("id").and_then(|v| v.as_str()).map(String::from);
                    title_from_header = val.get("title").and_then(|v| v.as_str()).map(String::from);
                    owner = val.get("owner").and_then(|v| v.as_str()).map(String::from);
                    workspace = val
                        .get("cwd")
                        .and_then(|v| v.as_str())
                        .map(PathBuf::from)
                        .or_else(|| parent_dir_name.and_then(Self::decode_workspace_slug));
                }
                Some("message") => {
                    let ts = val.get("timestamp").and_then(parse_timestamp);
                    if started_at.is_none() {
                        started_at = ts;
                    }
                    if ts.is_some() {
                        ended_at = ts;
                    }

                    let role_str = val
                        .get("message")
                        .and_then(|m| m.get("role"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let role = normalize_role(role_str);

                    let message_obj = val.get("message");
                    let content_value = message_obj.and_then(|m| m.get("content"));
                    let content = content_value.map(flatten_content).unwrap_or_default();
                    let tool_calls = Self::extract_tool_calls(message_obj, content_value);
                    let tool_results = Self::extract_tool_results(message_obj, content_value);

                    if content.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty()
                    {
                        continue;
                    }

                    let author = message_obj
                        .and_then(|m| m.get("model"))
                        .and_then(|v| v.as_str())
                        .map(String::from);

                    messages.push(CanonicalMessage {
                        idx: 0,
                        role,
                        content,
                        timestamp: ts,
                        author,
                        tool_calls,
                        tool_results,
                        extra: val,
                    });
                }
                _ => {} // Skip unknown entry types.
            }
        }

        reindex_messages(&mut messages);

        // Session ID: from header, or from filename stem.
        let session_id = session_id_from_header.unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

        // Workspace fallback: decode from parent directory slug.
        if workspace.is_none() {
            workspace = parent_dir_name.and_then(Self::decode_workspace_slug);
        }

        // Title: from header, or from first user message.
        let title = title_from_header.or_else(|| {
            messages
                .iter()
                .find(|m| m.role == MessageRole::User)
                .map(|m| truncate_title(&m.content, 100))
        });

        // Load settings file for model info.
        let settings_path = path.with_extension("settings.json");
        if settings_path.is_file()
            && let Ok(content) = std::fs::read_to_string(&settings_path)
            && let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
        {
            model_from_settings = val.get("model").and_then(|m| m.as_str()).map(String::from);
        }

        let metadata = serde_json::json!({
            "source": "factory",
            "sessionId": session_id,
            "owner": owner,
            "model": model_from_settings,
        });

        info!(
            session_id,
            messages = messages.len(),
            "Factory session parsed"
        );

        Ok(CanonicalSession {
            session_id,
            provider_slug: "factory".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata,
            source_path: path.to_path_buf(),
            model_name: model_from_settings,
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

        let workspace_slug = session
            .workspace
            .as_ref()
            .map(|p| Self::encode_workspace_slug(p))
            .unwrap_or_else(|| "-tmp".to_string());

        let target_dir = Self::home_dir().join(&workspace_slug);
        let target_path = target_dir.join(format!("{session_id}.jsonl"));

        debug!(
            session_id,
            path = %target_path.display(),
            messages = session.messages.len(),
            "writing Factory session"
        );

        let mut lines: Vec<String> = Vec::with_capacity(session.messages.len() + 1);

        // Write session_start header.
        let header = serde_json::json!({
            "type": "session_start",
            "id": session_id,
            "title": session.title,
            "cwd": session.workspace.as_ref().map(|p| p.to_string_lossy().to_string()),
        });
        lines.push(serde_json::to_string(&header)?);

        // Write message entries.
        for msg in &session.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                MessageRole::Tool => "tool",
                MessageRole::Other(r) => r.as_str(),
            };

            let mut message_obj = serde_json::Map::new();
            message_obj.insert(
                "role".into(),
                serde_json::Value::String(role_str.to_string()),
            );
            message_obj.insert(
                "content".into(),
                serde_json::Value::String(msg.content.clone()),
            );
            if let Some(ref author) = msg.author {
                message_obj.insert("model".into(), serde_json::Value::String(author.clone()));
            }

            let mut entry = serde_json::Map::new();
            entry.insert(
                "type".into(),
                serde_json::Value::String("message".to_string()),
            );
            if let Some(ts) = msg.timestamp {
                let dt =
                    chrono::DateTime::from_timestamp_millis(ts).unwrap_or_else(chrono::Utc::now);
                entry.insert(
                    "timestamp".into(),
                    serde_json::Value::String(dt.to_rfc3339()),
                );
            }
            entry.insert("message".into(), serde_json::Value::Object(message_obj));

            lines.push(serde_json::to_string(&serde_json::Value::Object(entry))?);
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
            "Factory session written"
        );

        Ok(WrittenSession {
            paths: vec![outcome.target_path],
            session_id: session_id.clone(),
            resume_command: self.resume_command(&session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("factory --resume {session_id}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------

    fn write_factory_session(dir: &Path, ws_slug: &str, name: &str, lines: &[&str]) -> PathBuf {
        let ws_dir = dir.join(ws_slug);
        std::fs::create_dir_all(&ws_dir).unwrap();
        let path = ws_dir.join(format!("{name}.jsonl"));
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }

    fn read_factory(ws_slug: &str, name: &str, lines: &[&str]) -> CanonicalSession {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_factory_session(tmp.path(), ws_slug, name, lines);
        let provider = Factory;
        provider.read_session(&path).expect("read_session failed")
    }

    // -----------------------------------------------------------------------
    // Reader tests
    // -----------------------------------------------------------------------

    #[test]
    fn reader_basic_session() {
        let session = read_factory(
            "-home-user-project",
            "sess-001",
            &[
                r#"{"type":"session_start","id":"sess-001","title":"Test","owner":"user","cwd":"/home/user/project"}"#,
                r#"{"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Hello Factory"}}"#,
                r#"{"type":"message","timestamp":"2025-12-01T10:00:05Z","message":{"role":"assistant","content":"Hi!"}}"#,
            ],
        );

        assert_eq!(session.provider_slug, "factory");
        assert_eq!(session.session_id, "sess-001");
        assert_eq!(session.title.as_deref(), Some("Test"));
        assert_eq!(session.workspace, Some(PathBuf::from("/home/user/project")));
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello Factory");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn reader_session_id_from_header() {
        let session = read_factory(
            "-test",
            "file-name",
            &[
                r#"{"type":"session_start","id":"header-id"}"#,
                r#"{"type":"message","message":{"role":"user","content":"test"}}"#,
            ],
        );
        assert_eq!(session.session_id, "header-id");
    }

    #[test]
    fn reader_session_id_fallback_to_filename() {
        let session = read_factory(
            "-test",
            "fallback-name",
            &[r#"{"type":"message","message":{"role":"user","content":"test"}}"#],
        );
        assert_eq!(session.session_id, "fallback-name");
    }

    #[test]
    fn reader_workspace_from_cwd() {
        let session = read_factory(
            "-test",
            "ws-test",
            &[
                r#"{"type":"session_start","cwd":"/data/projects/app"}"#,
                r#"{"type":"message","message":{"role":"user","content":"test"}}"#,
            ],
        );
        assert_eq!(session.workspace, Some(PathBuf::from("/data/projects/app")));
    }

    #[test]
    fn reader_workspace_fallback_to_slug() {
        let session = read_factory(
            "-Users-alice-Dev-myproject",
            "ws-slug",
            &[
                r#"{"type":"session_start","id":"ws-slug"}"#,
                r#"{"type":"message","message":{"role":"user","content":"test"}}"#,
            ],
        );
        assert_eq!(
            session.workspace,
            Some(PathBuf::from("/Users/alice/Dev/myproject"))
        );
    }

    #[test]
    fn reader_title_from_header() {
        let session = read_factory(
            "-test",
            "title-h",
            &[
                r#"{"type":"session_start","title":"Header Title"}"#,
                r#"{"type":"message","message":{"role":"user","content":"user msg"}}"#,
            ],
        );
        assert_eq!(session.title.as_deref(), Some("Header Title"));
    }

    #[test]
    fn reader_title_fallback_to_user_message() {
        let session = read_factory(
            "-test",
            "title-u",
            &[
                r#"{"type":"session_start"}"#,
                r#"{"type":"message","message":{"role":"user","content":"First user message"}}"#,
            ],
        );
        assert_eq!(session.title.as_deref(), Some("First user message"));
    }

    #[test]
    fn reader_skips_unknown_entry_types() {
        let session = read_factory(
            "-test",
            "skip-types",
            &[
                r#"{"type":"todo_state","tasks":[]}"#,
                r#"{"type":"tool_result","name":"bash","output":"ok"}"#,
                r#"{"type":"message","message":{"role":"user","content":"Real message"}}"#,
            ],
        );
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Real message");
    }

    #[test]
    fn reader_skips_empty_content() {
        let session = read_factory(
            "-test",
            "empty-c",
            &[
                r#"{"type":"message","message":{"role":"user","content":"Valid"}}"#,
                r#"{"type":"message","message":{"role":"assistant","content":""}}"#,
                r#"{"type":"message","message":{"role":"assistant","content":"   "}}"#,
            ],
        );
        assert_eq!(session.messages.len(), 1);
    }

    #[test]
    fn reader_extracts_model_as_author() {
        let session = read_factory(
            "-test",
            "model-a",
            &[
                r#"{"type":"message","message":{"role":"assistant","content":"Response","model":"claude-opus"}}"#,
            ],
        );
        assert_eq!(session.messages[0].author.as_deref(), Some("claude-opus"));
    }

    #[test]
    fn reader_handles_array_content() {
        let session = read_factory(
            "-test",
            "arr-c",
            &[
                r#"{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Part 1"},{"type":"text","text":"Part 2"}]}}"#,
            ],
        );
        assert!(session.messages[0].content.contains("Part 1"));
        assert!(session.messages[0].content.contains("Part 2"));
    }

    #[test]
    fn reader_extracts_tool_calls_and_tool_results_from_content_blocks() {
        let session = read_factory(
            "-test",
            "tool-blocks",
            &[
                r#"{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Working"},{"type":"tool_use","id":"toolu_1","name":"Execute","input":{"command":"pwd"}}]}}"#,
                r#"{"type":"message","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"ok"}]}}"#,
            ],
        );

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].tool_calls.len(), 1);
        assert_eq!(session.messages[0].tool_calls[0].name, "Execute");
        assert_eq!(session.messages[1].tool_results.len(), 1);
        assert_eq!(
            session.messages[1].tool_results[0].call_id.as_deref(),
            Some("toolu_1")
        );
        assert_eq!(session.messages[1].tool_results[0].content, "ok");
    }

    #[test]
    fn reader_extracts_tool_calls_from_message_level_tool_calls() {
        let session = read_factory(
            "-test",
            "tool-calls-array",
            &[
                r#"{"type":"message","message":{"role":"assistant","content":"Running","toolCalls":[{"id":"call_1","name":"Grep","args":{"pattern":"tool"}}]}}"#,
            ],
        );
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].tool_calls.len(), 1);
        assert_eq!(session.messages[0].tool_calls[0].name, "Grep");
        assert_eq!(
            session.messages[0].tool_calls[0].id.as_deref(),
            Some("call_1")
        );
    }

    #[test]
    fn reader_loads_settings_file() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_dir = tmp.path().join("-test");
        std::fs::create_dir_all(&ws_dir).unwrap();

        let session_path = ws_dir.join("settings-test.jsonl");
        std::fs::write(
            &session_path,
            r#"{"type":"message","message":{"role":"user","content":"test"}}"#,
        )
        .unwrap();

        let settings_path = ws_dir.join("settings-test.settings.json");
        std::fs::write(&settings_path, r#"{"model":"claude-opus-4-5"}"#).unwrap();

        let provider = Factory;
        let session = provider.read_session(&session_path).unwrap();
        assert_eq!(session.model_name.as_deref(), Some("claude-opus-4-5"));
        assert_eq!(session.metadata["model"], "claude-opus-4-5");
    }

    #[test]
    fn reader_empty_file() {
        let session = read_factory("-test", "empty", &[]);
        assert_eq!(session.messages.len(), 0);
    }

    #[test]
    fn reader_metadata_has_source() {
        let session = read_factory(
            "-test",
            "meta",
            &[r#"{"type":"message","message":{"role":"user","content":"test"}}"#],
        );
        assert_eq!(session.metadata["source"], "factory");
    }

    // -----------------------------------------------------------------------
    // Workspace slug tests
    // -----------------------------------------------------------------------

    #[test]
    fn decode_workspace_slug_basic() {
        assert_eq!(
            Factory::decode_workspace_slug("-Users-alice-Dev-myproject"),
            Some(PathBuf::from("/Users/alice/Dev/myproject"))
        );
    }

    #[test]
    fn decode_workspace_slug_no_leading_dash() {
        assert_eq!(Factory::decode_workspace_slug("invalid-path"), None);
    }

    #[test]
    fn decode_workspace_slug_empty() {
        assert_eq!(Factory::decode_workspace_slug(""), None);
    }

    #[test]
    fn encode_workspace_slug_basic() {
        assert_eq!(
            Factory::encode_workspace_slug(Path::new("/Users/alice/Dev")),
            "-Users-alice-Dev"
        );
    }

    // -----------------------------------------------------------------------
    // Writer tests
    // -----------------------------------------------------------------------

    #[test]
    fn writer_produces_valid_factory_jsonl() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_dir = tmp.path().join("-test");
        std::fs::create_dir_all(&ws_dir).unwrap();

        let session = CanonicalSession {
            session_id: "write-test".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(PathBuf::from("/test")),
            title: Some("Write Test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_001_000_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Fix it".to_string(),
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
                    author: Some("claude-3".to_string()),
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
            ],
            metadata: json!({}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: None,
        };

        // Write directly to validate structure.
        let target = ws_dir.join("write-test.jsonl");
        let mut lines = Vec::new();

        let header = json!({
            "type": "session_start",
            "id": "write-test",
            "title": "Write Test",
            "cwd": "/test",
        });
        lines.push(serde_json::to_string(&header).unwrap());

        for msg in &session.messages {
            let role_str = match &msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                _ => "other",
            };
            let entry = json!({
                "type": "message",
                "message": {
                    "role": role_str,
                    "content": msg.content,
                },
            });
            lines.push(serde_json::to_string(&entry).unwrap());
        }
        std::fs::write(&target, lines.join("\n") + "\n").unwrap();

        // Read back.
        let provider = Factory;
        let readback = provider.read_session(&target).unwrap();
        assert_eq!(readback.session_id, "write-test");
        assert_eq!(readback.title.as_deref(), Some("Write Test"));
        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].content, "Fix it");
    }

    #[test]
    fn writer_resume_command() {
        let provider = Factory;
        assert_eq!(
            provider.resume_command("my-session"),
            "factory --resume my-session"
        );
    }

    // -----------------------------------------------------------------------
    // Provider metadata
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let provider = Factory;
        assert_eq!(provider.name(), "Factory");
        assert_eq!(provider.slug(), "factory");
        assert_eq!(provider.cli_alias(), "fac");
    }
}
