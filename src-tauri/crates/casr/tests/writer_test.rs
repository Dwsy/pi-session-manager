//! Writer integration tests for multiple providers.
//!
//! Tests `write_session()` → `read_session()` round-trip compatibility and
//! provider-specific output shape conformance.
//!
//! These tests serialize process environment access because `write_session()`
//! reads provider home environment variables (`CLAUDE_HOME`, `CODEX_HOME`,
//! `GEMINI_HOME`, `CLINE_HOME`, `AMP_HOME`, etc.) to determine the target
//! directory and Rust 2024 makes env mutation `unsafe` under concurrency.

mod test_env;

use std::path::PathBuf;

use casr::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall};
use casr::providers::amp::Amp;
use casr::providers::chatgpt::ChatGpt;
use casr::providers::claude_code::ClaudeCode;
use casr::providers::clawdbot::ClawdBot;
use casr::providers::cline::Cline;
use casr::providers::codex::Codex;
use casr::providers::factory::Factory;
use casr::providers::gemini::Gemini;
use casr::providers::openclaw::OpenClaw;
use casr::providers::pi_agent::PiAgent;
use casr::providers::vibe::Vibe;
use casr::providers::{Provider, WriteOptions};

// ---------------------------------------------------------------------------
// Env var isolation
//
// Rust 2024 makes `std::env::set_var`/`remove_var` `unsafe` due to unsoundness
// when the process environment is accessed concurrently. The test harness runs
// tests in parallel, so all provider env mutations (and code that reads env)
// must be serialized within this test binary.
//
// Provider-named statics are kept for readability; they all share the same
// global re-entrant lock via `test_env`.
// ---------------------------------------------------------------------------

static CC_ENV: test_env::EnvLock = test_env::EnvLock;
static CODEX_ENV: test_env::EnvLock = test_env::EnvLock;
static GEMINI_ENV: test_env::EnvLock = test_env::EnvLock;
static CLINE_ENV: test_env::EnvLock = test_env::EnvLock;
static AMP_ENV: test_env::EnvLock = test_env::EnvLock;
static CHATGPT_ENV: test_env::EnvLock = test_env::EnvLock;
static CLAWDBOT_ENV: test_env::EnvLock = test_env::EnvLock;
static VIBE_ENV: test_env::EnvLock = test_env::EnvLock;
static FACTORY_ENV: test_env::EnvLock = test_env::EnvLock;
static OPENCLAW_ENV: test_env::EnvLock = test_env::EnvLock;
static PI_AGENT_ENV: test_env::EnvLock = test_env::EnvLock;

/// RAII guard that sets an env var and restores the original value on drop.
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
            // SAFETY: Same Mutex protects the restore.
            Some(val) => unsafe { std::env::set_var(self.key, val) },
            None => unsafe { std::env::remove_var(self.key) },
        }
    }
}

// ---------------------------------------------------------------------------
// Test session builders
// ---------------------------------------------------------------------------

fn simple_msg(idx: usize, role: MessageRole, content: &str, ts: i64) -> CanonicalMessage {
    CanonicalMessage {
        idx,
        role,
        content: content.to_string(),
        timestamp: Some(ts),
        author: None,
        tool_calls: vec![],
        tool_results: vec![],
        extra: serde_json::Value::Null,
    }
}

fn assistant_msg(idx: usize, content: &str, ts: i64, model: &str) -> CanonicalMessage {
    let mut m = simple_msg(idx, MessageRole::Assistant, content, ts);
    m.author = Some(model.to_string());
    m
}

/// Session with 4 text-only messages (clean roundtrip expected for all providers).
fn simple_session() -> CanonicalSession {
    CanonicalSession {
        session_id: "src-simple".to_string(),
        provider_slug: "test-source".to_string(),
        workspace: Some(PathBuf::from("/data/projects/myapp")),
        title: Some("Fix the login bug".to_string()),
        started_at: Some(1_700_000_000_000),
        ended_at: Some(1_700_000_010_000),
        messages: vec![
            simple_msg(0, MessageRole::User, "Fix the login bug", 1_700_000_000_000),
            assistant_msg(1, "I'll fix that now.", 1_700_000_005_000, "claude-3-opus"),
            simple_msg(
                2,
                MessageRole::User,
                "Also check the tests",
                1_700_000_007_000,
            ),
            assistant_msg(3, "Tests are passing.", 1_700_000_010_000, "claude-3-opus"),
        ],
        metadata: serde_json::json!({"source": "test"}),
        source_path: PathBuf::from("/tmp/source.jsonl"),
        model_name: Some("claude-3-opus".to_string()),
    }
}

/// Session with a tool call in the assistant message.
fn tool_call_session() -> CanonicalSession {
    let mut session = simple_session();
    session.messages[1].tool_calls = vec![ToolCall {
        id: Some("tc-1".to_string()),
        name: "Read".to_string(),
        arguments: serde_json::json!({"file_path": "src/auth.rs"}),
    }];
    session
}

// ===========================================================================
// Claude Code writer tests
// ===========================================================================

#[test]
fn writer_cc_roundtrip() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let session = simple_session();
    let written = ClaudeCode
        .write_session(&session, &WriteOptions { force: false })
        .expect("CC write_session should succeed");

    assert_eq!(written.paths.len(), 1, "CC should produce exactly one file");
    assert!(written.paths[0].exists(), "CC output file should exist");
    assert!(
        written.resume_command.starts_with("claude --resume"),
        "CC resume command format"
    );

    let readback = ClaudeCode
        .read_session(&written.paths[0])
        .expect("CC read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "CC roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(orig.role, rb.role, "CC roundtrip msg {i}: role mismatch");
        assert_eq!(
            orig.content, rb.content,
            "CC roundtrip msg {i}: content mismatch"
        );
    }
    assert_eq!(
        readback.workspace, session.workspace,
        "CC roundtrip: workspace"
    );
    assert!(
        readback.model_name.is_some(),
        "CC roundtrip: model_name should survive"
    );
}

#[test]
fn writer_cc_output_valid_jsonl() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let written = ClaudeCode
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    assert_eq!(lines.len(), 4, "CC should write one line per message");
    for (i, line) in lines.iter().enumerate() {
        if let Err(e) = serde_json::from_str::<serde_json::Value>(line) {
            panic!("CC line {i} not valid JSON: {e}\nContent: {line}");
        }
    }
}

#[test]
fn writer_cc_entries_have_required_fields() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let written = ClaudeCode
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    for (i, line) in content.lines().enumerate() {
        let entry: serde_json::Value = serde_json::from_str(line).unwrap();
        for field in [
            "sessionId",
            "type",
            "message",
            "uuid",
            "timestamp",
            "parentUuid",
            "cwd",
        ] {
            assert!(
                entry.get(field).is_some(),
                "CC line {i}: missing required field '{field}'"
            );
        }
        let entry_type = entry["type"].as_str().unwrap();
        assert!(
            entry_type == "user" || entry_type == "assistant",
            "CC line {i}: unexpected type '{entry_type}'"
        );
    }
}

#[test]
fn writer_cc_parent_uuid_chain() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let written = ClaudeCode
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let entries: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    // First entry: parentUuid is null.
    assert!(
        entries[0]["parentUuid"].is_null(),
        "CC first entry parentUuid should be null"
    );

    // Subsequent entries: parentUuid == previous entry's uuid.
    for i in 1..entries.len() {
        let expected = entries[i - 1]["uuid"].as_str().unwrap();
        let actual = entries[i]["parentUuid"].as_str().unwrap();
        assert_eq!(
            actual, expected,
            "CC entry {i}: parentUuid should chain to previous uuid"
        );
    }
}

#[test]
fn writer_cc_workspace_directory_placement() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let session = simple_session(); // workspace: /data/projects/myapp
    let written = ClaudeCode
        .write_session(&session, &WriteOptions { force: false })
        .unwrap();

    let path = &written.paths[0];
    // File should be under <CLAUDE_HOME>/projects/-data-projects-myapp/<uuid>.jsonl
    let expected_dir_key = "-data-projects-myapp";
    let parent = path.parent().unwrap();
    assert!(
        parent.ends_with(expected_dir_key),
        "CC file should be under project dir key '{expected_dir_key}', got: {}",
        parent.display()
    );
    assert!(
        path.extension().is_some_and(|e| e == "jsonl"),
        "CC file should have .jsonl extension"
    );
}

#[test]
fn writer_cc_timestamps_are_rfc3339() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let written = ClaudeCode
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    for (i, line) in content.lines().enumerate() {
        let entry: serde_json::Value = serde_json::from_str(line).unwrap();
        let ts_str = match entry["timestamp"].as_str() {
            Some(ts_str) => ts_str,
            None => {
                panic!("CC line {i}: timestamp should be a string");
            }
        };
        if let Err(e) = chrono::DateTime::parse_from_rfc3339(ts_str) {
            panic!("CC line {i}: timestamp '{ts_str}' not valid RFC3339: {e}");
        }
    }
}

#[test]
fn writer_cc_tool_calls_in_assistant_content() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let written = ClaudeCode
        .write_session(&tool_call_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let entries: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    // Entry 1 is the assistant with a tool call.
    let assistant_entry = &entries[1];
    assert_eq!(assistant_entry["type"], "assistant");
    let msg_content = &assistant_entry["message"]["content"];
    let blocks = msg_content
        .as_array()
        .expect("CC assistant content should be array of blocks");

    let has_text = blocks.iter().any(|b| b["type"] == "text");
    let has_tool_use = blocks.iter().any(|b| b["type"] == "tool_use");
    assert!(has_text, "CC assistant content should contain text block");
    assert!(
        has_tool_use,
        "CC assistant content should contain tool_use block"
    );

    let tool_block = blocks.iter().find(|b| b["type"] == "tool_use").unwrap();
    assert_eq!(tool_block["name"], "Read");
    assert_eq!(tool_block["id"], "tc-1");
}

#[test]
fn writer_cc_model_name_on_assistant_entries() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let written = ClaudeCode
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    for (i, line) in content.lines().enumerate() {
        let entry: serde_json::Value = serde_json::from_str(line).unwrap();
        if entry["type"] == "assistant" {
            assert!(
                entry["message"]["model"].is_string(),
                "CC assistant entry {i} should have message.model"
            );
        }
    }
}

// ===========================================================================
// Codex writer tests
// ===========================================================================

#[test]
fn writer_codex_roundtrip() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let session = simple_session();
    let written = Codex
        .write_session(&session, &WriteOptions { force: false })
        .expect("Codex write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "Codex should produce exactly one file"
    );
    assert!(written.paths[0].exists(), "Codex output file should exist");
    assert!(
        written.resume_command.starts_with("codex resume"),
        "Codex resume command format"
    );

    let readback = Codex
        .read_session(&written.paths[0])
        .expect("Codex read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "Codex roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(orig.role, rb.role, "Codex roundtrip msg {i}: role mismatch");
        assert_eq!(
            orig.content, rb.content,
            "Codex roundtrip msg {i}: content mismatch"
        );
    }
    assert_eq!(
        readback.workspace, session.workspace,
        "Codex roundtrip: workspace"
    );
}

#[test]
fn writer_codex_output_valid_jsonl() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    // session_meta + 4 messages (2 user event_msg + 2 assistant response_item)
    assert_eq!(
        lines.len(),
        5,
        "Codex should write session_meta + 4 message lines"
    );
    for (i, line) in lines.iter().enumerate() {
        if let Err(e) = serde_json::from_str::<serde_json::Value>(line) {
            panic!("Codex line {i} not valid JSON: {e}\nContent: {line}");
        }
    }
}

#[test]
fn writer_codex_session_meta_is_first_line() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let first_line: serde_json::Value =
        serde_json::from_str(content.lines().next().unwrap()).unwrap();

    assert_eq!(
        first_line["type"], "session_meta",
        "Codex first line should be session_meta"
    );
    assert!(
        first_line["payload"]["id"].as_str().is_some(),
        "session_meta should have payload.id"
    );
    assert_eq!(
        first_line["payload"]["cwd"], "/data/projects/myapp",
        "session_meta should have correct cwd"
    );
}

#[test]
fn writer_codex_user_messages_are_event_msg() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    let user_events: Vec<&serde_json::Value> = lines
        .iter()
        .filter(|l| l["type"] == "event_msg" && l["payload"]["type"] == "user_message")
        .collect();
    assert_eq!(
        user_events.len(),
        2,
        "Codex should have 2 user event_msg lines"
    );
    assert_eq!(user_events[0]["payload"]["message"], "Fix the login bug");
    assert_eq!(user_events[1]["payload"]["message"], "Also check the tests");
}

#[test]
fn writer_codex_assistant_messages_are_response_item() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    let response_items: Vec<&serde_json::Value> = lines
        .iter()
        .filter(|l| l["type"] == "response_item")
        .collect();
    assert_eq!(
        response_items.len(),
        2,
        "Codex should have 2 response_item lines"
    );
    assert_eq!(response_items[0]["payload"]["role"], "assistant");
    assert_eq!(response_items[1]["payload"]["role"], "assistant");
}

#[test]
fn writer_codex_reasoning_messages() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let mut session = simple_session();
    // Replace second assistant message with a reasoning message.
    session.messages[3] = CanonicalMessage {
        idx: 3,
        role: MessageRole::Assistant,
        content: "Thinking about the tests...".to_string(),
        timestamp: Some(1_700_000_010_000),
        author: Some("reasoning".to_string()),
        tool_calls: vec![],
        tool_results: vec![],
        extra: serde_json::Value::Null,
    };

    let written = Codex
        .write_session(&session, &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    let reasoning_events: Vec<&serde_json::Value> = lines
        .iter()
        .filter(|l| l["type"] == "event_msg" && l["payload"]["type"] == "agent_reasoning")
        .collect();
    assert_eq!(
        reasoning_events.len(),
        1,
        "Codex should have 1 agent_reasoning event"
    );
    assert_eq!(
        reasoning_events[0]["payload"]["text"],
        "Thinking about the tests..."
    );
}

#[test]
fn writer_codex_timestamps_are_numeric() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    for (i, line) in content.lines().enumerate() {
        let entry: serde_json::Value = serde_json::from_str(line).unwrap();
        let ts = entry.get("timestamp");
        assert!(ts.is_some(), "Codex line {i}: missing timestamp");
        let ts = ts.unwrap();
        assert!(
            ts.is_f64() || ts.is_i64() || ts.is_u64(),
            "Codex line {i}: timestamp should be numeric, got: {ts}"
        );
    }
}

#[test]
fn writer_codex_date_hierarchy_in_path() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let path_str = written.paths[0].to_string_lossy().to_string();
    let components: Vec<&str> = path_str.split('/').collect();

    // Should contain "sessions" directory.
    let sessions_idx = components
        .iter()
        .position(|c| *c == "sessions")
        .expect("Codex path should contain 'sessions'");

    // After "sessions": year/month/day/file.
    assert!(
        components.len() > sessions_idx + 4,
        "Codex path should have year/month/day/file after sessions/"
    );

    let year = components[sessions_idx + 1];
    assert!(
        year.len() == 4 && year.chars().all(|c| c.is_ascii_digit()),
        "Codex path year should be 4 digits, got '{year}'"
    );
    let month = components[sessions_idx + 2];
    assert!(
        month.len() == 2 && month.chars().all(|c| c.is_ascii_digit()),
        "Codex path month should be 2 digits, got '{month}'"
    );
    let day = components[sessions_idx + 3];
    assert!(
        day.len() == 2 && day.chars().all(|c| c.is_ascii_digit()),
        "Codex path day should be 2 digits, got '{day}'"
    );

    let filename = components.last().unwrap();
    assert!(
        filename.starts_with("rollout-"),
        "Codex filename should start with 'rollout-'"
    );
    assert!(
        filename.ends_with(".jsonl"),
        "Codex filename should end with '.jsonl'"
    );
}

#[test]
fn writer_codex_tool_calls_in_response_content() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let written = Codex
        .write_session(&tool_call_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    let response_items: Vec<&serde_json::Value> = lines
        .iter()
        .filter(|l| l["type"] == "response_item")
        .collect();

    // First response_item should have tool_use in its content blocks.
    let first_content = response_items[0]["payload"]["content"]
        .as_array()
        .expect("Codex response_item content should be array");
    let has_tool_use = first_content.iter().any(|b| b["type"] == "tool_use");
    assert!(
        has_tool_use,
        "Codex response_item should contain tool_use block"
    );
}

// ===========================================================================
// Gemini writer tests
// ===========================================================================

#[test]
fn writer_gemini_roundtrip() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let session = simple_session();
    let written = Gemini
        .write_session(&session, &WriteOptions { force: false })
        .expect("Gemini write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "Gemini should produce exactly one file"
    );
    assert!(written.paths[0].exists(), "Gemini output file should exist");
    assert!(
        written.resume_command.starts_with("gemini --resume"),
        "Gemini resume command format"
    );

    let readback = Gemini
        .read_session(&written.paths[0])
        .expect("Gemini read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "Gemini roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(
            orig.role, rb.role,
            "Gemini roundtrip msg {i}: role mismatch"
        );
        assert_eq!(
            orig.content, rb.content,
            "Gemini roundtrip msg {i}: content mismatch"
        );
    }
    // Gemini workspace is derived from message content heuristics,
    // not stored explicitly. With simple text messages, it won't survive.
}

#[test]
fn writer_gemini_output_valid_json() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let written = Gemini
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let _: serde_json::Value =
        serde_json::from_str(&content).expect("Gemini output should be valid JSON");
}

#[test]
fn writer_gemini_top_level_fields() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let written = Gemini
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();

    assert!(
        root["sessionId"].is_string(),
        "Gemini should have sessionId"
    );
    assert!(
        root["projectHash"].is_string(),
        "Gemini should have projectHash"
    );
    assert!(
        root["startTime"].is_string(),
        "Gemini should have startTime"
    );
    assert!(
        root["lastUpdated"].is_string(),
        "Gemini should have lastUpdated"
    );
    assert!(
        root["messages"].is_array(),
        "Gemini should have messages array"
    );
    assert_eq!(
        root["messages"].as_array().unwrap().len(),
        4,
        "Gemini should have 4 messages"
    );
}

#[test]
fn writer_gemini_message_types() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let written = Gemini
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();
    let messages = root["messages"].as_array().unwrap();

    assert_eq!(messages[0]["type"], "user", "Gemini msg 0 should be 'user'");
    assert_eq!(
        messages[1]["type"], "model",
        "Gemini msg 1 should be 'model'"
    );
    assert_eq!(messages[2]["type"], "user", "Gemini msg 2 should be 'user'");
    assert_eq!(
        messages[3]["type"], "model",
        "Gemini msg 3 should be 'model'"
    );
}

#[test]
fn writer_gemini_timestamps_are_rfc3339() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let written = Gemini
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();

    // Top-level timestamps.
    for field in ["startTime", "lastUpdated"] {
        let ts = match root[field].as_str() {
            Some(ts) => ts,
            None => {
                panic!("Gemini: {field} should be string");
            }
        };
        if let Err(e) = chrono::DateTime::parse_from_rfc3339(ts) {
            panic!("Gemini: {field} '{ts}' not valid RFC3339: {e}");
        }
    }

    // Per-message timestamps.
    for (i, msg) in root["messages"].as_array().unwrap().iter().enumerate() {
        if let Some(ts) = msg["timestamp"].as_str()
            && let Err(e) = chrono::DateTime::parse_from_rfc3339(ts)
        {
            panic!("Gemini msg {i}: timestamp '{ts}' not valid RFC3339: {e}");
        }
    }
}

#[test]
fn writer_gemini_hash_directory_structure() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let written = Gemini
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let path = &written.paths[0];
    // Should be under <GEMINI_HOME>/tmp/<hash>/chats/session-*.json
    let parent = path.parent().unwrap();
    assert_eq!(
        parent.file_name().unwrap().to_str().unwrap(),
        "chats",
        "Gemini file should be in a 'chats' directory"
    );

    let hash_dir = parent.parent().unwrap();
    let hash_name = hash_dir.file_name().unwrap().to_str().unwrap();
    assert_eq!(
        hash_name.len(),
        64,
        "Gemini hash directory should be 64-char hex SHA256, got len={}",
        hash_name.len()
    );
    assert!(
        hash_name.chars().all(|c| c.is_ascii_hexdigit()),
        "Gemini hash dir should be hex chars, got '{hash_name}'"
    );

    assert!(
        path.extension().is_some_and(|e| e == "json"),
        "Gemini file should have .json extension"
    );
    let filename = path.file_name().unwrap().to_str().unwrap();
    assert!(
        filename.starts_with("session-"),
        "Gemini filename should start with 'session-'"
    );
}

#[test]
fn writer_gemini_extra_fields_preserved() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let mut session = simple_session();
    // Simulate grounding metadata on the assistant message.
    session.messages[1].extra = serde_json::json!({
        "type": "model",
        "content": "I'll fix that now.",
        "groundingMetadata": {"sourceCount": 2},
        "citations": [{"uri": "doc://ref1"}]
    });

    let written = Gemini
        .write_session(&session, &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();
    let msg1 = &root["messages"].as_array().unwrap()[1];

    assert!(
        msg1["groundingMetadata"].is_object(),
        "Gemini should preserve groundingMetadata from extra"
    );
    assert!(
        msg1["citations"].is_array(),
        "Gemini should preserve citations from extra"
    );
}

#[test]
fn writer_gemini_project_hash_matches_workspace() {
    let _lock = GEMINI_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

    let written = Gemini
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();

    let stored_hash = root["projectHash"].as_str().unwrap();
    let expected_hash =
        casr::providers::gemini::project_hash(std::path::Path::new("/data/projects/myapp"));
    assert_eq!(
        stored_hash, expected_hash,
        "Gemini projectHash should match SHA256 of workspace"
    );
}

// ===========================================================================
// Cross-provider: default workspace fallback
// ===========================================================================

#[test]
fn writer_cc_default_workspace_uses_tmp() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let mut session = simple_session();
    session.workspace = None;

    let written = ClaudeCode
        .write_session(&session, &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let first: serde_json::Value = serde_json::from_str(content.lines().next().unwrap()).unwrap();
    assert_eq!(
        first["cwd"], "/tmp",
        "CC should fall back to /tmp when workspace is None"
    );
}

#[test]
fn writer_codex_default_workspace_uses_tmp() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let mut session = simple_session();
    session.workspace = None;

    let written = Codex
        .write_session(&session, &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let first: serde_json::Value = serde_json::from_str(content.lines().next().unwrap()).unwrap();
    assert_eq!(
        first["payload"]["cwd"], "/tmp",
        "Codex should fall back to /tmp when workspace is None"
    );
}

// ===========================================================================
// Cline writer tests
// ===========================================================================

#[test]
fn writer_cline_roundtrip() {
    let _lock = CLINE_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLINE_HOME", tmp.path());

    let session = simple_session();
    let written = Cline
        .write_session(&session, &WriteOptions { force: false })
        .expect("Cline write_session should succeed");

    assert_eq!(written.paths.len(), 3, "Cline should write 3 task files");
    assert!(
        written.session_id.chars().all(|c| c.is_ascii_digit()),
        "Cline task ids should be numeric"
    );
    assert_eq!(written.resume_command, "code .");

    // The shared task history state file should include the new task id.
    let history_path = tmp.path().join("state/taskHistory.json");
    assert!(
        history_path.is_file(),
        "Cline should write taskHistory.json"
    );
    let history_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&history_path).unwrap()).unwrap();
    let items = history_json
        .as_array()
        .expect("taskHistory.json should be an array");
    assert!(
        items
            .iter()
            .any(|v| v.get("id").and_then(|x| x.as_str()) == Some(&written.session_id)),
        "taskHistory.json should include the written task id"
    );

    let readback = Cline
        .read_session(&written.paths[0])
        .expect("Cline read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "Cline roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(orig.role, rb.role, "Cline roundtrip msg {i}: role mismatch");
        assert_eq!(
            orig.content, rb.content,
            "Cline roundtrip msg {i}: content mismatch"
        );
    }
    assert_eq!(
        readback.workspace, session.workspace,
        "Cline roundtrip: workspace"
    );
    assert_eq!(
        readback.model_name, session.model_name,
        "Cline roundtrip: model_name should survive via taskHistory.json"
    );
}

// ===========================================================================
// Amp writer tests
// ===========================================================================

#[test]
fn writer_amp_roundtrip() {
    let _lock = AMP_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("AMP_HOME", tmp.path());

    let session = simple_session();
    let written = Amp
        .write_session(&session, &WriteOptions { force: false })
        .expect("Amp write_session should succeed");

    assert_eq!(written.paths.len(), 1, "Amp should write one thread file");
    assert!(
        written.session_id.starts_with("T-"),
        "Amp session IDs should start with 'T-'"
    );
    assert!(
        written.paths[0].starts_with(tmp.path().join("threads")),
        "Amp thread should be written under $AMP_HOME/threads"
    );
    assert!(
        written.resume_command.contains(&written.session_id),
        "Amp resume command should reference written session ID"
    );

    let readback = Amp
        .read_session(&written.paths[0])
        .expect("Amp read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "Amp roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(orig.role, rb.role, "Amp roundtrip msg {i}: role mismatch");
        assert_eq!(
            orig.content, rb.content,
            "Amp roundtrip msg {i}: content mismatch"
        );
    }
    assert_eq!(
        readback.workspace, session.workspace,
        "Amp roundtrip: workspace"
    );
}

#[test]
fn writer_amp_output_has_expected_shape() {
    let _lock = AMP_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("AMP_HOME", tmp.path());

    let written = Amp
        .write_session(&simple_session(), &WriteOptions { force: false })
        .expect("Amp write_session should succeed");

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();

    assert!(root["id"].is_string(), "Amp thread should have string id");
    assert!(
        root["created"].is_i64(),
        "Amp thread should have numeric created"
    );
    assert!(
        root["messages"].is_array(),
        "Amp thread should have messages array"
    );
    assert_eq!(
        root["messages"].as_array().unwrap().len(),
        4,
        "Amp thread should contain one entry per message"
    );
}

// ===========================================================================
// ChatGPT writer tests
// ===========================================================================

#[test]
fn writer_chatgpt_roundtrip() {
    let _lock = CHATGPT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CHATGPT_HOME", tmp.path());

    let session = simple_session();
    let written = ChatGpt
        .write_session(&session, &WriteOptions { force: false })
        .expect("ChatGPT write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "ChatGPT should produce exactly one file"
    );
    assert!(
        written.paths[0].exists(),
        "ChatGPT output file should exist"
    );
    assert!(
        written.resume_command.contains("chatgpt.com"),
        "ChatGPT resume command should reference chatgpt.com"
    );

    let readback = ChatGpt
        .read_session(&written.paths[0])
        .expect("ChatGPT read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "ChatGPT roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(
            orig.role, rb.role,
            "ChatGPT roundtrip msg {i}: role mismatch"
        );
        assert_eq!(
            orig.content, rb.content,
            "ChatGPT roundtrip msg {i}: content mismatch"
        );
    }
}

#[test]
fn writer_chatgpt_output_valid_json_with_mapping() {
    let _lock = CHATGPT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CHATGPT_HOME", tmp.path());

    let written = ChatGpt
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value =
        serde_json::from_str(&content).expect("ChatGPT output should be valid JSON");

    assert!(root["id"].is_string(), "ChatGPT should have string id");
    assert!(
        root["mapping"].is_object(),
        "ChatGPT should have mapping object"
    );

    let mapping = root["mapping"].as_object().unwrap();
    // 4 messages → 4 mapping nodes (plus possible root node).
    assert!(
        mapping.len() >= 4,
        "ChatGPT mapping should have at least 4 nodes, got {}",
        mapping.len()
    );
}

#[test]
fn writer_chatgpt_timestamps_are_float_seconds() {
    let _lock = CHATGPT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CHATGPT_HOME", tmp.path());

    let written = ChatGpt
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();

    // Top-level timestamps should be numeric (seconds).
    assert!(
        root["create_time"].is_f64() || root["create_time"].is_i64(),
        "ChatGPT create_time should be numeric"
    );
    assert!(
        root["update_time"].is_f64() || root["update_time"].is_i64(),
        "ChatGPT update_time should be numeric"
    );
}

#[test]
fn writer_chatgpt_mapping_has_parent_chain() {
    let _lock = CHATGPT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CHATGPT_HOME", tmp.path());

    let written = ChatGpt
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let root: serde_json::Value = serde_json::from_str(&content).unwrap();
    let mapping = root["mapping"].as_object().unwrap();

    // Every node with a message should have a parent pointer (string or null).
    for (node_id, node) in mapping {
        if node.get("message").is_some() {
            assert!(
                node.get("parent").is_some(),
                "ChatGPT mapping node '{node_id}' should have parent field"
            );
        }
    }
}

// ===========================================================================
// ClawdBot writer tests
// ===========================================================================

#[test]
fn writer_clawdbot_roundtrip() {
    let _lock = CLAWDBOT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAWDBOT_HOME", tmp.path());

    let session = simple_session();
    let written = ClawdBot
        .write_session(&session, &WriteOptions { force: false })
        .expect("ClawdBot write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "ClawdBot should produce exactly one file"
    );
    assert!(
        written.paths[0].exists(),
        "ClawdBot output file should exist"
    );
    assert!(
        written.resume_command.contains("clawdbot"),
        "ClawdBot resume command should reference clawdbot"
    );

    let readback = ClawdBot
        .read_session(&written.paths[0])
        .expect("ClawdBot read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "ClawdBot roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(
            orig.role, rb.role,
            "ClawdBot roundtrip msg {i}: role mismatch"
        );
        assert_eq!(
            orig.content, rb.content,
            "ClawdBot roundtrip msg {i}: content mismatch"
        );
    }
}

#[test]
fn writer_clawdbot_output_valid_jsonl() {
    let _lock = CLAWDBOT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAWDBOT_HOME", tmp.path());

    let written = ClawdBot
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    assert_eq!(lines.len(), 4, "ClawdBot should write one line per message");
    for (i, line) in lines.iter().enumerate() {
        let entry: serde_json::Value = match serde_json::from_str(line) {
            Ok(entry) => entry,
            Err(e) => {
                panic!("ClawdBot line {i} not valid JSON: {e}\nContent: {line}");
            }
        };
        assert!(
            entry["role"].is_string(),
            "ClawdBot line {i}: should have role"
        );
        assert!(
            entry["content"].is_string(),
            "ClawdBot line {i}: should have content"
        );
    }
}

#[test]
fn writer_clawdbot_timestamps_are_rfc3339() {
    let _lock = CLAWDBOT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("CLAWDBOT_HOME", tmp.path());

    let written = ClawdBot
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    for (i, line) in content.lines().enumerate() {
        let entry: serde_json::Value = serde_json::from_str(line).unwrap();
        if let Some(ts_str) = entry["timestamp"].as_str()
            && let Err(e) = chrono::DateTime::parse_from_rfc3339(ts_str)
        {
            panic!("ClawdBot line {i}: timestamp '{ts_str}' not valid RFC3339: {e}");
        }
    }
}

// ===========================================================================
// Vibe writer tests
// ===========================================================================

#[test]
fn writer_vibe_roundtrip() {
    let _lock = VIBE_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("VIBE_HOME", tmp.path());

    let session = simple_session();
    let written = Vibe
        .write_session(&session, &WriteOptions { force: false })
        .expect("Vibe write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "Vibe should produce exactly one file"
    );
    assert!(written.paths[0].exists(), "Vibe output file should exist");
    assert!(
        written.resume_command.contains("vibe"),
        "Vibe resume command should reference vibe"
    );

    let readback = Vibe
        .read_session(&written.paths[0])
        .expect("Vibe read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "Vibe roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(orig.role, rb.role, "Vibe roundtrip msg {i}: role mismatch");
        assert_eq!(
            orig.content, rb.content,
            "Vibe roundtrip msg {i}: content mismatch"
        );
    }
}

#[test]
fn writer_vibe_directory_structure() {
    let _lock = VIBE_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("VIBE_HOME", tmp.path());

    let written = Vibe
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let path = &written.paths[0];
    // Should be under <VIBE_HOME>/<session_id>/messages.jsonl
    let filename = path.file_name().unwrap().to_str().unwrap();
    assert_eq!(
        filename, "messages.jsonl",
        "Vibe output should be named messages.jsonl"
    );
    let session_dir = path.parent().unwrap();
    assert!(
        session_dir.starts_with(tmp.path()),
        "Vibe session dir should be under VIBE_HOME"
    );
}

#[test]
fn writer_vibe_output_valid_jsonl() {
    let _lock = VIBE_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("VIBE_HOME", tmp.path());

    let written = Vibe
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    assert_eq!(lines.len(), 4, "Vibe should write one line per message");
    for (i, line) in lines.iter().enumerate() {
        let entry: serde_json::Value = match serde_json::from_str(line) {
            Ok(entry) => entry,
            Err(e) => {
                panic!("Vibe line {i} not valid JSON: {e}\nContent: {line}");
            }
        };
        assert!(entry["role"].is_string(), "Vibe line {i}: should have role");
        assert!(
            entry["content"].is_string(),
            "Vibe line {i}: should have content"
        );
    }
}

// ===========================================================================
// Factory writer tests
// ===========================================================================

#[test]
fn writer_factory_roundtrip() {
    let _lock = FACTORY_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("FACTORY_HOME", tmp.path());

    let session = simple_session();
    let written = Factory
        .write_session(&session, &WriteOptions { force: false })
        .expect("Factory write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "Factory should produce exactly one file"
    );
    assert!(
        written.paths[0].exists(),
        "Factory output file should exist"
    );
    assert!(
        written.resume_command.contains("factory"),
        "Factory resume command should reference factory"
    );

    let readback = Factory
        .read_session(&written.paths[0])
        .expect("Factory read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "Factory roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(
            orig.role, rb.role,
            "Factory roundtrip msg {i}: role mismatch"
        );
        assert_eq!(
            orig.content, rb.content,
            "Factory roundtrip msg {i}: content mismatch"
        );
    }
}

#[test]
fn writer_factory_session_start_header() {
    let _lock = FACTORY_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("FACTORY_HOME", tmp.path());

    let written = Factory
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let first_line: serde_json::Value =
        serde_json::from_str(content.lines().next().unwrap()).unwrap();

    assert_eq!(
        first_line["type"], "session_start",
        "Factory first line should be session_start"
    );
    assert!(
        first_line["id"].is_string(),
        "Factory session_start should have id"
    );
    assert!(
        first_line["cwd"].is_string(),
        "Factory session_start should have cwd"
    );
}

#[test]
fn writer_factory_output_valid_jsonl() {
    let _lock = FACTORY_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("FACTORY_HOME", tmp.path());

    let written = Factory
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    // session_start + 4 messages.
    assert_eq!(
        lines.len(),
        5,
        "Factory should write session_start + 4 message lines"
    );
    for (i, line) in lines.iter().enumerate() {
        if let Err(e) = serde_json::from_str::<serde_json::Value>(line) {
            panic!("Factory line {i} not valid JSON: {e}\nContent: {line}");
        }
    }
}

#[test]
fn writer_factory_message_structure() {
    let _lock = FACTORY_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("FACTORY_HOME", tmp.path());

    let written = Factory
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    // Lines after header should be type: "message" with nested message object.
    for (i, entry) in lines.iter().skip(1).enumerate() {
        assert_eq!(
            entry["type"],
            "message",
            "Factory line {}: type should be 'message'",
            i + 1
        );
        assert!(
            entry["message"].is_object(),
            "Factory line {}: should have nested message object",
            i + 1
        );
        assert!(
            entry["message"]["role"].is_string(),
            "Factory line {}: message should have role",
            i + 1
        );
        assert!(
            entry["message"]["content"].is_string(),
            "Factory line {}: message should have content",
            i + 1
        );
    }
}

// ===========================================================================
// OpenClaw writer tests
// ===========================================================================

#[test]
fn writer_openclaw_roundtrip() {
    let _lock = OPENCLAW_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

    let session = simple_session();
    let written = OpenClaw
        .write_session(&session, &WriteOptions { force: false })
        .expect("OpenClaw write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "OpenClaw should produce exactly one file"
    );
    assert!(
        written.paths[0].exists(),
        "OpenClaw output file should exist"
    );
    assert!(
        written.resume_command.contains("openclaw"),
        "OpenClaw resume command should reference openclaw"
    );

    let readback = OpenClaw
        .read_session(&written.paths[0])
        .expect("OpenClaw read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "OpenClaw roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(
            orig.role, rb.role,
            "OpenClaw roundtrip msg {i}: role mismatch"
        );
        assert_eq!(
            orig.content, rb.content,
            "OpenClaw roundtrip msg {i}: content mismatch"
        );
    }
    assert_eq!(
        readback.workspace, session.workspace,
        "OpenClaw roundtrip: workspace"
    );
}

#[test]
fn writer_openclaw_session_header() {
    let _lock = OPENCLAW_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

    let written = OpenClaw
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let first_line: serde_json::Value =
        serde_json::from_str(content.lines().next().unwrap()).unwrap();

    assert_eq!(
        first_line["type"], "session",
        "OpenClaw first line should be type 'session'"
    );
    assert!(
        first_line["id"].is_string(),
        "OpenClaw session header should have id"
    );
    assert!(
        first_line["timestamp"].is_string(),
        "OpenClaw session header should have timestamp"
    );
    assert!(
        first_line["version"].is_string(),
        "OpenClaw session header should have version"
    );
}

#[test]
fn writer_openclaw_output_valid_jsonl() {
    let _lock = OPENCLAW_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

    let written = OpenClaw
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    // session header + 4 messages.
    assert_eq!(
        lines.len(),
        5,
        "OpenClaw should write session header + 4 message lines"
    );
    for (i, line) in lines.iter().enumerate() {
        if let Err(e) = serde_json::from_str::<serde_json::Value>(line) {
            panic!("OpenClaw line {i} not valid JSON: {e}\nContent: {line}");
        }
    }
}

#[test]
fn writer_openclaw_message_ids_are_sequential() {
    let _lock = OPENCLAW_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

    let written = OpenClaw
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    // Skip header, check message IDs are m1, m2, m3, m4.
    for (i, entry) in lines.iter().skip(1).enumerate() {
        let expected_id = format!("m{}", i + 1);
        assert_eq!(
            entry["id"].as_str().unwrap(),
            expected_id,
            "OpenClaw message {i} should have id '{expected_id}'"
        );
    }
}

#[test]
fn writer_openclaw_tool_calls_in_content() {
    let _lock = OPENCLAW_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

    let written = OpenClaw
        .write_session(&tool_call_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    // Second message (index 1 after header → line 2) is assistant with tool call.
    let assistant = &lines[2];
    let msg_content = &assistant["message"]["content"];

    // Content should be array when tool calls exist.
    if let Some(arr) = msg_content.as_array() {
        let has_tool = arr.iter().any(|b| b["type"] == "toolCall");
        assert!(
            has_tool,
            "OpenClaw assistant with tool calls should have toolCall block"
        );
    }
}

// ===========================================================================
// Pi-Agent writer tests
// ===========================================================================

#[test]
fn writer_piagent_roundtrip() {
    let _lock = PI_AGENT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

    let session = simple_session();
    let written = PiAgent
        .write_session(&session, &WriteOptions { force: false })
        .expect("PiAgent write_session should succeed");

    assert_eq!(
        written.paths.len(),
        1,
        "PiAgent should produce exactly one file"
    );
    assert!(
        written.paths[0].exists(),
        "PiAgent output file should exist"
    );
    assert!(
        written.resume_command.contains("pi --session"),
        "PiAgent resume command should reference pi --session"
    );

    let readback = PiAgent
        .read_session(&written.paths[0])
        .expect("PiAgent read_session should parse written output");

    assert_eq!(
        readback.messages.len(),
        session.messages.len(),
        "PiAgent roundtrip: message count"
    );
    for (i, (orig, rb)) in session
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        assert_eq!(
            orig.role, rb.role,
            "PiAgent roundtrip msg {i}: role mismatch"
        );
        assert_eq!(
            orig.content, rb.content,
            "PiAgent roundtrip msg {i}: content mismatch"
        );
    }
    assert_eq!(
        readback.workspace, session.workspace,
        "PiAgent roundtrip: workspace"
    );
}

#[test]
fn writer_piagent_session_header() {
    let _lock = PI_AGENT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

    let written = PiAgent
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let first_line: serde_json::Value =
        serde_json::from_str(content.lines().next().unwrap()).unwrap();

    assert_eq!(
        first_line["type"], "session",
        "PiAgent first line should be type 'session'"
    );
    assert!(
        first_line["id"].is_string(),
        "PiAgent session header should have id"
    );
    assert!(
        first_line["timestamp"].is_string(),
        "PiAgent session header should have timestamp"
    );
}

#[test]
fn writer_piagent_filename_has_underscore() {
    let _lock = PI_AGENT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

    let written = PiAgent
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let filename = written.paths[0].file_name().unwrap().to_str().unwrap();
    assert!(
        filename.contains('_'),
        "PiAgent filename should contain underscore for discovery, got '{filename}'"
    );
    assert!(
        filename.ends_with(".jsonl"),
        "PiAgent filename should end with .jsonl"
    );
}

#[test]
fn writer_piagent_output_valid_jsonl() {
    let _lock = PI_AGENT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

    let written = PiAgent
        .write_session(&simple_session(), &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    // session header + 4 messages.
    assert_eq!(
        lines.len(),
        5,
        "PiAgent should write session header + 4 message lines"
    );
    for (i, line) in lines.iter().enumerate() {
        if let Err(e) = serde_json::from_str::<serde_json::Value>(line) {
            panic!("PiAgent line {i} not valid JSON: {e}\nContent: {line}");
        }
    }
}

#[test]
fn writer_piagent_tool_role_normalized() {
    let _lock = PI_AGENT_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

    let mut session = simple_session();
    // Replace a message with Tool role.
    session.messages[2] = CanonicalMessage {
        idx: 2,
        role: MessageRole::Tool,
        content: "File contents here".to_string(),
        timestamp: Some(1_700_000_007_000),
        author: None,
        tool_calls: vec![],
        tool_results: vec![],
        extra: serde_json::Value::Null,
    };

    let written = PiAgent
        .write_session(&session, &WriteOptions { force: false })
        .unwrap();

    let content = std::fs::read_to_string(&written.paths[0]).unwrap();
    let lines: Vec<serde_json::Value> = content
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();

    // The Tool role message (line 3, index 2 after header) should be written as toolResult.
    let tool_line = &lines[3]; // header + user + assistant + tool
    let role = tool_line["message"]["role"].as_str().unwrap_or("");
    assert_eq!(
        role, "toolResult",
        "PiAgent should normalize Tool role to 'toolResult'"
    );
}
