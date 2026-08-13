//! Canonical session model — the IR (intermediate representation) for casr.
//!
//! Every provider's native format is parsed into these types, and every
//! target format is generated from them. This is the Rosetta Stone of
//! cross-provider session conversion.
//!
//! # CASS heritage
//!
//! These types are adapted from CASS (`coding_agent_session_search/src/model/types.rs`).
//!
//! **Naming difference:** CASS uses `Agent` for the assistant role variant;
//! casr uses `Assistant`, which matches the convention used by Claude, Codex,
//! and most LLM APIs. The [`normalize_role`] helper maps `"agent"` →
//! [`MessageRole::Assistant`] to bridge this.
//!
//! **Deliberately omitted from CASS** (not needed for session conversion):
//! - `approx_tokens` — per-message token data lives in `extra` if present.
//! - `source_id` / `origin_host` — casr works with local files only.
//! - `Snippet` type — code snippet extraction is a CASS indexing feature.
//! - Database `id` fields — casr has no database.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/// A provider-agnostic representation of an AI coding agent session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonicalSession {
    /// Unique session identifier (provider-assigned or generated).
    pub session_id: String,
    /// Provider slug that originally created this session (e.g. `"claude-code"`).
    pub provider_slug: String,
    /// Project root directory, if known.
    pub workspace: Option<PathBuf>,
    /// Human-readable title (first user message or explicit title).
    pub title: Option<String>,
    /// Session start time as epoch milliseconds.
    pub started_at: Option<i64>,
    /// Session end time as epoch milliseconds.
    pub ended_at: Option<i64>,
    /// Ordered conversation messages.
    pub messages: Vec<CanonicalMessage>,
    /// Provider-specific extras that don't map to canonical fields.
    pub metadata: serde_json::Value,
    /// Filesystem path of the original session file.
    pub source_path: PathBuf,
    /// Convenience: most common model name in the session.
    pub model_name: Option<String>,
}

/// A single message in a canonical session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonicalMessage {
    /// Zero-based sequential index.
    pub idx: usize,
    /// Who sent this message.
    pub role: MessageRole,
    /// The textual content of the message.
    pub content: String,
    /// Message timestamp as epoch milliseconds.
    pub timestamp: Option<i64>,
    /// Model name or `"user"` or `"reasoning"`.
    pub author: Option<String>,
    /// Tool invocations made in this message.
    pub tool_calls: Vec<ToolCall>,
    /// Results returned from tool invocations.
    pub tool_results: Vec<ToolResult>,
    /// Provider-specific fields preserved for round-trip fidelity.
    pub extra: serde_json::Value,
}

/// The role of a message sender.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageRole {
    User,
    Assistant,
    Tool,
    System,
    Other(String),
}

/// A tool invocation within a message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: Option<String>,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// A tool result within a message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolResult {
    pub call_id: Option<String>,
    pub content: String,
    pub is_error: bool,
}

// ---------------------------------------------------------------------------
// Helpers — ported/adapted from CASS connectors/mod.rs
// ---------------------------------------------------------------------------

/// Resolve the workspace a writer should stamp into the target session.
///
/// Prefers the session's recorded workspace. When the source session recorded
/// none, falls back to the directory casr was invoked from — NEVER `/tmp`.
/// Cwd-keyed providers (e.g. Claude Code buckets sessions under a path-encoded
/// project directory and `claude --resume` only finds sessions whose bucket
/// matches the *current* cwd) would otherwise write the session somewhere the
/// user will never resume from.
pub fn effective_workspace(session: &CanonicalSession) -> std::path::PathBuf {
    session.workspace.clone().unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")))
}

/// Flatten heterogeneous content representations into a single string.
///
/// Handles all content shapes encountered across providers:
/// - String → returned as-is
/// - Array of `{type:"text", text:"…"}` blocks → concatenated
/// - Array of `{type:"input_text"| "output_text", text:"…"}` blocks (Codex/Gemini) → concatenated
/// - Array of `{type:"tool_use", name:"…", input:{…}}` → rendered as `[Tool: name]`
/// - Array of plain strings → joined with newlines
/// - Object with `text` field (no `type`) → returns the text
/// - null / number / bool → empty string
pub fn flatten_content(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            let mut parts = Vec::new();
            for item in arr {
                match item {
                    serde_json::Value::String(s) => parts.push(s.clone()),
                    serde_json::Value::Object(obj) => {
                        let type_field = obj.get("type").and_then(|v| v.as_str());
                        match type_field {
                            Some("text") | Some("input_text") | Some("output_text") => {
                                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                                    parts.push(text.to_string());
                                }
                            }
                            Some("tool_use") => {
                                let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                                let desc = obj.get("input").and_then(|v| v.as_object()).and_then(|inp| inp.get("description").or_else(|| inp.get("file_path")).and_then(|v| v.as_str()));
                                match desc {
                                    Some(d) => parts.push(format!("[Tool: {name} - {d}]")),
                                    None => parts.push(format!("[Tool: {name}]")),
                                }
                            }
                            _ => {
                                // Object without recognized type but with text field.
                                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                                    parts.push(text.to_string());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            parts.join("\n")
        }
        serde_json::Value::Object(obj) => {
            // ChatGPT-style: {"content_type": "text", "parts": ["hello", ...]}.
            if let Some(parts) = obj.get("parts").and_then(|v| v.as_array()) {
                let texts: Vec<&str> = parts.iter().filter_map(|p| p.as_str()).collect();
                if !texts.is_empty() {
                    return texts.join("\n");
                }
            }
            // Fallback: single object with "text" field.
            obj.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string()
        }
        _ => String::new(),
    }
}

/// Parse a timestamp value into epoch milliseconds.
///
/// Accepts:
/// - Integer: < 100 billion → seconds (× 1000); ≥ 100 billion → millis
/// - Float: treated as seconds → millis
/// - String of digits: same integer heuristic
/// - Float string (e.g. `"1700000000.123"`): seconds → millis
/// - ISO-8601 / RFC 3339 with timezone or Z suffix
///
/// Returns `None` for null, objects, arrays, or unparseable strings.
pub fn parse_timestamp(value: &serde_json::Value) -> Option<i64> {
    /// Threshold: values below this are seconds, at or above are milliseconds.
    const MILLIS_THRESHOLD: i64 = 100_000_000_000;

    match value {
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(if i < MILLIS_THRESHOLD { i * 1000 } else { i })
            } else {
                n.as_f64().map(|f| if f < (MILLIS_THRESHOLD as f64) { (f * 1000.0) as i64 } else { f as i64 })
            }
        }
        serde_json::Value::String(s) => {
            let s = s.trim();
            if s.is_empty() {
                return None;
            }
            // Try integer parse first.
            if let Ok(i) = s.parse::<i64>() {
                return Some(if i < MILLIS_THRESHOLD { i * 1000 } else { i });
            }
            // Try float parse.
            if let Ok(f) = s.parse::<f64>()
                && f.is_finite()
            {
                return Some(if f < (MILLIS_THRESHOLD as f64) { (f * 1000.0) as i64 } else { f as i64 });
            }
            // Try RFC 3339 / ISO-8601 with timezone.
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return Some(dt.timestamp_millis());
            }
            // Try common ISO-8601 variants.
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ") {
                return Some(dt.and_utc().timestamp_millis());
            }
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%SZ") {
                return Some(dt.and_utc().timestamp_millis());
            }
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                return Some(dt.and_utc().timestamp_millis());
            }
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
                return Some(dt.and_utc().timestamp_millis());
            }
            None
        }
        _ => None,
    }
}

/// Re-assign sequential idx values (0, 1, 2, …) after filtering/sorting.
pub fn reindex_messages(messages: &mut [CanonicalMessage]) {
    for (i, msg) in messages.iter_mut().enumerate() {
        msg.idx = i;
    }
}

/// Extract a title from message content: first line, truncated to `max_len`.
///
/// Returns an empty string for empty or whitespace-only input.
pub fn truncate_title(text: &str, max_len: usize) -> String {
    let first_line = text.lines().next().unwrap_or("").trim();
    if first_line.is_empty() {
        return String::new();
    }
    if first_line.len() <= max_len {
        first_line.to_string()
    } else {
        // Truncate at char boundary.
        let mut end = max_len;
        while !first_line.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        format!("{}...", &first_line[..end])
    }
}

/// Metadata key under which a provider stores its native, user-facing session
/// name — the harness-specific display title a human would recognize.
///
/// Examples: Claude Code's `/rename` custom title (or its auto-generated
/// `ai-title` fallback), an Amp thread title. Providers with no such concept
/// simply omit the key, which reads back as `None`.
pub const NATIVE_NAME_META_KEY: &str = "native_name";

/// Extract the provider-native session name from session metadata, if present.
///
/// Returns `None` when the key is absent, non-string, or blank so that callers
/// render an empty column / `null` field for providers without the concept.
#[must_use]
pub fn native_name_from_metadata(metadata: &serde_json::Value) -> Option<String> {
    metadata.get(NATIVE_NAME_META_KEY).and_then(serde_json::Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// A compact, human-readable snapshot of one conversation turn.
///
/// Used by `casr info --peek` to show the tail of a transcript so a human can
/// recognize a session by its most recent turns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TranscriptTurn {
    /// Zero-based index of this message within the full session.
    pub idx: usize,
    /// Human-facing role label (e.g. `"User"`, `"Assistant"`, `"Tool"`).
    pub role: String,
    /// Single-line, length-bounded snippet of the turn's content.
    pub snippet: String,
}

/// Human-facing label for a message role.
#[must_use]
pub fn role_label(role: &MessageRole) -> String {
    match role {
        MessageRole::User => "User".to_string(),
        MessageRole::Assistant => "Assistant".to_string(),
        MessageRole::Tool => "Tool".to_string(),
        MessageRole::System => "System".to_string(),
        MessageRole::Other(other) => {
            if other.is_empty() {
                "Other".to_string()
            } else {
                other.clone()
            }
        }
    }
}

/// Build a single-line, length-bounded snippet describing a message.
///
/// Whitespace (including newlines) is collapsed to single spaces. When a
/// message carries no text (e.g. a pure tool-call or tool-result turn), a
/// synthetic marker is used so the turn is still recognizable. The result is
/// truncated to at most `max_len` characters, appending `…` when clipped.
#[must_use]
pub fn message_snippet(message: &CanonicalMessage, max_len: usize) -> String {
    let mut text: String = message.content.split_whitespace().collect::<Vec<_>>().join(" ");

    if text.is_empty() {
        if !message.tool_calls.is_empty() {
            let names: Vec<&str> = message.tool_calls.iter().map(|call| call.name.as_str()).collect();
            text = format!("[tool call: {}]", names.join(", "));
        } else if !message.tool_results.is_empty() {
            text = "[tool result]".to_string();
        }
    }

    if max_len == 0 || text.chars().count() <= max_len {
        return text;
    }

    let keep = max_len.saturating_sub(1);
    let truncated: String = text.chars().take(keep).collect();
    format!("{truncated}…")
}

/// Extract the last `count` turns of a session as compact snapshots.
///
/// Preserves chronological order and returns fewer than `count` entries when
/// the session is shorter than `count`. A `count` of `0` yields an empty tail.
/// `max_len` bounds each snippet's length (see [`message_snippet`]).
#[must_use]
pub fn transcript_tail(messages: &[CanonicalMessage], count: usize, max_len: usize) -> Vec<TranscriptTurn> {
    if count == 0 {
        return Vec::new();
    }
    let start = messages.len().saturating_sub(count);
    messages[start..].iter().map(|message| TranscriptTurn { idx: message.idx, role: role_label(&message.role), snippet: message_snippet(message, max_len) }).collect()
}

/// Map provider-specific role strings to canonical [`MessageRole`].
///
/// Case-insensitive matching. CASS uses `"agent"` for assistant; most
/// providers use `"assistant"` or `"model"`. Gemini CLI emits `"gemini"`
/// for assistant/model responses in current builds.
pub fn normalize_role(role_str: &str) -> MessageRole {
    match role_str.to_ascii_lowercase().as_str() {
        "user" => MessageRole::User,
        "assistant" | "model" | "agent" | "gemini" => MessageRole::Assistant,
        "tool" => MessageRole::Tool,
        "system" | "developer" => MessageRole::System,
        other => MessageRole::Other(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // flatten_content
    // -----------------------------------------------------------------------

    #[test]
    fn flatten_content_plain_string() {
        assert_eq!(flatten_content(&json!("hello world")), "hello world");
    }

    #[test]
    fn flatten_content_text_blocks() {
        let val = json!([
            {"type": "text", "text": "line one"},
            {"type": "text", "text": "line two"},
        ]);
        assert_eq!(flatten_content(&val), "line one\nline two");
    }

    #[test]
    fn flatten_content_input_text_blocks() {
        let val = json!([{"type": "input_text", "text": "codex style"}]);
        assert_eq!(flatten_content(&val), "codex style");
    }

    #[test]
    fn flatten_content_output_text_blocks() {
        let val = json!([{"type": "output_text", "text": "assistant output"}]);
        assert_eq!(flatten_content(&val), "assistant output");
    }

    #[test]
    fn flatten_content_tool_use_block() {
        let val = json!([
            {"type": "tool_use", "name": "Read", "input": {"file_path": "/foo/bar.rs"}},
        ]);
        assert_eq!(flatten_content(&val), "[Tool: Read - /foo/bar.rs]");
    }

    #[test]
    fn flatten_content_tool_use_without_description() {
        let val = json!([
            {"type": "tool_use", "name": "Bash", "input": {}},
        ]);
        assert_eq!(flatten_content(&val), "[Tool: Bash]");
    }

    #[test]
    fn flatten_content_array_of_strings() {
        let val = json!(["a", "b", "c"]);
        assert_eq!(flatten_content(&val), "a\nb\nc");
    }

    #[test]
    fn flatten_content_object_with_text() {
        let val = json!({"text": "object text"});
        assert_eq!(flatten_content(&val), "object text");
    }

    #[test]
    fn flatten_content_null_returns_empty() {
        assert_eq!(flatten_content(&json!(null)), "");
    }

    #[test]
    fn flatten_content_number_returns_empty() {
        assert_eq!(flatten_content(&json!(42)), "");
    }

    #[test]
    fn flatten_content_bool_returns_empty() {
        assert_eq!(flatten_content(&json!(true)), "");
    }

    #[test]
    fn flatten_content_mixed_array() {
        let val = json!([
            {"type": "text", "text": "first"},
            "second",
            {"type": "tool_use", "name": "Edit", "input": {"description": "fix bug"}},
        ]);
        assert_eq!(flatten_content(&val), "first\nsecond\n[Tool: Edit - fix bug]");
    }

    // -----------------------------------------------------------------------
    // parse_timestamp
    // -----------------------------------------------------------------------

    #[test]
    fn parse_timestamp_epoch_seconds() {
        // 1_700_000_000 seconds → millis
        let val = json!(1_700_000_000);
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_000));
    }

    #[test]
    fn parse_timestamp_epoch_millis() {
        let val = json!(1_700_000_000_000_i64);
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_000));
    }

    #[test]
    fn parse_timestamp_float_seconds() {
        let val = json!(1_700_000_000.123);
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_123));
    }

    #[test]
    fn parse_timestamp_string_seconds() {
        let val = json!("1700000000");
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_000));
    }

    #[test]
    fn parse_timestamp_string_millis() {
        let val = json!("1700000000000");
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_000));
    }

    #[test]
    fn parse_timestamp_float_string() {
        let val = json!("1700000000.5");
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_500));
    }

    #[test]
    fn parse_timestamp_float_millis() {
        let val = json!(1_700_000_000_000.0);
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_000));
    }

    #[test]
    fn parse_timestamp_float_string_millis() {
        let val = json!("1700000000000.0");
        assert_eq!(parse_timestamp(&val), Some(1_700_000_000_000));
    }

    #[test]
    fn parse_timestamp_rfc3339() {
        let val = json!("2026-02-09T12:00:00Z");
        let result = parse_timestamp(&val);
        assert!(result.is_some());
        // Should be around 2026-02-09T12:00:00Z
        assert!(result.unwrap() > 1_700_000_000_000);
    }

    #[test]
    fn parse_timestamp_rfc3339_with_offset() {
        let val = json!("2026-02-09T12:00:00+05:00");
        let result = parse_timestamp(&val);
        assert!(result.is_some());
    }

    #[test]
    fn parse_timestamp_iso8601_with_millis() {
        let val = json!("2026-02-09T12:00:00.123Z");
        let result = parse_timestamp(&val);
        assert!(result.is_some());
    }

    #[test]
    fn parse_timestamp_null_returns_none() {
        assert_eq!(parse_timestamp(&json!(null)), None);
    }

    #[test]
    fn parse_timestamp_empty_string_returns_none() {
        assert_eq!(parse_timestamp(&json!("")), None);
    }

    #[test]
    fn parse_timestamp_garbage_returns_none() {
        assert_eq!(parse_timestamp(&json!("not a date")), None);
    }

    #[test]
    fn parse_timestamp_object_returns_none() {
        assert_eq!(parse_timestamp(&json!({})), None);
    }

    #[test]
    fn parse_timestamp_array_returns_none() {
        assert_eq!(parse_timestamp(&json!([])), None);
    }

    // -----------------------------------------------------------------------
    // normalize_role
    // -----------------------------------------------------------------------

    #[test]
    fn normalize_role_standard_roles() {
        assert_eq!(normalize_role("user"), MessageRole::User);
        assert_eq!(normalize_role("assistant"), MessageRole::Assistant);
        assert_eq!(normalize_role("tool"), MessageRole::Tool);
        assert_eq!(normalize_role("system"), MessageRole::System);
    }

    #[test]
    fn normalize_role_case_insensitive() {
        assert_eq!(normalize_role("USER"), MessageRole::User);
        assert_eq!(normalize_role("Assistant"), MessageRole::Assistant);
        assert_eq!(normalize_role("TOOL"), MessageRole::Tool);
    }

    #[test]
    fn normalize_role_provider_aliases() {
        assert_eq!(normalize_role("model"), MessageRole::Assistant);
        assert_eq!(normalize_role("agent"), MessageRole::Assistant);
        assert_eq!(normalize_role("gemini"), MessageRole::Assistant);
    }

    #[test]
    fn normalize_role_unknown_becomes_other() {
        assert_eq!(normalize_role("reasoning"), MessageRole::Other("reasoning".to_string()));
    }

    // -----------------------------------------------------------------------
    // truncate_title
    // -----------------------------------------------------------------------

    #[test]
    fn truncate_title_short_text() {
        assert_eq!(truncate_title("Hello", 100), "Hello");
    }

    #[test]
    fn truncate_title_long_text() {
        let long = "a".repeat(200);
        let result = truncate_title(&long, 50);
        assert!(result.ends_with("..."));
        assert!(result.len() <= 53); // 50 + "..."
    }

    #[test]
    fn truncate_title_multiline_uses_first() {
        assert_eq!(truncate_title("first line\nsecond line\nthird", 100), "first line");
    }

    #[test]
    fn truncate_title_empty_returns_empty() {
        assert_eq!(truncate_title("", 100), "");
    }

    #[test]
    fn truncate_title_whitespace_only_returns_empty() {
        assert_eq!(truncate_title("   \n   ", 100), "");
    }

    // -----------------------------------------------------------------------
    // reindex_messages
    // -----------------------------------------------------------------------

    #[test]
    fn reindex_messages_assigns_sequential_indices() {
        let mut msgs = vec![
            CanonicalMessage { idx: 99, role: MessageRole::User, content: "a".to_string(), timestamp: None, author: None, tool_calls: vec![], tool_results: vec![], extra: json!({}) },
            CanonicalMessage { idx: 42, role: MessageRole::Assistant, content: "b".to_string(), timestamp: None, author: None, tool_calls: vec![], tool_results: vec![], extra: json!({}) },
        ];

        reindex_messages(&mut msgs);
        assert_eq!(msgs[0].idx, 0);
        assert_eq!(msgs[1].idx, 1);
    }

    // -----------------------------------------------------------------------
    // Serde round-trip
    // -----------------------------------------------------------------------

    #[test]
    fn canonical_message_serde_roundtrip() {
        let msg = CanonicalMessage {
            idx: 0,
            role: MessageRole::Assistant,
            content: "Hello".to_string(),
            timestamp: Some(1_700_000_000_000),
            author: Some("claude-3".to_string()),
            tool_calls: vec![ToolCall { id: Some("tc1".to_string()), name: "Read".to_string(), arguments: json!({"file_path": "/foo.rs"}) }],
            tool_results: vec![ToolResult { call_id: Some("tc1".to_string()), content: "file contents".to_string(), is_error: false }],
            extra: json!({"custom": "field"}),
        };

        let serialized = serde_json::to_string(&msg).unwrap();
        let deserialized: CanonicalMessage = serde_json::from_str(&serialized).unwrap();
        assert_eq!(msg, deserialized);
    }

    #[test]
    fn canonical_session_serde_roundtrip() {
        let session = CanonicalSession {
            session_id: "test-123".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(std::path::PathBuf::from("/data/projects/test")),
            title: Some("Test session".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_001_000_000),
            messages: vec![],
            metadata: json!({"source": "claude_code"}),
            source_path: std::path::PathBuf::from("/tmp/test.jsonl"),
            model_name: Some("claude-3".to_string()),
        };

        let serialized = serde_json::to_string(&session).unwrap();
        let deserialized: CanonicalSession = serde_json::from_str(&serialized).unwrap();
        assert_eq!(session, deserialized);
    }

    #[test]
    fn message_role_other_preserves_value() {
        let role = MessageRole::Other("custom".to_string());
        let serialized = serde_json::to_string(&role).unwrap();
        let deserialized: MessageRole = serde_json::from_str(&serialized).unwrap();
        assert_eq!(role, deserialized);
    }

    // -----------------------------------------------------------------------
    // native_name_from_metadata
    // -----------------------------------------------------------------------

    #[test]
    fn native_name_present() {
        let meta = json!({"native_name": "My Renamed Session", "source": "claude_code"});
        assert_eq!(native_name_from_metadata(&meta).as_deref(), Some("My Renamed Session"));
    }

    #[test]
    fn native_name_absent_is_none() {
        let meta = json!({"source": "claude_code"});
        assert!(native_name_from_metadata(&meta).is_none());
    }

    #[test]
    fn native_name_blank_is_none() {
        let meta = json!({"native_name": "   "});
        assert!(native_name_from_metadata(&meta).is_none());
    }

    #[test]
    fn native_name_non_string_is_none() {
        let meta = json!({"native_name": 42});
        assert!(native_name_from_metadata(&meta).is_none());
        assert!(native_name_from_metadata(&json!(null)).is_none());
    }

    // -----------------------------------------------------------------------
    // transcript_tail / message_snippet / role_label
    // -----------------------------------------------------------------------

    fn msg(idx: usize, role: MessageRole, content: &str) -> CanonicalMessage {
        CanonicalMessage { idx, role, content: content.to_string(), timestamp: None, author: None, tool_calls: vec![], tool_results: vec![], extra: json!(null) }
    }

    #[test]
    fn transcript_tail_returns_last_turns_in_order() {
        let messages = vec![msg(0, MessageRole::User, "first"), msg(1, MessageRole::Assistant, "second"), msg(2, MessageRole::User, "third"), msg(3, MessageRole::Assistant, "fourth"), msg(4, MessageRole::User, "fifth")];
        let tail = transcript_tail(&messages, 3, 100);
        assert_eq!(tail.len(), 3);
        // Chronological order preserved (tail, not reversed).
        assert_eq!(tail[0].idx, 2);
        assert_eq!(tail[0].snippet, "third");
        assert_eq!(tail[1].snippet, "fourth");
        assert_eq!(tail[2].snippet, "fifth");
        assert_eq!(tail[2].role, "User");
    }

    #[test]
    fn transcript_tail_shorter_than_count_returns_all() {
        let messages = vec![msg(0, MessageRole::User, "only one"), msg(1, MessageRole::Assistant, "and two")];
        let tail = transcript_tail(&messages, 5, 100);
        assert_eq!(tail.len(), 2);
        assert_eq!(tail[0].snippet, "only one");
        assert_eq!(tail[1].snippet, "and two");
    }

    #[test]
    fn transcript_tail_zero_count_is_empty() {
        let messages = vec![msg(0, MessageRole::User, "hello")];
        assert!(transcript_tail(&messages, 0, 100).is_empty());
    }

    #[test]
    fn transcript_tail_empty_session_is_empty() {
        assert!(transcript_tail(&[], 3, 100).is_empty());
    }

    #[test]
    fn message_snippet_collapses_whitespace() {
        let m = msg(0, MessageRole::User, "line one\n\n  line two\tthree");
        assert_eq!(message_snippet(&m, 100), "line one line two three");
    }

    #[test]
    fn message_snippet_truncates_with_ellipsis() {
        let m = msg(0, MessageRole::User, "abcdefghij");
        let snippet = message_snippet(&m, 5);
        assert_eq!(snippet, "abcd…");
        assert_eq!(snippet.chars().count(), 5);
    }

    #[test]
    fn message_snippet_falls_back_to_tool_call() {
        let mut m = msg(0, MessageRole::Assistant, "");
        m.tool_calls = vec![ToolCall { id: None, name: "Bash".to_string(), arguments: json!({}) }];
        assert_eq!(message_snippet(&m, 100), "[tool call: Bash]");
    }

    #[test]
    fn message_snippet_falls_back_to_tool_result() {
        let mut m = msg(0, MessageRole::Tool, "");
        m.tool_results = vec![ToolResult { call_id: None, content: "output".to_string(), is_error: false }];
        assert_eq!(message_snippet(&m, 100), "[tool result]");
    }

    #[test]
    fn role_label_maps_all_roles() {
        assert_eq!(role_label(&MessageRole::User), "User");
        assert_eq!(role_label(&MessageRole::Assistant), "Assistant");
        assert_eq!(role_label(&MessageRole::Tool), "Tool");
        assert_eq!(role_label(&MessageRole::System), "System");
        assert_eq!(role_label(&MessageRole::Other("planner".to_string())), "planner");
    }
}
