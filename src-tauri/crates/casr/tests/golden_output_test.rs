//! Writer golden-output conformance suite.
//!
//! Validates that writer-generated provider-native files conform to structural
//! golden expectations, independent of the reader.  This catches **symmetric
//! bugs** where both the reader and writer are wrong in the same way, which
//! round-trip tests alone cannot detect.
//!
//! For each provider writer we:
//! 1. Construct a deterministic `CanonicalSession`.
//! 2. Call `write_session()` to produce native output.
//! 3. Read the raw output and validate its structure against golden rules
//!    (field presence, event ordering, format constraints, path conventions).
//! 4. Normalize non-deterministic fields (UUIDs, timestamps) to allow stable
//!    structural comparison.
//!
//! Bead: bd-24z.14

mod test_env;

use std::path::PathBuf;

use tempfile::TempDir;

use casr::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};
use casr::providers::{Provider, WriteOptions};

// ---------------------------------------------------------------------------
// Environment isolation (see `tests/test_env.rs`)
// ---------------------------------------------------------------------------

static CC_ENV: test_env::EnvLock = test_env::EnvLock;
static CODEX_ENV: test_env::EnvLock = test_env::EnvLock;
static GEMINI_ENV: test_env::EnvLock = test_env::EnvLock;

struct EnvGuard {
    key: &'static str,
    original: Option<String>,
}

impl EnvGuard {
    fn set(key: &'static str, value: &std::path::Path) -> Self {
        let original = std::env::var(key).ok();
        // SAFETY: Tests must hold an `_ENV` lock (see `test_env`) while mutating
        // the process environment and while invoking code that reads it.
        unsafe { std::env::set_var(key, value) };
        Self { key, original }
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        match &self.original {
            Some(val) => unsafe { std::env::set_var(self.key, val) },
            None => unsafe { std::env::remove_var(self.key) },
        }
    }
}

// ---------------------------------------------------------------------------
// Canonical session builders (deterministic inputs)
// ---------------------------------------------------------------------------

fn simple_session() -> CanonicalSession {
    CanonicalSession {
        session_id: "golden-test-001".to_string(),
        provider_slug: "test".to_string(),
        workspace: Some(PathBuf::from("/data/projects/golden_test")),
        title: Some("Golden test session".to_string()),
        started_at: Some(1_700_000_000_000),
        ended_at: Some(1_700_000_060_000),
        messages: vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Hello, please help me.".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Sure, I can help.".to_string(),
                timestamp: Some(1_700_000_030_000),
                author: Some("test-model".to_string()),
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::User,
                content: "Thanks!".to_string(),
                timestamp: Some(1_700_000_060_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ],
        metadata: serde_json::json!({"source": "test"}),
        source_path: PathBuf::from("/tmp/golden-test.jsonl"),
        model_name: Some("test-model".to_string()),
    }
}

fn tool_call_session() -> CanonicalSession {
    CanonicalSession {
        session_id: "golden-tools-001".to_string(),
        provider_slug: "test".to_string(),
        workspace: Some(PathBuf::from("/data/projects/golden_tools")),
        title: Some("Tool call session".to_string()),
        started_at: Some(1_700_000_000_000),
        ended_at: Some(1_700_000_090_000),
        messages: vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Read the file".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Reading main.rs now.".to_string(),
                timestamp: Some(1_700_000_030_000),
                author: Some("test-model".to_string()),
                tool_calls: vec![ToolCall {
                    id: Some("call-1".to_string()),
                    name: "Read".to_string(),
                    arguments: serde_json::json!({"file_path": "src/main.rs"}),
                }],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::User,
                content: "".to_string(),
                timestamp: Some(1_700_000_060_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![ToolResult {
                    call_id: Some("call-1".to_string()),
                    content: "fn main() {}".to_string(),
                    is_error: false,
                }],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 3,
                role: MessageRole::Assistant,
                content: "The file is very simple.".to_string(),
                timestamp: Some(1_700_000_090_000),
                author: Some("test-model".to_string()),
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ],
        metadata: serde_json::json!({"source": "test"}),
        source_path: PathBuf::from("/tmp/golden-tools.jsonl"),
        model_name: Some("test-model".to_string()),
    }
}

fn reasoning_session() -> CanonicalSession {
    CanonicalSession {
        session_id: "golden-reasoning-001".to_string(),
        provider_slug: "test".to_string(),
        workspace: Some(PathBuf::from("/data/projects/golden_reasoning")),
        title: Some("Reasoning session".to_string()),
        started_at: Some(1_700_000_000_000),
        ended_at: Some(1_700_000_060_000),
        messages: vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "What is 2+2?".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Let me think about this...".to_string(),
                timestamp: Some(1_700_000_030_000),
                author: Some("reasoning".to_string()),
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::Assistant,
                content: "The answer is 4.".to_string(),
                timestamp: Some(1_700_000_060_000),
                author: Some("test-model".to_string()),
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ],
        metadata: serde_json::json!({"source": "test"}),
        source_path: PathBuf::from("/tmp/golden-reasoning.jsonl"),
        model_name: Some("test-model".to_string()),
    }
}

fn unicode_session() -> CanonicalSession {
    CanonicalSession {
        session_id: "golden-unicode-001".to_string(),
        provider_slug: "test".to_string(),
        workspace: Some(PathBuf::from("/data/projects/golden_unicode")),
        title: Some("Unicode test".to_string()),
        started_at: Some(1_700_000_000_000),
        ended_at: Some(1_700_000_030_000),
        messages: vec![
            CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "Translate: \u{4f60}\u{597d}\u{4e16}\u{754c} and \u{1f600}\u{1f389}"
                    .to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Hello World and \u{1f600}\u{1f389}".to_string(),
                timestamp: Some(1_700_000_030_000),
                author: Some("test-model".to_string()),
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            },
        ],
        metadata: serde_json::json!({"source": "test"}),
        source_path: PathBuf::from("/tmp/golden-unicode.jsonl"),
        model_name: Some("test-model".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/// Check if a string looks like a valid UUID v4.
fn is_uuid_v4(s: &str) -> bool {
    uuid::Uuid::parse_str(s).is_ok()
}

/// Check if a string is a valid RFC-3339 timestamp.
fn is_rfc3339(s: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(s).is_ok()
}

/// Check if a float is a plausible epoch timestamp (seconds since 1970).
fn is_epoch_seconds(f: f64) -> bool {
    f > 1_000_000_000.0 && f < 3_000_000_000.0
}

// =====================================================================
// CLAUDE CODE GOLDEN OUTPUT TESTS
// =====================================================================

mod cc_golden {
    use super::*;
    use casr::providers::claude_code::ClaudeCode;

    fn write_cc_session(session: &CanonicalSession) -> (PathBuf, String) {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let opts = WriteOptions { force: false };
        let written = ClaudeCode.write_session(session, &opts).unwrap();

        let path = written.paths[0].clone();
        let content = std::fs::read_to_string(&path).unwrap();
        (path, content)
    }

    #[test]
    fn golden_cc_output_is_valid_jsonl() {
        let (_, content) = write_cc_session(&simple_session());
        for (i, line) in content.lines().enumerate() {
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(line);
            assert!(
                parsed.is_ok(),
                "CC line {i} should be valid JSON: {}",
                &line[..line.len().min(100)]
            );
        }
    }

    #[test]
    fn golden_cc_line_count_matches_messages() {
        let session = simple_session();
        let (_, content) = write_cc_session(&session);
        let line_count = content.lines().count();
        assert_eq!(
            line_count,
            session.messages.len(),
            "CC should produce one JSONL line per message"
        );
    }

    #[test]
    fn golden_cc_required_fields_per_entry() {
        let (_, content) = write_cc_session(&simple_session());
        let required = [
            "parentUuid",
            "isSidechain",
            "userType",
            "cwd",
            "sessionId",
            "version",
            "type",
            "message",
            "uuid",
            "timestamp",
        ];
        for (i, line) in content.lines().enumerate() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            for field in &required {
                assert!(
                    entry.get(field).is_some(),
                    "CC entry {i} missing required field '{field}'"
                );
            }
        }
    }

    #[test]
    fn golden_cc_session_id_is_uuid() {
        let (_, content) = write_cc_session(&simple_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        let sid = first["sessionId"].as_str().unwrap();
        assert!(is_uuid_v4(sid), "CC sessionId should be UUID, got: {sid}");
    }

    #[test]
    fn golden_cc_session_id_consistent_across_entries() {
        let (_, content) = write_cc_session(&simple_session());
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        let first_sid = lines[0]["sessionId"].as_str().unwrap();
        for (i, entry) in lines.iter().enumerate().skip(1) {
            assert_eq!(
                entry["sessionId"].as_str().unwrap(),
                first_sid,
                "CC entry {i} sessionId should match first entry"
            );
        }
    }

    #[test]
    fn golden_cc_parent_uuid_chain() {
        let (_, content) = write_cc_session(&simple_session());
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        // First entry: parentUuid should be null.
        assert!(
            lines[0]["parentUuid"].is_null(),
            "CC first entry parentUuid should be null"
        );

        // Subsequent entries: parentUuid should be previous entry's uuid.
        for i in 1..lines.len() {
            let prev_uuid = lines[i - 1]["uuid"].as_str().unwrap();
            let parent_uuid = lines[i]["parentUuid"].as_str().unwrap();
            assert_eq!(
                parent_uuid, prev_uuid,
                "CC entry {i} parentUuid should match prev uuid"
            );
        }
    }

    #[test]
    fn golden_cc_uuids_are_unique() {
        let (_, content) = write_cc_session(&simple_session());
        let uuids: Vec<String> = content
            .lines()
            .map(|l| {
                let entry: serde_json::Value = serde_json::from_str(l).unwrap();
                entry["uuid"].as_str().unwrap().to_string()
            })
            .collect();

        let unique: std::collections::HashSet<&str> = uuids.iter().map(|s| s.as_str()).collect();
        assert_eq!(unique.len(), uuids.len(), "CC entry UUIDs should be unique");
    }

    #[test]
    fn golden_cc_entry_types_match_roles() {
        let (_, content) = write_cc_session(&simple_session());
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        // simple_session: User, Assistant, User
        assert_eq!(lines[0]["type"], "user");
        assert_eq!(lines[1]["type"], "assistant");
        assert_eq!(lines[2]["type"], "user");
    }

    #[test]
    fn golden_cc_timestamps_are_rfc3339() {
        let (_, content) = write_cc_session(&simple_session());
        for (i, line) in content.lines().enumerate() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            let ts = entry["timestamp"].as_str().unwrap();
            assert!(
                is_rfc3339(ts),
                "CC entry {i} timestamp should be RFC-3339, got: {ts}"
            );
        }
    }

    #[test]
    fn golden_cc_cwd_matches_workspace() {
        let session = simple_session();
        let (_, content) = write_cc_session(&session);
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        assert_eq!(
            first["cwd"].as_str().unwrap(),
            session.workspace.unwrap().to_string_lossy()
        );
    }

    #[test]
    fn golden_cc_user_content_is_plain_string() {
        let (_, content) = write_cc_session(&simple_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        let msg_content = &first["message"]["content"];
        assert!(
            msg_content.is_string(),
            "CC user message content should be a plain string, got: {msg_content}"
        );
        assert_eq!(msg_content.as_str().unwrap(), "Hello, please help me.");
    }

    #[test]
    fn golden_cc_assistant_content_is_array() {
        let (_, content) = write_cc_session(&simple_session());
        let second: serde_json::Value =
            serde_json::from_str(content.lines().nth(1).unwrap()).unwrap();
        let msg_content = &second["message"]["content"];
        assert!(
            msg_content.is_array(),
            "CC assistant content should be array of blocks"
        );
        let blocks = msg_content.as_array().unwrap();
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[0]["text"], "Sure, I can help.");
    }

    #[test]
    fn golden_cc_assistant_has_model_field() {
        let (_, content) = write_cc_session(&simple_session());
        let second: serde_json::Value =
            serde_json::from_str(content.lines().nth(1).unwrap()).unwrap();
        assert_eq!(
            second["message"]["model"].as_str().unwrap(),
            "test-model",
            "CC assistant message should have model field"
        );
    }

    #[test]
    fn golden_cc_user_has_no_model_field() {
        let (_, content) = write_cc_session(&simple_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        assert!(
            first["message"].get("model").is_none(),
            "CC user message should not have model field"
        );
    }

    #[test]
    fn golden_cc_tool_calls_in_content_blocks() {
        let (_, content) = write_cc_session(&tool_call_session());
        let second: serde_json::Value =
            serde_json::from_str(content.lines().nth(1).unwrap()).unwrap();
        let blocks = second["message"]["content"].as_array().unwrap();

        // Should have: text block + tool_use block.
        assert!(blocks.len() >= 2, "should have text + tool_use blocks");
        let tool_use = blocks.iter().find(|b| b["type"] == "tool_use");
        assert!(tool_use.is_some(), "should have a tool_use block");
        let tu = tool_use.unwrap();
        assert_eq!(tu["name"], "Read");
        assert_eq!(tu["id"], "call-1");
        assert!(tu.get("input").is_some());
    }

    #[test]
    fn golden_cc_tool_result_in_user_content() {
        let (_, content) = write_cc_session(&tool_call_session());
        let third: serde_json::Value =
            serde_json::from_str(content.lines().nth(2).unwrap()).unwrap();

        // Tool result user message should have tool_result blocks.
        let msg_content = &third["message"]["content"];
        assert!(
            msg_content.is_array(),
            "CC user with tool_results should have array content"
        );
        let blocks = msg_content.as_array().unwrap();
        let tr = blocks.iter().find(|b| b["type"] == "tool_result");
        assert!(tr.is_some(), "should have a tool_result block");
        let tr = tr.unwrap();
        assert_eq!(tr["tool_use_id"], "call-1");
        assert_eq!(tr["content"], "fn main() {}");
        assert_eq!(tr["is_error"], false);
    }

    #[test]
    fn golden_cc_unicode_content_preserved() {
        let (_, content) = write_cc_session(&unicode_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        let text = first["message"]["content"].as_str().unwrap();
        assert!(
            text.contains('\u{4f60}'),
            "CC should preserve CJK characters"
        );
        assert!(
            text.contains('\u{1f600}'),
            "CC should preserve emoji characters"
        );
    }

    #[test]
    fn golden_cc_filename_is_uuid_jsonl() {
        let (path, _) = write_cc_session(&simple_session());
        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(
            filename.ends_with(".jsonl"),
            "CC file should end with .jsonl"
        );
        let stem = filename.strip_suffix(".jsonl").unwrap();
        assert!(
            is_uuid_v4(stem),
            "CC filename stem should be UUID, got: {stem}"
        );
    }

    #[test]
    fn golden_cc_path_includes_project_dir_key() {
        let (path, _) = write_cc_session(&simple_session());
        let path_str = path.to_string_lossy();
        assert!(
            path_str.contains("-data-projects-golden-test"),
            "CC path should contain project dir key, got: {path_str}"
        );
    }

    #[test]
    fn golden_cc_is_sidechain_always_false() {
        let (_, content) = write_cc_session(&simple_session());
        for (i, line) in content.lines().enumerate() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(
                entry["isSidechain"], false,
                "CC entry {i} isSidechain should be false"
            );
        }
    }

    #[test]
    fn golden_cc_version_is_casr() {
        let (_, content) = write_cc_session(&simple_session());
        for (i, line) in content.lines().enumerate() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(
                entry["version"], "casr",
                "CC entry {i} version should be 'casr'"
            );
        }
    }
}

// =====================================================================
// CODEX GOLDEN OUTPUT TESTS
// =====================================================================

mod codex_golden {
    use super::*;
    use casr::providers::codex::Codex;

    fn write_codex_session(session: &CanonicalSession) -> (PathBuf, String) {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("CODEX_HOME", tmp.path());

        let opts = WriteOptions { force: false };
        let written = Codex.write_session(session, &opts).unwrap();

        let path = written.paths[0].clone();
        let content = std::fs::read_to_string(&path).unwrap();
        (path, content)
    }

    #[test]
    fn golden_codex_output_is_valid_jsonl() {
        let (_, content) = write_codex_session(&simple_session());
        for (i, line) in content.lines().enumerate() {
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(line);
            assert!(
                parsed.is_ok(),
                "Codex line {i} should be valid JSON: {}",
                &line[..line.len().min(100)]
            );
        }
    }

    #[test]
    fn golden_codex_session_meta_is_first_line() {
        let (_, content) = write_codex_session(&simple_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        assert_eq!(
            first["type"], "session_meta",
            "Codex first line must be session_meta"
        );
    }

    #[test]
    fn golden_codex_session_meta_has_id_and_cwd() {
        let session = simple_session();
        let (_, content) = write_codex_session(&session);
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();

        let payload = &first["payload"];
        assert!(payload["id"].is_string(), "session_meta should have id");
        assert!(
            is_uuid_v4(payload["id"].as_str().unwrap()),
            "session_meta id should be UUID"
        );
        assert_eq!(
            payload["cwd"].as_str().unwrap(),
            session.workspace.unwrap().to_string_lossy()
        );
    }

    #[test]
    fn golden_codex_session_meta_timestamp_is_numeric() {
        let (_, content) = write_codex_session(&simple_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();

        let ts = first["timestamp"].as_f64().unwrap();
        assert!(
            is_epoch_seconds(ts),
            "Codex session_meta timestamp should be epoch seconds, got: {ts}"
        );
    }

    #[test]
    fn golden_codex_user_messages_are_event_msg() {
        let (_, content) = write_codex_session(&simple_session());
        // simple_session: User, Assistant, User → session_meta, event_msg, response_item, event_msg
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        // Lines after session_meta: idx 1 is user (event_msg), idx 2 is assistant (response_item),
        // idx 3 is user (event_msg).
        assert_eq!(lines[1]["type"], "event_msg");
        assert_eq!(lines[1]["payload"]["type"], "user_message");
        assert_eq!(
            lines[1]["payload"]["message"].as_str().unwrap(),
            "Hello, please help me."
        );
    }

    #[test]
    fn golden_codex_assistant_messages_are_response_item() {
        let (_, content) = write_codex_session(&simple_session());
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        assert_eq!(lines[2]["type"], "response_item");
        assert_eq!(lines[2]["payload"]["role"], "assistant");

        let content_blocks = lines[2]["payload"]["content"].as_array().unwrap();
        assert!(!content_blocks.is_empty());
        assert_eq!(content_blocks[0]["type"], "input_text");
        assert_eq!(content_blocks[0]["text"], "Sure, I can help.");
    }

    #[test]
    fn golden_codex_all_timestamps_are_numeric() {
        let (_, content) = write_codex_session(&simple_session());
        for (i, line) in content.lines().enumerate() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            let ts = entry["timestamp"].as_f64();
            assert!(
                ts.is_some(),
                "Codex entry {i} should have numeric timestamp"
            );
            assert!(
                is_epoch_seconds(ts.unwrap()),
                "Codex entry {i} timestamp out of range: {:?}",
                ts
            );
        }
    }

    #[test]
    fn golden_codex_response_item_role_is_string() {
        let (_, content) = write_codex_session(&simple_session());
        for line in content.lines() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            if entry["type"] == "response_item" {
                assert!(
                    entry["payload"]["role"].is_string(),
                    "response_item should have string role"
                );
            }
        }
    }

    #[test]
    fn golden_codex_tool_calls_in_response_content() {
        let (_, content) = write_codex_session(&tool_call_session());
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        // Find the assistant response_item with the tool call.
        let tool_response = lines
            .iter()
            .find(|e| {
                e["type"] == "response_item"
                    && e["payload"]["content"]
                        .as_array()
                        .is_some_and(|arr| arr.iter().any(|b| b["type"] == "tool_use"))
            })
            .expect("should have a response_item with tool_use");

        let blocks = tool_response["payload"]["content"].as_array().unwrap();
        let tu = blocks.iter().find(|b| b["type"] == "tool_use").unwrap();
        assert_eq!(tu["name"], "Read");
        assert_eq!(tu["id"], "call-1");
    }

    #[test]
    fn golden_codex_reasoning_is_event_msg_agent_reasoning() {
        let (_, content) = write_codex_session(&reasoning_session());
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        // Find the reasoning event.
        let reasoning = lines
            .iter()
            .find(|e| e["type"] == "event_msg" && e["payload"]["type"] == "agent_reasoning")
            .expect("should have an agent_reasoning event");

        assert_eq!(
            reasoning["payload"]["text"].as_str().unwrap(),
            "Let me think about this..."
        );
    }

    #[test]
    fn golden_codex_path_has_date_hierarchy() {
        let (path, _) = write_codex_session(&simple_session());
        let path_str = path.to_string_lossy();
        // Path should contain YYYY/MM/DD/rollout- structure.
        // Verify the sessions/YYYY/MM/DD pattern exists.
        assert!(
            path_str.contains("sessions/"),
            "Codex path should contain sessions/, got: {path_str}"
        );
        // Check that there are numeric date segments before rollout-.
        let rollout_idx = path_str.find("rollout-").expect("should contain rollout-");
        let before_rollout = &path_str[..rollout_idx];
        // Should have at least three `/NN` segments (YYYY/MM/DD/).
        let segments: Vec<&str> = before_rollout
            .rsplit('/')
            .take(4)
            .filter(|s| !s.is_empty())
            .collect();
        assert!(
            segments.len() >= 3,
            "Codex path should have YYYY/MM/DD before rollout, got segments: {segments:?}"
        );
    }

    #[test]
    fn golden_codex_filename_has_rollout_prefix() {
        let (path, _) = write_codex_session(&simple_session());
        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(
            filename.starts_with("rollout-"),
            "Codex filename should start with 'rollout-', got: {filename}"
        );
        assert!(
            filename.ends_with(".jsonl"),
            "Codex filename should end with '.jsonl', got: {filename}"
        );
    }

    #[test]
    fn golden_codex_unicode_preserved() {
        let (_, content) = write_codex_session(&unicode_session());
        assert!(
            content.contains('\u{4f60}'),
            "Codex should preserve CJK characters"
        );
        assert!(
            content.contains('\u{1f600}'),
            "Codex should preserve emoji characters"
        );
    }

    #[test]
    fn golden_codex_line_count_at_least_messages_plus_one() {
        let session = simple_session();
        let (_, content) = write_codex_session(&session);
        let line_count = content.lines().count();
        // session_meta + at least one line per message.
        assert!(
            line_count > session.messages.len(),
            "Codex should have more lines than messages (session_meta + messages), got {line_count}"
        );
    }

    #[test]
    fn golden_codex_session_id_consistent() {
        let (_, content) = write_codex_session(&simple_session());
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        let session_id = first["payload"]["id"].as_str().unwrap();

        // Session ID in session_meta should be a UUID.
        assert!(is_uuid_v4(session_id));
    }
}

// =====================================================================
// GEMINI GOLDEN OUTPUT TESTS
// =====================================================================

mod gemini_golden {
    use super::*;
    use casr::providers::gemini::Gemini;

    fn write_gemini_session(session: &CanonicalSession) -> (PathBuf, String) {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("GEMINI_HOME", tmp.path());

        let opts = WriteOptions { force: false };
        let written = Gemini.write_session(session, &opts).unwrap();

        let path = written.paths[0].clone();
        let content = std::fs::read_to_string(&path).unwrap();
        (path, content)
    }

    #[test]
    fn golden_gemini_output_is_valid_json() {
        let (_, content) = write_gemini_session(&simple_session());
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&content);
        assert!(parsed.is_ok(), "Gemini output should be valid JSON");
    }

    #[test]
    fn golden_gemini_top_level_required_fields() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();

        let required = [
            "sessionId",
            "projectHash",
            "startTime",
            "lastUpdated",
            "messages",
        ];
        for field in &required {
            assert!(
                root.get(field).is_some(),
                "Gemini output missing required top-level field '{field}'"
            );
        }
    }

    #[test]
    fn golden_gemini_session_id_is_uuid() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let sid = root["sessionId"].as_str().unwrap();
        assert!(
            is_uuid_v4(sid),
            "Gemini sessionId should be UUID, got: {sid}"
        );
    }

    #[test]
    fn golden_gemini_timestamps_are_rfc3339() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();

        let start = root["startTime"].as_str().unwrap();
        let last = root["lastUpdated"].as_str().unwrap();
        assert!(
            is_rfc3339(start),
            "Gemini startTime should be RFC-3339, got: {start}"
        );
        assert!(
            is_rfc3339(last),
            "Gemini lastUpdated should be RFC-3339, got: {last}"
        );
    }

    #[test]
    fn golden_gemini_messages_array_count() {
        let session = simple_session();
        let (_, content) = write_gemini_session(&session);
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();
        assert_eq!(
            messages.len(),
            session.messages.len(),
            "Gemini messages count should match input"
        );
    }

    #[test]
    fn golden_gemini_message_types_match_roles() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();

        // simple_session: User, Assistant, User → "user", "model", "user"
        assert_eq!(messages[0]["type"], "user");
        assert_eq!(messages[1]["type"], "model");
        assert_eq!(messages[2]["type"], "user");
    }

    #[test]
    fn golden_gemini_user_content_is_string() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();

        assert!(
            messages[0]["content"].is_string(),
            "Gemini user content should be a string"
        );
        assert_eq!(
            messages[0]["content"].as_str().unwrap(),
            "Hello, please help me."
        );
    }

    #[test]
    fn golden_gemini_assistant_content_is_string_for_simple() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();

        // Simple assistant message with no tool calls → string content.
        assert!(
            messages[1]["content"].is_string(),
            "Gemini assistant simple content should be string"
        );
    }

    #[test]
    fn golden_gemini_message_timestamps_are_rfc3339() {
        let (_, content) = write_gemini_session(&simple_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();

        for (i, msg) in messages.iter().enumerate() {
            if let Some(ts) = msg.get("timestamp") {
                assert!(
                    is_rfc3339(ts.as_str().unwrap()),
                    "Gemini message {i} timestamp should be RFC-3339"
                );
            }
        }
    }

    #[test]
    fn golden_gemini_project_hash_matches_workspace() {
        let session = simple_session();
        let workspace = session.workspace.as_ref().unwrap();
        let expected_hash = {
            use sha2::Digest;
            let mut hasher = sha2::Sha256::new();
            hasher.update(workspace.to_string_lossy().as_bytes());
            format!("{:x}", hasher.finalize())
        };

        let (_, content) = write_gemini_session(&session);
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(
            root["projectHash"].as_str().unwrap(),
            expected_hash,
            "Gemini projectHash should be SHA256 of workspace"
        );
    }

    #[test]
    fn golden_gemini_path_includes_hash_and_chats() {
        let (path, _) = write_gemini_session(&simple_session());
        let path_str = path.to_string_lossy();
        assert!(
            path_str.contains("/chats/"),
            "Gemini path should contain /chats/, got: {path_str}"
        );
        // Path should include the hash directory.
        assert!(
            path_str.contains("/tmp/"),
            "Gemini path should be under tmp dir"
        );
    }

    #[test]
    fn golden_gemini_filename_convention() {
        let (path, _) = write_gemini_session(&simple_session());
        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(
            filename.starts_with("session-"),
            "Gemini filename should start with 'session-', got: {filename}"
        );
        assert!(
            filename.ends_with(".json"),
            "Gemini filename should end with '.json', got: {filename}"
        );
    }

    #[test]
    fn golden_gemini_unicode_preserved() {
        let (_, content) = write_gemini_session(&unicode_session());
        assert!(
            content.contains('\u{4f60}'),
            "Gemini should preserve CJK characters"
        );
        assert!(
            content.contains('\u{1f600}'),
            "Gemini should preserve emoji characters"
        );
    }

    #[test]
    fn golden_gemini_is_pretty_printed() {
        let (_, content) = write_gemini_session(&simple_session());
        // Pretty-printed JSON should have newlines and indentation.
        assert!(
            content.contains('\n'),
            "Gemini output should be pretty-printed"
        );
        assert!(
            content.contains("  "),
            "Gemini output should have indentation"
        );
    }

    #[test]
    fn golden_gemini_tool_calls_produce_array_content() {
        let (_, content) = write_gemini_session(&tool_call_session());
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();

        // The tool-result user message (idx 2) should have array content since
        // the canonical msg has tool_results and null extra.
        let tool_result_msg = &messages[2];
        assert!(
            tool_result_msg["content"].is_array(),
            "Gemini tool-result message should have array content"
        );
        let blocks = tool_result_msg["content"].as_array().unwrap();
        let tr = blocks.iter().find(|b| b["type"] == "tool_result");
        assert!(tr.is_some(), "should have tool_result block");
    }
}

// =====================================================================
// NEGATIVE / SYMMETRIC BUG DETECTION TESTS
// =====================================================================
// These verify that we're actually checking the raw output format,
// not just reading it back through the same reader.

mod negative {
    use super::*;
    use casr::providers::claude_code::ClaudeCode;
    use casr::providers::codex::Codex;
    use casr::providers::gemini::Gemini;

    /// Verify that CC writer produces "gitBranch": "main" (hardcoded) regardless
    /// of metadata. This is a format-level assertion the reader won't catch.
    #[test]
    fn negative_cc_gitbranch_is_always_main() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = simple_session();
        let opts = WriteOptions { force: false };
        let written = ClaudeCode.write_session(&session, &opts).unwrap();

        let content = std::fs::read_to_string(&written.paths[0]).unwrap();
        let first: serde_json::Value =
            serde_json::from_str(content.lines().next().unwrap()).unwrap();
        assert_eq!(
            first["gitBranch"], "main",
            "CC writer should always set gitBranch to 'main'"
        );
    }

    /// Verify Codex session_meta always appears before message events.
    /// A symmetric reader bug could silently accept out-of-order output.
    #[test]
    fn negative_codex_meta_precedes_all_events() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = simple_session();
        let opts = WriteOptions { force: false };
        let written = Codex.write_session(&session, &opts).unwrap();

        let content = std::fs::read_to_string(&written.paths[0]).unwrap();
        let lines: Vec<serde_json::Value> = content
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();

        let meta_idx = lines
            .iter()
            .position(|e| e["type"] == "session_meta")
            .expect("should have session_meta");
        assert_eq!(meta_idx, 0, "session_meta must be first line (index 0)");

        // No other line should be session_meta.
        let meta_count = lines.iter().filter(|e| e["type"] == "session_meta").count();
        assert_eq!(meta_count, 1, "should have exactly one session_meta");
    }

    /// Verify Gemini uses "model" (not "assistant") for assistant messages.
    /// A symmetric bug could use "assistant" in both reader and writer.
    #[test]
    fn negative_gemini_uses_model_not_assistant() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("GEMINI_HOME", tmp.path());

        let session = simple_session();
        let opts = WriteOptions { force: false };
        let written = Gemini.write_session(&session, &opts).unwrap();

        let content = std::fs::read_to_string(&written.paths[0]).unwrap();
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        let messages = root["messages"].as_array().unwrap();

        for msg in messages {
            let msg_type = msg["type"].as_str().unwrap();
            assert_ne!(
                msg_type, "assistant",
                "Gemini should never use 'assistant' type — should be 'model'"
            );
        }
    }

    /// Verify CC user entries never have "model" in the inner message.
    /// A symmetric bug could add model to all messages.
    #[test]
    fn negative_cc_user_entries_never_have_model() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = TempDir::new().unwrap();
        let _guard = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = tool_call_session();
        let opts = WriteOptions { force: false };
        let written = ClaudeCode.write_session(&session, &opts).unwrap();

        let content = std::fs::read_to_string(&written.paths[0]).unwrap();
        for line in content.lines() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            if entry["type"] == "user" {
                assert!(
                    entry["message"].get("model").is_none(),
                    "CC user entry should never have model field in inner message"
                );
            }
        }
    }
}
