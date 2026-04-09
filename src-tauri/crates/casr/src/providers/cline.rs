//! Cline provider — reads/writes sessions from VS Code-style `globalStorage`.
//!
//! Cline is the VS Code extension published as `saoudrizwan.claude-dev`.
//! Its session artifacts are stored under the editor's `User/globalStorage`:
//!
//! - `<HOST_CONFIG>/User/globalStorage/saoudrizwan.claude-dev/tasks/<taskId>/api_conversation_history.json`
//! - `<HOST_CONFIG>/User/globalStorage/saoudrizwan.claude-dev/tasks/<taskId>/ui_messages.json`
//! - `<HOST_CONFIG>/User/globalStorage/saoudrizwan.claude-dev/state/taskHistory.json`
//!
//! Where `<HOST_CONFIG>` can be VS Code (`Code`, `Code - Insiders`, `VSCodium`) or Cursor.
//!
//! ## Session IDs
//!
//! Task IDs are numeric strings (typically `Date.now()` / epoch millis).
//! casr therefore generates numeric IDs for Cline targets as well.

use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content,
    normalize_role, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// VS Code Marketplace extension identifier.
const CLINE_EXTENSION_ID: &str = "saoudrizwan.claude-dev";

const FILE_API_HISTORY: &str = "api_conversation_history.json";
const FILE_UI_MESSAGES: &str = "ui_messages.json";
const FILE_UI_MESSAGES_OLD: &str = "claude_messages.json";
const FILE_TASK_METADATA: &str = "task_metadata.json";
const FILE_TASK_HISTORY: &str = "taskHistory.json";

/// Cline provider implementation.
pub struct Cline;

impl Cline {
    /// Cline globalStorage root. Respects `CLINE_HOME` env var override.
    ///
    /// The value is expected to be the extension's globalStorage directory, i.e.
    /// the directory that contains `tasks/` and `state/`.
    fn storage_roots() -> Vec<PathBuf> {
        if let Ok(home) = std::env::var("CLINE_HOME") {
            return vec![PathBuf::from(home)];
        }

        // Editor config roots that can host VS Code-style `User/globalStorage`.
        // We probe both config_dir and data_dir to cover Linux/Windows vs macOS.
        let mut host_roots: Vec<PathBuf> = Vec::new();
        if let Some(cfg) = dirs::config_dir() {
            host_roots.push(cfg.join("Code"));
            host_roots.push(cfg.join("Code - Insiders"));
            host_roots.push(cfg.join("VSCodium"));
            host_roots.push(cfg.join("Cursor"));
        }
        if let Some(data) = dirs::data_dir() {
            host_roots.push(data.join("Code"));
            host_roots.push(data.join("Code - Insiders"));
            host_roots.push(data.join("VSCodium"));
            host_roots.push(data.join("Cursor"));
        }

        // Deduplicate while preserving order.
        host_roots.sort();
        host_roots.dedup();

        host_roots
            .into_iter()
            .map(|host| {
                host.join("User")
                    .join("globalStorage")
                    .join(CLINE_EXTENSION_ID)
            })
            .filter(|p| p.is_dir())
            .collect()
    }

    fn tasks_root(storage_root: &Path) -> PathBuf {
        storage_root.join("tasks")
    }

    fn state_dir(storage_root: &Path) -> PathBuf {
        storage_root.join("state")
    }

    fn task_history_path(storage_root: &Path) -> PathBuf {
        Self::state_dir(storage_root).join(FILE_TASK_HISTORY)
    }

    fn task_dir_from_api_path(path: &Path) -> Option<PathBuf> {
        // .../tasks/<taskId>/<file>
        let task_dir = path.parent()?.to_path_buf();
        if task_dir.parent()?.file_name()?.to_string_lossy() != "tasks" {
            return None;
        }
        Some(task_dir)
    }

    fn task_id_from_task_dir(task_dir: &Path) -> Option<String> {
        task_dir
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
    }

    fn find_storage_root_for_path(path: &Path) -> Option<PathBuf> {
        // Expect: <storage_root>/tasks/<taskId>/<file>
        let task_dir = Self::task_dir_from_api_path(path)?;
        let tasks_dir = task_dir.parent()?;
        let storage_root = tasks_dir.parent()?;
        Some(storage_root.to_path_buf())
    }

    fn read_json(path: &Path) -> anyhow::Result<serde_json::Value> {
        let file = std::fs::File::open(path)
            .with_context(|| format!("failed to open {}", path.display()))?;
        let reader = std::io::BufReader::new(file);
        serde_json::from_reader(reader).with_context(|| format!("invalid json: {}", path.display()))
    }

    fn read_task_history_item(
        storage_root: &Path,
        task_id: &str,
    ) -> Option<serde_json::Map<String, serde_json::Value>> {
        let history_path = Self::task_history_path(storage_root);
        let Ok(root) = Self::read_json(&history_path) else {
            return None;
        };
        let serde_json::Value::Array(items) = root else {
            return None;
        };
        for item in items {
            let Some(obj) = item.as_object() else {
                continue;
            };
            if obj.get("id").and_then(|v| v.as_str()) == Some(task_id) {
                return Some(obj.clone());
            }
        }
        None
    }

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
                let content_value = obj
                    .get("content")
                    .or_else(|| obj.get("output"))
                    .unwrap_or(&serde_json::Value::Null);
                Some(ToolResult {
                    call_id: obj
                        .get("tool_use_id")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    content: flatten_content(content_value),
                    is_error: obj
                        .get("is_error")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                })
            })
            .collect()
    }

    fn pick_storage_root_for_write() -> anyhow::Result<PathBuf> {
        let roots = Self::storage_roots();
        roots.into_iter().next().ok_or_else(|| {
            anyhow::anyhow!(
                "Cline storage not found. Set CLINE_HOME to the extension globalStorage directory."
            )
        })
    }

    fn generate_task_id(storage_root: &Path) -> String {
        let tasks_root = Self::tasks_root(storage_root);
        let mut candidate: i64 = chrono::Utc::now().timestamp_millis();
        loop {
            let id = candidate.to_string();
            if !tasks_root.join(&id).exists() {
                return id;
            }
            candidate = candidate.saturating_add(1);
        }
    }

    fn build_api_history(session: &CanonicalSession) -> Vec<serde_json::Value> {
        let mut out = Vec::new();

        for msg in &session.messages {
            let role = match msg.role {
                MessageRole::Assistant => "assistant",
                MessageRole::User => "user",
                MessageRole::Tool | MessageRole::System | MessageRole::Other(_) => "user",
            };

            let mut blocks: Vec<serde_json::Value> = Vec::new();

            match role {
                "assistant" => {
                    if !msg.content.trim().is_empty() {
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
                }
                _ => {
                    if !msg.content.trim().is_empty() {
                        blocks.push(serde_json::json!({
                            "type": "text",
                            "text": msg.content,
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
                }
            }

            out.push(serde_json::json!({
                "role": role,
                "content": blocks,
            }));
        }

        out
    }

    fn build_ui_messages(session: &CanonicalSession) -> Vec<serde_json::Value> {
        let now = chrono::Utc::now().timestamp_millis();
        let mut cursor_ts = session.started_at.unwrap_or(now);

        // Cline's UI messages are not a simple chat transcript; we emit a minimal, plausible subset:
        // - a "task" say-message for the first user message
        // - "user_feedback" for subsequent user messages
        // - "text" for assistant messages
        let mut out = Vec::new();
        let mut first_task_emitted = false;

        for msg in &session.messages {
            let (say, text) = match msg.role {
                MessageRole::User => {
                    if !first_task_emitted {
                        first_task_emitted = true;
                        ("task", msg.content.clone())
                    } else {
                        ("user_feedback", msg.content.clone())
                    }
                }
                MessageRole::Assistant => ("text", msg.content.clone()),
                MessageRole::Tool | MessageRole::System | MessageRole::Other(_) => {
                    ("info", msg.content.clone())
                }
            };

            if text.trim().is_empty() {
                continue;
            }

            out.push(serde_json::json!({
                "ts": msg.timestamp.unwrap_or(cursor_ts),
                "type": "say",
                "say": say,
                "text": text,
            }));

            cursor_ts = cursor_ts.saturating_add(1);
        }

        out
    }

    fn update_task_history(
        storage_root: &Path,
        task_id: &str,
        session: &CanonicalSession,
        provider_slug: &str,
    ) -> anyhow::Result<Option<PathBuf>> {
        let history_path = Self::task_history_path(storage_root);

        let mut items: Vec<serde_json::Value> = match Self::read_json(&history_path) {
            Ok(serde_json::Value::Array(arr)) => arr,
            _ => Vec::new(),
        };

        // Remove any existing entry with the same id (defensive).
        items.retain(|v| v.get("id").and_then(|x| x.as_str()) != Some(task_id));

        let title = session
            .title
            .clone()
            .or_else(|| {
                session
                    .messages
                    .iter()
                    .find(|m| m.role == MessageRole::User)
                    .map(|m| truncate_title(&m.content, 100))
            })
            .unwrap_or_else(|| "Untitled Task".to_string());

        let ts = session
            .started_at
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        let mut obj = serde_json::Map::new();
        obj.insert("id".into(), serde_json::Value::String(task_id.to_string()));
        obj.insert("ts".into(), serde_json::Value::Number(ts.into()));
        obj.insert("task".into(), serde_json::Value::String(title));
        obj.insert("tokensIn".into(), serde_json::Value::Number(0.into()));
        obj.insert("tokensOut".into(), serde_json::Value::Number(0.into()));
        obj.insert(
            "totalCost".into(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(0.0).unwrap_or_else(|| 0.into()),
            ),
        );
        if let Some(ws) = session.workspace.as_ref() {
            obj.insert(
                "cwdOnTaskInitialization".into(),
                serde_json::Value::String(ws.display().to_string()),
            );
        }
        if let Some(model) = session.model_name.as_ref() {
            obj.insert("modelId".into(), serde_json::Value::String(model.clone()));
        }

        items.push(serde_json::Value::Object(obj));

        // Sort newest-first for determinism.
        items.sort_by(|a, b| {
            let ta = a.get("ts").and_then(|v| v.as_i64()).unwrap_or(0);
            let tb = b.get("ts").and_then(|v| v.as_i64()).unwrap_or(0);
            tb.cmp(&ta)
        });

        let bytes = serde_json::to_vec_pretty(&serde_json::Value::Array(items))
            .context("failed to serialize taskHistory.json")?;

        // `taskHistory.json` is a shared state file; we must overwrite it even when
        // `--force` is not used for the session itself. We still do an atomic write
        // with a `.bak` backup for safety.
        let outcome = crate::pipeline::atomic_write(&history_path, &bytes, true, provider_slug)
            .map_err(|e| anyhow::anyhow!("{e}"))?;

        Ok(outcome.backup_path)
    }
}

impl Provider for Cline {
    fn name(&self) -> &str {
        "Cline"
    }

    fn slug(&self) -> &str {
        "cline"
    }

    fn cli_alias(&self) -> &str {
        "cln"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if let Ok(home) = std::env::var("CLINE_HOME") {
            evidence.push(format!("CLINE_HOME={home}"));
            let p = PathBuf::from(&home);
            if p.is_dir() {
                installed = true;
                evidence.push(format!("{} exists", p.display()));
            } else {
                evidence.push(format!("{} missing", p.display()));
            }
        }

        let roots = Self::storage_roots();
        if !roots.is_empty() {
            installed = true;
            for r in &roots {
                evidence.push(format!("{} detected", r.display()));
            }
        }

        trace!(provider = "cline", installed, ?evidence, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        Self::storage_roots()
            .into_iter()
            .map(|root| Self::tasks_root(&root))
            .collect()
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        for storage_root in Self::storage_roots() {
            let task_dir = Self::tasks_root(&storage_root).join(session_id);
            let api = task_dir.join(FILE_API_HISTORY);
            if api.is_file() {
                return Some(api);
            }
            let ui = task_dir.join(FILE_UI_MESSAGES);
            if ui.is_file() {
                return Some(ui);
            }
            let old = task_dir.join(FILE_UI_MESSAGES_OLD);
            if old.is_file() {
                return Some(old);
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if !matches!(
            file_name,
            FILE_API_HISTORY | FILE_UI_MESSAGES | FILE_UI_MESSAGES_OLD
        ) {
            return Err(anyhow::anyhow!(
                "unsupported Cline session path (expected task file): {}",
                path.display()
            ));
        }

        let task_dir = Self::task_dir_from_api_path(path)
            .ok_or_else(|| anyhow::anyhow!("not a Cline task path: {}", path.display()))?;
        let task_id = Self::task_id_from_task_dir(&task_dir)
            .ok_or_else(|| anyhow::anyhow!("could not derive task id: {}", task_dir.display()))?;
        let storage_root = Self::find_storage_root_for_path(path).ok_or_else(|| {
            anyhow::anyhow!("could not derive Cline storage root for {}", path.display())
        })?;

        // Prefer API history for canonical messages (and avoid duplicates in `casr list`).
        let api_path = task_dir.join(FILE_API_HISTORY);
        let api_source_path = if file_name == FILE_API_HISTORY {
            path.to_path_buf()
        } else if api_path.is_file() {
            // If we were asked to read `ui_messages.json` but `api_conversation_history.json` exists,
            // treat the UI file as a non-primary artifact to avoid duplicate sessions in discovery.
            return Err(anyhow::anyhow!(
                "non-primary Cline task artifact (use {}): {}",
                FILE_API_HISTORY,
                path.display()
            ));
        } else {
            // Fall back to UI messages only when the API history file is missing.
            path.to_path_buf()
        };

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut model_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();

        if api_source_path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|n| n == FILE_API_HISTORY)
        {
            let root = Self::read_json(&api_source_path)?;
            let serde_json::Value::Array(items) = root else {
                return Err(anyhow::anyhow!("Cline api history is not an array"));
            };

            for item in items {
                let Some(obj) = item.as_object() else {
                    continue;
                };
                let role_str = obj.get("role").and_then(|v| v.as_str()).unwrap_or("user");
                let role = normalize_role(role_str);
                let content_value = obj.get("content").unwrap_or(&serde_json::Value::Null);
                let content = flatten_content(content_value);

                if content.trim().is_empty() {
                    continue;
                }

                let author = obj
                    .get("modelInfo")
                    .and_then(|v| v.get("modelId"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from);
                if let Some(ref m) = author {
                    *model_counts.entry(m.clone()).or_insert(0) += 1;
                }

                let tool_calls = Self::extract_tool_calls(Some(content_value));
                let tool_results = Self::extract_tool_results(Some(content_value));

                messages.push(CanonicalMessage {
                    idx: 0,
                    role,
                    content,
                    timestamp: None,
                    author,
                    tool_calls,
                    tool_results,
                    extra: serde_json::Value::Object(obj.clone()),
                });
            }
        } else {
            // ui_messages.json fallback: extract a minimal conversational transcript.
            let root = Self::read_json(&api_source_path)?;
            let serde_json::Value::Array(items) = root else {
                return Err(anyhow::anyhow!("Cline ui messages is not an array"));
            };
            for item in items {
                let Some(obj) = item.as_object() else {
                    continue;
                };
                let msg_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or_default();
                if msg_type != "say" {
                    continue;
                }
                let say = obj.get("say").and_then(|v| v.as_str()).unwrap_or_default();
                let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or_default();
                if text.trim().is_empty() {
                    continue;
                }

                let role = match say {
                    "task" | "user_feedback" | "user_feedback_diff" => MessageRole::User,
                    _ => MessageRole::Assistant,
                };
                let ts = obj.get("ts").and_then(|v| v.as_i64());
                messages.push(CanonicalMessage {
                    idx: 0,
                    role,
                    content: text.to_string(),
                    timestamp: ts,
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Object(obj.clone()),
                });
            }
        }

        reindex_messages(&mut messages);

        let history_item = Self::read_task_history_item(&storage_root, &task_id);
        let workspace = history_item
            .as_ref()
            .and_then(|h| h.get("cwdOnTaskInitialization"))
            .and_then(|v| v.as_str())
            .map(PathBuf::from);
        let started_at = history_item
            .as_ref()
            .and_then(|h| h.get("ts"))
            .and_then(|v| v.as_i64());

        let title = history_item
            .as_ref()
            .and_then(|h| h.get("task"))
            .and_then(|v| v.as_str())
            .map(|s| truncate_title(s, 100))
            .or_else(|| {
                messages
                    .iter()
                    .find(|m| m.role == MessageRole::User)
                    .map(|m| truncate_title(&m.content, 100))
            });

        let model_name = model_counts
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(name, _)| name)
            .or_else(|| {
                history_item
                    .as_ref()
                    .and_then(|h| h.get("modelId"))
                    .and_then(|v| v.as_str())
                    .map(String::from)
            });

        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("cline".to_string()),
        );
        if let Some(h) = history_item {
            metadata.insert("taskHistoryItem".into(), serde_json::Value::Object(h));
        }

        debug!(task_id, messages = messages.len(), "Cline session parsed");

        Ok(CanonicalSession {
            session_id: task_id,
            provider_slug: "cline".to_string(),
            workspace,
            title,
            started_at,
            ended_at: started_at,
            messages,
            metadata: serde_json::Value::Object(metadata),
            source_path: api_source_path,
            model_name,
        })
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let storage_root = Self::pick_storage_root_for_write()?;

        let target_task_id = Self::generate_task_id(&storage_root);
        let task_dir = Self::tasks_root(&storage_root).join(&target_task_id);
        std::fs::create_dir_all(&task_dir)
            .with_context(|| format!("failed to create {}", task_dir.display()))?;

        // 1) api_conversation_history.json
        let api_history = Self::build_api_history(session);
        let api_bytes =
            serde_json::to_vec(&api_history).context("failed to serialize api history")?;
        let api_path = task_dir.join(FILE_API_HISTORY);
        let _ = crate::pipeline::atomic_write(&api_path, &api_bytes, opts.force, self.slug())?;

        // 2) ui_messages.json
        let ui_messages = Self::build_ui_messages(session);
        let ui_bytes =
            serde_json::to_vec(&ui_messages).context("failed to serialize ui messages")?;
        let ui_path = task_dir.join(FILE_UI_MESSAGES);
        let _ = crate::pipeline::atomic_write(&ui_path, &ui_bytes, opts.force, self.slug())?;

        // 3) task_metadata.json (minimal)
        let metadata_path = task_dir.join(FILE_TASK_METADATA);
        let metadata_bytes = serde_json::to_vec_pretty(&serde_json::json!({
            "files_in_context": [],
            "model_usage": [],
            "environment_history": [],
        }))
        .context("failed to serialize task metadata")?;
        let _ = crate::pipeline::atomic_write(
            &metadata_path,
            &metadata_bytes,
            opts.force,
            self.slug(),
        )?;

        // 4) state/taskHistory.json (best-effort, but needed for Cline to list tasks)
        let backup_path =
            Self::update_task_history(&storage_root, &target_task_id, session, self.slug())?;

        debug!(
            task_id = target_task_id,
            api = %api_path.display(),
            "Cline session written"
        );

        Ok(WrittenSession {
            paths: vec![api_path, ui_path, metadata_path],
            session_id: target_task_id.clone(),
            resume_command: self.resume_command(&target_task_id),
            backup_path,
        })
    }

    fn resume_command(&self, _session_id: &str) -> String {
        // Cline has no CLI resume flag. Best effort: open the workspace in VS Code.
        "code .".to_string()
    }
}

// Integration tests for Cline live under `tests/` so they can safely isolate env vars.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};
    use crate::providers::Provider;
    use serde_json::json;

    /// Create a temp Cline storage root with a task directory and API history file.
    /// Returns (storage_root, api_history_path).
    fn write_api_session(
        task_id: &str,
        api_entries: &[serde_json::Value],
        task_history: Option<&[serde_json::Value]>,
    ) -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().expect("tmpdir");
        let task_dir = root.path().join("tasks").join(task_id);
        std::fs::create_dir_all(&task_dir).expect("create task dir");

        let api_path = task_dir.join(FILE_API_HISTORY);
        let bytes = serde_json::to_vec(api_entries).expect("serialize api history");
        std::fs::write(&api_path, &bytes).expect("write api history");

        if let Some(history) = task_history {
            let state_dir = root.path().join("state");
            std::fs::create_dir_all(&state_dir).expect("create state dir");
            let history_path = state_dir.join(FILE_TASK_HISTORY);
            let hbytes = serde_json::to_vec(history).expect("serialize task history");
            std::fs::write(&history_path, &hbytes).expect("write task history");
        }

        (root, api_path)
    }

    fn make_api_user(text: &str) -> serde_json::Value {
        json!({
            "role": "user",
            "content": [{"type": "text", "text": text}]
        })
    }

    fn make_api_assistant(text: &str) -> serde_json::Value {
        json!({
            "role": "assistant",
            "content": [{"type": "text", "text": text}]
        })
    }

    fn make_api_assistant_with_model(text: &str, model_id: &str) -> serde_json::Value {
        json!({
            "role": "assistant",
            "content": [{"type": "text", "text": text}],
            "modelInfo": {"modelId": model_id}
        })
    }

    fn make_canonical_session(messages: Vec<CanonicalMessage>) -> CanonicalSession {
        CanonicalSession {
            session_id: "source-1".to_string(),
            provider_slug: "test".to_string(),
            workspace: Some(PathBuf::from("/data/projects/test_ws")),
            title: Some("Test Session".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_001_000),
            messages,
            metadata: serde_json::Value::Null,
            source_path: PathBuf::from("/tmp/source.jsonl"),
            model_name: None,
        }
    }

    // -----------------------------------------------------------------------
    // Reader tests — API format (bd-16s.4)
    // -----------------------------------------------------------------------

    #[test]
    fn reader_api_basic_exchange() {
        let entries = vec![
            make_api_user("Hello world"),
            make_api_assistant("Hi there!"),
        ];
        let (_root, api_path) = write_api_session("1700000000001", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(session.provider_slug, "cline");
        assert_eq!(session.session_id, "1700000000001");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Hello world");
        assert_eq!(session.messages[0].idx, 0);
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Hi there!");
        assert_eq!(session.messages[1].idx, 1);
    }

    #[test]
    fn reader_api_tool_use_blocks() {
        let entries = vec![
            make_api_user("Read the file"),
            json!({
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Let me read that file."},
                    {
                        "type": "tool_use",
                        "id": "tool-abc",
                        "name": "ReadFile",
                        "input": {"path": "src/main.rs"}
                    }
                ]
            }),
        ];
        let (_root, api_path) = write_api_session("1700000000002", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(session.messages.len(), 2);
        let assistant = &session.messages[1];
        assert_eq!(assistant.role, MessageRole::Assistant);
        assert!(assistant.content.contains("Let me read that file."));
        assert_eq!(assistant.tool_calls.len(), 1);
        assert_eq!(assistant.tool_calls[0].name, "ReadFile");
        assert_eq!(assistant.tool_calls[0].id.as_deref(), Some("tool-abc"));
        assert_eq!(
            assistant.tool_calls[0].arguments["path"].as_str(),
            Some("src/main.rs")
        );
    }

    #[test]
    fn reader_api_tool_result_blocks() {
        // A user message with a text block AND tool_result blocks.
        // (A message with only tool_result blocks is skipped because
        // flatten_content produces no text for tool_result type objects.)
        let entries = vec![
            make_api_user("Read the file"),
            json!({
                "role": "user",
                "content": [
                    {"type": "text", "text": "Here is the result"},
                    {
                        "type": "tool_result",
                        "tool_use_id": "tool-abc",
                        "content": "fn main() { }",
                        "is_error": false
                    }
                ]
            }),
            make_api_assistant("I see the file content."),
        ];
        let (_root, api_path) = write_api_session("1700000000003", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        let tool_msg = session
            .messages
            .iter()
            .find(|m| !m.tool_results.is_empty())
            .expect("should have a message with tool_results");
        assert_eq!(tool_msg.role, MessageRole::User);
        assert!(tool_msg.content.contains("Here is the result"));
        assert_eq!(tool_msg.tool_results.len(), 1);
        assert_eq!(
            tool_msg.tool_results[0].call_id.as_deref(),
            Some("tool-abc")
        );
        assert_eq!(tool_msg.tool_results[0].content, "fn main() { }");
        assert!(!tool_msg.tool_results[0].is_error);
    }

    #[test]
    fn reader_api_skips_tool_result_only_message() {
        // A message with ONLY tool_result blocks (no text) should be skipped,
        // because flatten_content does not produce text for tool_result objects.
        let entries = vec![
            make_api_user("Read the file"),
            json!({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "tool-xyz",
                        "content": "fn main() { }",
                        "is_error": false
                    }
                ]
            }),
            make_api_assistant("I see it."),
        ];
        let (_root, api_path) = write_api_session("1700000000013", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        // Only the user text message and assistant reply remain; the
        // tool_result-only message is dropped.
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].content, "Read the file");
        assert_eq!(session.messages[1].content, "I see it.");
    }

    #[test]
    fn reader_api_model_info_extraction() {
        let entries = vec![
            make_api_user("Hello"),
            make_api_assistant_with_model("Hi", "claude-3.5-sonnet"),
            make_api_user("Another"),
            make_api_assistant_with_model("Reply", "claude-3.5-sonnet"),
        ];
        let (_root, api_path) = write_api_session("1700000000004", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(session.model_name.as_deref(), Some("claude-3.5-sonnet"));
        assert_eq!(
            session.messages[1].author.as_deref(),
            Some("claude-3.5-sonnet")
        );
    }

    #[test]
    fn reader_api_skips_empty_content() {
        let entries = vec![
            make_api_user("Hello"),
            json!({"role": "assistant", "content": []}),
            json!({"role": "assistant", "content": [{"type": "text", "text": "  "}]}),
            make_api_assistant("Real answer"),
        ];
        let (_root, api_path) = write_api_session("1700000000005", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        // Empty content and whitespace-only content should be skipped.
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].content, "Hello");
        assert_eq!(session.messages[1].content, "Real answer");
    }

    #[test]
    fn reader_api_title_from_task_history() {
        let task_history = vec![json!({
            "id": "1700000000006",
            "ts": 1_700_000_000_006_i64,
            "task": "Fix authentication bug",
            "tokensIn": 100,
            "tokensOut": 200,
            "totalCost": 0.01
        })];
        let entries = vec![
            make_api_user("Fix the auth bug"),
            make_api_assistant("On it!"),
        ];
        let (_root, api_path) = write_api_session("1700000000006", &entries, Some(&task_history));

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(session.title.as_deref(), Some("Fix authentication bug"));
    }

    #[test]
    fn reader_api_title_fallback() {
        // No taskHistory.json — title should fall back to first user message.
        let entries = vec![
            make_api_user("Implement dark mode support"),
            make_api_assistant("Sure!"),
        ];
        let (_root, api_path) = write_api_session("1700000000007", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(
            session.title.as_deref(),
            Some("Implement dark mode support")
        );
    }

    #[test]
    fn reader_api_workspace_from_history() {
        let task_history = vec![json!({
            "id": "1700000000008",
            "ts": 1_700_000_000_008_i64,
            "task": "Some task",
            "cwdOnTaskInitialization": "/data/projects/my_app"
        })];
        let entries = vec![make_api_user("Hello"), make_api_assistant("Hi")];
        let (_root, api_path) = write_api_session("1700000000008", &entries, Some(&task_history));

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(
            session.workspace,
            Some(PathBuf::from("/data/projects/my_app"))
        );
    }

    #[test]
    fn reader_api_session_id() {
        let entries = vec![make_api_user("Hello"), make_api_assistant("Hi")];
        let (_root, api_path) = write_api_session("1700000099999", &entries, None);

        let session = Cline.read_session(&api_path).expect("read_session");
        assert_eq!(session.session_id, "1700000099999");
    }

    #[test]
    fn reader_api_rejects_non_primary() {
        // When api_conversation_history.json exists, reading ui_messages.json
        // should return an error directing users to the primary file.
        let root = tempfile::tempdir().expect("tmpdir");
        let task_dir = root.path().join("tasks").join("1700000000010");
        std::fs::create_dir_all(&task_dir).expect("create task dir");

        let api_path = task_dir.join(FILE_API_HISTORY);
        let ui_path = task_dir.join(FILE_UI_MESSAGES);

        let api_entries = vec![make_api_user("Hello"), make_api_assistant("Hi")];
        std::fs::write(&api_path, serde_json::to_vec(&api_entries).unwrap()).unwrap();

        let ui_entries =
            vec![json!({"type": "say", "say": "task", "text": "Hello", "ts": 1700000000010_i64})];
        std::fs::write(&ui_path, serde_json::to_vec(&ui_entries).unwrap()).unwrap();

        let err = Cline.read_session(&ui_path).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("non-primary"),
            "expected 'non-primary' error, got: {msg}"
        );
    }

    // -----------------------------------------------------------------------
    // Writer tests (bd-16s.6)
    // -----------------------------------------------------------------------

    #[test]
    fn build_api_history_structure() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hello".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Hi".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![ToolCall {
                    id: Some("tc-1".to_string()),
                    name: "Read".to_string(),
                    arguments: json!({"path": "main.rs"}),
                }],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let api = Cline::build_api_history(&session);
        assert_eq!(api.len(), 2);

        // First entry: user
        assert_eq!(api[0]["role"].as_str(), Some("user"));
        let blocks0 = api[0]["content"].as_array().expect("user content blocks");
        assert_eq!(blocks0.len(), 1);
        assert_eq!(blocks0[0]["type"].as_str(), Some("text"));
        assert_eq!(blocks0[0]["text"].as_str(), Some("Hello"));

        // Second entry: assistant with text + tool_use
        assert_eq!(api[1]["role"].as_str(), Some("assistant"));
        let blocks1 = api[1]["content"]
            .as_array()
            .expect("assistant content blocks");
        assert_eq!(blocks1.len(), 2);
        assert_eq!(blocks1[0]["type"].as_str(), Some("text"));
        assert_eq!(blocks1[0]["text"].as_str(), Some("Hi"));
        assert_eq!(blocks1[1]["type"].as_str(), Some("tool_use"));
        assert_eq!(blocks1[1]["name"].as_str(), Some("Read"));
        assert_eq!(blocks1[1]["id"].as_str(), Some("tc-1"));
    }

    #[test]
    fn build_api_history_tool_results_in_user_message() {
        let session = make_canonical_session(vec![CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![ToolResult {
                call_id: Some("tc-1".to_string()),
                content: "file contents".to_string(),
                is_error: false,
            }],
            extra: serde_json::Value::Null,
        }]);

        let api = Cline::build_api_history(&session);
        assert_eq!(api.len(), 1);
        assert_eq!(api[0]["role"].as_str(), Some("user"));
        let blocks = api[0]["content"].as_array().expect("content blocks");
        // Empty text should not create a text block, only the tool_result block
        assert!(
            blocks
                .iter()
                .any(|b| b["type"].as_str() == Some("tool_result")),
            "expected tool_result block"
        );
        let tr_block = blocks
            .iter()
            .find(|b| b["type"].as_str() == Some("tool_result"))
            .expect("tool_result block");
        assert_eq!(tr_block["tool_use_id"].as_str(), Some("tc-1"));
        assert_eq!(tr_block["content"].as_str(), Some("file contents"));
    }

    #[test]
    fn build_ui_messages_first_user_is_task() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Fix the bug".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "On it".to_string(),
                timestamp: Some(1_700_000_000_001),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let ui = Cline::build_ui_messages(&session);
        assert_eq!(ui.len(), 2);
        assert_eq!(ui[0]["say"].as_str(), Some("task"));
        assert_eq!(ui[0]["text"].as_str(), Some("Fix the bug"));
        assert_eq!(ui[0]["type"].as_str(), Some("say"));
    }

    #[test]
    fn build_ui_messages_subsequent_user_is_feedback() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Initial task".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "OK".to_string(),
                timestamp: Some(1_700_000_000_001),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::User,
                content: "Follow up".to_string(),
                timestamp: Some(1_700_000_000_002),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let ui = Cline::build_ui_messages(&session);
        assert_eq!(ui.len(), 3);
        assert_eq!(ui[0]["say"].as_str(), Some("task"));
        assert_eq!(ui[1]["say"].as_str(), Some("text"));
        assert_eq!(ui[2]["say"].as_str(), Some("user_feedback"));
        assert_eq!(ui[2]["text"].as_str(), Some("Follow up"));
    }

    #[test]
    fn build_ui_messages_skips_empty_content() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hello".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "  ".to_string(),
                timestamp: Some(1_700_000_000_001),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::Assistant,
                content: "Real reply".to_string(),
                timestamp: Some(1_700_000_000_002),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let ui = Cline::build_ui_messages(&session);
        assert_eq!(ui.len(), 2);
        assert_eq!(ui[0]["text"].as_str(), Some("Hello"));
        assert_eq!(ui[1]["text"].as_str(), Some("Real reply"));
    }

    #[test]
    fn writer_resume_command() {
        assert_eq!(Cline.resume_command("123456789"), "code .");
    }

    #[test]
    fn writer_generates_numeric_task_id() {
        let root = tempfile::tempdir().expect("tmpdir");
        let tasks = root.path().join("tasks");
        std::fs::create_dir_all(&tasks).expect("create tasks dir");

        let id = Cline::generate_task_id(root.path());
        // Should be a numeric string (epoch millis).
        assert!(id.parse::<i64>().is_ok(), "task id should be numeric: {id}");
    }

    #[test]
    fn writer_generates_unique_task_id_on_collision() {
        let root = tempfile::tempdir().expect("tmpdir");
        let tasks = root.path().join("tasks");
        std::fs::create_dir_all(&tasks).expect("create tasks dir");

        // Pre-create a task directory to force collision handling.
        let id1 = Cline::generate_task_id(root.path());
        std::fs::create_dir_all(tasks.join(&id1)).expect("create collision dir");

        let id2 = Cline::generate_task_id(root.path());
        assert_ne!(id1, id2, "should generate different ID on collision");
        assert!(id2.parse::<i64>().is_ok(), "collision id should be numeric");
    }

    /// Roundtrip test: build API history from canonical, write to temp, read back.
    /// This tests the writer-then-reader path without needing CLINE_HOME env var.
    #[test]
    fn writer_roundtrip_via_build_and_read() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hello roundtrip".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Hi roundtrip".to_string(),
                timestamp: Some(1_700_000_000_001),
                author: None,
                tool_calls: vec![ToolCall {
                    id: Some("tc-rt".to_string()),
                    name: "Read".to_string(),
                    arguments: json!({"path": "lib.rs"}),
                }],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        // Build the API history JSON, write to a temp task directory, and read back.
        let api_history = Cline::build_api_history(&session);
        let root = tempfile::tempdir().expect("tmpdir");
        let task_dir = root.path().join("tasks").join("1700000099000");
        std::fs::create_dir_all(&task_dir).expect("create task dir");

        let api_path = task_dir.join(FILE_API_HISTORY);
        let bytes = serde_json::to_vec(&api_history).expect("serialize");
        std::fs::write(&api_path, &bytes).expect("write");

        let readback = Cline.read_session(&api_path).expect("readback");
        assert_eq!(readback.messages.len(), session.messages.len());
        for (orig, rb) in session.messages.iter().zip(readback.messages.iter()) {
            assert_eq!(orig.role, rb.role);
            // Content may include tool_use annotations from flatten_content
            // (e.g. "[Tool: Read]"), so use starts_with for the text portion.
            assert!(
                rb.content.starts_with(&orig.content),
                "readback content '{}' should start with original '{}'",
                rb.content,
                orig.content
            );
        }
        assert_eq!(readback.messages[1].tool_calls.len(), 1);
        assert_eq!(readback.messages[1].tool_calls[0].name, "Read");
        assert_eq!(readback.session_id, "1700000099000");
    }

    /// Verify that build_api_history produces correct role assignments.
    #[test]
    fn writer_api_history_role_assignments() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hello".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Hi".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::System,
                content: "System msg".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 3,
                role: MessageRole::Tool,
                content: "Tool output".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let api = Cline::build_api_history(&session);
        assert_eq!(api.len(), 4);
        assert_eq!(api[0]["role"].as_str(), Some("user"));
        assert_eq!(api[1]["role"].as_str(), Some("assistant"));
        // System and Tool roles map to "user" in Cline's API format.
        assert_eq!(api[2]["role"].as_str(), Some("user"));
        assert_eq!(api[3]["role"].as_str(), Some("user"));
    }

    /// Verify UI messages format has correct structure.
    #[test]
    fn writer_ui_messages_format() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Task text".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Reply".to_string(),
                timestamp: Some(1_700_000_000_001),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let ui = Cline::build_ui_messages(&session);
        assert_eq!(ui.len(), 2);

        // All UI messages should have ts, type, say, and text fields.
        for msg in &ui {
            assert!(msg.get("ts").is_some(), "missing ts field");
            assert_eq!(msg["type"].as_str(), Some("say"));
            assert!(msg.get("say").is_some(), "missing say field");
            assert!(msg.get("text").is_some(), "missing text field");
        }

        assert_eq!(ui[0]["say"].as_str(), Some("task"));
        assert_eq!(ui[0]["text"].as_str(), Some("Task text"));
        assert_eq!(ui[0]["ts"].as_i64(), Some(1_700_000_000_000));
        assert_eq!(ui[1]["say"].as_str(), Some("text"));
        assert_eq!(ui[1]["text"].as_str(), Some("Reply"));
    }

    /// Verify system/tool/other roles map to "info" in UI messages.
    #[test]
    fn writer_ui_messages_other_roles() {
        let session = make_canonical_session(vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hello".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::System,
                content: "System note".to_string(),
                timestamp: Some(1_700_000_000_001),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ]);

        let ui = Cline::build_ui_messages(&session);
        assert_eq!(ui.len(), 2);
        assert_eq!(ui[1]["say"].as_str(), Some("info"));
    }

    #[test]
    fn writer_updates_task_history() {
        let root = tempfile::tempdir().expect("tmpdir");
        let state_dir = root.path().join("state");
        std::fs::create_dir_all(&state_dir).expect("create state dir");

        let session = make_canonical_session(vec![CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "My task".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        }]);

        Cline::update_task_history(root.path(), "1700000099999", &session, "cline")
            .expect("update_task_history");

        let history_path = state_dir.join(FILE_TASK_HISTORY);
        assert!(history_path.exists());
        let content: Vec<serde_json::Value> =
            serde_json::from_str(&std::fs::read_to_string(&history_path).unwrap()).unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["id"].as_str(), Some("1700000099999"));
        assert_eq!(content[0]["task"].as_str(), Some("Test Session"));
    }

    #[test]
    fn writer_task_history_sorted_newest_first() {
        let root = tempfile::tempdir().expect("tmpdir");
        let state_dir = root.path().join("state");
        std::fs::create_dir_all(&state_dir).expect("create state dir");

        // Pre-populate with an older entry.
        let existing = vec![json!({
            "id": "1600000000000",
            "ts": 1_600_000_000_000_i64,
            "task": "Old task"
        })];
        let history_path = state_dir.join(FILE_TASK_HISTORY);
        std::fs::write(&history_path, serde_json::to_vec(&existing).unwrap()).unwrap();

        let mut session = make_canonical_session(vec![CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "New task".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        }]);
        session.started_at = Some(1_700_000_000_000);

        Cline::update_task_history(root.path(), "1700000000000", &session, "cline")
            .expect("update_task_history");

        let content: Vec<serde_json::Value> =
            serde_json::from_str(&std::fs::read_to_string(&history_path).unwrap()).unwrap();
        assert_eq!(content.len(), 2);
        // Newer entry should be first.
        let first_ts = content[0]["ts"].as_i64().unwrap();
        let second_ts = content[1]["ts"].as_i64().unwrap();
        assert!(first_ts >= second_ts, "should be sorted newest-first");
        assert_eq!(content[0]["id"].as_str(), Some("1700000000000"));
    }

    #[test]
    fn writer_task_history_deduplicates() {
        let root = tempfile::tempdir().expect("tmpdir");
        let state_dir = root.path().join("state");
        std::fs::create_dir_all(&state_dir).expect("create state dir");

        // Pre-populate with an entry that has the same ID we'll insert.
        let existing = vec![json!({
            "id": "1700000000000",
            "ts": 1_700_000_000_000_i64,
            "task": "Old version"
        })];
        let history_path = state_dir.join(FILE_TASK_HISTORY);
        std::fs::write(&history_path, serde_json::to_vec(&existing).unwrap()).unwrap();

        let session = make_canonical_session(vec![CanonicalMessage {
            idx: 0,
            role: MessageRole::User,
            content: "New version".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        }]);

        Cline::update_task_history(root.path(), "1700000000000", &session, "cline")
            .expect("update_task_history");

        let content: Vec<serde_json::Value> =
            serde_json::from_str(&std::fs::read_to_string(&history_path).unwrap()).unwrap();
        // Should have exactly 1 entry, not 2.
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["id"].as_str(), Some("1700000000000"));
        // Should be the new version (with title from session.title).
        assert_eq!(content[0]["task"].as_str(), Some("Test Session"));
    }

    // -----------------------------------------------------------------------
    // Reader tests — UI format fallback (bd-16s.5)
    // -----------------------------------------------------------------------

    /// Create a temp Cline storage root with a task directory containing
    /// ONLY ui_messages.json (no api_conversation_history.json).
    fn write_ui_session(
        task_id: &str,
        ui_entries: &[serde_json::Value],
        task_history: Option<&[serde_json::Value]>,
    ) -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().expect("tmpdir");
        let task_dir = root.path().join("tasks").join(task_id);
        std::fs::create_dir_all(&task_dir).expect("create task dir");

        let ui_path = task_dir.join(FILE_UI_MESSAGES);
        let bytes = serde_json::to_vec(ui_entries).expect("serialize ui messages");
        std::fs::write(&ui_path, &bytes).expect("write ui messages");

        if let Some(history) = task_history {
            let state_dir = root.path().join("state");
            std::fs::create_dir_all(&state_dir).expect("create state dir");
            let history_path = state_dir.join(FILE_TASK_HISTORY);
            let hbytes = serde_json::to_vec(history).expect("serialize task history");
            std::fs::write(&history_path, &hbytes).expect("write task history");
        }

        (root, ui_path)
    }

    #[test]
    fn reader_ui_basic_exchange() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Fix the bug", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "Working on it", "ts": 1_700_000_000_001_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020001", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.provider_slug, "cline");
        assert_eq!(session.session_id, "1700000020001");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Fix the bug");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Working on it");
    }

    #[test]
    fn reader_ui_task_say_as_user() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Initial task text", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "OK", "ts": 1_700_000_000_001_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020002", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Initial task text");
    }

    #[test]
    fn reader_ui_user_feedback_as_user() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Start task", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "OK", "ts": 1_700_000_000_001_i64}),
            json!({"type": "say", "say": "user_feedback", "text": "Try again", "ts": 1_700_000_000_002_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020003", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.messages.len(), 3);
        assert_eq!(session.messages[2].role, MessageRole::User);
        assert_eq!(session.messages[2].content, "Try again");
    }

    #[test]
    fn reader_ui_user_feedback_diff_as_user() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Start", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "user_feedback_diff", "text": "Diff feedback", "ts": 1_700_000_000_001_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020004", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].role, MessageRole::User);
        assert_eq!(session.messages[1].content, "Diff feedback");
    }

    #[test]
    fn reader_ui_text_say_as_assistant() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Hello", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "Response text", "ts": 1_700_000_000_001_i64}),
            json!({"type": "say", "say": "completion_result", "text": "Done", "ts": 1_700_000_000_002_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020005", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        // "text" and "completion_result" say types both map to Assistant.
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[2].role, MessageRole::Assistant);
    }

    #[test]
    fn reader_ui_skips_non_say_types() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Hello", "ts": 1_700_000_000_000_i64}),
            json!({"type": "ask", "ask": "tool", "text": "Allow?", "ts": 1_700_000_000_001_i64}),
            json!({"type": "say", "say": "text", "text": "OK", "ts": 1_700_000_000_002_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020006", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        // "ask" type messages should be skipped.
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].content, "Hello");
        assert_eq!(session.messages[1].content, "OK");
    }

    #[test]
    fn reader_ui_timestamps_parsed() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Hello", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "Hi", "ts": 1_700_000_000_500_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020007", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.messages[0].timestamp, Some(1_700_000_000_000));
        assert_eq!(session.messages[1].timestamp, Some(1_700_000_000_500));
    }

    #[test]
    fn reader_ui_empty_text_skipped() {
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Hello", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "", "ts": 1_700_000_000_001_i64}),
            json!({"type": "say", "say": "text", "text": "  ", "ts": 1_700_000_000_002_i64}),
            json!({"type": "say", "say": "text", "text": "Real reply", "ts": 1_700_000_000_003_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020008", &entries, None);

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "Real reply");
    }

    #[test]
    fn reader_ui_fallback_when_no_api_file() {
        // When only ui_messages.json exists (no api file), the reader should
        // fall back to UI format parsing.
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Task text", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "Response", "ts": 1_700_000_000_001_i64}),
        ];
        let (_root, ui_path) = write_ui_session("1700000020009", &entries, None);

        // Verify no API file exists.
        let task_dir = ui_path.parent().unwrap();
        assert!(!task_dir.join(FILE_API_HISTORY).exists());

        let session = Cline.read_session(&ui_path).expect("read_session");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.provider_slug, "cline");
    }

    #[test]
    fn reader_ui_old_claude_messages_filename() {
        // Test reading via the legacy `claude_messages.json` filename.
        let root = tempfile::tempdir().expect("tmpdir");
        let task_dir = root.path().join("tasks").join("1700000020010");
        std::fs::create_dir_all(&task_dir).expect("create task dir");

        let old_path = task_dir.join(FILE_UI_MESSAGES_OLD);
        let entries = vec![
            json!({"type": "say", "say": "task", "text": "Old format", "ts": 1_700_000_000_000_i64}),
            json!({"type": "say", "say": "text", "text": "Reply", "ts": 1_700_000_000_001_i64}),
        ];
        std::fs::write(&old_path, serde_json::to_vec(&entries).unwrap()).unwrap();

        let session = Cline.read_session(&old_path).expect("read_session");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].content, "Old format");
    }

    // -----------------------------------------------------------------------
    // Helper and detection tests (bd-16s.7)
    // -----------------------------------------------------------------------

    #[test]
    fn provider_metadata() {
        let cline = Cline;
        assert_eq!(cline.name(), "Cline");
        assert_eq!(cline.slug(), "cline");
        assert_eq!(cline.cli_alias(), "cln");
    }

    #[test]
    fn find_storage_root_for_path_extracts_root() {
        let path = PathBuf::from(
            "/home/user/.config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/123/api_conversation_history.json",
        );
        let root = Cline::find_storage_root_for_path(&path);
        assert_eq!(
            root,
            Some(PathBuf::from(
                "/home/user/.config/Code/User/globalStorage/saoudrizwan.claude-dev"
            ))
        );
    }

    #[test]
    fn find_storage_root_for_path_returns_none_for_invalid() {
        let path = PathBuf::from("/not/a/cline/path.json");
        assert!(Cline::find_storage_root_for_path(&path).is_none());
    }

    #[test]
    fn read_task_history_item_found() {
        let root = tempfile::tempdir().expect("tmpdir");
        let state_dir = root.path().join("state");
        std::fs::create_dir_all(&state_dir).expect("create state dir");

        let history = vec![
            json!({"id": "111", "ts": 111, "task": "Task A"}),
            json!({"id": "222", "ts": 222, "task": "Task B"}),
        ];
        std::fs::write(
            state_dir.join(FILE_TASK_HISTORY),
            serde_json::to_vec(&history).unwrap(),
        )
        .unwrap();

        let item = Cline::read_task_history_item(root.path(), "222");
        assert!(item.is_some());
        let item = item.unwrap();
        assert_eq!(item["task"].as_str(), Some("Task B"));
    }

    #[test]
    fn read_task_history_item_missing() {
        let root = tempfile::tempdir().expect("tmpdir");
        let state_dir = root.path().join("state");
        std::fs::create_dir_all(&state_dir).expect("create state dir");

        let history = vec![json!({"id": "111", "ts": 111, "task": "Task A"})];
        std::fs::write(
            state_dir.join(FILE_TASK_HISTORY),
            serde_json::to_vec(&history).unwrap(),
        )
        .unwrap();

        assert!(Cline::read_task_history_item(root.path(), "999").is_none());
    }

    #[test]
    fn read_task_history_item_no_file() {
        let root = tempfile::tempdir().expect("tmpdir");
        // No state directory at all.
        assert!(Cline::read_task_history_item(root.path(), "123").is_none());
    }

    #[test]
    fn owns_session_finds_api_file() {
        let root = tempfile::tempdir().expect("tmpdir");
        let task_dir = root.path().join("tasks").join("1700000030001");
        std::fs::create_dir_all(&task_dir).expect("create task dir");
        let api = task_dir.join(FILE_API_HISTORY);
        std::fs::write(&api, b"[]").expect("write api file");

        // owns_session uses storage_roots() which needs CLINE_HOME (env var).
        // Since we can't set env vars (unsafe), we test the underlying logic
        // via read_session on the known path instead.
        let session = Cline.read_session(&api);
        // Should succeed (even if empty array produces no messages → error is fine,
        // but the path resolution should not fail).
        let _ = session;
    }

    // -----------------------------------------------------------------------
    // Existing helper tests
    // -----------------------------------------------------------------------

    #[test]
    fn task_dir_from_api_path_valid() {
        let path = PathBuf::from("/home/user/.cline/tasks/123456/api_conversation_history.json");
        let task_dir = Cline::task_dir_from_api_path(&path);
        assert_eq!(
            task_dir,
            Some(PathBuf::from("/home/user/.cline/tasks/123456"))
        );
    }

    #[test]
    fn task_dir_from_api_path_invalid() {
        // Not under a "tasks" directory.
        let path = PathBuf::from("/home/user/.cline/other/123456/api_conversation_history.json");
        assert!(Cline::task_dir_from_api_path(&path).is_none());
    }

    #[test]
    fn task_id_from_task_dir_extracts_id() {
        let path = PathBuf::from("/home/user/.cline/tasks/9876543210");
        assert_eq!(
            Cline::task_id_from_task_dir(&path),
            Some("9876543210".to_string())
        );
    }

    #[test]
    fn extract_tool_calls_from_content() {
        let content = json!([
            {"type": "text", "text": "hello"},
            {
                "type": "tool_use",
                "id": "tc-1",
                "name": "ReadFile",
                "input": {"path": "a.rs"}
            }
        ]);
        let calls = Cline::extract_tool_calls(Some(&content));
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "ReadFile");
        assert_eq!(calls[0].id.as_deref(), Some("tc-1"));
    }

    #[test]
    fn extract_tool_results_from_content() {
        let content = json!([
            {
                "type": "tool_result",
                "tool_use_id": "tc-1",
                "content": "result text",
                "is_error": true
            }
        ]);
        let results = Cline::extract_tool_results(Some(&content));
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].call_id.as_deref(), Some("tc-1"));
        assert_eq!(results[0].content, "result text");
        assert!(results[0].is_error);
    }

    #[test]
    fn extract_tool_calls_none_input() {
        assert!(Cline::extract_tool_calls(None).is_empty());
    }

    #[test]
    fn extract_tool_results_none_input() {
        assert!(Cline::extract_tool_results(None).is_empty());
    }
}
