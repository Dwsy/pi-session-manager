//! Integration tests for the fixture corpus.
//!
//! Reads each fixture file through its provider reader and validates
//! the resulting CanonicalSession against the expected canonical summary.

use std::path::{Path, PathBuf};

use casr::model::{CanonicalSession, MessageRole};
use casr::providers::Provider;
use casr::providers::aider::Aider;
use casr::providers::amp::Amp;
use casr::providers::antigravity::Antigravity;
use casr::providers::chatgpt::ChatGpt;
use casr::providers::claude_code::ClaudeCode;
use casr::providers::clawdbot::ClawdBot;
use casr::providers::cline::Cline;
use casr::providers::codex::Codex;
use casr::providers::cursor::Cursor;
use casr::providers::factory::Factory;
use casr::providers::gemini::Gemini;
use casr::providers::grok::Grok;
use casr::providers::openclaw::OpenClaw;
use casr::providers::opencode::OpenCode;
use casr::providers::pi_agent::PiAgent;
use casr::providers::vibe::Vibe;

/// Root of the fixtures directory (relative to workspace root).
fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// Load and parse the expected canonical summary for a fixture.
fn load_expected(fixture_id: &str) -> serde_json::Value {
    let path = fixtures_dir().join(format!("expected/{fixture_id}.json"));
    let content = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("Failed to read expected file for {fixture_id}: {e}"));
    serde_json::from_str(&content).unwrap_or_else(|e| panic!("Failed to parse expected JSON for {fixture_id}: {e}"))
}

/// Assert a session matches its expected canonical summary.
fn assert_session_matches(session: &CanonicalSession, expected: &serde_json::Value, fixture_id: &str) {
    // Provider slug.
    assert_eq!(session.provider_slug, expected["provider_slug"].as_str().unwrap(), "[{fixture_id}] provider_slug mismatch");

    // Session ID.
    assert_eq!(session.session_id, expected["session_id"].as_str().unwrap(), "[{fixture_id}] session_id mismatch");

    // Workspace.
    if expected["workspace"].is_null() {
        assert!(session.workspace.is_none(), "[{fixture_id}] expected workspace=None but got {:?}", session.workspace);
    } else {
        assert_eq!(session.workspace.as_deref(), Some(Path::new(expected["workspace"].as_str().unwrap())), "[{fixture_id}] workspace mismatch");
    }

    // Title.
    if let Some(title_prefix) = expected.get("title_starts_with").and_then(|v| v.as_str()) {
        let title = session.title.as_deref().unwrap_or("");
        assert!(title.starts_with(title_prefix), "[{fixture_id}] title should start with '{title_prefix}' but was '{title}'");
    } else if let Some(expected_title) = expected.get("title").and_then(|v| v.as_str()) {
        assert_eq!(session.title.as_deref(), Some(expected_title), "[{fixture_id}] title mismatch");
    }

    // Message count.
    let expected_count = expected["message_count"].as_u64().unwrap() as usize;
    assert_eq!(session.messages.len(), expected_count, "[{fixture_id}] message_count mismatch (expected {expected_count}, got {})", session.messages.len());

    // Roles.
    if let Some(expected_roles) = expected["roles"].as_array() {
        let actual_roles: Vec<String> = session
            .messages
            .iter()
            .map(|m| match &m.role {
                MessageRole::User => "User".to_string(),
                MessageRole::Assistant => "Assistant".to_string(),
                MessageRole::Tool => "Tool".to_string(),
                MessageRole::System => "System".to_string(),
                MessageRole::Other(s) => format!("Other({s})"),
            })
            .collect();
        let expected_role_strings: Vec<&str> = expected_roles.iter().map(|v| v.as_str().unwrap()).collect();
        assert_eq!(actual_roles, expected_role_strings, "[{fixture_id}] roles mismatch");
    }

    // Timestamps.
    if let Some(started) = expected.get("started_at_present").and_then(|v| v.as_bool()) {
        assert_eq!(session.started_at.is_some(), started, "[{fixture_id}] started_at presence mismatch");
    }
    if let Some(ended) = expected.get("ended_at_present").and_then(|v| v.as_bool()) {
        assert_eq!(session.ended_at.is_some(), ended, "[{fixture_id}] ended_at presence mismatch");
    }

    // Model name.
    if expected["model_name"].is_null() {
        assert!(session.model_name.is_none(), "[{fixture_id}] expected model_name=None but got {:?}", session.model_name);
    } else if let Some(expected_model) = expected["model_name"].as_str() {
        assert_eq!(session.model_name.as_deref(), Some(expected_model), "[{fixture_id}] model_name mismatch");
    }

    // Tool calls presence.
    if let Some(has_tc) = expected.get("has_tool_calls").and_then(|v| v.as_bool()) {
        let actual_has_tc = session.messages.iter().any(|m| !m.tool_calls.is_empty());
        assert_eq!(actual_has_tc, has_tc, "[{fixture_id}] has_tool_calls mismatch");
    }

    // Tool results presence.
    if let Some(has_tr) = expected.get("has_tool_results").and_then(|v| v.as_bool()) {
        let actual_has_tr = session.messages.iter().any(|m| !m.tool_results.is_empty());
        assert_eq!(actual_has_tr, has_tr, "[{fixture_id}] has_tool_results mismatch");
    }

    // Sequential indices.
    for (i, msg) in session.messages.iter().enumerate() {
        assert_eq!(msg.idx, i, "[{fixture_id}] message idx mismatch at position {i}");
    }
}

// ---------------------------------------------------------------------------
// Claude Code fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_cc_simple() {
    let path = fixtures_dir().join("claude_code/cc_simple.jsonl");
    let session = ClaudeCode.read_session(&path).expect("cc_simple should parse");
    let expected = load_expected("cc_simple");
    assert_session_matches(&session, &expected, "cc_simple");
}

#[test]
fn fixture_cc_complex() {
    let path = fixtures_dir().join("claude_code/cc_complex.jsonl");
    let session = ClaudeCode.read_session(&path).expect("cc_complex should parse");
    let expected = load_expected("cc_complex");
    assert_session_matches(&session, &expected, "cc_complex");
}

#[test]
fn fixture_cc_missing_workspace() {
    let path = fixtures_dir().join("claude_code/cc_missing_workspace.jsonl");
    let session = ClaudeCode.read_session(&path).expect("cc_missing_workspace should parse");
    let expected = load_expected("cc_missing_workspace");
    assert_session_matches(&session, &expected, "cc_missing_workspace");
}

#[test]
fn fixture_cc_unicode() {
    let path = fixtures_dir().join("claude_code/cc_unicode.jsonl");
    let session = ClaudeCode.read_session(&path).expect("cc_unicode should parse");
    let expected = load_expected("cc_unicode");
    assert_session_matches(&session, &expected, "cc_unicode");

    // Extra: verify actual unicode content survived.
    assert!(session.messages[0].content.contains("\u{3053}\u{3093}\u{306b}\u{3061}\u{306f}"), "Japanese characters should be preserved");
    assert!(session.messages[1].content.contains("\u{1f680}"), "Emoji should be preserved");
}

#[test]
fn fixture_cc_malformed() {
    let path = fixtures_dir().join("claude_code/cc_malformed.jsonl");
    let session = ClaudeCode.read_session(&path).expect("cc_malformed should parse despite garbage");
    let expected = load_expected("cc_malformed");
    assert_session_matches(&session, &expected, "cc_malformed");
}

// ---------------------------------------------------------------------------
// Codex fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_codex_modern() {
    let path = fixtures_dir().join("codex/codex_modern.jsonl");
    let session = Codex.read_session(&path).expect("codex_modern should parse");
    let expected = load_expected("codex_modern");
    assert_session_matches(&session, &expected, "codex_modern");
}

#[test]
fn fixture_codex_legacy() {
    let path = fixtures_dir().join("codex/codex_legacy.json");
    let session = Codex.read_session(&path).expect("codex_legacy should parse");
    let expected = load_expected("codex_legacy");
    assert_session_matches(&session, &expected, "codex_legacy");
}

#[test]
fn fixture_codex_token_count() {
    let path = fixtures_dir().join("codex/codex_token_count.jsonl");
    let session = Codex.read_session(&path).expect("codex_token_count should parse");
    let expected = load_expected("codex_token_count");
    assert_session_matches(&session, &expected, "codex_token_count");
}

#[test]
fn fixture_codex_reasoning() {
    let path = fixtures_dir().join("codex/codex_reasoning.jsonl");
    let session = Codex.read_session(&path).expect("codex_reasoning should parse");
    let expected = load_expected("codex_reasoning");
    assert_session_matches(&session, &expected, "codex_reasoning");

    // Extra: verify reasoning messages have author="reasoning".
    let reasoning_msgs: Vec<_> = session.messages.iter().filter(|m| m.author.as_deref() == Some("reasoning")).collect();
    assert_eq!(reasoning_msgs.len(), 2, "codex_reasoning should have exactly 2 reasoning messages");
}

#[test]
fn fixture_codex_malformed() {
    let path = fixtures_dir().join("codex/codex_malformed.jsonl");
    let session = Codex.read_session(&path).expect("codex_malformed should parse despite garbage");
    let expected = load_expected("codex_malformed");
    assert_session_matches(&session, &expected, "codex_malformed");
}

// ---------------------------------------------------------------------------
// Gemini fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_gmi_simple() {
    let path = fixtures_dir().join("gemini/gmi_simple.json");
    let session = Gemini.read_session(&path).expect("gmi_simple should parse");
    let expected = load_expected("gmi_simple");
    assert_session_matches(&session, &expected, "gmi_simple");
}

#[test]
fn fixture_gmi_grounding() {
    let path = fixtures_dir().join("gemini/gmi_grounding.json");
    let session = Gemini.read_session(&path).expect("gmi_grounding should parse");
    let expected = load_expected("gmi_grounding");
    assert_session_matches(&session, &expected, "gmi_grounding");

    // Extra: verify grounding metadata is preserved in extra field.
    let model_msgs: Vec<_> = session.messages.iter().filter(|m| m.role == MessageRole::Assistant).collect();
    assert!(model_msgs.iter().any(|m| m.extra.get("groundingMetadata").is_some()), "grounding metadata should be preserved in extra");
}

#[test]
fn fixture_gmi_missing_workspace() {
    let path = fixtures_dir().join("gemini/gmi_missing_workspace.json");
    let session = Gemini.read_session(&path).expect("gmi_missing_workspace should parse");
    let expected = load_expected("gmi_missing_workspace");
    assert_session_matches(&session, &expected, "gmi_missing_workspace");
}

#[test]
fn fixture_gmi_gemini_role() {
    let path = fixtures_dir().join("gemini/gmi_gemini_role.json");
    let session = Gemini.read_session(&path).expect("gmi_gemini_role should parse");
    let expected = load_expected("gmi_gemini_role");
    assert_session_matches(&session, &expected, "gmi_gemini_role");
}

// ---------------------------------------------------------------------------
// Grok Build (grk) fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_grok_simple() {
    let path = fixtures_dir().join("grok/sessions/%2Fdata%2Fprojects%2Fdemo/019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5/updates.jsonl");
    let session = Grok.read_session(&path).expect("grok_simple should parse");
    let expected = load_expected("grok_simple");
    assert_session_matches(&session, &expected, "grok_simple");

    // Chunk coalescing: both user_message_chunk fragments landed in one message.
    assert_eq!(session.messages[0].content, "Run the shell command: echo hi . Then reply with exactly: done");
    // Thought chunk is a separate reasoning-authored assistant message.
    assert_eq!(session.messages[1].author.as_deref(), Some("reasoning"));
    // tool_call + tool_call_update merged into the same assistant message,
    // without breaking agent_message_chunk coalescing around them.
    let tool_msg = &session.messages[2];
    assert_eq!(tool_msg.content, "Running the command now. done");
    assert_eq!(tool_msg.tool_calls.len(), 1);
    assert_eq!(tool_msg.tool_calls[0].id.as_deref(), Some("call_1"));
    assert_eq!(tool_msg.tool_calls[0].name, "Run echo hi");
    assert_eq!(tool_msg.tool_results.len(), 1);
    assert_eq!(tool_msg.tool_results[0].content, "hi\n");
    assert!(!tool_msg.tool_results[0].is_error);

    // Resume command uses the documented flag.
    assert_eq!(Grok.resume_command(&session.session_id), "grok --resume 019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5");

    // The generated title is surfaced as the provider-native session name.
    assert_eq!(casr::model::native_name_from_metadata(&session.metadata).as_deref(), Some("Echo hi probe session"));
}

#[test]
fn fixture_grok_tools_real() {
    let path = fixtures_dir().join("grok/sessions/%2Fdata%2Fprojects%2Fdemo/019fcac9-2222-7333-8444-555566667777/updates.jsonl");
    let session = Grok.read_session(&path).expect("grok_tools_real should parse");
    let expected = load_expected("grok_tools_real");
    assert_session_matches(&session, &expected, "grok_tools_real");

    // Verbatim 0.2.118 shapes: the thought chunk splits from the message
    // chunk (same promptId, different kind)…
    assert_eq!(session.messages[1].author.as_deref(), Some("reasoning"));
    assert_eq!(session.messages[1].content, "The user wants a summary of README.md.");
    // …and the post-tool agent_message_chunk continues the SAME assistant
    // message because the promptId marker is unchanged.
    let tool_msg = &session.messages[2];
    assert_eq!(tool_msg.content, "Reading README.md now. It's a demo project with a short README.");
    assert_eq!(tool_msg.tool_calls.len(), 1);
    // The status-null enrichment update replaced the internal tool name with
    // the human-readable title and the variant-tagged rawInput.
    assert_eq!(tool_msg.tool_calls[0].name, "Read `/data/projects/demo/README.md`");
    assert_eq!(tool_msg.tool_calls[0].arguments["variant"], "ReadFile");
    assert_eq!(tool_msg.tool_results.len(), 1);
    assert_eq!(tool_msg.tool_results[0].content, "1→# Demo\n\nA demo project.\n");
    assert!(!tool_msg.tool_results[0].is_error);

    // The second prompt (promptIndex 1) and its reply (new promptId) are
    // separate messages — the boundary markers break coalescing.
    assert_eq!(session.messages[3].content, "thanks");
    assert_eq!(session.messages[4].content, "You're welcome.");
}

// ---------------------------------------------------------------------------
// Antigravity (agy) fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_agy_simple() {
    let path = fixtures_dir().join("antigravity/antigravity-cli/conversations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.db");
    let session = Antigravity.read_session(&path).expect("agy_simple should parse");
    let expected = load_expected("agy_simple");
    assert_session_matches(&session, &expected, "agy_simple");

    // Extra: the resume command must pin the mandated model and use --conversation.
    let resume = Antigravity.resume_command(&session.session_id);
    assert_eq!(resume, "agy --conversation aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee --model \"Gemini 3.1 Pro (High)\"");

    // Extra: the tool-only planner step extracted its tool call.
    assert!(session.messages.iter().any(|m| m.tool_calls.iter().any(|tc| tc.name == "view_file")), "agy_simple should surface the view_file tool call");
}

/// Disambiguation: a legacy gmi `tmp/.../chats/session-*.json` sibling under the
/// SAME `~/.gemini`-equivalent parent must NOT be enumerated by the agy provider.
#[test]
fn fixture_agy_does_not_list_legacy_gmi_sessions() {
    let gemini_home = fixtures_dir().join("antigravity");
    // SAFETY: env mutation in a test; casr fixture tests use HOME overrides.
    unsafe {
        std::env::set_var("GEMINI_HOME", &gemini_home);
    }

    let sessions = Antigravity.list_sessions().expect("agy list_sessions returns Some");
    let ids: Vec<String> = sessions.into_iter().map(|(id, _)| id).collect();

    assert!(ids.contains(&"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee".to_string()), "agy should list its own conversation uuid: {ids:?}");
    assert!(!ids.iter().any(|id| id.contains("gmi-legacy")), "agy must NOT list the legacy gmi session: {ids:?}");

    // And the gmi provider must NOT list the agy conversation uuid.
    let gmi_sessions = Gemini.list_sessions().expect("gmi list_sessions returns Some");
    let gmi_ids: Vec<String> = gmi_sessions.into_iter().map(|(id, _)| id).collect();
    assert!(gmi_ids.contains(&"gmi-legacy-001".to_string()), "gmi should list its own legacy session: {gmi_ids:?}");
    assert!(!gmi_ids.iter().any(|id| id.contains("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")), "gmi must NOT list the agy conversation uuid: {gmi_ids:?}");

    unsafe {
        std::env::remove_var("GEMINI_HOME");
    }
}

// ---------------------------------------------------------------------------
// Cline fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_cline_simple() {
    let path = fixtures_dir().join("cline/tasks/1700001234567/api_conversation_history.json");
    let session = Cline.read_session(&path).expect("cline_simple should parse");
    let expected = load_expected("cline_simple");
    assert_session_matches(&session, &expected, "cline_simple");
}

// ---------------------------------------------------------------------------
// Amp fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_amp_simple() {
    let path = fixtures_dir().join("amp/T-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json");
    let session = Amp.read_session(&path).expect("amp_simple should parse");
    let expected = load_expected("amp_simple");
    assert_session_matches(&session, &expected, "amp_simple");
}

// ---------------------------------------------------------------------------
// Aider fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_aider_simple() {
    let path = fixtures_dir().join("aider/aider_simple.md");
    let session = Aider.read_session(&path).expect("aider_simple should parse");
    let expected = load_expected("aider_simple");
    assert_session_matches(&session, &expected, "aider_simple");
}

// ---------------------------------------------------------------------------
// ChatGPT fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_chatgpt_simple() {
    let path = fixtures_dir().join("chatgpt/chatgpt_simple.json");
    let session = ChatGpt.read_session(&path).expect("chatgpt_simple should parse");
    let expected = load_expected("chatgpt_simple");
    assert_session_matches(&session, &expected, "chatgpt_simple");
}

// ---------------------------------------------------------------------------
// ClawdBot fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_clawdbot_simple() {
    let path = fixtures_dir().join("clawdbot/clawdbot_simple.jsonl");
    let session = ClawdBot.read_session(&path).expect("clawdbot_simple should parse");
    let expected = load_expected("clawdbot_simple");
    assert_session_matches(&session, &expected, "clawdbot_simple");
}

// ---------------------------------------------------------------------------
// Vibe fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_vibe_simple() {
    let path = fixtures_dir().join("vibe/messages.jsonl");
    let session = Vibe.read_session(&path).expect("vibe_simple should parse");
    let expected = load_expected("vibe_simple");
    assert_session_matches(&session, &expected, "vibe_simple");
}

// ---------------------------------------------------------------------------
// Factory fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_factory_simple() {
    let path = fixtures_dir().join("factory/factory_simple.jsonl");
    let session = Factory.read_session(&path).expect("factory_simple should parse");
    let expected = load_expected("factory_simple");
    assert_session_matches(&session, &expected, "factory_simple");
}

// ---------------------------------------------------------------------------
// OpenClaw fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_openclaw_simple() {
    let path = fixtures_dir().join("openclaw/openclaw_simple.jsonl");
    let session = OpenClaw.read_session(&path).expect("openclaw_simple should parse");
    let expected = load_expected("openclaw_simple");
    assert_session_matches(&session, &expected, "openclaw_simple");

    // Extra: verify tool calls were extracted.
    let tc_msgs: Vec<_> = session.messages.iter().filter(|m| !m.tool_calls.is_empty()).collect();
    assert!(!tc_msgs.is_empty(), "openclaw_simple should have messages with tool calls");
}

// ---------------------------------------------------------------------------
// Pi-Agent fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_piagent_simple() {
    let path = fixtures_dir().join("pi_agent/2025-12-01T10-00-00_pi-uuid-001.jsonl");
    let session = PiAgent.read_session(&path).expect("piagent_simple should parse");
    let expected = load_expected("piagent_simple");
    assert_session_matches(&session, &expected, "piagent_simple");

    // Extra: verify toolResult role was normalized to Tool.
    let tool_msgs: Vec<_> = session.messages.iter().filter(|m| m.role == casr::model::MessageRole::Tool).collect();
    assert!(!tool_msgs.is_empty(), "piagent_simple should have Tool role messages (from toolResult)");
}

// ---------------------------------------------------------------------------
// SQLite provider fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_cur_simple() {
    let path = fixtures_dir().join("cursor/state.vscdb");
    let session = Cursor.read_session(&path).expect("cur_simple should parse");
    let expected = load_expected("cur_simple");
    assert_session_matches(&session, &expected, "cur_simple");
}

#[test]
fn fixture_opc_simple() {
    let path = fixtures_dir().join("opencode/.opencode/opencode.db");
    let session = OpenCode.read_session(&path).expect("opc_simple should parse");
    let expected = load_expected("opc_simple");

    // Workspace is derived from db_path parent — skip the assertion in
    // assert_session_matches by patching expected to match the actual value.
    let expected_workspace = fixtures_dir().join("opencode");
    assert_eq!(session.workspace.as_deref(), Some(expected_workspace.as_path()), "[opc_simple] workspace should be parent of .opencode/");
    let mut patched = expected.clone();
    patched["workspace"] = serde_json::Value::String(expected_workspace.to_string_lossy().into_owned());
    assert_session_matches(&session, &patched, "opc_simple");
}

// ---------------------------------------------------------------------------
// Edge-case fixtures
// ---------------------------------------------------------------------------

#[test]
fn fixture_edge_empty_content_cc() {
    let path = fixtures_dir().join("edge/edge_empty_content_cc.jsonl");
    let session = ClaudeCode.read_session(&path).expect("edge_empty_content should parse");
    let expected = load_expected("edge_empty_content_cc");
    assert_session_matches(&session, &expected, "edge_empty_content_cc");
}

#[test]
fn fixture_edge_null_timestamps_cc() {
    let path = fixtures_dir().join("edge/edge_null_timestamps_cc.jsonl");
    let session = ClaudeCode.read_session(&path).expect("edge_null_timestamps should parse");
    let expected = load_expected("edge_null_timestamps_cc");
    assert_session_matches(&session, &expected, "edge_null_timestamps_cc");

    // Extra: all message timestamps should be None.
    for msg in &session.messages {
        assert!(msg.timestamp.is_none(), "All message timestamps should be None in edge_null_timestamps fixture");
    }
}

#[test]
fn fixture_edge_long_message_cc() {
    let path = fixtures_dir().join("edge/edge_long_message_cc.jsonl");
    let session = ClaudeCode.read_session(&path).expect("edge_long_message should parse");
    let expected = load_expected("edge_long_message_cc");
    assert_session_matches(&session, &expected, "edge_long_message_cc");

    // Extra: verify the long content is preserved without truncation.
    assert!(session.messages[0].content.len() > 900, "Long message should be preserved without truncation");
    assert!(session.messages[0].content.contains("end of long content."), "Long message should contain the full text including end marker");
}

#[test]
fn fixture_edge_single_sided_cc() {
    let path = fixtures_dir().join("edge/edge_single_sided_cc.jsonl");
    let session = ClaudeCode.read_session(&path).expect("edge_single_sided should parse");
    let expected = load_expected("edge_single_sided_cc");
    assert_session_matches(&session, &expected, "edge_single_sided_cc");

    // Extra: verify validation flags this as an error.
    let validation = casr::pipeline::validate_session(&session);
    assert!(validation.has_errors(), "Single-sided session should produce validation errors");
}

// ---------------------------------------------------------------------------
// Manifest integrity test
// ---------------------------------------------------------------------------

#[test]
fn manifest_all_fixtures_have_expected_files() {
    let manifest_path = fixtures_dir().join("fixtures_manifest.json");
    let content = std::fs::read_to_string(&manifest_path).expect("manifest should exist");
    let manifest: serde_json::Value = serde_json::from_str(&content).expect("manifest should be valid JSON");

    let fixtures = manifest["fixtures"].as_object().expect("fixtures should be an object");
    for (fixture_id, entry) in fixtures {
        let fixture_path = fixtures_dir().join(entry["path"].as_str().unwrap());
        assert!(fixture_path.exists(), "Fixture file missing for {fixture_id}: {}", fixture_path.display());

        let expected_path = fixtures_dir().join(entry["expected"].as_str().unwrap());
        assert!(expected_path.exists(), "Expected file missing for {fixture_id}: {}", expected_path.display());
    }
}
