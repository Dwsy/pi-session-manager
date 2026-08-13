//! Integration tests for the Grok Build provider.
//!
//! These exercise discovery, reading, and CLI behavior against a temporary
//! `$GROK_HOME` seeded from the fixture tree. They live here rather than in
//! the in-crate `#[cfg(test)]` module because `src/lib.rs` declares
//! `#![forbid(unsafe_code)]` and `std::env::set_var` is `unsafe` in edition
//! 2024 — the shared `EnvGuard`/`EnvLock` harness (see `tests/test_env.rs`)
//! serializes process-global env mutation here, in a separate crate.

mod test_env;

use std::path::{Path, PathBuf};

use casr::discovery::ProviderRegistry;
use casr::model::MessageRole;
use casr::providers::{Provider, WriteOptions, grok::Grok};

static GROK_ENV: test_env::EnvLock = test_env::EnvLock;

struct EnvGuard {
    key: &'static str,
    original: Option<String>,
}

impl EnvGuard {
    fn set(key: &'static str, value: &Path) -> Self {
        let original = std::env::var(key).ok();
        // SAFETY: callers hold the `GROK_ENV` lock for the duration, so no
        // other thread reads or mutates the environment concurrently.
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

const FIXTURE_ID: &str = "019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5";
const ENCODED_CWD: &str = "%2Fdata%2Fprojects%2Fdemo";
const FIXTURE_WORKSPACE: &str = "/data/projects/demo";

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/grok")
}

/// Copy the fixture session tree into `$GROK_HOME/sessions/…`, plus the
/// non-session artifacts a real `~/.grok/sessions` tree contains
/// (`session_search.sqlite`, group-level `prompt_history.jsonl`).
fn seed_grok_home(home: &Path) {
    let dst = home.join("sessions").join(ENCODED_CWD).join(FIXTURE_ID);
    std::fs::create_dir_all(&dst).unwrap();
    let src = fixtures_dir().join("sessions").join(ENCODED_CWD).join(FIXTURE_ID);
    for name in ["updates.jsonl", "summary.json"] {
        std::fs::copy(src.join(name), dst.join(name)).unwrap();
    }
    std::fs::write(home.join("sessions").join("session_search.sqlite"), b"SQLite format 3\x00fixture").unwrap();
    std::fs::write(home.join("sessions").join(ENCODED_CWD).join("prompt_history.jsonl"), format!("{{\"timestamp\":\"2026-07-18T15:20:56.242466991Z\",\"session_id\":\"{FIXTURE_ID}\",\"prompt\":\"Run the shell command: echo hi .\",\"is_bash\":false}}\n")).unwrap();
}

#[test]
fn discovery_lists_and_owns_seeded_session() {
    let _lock = GROK_ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let _env = EnvGuard::set("GROK_HOME", tmp.path());
    seed_grok_home(tmp.path());

    let listed = Grok.list_sessions().expect("list_sessions");
    assert_eq!(listed.len(), 1, "exactly one seeded session: {listed:?}");
    assert_eq!(listed[0].0, FIXTURE_ID);

    let owned = Grok.owns_session(FIXTURE_ID).expect("owns seeded session");
    assert!(owned.ends_with("updates.jsonl"));

    // Case-insensitive ownership lookup.
    let upper = FIXTURE_ID.to_ascii_uppercase();
    assert!(Grok.owns_session(&upper).is_some());

    // The registry resolves the `grk` alias (and slug tokens) to Grok.
    let registry = ProviderRegistry::default_registry();
    let provider = registry.find_by_alias("grk").expect("grk alias resolves");
    assert_eq!(provider.slug(), "grok");
    let provider = registry.find_by_alias("grok-build").expect("grok-build token resolves");
    assert_eq!(provider.slug(), "grok");
}

#[test]
fn read_session_from_seeded_home_matches_fixture_expectations() {
    let _lock = GROK_ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let _env = EnvGuard::set("GROK_HOME", tmp.path());
    seed_grok_home(tmp.path());

    let path = Grok.owns_session(FIXTURE_ID).expect("owns");
    let session = Grok.read_session(&path).expect("read");

    assert_eq!(session.session_id, FIXTURE_ID);
    assert_eq!(session.provider_slug, "grok");
    assert_eq!(session.workspace, Some(PathBuf::from(FIXTURE_WORKSPACE)));
    assert_eq!(session.model_name.as_deref(), Some("grok-build"));
    assert_eq!(session.messages.len(), 5);
    assert_eq!(session.messages[0].role, MessageRole::User);
    assert!(session.messages.iter().any(|m| !m.tool_calls.is_empty()));
    assert!(session.messages.iter().any(|m| !m.tool_results.is_empty()));
}

#[test]
fn write_session_round_trips_through_reader() {
    use casr::model::{CanonicalMessage, CanonicalSession, ToolCall, ToolResult};

    let _lock = GROK_ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let _env = EnvGuard::set("GROK_HOME", tmp.path());

    let msg = |idx: usize, role: MessageRole, content: &str, ts: i64| CanonicalMessage { idx, role, content: content.into(), timestamp: Some(ts), author: None, tool_calls: vec![], tool_results: vec![], extra: serde_json::Value::Null };
    let mut tool_msg = msg(2, MessageRole::Assistant, "Running the command.", 1_784_388_020_000);
    tool_msg.tool_calls.push(ToolCall { id: Some("call_a".into()), name: "run_terminal_cmd".into(), arguments: serde_json::json!({"command": "echo hi"}) });
    tool_msg.tool_results.push(ToolResult { call_id: Some("call_a".into()), content: "hi\n".into(), is_error: false });
    let mut thought = msg(3, MessageRole::Assistant, "Reflecting on the output.", 1_784_388_025_000);
    thought.author = Some("reasoning".into());

    let session = CanonicalSession {
        session_id: "foreign".into(),
        provider_slug: "claude-code".into(),
        workspace: Some(PathBuf::from("/data/projects/foo")),
        title: Some("Writer round-trip".into()),
        started_at: Some(1_784_388_000_000),
        ended_at: Some(1_784_388_100_000),
        messages: vec![
            // Two consecutive user prompts must stay two messages (the writer
            // stamps distinct promptIndex markers; the reader breaks on them).
            msg(0, MessageRole::User, "Run echo hi", 1_784_388_000_000),
            msg(1, MessageRole::User, "And be quick", 1_784_388_010_000),
            tool_msg,
            thought,
            // Two consecutive assistant messages must also stay separate
            // (distinct promptId markers).
            msg(4, MessageRole::Assistant, "Done: hi", 1_784_388_030_000),
            msg(5, MessageRole::System, "system note", 1_784_388_040_000),
        ],
        metadata: serde_json::Value::Object(serde_json::Map::new()),
        source_path: PathBuf::from("/nonexistent"),
        model_name: Some("claude-opus-4".into()),
    };

    let written = Grok.write_session(&session, &WriteOptions { force: false }).expect("grok write succeeds");
    assert_ne!(written.session_id, "foreign", "fresh UUID session id");
    assert!(written.paths[0].ends_with("updates.jsonl"));
    assert!(written.paths[1].ends_with("summary.json"));
    assert_eq!(written.resume_command, format!("grok --resume {}", written.session_id));
    assert!(written.warnings.is_empty(), "{:?}", written.warnings);

    // The session must be discoverable exactly like a native one.
    let owned = Grok.owns_session(&written.session_id).expect("written session is owned");
    assert_eq!(owned, written.paths[0]);

    let readback = Grok.read_session(&written.paths[0]).expect("read back");
    assert_eq!(readback.session_id, written.session_id);
    assert_eq!(readback.messages.len(), 6, "{:#?}", readback.messages);
    assert_eq!(readback.messages[0].role, MessageRole::User);
    assert_eq!(readback.messages[0].content, "Run echo hi");
    assert_eq!(readback.messages[1].role, MessageRole::User);
    assert_eq!(readback.messages[1].content, "And be quick");
    assert_eq!(readback.messages[2].role, MessageRole::Assistant);
    assert_eq!(readback.messages[2].content, "Running the command.");
    assert_eq!(readback.messages[2].tool_calls.len(), 1);
    assert_eq!(readback.messages[2].tool_calls[0].id.as_deref(), Some("call_a"));
    assert_eq!(readback.messages[2].tool_calls[0].name, "run_terminal_cmd");
    assert_eq!(readback.messages[2].tool_results.len(), 1);
    assert_eq!(readback.messages[2].tool_results[0].content, "hi\n");
    assert_eq!(readback.messages[3].author.as_deref(), Some("reasoning"), "reasoning author survives via agent_thought_chunk");
    assert_eq!(readback.messages[3].content, "Reflecting on the output.");
    assert_eq!(readback.messages[4].role, MessageRole::Assistant);
    assert_eq!(readback.messages[4].content, "Done: hi");
    // System has no native Grok update kind; it collapses to the user bucket
    // with content preserved (the pipeline verifies role BUCKETS, and
    // system/tool/user share one bucket).
    assert_eq!(readback.messages[5].role, MessageRole::User);
    assert_eq!(readback.messages[5].content, "system note");

    // Metadata: title via summary.json. The foreign (non-grok) model id is
    // replaced with the default Grok model: summary.json's current_model_id
    // is REQUIRED for `grok --resume` to load the session (live-bisected on
    // grok 0.2.118), and a foreign id would confuse model selection.
    assert_eq!(readback.title.as_deref(), Some("Writer round-trip"));
    assert_eq!(readback.workspace, Some(PathBuf::from("/data/projects/foo")));
    assert_eq!(readback.model_name.as_deref(), Some("grok-4.5"));
}

/// CLI smoke test: `casr list --provider grok` finds the seeded session.
#[test]
fn cli_list_finds_seeded_grok_session() {
    let _lock = GROK_ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    seed_grok_home(tmp.path());

    // `casr list` defaults to scoping by the current working-directory
    // project; the fixture's workspace is a synthetic path, so pass it
    // explicitly via `--workspace` to take it out of cwd scope.
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_casr")).args(["list", "--provider", "grok", "--workspace", FIXTURE_WORKSPACE, "--limit", "5"]).env("GROK_HOME", tmp.path()).output().expect("run casr list");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "casr list failed: status={:?}\nstdout={stdout}\nstderr={stderr}", output.status);
    assert!(stdout.contains(FIXTURE_ID) || stdout.contains("grok"), "expected the seeded Grok session in output:\n{stdout}");
}

/// CLI smoke test: `casr info <id> --source grk` reports the session details.
#[test]
fn cli_info_reports_seeded_grok_session() {
    let _lock = GROK_ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    seed_grok_home(tmp.path());

    let output = std::process::Command::new(env!("CARGO_BIN_EXE_casr")).args(["info", FIXTURE_ID, "--source", "grk"]).env("GROK_HOME", tmp.path()).output().expect("run casr info");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "casr info failed: status={:?}\nstdout={stdout}\nstderr={stderr}", output.status);
    assert!(stdout.contains(FIXTURE_ID), "expected session id in info output:\n{stdout}");
}

/// CLI e2e: converting INTO grok succeeds and passes the pipeline's
/// read-back verification (which would fail the run with `VerifyFailed`
/// if the writer and reader disagreed on the format).
#[test]
fn cli_convert_into_grok_succeeds_with_readback_verification() {
    let _lock = GROK_ENV.lock().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    seed_grok_home(tmp.path());

    // Seed a Claude Code session as the cross-provider source (same-provider
    // conversions short-circuit without touching the writer).
    let cc_fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude_code/cc_simple.jsonl");
    let cc_dir = tmp.path().join("claude/projects/-data-projects-myapp");
    std::fs::create_dir_all(&cc_dir).unwrap();
    std::fs::copy(&cc_fixture, cc_dir.join("cc-simple-001.jsonl")).unwrap();

    let output = std::process::Command::new(env!("CARGO_BIN_EXE_casr")).args(["resume", "grok", "cc-simple-001", "--source", "cc"]).env("GROK_HOME", tmp.path()).env("CLAUDE_HOME", tmp.path().join("claude")).output().expect("run casr resume grok");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "converting into grok must succeed: status={:?}\nstdout={stdout}\nstderr={stderr}", output.status);
    assert!(stdout.contains("grok --resume"), "expected a grok resume command in output:\n{stdout}");

    // The written session must exist under GROK_HOME as a native tree.
    let _env = EnvGuard::set("GROK_HOME", tmp.path());
    let written = Grok.list_sessions().expect("list sessions");
    assert_eq!(written.len(), 2, "seeded fixture + newly written session: {written:?}");
    let new_session = written.iter().find(|(id, _)| id != FIXTURE_ID).expect("newly written session present");
    assert!(new_session.1.ends_with("updates.jsonl"));
    assert!(new_session.1.parent().unwrap().join("summary.json").is_file(), "summary.json written next to updates.jsonl");
}
