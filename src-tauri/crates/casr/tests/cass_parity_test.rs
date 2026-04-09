//! CASS parity regression suite for provider readers.
//!
//! Asserts casr reader behavior stays aligned with CASS-derived parsing
//! expectations for Claude Code, Codex, and Gemini.
//!
//! Unlike `fixtures_test.rs` (which checks structural summaries), this suite
//! validates **field-level content parity** per message: exact content strings,
//! timestamp values, author fields, tool call/result structures, extra field
//! preservation, and metadata keys.
//!
//! See `docs/cass-porting-notes.md` for documented divergences.

use std::path::{Path, PathBuf};

use casr::model::{
    CanonicalMessage, CanonicalSession, MessageRole, flatten_content, normalize_role,
    parse_timestamp, truncate_title,
};
use casr::providers::Provider;
use casr::providers::claude_code::ClaudeCode;
use casr::providers::codex::Codex;
use casr::providers::gemini::Gemini;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// Helper: parse an ISO-8601 string to epoch millis the same way casr does.
fn iso_to_millis(s: &str) -> i64 {
    parse_timestamp(&serde_json::Value::String(s.to_string()))
        .unwrap_or_else(|| panic!("Failed to parse timestamp: {s}"))
}

/// Helper: parse a float epoch-seconds value to millis the same way casr does.
fn float_secs_to_millis(secs: f64) -> i64 {
    parse_timestamp(&serde_json::json!(secs))
        .unwrap_or_else(|| panic!("Failed to parse float timestamp: {secs}"))
}

/// Helper: parse integer epoch-seconds to millis the same way casr does.
fn int_secs_to_millis(secs: i64) -> i64 {
    parse_timestamp(&serde_json::json!(secs))
        .unwrap_or_else(|| panic!("Failed to parse int timestamp: {secs}"))
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-message content assertion helpers
// ═══════════════════════════════════════════════════════════════════════════

/// Deep comparison of a single message against expected values.
struct MessageExpectation<'a> {
    idx: usize,
    role: MessageRole,
    content_contains: &'a [&'a str],
    content_exact: Option<&'a str>,
    timestamp_millis: Option<i64>,
    author: Option<&'a str>,
    tool_call_names: &'a [&'a str],
    tool_result_count: usize,
    extra_keys: &'a [&'a str],
}

impl<'a> MessageExpectation<'a> {
    fn assert_matches(&self, msg: &CanonicalMessage, fixture_id: &str) {
        let ctx = format!("[{fixture_id}] msg[{}]", self.idx);
        assert_eq!(msg.idx, self.idx, "{ctx} idx mismatch");
        assert_eq!(msg.role, self.role, "{ctx} role mismatch");

        if let Some(exact) = self.content_exact {
            assert_eq!(msg.content, exact, "{ctx} content exact mismatch");
        }
        for needle in self.content_contains {
            assert!(
                msg.content.contains(needle),
                "{ctx} content should contain '{needle}' but was: '{}'",
                &msg.content[..msg.content.len().min(200)]
            );
        }

        if let Some(expected_ts) = self.timestamp_millis {
            let actual_ts = msg
                .timestamp
                .unwrap_or_else(|| panic!("{ctx} expected timestamp {expected_ts} but got None"));
            // Allow 1ms tolerance for float rounding.
            assert!(
                (actual_ts - expected_ts).abs() <= 1,
                "{ctx} timestamp mismatch: expected {expected_ts}, got {actual_ts}"
            );
        } else {
            assert!(msg.timestamp.is_none(), "{ctx} expected None timestamp");
        }

        assert_eq!(msg.author.as_deref(), self.author, "{ctx} author mismatch");

        let actual_tc_names: Vec<&str> = msg.tool_calls.iter().map(|tc| tc.name.as_str()).collect();
        let expected_tc: Vec<&str> = self.tool_call_names.to_vec();
        assert_eq!(
            actual_tc_names, expected_tc,
            "{ctx} tool_call names mismatch"
        );

        assert_eq!(
            msg.tool_results.len(),
            self.tool_result_count,
            "{ctx} tool_result count mismatch"
        );

        for key in self.extra_keys {
            assert!(
                msg.extra.get(key).is_some(),
                "{ctx} expected extra key '{key}' to be present"
            );
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude Code deep parity
// ═══════════════════════════════════════════════════════════════════════════

mod cc_parity {
    use super::*;

    fn read_cc(name: &str) -> CanonicalSession {
        let path = fixtures_dir().join(format!("claude_code/{name}.jsonl"));
        ClaudeCode
            .read_session(&path)
            .unwrap_or_else(|e| panic!("Failed to read {name}: {e}"))
    }

    #[test]
    fn cc_simple_deep_content() {
        let s = read_cc("cc_simple");

        assert_eq!(s.session_id, "cc-simple-001");
        assert_eq!(s.provider_slug, "claude-code");
        assert_eq!(
            s.workspace.as_deref(),
            Some(Path::new("/data/projects/myapp"))
        );
        assert_eq!(s.title.as_deref(), Some("Fix the login bug in auth.rs"));
        assert_eq!(s.model_name.as_deref(), Some("claude-sonnet-4-5-20250929"));

        let ts = |iso: &str| Some(iso_to_millis(iso));

        let expectations = [
            MessageExpectation {
                idx: 0,
                role: MessageRole::User,
                content_exact: Some("Fix the login bug in auth.rs"),
                content_contains: &[],
                timestamp_millis: ts("2026-01-15T10:00:00.000Z"),
                author: None, // User messages have no model.
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type", "uuid", "sessionId"],
            },
            MessageExpectation {
                idx: 1,
                role: MessageRole::Assistant,
                content_exact: Some(
                    "I found the issue in auth.rs. The token validation was using an expired key.",
                ),
                content_contains: &[],
                timestamp_millis: ts("2026-01-15T10:00:05.000Z"),
                // CC reader extracts message.model as author for assistants.
                author: Some("claude-sonnet-4-5-20250929"),
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type", "uuid"],
            },
            MessageExpectation {
                idx: 2,
                role: MessageRole::User,
                content_exact: Some("Great, can you also add a test for it?"),
                content_contains: &[],
                timestamp_millis: ts("2026-01-15T10:01:00.000Z"),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type", "uuid"],
            },
            MessageExpectation {
                idx: 3,
                role: MessageRole::Assistant,
                content_contains: &["auth_test.rs", "valid and expired keys"],
                content_exact: None,
                timestamp_millis: ts("2026-01-15T10:01:30.000Z"),
                author: Some("claude-sonnet-4-5-20250929"),
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type", "uuid"],
            },
        ];

        assert_eq!(s.messages.len(), expectations.len());
        for (msg, exp) in s.messages.iter().zip(expectations.iter()) {
            exp.assert_matches(msg, "cc_simple");
        }

        // Session-level timestamps.
        assert_eq!(s.started_at, ts("2026-01-15T10:00:00.000Z"));
        assert_eq!(s.ended_at, ts("2026-01-15T10:01:30.000Z"));
    }

    #[test]
    fn cc_complex_tool_calls_and_filtering() {
        let s = read_cc("cc_complex");

        assert_eq!(s.session_id, "cc-complex-001");
        assert_eq!(
            s.workspace.as_deref(),
            Some(Path::new("/data/projects/webapp"))
        );
        assert_eq!(s.model_name.as_deref(), Some("claude-sonnet-4-5-20250929"));

        // CASR divergence: tool_result-only user messages are preserved
        // so they can be resumed. File-history-snapshot is skipped.
        // Original 7 lines → 6 canonical messages.
        assert_eq!(s.messages.len(), 6);

        // msg[0]: user text request.
        assert_eq!(s.messages[0].role, MessageRole::User);
        assert_eq!(
            s.messages[0].content,
            "Refactor the API handler to use async/await"
        );

        // msg[1]: assistant with Read tool_use.
        assert_eq!(s.messages[1].role, MessageRole::Assistant);
        assert!(s.messages[1].content.contains("read the current handler"));
        assert_eq!(s.messages[1].tool_calls.len(), 1);
        assert_eq!(s.messages[1].tool_calls[0].name, "Read");
        assert_eq!(
            s.messages[1].tool_calls[0].id.as_deref(),
            Some("tool-read-1")
        );

        // msg[2]: user with tool_result.
        assert_eq!(s.messages[2].role, MessageRole::User);
        assert_eq!(s.messages[2].tool_results.len(), 1);
        assert_eq!(
            s.messages[2].tool_results[0].call_id.as_deref(),
            Some("tool-read-1")
        );

        // msg[3]: assistant with Edit tool_use.
        assert_eq!(s.messages[3].role, MessageRole::Assistant);
        assert!(s.messages[3].content.contains("convert this to async"));
        assert_eq!(s.messages[3].tool_calls.len(), 1);
        assert_eq!(s.messages[3].tool_calls[0].name, "Edit");

        // msg[4]: user with tool_result.
        assert_eq!(s.messages[4].role, MessageRole::User);
        assert_eq!(s.messages[4].tool_results.len(), 1);
        assert_eq!(
            s.messages[4].tool_results[0].call_id.as_deref(),
            Some("tool-edit-1")
        );

        // msg[5]: final assistant text.
        assert_eq!(s.messages[5].role, MessageRole::Assistant);
        assert!(s.messages[5].content.contains("handler is now async"));
        assert!(s.messages[5].tool_calls.is_empty());

        // Verify sequential idx after filtering.
        for (i, msg) in s.messages.iter().enumerate() {
            assert_eq!(msg.idx, i, "idx should be sequential after reindexing");
        }
    }

    #[test]
    fn cc_simple_metadata_structure() {
        let s = read_cc("cc_simple");

        // Session-level metadata should contain provider-specific keys.
        let meta = s
            .metadata
            .as_object()
            .expect("metadata should be an object");
        // Claude Code reader stores claudeVersion and gitBranch in metadata.
        assert!(
            meta.contains_key("claudeVersion") || meta.contains_key("gitBranch"),
            "metadata should contain Claude-specific keys: {meta:?}"
        );
    }

    #[test]
    fn cc_simple_extra_preserves_native_fields() {
        let s = read_cc("cc_simple");

        // Every message's extra field should preserve the original JSONL entry.
        for msg in &s.messages {
            let extra = msg.extra.as_object().expect("extra should be an object");
            // Claude Code native fields we expect in extra.
            assert!(extra.contains_key("uuid"), "extra should contain uuid");
            assert!(extra.contains_key("type"), "extra should contain type");
            assert!(
                extra.contains_key("sessionId"),
                "extra should contain sessionId"
            );
        }
    }

    #[test]
    fn cc_unicode_content_fidelity() {
        let s = read_cc("cc_unicode");

        assert_eq!(s.messages.len(), 2);

        // User message: Japanese + Chinese.
        assert!(
            s.messages[0]
                .content
                .contains("\u{3053}\u{3093}\u{306b}\u{3061}\u{306f}")
        );
        assert!(
            s.messages[0]
                .content
                .contains("\u{4f60}\u{597d}\u{4e16}\u{754c}")
        );

        // Assistant message: includes emoji.
        assert!(s.messages[1].content.contains("\u{1f680}"));
        assert!(s.messages[1].content.contains("\u{1f31f}"));
        assert!(s.messages[1].content.contains("\u{1f4bb}"));
    }

    #[test]
    fn cc_malformed_skips_garbage_preserves_valid() {
        let s = read_cc("cc_malformed");

        // 7 lines in fixture: 1 valid, 1 garbage, 1 truncated JSON, 1 blank,
        // 3 more valid = 4 conversational messages.
        assert_eq!(s.messages.len(), 4);
        assert_eq!(s.messages[0].role, MessageRole::User);
        assert_eq!(s.messages[0].content, "First valid message");
        assert_eq!(s.messages[3].role, MessageRole::Assistant);
    }

    #[test]
    fn cc_missing_workspace_returns_none() {
        let s = read_cc("cc_missing_workspace");
        assert!(
            s.workspace.is_none(),
            "workspace should be None when no cwd"
        );
    }

    #[test]
    fn cc_entry_type_filtering_parity() {
        // CASS parity: only "user" and "assistant" entry types produce messages.
        // "file-history-snapshot", "summary", etc. are skipped.
        let s = read_cc("cc_complex");
        for msg in &s.messages {
            let entry_type = msg
                .extra
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            assert!(
                entry_type == "user" || entry_type == "assistant",
                "Only user/assistant entry types should produce messages, got: {entry_type}"
            );
        }
    }

    #[test]
    fn cc_model_name_is_most_common() {
        // CASS parity: model_name should be the most frequently occurring model
        // across assistant messages.
        let s = read_cc("cc_simple");
        assert_eq!(s.model_name.as_deref(), Some("claude-sonnet-4-5-20250929"));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Codex deep parity
// ═══════════════════════════════════════════════════════════════════════════

mod codex_parity {
    use super::*;

    fn read_codex(name: &str) -> CanonicalSession {
        let ext = if name == "codex_legacy" {
            "json"
        } else {
            "jsonl"
        };
        let path = fixtures_dir().join(format!("codex/{name}.{ext}"));
        Codex
            .read_session(&path)
            .unwrap_or_else(|e| panic!("Failed to read {name}: {e}"))
    }

    #[test]
    fn codex_modern_deep_content() {
        let s = read_codex("codex_modern");

        assert_eq!(s.session_id, "codex-modern-001");
        assert_eq!(s.provider_slug, "codex");
        assert_eq!(
            s.workspace.as_deref(),
            Some(Path::new("/data/projects/backend"))
        );

        let ts = |secs: f64| Some(float_secs_to_millis(secs));

        let expectations = [
            MessageExpectation {
                idx: 0,
                role: MessageRole::User,
                content_exact: Some("Optimize the database query in users.rs"),
                content_contains: &[],
                timestamp_millis: ts(1_737_100_001.0),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &[],
            },
            MessageExpectation {
                idx: 1,
                role: MessageRole::Assistant,
                content_contains: &["index hint", "batching"],
                content_exact: None,
                timestamp_millis: ts(1_737_100_010.0),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &[],
            },
            MessageExpectation {
                idx: 2,
                role: MessageRole::User,
                content_exact: Some("Can you also add connection pooling?"),
                content_contains: &[],
                timestamp_millis: ts(1_737_100_020.0),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &[],
            },
            MessageExpectation {
                idx: 3,
                role: MessageRole::Assistant,
                content_contains: &["connection pool", "r2d2"],
                content_exact: None,
                timestamp_millis: ts(1_737_100_030.0),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &[],
            },
        ];

        assert_eq!(s.messages.len(), expectations.len());
        for (msg, exp) in s.messages.iter().zip(expectations.iter()) {
            exp.assert_matches(msg, "codex_modern");
        }
    }

    #[test]
    fn codex_legacy_deep_content() {
        let s = read_codex("codex_legacy");

        assert_eq!(s.session_id, "codex-legacy-001");
        assert_eq!(
            s.workspace.as_deref(),
            Some(Path::new("/data/projects/oldproject"))
        );

        // Legacy timestamps are integer seconds: 1736900000, etc.
        let ts = |secs: i64| Some(int_secs_to_millis(secs));

        assert_eq!(s.messages.len(), 4);
        assert_eq!(s.messages[0].content, "Migrate from Python 2 to Python 3");
        assert_eq!(s.messages[0].timestamp, ts(1_736_900_000));
        assert_eq!(s.messages[1].timestamp, ts(1_736_900_010));
        assert_eq!(s.messages[2].timestamp, ts(1_736_900_020));
        assert_eq!(s.messages[3].timestamp, ts(1_736_900_030));
    }

    #[test]
    fn codex_reasoning_messages_have_author() {
        let s = read_codex("codex_reasoning");

        assert_eq!(s.messages.len(), 6);

        // Expected sequence: User, Reasoning(Assistant), Assistant, User,
        //                    Reasoning(Assistant), Assistant.
        let expected_authors: Vec<Option<&str>> = vec![
            None,              // User
            Some("reasoning"), // agent_reasoning
            None,              // response_item
            None,              // User
            Some("reasoning"), // agent_reasoning
            None,              // response_item
        ];

        for (msg, expected_author) in s.messages.iter().zip(expected_authors.iter()) {
            assert_eq!(
                msg.author.as_deref(),
                *expected_author,
                "msg[{}] author mismatch",
                msg.idx
            );
        }

        // Reasoning messages should have Assistant role.
        let reasoning_msgs: Vec<&CanonicalMessage> = s
            .messages
            .iter()
            .filter(|m| m.author.as_deref() == Some("reasoning"))
            .collect();
        assert_eq!(reasoning_msgs.len(), 2);
        for rm in &reasoning_msgs {
            assert_eq!(rm.role, MessageRole::Assistant);
        }
    }

    #[test]
    fn codex_token_count_events_skipped() {
        let s = read_codex("codex_token_count");

        // token_count events are non-conversational and should be skipped.
        // 7 lines in fixture → 4 conversational messages (2 user, 2 assistant).
        assert_eq!(s.messages.len(), 4);
        let roles: Vec<&MessageRole> = s.messages.iter().map(|m| &m.role).collect();
        assert_eq!(
            roles,
            vec![
                &MessageRole::User,
                &MessageRole::Assistant,
                &MessageRole::User,
                &MessageRole::Assistant
            ]
        );
    }

    #[test]
    fn codex_modern_timestamp_float_normalization() {
        // CASS parity: Codex modern format uses float seconds (e.g. 1737100001.0).
        // These should be converted to millis: 1737100001.0 * 1000 = 1737100001000.
        let s = read_codex("codex_modern");
        let first_ts = s.messages[0]
            .timestamp
            .expect("first msg should have timestamp");
        // 1737100001.0 seconds → 1737100001000 millis.
        assert_eq!(first_ts, 1_737_100_001_000);
    }

    #[test]
    fn codex_legacy_timestamp_int_normalization() {
        // CASS parity: Codex legacy timestamps are integer seconds.
        // 1736900000 < 100_000_000_000 → seconds → × 1000 = 1736900000000.
        let s = read_codex("codex_legacy");
        let first_ts = s.messages[0]
            .timestamp
            .expect("first msg should have timestamp");
        assert_eq!(first_ts, 1_736_900_000_000);
    }

    #[test]
    fn codex_malformed_skips_garbage() {
        let s = read_codex("codex_malformed");
        assert_eq!(s.messages.len(), 4);
        assert_eq!(s.messages[0].role, MessageRole::User);
    }

    #[test]
    fn codex_session_meta_workspace_extraction() {
        // CASS parity: workspace is extracted from session_meta.payload.cwd.
        let s = read_codex("codex_modern");
        assert_eq!(
            s.workspace.as_deref(),
            Some(Path::new("/data/projects/backend"))
        );
    }

    #[test]
    fn codex_modern_content_flattening_input_text() {
        // CASS parity: Codex response_item content uses {type:"input_text", text:"..."}
        // blocks. flatten_content should extract the text field.
        let s = read_codex("codex_modern");
        // Second message is the first assistant response.
        assert!(
            s.messages[1].content.contains("index hint"),
            "input_text blocks should be flattened correctly"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Gemini deep parity
// ═══════════════════════════════════════════════════════════════════════════

mod gemini_parity {
    use super::*;

    fn read_gemini(name: &str) -> CanonicalSession {
        let path = fixtures_dir().join(format!("gemini/{name}.json"));
        Gemini
            .read_session(&path)
            .unwrap_or_else(|e| panic!("Failed to read {name}: {e}"))
    }

    #[test]
    fn gmi_simple_deep_content() {
        let s = read_gemini("gmi_simple");

        assert_eq!(s.session_id, "gmi-simple-001");
        assert_eq!(s.provider_slug, "gemini");
        // Gemini simple has no workspace-inferrable paths in content.
        assert!(s.workspace.is_none());

        let ts = |iso: &str| Some(iso_to_millis(iso));

        let expectations = [
            MessageExpectation {
                idx: 0,
                role: MessageRole::User,
                content_exact: Some("Create a REST API endpoint for user profiles"),
                content_contains: &[],
                timestamp_millis: ts("2026-01-14T16:00:00.000Z"),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type"],
            },
            MessageExpectation {
                idx: 1,
                role: MessageRole::Assistant,
                content_contains: &["/api/users/:id", "GET", "PUT", "DELETE"],
                content_exact: None,
                timestamp_millis: ts("2026-01-14T16:00:30.000Z"),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type"],
            },
            MessageExpectation {
                idx: 2,
                role: MessageRole::User,
                content_exact: Some("Add input validation too"),
                content_contains: &[],
                timestamp_millis: ts("2026-01-14T16:02:00.000Z"),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type"],
            },
            MessageExpectation {
                idx: 3,
                role: MessageRole::Assistant,
                content_contains: &["validation", "email", "username"],
                content_exact: None,
                timestamp_millis: ts("2026-01-14T16:03:00.000Z"),
                author: None,
                tool_call_names: &[],
                tool_result_count: 0,
                extra_keys: &["type"],
            },
        ];

        assert_eq!(s.messages.len(), expectations.len());
        for (msg, exp) in s.messages.iter().zip(expectations.iter()) {
            exp.assert_matches(msg, "gmi_simple");
        }
    }

    #[test]
    fn gmi_model_role_normalized_to_assistant() {
        // CASS parity: Gemini "model" type → Assistant role.
        let s = read_gemini("gmi_simple");
        for msg in &s.messages {
            match &msg.role {
                MessageRole::User | MessageRole::Assistant => {}
                other => panic!("Unexpected role in gmi_simple: {other:?}"),
            }
        }
        // Second message should be assistant (was "model" in native format).
        assert_eq!(s.messages[1].role, MessageRole::Assistant);
    }

    #[test]
    fn gmi_gemini_role_normalized_to_assistant() {
        // CASS parity: Gemini "gemini" type → Assistant role.
        let s = read_gemini("gmi_gemini_role");
        assert_eq!(s.messages.len(), 4);
        assert_eq!(s.messages[1].role, MessageRole::Assistant);
        assert_eq!(s.messages[3].role, MessageRole::Assistant);
    }

    #[test]
    fn gmi_grounding_metadata_preserved_in_extra() {
        // CASS parity: groundingMetadata and citations preserved in extra.
        let s = read_gemini("gmi_grounding");
        let assistant_msgs: Vec<&CanonicalMessage> = s
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::Assistant)
            .collect();

        assert_eq!(assistant_msgs.len(), 2);
        for msg in &assistant_msgs {
            assert!(
                msg.extra.get("groundingMetadata").is_some(),
                "msg[{}] should have groundingMetadata in extra",
                msg.idx
            );
            assert!(
                msg.extra.get("citations").is_some(),
                "msg[{}] should have citations in extra",
                msg.idx
            );
        }
    }

    #[test]
    fn gmi_grounding_content_flattens_mixed_blocks() {
        // Content is array: [{type:"text", text:"..."}, {type:"grounding", ...}].
        // CASS parity: text blocks are extracted, grounding blocks fall through
        // to the catch-all (no "text" key on grounding blocks).
        let s = read_gemini("gmi_grounding");
        let first_assistant = &s.messages[1];
        assert!(
            first_assistant.content.contains("Rust 2024 edition"),
            "Text content should be extracted from array blocks"
        );
    }

    #[test]
    fn gmi_session_level_timestamps() {
        let s = read_gemini("gmi_simple");
        let started = iso_to_millis("2026-01-14T16:00:00.000Z");
        let ended = iso_to_millis("2026-01-14T16:03:00.000Z");
        // ended_at should be max(lastUpdated, max message timestamps).
        assert_eq!(s.started_at, Some(started));
        // The lastUpdated is 16:05:00 but the last message is 16:03:00.
        // Depending on implementation: ended_at could be whichever is later.
        assert!(
            s.ended_at.is_some(),
            "ended_at should be set from timestamps"
        );
        let ended_at = s.ended_at.unwrap();
        assert!(
            ended_at >= ended,
            "ended_at should be at least as late as last message"
        );
    }

    #[test]
    fn gmi_missing_workspace_returns_none() {
        let s = read_gemini("gmi_missing_workspace");
        assert!(
            s.workspace.is_none(),
            "workspace should be None when no paths in content"
        );
    }

    #[test]
    fn gmi_session_id_from_json_field() {
        // CASS parity: sessionId from JSON top-level field.
        let s = read_gemini("gmi_simple");
        assert_eq!(s.session_id, "gmi-simple-001");
    }

    #[test]
    fn gmi_project_hash_in_metadata() {
        // Gemini sessions may have projectHash in the JSON. If present, it
        // should be captured in metadata.
        let s = read_gemini("gmi_grounding");
        // gmi_grounding fixture doesn't have projectHash, so this tests
        // graceful absence. The metadata should still be an object.
        assert!(s.metadata.is_object());
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Edge case parity
// ═══════════════════════════════════════════════════════════════════════════

mod edge_parity {
    use super::*;

    fn read_edge_cc(name: &str) -> CanonicalSession {
        let path = fixtures_dir().join(format!("edge/{name}.jsonl"));
        ClaudeCode
            .read_session(&path)
            .unwrap_or_else(|e| panic!("Failed to read {name}: {e}"))
    }

    #[test]
    fn edge_empty_content_messages_skipped() {
        // CASS parity: empty/whitespace content → skip the message.
        let s = read_edge_cc("edge_empty_content_cc");
        assert_eq!(s.messages.len(), 2);
        // Every surviving message has non-empty content.
        for msg in &s.messages {
            assert!(
                !msg.content.trim().is_empty(),
                "msg[{}] should have non-empty content",
                msg.idx
            );
        }
    }

    #[test]
    fn edge_null_timestamps_all_none() {
        // CASS parity: missing timestamps → None, not zero or default.
        let s = read_edge_cc("edge_null_timestamps_cc");
        assert_eq!(s.messages.len(), 4);
        for msg in &s.messages {
            assert!(
                msg.timestamp.is_none(),
                "msg[{}] timestamp should be None",
                msg.idx
            );
        }
        assert!(s.started_at.is_none());
        assert!(s.ended_at.is_none());
    }

    #[test]
    fn edge_long_message_no_truncation() {
        // CASS parity: message content is never truncated (only title is).
        let s = read_edge_cc("edge_long_message_cc");
        assert!(s.messages[0].content.len() > 900);
        assert!(s.messages[0].content.contains("end of long content."));
    }

    #[test]
    fn edge_single_sided_user_only() {
        // CASS parity: all-user sessions are parsed (not rejected at read time).
        let s = read_edge_cc("edge_single_sided_cc");
        assert_eq!(s.messages.len(), 3);
        for msg in &s.messages {
            assert_eq!(msg.role, MessageRole::User);
        }
        // model_name should be None (no assistant messages → no model).
        assert!(s.model_name.is_none());
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CASS normalization function parity
// ═══════════════════════════════════════════════════════════════════════════

mod normalization_parity {
    use super::*;
    use serde_json::json;

    // --- flatten_content parity ---

    #[test]
    fn flatten_string_passthrough() {
        assert_eq!(flatten_content(&json!("hello world")), "hello world");
    }

    #[test]
    fn flatten_text_blocks() {
        let val = json!([{"type": "text", "text": "line 1"}, {"type": "text", "text": "line 2"}]);
        assert_eq!(flatten_content(&val), "line 1\nline 2");
    }

    #[test]
    fn flatten_input_text_blocks() {
        // CASS parity: Codex uses "input_text" type.
        let val = json!([{"type": "input_text", "text": "codex content"}]);
        assert_eq!(flatten_content(&val), "codex content");
    }

    #[test]
    fn flatten_tool_use_block() {
        let val = json!([{"type": "tool_use", "name": "Read", "input": {"file_path": "foo.rs"}}]);
        assert_eq!(flatten_content(&val), "[Tool: Read - foo.rs]");
    }

    #[test]
    fn flatten_tool_use_no_desc() {
        let val = json!([{"type": "tool_use", "name": "Bash", "input": {"cmd": "ls"}}]);
        assert_eq!(flatten_content(&val), "[Tool: Bash]");
    }

    #[test]
    fn flatten_mixed_text_and_tool() {
        let val = json!([
            {"type": "text", "text": "Let me read the file."},
            {"type": "tool_use", "name": "Read", "input": {"file_path": "main.rs"}}
        ]);
        assert_eq!(
            flatten_content(&val),
            "Let me read the file.\n[Tool: Read - main.rs]"
        );
    }

    #[test]
    fn flatten_plain_string_array() {
        let val = json!(["hello", "world"]);
        assert_eq!(flatten_content(&val), "hello\nworld");
    }

    #[test]
    fn flatten_null_returns_empty() {
        assert_eq!(flatten_content(&json!(null)), "");
    }

    #[test]
    fn flatten_number_returns_empty() {
        assert_eq!(flatten_content(&json!(42)), "");
    }

    #[test]
    fn flatten_object_with_text() {
        let val = json!({"text": "raw text"});
        assert_eq!(flatten_content(&val), "raw text");
    }

    #[test]
    fn flatten_grounding_block_no_text() {
        // Gemini grounding blocks have no "text" key → no output.
        let val = json!([{"type": "grounding", "source": "doc://foo"}]);
        assert_eq!(flatten_content(&val), "");
    }

    // --- parse_timestamp parity ---

    #[test]
    fn parse_timestamp_epoch_seconds() {
        // CASS heuristic: < 100 billion → seconds.
        let millis = parse_timestamp(&json!(1_737_100_000)).unwrap();
        assert_eq!(millis, 1_737_100_000_000);
    }

    #[test]
    fn parse_timestamp_epoch_millis() {
        // CASS heuristic: >= 100 billion → already millis.
        let millis = parse_timestamp(&json!(1_737_100_000_000_i64)).unwrap();
        assert_eq!(millis, 1_737_100_000_000);
    }

    #[test]
    fn parse_timestamp_float_seconds() {
        let millis = parse_timestamp(&json!(1_737_100_001.5)).unwrap();
        assert_eq!(millis, 1_737_100_001_500);
    }

    #[test]
    fn parse_timestamp_string_integer() {
        let millis = parse_timestamp(&json!("1737100000")).unwrap();
        assert_eq!(millis, 1_737_100_000_000);
    }

    #[test]
    fn parse_timestamp_string_float() {
        let millis = parse_timestamp(&json!("1737100000.5")).unwrap();
        assert_eq!(millis, 1_737_100_000_500);
    }

    #[test]
    fn parse_timestamp_rfc3339() {
        let millis = parse_timestamp(&json!("2026-01-15T10:00:00.000Z")).unwrap();
        // Verify it's a reasonable 2026 timestamp.
        assert!(
            millis > 1_700_000_000_000,
            "Should be > year 2023 in millis"
        );
        assert!(
            millis < 1_800_000_000_000,
            "Should be < year 2027 in millis"
        );
    }

    #[test]
    fn parse_timestamp_null_returns_none() {
        assert!(parse_timestamp(&json!(null)).is_none());
    }

    #[test]
    fn parse_timestamp_empty_string_returns_none() {
        assert!(parse_timestamp(&json!("")).is_none());
    }

    #[test]
    fn parse_timestamp_garbage_string_returns_none() {
        assert!(parse_timestamp(&json!("not a timestamp")).is_none());
    }

    // --- normalize_role parity ---

    #[test]
    fn normalize_role_standard_mappings() {
        assert_eq!(normalize_role("user"), MessageRole::User);
        assert_eq!(normalize_role("assistant"), MessageRole::Assistant);
        assert_eq!(normalize_role("tool"), MessageRole::Tool);
        assert_eq!(normalize_role("system"), MessageRole::System);
    }

    #[test]
    fn normalize_role_cass_agent_maps_to_assistant() {
        // CASS uses "agent" for assistant role.
        assert_eq!(normalize_role("agent"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_role_gemini_model_maps_to_assistant() {
        assert_eq!(normalize_role("model"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_role_gemini_gemini_maps_to_assistant() {
        assert_eq!(normalize_role("gemini"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_role_case_insensitive() {
        assert_eq!(normalize_role("User"), MessageRole::User);
        assert_eq!(normalize_role("ASSISTANT"), MessageRole::Assistant);
        assert_eq!(normalize_role("Model"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_role_unknown_becomes_other() {
        assert_eq!(
            normalize_role("narrator"),
            MessageRole::Other("narrator".to_string())
        );
    }

    // --- truncate_title parity ---

    #[test]
    fn truncate_title_short_unchanged() {
        assert_eq!(truncate_title("short title", 100), "short title");
    }

    #[test]
    fn truncate_title_multiline_takes_first() {
        assert_eq!(truncate_title("first line\nsecond line", 100), "first line");
    }

    #[test]
    fn truncate_title_long_gets_ellipsis() {
        let long = "A".repeat(150);
        let result = truncate_title(&long, 100);
        assert_eq!(result.len(), 103); // 100 + "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn truncate_title_empty_returns_empty() {
        assert_eq!(truncate_title("", 100), "");
        assert_eq!(truncate_title("   \n   ", 100), "");
    }

    #[test]
    fn truncate_title_char_boundary_safety() {
        // Multi-byte chars: don't split in the middle.
        let text = "\u{3053}\u{3093}\u{306b}\u{3061}\u{306f}"; // "こんにちは"
        let result = truncate_title(text, 3); // 3 bytes → char boundary at 3
        assert!(result.len() <= 6); // up to 3 + "..."
        assert!(result.is_char_boundary(result.len()));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Divergence tracking — explicit tests for documented casr-vs-CASS differences
// ═══════════════════════════════════════════════════════════════════════════

mod divergence_tracking {
    use super::*;

    #[test]
    fn divergence_role_naming_agent_vs_assistant() {
        // CASS uses MessageRole::Agent; casr uses MessageRole::Assistant.
        // Both normalize_role("agent") and normalize_role("assistant") should
        // yield the same variant.
        assert_eq!(normalize_role("agent"), normalize_role("assistant"));
    }

    #[test]
    fn divergence_idx_type_usize_not_i64() {
        // CASS uses idx: i64; casr uses idx: usize.
        // Verify our idx values are valid usize (non-negative, sequential).
        let path = fixtures_dir().join("claude_code/cc_simple.jsonl");
        let s = ClaudeCode.read_session(&path).unwrap();
        for (i, msg) in s.messages.iter().enumerate() {
            assert_eq!(msg.idx, i, "idx should be valid usize");
        }
    }

    #[test]
    fn divergence_no_snippet_type() {
        // CASS has a Snippet type for code extraction. casr omits it
        // (not needed for session conversion). This is documented.
        // Just a marker test for regression tracking.
        // If we ever add Snippet, update docs/cass-porting-notes.md.
    }

    #[test]
    fn divergence_no_source_id_or_origin_host() {
        // CASS has source_id and origin_host. casr omits them (local-only tool).
        // Verify our CanonicalSession doesn't accidentally include these.
        let path = fixtures_dir().join("claude_code/cc_simple.jsonl");
        let s = ClaudeCode.read_session(&path).unwrap();
        let serialized = serde_json::to_value(&s).unwrap();
        assert!(serialized.get("source_id").is_none());
        assert!(serialized.get("origin_host").is_none());
    }

    #[test]
    fn divergence_token_data_in_extra_not_top_level() {
        // CASS has approx_tokens as a top-level field.
        // casr stores token data in the extra field if present.
        let path = fixtures_dir().join("codex/codex_token_count.jsonl");
        let s = Codex.read_session(&path).unwrap();
        let serialized = serde_json::to_value(&s).unwrap();
        assert!(serialized.get("approx_tokens").is_none());
    }

    #[test]
    fn divergence_codex_token_count_skipped_not_attached() {
        // CASS attaches token_count events to preceding assistant messages
        // as extra.cass.token_usage. casr simply skips token_count events
        // (they're non-conversational). This is an intentional simplification.
        let path = fixtures_dir().join("codex/codex_token_count.jsonl");
        let s = Codex.read_session(&path).unwrap();
        // Verify token_count events don't appear as messages.
        assert_eq!(s.messages.len(), 4);
        // Verify no message has a "cass" key in extra (our divergence).
        for msg in &s.messages {
            assert!(
                msg.extra.get("cass").is_none(),
                "casr should not attach CASS-style token_usage to messages"
            );
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cross-provider parity invariants
// ═══════════════════════════════════════════════════════════════════════════

mod cross_provider_parity {
    #![allow(clippy::type_complexity)]

    use super::*;

    type FixtureLoader = (&'static str, Box<dyn Fn() -> CanonicalSession>);
    type FixtureLoaderWithPrefix = (
        &'static str,
        Box<dyn Fn() -> CanonicalSession>,
        &'static str,
    );

    /// Every provider reader must produce sequential idx values starting at 0.
    #[test]
    fn all_fixtures_have_sequential_idx() {
        let fixtures: Vec<FixtureLoader> = vec![
            (
                "cc_simple",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_simple.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "cc_complex",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_complex.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "codex_modern",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_modern.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "codex_legacy",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_legacy.json"))
                        .unwrap()
                }),
            ),
            (
                "gmi_simple",
                Box::new(|| {
                    Gemini
                        .read_session(&fixtures_dir().join("gemini/gmi_simple.json"))
                        .unwrap()
                }),
            ),
        ];

        for (name, loader) in &fixtures {
            let s = loader();
            for (i, msg) in s.messages.iter().enumerate() {
                assert_eq!(msg.idx, i, "[{name}] idx should be sequential");
            }
        }
    }

    /// Every provider reader must never produce empty content messages.
    #[test]
    fn all_fixtures_no_empty_content() {
        let fixtures: Vec<FixtureLoader> = vec![
            (
                "cc_simple",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_simple.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "cc_complex",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_complex.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "cc_malformed",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_malformed.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "codex_modern",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_modern.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "codex_reasoning",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_reasoning.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "gmi_simple",
                Box::new(|| {
                    Gemini
                        .read_session(&fixtures_dir().join("gemini/gmi_simple.json"))
                        .unwrap()
                }),
            ),
            (
                "gmi_grounding",
                Box::new(|| {
                    Gemini
                        .read_session(&fixtures_dir().join("gemini/gmi_grounding.json"))
                        .unwrap()
                }),
            ),
        ];

        for (name, loader) in &fixtures {
            let s = loader();
            for msg in &s.messages {
                let has_content = !msg.content.trim().is_empty();
                let has_tools = !msg.tool_calls.is_empty() || !msg.tool_results.is_empty();
                assert!(
                    has_content || has_tools,
                    "[{name}] msg[{}] should not have completely empty content (needs text or tools)",
                    msg.idx
                );
            }
        }
    }

    /// Provider slug must match the reader that produced it.
    #[test]
    fn all_fixtures_correct_provider_slug() {
        let cc = ClaudeCode
            .read_session(&fixtures_dir().join("claude_code/cc_simple.jsonl"))
            .unwrap();
        assert_eq!(cc.provider_slug, "claude-code");

        let cod = Codex
            .read_session(&fixtures_dir().join("codex/codex_modern.jsonl"))
            .unwrap();
        assert_eq!(cod.provider_slug, "codex");

        let gmi = Gemini
            .read_session(&fixtures_dir().join("gemini/gmi_simple.json"))
            .unwrap();
        assert_eq!(gmi.provider_slug, "gemini");
    }

    /// started_at ≤ ended_at when both are present.
    #[test]
    fn all_fixtures_timestamp_ordering() {
        let fixtures: Vec<FixtureLoader> = vec![
            (
                "cc_simple",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_simple.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "codex_modern",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_modern.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "gmi_simple",
                Box::new(|| {
                    Gemini
                        .read_session(&fixtures_dir().join("gemini/gmi_simple.json"))
                        .unwrap()
                }),
            ),
        ];

        for (name, loader) in &fixtures {
            let s = loader();
            if let (Some(start), Some(end)) = (s.started_at, s.ended_at) {
                assert!(
                    start <= end,
                    "[{name}] started_at ({start}) should be ≤ ended_at ({end})"
                );
            }
        }
    }

    /// Message timestamps (when present) should be monotonically non-decreasing.
    #[test]
    fn all_fixtures_message_timestamps_ordered() {
        let fixtures: Vec<FixtureLoader> = vec![
            (
                "cc_simple",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_simple.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "codex_modern",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_modern.jsonl"))
                        .unwrap()
                }),
            ),
            (
                "gmi_simple",
                Box::new(|| {
                    Gemini
                        .read_session(&fixtures_dir().join("gemini/gmi_simple.json"))
                        .unwrap()
                }),
            ),
        ];

        for (name, loader) in &fixtures {
            let s = loader();
            let timestamps: Vec<i64> = s.messages.iter().filter_map(|m| m.timestamp).collect();
            for window in timestamps.windows(2) {
                assert!(
                    window[0] <= window[1],
                    "[{name}] timestamps should be non-decreasing: {} > {}",
                    window[0],
                    window[1]
                );
            }
        }
    }

    /// Title should be derived from first user message content.
    #[test]
    fn all_fixtures_title_from_first_user() {
        let fixtures: Vec<FixtureLoaderWithPrefix> = vec![
            (
                "cc_simple",
                Box::new(|| {
                    ClaudeCode
                        .read_session(&fixtures_dir().join("claude_code/cc_simple.jsonl"))
                        .unwrap()
                }),
                "Fix the login bug",
            ),
            (
                "codex_modern",
                Box::new(|| {
                    Codex
                        .read_session(&fixtures_dir().join("codex/codex_modern.jsonl"))
                        .unwrap()
                }),
                "Optimize the database query",
            ),
            (
                "gmi_simple",
                Box::new(|| {
                    Gemini
                        .read_session(&fixtures_dir().join("gemini/gmi_simple.json"))
                        .unwrap()
                }),
                "Create a REST API endpoint",
            ),
        ];

        for (name, loader, prefix) in &fixtures {
            let s = loader();
            let title = s.title.as_deref().unwrap_or("");
            assert!(
                title.starts_with(prefix),
                "[{name}] title should start with '{prefix}' but was '{title}'"
            );
        }
    }
}
