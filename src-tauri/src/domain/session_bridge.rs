use crate::types::{SessionEntry, SessionInfo};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub use crate::domain::casr_min::adapters::{
    canonical_to_session_entries, canonical_to_session_info,
};
use crate::domain::casr_min::bridge_ops;
pub use crate::domain::casr_min::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult,
};
use crate::domain::casr_min::providers::ProviderKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionBridgeSource {
    Pi,
    ClaudeCode,
    Codex,
    OpenCode,
    Gemini,
    Factory,
    ClawdBot,
}

impl SessionBridgeSource {
    pub const ALL: [Self; 7] = [
        Self::Pi,
        Self::ClaudeCode,
        Self::Codex,
        Self::OpenCode,
        Self::Gemini,
        Self::Factory,
        Self::ClawdBot,
    ];

    pub fn slug(self) -> &'static str {
        ProviderKind::from(self).slug()
    }

    pub fn display_name(self) -> &'static str {
        ProviderKind::from(self).display_name()
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        ProviderKind::from(self).session_roots()
    }

    pub fn matches_path(self, path: &Path) -> bool {
        ProviderKind::from(self).matches_path(path)
    }

    pub fn parse_alias(value: &str) -> Result<Self, String> {
        ProviderKind::parse_alias(value).map(Into::into)
    }
}

impl From<SessionBridgeSource> for ProviderKind {
    fn from(value: SessionBridgeSource) -> Self {
        match value {
            SessionBridgeSource::Pi => ProviderKind::Pi,
            SessionBridgeSource::ClaudeCode => ProviderKind::ClaudeCode,
            SessionBridgeSource::Codex => ProviderKind::Codex,
            SessionBridgeSource::OpenCode => ProviderKind::OpenCode,
            SessionBridgeSource::Gemini => ProviderKind::Gemini,
            SessionBridgeSource::Factory => ProviderKind::Factory,
            SessionBridgeSource::ClawdBot => ProviderKind::ClawdBot,
        }
    }
}

impl From<ProviderKind> for SessionBridgeSource {
    fn from(value: ProviderKind) -> Self {
        match value {
            ProviderKind::Pi => SessionBridgeSource::Pi,
            ProviderKind::ClaudeCode => SessionBridgeSource::ClaudeCode,
            ProviderKind::Codex => SessionBridgeSource::Codex,
            ProviderKind::OpenCode => SessionBridgeSource::OpenCode,
            ProviderKind::Gemini => SessionBridgeSource::Gemini,
            ProviderKind::Factory => SessionBridgeSource::Factory,
            ProviderKind::ClawdBot => SessionBridgeSource::ClawdBot,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "snake_case")]
pub struct SessionBridgeConvertOptions {
    pub dry_run: bool,
    pub force: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionBridgeConvertResult {
    pub source_provider: String,
    pub target_provider: String,
    pub source_session_id: String,
    pub target_session_id: String,
    pub written_paths: Vec<String>,
    pub resume_command: String,
    pub dry_run: bool,
    pub warnings: Vec<String>,
}

pub fn default_session_dirs() -> Vec<PathBuf> {
    bridge_ops::default_session_dirs(true)
}

pub fn read_canonical_session_from_path(
    path: &Path,
) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    bridge_ops::read_canonical_session_from_path(path).map(map_read_result)
}

pub fn read_canonical_session_from_str(
    content: &str,
    path_hint: Option<&Path>,
) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    bridge_ops::read_canonical_session_from_str(content, path_hint).map(map_read_result)
}

pub fn parse_session_info_from_path(
    path: &Path,
) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    bridge_ops::parse_session_info_from_path(path)
}

pub fn parse_session_entries_from_path(path: &Path) -> Result<Vec<SessionEntry>, String> {
    bridge_ops::parse_session_entries_from_path(path)
}

pub fn preview_session_format(path: &Path, target: SessionBridgeSource) -> Result<String, String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    bridge_ops::preview_session_format(&canonical, target.into())
}

pub fn preview_session_for_viewer(path: &Path) -> Result<String, String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    bridge_ops::preview_session_for_viewer(&canonical)
}

pub fn convert_session_format(
    path: &Path,
    target: SessionBridgeSource,
    options: SessionBridgeConvertOptions,
) -> Result<SessionBridgeConvertResult, String> {
    let (source, canonical) = read_canonical_session_from_path(path)?;
    let outcome = bridge_ops::convert_canonical_session(
        source.into(),
        &canonical,
        target.into(),
        options.dry_run,
        options.force,
    )?;

    Ok(SessionBridgeConvertResult {
        source_provider: source.display_name().to_string(),
        target_provider: target.display_name().to_string(),
        source_session_id: canonical.session_id.clone(),
        target_session_id: outcome.target_session_id,
        written_paths: outcome
            .written_paths
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        resume_command: outcome.resume_command,
        dry_run: outcome.dry_run,
        warnings: outcome.warnings,
    })
}

fn map_read_result(
    (provider, canonical): (ProviderKind, CanonicalSession),
) -> (SessionBridgeSource, CanonicalSession) {
    (provider.into(), canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn parses_codex_top_level_array_and_previews_as_pi() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("codex-array.json");
        let content = serde_json::json!([
            {
                "type": "session_meta",
                "timestamp": "2026-04-08T10:00:00.000Z",
                "payload": { "id": "codex-array-1", "cwd": "/repo/demo" }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:01.000Z",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{ "type": "input_text", "text": "Fix auth" }]
                }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:02.000Z",
                "payload": {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "read_file",
                    "arguments": { "path": "src/auth.ts" }
                }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:03.000Z",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call_1",
                    "output": "file contents"
                }
            }
        ]);
        std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).expect("write");

        let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
        assert_eq!(source, SessionBridgeSource::Codex);
        assert_eq!(canonical.session_id, "codex-array-1");
        assert!(canonical.messages.len() >= 3);

        let pi_preview = preview_session_format(&path, SessionBridgeSource::Pi).expect("preview");
        let entries = pi_preview
            .lines()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();
        assert!(!entries.is_empty());
        assert_eq!(entries[0]["parentId"], Value::Null);
        for pair in entries.windows(2) {
            assert_eq!(pair[1]["parentId"], pair[0]["id"]);
        }
    }

    #[test]
    fn codex_mixed_event_array_discards_bootstrap_and_keeps_conversation_chain() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("codex-mixed.json");
        let content = serde_json::json!([
            {
                "type": "session_meta",
                "timestamp": "2026-04-08T10:00:00.000Z",
                "payload": { "id": "codex-mixed-1", "cwd": "/repo/demo" }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:00.100Z",
                "payload": {
                    "type": "message",
                    "role": "developer",
                    "content": [{ "type": "input_text", "text": "system bootstrap" }]
                }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:01.000Z",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{ "type": "input_text", "text": "Fix auth" }]
                }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:02.000Z",
                "payload": {
                    "type": "reasoning",
                    "content": [{ "type": "output_text", "text": "Need to inspect auth flow" }]
                }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:03.000Z",
                "payload": {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "read_file",
                    "arguments": { "path": "src/auth.ts" }
                }
            },
            {
                "type": "response_item",
                "timestamp": "2026-04-08T10:00:04.000Z",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "call_1",
                    "output": "file contents"
                }
            }
        ]);
        std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).expect("write");

        let preview = preview_session_for_viewer(&path).expect("preview");
        let lines = preview.lines().collect::<Vec<_>>();
        assert!(
            lines.len() >= 4,
            "expected header + at least 3 viewer lines"
        );

        let entries = lines
            .iter()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();

        let roles = entries
            .iter()
            .map(|entry| {
                entry["message"]["role"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string()
            })
            .collect::<Vec<_>>();

        assert_eq!(roles.first().map(String::as_str), Some("user"));
        assert!(
            roles
                .iter()
                .filter(|role| role.as_str() == "toolResult")
                .count()
                >= 1,
            "expected at least one toolResult node"
        );
        for pair in entries.windows(2) {
            assert_eq!(pair[1]["parentId"], pair[0]["id"]);
        }
    }

    #[test]
    fn claude_tool_result_chain_survives_pi_preview() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("claude-mixed.jsonl");
        let lines = [
            serde_json::json!({
                "type": "user",
                "uuid": "u1",
                "sessionId": "claude-test-1",
                "cwd": "/repo/demo",
                "timestamp": "2026-04-08T10:00:01.000Z",
                "message": { "role": "user", "content": "Fix auth" }
            }),
            serde_json::json!({
                "type": "assistant",
                "uuid": "a1",
                "sessionId": "claude-test-1",
                "cwd": "/repo/demo",
                "timestamp": "2026-04-08T10:00:02.000Z",
                "message": {
                    "role": "assistant",
                    "model": "claude-opus-4-6",
                    "content": [{ "type": "thinking", "thinking": "Need to inspect auth flow" }]
                }
            }),
            serde_json::json!({
                "type": "assistant",
                "uuid": "a2",
                "sessionId": "claude-test-1",
                "cwd": "/repo/demo",
                "timestamp": "2026-04-08T10:00:03.000Z",
                "message": {
                    "role": "assistant",
                    "model": "claude-opus-4-6",
                    "content": [{ "type": "tool_use", "id": "toolu_1", "name": "Read", "input": { "file_path": "src/auth.ts" } }]
                }
            }),
            serde_json::json!({
                "type": "user",
                "uuid": "u2",
                "sessionId": "claude-test-1",
                "cwd": "/repo/demo",
                "timestamp": "2026-04-08T10:00:04.000Z",
                "message": {
                    "role": "user",
                    "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": "file contents", "is_error": false }]
                }
            }),
        ]
        .iter()
        .map(|value| serde_json::to_string(value).unwrap())
        .collect::<Vec<_>>()
        .join("\n");
        std::fs::write(&path, lines).expect("write");

        let preview = preview_session_for_viewer(&path).expect("preview");
        let entries = preview
            .lines()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();

        let roles = entries
            .iter()
            .map(|entry| entry["message"]["role"].as_str().unwrap_or("unknown"))
            .collect::<Vec<_>>();
        assert!(roles.contains(&"user"));
        assert!(roles.contains(&"assistant"));
        assert!(roles.contains(&"toolResult"));
        for pair in entries.windows(2) {
            assert_eq!(pair[1]["parentId"], pair[0]["id"]);
        }
    }

    #[test]
    fn canonical_entries_form_single_chain_for_viewer() {
        let canonical = CanonicalSession {
            session_id: "test-session".to_string(),
            provider_slug: "codex".to_string(),
            workspace: Some(PathBuf::from("/repo/demo")),
            title: Some("Fix auth".to_string()),
            started_at: None,
            ended_at: None,
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Fix auth".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: Value::Null,
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "Looking".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: vec![ToolCall {
                        id: Some("call_1".to_string()),
                        name: "read_file".to_string(),
                        arguments: serde_json::json!({"path":"src/auth.ts"}),
                    }],
                    tool_results: vec![],
                    extra: Value::Null,
                },
                CanonicalMessage {
                    idx: 2,
                    role: MessageRole::Tool,
                    content: "file contents".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![ToolResult {
                        call_id: Some("call_1".to_string()),
                        content: "file contents".to_string(),
                        is_error: false,
                    }],
                    extra: Value::Null,
                },
            ],
            metadata: Value::Null,
            source_path: PathBuf::from("/tmp/test.json"),
            model_name: None,
        };

        let entries = canonical_to_session_entries(&canonical);
        assert_eq!(entries.len(), 3);
        assert!(entries[0].parent_id.is_none());
        assert_eq!(
            entries[1].parent_id.as_deref(),
            Some(entries[0].id.as_str())
        );
        assert_eq!(
            entries[2].parent_id.as_deref(),
            Some(entries[1].id.as_str())
        );
    }

    #[test]
    fn opencode_virtual_session_path_previews_as_pi() {
        let temp = tempfile::tempdir().expect("tempdir");
        let canonical = CanonicalSession {
            session_id: "seed-opencode".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(temp.path().to_path_buf()),
            title: Some("Set up CI".to_string()),
            started_at: Some(1_701_388_800_000),
            ended_at: Some(1_701_388_810_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Help me set up CI".to_string(),
                    timestamp: Some(1_701_388_800_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: Value::Null,
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "I'll create the workflow.".to_string(),
                    timestamp: Some(1_701_388_803_000),
                    author: Some("gpt-5.4".to_string()),
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: Value::Null,
                },
            ],
            metadata: Value::Null,
            source_path: temp.path().join("seed.jsonl"),
            model_name: Some("gpt-5.4".to_string()),
        };

        let written_path = crate::domain::casr_min::providers::opencode::write_session(
            &canonical,
            "opc-session-001",
        )
        .expect("write opencode");

        let (source, parsed) = read_canonical_session_from_path(&written_path).expect("read");
        assert_eq!(source, SessionBridgeSource::OpenCode);
        assert_eq!(parsed.provider_slug, "opencode");
        assert_eq!(parsed.messages.len(), 2);

        let preview = preview_session_for_viewer(&written_path).expect("preview");
        let entries = preview
            .lines()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();

        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries[0]["message"]["role"],
            Value::String("user".to_string())
        );
        assert_eq!(entries[1]["parentId"], entries[0]["id"]);
    }

    #[test]
    fn gemini_pretty_json_previews_as_pi() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp
            .path()
            .join(".gemini")
            .join("tmp")
            .join("hash")
            .join("chats");
        std::fs::create_dir_all(&root).expect("mkdir");
        let path = root.join("session-gmi-role-001.json");
        let content = serde_json::json!({
            "sessionId": "gmi-role-001",
            "startTime": "2026-01-17T09:00:00.000Z",
            "lastUpdated": "2026-01-17T09:03:00.000Z",
            "messages": [
                { "type": "user", "content": "Help me debug this segfault", "timestamp": "2026-01-17T09:00:00.000Z" },
                { "type": "gemini", "content": "Check the backtrace first.", "timestamp": "2026-01-17T09:01:00.000Z" }
            ]
        });
        std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).expect("write");

        let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
        assert_eq!(source, SessionBridgeSource::Gemini);
        assert_eq!(canonical.messages.len(), 2);

        let preview = preview_session_for_viewer(&path).expect("preview");
        let entries = preview
            .lines()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1]["parentId"], entries[0]["id"]);
    }

    #[test]
    fn factory_jsonl_previews_as_pi() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp
            .path()
            .join(".factory")
            .join("sessions")
            .join("-home-user-webapp");
        std::fs::create_dir_all(&root).expect("mkdir");
        let path = root.join("factory-sess-001.jsonl");
        let content = [
            serde_json::json!({"type":"session_start","id":"factory-sess-001","title":"Refactor auth","cwd":"/home/user/webapp"}),
            serde_json::json!({"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Refactor auth module"}}),
            serde_json::json!({"type":"message","timestamp":"2025-12-01T10:00:08Z","message":{"role":"assistant","content":"Start with JWT token generation.","model":"claude-opus"}}),
        ]
        .iter()
        .map(|value| serde_json::to_string(value).unwrap())
        .collect::<Vec<_>>()
        .join("\n");
        std::fs::write(&path, content).expect("write");

        let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
        assert_eq!(source, SessionBridgeSource::Factory);
        assert_eq!(canonical.messages.len(), 2);

        let preview = preview_session_for_viewer(&path).expect("preview");
        let entries = preview
            .lines()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1]["parentId"], entries[0]["id"]);
    }

    #[test]
    fn clawdbot_jsonl_previews_as_pi() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join(".clawdbot").join("sessions");
        std::fs::create_dir_all(&root).expect("mkdir");
        let path = root.join("clawdbot-simple.jsonl");
        let content = [
            serde_json::json!({"role":"user","content":"How does async work in Rust?","timestamp":"2025-01-27T03:30:00.000Z"}),
            serde_json::json!({"role":"assistant","content":"Async uses futures and executors.","timestamp":"2025-01-27T03:30:05.000Z"}),
        ]
        .iter()
        .map(|value| serde_json::to_string(value).unwrap())
        .collect::<Vec<_>>()
        .join("\n");
        std::fs::write(&path, content).expect("write");

        let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
        assert_eq!(source, SessionBridgeSource::ClawdBot);
        assert_eq!(canonical.messages.len(), 2);

        let preview = preview_session_for_viewer(&path).expect("preview");
        let entries = preview
            .lines()
            .skip(1)
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect::<Vec<_>>();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1]["parentId"], entries[0]["id"]);
    }
}
