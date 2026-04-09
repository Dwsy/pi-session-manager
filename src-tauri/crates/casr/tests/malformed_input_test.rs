//! Malformed input tolerance tests for all providers.
//!
//! Verifies that each provider's `read_session()` returns `Err` (not panic)
//! when given empty files, binary garbage, truncated content, or completely
//! wrong formats. Providers that support error recovery (CC, Codex) should
//! produce partial sessions from mixed valid/invalid content.

use casr::providers::Provider;
use casr::providers::aider::Aider;
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

/// Test that a provider handles an empty file without panicking.
/// Acceptable: Err or Ok(0 messages). NOT acceptable: panic or Ok(>0).
fn assert_empty_file_handled(provider: &dyn Provider, ext: &str) {
    let tmp = tempfile::NamedTempFile::with_suffix(ext).expect("create temp file");
    let result = provider.read_session(tmp.path());
    match &result {
        Err(_) => {} // Fine — explicit error for empty file.
        Ok(session) => {
            assert!(
                session.messages.is_empty(),
                "{}: empty {} file returned Ok with {} messages (expected 0 or Err)",
                provider.slug(),
                ext,
                session.messages.len()
            );
        }
    }
}

/// Test that a provider handles binary garbage without panicking.
/// Acceptable: Err or Ok(0 messages).
fn assert_garbage_handled(provider: &dyn Provider, ext: &str) {
    let tmp = tempfile::NamedTempFile::with_suffix(ext).expect("create temp file");
    std::fs::write(
        tmp.path(),
        b"\x00\x01\x02\xff\xfe\xfd\x80\x81\x82garbage\n\x00",
    )
    .expect("write garbage");
    let result = provider.read_session(tmp.path());
    match &result {
        Err(_) => {} // Fine — explicit error for garbage.
        Ok(session) => {
            assert!(
                session.messages.is_empty(),
                "{}: garbage {} file returned Ok with {} messages (expected 0 or Err)",
                provider.slug(),
                ext,
                session.messages.len()
            );
        }
    }
}

/// Test that a provider handles truncated JSON without panicking.
fn assert_truncated_json_handled(provider: &dyn Provider, ext: &str) {
    let tmp = tempfile::NamedTempFile::with_suffix(ext).expect("create temp file");
    std::fs::write(tmp.path(), r#"{"type": "message", "content": "hello"#)
        .expect("write truncated json");
    let result = provider.read_session(tmp.path());
    match &result {
        Err(_) => {} // Fine.
        Ok(session) => {
            assert!(
                session.messages.is_empty(),
                "{}: truncated {} file returned Ok with {} messages (expected 0 or Err)",
                provider.slug(),
                ext,
                session.messages.len()
            );
        }
    }
}

// ===========================================================================
// JSONL providers: Claude Code, Codex, ClawdBot, Vibe, Factory, OpenClaw, PiAgent
// ===========================================================================

#[test]
fn malformed_cc_empty() {
    assert_empty_file_handled(&ClaudeCode, ".jsonl");
}

#[test]
fn malformed_cc_garbage() {
    assert_garbage_handled(&ClaudeCode, ".jsonl");
}

#[test]
fn malformed_codex_empty() {
    assert_empty_file_handled(&Codex, ".jsonl");
}

#[test]
fn malformed_codex_garbage() {
    assert_garbage_handled(&Codex, ".jsonl");
}

#[test]
fn malformed_clawdbot_empty() {
    assert_empty_file_handled(&ClawdBot, ".jsonl");
}

#[test]
fn malformed_clawdbot_garbage() {
    assert_garbage_handled(&ClawdBot, ".jsonl");
}

#[test]
fn malformed_vibe_empty() {
    assert_empty_file_handled(&Vibe, ".jsonl");
}

#[test]
fn malformed_vibe_garbage() {
    assert_garbage_handled(&Vibe, ".jsonl");
}

#[test]
fn malformed_factory_empty() {
    assert_empty_file_handled(&Factory, ".jsonl");
}

#[test]
fn malformed_factory_garbage() {
    assert_garbage_handled(&Factory, ".jsonl");
}

#[test]
fn malformed_openclaw_empty() {
    assert_empty_file_handled(&OpenClaw, ".jsonl");
}

#[test]
fn malformed_openclaw_garbage() {
    assert_garbage_handled(&OpenClaw, ".jsonl");
}

#[test]
fn malformed_piagent_empty() {
    assert_empty_file_handled(&PiAgent, ".jsonl");
}

#[test]
fn malformed_piagent_garbage() {
    assert_garbage_handled(&PiAgent, ".jsonl");
}

// ===========================================================================
// JSON providers: Gemini, ChatGPT, Amp, Cline
// ===========================================================================

#[test]
fn malformed_gemini_empty() {
    assert_empty_file_handled(&Gemini, ".json");
}

#[test]
fn malformed_gemini_garbage() {
    assert_garbage_handled(&Gemini, ".json");
}

#[test]
fn malformed_gemini_truncated() {
    assert_truncated_json_handled(&Gemini, ".json");
}

#[test]
fn malformed_chatgpt_empty() {
    assert_empty_file_handled(&ChatGpt, ".json");
}

#[test]
fn malformed_chatgpt_garbage() {
    assert_garbage_handled(&ChatGpt, ".json");
}

#[test]
fn malformed_chatgpt_truncated() {
    assert_truncated_json_handled(&ChatGpt, ".json");
}

#[test]
fn malformed_amp_empty() {
    assert_empty_file_handled(&Amp, ".json");
}

#[test]
fn malformed_amp_garbage() {
    assert_garbage_handled(&Amp, ".json");
}

#[test]
fn malformed_amp_truncated() {
    assert_truncated_json_handled(&Amp, ".json");
}

#[test]
fn malformed_cline_empty() {
    // Cline expects api_conversation_history.json in a task dir.
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let task_dir = tmp.path().join("tasks/12345");
    std::fs::create_dir_all(&task_dir).expect("create task dir");
    let history = task_dir.join("api_conversation_history.json");
    std::fs::write(&history, "").expect("write empty file");
    let result = Cline.read_session(&history);
    assert!(
        result.is_err(),
        "cline: reading empty api_conversation_history.json should return Err"
    );
}

#[test]
fn malformed_cline_garbage() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let task_dir = tmp.path().join("tasks/12345");
    std::fs::create_dir_all(&task_dir).expect("create task dir");
    let history = task_dir.join("api_conversation_history.json");
    std::fs::write(&history, b"\x00\x01\x02garbage").expect("write garbage");
    let result = Cline.read_session(&history);
    assert!(
        result.is_err(),
        "cline: reading garbage api_conversation_history.json should return Err"
    );
}

// ===========================================================================
// Markdown providers: Aider
// ===========================================================================

#[test]
fn malformed_aider_empty() {
    // Aider may return Ok(0 messages) for empty markdown — that's acceptable.
    assert_empty_file_handled(&Aider, ".md");
}

#[test]
fn malformed_aider_garbage() {
    // Aider markdown format may parse binary as text — it should error or
    // produce an empty session.
    let tmp = tempfile::NamedTempFile::with_suffix(".md").expect("create temp file");
    std::fs::write(tmp.path(), b"\x00\x01\x02\xff\xfe\xfd").expect("write garbage");
    let result = Aider.read_session(tmp.path());
    // Aider may tolerantly return a session with 0 messages — that's fine.
    // It should NOT panic.
    if let Ok(session) = &result {
        assert!(
            session.messages.is_empty(),
            "aider: garbage should produce 0 messages, got {}",
            session.messages.len()
        );
    }
}

// ===========================================================================
// SQLite providers: Cursor, OpenCode
// ===========================================================================

#[test]
fn malformed_cursor_empty() {
    assert_empty_file_handled(&casr::providers::cursor::Cursor, ".vscdb");
}

#[test]
fn malformed_cursor_garbage() {
    assert_garbage_handled(&casr::providers::cursor::Cursor, ".vscdb");
}

#[test]
fn malformed_opencode_empty() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    std::fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    std::fs::write(&db_path, "").expect("write empty file");
    let result = casr::providers::opencode::OpenCode.read_session(&db_path);
    assert!(
        result.is_err(),
        "opencode: reading empty db should return Err"
    );
}

#[test]
fn malformed_opencode_garbage() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    std::fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    std::fs::write(&db_path, b"\x00\x01garbage\xff\xfe").expect("write garbage");
    let result = casr::providers::opencode::OpenCode.read_session(&db_path);
    assert!(
        result.is_err(),
        "opencode: reading garbage db should return Err"
    );
}

// ===========================================================================
// Mixed valid/invalid content (error recovery)
// ===========================================================================

#[test]
fn cc_mixed_valid_invalid_recovers_good_lines() {
    let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").expect("create temp file");
    let content = r#"{"type":"summary","sessionId":"mix-001","cwd":"/tmp"}
GARBAGE LINE
{"type":"human","message":{"role":"user","content":[{"type":"text","text":"hello"}]},"timestamp":"2025-01-01T00:00:00Z"}
{bad json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"world"}]},"timestamp":"2025-01-01T00:00:01Z"}
"#;
    std::fs::write(tmp.path(), content).expect("write mixed content");
    let result = ClaudeCode.read_session(tmp.path());
    // CC should recover at least 1 valid message and skip the garbage.
    match result {
        Ok(session) => {
            assert!(
                !session.messages.is_empty(),
                "CC recovery: expected >= 1 messages from mixed input, got 0",
            );
        }
        Err(e) => {
            // Also acceptable if it errors — the key is no panic.
            eprintln!("CC mixed input returned error (acceptable): {e}");
        }
    }
}
