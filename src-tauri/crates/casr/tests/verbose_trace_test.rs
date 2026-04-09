//! CLI --verbose and --trace output content tests (bd-1bh.42).
//!
//! Validates that:
//! 1. --verbose stderr contains debug-level info (provider detection, session ID).
//! 2. --trace stderr contains trace-level detail (per-message parsing, content steps).
//! 3. Neither --verbose nor --trace leak to stdout (stdout is for user/JSON output).

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
// --verbose produces debug-level output on stderr
// ===========================================================================

#[test]
fn verbose_providers_emits_debug_on_stderr() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--verbose", "providers"])
        .output()
        .expect("casr --verbose providers");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // --verbose should produce debug-level output on stderr.
    assert!(
        !stderr.is_empty(),
        "--verbose should produce some stderr output"
    );
    // Should contain DEBUG or provider-related content.
    assert!(
        stderr.contains("DEBUG") || stderr.contains("detection") || stderr.contains("provider"),
        "--verbose stderr should contain debug-level info, got: {}",
        &stderr[..stderr.len().min(200)]
    );
}

#[test]
fn verbose_resume_shows_session_info_on_stderr() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--verbose", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("casr --verbose resume");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Debug output should mention session resolution or conversion steps.
    assert!(
        stderr.contains("session") || stderr.contains("conversion") || stderr.contains("source"),
        "--verbose resume stderr should contain session/conversion info, got: {}",
        &stderr[..stderr.len().min(300)]
    );
}

#[test]
fn verbose_does_not_leak_debug_to_stdout() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args([
            "--verbose",
            "--json",
            "resume",
            "cod",
            &session_id,
            "--dry-run",
        ])
        .output()
        .expect("casr --verbose --json resume");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    // stdout should be valid JSON, not contaminated with debug output.
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&stdout);
    assert!(
        parsed.is_ok(),
        "--verbose stdout should remain valid JSON, got: {}",
        &stdout[..stdout.len().min(200)]
    );
    // stdout should NOT contain DEBUG/TRACE/INFO log lines.
    assert!(
        !stdout.contains("DEBUG") && !stdout.contains("TRACE"),
        "debug/trace output should not leak to stdout"
    );
}

// ===========================================================================
// --trace produces trace-level output on stderr
// ===========================================================================

#[test]
fn trace_providers_emits_trace_on_stderr() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--trace", "providers"])
        .output()
        .expect("casr --trace providers");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // --trace should produce even more output than --verbose.
    assert!(
        !stderr.is_empty(),
        "--trace should produce some stderr output"
    );
    // Should contain TRACE or DEBUG level entries.
    assert!(
        stderr.contains("TRACE") || stderr.contains("DEBUG") || stderr.contains("detection"),
        "--trace stderr should contain trace-level detail, got: {}",
        &stderr[..stderr.len().min(300)]
    );
}

#[test]
fn trace_resume_shows_detailed_parsing_on_stderr() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("casr --trace resume");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Trace should include per-message detail or provider search events.
    assert!(
        !stderr.is_empty(),
        "--trace resume should produce stderr output"
    );
    // Should contain searching/resolved or conversion trace events.
    assert!(
        stderr.contains("session")
            || stderr.contains("resolv")
            || stderr.contains("conversion")
            || stderr.contains("TRACE"),
        "--trace resume stderr should contain detailed trace events, got: {}",
        &stderr[..stderr.len().min(500)]
    );
}

#[test]
fn trace_does_not_leak_to_stdout() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args([
            "--trace",
            "--json",
            "resume",
            "cod",
            &session_id,
            "--dry-run",
        ])
        .output()
        .expect("casr --trace --json resume");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    // stdout should remain valid JSON.
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&stdout);
    assert!(
        parsed.is_ok(),
        "--trace stdout should remain valid JSON, got: {}",
        &stdout[..stdout.len().min(200)]
    );
    assert!(
        !stdout.contains("TRACE") && !stdout.contains("DEBUG"),
        "trace/debug output should not leak to stdout"
    );
}

// ===========================================================================
// --trace is superset of --verbose
// ===========================================================================

#[test]
fn trace_produces_more_output_than_verbose() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let verbose_output = casr_cmd(&tmp)
        .args(["--verbose", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("casr --verbose");

    let trace_output = casr_cmd(&tmp)
        .args(["--trace", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("casr --trace");

    assert!(verbose_output.status.success());
    assert!(trace_output.status.success());

    let verbose_lines = String::from_utf8_lossy(&verbose_output.stderr)
        .lines()
        .count();
    let trace_lines = String::from_utf8_lossy(&trace_output.stderr)
        .lines()
        .count();

    assert!(
        trace_lines >= verbose_lines,
        "--trace ({trace_lines} lines) should produce >= output than --verbose ({verbose_lines} lines)"
    );
}

// ===========================================================================
// Normal mode (no --verbose/--trace) has minimal stderr
// ===========================================================================

#[test]
fn normal_mode_has_minimal_stderr() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("casr resume (normal)");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Normal mode should NOT have DEBUG/TRACE log lines.
    assert!(
        !stderr.contains("DEBUG") && !stderr.contains("TRACE"),
        "normal mode stderr should not contain debug/trace log lines, got: {}",
        &stderr[..stderr.len().min(200)]
    );
}

#[test]
fn normal_mode_list_has_no_debug_stderr() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["list"])
        .output()
        .expect("casr list (normal)");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !stderr.contains("DEBUG") && !stderr.contains("TRACE"),
        "normal 'list' stderr should have no debug output"
    );
}

// ===========================================================================
// --verbose with list command
// ===========================================================================

#[test]
fn verbose_list_shows_provider_scanning() {
    let tmp = TempDir::new().unwrap();
    let _session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--verbose", "list"])
        .output()
        .expect("casr --verbose list");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Verbose list should show provider scanning activity.
    assert!(
        !stderr.is_empty(),
        "--verbose list should produce stderr output"
    );
}

// ===========================================================================
// --verbose with info command
// ===========================================================================

#[test]
fn verbose_info_shows_session_details_on_stderr() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--verbose", "info", &session_id])
        .output()
        .expect("casr --verbose info");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !stderr.is_empty(),
        "--verbose info should produce stderr output"
    );
}
