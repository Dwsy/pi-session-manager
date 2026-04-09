//! Error path tests for provider read/write failures.
//!
//! Tests permission-denied, read-only targets, unreadable sources,
//! provider home misconfiguration, and read errors across all providers.

mod test_env;

#[cfg(unix)]
mod unix_error_paths {
    use super::test_env;

    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};

    use casr::model::{CanonicalMessage, CanonicalSession, MessageRole};
    use casr::providers::Provider;
    use casr::providers::WriteOptions;
    use casr::providers::claude_code::ClaudeCode;
    use casr::providers::clawdbot::ClawdBot;
    use casr::providers::codex::Codex;
    use casr::providers::factory::Factory;
    use casr::providers::gemini::Gemini;
    use casr::providers::openclaw::OpenClaw;
    use casr::providers::pi_agent::PiAgent;
    use casr::providers::vibe::Vibe;

    static CC_ENV: test_env::EnvLock = test_env::EnvLock;
    static CODEX_ENV: test_env::EnvLock = test_env::EnvLock;
    static GEMINI_ENV: test_env::EnvLock = test_env::EnvLock;
    static CLAWDBOT_ENV: test_env::EnvLock = test_env::EnvLock;
    static VIBE_ENV: test_env::EnvLock = test_env::EnvLock;
    static FACTORY_ENV: test_env::EnvLock = test_env::EnvLock;
    static OPENCLAW_ENV: test_env::EnvLock = test_env::EnvLock;
    static PI_ENV: test_env::EnvLock = test_env::EnvLock;

    struct EnvGuard {
        key: &'static str,
        original: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: &Path) -> Self {
            let original = std::env::var(key).ok();
            // SAFETY: Tests must hold an `_ENV` lock (see `test_env`) while mutating
            // the process environment and while invoking code that reads it.
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

    fn fixtures_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
    }

    /// Restore permissions so temp dir cleanup succeeds.
    struct PermGuard {
        path: PathBuf,
        mode: u32,
    }

    impl Drop for PermGuard {
        fn drop(&mut self) {
            let _ = fs::set_permissions(&self.path, fs::Permissions::from_mode(self.mode));
        }
    }

    /// Build a minimal canonical session for write tests.
    fn make_session(workspace: &str) -> CanonicalSession {
        CanonicalSession {
            session_id: "error-path-test".to_string(),
            provider_slug: "test".to_string(),
            workspace: Some(PathBuf::from(workspace)),
            title: Some("Error path test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "test question".to_string(),
                    timestamp: Some(1_700_000_000_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "test answer".to_string(),
                    timestamp: Some(1_700_000_010_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
            ],
            metadata: serde_json::Value::Null,
            source_path: PathBuf::from("/tmp/source.jsonl"),
            model_name: None,
        }
    }

    // =========================================================================
    // Read nonexistent file — all major providers
    // =========================================================================

    #[test]
    fn read_nonexistent_cc() {
        let err = ClaudeCode.read_session(Path::new("/tmp/nonexistent-casr-test-file.jsonl"));
        assert!(err.is_err(), "CC: reading nonexistent file should fail");
    }

    #[test]
    fn read_nonexistent_codex() {
        let err = Codex.read_session(Path::new("/tmp/nonexistent-casr-test-file.jsonl"));
        assert!(err.is_err(), "Codex: reading nonexistent file should fail");
    }

    #[test]
    fn read_nonexistent_gemini() {
        let err = Gemini.read_session(Path::new("/tmp/nonexistent-casr-test-file.json"));
        assert!(err.is_err(), "Gemini: reading nonexistent file should fail");
    }

    #[test]
    fn read_nonexistent_clawdbot() {
        let err = ClawdBot.read_session(Path::new("/tmp/nonexistent-casr-test-file.jsonl"));
        assert!(
            err.is_err(),
            "ClawdBot: reading nonexistent file should fail"
        );
    }

    #[test]
    fn read_nonexistent_vibe() {
        let err = Vibe.read_session(Path::new("/tmp/nonexistent-casr-test-file.jsonl"));
        assert!(err.is_err(), "Vibe: reading nonexistent file should fail");
    }

    #[test]
    fn read_nonexistent_factory() {
        let err = Factory.read_session(Path::new("/tmp/nonexistent-casr-test-file.jsonl"));
        assert!(
            err.is_err(),
            "Factory: reading nonexistent file should fail"
        );
    }

    #[test]
    fn read_nonexistent_openclaw() {
        let err = OpenClaw.read_session(Path::new("/tmp/nonexistent-casr-test-file.jsonl"));
        assert!(
            err.is_err(),
            "OpenClaw: reading nonexistent file should fail"
        );
    }

    #[test]
    fn read_nonexistent_pi_agent() {
        let err = PiAgent.read_session(Path::new("/tmp/nonexistent-casr-test-file.json"));
        assert!(
            err.is_err(),
            "PiAgent: reading nonexistent file should fail"
        );
    }

    // =========================================================================
    // Read unreadable (permission denied) — CC, Codex, Gemini
    // =========================================================================

    #[test]
    fn read_unreadable_cc_session_file_returns_error() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let src = fixtures_dir().join("claude_code/cc_simple.jsonl");
        let first_line: serde_json::Value = {
            let content = fs::read_to_string(&src).unwrap();
            serde_json::from_str(content.lines().next().unwrap()).unwrap()
        };
        let session_id = first_line["sessionId"].as_str().unwrap();
        let cwd = first_line["cwd"].as_str().unwrap_or("/tmp");
        let project_key = cwd.replace(|c: char| !c.is_alphanumeric(), "-");
        let target_dir = tmp.path().join(format!("projects/{project_key}"));
        fs::create_dir_all(&target_dir).unwrap();
        let target_file = target_dir.join(format!("{session_id}.jsonl"));
        fs::copy(&src, &target_file).unwrap();

        fs::set_permissions(&target_file, fs::Permissions::from_mode(0o000)).unwrap();
        let _guard = PermGuard {
            path: target_file.clone(),
            mode: 0o644,
        };

        let err = ClaudeCode.read_session(&target_file);
        assert!(
            err.is_err(),
            "reading unreadable file should fail; got {:?}",
            err
        );
        let msg = err.unwrap_err().to_string();
        assert!(
            msg.contains("ermission denied") || msg.contains("access") || msg.contains("open"),
            "error should mention permission; got: {msg}"
        );
    }

    #[test]
    fn read_unreadable_codex_session_file() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let src = fixtures_dir().join("codex/codex_modern.jsonl");
        if !src.exists() {
            // Skip if fixture doesn't exist.
            return;
        }
        let target_file = tmp.path().join("sessions/2024/01/01/rollout-1.jsonl");
        fs::create_dir_all(target_file.parent().unwrap()).unwrap();
        fs::copy(&src, &target_file).unwrap();

        fs::set_permissions(&target_file, fs::Permissions::from_mode(0o000)).unwrap();
        let _guard = PermGuard {
            path: target_file.clone(),
            mode: 0o644,
        };

        let err = Codex.read_session(&target_file);
        assert!(
            err.is_err(),
            "Codex: reading unreadable file should fail; got {:?}",
            err
        );
    }

    #[test]
    fn read_unreadable_gemini_session_file() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        // Create a minimal valid Gemini JSON file, then make it unreadable.
        let chat_dir = tmp.path().join("tmp/abc123/chats");
        fs::create_dir_all(&chat_dir).unwrap();
        let session_file = chat_dir.join("session-test.json");
        fs::write(
            &session_file,
            r#"{"sessionId":"test","messages":[{"type":"user","content":"hi"}]}"#,
        )
        .unwrap();

        fs::set_permissions(&session_file, fs::Permissions::from_mode(0o000)).unwrap();
        let _guard = PermGuard {
            path: session_file.clone(),
            mode: 0o644,
        };

        let err = Gemini.read_session(&session_file);
        assert!(
            err.is_err(),
            "Gemini: reading unreadable file should fail; got {:?}",
            err
        );
    }

    // =========================================================================
    // Read empty files — should error or produce empty session, not panic
    // =========================================================================

    #[test]
    fn read_empty_file_cc() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(tmp.path(), "").unwrap();
        let result = ClaudeCode.read_session(tmp.path());
        match &result {
            Err(_) => {} // Fine — empty file is an error.
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "CC: empty file should produce 0 messages, got {}",
                    session.messages.len()
                );
            }
        }
    }

    #[test]
    fn read_empty_file_codex() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(tmp.path(), "").unwrap();
        let result = Codex.read_session(tmp.path());
        match &result {
            Err(_) => {}
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "Codex: empty file should produce 0 messages, got {}",
                    session.messages.len()
                );
            }
        }
    }

    #[test]
    fn read_empty_file_gemini() {
        let tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        fs::write(tmp.path(), "").unwrap();
        let result = Gemini.read_session(tmp.path());
        // Empty JSON is definitely an error.
        assert!(result.is_err(), "Gemini: reading empty JSON should fail");
    }

    // =========================================================================
    // Read files with garbage/random bytes — should error, not panic
    // =========================================================================

    #[test]
    fn read_garbage_bytes_cc() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(tmp.path(), b"\x00\x01\x02\xff\xfe\xfd\x80garbage").unwrap();
        let result = ClaudeCode.read_session(tmp.path());
        match &result {
            Err(_) => {}
            Ok(session) => {
                // If it tolerates garbage, at most 0 messages.
                assert!(
                    session.messages.is_empty(),
                    "CC: garbage should not produce messages, got {}",
                    session.messages.len()
                );
            }
        }
    }

    #[test]
    fn read_garbage_bytes_codex() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(tmp.path(), b"\x00\x01\x02\xff\xfe\xfd\x80garbage").unwrap();
        let result = Codex.read_session(tmp.path());
        match &result {
            Err(_) => {}
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "Codex: garbage should not produce messages, got {}",
                    session.messages.len()
                );
            }
        }
    }

    #[test]
    fn read_garbage_bytes_gemini() {
        let tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        fs::write(tmp.path(), b"\x00\x01\x02\xff\xfe\xfd\x80garbage").unwrap();
        let result = Gemini.read_session(tmp.path());
        assert!(result.is_err(), "Gemini: reading garbage bytes should fail");
    }

    // =========================================================================
    // Write to read-only directories — all providers
    // =========================================================================

    #[test]
    fn write_to_readonly_dir_codex() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let sessions_dir = tmp.path().join("sessions");
        fs::create_dir_all(&sessions_dir).unwrap();
        fs::set_permissions(&sessions_dir, fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: sessions_dir,
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = Codex.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "Codex: writing to read-only dir should fail; got {:?}",
            err
        );
    }

    #[test]
    fn write_to_readonly_dir_clawdbot() {
        let _lock = CLAWDBOT_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAWDBOT_HOME", tmp.path());

        // ClawdBot writes directly under HOME — make the home dir read-only.
        fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: tmp.path().to_path_buf(),
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = ClawdBot.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "ClawdBot: writing to read-only dir should fail; got {:?}",
            err
        );
    }

    #[test]
    fn write_to_readonly_dir_vibe() {
        let _lock = VIBE_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("VIBE_HOME", tmp.path());

        // Vibe writes to <HOME>/<session-id>/messages.jsonl — make home read-only.
        fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: tmp.path().to_path_buf(),
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = Vibe.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "Vibe: writing to read-only dir should fail; got {:?}",
            err
        );
    }

    #[test]
    fn write_to_readonly_dir_factory() {
        let _lock = FACTORY_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("FACTORY_HOME", tmp.path());

        // Factory writes to <HOME>/<workspace-hash>/ — make home read-only.
        fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: tmp.path().to_path_buf(),
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = Factory.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "Factory: writing to read-only dir should fail; got {:?}",
            err
        );
    }

    #[test]
    fn write_to_readonly_dir_openclaw() {
        let _lock = OPENCLAW_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

        // OpenClaw writes directly under HOME — make home read-only.
        fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: tmp.path().to_path_buf(),
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = OpenClaw.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "OpenClaw: writing to read-only dir should fail; got {:?}",
            err
        );
    }

    #[test]
    fn write_to_readonly_dir_pi_agent() {
        let _lock = PI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

        let sessions_dir = tmp.path().join("sessions");
        fs::create_dir_all(&sessions_dir).unwrap();
        fs::set_permissions(&sessions_dir, fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: sessions_dir,
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = PiAgent.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "PiAgent: writing to read-only dir should fail; got {:?}",
            err
        );
    }

    // =========================================================================
    // Provider home pointing to a regular file (not directory)
    // =========================================================================

    #[test]
    fn cc_home_is_file_not_directory() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        // Detection should report not installed (roots not usable).
        let detection = ClaudeCode.detect();
        // Reads should fail.
        let session_roots = ClaudeCode.session_roots();
        // Roots may be empty or non-existent — either way owns_session should return None.
        let owns = ClaudeCode.owns_session("some-session-id");
        assert!(
            owns.is_none(),
            "CC: home-is-file should not own any session; roots: {:?}, detection: {:?}",
            session_roots,
            detection
        );
    }

    #[test]
    fn codex_home_is_file_not_directory() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let owns = Codex.owns_session("some-session-id");
        assert!(
            owns.is_none(),
            "Codex: home-is-file should not own any session"
        );
    }

    #[test]
    fn gemini_home_is_file_not_directory() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let owns = Gemini.owns_session("some-session-id");
        assert!(
            owns.is_none(),
            "Gemini: home-is-file should not own any session"
        );
    }

    // =========================================================================
    // Provider home pointing to empty (but valid) directory
    // =========================================================================

    #[test]
    fn cc_empty_home_owns_nothing() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let owns = ClaudeCode.owns_session("any-session-id");
        assert!(owns.is_none(), "CC: empty home should not own any session");
    }

    #[test]
    fn codex_empty_home_owns_nothing() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let owns = Codex.owns_session("any-session-id");
        assert!(
            owns.is_none(),
            "Codex: empty home should not own any session"
        );
    }

    #[test]
    fn gemini_empty_home_owns_nothing() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let owns = Gemini.owns_session("any-session-id");
        assert!(
            owns.is_none(),
            "Gemini: empty home should not own any session"
        );
    }

    // =========================================================================
    // Write with session that has no workspace (edge case)
    // =========================================================================

    #[test]
    fn cc_write_session_without_workspace() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let mut session = make_session("/tmp");
        session.workspace = None;

        // CC writer should handle None workspace gracefully.
        let result = ClaudeCode.write_session(&session, &WriteOptions { force: false });
        // Either succeeds with a fallback workspace or errors — but should not panic.
        match result {
            Ok(written) => {
                assert!(
                    !written.paths.is_empty(),
                    "should produce at least one file"
                );
            }
            Err(e) => {
                // Acceptable if the provider requires a workspace.
                eprintln!("CC write without workspace returned error (acceptable): {e}");
            }
        }
    }

    #[test]
    fn codex_write_session_without_workspace() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let mut session = make_session("/tmp");
        session.workspace = None;

        let result = Codex.write_session(&session, &WriteOptions { force: false });
        match result {
            Ok(written) => {
                assert!(!written.paths.is_empty());
            }
            Err(e) => {
                eprintln!("Codex write without workspace returned error (acceptable): {e}");
            }
        }
    }

    // =========================================================================
    // Write with empty messages (edge case)
    // =========================================================================

    #[test]
    fn cc_write_empty_session_does_not_panic() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let mut session = make_session("/tmp");
        session.messages.clear();

        // Should either produce a file or error — never panic.
        let _ = ClaudeCode.write_session(&session, &WriteOptions { force: false });
    }

    #[test]
    fn codex_write_empty_session_does_not_panic() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let mut session = make_session("/tmp");
        session.messages.clear();

        let _ = Codex.write_session(&session, &WriteOptions { force: false });
    }

    #[test]
    fn gemini_write_empty_session_does_not_panic() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let mut session = make_session("/tmp");
        session.messages.clear();

        let _ = Gemini.write_session(&session, &WriteOptions { force: false });
    }

    // =========================================================================
    // Read truncated JSONL files (partial last line)
    // =========================================================================

    #[test]
    fn read_truncated_jsonl_cc() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        // Valid first line, truncated second line.
        fs::write(
            tmp.path(),
            r#"{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2024-01-01T00:00:00Z","sessionId":"trunc-test","cwd":"/tmp"}
{"type":"assistant","message":{"role":"assi"#,
        )
        .unwrap();

        let result = ClaudeCode.read_session(tmp.path());
        // Should tolerate truncation — either skip the bad line or error gracefully.
        match result {
            Err(_) => {} // Acceptable.
            Ok(session) => {
                // Should have at least the first valid message.
                assert!(
                    !session.messages.is_empty(),
                    "CC: truncated JSONL should recover at least one message"
                );
            }
        }
    }

    #[test]
    fn read_truncated_jsonl_codex() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(
            tmp.path(),
            r#"{"type":"session_meta","session_id":"trunc-test","started_at":1700000000}
{"type":"response_item","item":{"type":"message","role":"user","content":[{"type":"input_text","tex"#,
        )
        .unwrap();

        let result = Codex.read_session(tmp.path());
        // Should either error or recover some data — never panic.
        match result {
            Err(_) => {} // Acceptable.
            Ok(_session) => {
                // The session_id may come from the file name or session_meta.
                // Just verify it parsed without panic.
            }
        }
    }

    // =========================================================================
    // Read files with only whitespace/newlines
    // =========================================================================

    #[test]
    fn read_whitespace_only_cc() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(tmp.path(), "\n\n\n   \n\n").unwrap();
        let result = ClaudeCode.read_session(tmp.path());
        match result {
            Err(_) => {}
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "CC: whitespace-only file should produce 0 messages"
                );
            }
        }
    }

    #[test]
    fn read_whitespace_only_codex() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(tmp.path(), "\n\n\n   \n\n").unwrap();
        let result = Codex.read_session(tmp.path());
        match result {
            Err(_) => {}
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "Codex: whitespace-only file should produce 0 messages"
                );
            }
        }
    }

    // =========================================================================
    // Read files with valid JSON but wrong structure
    // =========================================================================

    #[test]
    fn read_wrong_structure_gemini() {
        let tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        fs::write(tmp.path(), r#"{"name":"not a session","value":42}"#).unwrap();
        let result = Gemini.read_session(tmp.path());
        match result {
            Err(_) => {} // Expected — wrong structure.
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "Gemini: wrong-structure JSON should produce 0 messages"
                );
            }
        }
    }

    #[test]
    fn read_json_array_instead_of_object_gemini() {
        let tmp = tempfile::NamedTempFile::with_suffix(".json").unwrap();
        fs::write(tmp.path(), r#"[1, 2, 3]"#).unwrap();
        let result = Gemini.read_session(tmp.path());
        // Gemini may tolerate non-object JSON gracefully.
        match result {
            Err(_) => {} // Expected.
            Ok(session) => {
                assert!(
                    session.messages.is_empty(),
                    "Gemini: JSON array should produce 0 messages, got {}",
                    session.messages.len()
                );
            }
        }
    }

    // =========================================================================
    // Read JSONL with mixed valid/invalid lines
    // =========================================================================

    #[test]
    fn read_mixed_valid_invalid_lines_cc() {
        let tmp = tempfile::NamedTempFile::with_suffix(".jsonl").unwrap();
        fs::write(
            tmp.path(),
            r#"{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2024-01-01T00:00:00Z","sessionId":"mixed-test","cwd":"/tmp"}
NOT VALID JSON AT ALL
{"type":"assistant","message":{"role":"assistant","content":"world"},"timestamp":"2024-01-01T00:00:01Z","sessionId":"mixed-test"}
ALSO NOT VALID
"#,
        )
        .unwrap();

        let result = ClaudeCode.read_session(tmp.path());
        match result {
            Err(_) => {} // Acceptable if it can't handle mixed.
            Ok(session) => {
                // Should have recovered at least the valid lines.
                assert!(
                    !session.messages.is_empty(),
                    "CC: mixed lines should recover some messages"
                );
            }
        }
    }
}
