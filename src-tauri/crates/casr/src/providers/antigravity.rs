//! Antigravity CLI (`agy`) provider — reads conversations under
//! `~/.gemini/antigravity-cli/`.
//!
//! `agy` is Google's Antigravity CLI, the successor to the retired Gemini CLI
//! (`gmi`). The two tools **share** the `~/.gemini` parent directory, so this
//! provider is carefully disambiguated from [`crate::providers::gemini::Gemini`]:
//!
//! - `~/.gemini/tmp/<hash>/chats/session-*.json` → **gmi** (legacy Gemini CLI)
//! - `~/.gemini/antigravity-cli/conversations/<uuid>.db` → **agy** (Antigravity)
//!
//! ## On-disk layout
//!
//! - Conversation databases: `~/.gemini/antigravity-cli/conversations/<uuid>.db`
//!   — stock SQLite (`SQLite format 3`, `user_version 1`). The `<uuid>`
//!   (filename stem) is the conversation id passed to `agy --conversation
//!   <uuid>`. The DB stores the trajectory as protobuf blobs (`steps`,
//!   `trajectory_meta`, …), which are opaque, so it is used only to enumerate
//!   conversations and (as a fallback) derive a title.
//! - Clean transcript (preferred source): `~/.gemini/antigravity-cli/brain/
//!   <uuid>/.system_generated/logs/transcript.jsonl` — one JSON object per
//!   step with `step_index`, `source`, `type`, `status`, `created_at`,
//!   `content`, and optional `thinking` / `tool_calls`.
//!
//! ## Transcript step model
//!
//! | `source`         | role               |
//! |------------------|--------------------|
//! | `USER_EXPLICIT`  | [`MessageRole::User`]      |
//! | `MODEL`          | [`MessageRole::Assistant`] |
//! | `SYSTEM`         | [`MessageRole::System`]    |
//!
//! User content is wrapped in `<USER_REQUEST>…</USER_REQUEST>` tags which are
//! unwrapped for the canonical title/content. `SYSTEM` housekeeping steps
//! (`CONVERSATION_HISTORY`, `EPHEMERAL_MESSAGE`) carry no useful conversation
//! content and are skipped.
//!
//! ## Resume mechanism
//!
//! `agy --conversation <uuid> --model "Gemini 3.1 Pro (High)"`. The model pin
//! is mandatory (see [`AGY_REQUIRED_MODEL`]); `agy` MUST always run on
//! "Gemini 3.1 Pro (High)" and no other model.
//!
//! ## Write support
//!
//! Antigravity conversations are protobuf-backed trajectories that the CLI
//! creates and owns; there is no documented, supported way to synthesize a
//! resumable conversation from foreign session history. `agy` is therefore a
//! **read/resume-only** provider: [`Provider::write_session`] returns an
//! actionable error rather than writing an un-resumable stub.

use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, trace};

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, parse_timestamp, reindex_messages,
    truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// The one model `agy` is allowed to run on. Mirrors the shell-side single
/// source of truth in
/// `agentic_coding_flywheel_setup/scripts/lib/agy_model_guard.sh`
/// (`AGY_REQUIRED_MODEL`). Every `agy` invocation casr emits MUST pin this.
pub const AGY_REQUIRED_MODEL: &str = "Gemini 3.1 Pro (High)";

/// Antigravity CLI provider implementation.
pub struct Antigravity;

impl Antigravity {
    /// Root directory for the shared Gemini family data.
    /// Respects the `GEMINI_HOME` env var override (shared with the legacy
    /// Gemini CLI provider so a single override relocates both).
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("GEMINI_HOME") {
            return Some(PathBuf::from(home));
        }
        dirs::home_dir().map(|h| h.join(".gemini"))
    }

    /// The Antigravity CLI data directory: `<home>/antigravity-cli`.
    fn cli_dir() -> Option<PathBuf> {
        Self::home_dir().map(|h| h.join("antigravity-cli"))
    }

    /// The conversations directory holding `<uuid>.db` files.
    fn conversations_dir() -> Option<PathBuf> {
        Self::cli_dir().map(|d| d.join("conversations"))
    }

    /// Path to the clean transcript JSONL for a conversation uuid.
    fn transcript_path(cli_dir: &Path, uuid: &str) -> PathBuf {
        cli_dir
            .join("brain")
            .join(uuid)
            .join(".system_generated")
            .join("logs")
            .join("transcript.jsonl")
    }

    /// Path to the conversation database file for a uuid.
    fn db_path(conversations_dir: &Path, uuid: &str) -> PathBuf {
        conversations_dir.join(format!("{uuid}.db"))
    }

    /// Enumerate `(uuid, db_path)` for every conversation database under the
    /// configured conversations directory.
    fn list_conversations() -> Vec<(String, PathBuf)> {
        let Some(conv_dir) = Self::conversations_dir() else {
            return vec![];
        };
        list_conversations_in(&conv_dir)
    }
}

/// Enumerate `(uuid, db_path)` for every `<uuid>.db` directly under `conv_dir`.
///
/// The uuid is the filename stem. Non-`.db` files (and the sibling legacy gmi
/// `tmp/.../chats/session-*.json` layout, which never lives here) are ignored,
/// which is what keeps the agy provider disjoint from the Gemini CLI provider.
fn list_conversations_in(conv_dir: &Path) -> Vec<(String, PathBuf)> {
    if !conv_dir.is_dir() {
        return vec![];
    }

    let mut out: Vec<(String, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(conv_dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Only `*.db` files; the uuid is the filename stem.
        if path.extension().and_then(|e| e.to_str()) != Some("db") {
            continue;
        }
        let Some(uuid) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if uuid.is_empty() {
            continue;
        }
        out.push((uuid.to_string(), path));
    }
    out
}

impl Provider for Antigravity {
    fn name(&self) -> &str {
        "Antigravity CLI"
    }

    fn slug(&self) -> &str {
        "antigravity"
    }

    fn cli_alias(&self) -> &str {
        "agy"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if which::which("agy").is_ok() {
            evidence.push("agy binary found in PATH".to_string());
            installed = true;
        }

        if let Some(cli_dir) = Self::cli_dir()
            && cli_dir.is_dir()
        {
            evidence.push(format!("{} exists", cli_dir.display()));
            installed = true;
        }

        trace!(provider = "antigravity", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        let Some(conv_dir) = Self::conversations_dir() else {
            return vec![];
        };
        if conv_dir.is_dir() {
            vec![conv_dir]
        } else {
            vec![]
        }
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        Some(Self::list_conversations())
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let conv_dir = Self::conversations_dir()?;
        if !conv_dir.is_dir() {
            return None;
        }

        // The session id is the conversation uuid == filename stem.
        let candidate = Self::db_path(&conv_dir, session_id);
        if candidate.is_file() {
            debug!(path = %candidate.display(), session_id, "found Antigravity conversation");
            return Some(candidate);
        }

        // Case-insensitive fallback (UUIDs are conventionally lowercase, but be
        // robust to user-typed mixed case).
        let lc = session_id.to_ascii_lowercase();
        for (uuid, path) in Self::list_conversations() {
            if uuid.to_ascii_lowercase() == lc {
                debug!(path = %path.display(), session_id, "found Antigravity conversation (case-insensitive)");
                return Some(path);
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Antigravity conversation");

        // `path` is the `<uuid>.db` file. The uuid is the filename stem.
        let uuid = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(ToString::to_string)
            .unwrap_or_else(|| "unknown".to_string());

        // The CLI dir is the grandparent of the db (conversations/<uuid>.db).
        let cli_dir = path
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf)
            .or_else(Self::cli_dir)
            .ok_or_else(|| anyhow::anyhow!("cannot determine Antigravity CLI directory"))?;

        let transcript = Self::transcript_path(&cli_dir, &uuid);

        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;

        if transcript.is_file() {
            let content = std::fs::read_to_string(&transcript)
                .with_context(|| format!("failed to read transcript {}", transcript.display()))?;

            for (i, line) in content.lines().enumerate() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let Ok(step): Result<serde_json::Value, _> = serde_json::from_str(line) else {
                    trace!(line = i, "skipping malformed Antigravity transcript line");
                    continue;
                };

                let Some(msg) = step_to_message(&step) else {
                    continue;
                };

                if let Some(ts) = msg.timestamp {
                    started_at = Some(started_at.map_or(ts, |s: i64| s.min(ts)));
                    ended_at = Some(ended_at.map_or(ts, |e: i64| e.max(ts)));
                }

                messages.push(msg);
            }
        } else {
            debug!(
                transcript = %transcript.display(),
                "no transcript.jsonl found; Antigravity conversation has no readable preview"
            );
        }

        reindex_messages(&mut messages);

        // Title from the first user message (its content is already unwrapped).
        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("antigravity".to_string()),
        );
        metadata.insert(
            "conversation_uuid".into(),
            serde_json::Value::String(uuid.clone()),
        );
        metadata.insert(
            "transcript_path".into(),
            serde_json::Value::String(transcript.to_string_lossy().into_owned()),
        );

        debug!(
            session_id = uuid,
            messages = messages.len(),
            "Antigravity conversation parsed"
        );

        Ok(CanonicalSession {
            session_id: uuid,
            provider_slug: "antigravity".to_string(),
            workspace: None,
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::Value::Object(metadata),
            source_path: path.to_path_buf(),
            model_name: Some(AGY_REQUIRED_MODEL.to_string()),
        })
    }

    fn write_session(
        &self,
        _session: &CanonicalSession,
        _opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        // Antigravity conversations are protobuf-backed trajectories created and
        // owned by the `agy` runtime (the `steps`/`trajectory_meta` SQLite blobs
        // plus the sibling `brain/<uuid>/` working tree). There is no supported
        // way to synthesize a *resumable* conversation from foreign session
        // history, so we refuse rather than write an un-resumable stub.
        Err(anyhow::anyhow!(
            "Antigravity (agy) is read/resume-only: casr cannot create a resumable \
             agy conversation from another provider's history. Use agy as a conversion \
             SOURCE (e.g. `casr resume cc <agy-uuid> --source agy`), not a target."
        ))
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("agy --conversation {session_id} --model \"{AGY_REQUIRED_MODEL}\"")
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Map a transcript step's `source` to a canonical role.
///
/// Returns `None` for sources we don't surface as conversation turns.
fn role_for_source(source: &str) -> Option<MessageRole> {
    match source {
        "USER_EXPLICIT" | "USER" => Some(MessageRole::User),
        "MODEL" => Some(MessageRole::Assistant),
        "SYSTEM" => Some(MessageRole::System),
        _ => None,
    }
}

/// `type` values that are pure housekeeping and carry no conversation content.
fn is_housekeeping_type(step_type: &str) -> bool {
    matches!(step_type, "CONVERSATION_HISTORY" | "EPHEMERAL_MESSAGE")
}

/// Unwrap the `<USER_REQUEST>…</USER_REQUEST>` envelope agy wraps user input in,
/// and strip the trailing `<ADDITIONAL_METADATA>` / `<USER_SETTINGS_CHANGE>`
/// system annotations. Returns the inner request text, trimmed.
fn unwrap_user_request(content: &str) -> String {
    if let Some(start) = content.find("<USER_REQUEST>") {
        let after = &content[start + "<USER_REQUEST>".len()..];
        if let Some(end) = after.find("</USER_REQUEST>") {
            return after[..end].trim().to_string();
        }
    }
    // No envelope — but still drop any trailing metadata/settings annotations.
    let mut text = content;
    for marker in ["<ADDITIONAL_METADATA>", "<USER_SETTINGS_CHANGE>"] {
        if let Some(idx) = text.find(marker) {
            text = &text[..idx];
        }
    }
    text.trim().to_string()
}

/// Extract tool calls from a transcript step's `tool_calls` array, if present.
fn extract_tool_calls(step: &serde_json::Value) -> Vec<crate::model::ToolCall> {
    let Some(arr) = step.get("tool_calls").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|call| {
            let obj = call.as_object()?;
            Some(crate::model::ToolCall {
                id: obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string),
                name: obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                arguments: obj.get("args").cloned().unwrap_or(serde_json::Value::Null),
            })
        })
        .collect()
}

/// Convert a single transcript step into a [`CanonicalMessage`], or `None` if
/// the step is not a surfaceable conversation turn.
fn step_to_message(step: &serde_json::Value) -> Option<CanonicalMessage> {
    let source = step.get("source").and_then(|v| v.as_str()).unwrap_or("");
    let role = role_for_source(source)?;

    let step_type = step.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if is_housekeeping_type(step_type) {
        return None;
    }

    let raw_content = step.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let content = if role == MessageRole::User {
        unwrap_user_request(raw_content)
    } else {
        raw_content.trim().to_string()
    };

    // The model's internal reasoning is preserved as a fallback when the
    // visible content is empty (tool-only planner steps), mirroring the Gemini
    // provider's `thoughts` handling.
    let thinking = step
        .get("thinking")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let tool_calls = extract_tool_calls(step);

    let effective_content = if content.is_empty() && tool_calls.is_empty() {
        thinking.clone()
    } else {
        content
    };

    // Skip steps that carry no content and no tool activity at all.
    if effective_content.trim().is_empty() && tool_calls.is_empty() {
        return None;
    }

    let timestamp = step.get("created_at").and_then(parse_timestamp);

    Some(CanonicalMessage {
        idx: 0,
        role,
        content: effective_content,
        timestamp,
        author: None,
        tool_calls,
        tool_results: Vec::new(),
        extra: step.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        AGY_REQUIRED_MODEL, Antigravity, is_housekeeping_type, list_conversations_in,
        role_for_source, step_to_message, unwrap_user_request,
    };
    use crate::model::MessageRole;
    use crate::providers::Provider;
    use serde_json::json;
    use std::io::Write as _;

    // -----------------------------------------------------------------------
    // Role / type mapping
    // -----------------------------------------------------------------------

    #[test]
    fn role_for_source_maps_known_sources() {
        assert_eq!(role_for_source("USER_EXPLICIT"), Some(MessageRole::User));
        assert_eq!(role_for_source("USER"), Some(MessageRole::User));
        assert_eq!(role_for_source("MODEL"), Some(MessageRole::Assistant));
        assert_eq!(role_for_source("SYSTEM"), Some(MessageRole::System));
        assert_eq!(role_for_source("UNKNOWN_THING"), None);
    }

    #[test]
    fn housekeeping_types_recognized() {
        assert!(is_housekeeping_type("CONVERSATION_HISTORY"));
        assert!(is_housekeeping_type("EPHEMERAL_MESSAGE"));
        assert!(!is_housekeeping_type("USER_INPUT"));
        assert!(!is_housekeeping_type("PLANNER_RESPONSE"));
    }

    // -----------------------------------------------------------------------
    // User-request unwrapping
    // -----------------------------------------------------------------------

    #[test]
    fn unwrap_user_request_strips_envelope() {
        let raw = "<USER_REQUEST>\nFix the bug in main.rs\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-06-11T16:14:42-04:00.\n</ADDITIONAL_METADATA>";
        assert_eq!(unwrap_user_request(raw), "Fix the bug in main.rs");
    }

    #[test]
    fn unwrap_user_request_without_envelope_strips_metadata() {
        let raw = "Just do the thing\n<USER_SETTINGS_CHANGE>\nsomething\n</USER_SETTINGS_CHANGE>";
        assert_eq!(unwrap_user_request(raw), "Just do the thing");
    }

    #[test]
    fn unwrap_user_request_plain_text_passthrough() {
        assert_eq!(unwrap_user_request("plain text"), "plain text");
    }

    // -----------------------------------------------------------------------
    // step_to_message
    // -----------------------------------------------------------------------

    #[test]
    fn step_to_message_user_input() {
        let step = json!({
            "step_index": 0,
            "source": "USER_EXPLICIT",
            "type": "USER_INPUT",
            "status": "DONE",
            "created_at": "2026-06-11T20:14:42Z",
            "content": "<USER_REQUEST>\nHello agy\n</USER_REQUEST>"
        });
        let msg = step_to_message(&step).expect("user step should map");
        assert_eq!(msg.role, MessageRole::User);
        assert_eq!(msg.content, "Hello agy");
        assert!(msg.timestamp.is_some());
    }

    #[test]
    fn step_to_message_model_response() {
        let step = json!({
            "source": "MODEL",
            "type": "PLANNER_RESPONSE",
            "content": "Here is the summary of what I did."
        });
        let msg = step_to_message(&step).expect("model step should map");
        assert_eq!(msg.role, MessageRole::Assistant);
        assert_eq!(msg.content, "Here is the summary of what I did.");
    }

    #[test]
    fn step_to_message_skips_housekeeping() {
        let history = json!({"source": "SYSTEM", "type": "CONVERSATION_HISTORY"});
        let ephemeral =
            json!({"source": "SYSTEM", "type": "EPHEMERAL_MESSAGE", "content": "noise"});
        assert!(step_to_message(&history).is_none());
        assert!(step_to_message(&ephemeral).is_none());
    }

    #[test]
    fn step_to_message_skips_empty_content() {
        let step = json!({"source": "MODEL", "type": "PLANNER_RESPONSE", "content": "   "});
        assert!(step_to_message(&step).is_none());
    }

    #[test]
    fn step_to_message_falls_back_to_thinking_for_tool_only_planner() {
        let step = json!({
            "source": "MODEL",
            "type": "PLANNER_RESPONSE",
            "content": "",
            "thinking": "I will read the file first."
        });
        let msg = step_to_message(&step).expect("thinking fallback should map");
        assert_eq!(msg.content, "I will read the file first.");
        assert_eq!(msg.role, MessageRole::Assistant);
    }

    #[test]
    fn step_to_message_extracts_tool_calls() {
        let step = json!({
            "source": "MODEL",
            "type": "PLANNER_RESPONSE",
            "content": "",
            "tool_calls": [
                {"name": "view_file", "args": {"AbsolutePath": "/tmp/data.txt"}}
            ]
        });
        let msg = step_to_message(&step).expect("tool-only step should map");
        assert_eq!(msg.tool_calls.len(), 1);
        assert_eq!(msg.tool_calls[0].name, "view_file");
    }

    // -----------------------------------------------------------------------
    // Provider metadata + resume command
    // -----------------------------------------------------------------------

    #[test]
    fn provider_identity() {
        let p = Antigravity;
        assert_eq!(p.name(), "Antigravity CLI");
        assert_eq!(p.slug(), "antigravity");
        assert_eq!(p.cli_alias(), "agy");
    }

    #[test]
    fn resume_command_pins_required_model() {
        let p = Antigravity;
        let cmd =
            <Antigravity as Provider>::resume_command(&p, "901d1db7-8590-4cb0-a7cb-35fac369d860");
        assert_eq!(
            cmd,
            "agy --conversation 901d1db7-8590-4cb0-a7cb-35fac369d860 --model \"Gemini 3.1 Pro (High)\""
        );
        // The mandated model must appear verbatim.
        assert!(cmd.contains(AGY_REQUIRED_MODEL));
        assert!(cmd.contains("--conversation"));
    }

    #[test]
    fn write_session_is_refused() {
        let p = Antigravity;
        let session = crate::model::CanonicalSession {
            session_id: "x".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: None,
            title: None,
            started_at: None,
            ended_at: None,
            messages: vec![],
            metadata: serde_json::Value::Null,
            source_path: std::path::PathBuf::from("/tmp/x"),
            model_name: None,
        };
        let opts = crate::providers::WriteOptions { force: false };
        let err = p
            .write_session(&session, &opts)
            .expect_err("agy must refuse writes");
        assert!(err.to_string().contains("read/resume-only"));
    }

    // -----------------------------------------------------------------------
    // Enumeration + read from a fixture conversations/ + brain/ layout
    //
    // The crate is `#![forbid(unsafe_code)]`, so these unit tests must NOT
    // mutate process env (which requires `unsafe`). They build a real on-disk
    // `antigravity-cli/` tree and exercise the path-pure functions directly
    // (`list_conversations_in`, `read_session`). End-to-end env-driven
    // enumeration + gmi disambiguation is covered by the integration tests in
    // `tests/fixtures_test.rs`.
    // -----------------------------------------------------------------------

    /// Build a temporary `antigravity-cli` tree with conversations + brain
    /// transcripts, plus a sibling legacy gmi `tmp/.../chats` dir (which must be
    /// invisible to the agy enumerator). Returns `(tempdir guard, cli_dir)`.
    fn make_agy_tree(
        conversations: &[(&str, &str)], // (uuid, transcript_jsonl_contents)
    ) -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let home = tmp.path();
        let cli_dir = home.join("antigravity-cli");
        let conv_dir = cli_dir.join("conversations");
        std::fs::create_dir_all(&conv_dir).expect("create conversations dir");

        for (uuid, transcript) in conversations {
            // Conversation db (content opaque; only the filename stem matters).
            let db = conv_dir.join(format!("{uuid}.db"));
            std::fs::write(&db, b"SQLite format 3\x00fixture").expect("write db");

            // Brain transcript at the canonical sibling path.
            let logs = cli_dir
                .join("brain")
                .join(uuid)
                .join(".system_generated")
                .join("logs");
            std::fs::create_dir_all(&logs).expect("create logs dir");
            let mut f = std::fs::File::create(logs.join("transcript.jsonl")).expect("transcript");
            f.write_all(transcript.as_bytes())
                .expect("write transcript");
        }

        // Legacy gmi layout under the SAME ~/.gemini parent — MUST NOT be
        // picked up by the agy enumerator (it scans only conversations/*.db).
        let gmi_chats = home.join("tmp").join("deadbeefhash").join("chats");
        std::fs::create_dir_all(&gmi_chats).expect("create gmi chats");
        std::fs::write(
            gmi_chats.join("session-gmi-legacy-001.json"),
            br#"{"sessionId":"gmi-legacy-001","messages":[]}"#,
        )
        .expect("write gmi session");

        (tmp, cli_dir)
    }

    const SAMPLE_TRANSCRIPT: &str = concat!(
        r#"{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-06-11T20:14:42Z","content":"<USER_REQUEST>\nRead data.txt\n</USER_REQUEST>"}"#,
        "\n",
        r#"{"step_index":1,"source":"SYSTEM","type":"CONVERSATION_HISTORY","status":"DONE","created_at":"2026-06-11T20:14:42Z"}"#,
        "\n",
        r#"{"step_index":2,"source":"SYSTEM","type":"EPHEMERAL_MESSAGE","status":"DONE","created_at":"2026-06-11T20:14:42Z","content":"noise"}"#,
        "\n",
        r#"{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-06-11T20:15:10Z","content":"The answer is 1234.","thinking":"reasoned"}"#,
    );

    #[test]
    fn list_conversations_enumerates_db_stems_only() {
        let (_guard, cli_dir) = make_agy_tree(&[
            ("901d1db7-8590-4cb0-a7cb-35fac369d860", SAMPLE_TRANSCRIPT),
            ("ad053acc-0ee5-4f9b-b8b6-20506bfd5f56", SAMPLE_TRANSCRIPT),
        ]);

        let convs = list_conversations_in(&cli_dir.join("conversations"));
        let mut ids: Vec<String> = convs.iter().map(|(id, _)| id.clone()).collect();
        ids.sort();
        assert_eq!(
            ids,
            vec![
                "901d1db7-8590-4cb0-a7cb-35fac369d860".to_string(),
                "ad053acc-0ee5-4f9b-b8b6-20506bfd5f56".to_string(),
            ]
        );
        // Crucially, the legacy gmi session id is NOT present.
        assert!(!ids.iter().any(|id| id.contains("gmi-legacy")));
        // Every enumerated path is a `.db` under conversations/.
        for (uuid, path) in &convs {
            assert!(path.ends_with(format!("{uuid}.db")));
        }
    }

    #[test]
    fn list_conversations_ignores_non_db_files() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let conv_dir = tmp.path().join("conversations");
        std::fs::create_dir_all(&conv_dir).expect("mkdir");
        std::fs::write(conv_dir.join("real-uuid.db"), b"SQLite format 3\x00").expect("db");
        std::fs::write(conv_dir.join("notes.txt"), b"ignore me").expect("txt");
        std::fs::write(conv_dir.join("session-x.json"), b"{}").expect("json");

        let convs = list_conversations_in(&conv_dir);
        let ids: Vec<String> = convs.into_iter().map(|(id, _)| id).collect();
        assert_eq!(ids, vec!["real-uuid".to_string()]);
    }

    #[test]
    fn read_session_parses_transcript_and_pins_model() {
        let (_guard, cli_dir) =
            make_agy_tree(&[("901d1db7-8590-4cb0-a7cb-35fac369d860", SAMPLE_TRANSCRIPT)]);
        let db = cli_dir
            .join("conversations")
            .join("901d1db7-8590-4cb0-a7cb-35fac369d860.db");
        let session = Antigravity.read_session(&db).expect("should read");

        assert_eq!(session.provider_slug, "antigravity");
        assert_eq!(session.session_id, "901d1db7-8590-4cb0-a7cb-35fac369d860");
        assert_eq!(session.model_name.as_deref(), Some(AGY_REQUIRED_MODEL));
        // Housekeeping SYSTEM steps dropped; only user + model remain.
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Read data.txt");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "The answer is 1234.");
        assert_eq!(session.title.as_deref(), Some("Read data.txt"));
        assert!(session.started_at.is_some());
        assert!(session.ended_at.is_some());
        assert!(session.ended_at.unwrap() >= session.started_at.unwrap());
        // Sequential reindexing.
        for (i, m) in session.messages.iter().enumerate() {
            assert_eq!(m.idx, i);
        }
        // Metadata records the conversation uuid + transcript path.
        assert_eq!(
            session.metadata["conversation_uuid"].as_str(),
            Some("901d1db7-8590-4cb0-a7cb-35fac369d860")
        );
    }

    #[test]
    fn read_session_without_transcript_yields_empty_preview() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let conv_dir = tmp.path().join("antigravity-cli").join("conversations");
        std::fs::create_dir_all(&conv_dir).expect("create dirs");
        let db = conv_dir.join("no-brain-uuid.db");
        std::fs::write(&db, b"SQLite format 3\x00").expect("write db");

        let session = Antigravity.read_session(&db).expect("read should succeed");
        assert_eq!(session.session_id, "no-brain-uuid");
        assert_eq!(session.messages.len(), 0);
        assert!(session.title.is_none());
        // Even with no transcript, the resume model is pinned.
        assert_eq!(session.model_name.as_deref(), Some(AGY_REQUIRED_MODEL));
    }
}
