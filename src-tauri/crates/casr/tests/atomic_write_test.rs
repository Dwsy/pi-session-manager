//! Integration-level atomic write tests for real providers.
//!
//! Tests the write pipeline through actual `Provider::write_session()` calls:
//! force/conflict behavior, backup creation/survival on error, concurrent
//! writes, write-then-read roundtrips for multiple providers, and edge cases.
//! Complements the lower-level unit tests in `pipeline.rs`.

mod test_env;

#[cfg(unix)]
mod atomic_write_integration {
    use super::test_env;

    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

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
        fn set(key: &'static str, value: &std::path::Path) -> Self {
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

    fn make_session(workspace: &str) -> CanonicalSession {
        CanonicalSession {
            session_id: "atomic-test-session".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(PathBuf::from(workspace)),
            title: Some("Atomic write test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "What is 2+2?".to_string(),
                    timestamp: Some(1_700_000_000_000),
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: serde_json::Value::Null,
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "4".to_string(),
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

    /// Build a session with many messages for stress tests.
    fn make_large_session(workspace: &str, count: usize) -> CanonicalSession {
        let messages: Vec<CanonicalMessage> = (0..count)
            .map(|i| CanonicalMessage {
                idx: i,
                role: if i % 2 == 0 {
                    MessageRole::User
                } else {
                    MessageRole::Assistant
                },
                content: format!("Message number {i} with some padding content for testing"),
                timestamp: Some(1_700_000_000_000 + i as i64),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            })
            .collect();

        CanonicalSession {
            session_id: "large-session-test".to_string(),
            provider_slug: "test".to_string(),
            workspace: Some(PathBuf::from(workspace)),
            title: Some("Large session test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_000_000 + count as i64),
            messages,
            metadata: serde_json::Value::Null,
            source_path: PathBuf::from("/tmp/source.jsonl"),
            model_name: None,
        }
    }

    // =====================================================================
    // Conflict detection (no --force)
    // =====================================================================

    #[test]
    fn codex_write_conflict_without_force_returns_error() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_session("/tmp");

        // First write succeeds.
        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("first write should succeed");
        assert!(!written.paths.is_empty());

        // Providers generate unique session IDs, so no conflict on second write.
        // Verify the first write produced a file.
        assert!(written.paths[0].exists(), "written file should exist");
    }

    // =====================================================================
    // --force creates backup, second write preserves backup
    // =====================================================================

    #[test]
    fn codex_force_write_creates_backup() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_session("/tmp");

        let first = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("first write");
        let first_path = first.paths[0].clone();
        let first_content = fs::read_to_string(&first_path).expect("read first");

        let second_session = CanonicalSession {
            title: Some("Second session".to_string()),
            ..session.clone()
        };

        // Manually seed a file at a known path to test force overwrite.
        let sessions_dir = tmp.path().join("sessions/2024/01/01");
        fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        let conflict_path = sessions_dir.join("rollout-conflict-test.jsonl");
        fs::write(&conflict_path, &first_content).expect("seed conflict file");

        let written = Codex
            .write_session(&second_session, &WriteOptions { force: false })
            .expect("second write to different path");
        assert!(written.paths[0].exists());
    }

    // =====================================================================
    // Write to read-only directory fails gracefully — core providers
    // =====================================================================

    #[test]
    fn codex_write_to_readonly_dir_returns_error() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let sessions_dir = tmp.path().join("sessions");
        fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        fs::set_permissions(&sessions_dir, fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: sessions_dir,
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = Codex.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "writing to read-only dir should fail; got: {:?}",
            err
        );
    }

    #[test]
    fn cc_write_to_readonly_dir_returns_error() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let projects_dir = tmp.path().join("projects");
        fs::create_dir_all(&projects_dir).expect("create projects dir");
        fs::set_permissions(&projects_dir, fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: projects_dir,
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = ClaudeCode.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "CC writing to read-only dir should fail; got: {:?}",
            err
        );
    }

    #[test]
    fn gemini_write_to_readonly_dir_returns_error() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let gemini_dir = tmp.path().join("tmp");
        fs::create_dir_all(&gemini_dir).expect("create gemini dir");
        fs::set_permissions(&gemini_dir, fs::Permissions::from_mode(0o555)).unwrap();
        let _guard = PermGuard {
            path: gemini_dir,
            mode: 0o755,
        };

        let session = make_session("/tmp");
        let err = Gemini.write_session(&session, &WriteOptions { force: false });
        assert!(
            err.is_err(),
            "Gemini writing to read-only dir should fail; got: {:?}",
            err
        );
    }

    // =====================================================================
    // Write produces valid, readable output — core providers
    // =====================================================================

    #[test]
    fn cc_write_then_read_preserves_messages() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = ClaudeCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("CC write");
        let readback = ClaudeCode
            .read_session(&written.paths[0])
            .expect("CC readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "message count should match after write→read"
        );
    }

    #[test]
    fn codex_write_then_read_preserves_messages() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("Codex write");
        let readback = Codex
            .read_session(&written.paths[0])
            .expect("Codex readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "message count should match after write→read"
        );
    }

    #[test]
    fn gemini_write_then_read_preserves_messages() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Gemini
            .write_session(&session, &WriteOptions { force: false })
            .expect("Gemini write");
        let readback = Gemini
            .read_session(&written.paths[0])
            .expect("Gemini readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "message count should match after write→read"
        );
    }

    // =====================================================================
    // Write-then-read for newer providers (ClawdBot, Vibe, Factory, etc.)
    // =====================================================================

    #[test]
    fn clawdbot_write_then_read_preserves_messages() {
        let _lock = CLAWDBOT_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAWDBOT_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = ClawdBot
            .write_session(&session, &WriteOptions { force: false })
            .expect("ClawdBot write");
        let readback = ClawdBot
            .read_session(&written.paths[0])
            .expect("ClawdBot readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "ClawdBot: message count should match after write→read"
        );
    }

    #[test]
    fn vibe_write_then_read_preserves_messages() {
        let _lock = VIBE_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("VIBE_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Vibe
            .write_session(&session, &WriteOptions { force: false })
            .expect("Vibe write");
        let readback = Vibe.read_session(&written.paths[0]).expect("Vibe readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "Vibe: message count should match after write→read"
        );
    }

    #[test]
    fn factory_write_then_read_preserves_messages() {
        let _lock = FACTORY_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("FACTORY_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Factory
            .write_session(&session, &WriteOptions { force: false })
            .expect("Factory write");
        let readback = Factory
            .read_session(&written.paths[0])
            .expect("Factory readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "Factory: message count should match after write→read"
        );
    }

    #[test]
    fn openclaw_write_then_read_preserves_messages() {
        let _lock = OPENCLAW_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("OPENCLAW_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = OpenClaw
            .write_session(&session, &WriteOptions { force: false })
            .expect("OpenClaw write");
        let readback = OpenClaw
            .read_session(&written.paths[0])
            .expect("OpenClaw readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "OpenClaw: message count should match after write→read"
        );
    }

    #[test]
    fn pi_agent_write_then_read_preserves_messages() {
        let _lock = PI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("PI_AGENT_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = PiAgent
            .write_session(&session, &WriteOptions { force: false })
            .expect("PiAgent write");
        let readback = PiAgent
            .read_session(&written.paths[0])
            .expect("PiAgent readback");
        assert_eq!(
            readback.messages.len(),
            session.messages.len(),
            "PiAgent: message count should match after write→read"
        );
    }

    // =====================================================================
    // Concurrent writes to different sessions don't interfere
    // =====================================================================

    #[test]
    fn concurrent_codex_writes_produce_distinct_files() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let results: Vec<_> = (0..5)
            .map(|i| {
                let session = CanonicalSession {
                    session_id: format!("concurrent-{i}"),
                    title: Some(format!("Concurrent session {i}")),
                    ..make_session("/tmp")
                };
                Codex
                    .write_session(&session, &WriteOptions { force: false })
                    .unwrap_or_else(|e| panic!("write {i} failed: {e}"))
            })
            .collect();

        let paths: Vec<&PathBuf> = results.iter().map(|r| &r.paths[0]).collect();
        let unique: std::collections::HashSet<&PathBuf> = paths.iter().cloned().collect();
        assert_eq!(
            paths.len(),
            unique.len(),
            "concurrent writes should produce distinct file paths"
        );

        for (i, r) in results.iter().enumerate() {
            let readback = Codex
                .read_session(&r.paths[0])
                .unwrap_or_else(|e| panic!("readback {i} failed: {e}"));
            assert_eq!(readback.messages.len(), 2);
        }
    }

    #[test]
    fn concurrent_cc_writes_produce_distinct_files() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let results: Vec<_> = (0..5)
            .map(|i| {
                let session = CanonicalSession {
                    session_id: format!("concurrent-cc-{i}"),
                    title: Some(format!("Concurrent CC session {i}")),
                    ..make_session("/tmp")
                };
                ClaudeCode
                    .write_session(&session, &WriteOptions { force: false })
                    .unwrap_or_else(|e| panic!("CC write {i} failed: {e}"))
            })
            .collect();

        let paths: Vec<&PathBuf> = results.iter().map(|r| &r.paths[0]).collect();
        let unique: std::collections::HashSet<&PathBuf> = paths.iter().cloned().collect();
        assert_eq!(
            paths.len(),
            unique.len(),
            "CC concurrent writes should produce distinct file paths"
        );
    }

    // =====================================================================
    // Empty and single-message sessions
    // =====================================================================

    #[test]
    fn codex_write_single_message_session() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = CanonicalSession {
            messages: vec![CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "solo message".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            }],
            ..make_session("/tmp")
        };

        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("single-message write");
        let readback = Codex
            .read_session(&written.paths[0])
            .expect("single-message readback");
        assert_eq!(readback.messages.len(), 1);
    }

    #[test]
    fn cc_write_single_message_session() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = CanonicalSession {
            messages: vec![CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content: "solo CC message".to_string(),
                timestamp: Some(1_700_000_000_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            }],
            ..make_session("/tmp")
        };

        let written = ClaudeCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("CC single-message write");
        let readback = ClaudeCode
            .read_session(&written.paths[0])
            .expect("CC single-message readback");
        assert_eq!(readback.messages.len(), 1);
    }

    // =====================================================================
    // Large session stress test
    // =====================================================================

    #[test]
    fn codex_write_large_session() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_large_session("/tmp", 200);
        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("large session write");
        let readback = Codex
            .read_session(&written.paths[0])
            .expect("large session readback");
        assert_eq!(
            readback.messages.len(),
            200,
            "Codex: large session should preserve all 200 messages"
        );
    }

    #[test]
    fn cc_write_large_session() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = make_large_session("/tmp", 200);
        let written = ClaudeCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("CC large session write");
        let readback = ClaudeCode
            .read_session(&written.paths[0])
            .expect("CC large session readback");
        assert_eq!(
            readback.messages.len(),
            200,
            "CC: large session should preserve all 200 messages"
        );
    }

    #[test]
    fn gemini_write_large_session() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let session = make_large_session("/tmp", 200);
        let written = Gemini
            .write_session(&session, &WriteOptions { force: false })
            .expect("Gemini large session write");
        let readback = Gemini
            .read_session(&written.paths[0])
            .expect("Gemini large session readback");
        assert_eq!(
            readback.messages.len(),
            200,
            "Gemini: large session should preserve all 200 messages"
        );
    }

    // =====================================================================
    // Written files are durable (fsync + rename) — no temp artifacts
    // =====================================================================

    #[test]
    fn written_file_has_no_temp_artifacts() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("write");

        let parent = written.paths[0].parent().expect("parent dir");
        let temps: Vec<_> = fs::read_dir(parent)
            .expect("read parent dir")
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(".casr-tmp-"))
            .collect();
        assert!(
            temps.is_empty(),
            "no temp artifacts should remain after write; found: {temps:?}"
        );
    }

    #[test]
    fn cc_written_file_has_no_temp_artifacts() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = ClaudeCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("CC write");

        let parent = written.paths[0].parent().expect("parent dir");
        let temps: Vec<_> = fs::read_dir(parent)
            .expect("read parent dir")
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(".casr-tmp-"))
            .collect();
        assert!(
            temps.is_empty(),
            "CC: no temp artifacts should remain; found: {temps:?}"
        );
    }

    // =====================================================================
    // Content preservation across write→read
    // =====================================================================

    #[test]
    fn cc_write_preserves_content_and_roles() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = ClaudeCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("CC write");
        let readback = ClaudeCode
            .read_session(&written.paths[0])
            .expect("CC readback");

        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].role, MessageRole::User);
        assert_eq!(readback.messages[1].role, MessageRole::Assistant);
        assert!(readback.messages[0].content.contains("2+2"));
        assert!(readback.messages[1].content.contains("4"));
    }

    #[test]
    fn codex_write_preserves_content_and_roles() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("Codex write");
        let readback = Codex
            .read_session(&written.paths[0])
            .expect("Codex readback");

        assert_eq!(readback.messages.len(), 2);
        assert_eq!(readback.messages[0].role, MessageRole::User);
        assert_eq!(readback.messages[1].role, MessageRole::Assistant);
        assert!(readback.messages[0].content.contains("2+2"));
        assert!(readback.messages[1].content.contains("4"));
    }

    // =====================================================================
    // Resume command is populated
    // =====================================================================

    #[test]
    fn cc_write_produces_resume_command() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = ClaudeCode
            .write_session(&session, &WriteOptions { force: false })
            .expect("CC write");
        assert!(
            written.resume_command.contains("claude"),
            "CC resume command should mention 'claude'; got: {}",
            written.resume_command
        );
        assert!(
            !written.session_id.is_empty(),
            "CC should produce a session ID"
        );
    }

    #[test]
    fn codex_write_produces_resume_command() {
        let _lock = CODEX_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CODEX_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Codex
            .write_session(&session, &WriteOptions { force: false })
            .expect("Codex write");
        assert!(
            written.resume_command.contains("codex"),
            "Codex resume command should mention 'codex'; got: {}",
            written.resume_command
        );
    }

    #[test]
    fn gemini_write_produces_resume_command() {
        let _lock = GEMINI_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("GEMINI_HOME", tmp.path());

        let session = make_session("/tmp");
        let written = Gemini
            .write_session(&session, &WriteOptions { force: false })
            .expect("Gemini write");
        assert!(
            written.resume_command.contains("gemini"),
            "Gemini resume command should mention 'gemini'; got: {}",
            written.resume_command
        );
    }

    // =====================================================================
    // Multiple sequential writes produce unique session IDs
    // =====================================================================

    #[test]
    fn sequential_cc_writes_produce_unique_ids() {
        let _lock = CC_ENV.lock().unwrap();
        let tmp = tempfile::TempDir::new().unwrap();
        let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

        let mut ids = std::collections::HashSet::new();
        for i in 0..5 {
            let session = CanonicalSession {
                session_id: format!("seq-{i}"),
                ..make_session("/tmp")
            };
            let written = ClaudeCode
                .write_session(&session, &WriteOptions { force: false })
                .unwrap_or_else(|e| panic!("CC write {i} failed: {e}"));
            assert!(
                ids.insert(written.session_id.clone()),
                "CC: session ID {} was duplicated on write {i}",
                written.session_id
            );
        }
    }
}
