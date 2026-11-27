//! Integration tests for reading OpenCode 2.x databases (`session_v2` +
//! `session_message`, issue #30) and converting them to other providers.
//!
//! These live here rather than in the in-crate `#[cfg(test)]` module because
//! the target writers resolve their homes from env vars (`CLAUDE_HOME`,
//! `OPENCODE_DB_PATH`), `std::env::set_var` is `unsafe` in edition 2024, and
//! `src/lib.rs` declares `#![forbid(unsafe_code)]`. The shared
//! `EnvGuard`/`EnvLock` harness (see `tests/test_env.rs`) serializes
//! process-global env mutation here, in a separate crate.

mod test_env;

use std::path::Path;

use casr::model::{CanonicalSession, MessageRole};
use casr::providers::{Provider, WriteOptions, claude_code::ClaudeCode, opencode::OpenCode};
use rusqlite::Connection;

static ENV: test_env::EnvLock = test_env::EnvLock;

struct EnvGuard {
    key: &'static str,
    original: Option<String>,
}

impl EnvGuard {
    fn set(key: &'static str, value: &Path) -> Self {
        let original = std::env::var(key).ok();
        // SAFETY: callers hold the `ENV` lock for the duration, so no other
        // thread reads or mutates the environment concurrently.
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

const SESSION_ID: &str = "ses_v2_integration_live";

/// Build a minimal OpenCode 2.x DB (columns per upstream
/// `packages/core/src/session/sql.ts`, `beta` branch) holding one session
/// that exercises every entry kind casr keeps plus the bookkeeping kinds it
/// skips.
fn create_v2_db(db_path: &Path, directory: &Path) {
    let conn = Connection::open(db_path).expect("create fixture db");
    conn.execute_batch(
        r#"
CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
CREATE TABLE session_v2 (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    workspace_id TEXT, parent_id TEXT, fork_session_id TEXT, fork_boundary TEXT,
    slug TEXT NOT NULL, directory TEXT NOT NULL, path TEXT, title TEXT, version TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, tokens_cache_read INTEGER NOT NULL DEFAULT 0,
    tokens_cache_write INTEGER NOT NULL DEFAULT 0,
    agent TEXT, model TEXT,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, time_archived INTEGER
);
CREATE TABLE session_message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES session_v2(id) ON DELETE CASCADE,
    type TEXT NOT NULL, seq INTEGER NOT NULL,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
    data TEXT NOT NULL
);
CREATE UNIQUE INDEX session_message_session_seq_idx ON session_message (session_id, seq);
INSERT INTO project (id, worktree, name) VALUES ('prj_it', '/work', 'work');
"#,
    )
    .expect("create 2.x schema");

    conn.execute(
        "INSERT INTO session_v2 (id, project_id, slug, directory, title, version, agent, model,
            time_created, time_updated)
         VALUES (?1, 'prj_it', 'live', ?2, 'integration session', '2.0.0-beta.19187', 'build',
            '{\"providerID\":\"anthropic\",\"id\":\"claude-sonnet-4\"}', 1700000000000, 1700000020000)",
        rusqlite::params![SESSION_ID, directory.display().to_string()],
    )
    .expect("insert session");

    let rows: Vec<(&str, &str, serde_json::Value)> = vec![
        (
            "msg_it_model",
            "model-switched",
            serde_json::json!({"model": {"providerID": "anthropic", "id": "claude-sonnet-4"}, "time": {"created": 1_700_000_000_500_i64}}),
        ),
        (
            "msg_it_user1",
            "user",
            serde_json::json!({"text": "Please inspect src/main.rs", "time": {"created": 1_700_000_001_000_i64}}),
        ),
        (
            "msg_it_asst1",
            "assistant",
            serde_json::json!({
                "agent": "build",
                "model": {"providerID": "anthropic", "id": "claude-sonnet-4"},
                "content": [
                    {"type": "reasoning", "text": "Read it first."},
                    {
                        "type": "tool", "id": "call_it_1", "name": "read", "executed": true,
                        "state": {"status": "completed", "input": {"filePath": "src/main.rs"},
                                  "content": [{"type": "text", "text": "fn main() {}"}]},
                        "time": {"created": 1_700_000_005_500_i64, "completed": 1_700_000_006_000_i64}
                    },
                    {
                        "type": "tool", "id": "call_it_2", "name": "bash", "executed": true,
                        "state": {"status": "error", "input": {"command": "cat missing"},
                                  "error": {"type": "Tool.Error", "message": "no such file"}},
                        "time": {"created": 1_700_000_006_100_i64, "completed": 1_700_000_006_500_i64}
                    },
                    {"type": "text", "text": "main is empty."}
                ],
                "time": {"created": 1_700_000_005_000_i64, "completed": 1_700_000_009_000_i64}
            }),
        ),
        (
            "msg_it_shell",
            "shell",
            serde_json::json!({
                "shellID": "sh_it", "command": "ls src", "status": "exited", "exit": 0,
                "output": {"output": "main.rs", "cursor": 7, "size": 7, "truncated": false},
                "time": {"created": 1_700_000_010_000_i64, "completed": 1_700_000_010_200_i64}
            }),
        ),
        (
            "msg_it_synth",
            "synthetic",
            serde_json::json!({"text": "Background shell finished: ls src", "time": {"created": 1_700_000_011_000_i64}}),
        ),
        (
            "msg_it_system",
            "system",
            serde_json::json!({"text": "Instructions updated.", "time": {"created": 1_700_000_012_000_i64}}),
        ),
        (
            "msg_it_compact",
            "compaction",
            serde_json::json!({
                "status": "completed", "reason": "auto",
                "summary": "We looked at main.rs.", "recent": "User asked about main.rs.",
                "time": {"created": 1_700_000_013_000_i64}
            }),
        ),
        (
            "msg_it_user2",
            "user",
            serde_json::json!({"text": "Add a hello world.", "time": {"created": 1_700_000_014_000_i64}}),
        ),
        (
            "msg_it_asst2",
            "assistant",
            serde_json::json!({
                "agent": "build",
                "model": {"providerID": "anthropic", "id": "claude-sonnet-4"},
                "content": [{"type": "text", "text": "Done."}],
                "time": {"created": 1_700_000_015_000_i64, "completed": 1_700_000_016_000_i64}
            }),
        ),
    ];
    for (seq, (id, kind, data)) in rows.into_iter().enumerate() {
        let created = data["time"]["created"].as_i64().unwrap();
        conn.execute(
            "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
            rusqlite::params![
                id,
                SESSION_ID,
                kind,
                i64::try_from(seq).unwrap() + 1,
                created,
                serde_json::to_string(&data).unwrap()
            ],
        )
        .expect("insert message");
    }
}

fn read_v2_fixture(tmp: &Path) -> CanonicalSession {
    let db_path = tmp.join("opencode.db");
    let workspace = tmp.join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    create_v2_db(&db_path, &workspace);

    // Discovery through the env override must surface the 2.x session with
    // its title, directory and time (what `casr list` renders).
    let _env = EnvGuard::set("OPENCODE_DB_PATH", &db_path);
    let listed = OpenCode.list_sessions().expect("opencode lists");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].0, SESSION_ID);
    let session = OpenCode
        .read_session(&listed[0].1)
        .expect("2.x session reads");
    assert_eq!(session.title.as_deref(), Some("integration session"));
    assert_eq!(session.workspace.as_deref(), Some(workspace.as_path()));
    assert_eq!(session.started_at, Some(1_700_000_000_000));
    assert_eq!(session.metadata["opencode_schema"], "v2");
    session
}

/// 2.x → Claude Code: every kept entry lands as a Claude Code turn with the
/// same text, and settled tool call/result pairs survive with id,
/// arguments, output and error flag. Claude Code has only user/assistant
/// entries, so Tool and System turns travel as user entries.
#[test]
fn roundtrip_2x_session_into_claude_code_keeps_transcript() {
    let _lock = ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let source = read_v2_fixture(tmp.path());
    assert_eq!(source.messages.len(), 8, "model-switched is skipped");
    let kinds: Vec<&str> = source
        .messages
        .iter()
        .map(|m| m.extra["opencode_message_type"].as_str().unwrap())
        .collect();
    assert_eq!(
        kinds,
        [
            "user",
            "assistant",
            "shell",
            "synthetic",
            "system",
            "compaction",
            "user",
            "assistant"
        ]
    );

    let cc_home = tmp.path().join("claude-home");
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &cc_home);
    let written = ClaudeCode
        .write_session(&source, &WriteOptions { force: false })
        .expect("Opc 2.x → CC write");
    let readback = ClaudeCode
        .read_session(&written.paths[0])
        .expect("CC read-back");

    assert_eq!(readback.messages.len(), source.messages.len());
    for (i, (orig, rb)) in source
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        let expected_role = match orig.role {
            MessageRole::Assistant => MessageRole::Assistant,
            _ => MessageRole::User,
        };
        assert_eq!(rb.role, expected_role, "msg {i} ({}) role", kinds[i]);
        assert_eq!(rb.content, orig.content, "msg {i} ({}) content", kinds[i]);
        assert_eq!(rb.tool_calls, orig.tool_calls, "msg {i} tool calls");
        assert_eq!(rb.tool_results, orig.tool_results, "msg {i} tool results");
        assert_eq!(rb.timestamp, orig.timestamp, "msg {i} timestamp");
    }
    assert_eq!(readback.model_name.as_deref(), Some("claude-sonnet-4"));
    assert_eq!(readback.workspace, source.workspace);

    // Spot-check the settled tool pair and the error flag on the CC side.
    let assistant = &readback.messages[1];
    assert_eq!(assistant.tool_calls[0].id.as_deref(), Some("call_it_1"));
    assert_eq!(assistant.tool_calls[0].arguments["filePath"], "src/main.rs");
    assert_eq!(assistant.tool_results[0].content, "fn main() {}");
    assert!(assistant.tool_results[1].is_error);
    assert_eq!(
        assistant.tool_results[1].content,
        "Tool.Error: no such file"
    );
    assert!(readback.messages[2].content.contains("Command:\nls src"));
    assert!(
        readback.messages[5]
            .content
            .contains("We looked at main.rs.")
    );
}

/// Writing back into the live 2.x DB through the env override is refused
/// with the mechanism explained, and the file is untouched.
#[test]
fn writing_into_live_2x_db_via_env_override_is_refused() {
    let _lock = ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let source = read_v2_fixture(tmp.path());
    let db_path = tmp.path().join("opencode.db");
    let before = std::fs::read(&db_path).unwrap();

    let _env = EnvGuard::set("OPENCODE_DB_PATH", &db_path);
    let err = OpenCode
        .write_session(&source, &WriteOptions { force: true })
        .expect_err("live 2.x DB must refuse writes");
    let msg = format!("{err:#}");
    assert!(msg.contains("2.x schema"), "got: {msg}");
    assert!(msg.contains("session_v2/session_message"), "got: {msg}");
    assert!(msg.contains("projection"), "got: {msg}");
    assert_eq!(
        std::fs::read(&db_path).unwrap(),
        before,
        "DB must be untouched"
    );
}
