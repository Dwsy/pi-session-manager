//! Trace event validation tests (bd-1bh.41).
//!
//! Uses the CLI binary with --verbose and --trace flags to verify that
//! key lifecycle events are emitted during pipeline operations.
//! Each test runs the binary and checks stderr for expected trace events.

use std::fs;
use std::path::PathBuf;

use assert_cmd::Command;
use tempfile::TempDir;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn casr_cmd(tmp: &TempDir) -> Command {
    #[allow(deprecated)]
    let mut cmd = Command::cargo_bin("casr").expect("casr binary should be built");
    cmd.env("CLAUDE_HOME", tmp.path().join("claude"))
        .env("CODEX_HOME", tmp.path().join("codex"))
        .env("GEMINI_HOME", tmp.path().join("gemini"))
        .env("CURSOR_HOME", tmp.path().join("cursor"))
        .env("CLINE_HOME", tmp.path().join("cline"))
        .env("AIDER_HOME", tmp.path().join("aider"))
        .env("AMP_HOME", tmp.path().join("amp"))
        .env("OPENCODE_HOME", tmp.path().join("opencode"))
        .env("CHATGPT_HOME", tmp.path().join("chatgpt"))
        .env("CLAWDBOT_HOME", tmp.path().join("clawdbot"))
        .env("VIBE_HOME", tmp.path().join("vibe"))
        .env("FACTORY_HOME", tmp.path().join("factory"))
        .env("OPENCLAW_HOME", tmp.path().join("openclaw"))
        .env("PI_AGENT_HOME", tmp.path().join("pi-agent"))
        .env("XDG_CONFIG_HOME", tmp.path().join("xdg-config"))
        .env("XDG_DATA_HOME", tmp.path().join("xdg-data"))
        .env("NO_COLOR", "1");
    cmd
}

fn setup_cc_fixture(tmp: &TempDir, fixture_name: &str) -> String {
    let source = fixtures_dir().join(format!("claude_code/{fixture_name}.jsonl"));
    let content = fs::read_to_string(&source)
        .unwrap_or_else(|e| panic!("Failed to read fixture {fixture_name}: {e}"));

    let first_line: serde_json::Value = content
        .lines()
        .find(|l| !l.trim().is_empty())
        .and_then(|l| serde_json::from_str(l).ok())
        .expect("fixture should have valid first line");

    let session_id = first_line["sessionId"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let cwd = first_line["cwd"].as_str().unwrap_or("/tmp");
    let project_key: String = cwd
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect();

    let projects_dir = tmp.path().join("claude/projects").join(&project_key);
    fs::create_dir_all(&projects_dir).expect("create CC project dir");
    fs::write(projects_dir.join(format!("{session_id}.jsonl")), &content)
        .expect("write CC fixture");

    session_id
}

// ===========================================================================
// Pipeline lifecycle events (via --trace)
// ===========================================================================

#[test]
fn trace_emits_starting_conversion() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --trace");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("starting conversion"),
        "trace should contain 'starting conversion', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_emits_source_session_resolved() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --trace");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("source session resolved"),
        "trace should contain 'source session resolved', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_emits_source_session_read() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --trace");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("source session read"),
        "trace should contain 'source session read', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_emits_dry_run_skip() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --trace");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("dry run"),
        "trace should contain 'dry run', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_emits_atomic_write_on_real_write() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id])
        .output()
        .expect("run casr --trace resume (write)");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("atomic write complete"),
        "trace should contain 'atomic write complete' on real write, got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_dry_run_omits_atomic_write() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --trace --dry-run");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !stderr.contains("atomic write complete"),
        "trace dry-run should NOT contain 'atomic write complete'"
    );
}

#[test]
fn trace_emits_enrichment_applied() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--enrich"])
        .output()
        .expect("run casr --trace --enrich");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("applied casr enrichment"),
        "trace should contain 'applied casr enrichment', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

// ===========================================================================
// Provider detection events
// ===========================================================================

#[test]
fn trace_emits_target_provider_detection() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --trace");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("target provider detection"),
        "trace should contain 'target provider detection', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_emits_auto_resolve_search() {
    let tmp = TempDir::new().unwrap();

    let output = casr_cmd(&tmp)
        .args([
            "--trace",
            "resume",
            "cod",
            "nonexistent-id-12345",
            "--dry-run",
        ])
        .output()
        .expect("run casr --trace with bad session");

    // Should fail (session not found) but trace events should be present.
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("auto-resolving session"),
        "trace should contain 'auto-resolving session', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

// ===========================================================================
// Verbose (debug level) also captures key events
// ===========================================================================

#[test]
fn verbose_emits_source_session_resolved() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--verbose", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --verbose");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // --verbose shows debug-level events, which includes session resolution.
    assert!(
        stderr.contains("source session resolved"),
        "--verbose should contain 'source session resolved', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn verbose_emits_session_read() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--verbose", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("run casr --verbose");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("source session read"),
        "--verbose should contain 'source session read', got stderr:\n{}",
        &stderr[..stderr.len().min(500)]
    );
}
