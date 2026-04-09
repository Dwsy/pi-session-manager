//! JSON contract tests for all `--json` CLI outputs.
//!
//! Validates that every `--json` subcommand emits structurally stable JSON
//! conforming to documented field names, types, and constraints.  These tests
//! act as a backward-compatibility guard: if a field is removed or its type
//! changes, the corresponding test breaks.
//!
//! Bead: bd-24z.11

use std::fs;
use std::path::PathBuf;

use assert_cmd::Command;
use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Helpers (fixture setup, command builder)
// ---------------------------------------------------------------------------

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

    let target_path = projects_dir.join(format!("{session_id}.jsonl"));
    fs::write(&target_path, &content).expect("write CC fixture");

    session_id
}

fn setup_codex_fixture(tmp: &TempDir, fixture_name: &str, ext: &str) -> String {
    let source = fixtures_dir().join(format!("codex/{fixture_name}.{ext}"));
    let content = fs::read_to_string(&source)
        .unwrap_or_else(|e| panic!("Failed to read fixture {fixture_name}: {e}"));

    let session_id = if ext == "jsonl" {
        content
            .lines()
            .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
            .find(|v| v["type"] == "session_meta")
            .and_then(|v| v["payload"]["id"].as_str().map(String::from))
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        let root: serde_json::Value = serde_json::from_str(&content).unwrap();
        root["session"]["id"]
            .as_str()
            .unwrap_or("unknown")
            .to_string()
    };

    let sessions_dir = tmp.path().join("codex/sessions/2026/01/01");
    fs::create_dir_all(&sessions_dir).expect("create Codex sessions dir");

    let filename = format!("rollout-2026-01-01T00-00-00-{session_id}.{ext}");
    let target_path = sessions_dir.join(&filename);
    fs::write(&target_path, &content).expect("write Codex fixture");

    session_id
}

fn setup_gemini_fixture(tmp: &TempDir, fixture_name: &str) -> String {
    setup_gemini_fixture_custom(tmp, fixture_name, None)
}

fn setup_gemini_fixture_custom(
    tmp: &TempDir,
    fixture_name: &str,
    workspace_hint: Option<&str>,
) -> String {
    let source = fixtures_dir().join(format!("gemini/{fixture_name}.json"));
    let content = fs::read_to_string(&source)
        .unwrap_or_else(|e| panic!("Failed to read fixture {fixture_name}: {e}"));

    let mut root: serde_json::Value = serde_json::from_str(&content).unwrap();
    let session_id = root["sessionId"].as_str().unwrap_or("unknown").to_string();

    if let Some(workspace) = workspace_hint
        && let Some(messages) = root.get_mut("messages").and_then(|m| m.as_array_mut())
        && let Some(first) = messages.first_mut()
    {
        first["content"] = serde_json::Value::String(format!("Workspace: {workspace}"));
    }

    let hash_dir = tmp.path().join("gemini/tmp/testhash123/chats");
    fs::create_dir_all(&hash_dir).expect("create Gemini chats dir");

    let filename = format!("session-{session_id}.json");
    let target_path = hash_dir.join(&filename);
    fs::write(&target_path, serde_json::to_string_pretty(&root).unwrap())
        .expect("write Gemini fixture");

    session_id
}

// ---------------------------------------------------------------------------
// Type-assertion helpers
// ---------------------------------------------------------------------------

/// Assert a JSON value is a non-empty string.
fn assert_string(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_string(),
        "{ctx}: field '{field}' should be a string, got: {val}"
    );
}

/// Assert a JSON value is a string or null.
fn assert_string_or_null(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_string() || val.is_null(),
        "{ctx}: field '{field}' should be string|null, got: {val}"
    );
}

/// Assert a JSON value is a boolean.
fn assert_bool(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_boolean(),
        "{ctx}: field '{field}' should be a boolean, got: {val}"
    );
}

/// Assert a JSON value is a number (integer or float).
fn assert_number_or_null(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_number() || val.is_null(),
        "{ctx}: field '{field}' should be number|null, got: {val}"
    );
}

/// Assert a JSON value is an array.
fn assert_array(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_array(),
        "{ctx}: field '{field}' should be an array, got: {val}"
    );
}

/// Assert a JSON value is an array or null.
fn assert_array_or_null(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_array() || val.is_null(),
        "{ctx}: field '{field}' should be array|null, got: {val}"
    );
}

/// Assert a JSON value is a number (u64).
fn assert_uint(val: &serde_json::Value, field: &str, ctx: &str) {
    assert!(
        val.is_u64(),
        "{ctx}: field '{field}' should be a non-negative integer, got: {val}"
    );
}

/// Assert a JSON object contains exactly the expected keys (no extra, no missing).
fn assert_exact_keys(obj: &serde_json::Value, expected: &[&str], ctx: &str) {
    let map = obj
        .as_object()
        .unwrap_or_else(|| panic!("{ctx}: expected object"));
    let actual: std::collections::BTreeSet<&str> = map.keys().map(|k| k.as_str()).collect();
    let expect: std::collections::BTreeSet<&str> = expected.iter().copied().collect();

    let extra: Vec<&&str> = actual.difference(&expect).collect();
    let missing: Vec<&&str> = expect.difference(&actual).collect();

    assert!(
        extra.is_empty() && missing.is_empty(),
        "{ctx}: key mismatch.\n  Extra: {extra:?}\n  Missing: {missing:?}\n  Actual keys: {actual:?}"
    );
}

// ---------------------------------------------------------------------------
// Contract: `providers --json`
// ---------------------------------------------------------------------------
// Expected shape: Array of {name, slug, alias, installed, version, evidence}

fn assert_provider_object(obj: &serde_json::Value, idx: usize) {
    let ctx = format!("providers[{idx}]");
    assert_exact_keys(
        obj,
        &["name", "slug", "alias", "installed", "version", "evidence"],
        &ctx,
    );
    assert_string(&obj["name"], "name", &ctx);
    assert_string(&obj["slug"], "slug", &ctx);
    assert_string(&obj["alias"], "alias", &ctx);
    assert_bool(&obj["installed"], "installed", &ctx);
    assert_string_or_null(&obj["version"], "version", &ctx);
    assert_array(&obj["evidence"], "evidence", &ctx);

    // Evidence items are all strings.
    for (i, ev) in obj["evidence"].as_array().unwrap().iter().enumerate() {
        assert!(ev.is_string(), "{ctx}: evidence[{i}] should be a string");
    }
}

#[test]
fn contract_providers_json_shape() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "providers"])
        .output()
        .expect("providers should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from providers: {e}\nOutput: {stdout}"));

    let arr = parsed
        .as_array()
        .expect("providers --json should be an array");
    assert_eq!(
        arr.len(),
        14,
        "should list 14 providers (CC, Codex, Gemini, Cursor, Cline, Aider, Amp, OpenCode, ChatGPT, ClawdBot, Vibe, Factory, OpenClaw, Pi-Agent)"
    );

    for (i, item) in arr.iter().enumerate() {
        assert_provider_object(item, i);
    }
}

#[test]
fn contract_providers_known_slugs() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "providers"])
        .output()
        .unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();
    let slugs: Vec<&str> = parsed
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["slug"].as_str().unwrap())
        .collect();

    assert!(slugs.contains(&"claude-code"), "should contain claude-code");
    assert!(slugs.contains(&"codex"), "should contain codex");
    assert!(slugs.contains(&"gemini"), "should contain gemini");
    assert!(slugs.contains(&"cursor"), "should contain cursor");
    assert!(slugs.contains(&"cline"), "should contain cline");
    assert!(slugs.contains(&"aider"), "should contain aider");
    assert!(slugs.contains(&"amp"), "should contain amp");
    assert!(slugs.contains(&"opencode"), "should contain opencode");
    assert!(slugs.contains(&"clawdbot"), "should contain clawdbot");
    assert!(slugs.contains(&"vibe"), "should contain vibe");
    assert!(slugs.contains(&"factory"), "should contain factory");
    assert!(slugs.contains(&"openclaw"), "should contain openclaw");
    assert!(slugs.contains(&"pi-agent"), "should contain pi-agent");
}

#[test]
fn contract_providers_aliases_match_slugs() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "providers"])
        .output()
        .unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();
    let alias_map: Vec<(&str, &str)> = parsed
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p["slug"].as_str().unwrap(), p["alias"].as_str().unwrap()))
        .collect();

    // Verify known alias→slug pairings.
    for (slug, alias) in &alias_map {
        match *slug {
            "claude-code" => assert_eq!(*alias, "cc"),
            "codex" => assert_eq!(*alias, "cod"),
            "gemini" => assert_eq!(*alias, "gmi"),
            "cursor" => assert_eq!(*alias, "cur"),
            "cline" => assert_eq!(*alias, "cln"),
            "aider" => assert_eq!(*alias, "aid"),
            "amp" => assert_eq!(*alias, "amp"),
            "opencode" => assert_eq!(*alias, "opc"),
            "chatgpt" => assert_eq!(*alias, "gpt"),
            "clawdbot" => assert_eq!(*alias, "cwb"),
            "vibe" => assert_eq!(*alias, "vib"),
            "factory" => assert_eq!(*alias, "fac"),
            "openclaw" => assert_eq!(*alias, "ocl"),
            "pi-agent" => assert_eq!(*alias, "pi"),
            other => panic!("Unexpected slug: {other}"),
        }
    }
}

// ---------------------------------------------------------------------------
// Contract: `list --json`
// ---------------------------------------------------------------------------
// Expected shape: { schema_version: 2, items: [{ schema_version, session_id, provider, ... }] }

fn assert_list_envelope(parsed: &serde_json::Value) -> &Vec<serde_json::Value> {
    let ctx = "list_envelope";
    assert_exact_keys(parsed, &["schema_version", "items"], ctx);
    assert_uint(&parsed["schema_version"], "schema_version", ctx);
    assert_eq!(
        parsed["schema_version"].as_u64().unwrap(),
        2,
        "{ctx}: schema_version should be 2"
    );
    assert_array(&parsed["items"], "items", ctx);
    parsed["items"].as_array().unwrap()
}

fn assert_list_item(obj: &serde_json::Value, idx: usize) {
    let ctx = format!("list[{idx}]");
    assert_exact_keys(
        obj,
        &[
            "schema_version",
            "session_id",
            "provider",
            "title",
            "messages",
            "workspace",
            "started_at",
            "path",
            "avg_agent_response_chars",
            "avg_agent_response_chars_rounded",
            "file_size_bytes",
            "file_size_kb",
            "last_active_at",
            "tool_uses",
            "unique_user_messages",
            "workspace_name",
            "workspace_name_source",
        ],
        &ctx,
    );
    assert_uint(&obj["schema_version"], "schema_version", &ctx);
    assert_eq!(
        obj["schema_version"].as_u64().unwrap(),
        2,
        "{ctx}: per-item schema_version should be 2"
    );
    assert_string(&obj["session_id"], "session_id", &ctx);
    assert_string(&obj["provider"], "provider", &ctx);
    assert_string_or_null(&obj["title"], "title", &ctx);
    assert_uint(&obj["messages"], "messages", &ctx);
    assert_string_or_null(&obj["workspace"], "workspace", &ctx);
    assert_number_or_null(&obj["started_at"], "started_at", &ctx);
    assert_string(&obj["path"], "path", &ctx);
    assert_string_or_null(&obj["workspace_name"], "workspace_name", &ctx);
    assert_string_or_null(&obj["workspace_name_source"], "workspace_name_source", &ctx);
}

#[test]
fn contract_list_json_empty() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "list"])
        .output()
        .expect("list should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from list: {e}\nOutput: {stdout}"));

    let items = assert_list_envelope(&parsed);
    assert!(items.is_empty(), "empty env should yield empty items");
}

#[test]
fn contract_list_json_shape_cc() {
    let tmp = TempDir::new().unwrap();
    setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "list", "--workspace", "/data/projects/myapp"])
        .output()
        .expect("list should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from list: {e}\nOutput: {stdout}"));

    let items = assert_list_envelope(&parsed);
    assert!(!items.is_empty(), "should find at least one session");

    for (i, item) in items.iter().enumerate() {
        assert_list_item(item, i);
    }

    // First item should be from claude-code.
    assert_eq!(items[0]["provider"].as_str().unwrap(), "claude-code");
}

#[test]
fn contract_list_json_shape_codex() {
    let tmp = TempDir::new().unwrap();
    setup_codex_fixture(&tmp, "codex_modern", "jsonl");

    let output = casr_cmd(&tmp)
        .args(["--json", "list", "--workspace", "/data/projects/backend"])
        .output()
        .expect("list should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from list: {e}\nOutput: {stdout}"));

    let items = assert_list_envelope(&parsed);
    assert!(!items.is_empty(), "should find codex session");

    for (i, item) in items.iter().enumerate() {
        assert_list_item(item, i);
    }
    assert_eq!(items[0]["provider"].as_str().unwrap(), "codex");
}

#[test]
fn contract_list_json_shape_gemini() {
    let tmp = TempDir::new().unwrap();
    setup_gemini_fixture_custom(
        &tmp,
        "gmi_simple",
        Some("/data/projects/cross_agent_session_resumer"),
    );

    let output = casr_cmd(&tmp)
        .args([
            "--json",
            "list",
            "--workspace",
            "/data/projects/cross_agent_session_resumer",
        ])
        .output()
        .expect("list should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from list: {e}\nOutput: {stdout}"));

    let items = assert_list_envelope(&parsed);
    assert!(!items.is_empty(), "should find gemini session");

    for (i, item) in items.iter().enumerate() {
        assert_list_item(item, i);
    }
    assert_eq!(items[0]["provider"].as_str().unwrap(), "gemini");
}

#[test]
fn contract_list_json_messages_is_nonnegative() {
    let tmp = TempDir::new().unwrap();
    setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "list", "--workspace", "/data/projects/myapp"])
        .output()
        .unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();

    let items = assert_list_envelope(&parsed);
    for item in items {
        let msgs = item["messages"].as_u64().unwrap();
        assert!(msgs > 0, "cc_simple fixture should have at least 1 message");
    }
}

// ---------------------------------------------------------------------------
// Contract: `info --json`
// ---------------------------------------------------------------------------
// Expected shape: {schema_version, session_id, provider, title, workspace,
//                  messages, started_at, ended_at, model_name, source_path,
//                  metadata, workspace_name, workspace_name_source}

fn assert_info_object(obj: &serde_json::Value) {
    let ctx = "info";
    assert_exact_keys(
        obj,
        &[
            "schema_version",
            "session_id",
            "provider",
            "title",
            "workspace",
            "messages",
            "started_at",
            "ended_at",
            "model_name",
            "source_path",
            "metadata",
            "workspace_name",
            "workspace_name_source",
        ],
        ctx,
    );
    assert_uint(&obj["schema_version"], "schema_version", ctx);
    assert_eq!(
        obj["schema_version"].as_u64().unwrap(),
        2,
        "{ctx}: schema_version should be 2"
    );
    assert_string(&obj["session_id"], "session_id", ctx);
    assert_string(&obj["provider"], "provider", ctx);
    assert_string_or_null(&obj["title"], "title", ctx);
    assert_string_or_null(&obj["workspace"], "workspace", ctx);
    assert_uint(&obj["messages"], "messages", ctx);
    assert_number_or_null(&obj["started_at"], "started_at", ctx);
    assert_number_or_null(&obj["ended_at"], "ended_at", ctx);
    assert_string_or_null(&obj["model_name"], "model_name", ctx);
    assert_string(&obj["source_path"], "source_path", ctx);
    // metadata is object or null.
    assert!(
        obj["metadata"].is_object() || obj["metadata"].is_null(),
        "{ctx}: metadata should be object|null"
    );
    assert_string_or_null(&obj["workspace_name"], "workspace_name", ctx);
    assert_string_or_null(&obj["workspace_name_source"], "workspace_name_source", ctx);
}

#[test]
fn contract_info_json_shape_cc() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "info", &session_id])
        .output()
        .expect("info should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from info: {e}\nOutput: {stdout}"));

    assert_info_object(&parsed);
    assert_eq!(parsed["session_id"].as_str().unwrap(), session_id);
    assert_eq!(parsed["provider"].as_str().unwrap(), "claude-code");
}

#[test]
fn contract_info_json_shape_codex() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_codex_fixture(&tmp, "codex_modern", "jsonl");

    let output = casr_cmd(&tmp)
        .args(["--json", "info", &session_id])
        .output()
        .expect("info should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from info: {e}\nOutput: {stdout}"));

    assert_info_object(&parsed);
    assert_eq!(parsed["provider"].as_str().unwrap(), "codex");
}

#[test]
fn contract_info_json_shape_gemini() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_gemini_fixture(&tmp, "gmi_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "info", &session_id])
        .output()
        .expect("info should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from info: {e}\nOutput: {stdout}"));

    assert_info_object(&parsed);
    assert_eq!(parsed["provider"].as_str().unwrap(), "gemini");
}

#[test]
fn contract_info_json_source_path_is_absolute() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "info", &session_id])
        .output()
        .unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();

    let path = parsed["source_path"].as_str().unwrap();
    assert!(
        path.starts_with('/'),
        "source_path should be absolute, got: {path}"
    );
}

// ---------------------------------------------------------------------------
// Contract: `resume --json` (success)
// ---------------------------------------------------------------------------
// Expected shape: {ok, source_provider, target_provider, source_session_id,
//                  target_session_id, written_paths, resume_command, dry_run, warnings}

fn assert_resume_success_object(obj: &serde_json::Value) {
    let ctx = "resume_success";
    assert_exact_keys(
        obj,
        &[
            "ok",
            "source_provider",
            "target_provider",
            "source_session_id",
            "target_session_id",
            "written_paths",
            "resume_command",
            "dry_run",
            "warnings",
        ],
        ctx,
    );
    assert_bool(&obj["ok"], "ok", ctx);
    assert_eq!(obj["ok"], true, "{ctx}: ok should be true");
    assert_string(&obj["source_provider"], "source_provider", ctx);
    assert_string(&obj["target_provider"], "target_provider", ctx);
    assert_string(&obj["source_session_id"], "source_session_id", ctx);
    assert_string_or_null(&obj["target_session_id"], "target_session_id", ctx);
    assert_array_or_null(&obj["written_paths"], "written_paths", ctx);
    assert_string_or_null(&obj["resume_command"], "resume_command", ctx);
    assert_bool(&obj["dry_run"], "dry_run", ctx);
    assert_array(&obj["warnings"], "warnings", ctx);
}

#[test]
fn contract_resume_json_dry_run_cc_to_codex() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .expect("resume should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from resume: {e}\nOutput: {stdout}"));

    assert_resume_success_object(&parsed);
    assert_eq!(parsed["source_provider"].as_str().unwrap(), "claude-code");
    assert_eq!(parsed["target_provider"].as_str().unwrap(), "codex");
    assert_eq!(parsed["dry_run"], true);
    // Dry run: no target session, no written paths, no resume command.
    assert!(parsed["target_session_id"].is_null());
    assert!(parsed["written_paths"].is_null());
    assert!(parsed["resume_command"].is_null());
}

#[test]
fn contract_resume_json_actual_write_cc_to_codex() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cod", &session_id])
        .output()
        .expect("resume should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from resume: {e}\nOutput: {stdout}"));

    assert_resume_success_object(&parsed);
    assert_eq!(parsed["dry_run"], false);
    assert!(parsed["target_session_id"].is_string());
    let paths = parsed["written_paths"]
        .as_array()
        .expect("written_paths should be array on actual write");
    assert!(!paths.is_empty(), "should have at least one written path");
    for (i, p) in paths.iter().enumerate() {
        assert!(p.is_string(), "written_paths[{i}] should be a string");
    }
    assert!(parsed["resume_command"].is_string());
}

#[test]
fn contract_resume_json_actual_write_cc_to_gemini() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "gmi", &session_id])
        .output()
        .expect("resume should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from resume: {e}\nOutput: {stdout}"));

    assert_resume_success_object(&parsed);
    assert_eq!(parsed["target_provider"].as_str().unwrap(), "gemini");
    assert_eq!(parsed["dry_run"], false);
    assert!(parsed["target_session_id"].is_string());
}

#[test]
fn contract_resume_json_warnings_are_strings() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();

    let warnings = parsed["warnings"].as_array().unwrap();
    for (i, w) in warnings.iter().enumerate() {
        assert!(w.is_string(), "warnings[{i}] should be a string");
    }
}

#[test]
fn contract_resume_json_codex_to_cc() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_codex_fixture(&tmp, "codex_modern", "jsonl");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cc", &session_id])
        .output()
        .expect("resume should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from resume: {e}\nOutput: {stdout}"));

    assert_resume_success_object(&parsed);
    assert_eq!(parsed["source_provider"].as_str().unwrap(), "codex");
    assert_eq!(parsed["target_provider"].as_str().unwrap(), "claude-code");
}

#[test]
fn contract_resume_json_gemini_to_codex() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_gemini_fixture(&tmp, "gmi_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cod", &session_id])
        .output()
        .expect("resume should run");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("Invalid JSON from resume: {e}\nOutput: {stdout}"));

    assert_resume_success_object(&parsed);
    assert_eq!(parsed["source_provider"].as_str().unwrap(), "gemini");
    assert_eq!(parsed["target_provider"].as_str().unwrap(), "codex");
}

// ---------------------------------------------------------------------------
// Contract: error JSON envelope
// ---------------------------------------------------------------------------
// Expected shape: {ok: false, error_type: string, message: string}

fn assert_error_envelope(obj: &serde_json::Value) {
    let ctx = "error_envelope";
    assert_exact_keys(obj, &["ok", "error_type", "message"], ctx);
    assert_bool(&obj["ok"], "ok", ctx);
    assert_eq!(obj["ok"], false, "{ctx}: ok should be false");
    assert_string(&obj["error_type"], "error_type", ctx);
    assert_string(&obj["message"], "message", ctx);
}

fn parse_json_from_maybe_logged_stream(raw: &str, stream_name: &str) -> serde_json::Value {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(raw) {
        return parsed;
    }

    if let Some(idx) = raw.find('{') {
        let candidate = &raw[idx..];
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(candidate) {
            return parsed;
        }
    }

    panic!("Invalid JSON in {stream_name}: {raw}");
}

#[test]
fn contract_error_json_unknown_session() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "info", "nonexistent-session-id-12345"])
        .output()
        .expect("info should run");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_json_from_maybe_logged_stream(&stderr, "stderr");

    assert_error_envelope(&parsed);
    assert_eq!(parsed["error_type"].as_str().unwrap(), "SessionNotFound");
}

#[test]
fn contract_error_json_unknown_provider() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "nonexistent", &session_id])
        .output()
        .expect("resume should run");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_json_from_maybe_logged_stream(&stderr, "stderr");

    assert_error_envelope(&parsed);
    assert_eq!(
        parsed["error_type"].as_str().unwrap(),
        "UnknownProviderAlias"
    );
}

#[test]
fn contract_error_json_unknown_resume_session() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cod", "nonexistent-session-99999"])
        .output()
        .expect("resume should run");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_json_from_maybe_logged_stream(&stderr, "stderr");

    assert_error_envelope(&parsed);
    assert_eq!(parsed["error_type"].as_str().unwrap(), "SessionNotFound");
}

#[test]
fn contract_error_json_message_is_nonempty() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "info", "nonexistent-session-id-12345"])
        .output()
        .unwrap();

    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_json_from_maybe_logged_stream(&stderr, "stderr");

    let msg = parsed["message"].as_str().unwrap();
    assert!(!msg.is_empty(), "error message should not be empty");
    assert!(
        msg.contains("nonexistent-session-id-12345"),
        "error message should reference the session id"
    );
}

#[test]
fn contract_error_json_known_error_types() {
    // Verify all error types map to valid CasrError variant names.
    let known_types = [
        "SessionNotFound",
        "AmbiguousSessionId",
        "UnknownProviderAlias",
        "ProviderUnavailable",
        "SessionReadError",
        "SessionWriteError",
        "SessionConflict",
        "ValidationError",
        "VerifyFailed",
        "InternalError",
    ];

    // Trigger SessionNotFound.
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "info", "no-such-session"])
        .output()
        .unwrap();

    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed: serde_json::Value = serde_json::from_str(&stderr).unwrap();
    let error_type = parsed["error_type"].as_str().unwrap();
    assert!(
        known_types.contains(&error_type),
        "error_type '{error_type}' not in known types: {known_types:?}"
    );
}

// ---------------------------------------------------------------------------
// Cross-cutting: JSON output goes to stdout (success) or stderr (error)
// ---------------------------------------------------------------------------

#[test]
fn contract_success_json_on_stdout_not_stderr() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "providers"])
        .output()
        .unwrap();

    assert!(output.status.success());
    // Success JSON should be on stdout.
    assert!(
        !output.stdout.is_empty(),
        "success JSON should be on stdout"
    );
    // Stderr should be empty or contain only trace/debug logs (not JSON).
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        assert!(
            serde_json::from_str::<serde_json::Value>(&stderr).is_err(),
            "stderr should not contain JSON on success"
        );
    }
}

#[test]
fn contract_error_json_on_stderr_not_stdout() {
    let tmp = TempDir::new().unwrap();
    let output = casr_cmd(&tmp)
        .args(["--json", "info", "no-such-session"])
        .output()
        .unwrap();

    assert!(!output.status.success());
    // Error JSON should be on stderr.
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        serde_json::from_str::<serde_json::Value>(&stderr).is_ok(),
        "error JSON should be on stderr"
    );
    // Stdout should be empty on error.
    assert!(
        output.stdout.is_empty(),
        "stdout should be empty on error, got: {}",
        String::from_utf8_lossy(&output.stdout)
    );
}

// ---------------------------------------------------------------------------
// Field stability: verify key fields are present across provider types
// ---------------------------------------------------------------------------

#[test]
fn contract_list_provider_field_matches_slug() {
    let tmp = TempDir::new().unwrap();
    setup_cc_fixture(&tmp, "cc_simple");
    setup_codex_fixture(&tmp, "codex_modern", "jsonl");
    setup_gemini_fixture(&tmp, "gmi_simple");

    let output = casr_cmd(&tmp).args(["--json", "list"]).output().unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();

    let items = parsed["items"].as_array().expect("should have items array");

    let valid_slugs = [
        "claude-code",
        "codex",
        "gemini",
        "cursor",
        "cline",
        "aider",
        "amp",
        "opencode",
        "chatgpt",
        "clawdbot",
        "vibe",
        "factory",
        "openclaw",
        "pi-agent",
    ];
    for item in items {
        let provider = item["provider"].as_str().unwrap();
        assert!(
            valid_slugs.contains(&provider),
            "list item provider '{provider}' not in known slugs"
        );
    }
}

#[test]
fn contract_resume_source_session_id_matches_input() {
    let tmp = TempDir::new().unwrap();
    let session_id = setup_cc_fixture(&tmp, "cc_simple");

    let output = casr_cmd(&tmp)
        .args(["--json", "resume", "cod", &session_id, "--dry-run"])
        .output()
        .unwrap();

    let parsed: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).unwrap();

    assert_eq!(
        parsed["source_session_id"].as_str().unwrap(),
        session_id,
        "source_session_id should match the input session ID"
    );
}
