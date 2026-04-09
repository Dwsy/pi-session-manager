//! Tests for `ConversionPipeline`: mock-based error injection and real-provider
//! integration tests.
//!
//! Mock-based tests (first section) inject controlled failures that real
//! providers can't produce on demand. Real-provider tests (second section)
//! exercise the full pipeline with real CC/Codex/Gemini providers.

mod test_env;

use std::{
    collections::{BTreeMap, HashMap},
    fmt, fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use casr::{
    discovery::{DetectionResult, ProviderRegistry},
    error::CasrError,
    model::{CanonicalMessage, CanonicalSession, MessageRole, ToolResult},
    pipeline::{ConversionPipeline, ConvertOptions, validate_session},
    providers::claude_code::ClaudeCode,
    providers::codex::Codex,
    providers::gemini::Gemini,
    providers::{Provider, WriteOptions, WrittenSession},
};

#[derive(Clone)]
enum ReadOutcome {
    Session(Box<CanonicalSession>),
    Error(String),
}

#[derive(Clone)]
enum WriteOutcome {
    Success(WrittenSession),
    Error(String),
}

#[derive(Clone, Default)]
struct MockState {
    installed: bool,
    owns_by_session_id: HashMap<String, PathBuf>,
    read_by_path: HashMap<PathBuf, ReadOutcome>,
    default_read: Option<ReadOutcome>,
    write_outcome: Option<WriteOutcome>,
    write_calls: usize,
    last_written: Option<CanonicalSession>,
}

#[derive(Clone)]
struct MockProvider {
    name: String,
    slug: String,
    alias: String,
    roots: Vec<PathBuf>,
    state: Arc<Mutex<MockState>>,
}

impl MockProvider {
    fn new(name: &str, slug: &str, alias: &str, roots: Vec<PathBuf>) -> Self {
        let state = MockState {
            installed: true,
            ..MockState::default()
        };
        Self {
            name: name.to_string(),
            slug: slug.to_string(),
            alias: alias.to_string(),
            roots,
            state: Arc::new(Mutex::new(state)),
        }
    }

    fn set_owned_session(&self, session_id: &str, path: impl Into<PathBuf>) {
        self.state
            .lock()
            .expect("mock state lock")
            .owns_by_session_id
            .insert(session_id.to_string(), path.into());
    }

    fn set_installed(&self, installed: bool) {
        self.state.lock().expect("mock state lock").installed = installed;
    }

    fn set_read_session(&self, path: impl Into<PathBuf>, session: CanonicalSession) {
        self.state
            .lock()
            .expect("mock state lock")
            .read_by_path
            .insert(path.into(), ReadOutcome::Session(Box::new(session)));
    }

    fn set_read_error(&self, path: impl Into<PathBuf>, message: &str) {
        self.state
            .lock()
            .expect("mock state lock")
            .read_by_path
            .insert(path.into(), ReadOutcome::Error(message.to_string()));
    }

    fn set_write_success(&self, written: WrittenSession) {
        self.state.lock().expect("mock state lock").write_outcome =
            Some(WriteOutcome::Success(written));
    }

    fn set_write_error(&self, message: &str) {
        self.state.lock().expect("mock state lock").write_outcome =
            Some(WriteOutcome::Error(message.to_string()));
    }

    fn write_calls(&self) -> usize {
        self.state.lock().expect("mock state lock").write_calls
    }

    fn last_written(&self) -> Option<CanonicalSession> {
        self.state
            .lock()
            .expect("mock state lock")
            .last_written
            .clone()
    }
}

impl Provider for MockProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn slug(&self) -> &str {
        &self.slug
    }

    fn cli_alias(&self) -> &str {
        &self.alias
    }

    fn detect(&self) -> DetectionResult {
        let installed = self.state.lock().expect("mock state lock").installed;
        DetectionResult {
            installed,
            version: None,
            evidence: vec![format!("installed={installed}")],
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        self.roots.clone()
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        self.state
            .lock()
            .expect("mock state lock")
            .owns_by_session_id
            .get(session_id)
            .cloned()
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        let state = self.state.lock().expect("mock state lock");
        if let Some(outcome) = state.read_by_path.get(path).cloned() {
            return match outcome {
                ReadOutcome::Session(session) => Ok(*session),
                ReadOutcome::Error(message) => Err(anyhow::anyhow!(message)),
            };
        }
        if let Some(outcome) = state.default_read.clone() {
            return match outcome {
                ReadOutcome::Session(session) => Ok(*session),
                ReadOutcome::Error(message) => Err(anyhow::anyhow!(message)),
            };
        }
        Err(anyhow::anyhow!(
            "mock provider '{}' has no read outcome for path {}",
            self.slug,
            path.display()
        ))
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        _opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let mut state = self.state.lock().expect("mock state lock");
        state.write_calls += 1;
        state.last_written = Some(session.clone());
        match state.write_outcome.clone() {
            Some(WriteOutcome::Success(written)) => Ok(written),
            Some(WriteOutcome::Error(message)) => Err(anyhow::anyhow!(message)),
            None => Ok(WrittenSession {
                paths: vec![PathBuf::from(format!(
                    "/tmp/{}/mock-output.json",
                    self.slug
                ))],
                session_id: format!("{}-target-session", self.alias),
                resume_command: self.resume_command(&format!("{}-target-session", self.alias)),
                backup_path: None,
            }),
        }
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("{} --resume {session_id}", self.alias)
    }
}

fn msg(idx: usize, role: MessageRole, content: &str, ts: Option<i64>) -> CanonicalMessage {
    CanonicalMessage {
        idx,
        role,
        content: content.to_string(),
        timestamp: ts,
        author: None,
        tool_calls: vec![],
        tool_results: vec![],
        extra: serde_json::Value::Null,
    }
}

fn valid_session_with_id(session_id: &str) -> CanonicalSession {
    CanonicalSession {
        session_id: session_id.to_string(),
        provider_slug: "mock-source".to_string(),
        workspace: Some(PathBuf::from("/tmp/mock-workspace")),
        title: Some("Mock session".to_string()),
        started_at: Some(1_700_000_000_000),
        ended_at: Some(1_700_000_020_000),
        messages: vec![
            msg(
                0,
                MessageRole::User,
                "question one",
                Some(1_700_000_000_000),
            ),
            msg(
                1,
                MessageRole::Assistant,
                "answer one",
                Some(1_700_000_005_000),
            ),
            msg(
                2,
                MessageRole::User,
                "question two",
                Some(1_700_000_010_000),
            ),
            msg(
                3,
                MessageRole::Assistant,
                "answer two",
                Some(1_700_000_020_000),
            ),
        ],
        metadata: serde_json::Value::Null,
        source_path: PathBuf::from("/tmp/mock-source.json"),
        model_name: Some("mock-model".to_string()),
    }
}

fn options(dry_run: bool, source_hint: Option<String>) -> ConvertOptions {
    ConvertOptions {
        dry_run,
        force: false,
        verbose: false,
        enrich: false,
        source_hint,
    }
}

#[test]
fn pipeline_convert_happy_path_writes_and_verifies() {
    let src = MockProvider::new(
        "Mock Source",
        "mock-source",
        "src",
        vec![PathBuf::from("/tmp/src-root")],
    );
    let dst = MockProvider::new(
        "Mock Target",
        "mock-target",
        "tgt",
        vec![PathBuf::from("/tmp/tgt-root")],
    );

    let source_path = PathBuf::from("/tmp/src-root/session-a.json");
    let written_path = PathBuf::from("/tmp/tgt-root/session-out.json");
    let session = valid_session_with_id("sid-a");

    src.set_owned_session("sid-a", source_path.clone());
    src.set_read_session(source_path, session.clone());
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "target-sid-a".to_string(),
        resume_command: "tgt --resume target-sid-a".to_string(),
        backup_path: None,
    });
    dst.set_read_session(written_path, session.clone());

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src.clone()), Box::new(dst.clone())]),
    };

    let result = pipeline
        .convert("tgt", "sid-a", options(false, None))
        .expect("happy path convert should succeed");

    assert_eq!(result.source_provider, "mock-source");
    assert_eq!(result.target_provider, "mock-target");
    assert!(result.written.is_some(), "write result should be present");
    assert!(result.warnings.is_empty(), "happy path should not warn");
    assert_eq!(dst.write_calls(), 1, "target write should run once");
    assert_eq!(
        dst.last_written()
            .expect("target should capture written session")
            .session_id,
        "sid-a"
    );
}

#[test]
fn pipeline_dry_run_skips_write() {
    let src = MockProvider::new(
        "Mock Source",
        "mock-source",
        "src",
        vec![PathBuf::from("/tmp/src-root")],
    );
    let dst = MockProvider::new(
        "Mock Target",
        "mock-target",
        "tgt",
        vec![PathBuf::from("/tmp/tgt-root")],
    );
    let source_path = PathBuf::from("/tmp/src-root/session-b.json");
    src.set_owned_session("sid-b", source_path.clone());
    src.set_read_session(source_path, valid_session_with_id("sid-b"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst.clone())]),
    };

    let result = pipeline
        .convert("tgt", "sid-b", options(true, None))
        .expect("dry-run convert should succeed");

    assert!(result.written.is_none(), "dry-run should skip writes");
    assert_eq!(
        dst.write_calls(),
        0,
        "dry-run should not call write_session"
    );
}

#[test]
fn pipeline_same_provider_short_circuit_skips_write() {
    let provider = MockProvider::new(
        "Mock Source",
        "mock-source",
        "src",
        vec![PathBuf::from("/tmp/src-root")],
    );
    let source_path = PathBuf::from("/tmp/src-root/session-same-provider.json");
    provider.set_owned_session("sid-same", source_path.clone());
    provider.set_read_session(source_path, valid_session_with_id("sid-same"));
    provider.set_write_error("write should not be called for same-provider short-circuit");

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(provider.clone())]),
    };

    let result = pipeline
        .convert("src", "sid-same", options(false, None))
        .expect("same-provider conversion should short-circuit");

    assert_eq!(
        provider.write_calls(),
        0,
        "same-provider conversion should not write"
    );
    assert!(
        result
            .warnings
            .iter()
            .any(|w| w.contains("Source and target provider are the same")),
        "expected same-provider warning; got {:?}",
        result.warnings
    );
    let written = result
        .written
        .expect("same-provider should still return resume metadata");
    assert_eq!(written.paths.len(), 0);
    assert_eq!(written.session_id, "sid-same");
}

#[test]
fn pipeline_warns_when_target_cli_missing_but_write_succeeds() {
    let src = MockProvider::new("Source", "src", "src", vec![PathBuf::from("/tmp/src-root")]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![PathBuf::from("/tmp/dst-root")]);
    dst.set_installed(false);

    let source_path = PathBuf::from("/tmp/src-root/session-missing-target-cli.json");
    let written_path = PathBuf::from("/tmp/dst-root/out-target-cli-missing.json");
    src.set_owned_session("sid-target-cli-missing", source_path.clone());
    src.set_read_session(source_path, valid_session_with_id("sid-target-cli-missing"));
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "sid-target-cli-missing-out".to_string(),
        resume_command: "tgt --resume sid-target-cli-missing-out".to_string(),
        backup_path: None,
    });
    dst.set_read_session(
        written_path,
        valid_session_with_id("sid-target-cli-missing"),
    );

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst)]),
    };

    let result = pipeline
        .convert("tgt", "sid-target-cli-missing", options(false, None))
        .expect("write should still succeed when target detect reports not installed");

    assert!(
        result
            .warnings
            .iter()
            .any(|w| w.contains("not detected as installed")),
        "expected missing-target warning; got {:?}",
        result.warnings
    );
}

#[test]
fn pipeline_unknown_target_alias_errors() {
    let src = MockProvider::new(
        "Mock Source",
        "mock-source",
        "src",
        vec![PathBuf::from("/tmp/src-root")],
    );
    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src)]),
    };

    let err = pipeline
        .convert("missing", "sid-z", options(false, None))
        .expect_err("unknown target alias should error");

    assert!(matches!(
        err.downcast_ref::<CasrError>(),
        Some(CasrError::UnknownProviderAlias { .. })
    ));
}

#[test]
fn pipeline_session_not_found_errors() {
    let src = MockProvider::new(
        "Mock Source",
        "mock-source",
        "src",
        vec![PathBuf::from("/tmp/src-root")],
    );
    let dst = MockProvider::new(
        "Mock Target",
        "mock-target",
        "tgt",
        vec![PathBuf::from("/tmp/tgt-root")],
    );
    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst)]),
    };

    let err = pipeline
        .convert("tgt", "missing-session", options(false, None))
        .expect_err("missing session should error");

    assert!(matches!(
        err.downcast_ref::<CasrError>(),
        Some(CasrError::SessionNotFound { .. })
    ));
}

#[test]
fn pipeline_ambiguous_session_errors() {
    let src_a = MockProvider::new("Source A", "src-a", "s1", vec![PathBuf::from("/tmp/src-a")]);
    let src_b = MockProvider::new("Source B", "src-b", "s2", vec![PathBuf::from("/tmp/src-b")]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![PathBuf::from("/tmp/dst")]);

    src_a.set_owned_session("same-id", "/tmp/src-a/a.json");
    src_b.set_owned_session("same-id", "/tmp/src-b/b.json");

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src_a), Box::new(src_b), Box::new(dst)]),
    };

    let err = pipeline
        .convert("tgt", "same-id", options(false, None))
        .expect_err("ambiguous session id should error");

    assert!(matches!(
        err.downcast_ref::<CasrError>(),
        Some(CasrError::AmbiguousSessionId { .. })
    ));
}

#[test]
fn pipeline_source_hint_alias_narrows_resolution() {
    let src_a = MockProvider::new("Source A", "src-a", "s1", vec![PathBuf::from("/tmp/src-a")]);
    let src_b = MockProvider::new("Source B", "src-b", "s2", vec![PathBuf::from("/tmp/src-b")]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![PathBuf::from("/tmp/dst")]);

    let path_a = PathBuf::from("/tmp/src-a/session.json");
    let path_b = PathBuf::from("/tmp/src-b/session.json");
    src_a.set_owned_session("same-id", path_a.clone());
    src_b.set_owned_session("same-id", path_b.clone());
    src_a.set_read_session(path_a, valid_session_with_id("from-a"));
    src_b.set_read_session(path_b, valid_session_with_id("from-b"));

    let written_path = PathBuf::from("/tmp/dst/out.json");
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "target-id".to_string(),
        resume_command: "tgt --resume target-id".to_string(),
        backup_path: None,
    });
    dst.set_read_session(written_path, valid_session_with_id("from-a"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![
            Box::new(src_a),
            Box::new(src_b),
            Box::new(dst.clone()),
        ]),
    };

    let result = pipeline
        .convert("tgt", "same-id", options(false, Some("s1".to_string())))
        .expect("source alias hint should disambiguate");
    assert!(result.written.is_some());
    assert_eq!(
        dst.last_written()
            .expect("target should capture written session")
            .session_id,
        "from-a"
    );
}

#[test]
fn pipeline_source_hint_path_bypasses_discovery() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let src_root = tmp.path().join("src-root");
    let dst_root = tmp.path().join("dst-root");
    std::fs::create_dir_all(&src_root).expect("create src root");
    std::fs::create_dir_all(&dst_root).expect("create dst root");
    let direct_path = src_root.join("direct.json");
    std::fs::write(&direct_path, "{}").expect("create direct source file");

    let src = MockProvider::new("Source", "src", "src", vec![src_root.clone()]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![dst_root.clone()]);
    src.set_read_session(direct_path.clone(), valid_session_with_id("direct-session"));

    let written_path = dst_root.join("out.json");
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "target-direct".to_string(),
        resume_command: "tgt --resume target-direct".to_string(),
        backup_path: None,
    });
    dst.set_read_session(written_path, valid_session_with_id("direct-session"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst.clone())]),
    };

    let result = pipeline
        .convert(
            "tgt",
            "ignored-by-path-hint",
            options(false, Some(direct_path.display().to_string())),
        )
        .expect("path source hint should resolve direct path");

    assert!(result.written.is_some());
    assert_eq!(
        dst.last_written()
            .expect("target should capture written session")
            .session_id,
        "direct-session"
    );
}

#[test]
fn pipeline_write_failure_propagates() {
    let src = MockProvider::new("Source", "src", "src", vec![PathBuf::from("/tmp/src-root")]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![PathBuf::from("/tmp/dst-root")]);
    let source_path = PathBuf::from("/tmp/src-root/session-write-fail.json");
    src.set_owned_session("sid-write-fail", source_path.clone());
    src.set_read_session(source_path, valid_session_with_id("sid-write-fail"));
    dst.set_write_error("write failed in mock target");

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst.clone())]),
    };

    let err = pipeline
        .convert("tgt", "sid-write-fail", options(false, None))
        .expect_err("write failure should propagate");
    assert!(err.to_string().contains("write failed in mock target"));
    assert_eq!(
        dst.write_calls(),
        1,
        "write should have been attempted once"
    );
}

#[test]
fn pipeline_readback_mismatch_fails_and_removes_unverified_output() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let src_root = tmp.path().join("src");
    let dst_root = tmp.path().join("dst");
    fs::create_dir_all(&src_root).expect("create src root");
    fs::create_dir_all(&dst_root).expect("create dst root");

    let src = MockProvider::new("Source", "src", "src", vec![src_root.clone()]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![dst_root.clone()]);

    let source_path = src_root.join("session-readback-mismatch.json");
    let written_path = dst_root.join("out-mismatch.json");
    src.set_owned_session("sid-readback-mismatch", source_path.clone());
    src.set_read_session(source_path, valid_session_with_id("sid-readback-mismatch"));
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "target-mismatch".to_string(),
        resume_command: "tgt --resume target-mismatch".to_string(),
        backup_path: None,
    });

    fs::write(&written_path, "unverified-output").expect("seed unverified output");

    let mut short_session = valid_session_with_id("sid-readback-mismatch");
    short_session.messages.truncate(2);
    dst.set_read_session(written_path.clone(), short_session);

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst)]),
    };
    let err = pipeline
        .convert("tgt", "sid-readback-mismatch", options(false, None))
        .expect_err("readback mismatch should fail conversion");

    match err.downcast_ref::<CasrError>() {
        Some(CasrError::VerifyFailed { detail, .. }) => {
            assert!(
                detail.contains("message count mismatch"),
                "unexpected verify detail: {detail}"
            );
        }
        other => panic!("expected VerifyFailed, got {other:?}"),
    }
    assert!(
        !written_path.exists(),
        "unverified output should be removed on verify failure"
    );
}

#[test]
fn pipeline_readback_content_mismatch_fails_and_removes_unverified_output() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let src_root = tmp.path().join("src");
    let dst_root = tmp.path().join("dst");
    fs::create_dir_all(&src_root).expect("create src root");
    fs::create_dir_all(&dst_root).expect("create dst root");

    let src = MockProvider::new("Source", "src", "src", vec![src_root.clone()]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![dst_root.clone()]);

    let source_path = src_root.join("session-readback-content-mismatch.json");
    let written_path = dst_root.join("out-content-mismatch.json");
    src.set_owned_session("sid-readback-content-mismatch", source_path.clone());
    src.set_read_session(
        source_path,
        valid_session_with_id("sid-readback-content-mismatch"),
    );
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "target-content-mismatch".to_string(),
        resume_command: "tgt --resume target-content-mismatch".to_string(),
        backup_path: None,
    });

    fs::write(&written_path, "unverified-output").expect("seed unverified output");

    let mut readback = valid_session_with_id("sid-readback-content-mismatch");
    readback.messages[1].content = "corrupted".to_string();
    dst.set_read_session(written_path.clone(), readback);

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst)]),
    };
    let err = pipeline
        .convert("tgt", "sid-readback-content-mismatch", options(false, None))
        .expect_err("readback content mismatch should fail conversion");

    match err.downcast_ref::<CasrError>() {
        Some(CasrError::VerifyFailed { detail, .. }) => {
            assert!(
                detail.contains("content mismatch"),
                "unexpected verify detail: {detail}"
            );
        }
        other => panic!("expected VerifyFailed, got {other:?}"),
    }
    assert!(
        !written_path.exists(),
        "unverified output should be removed on verify failure"
    );
}

#[test]
fn pipeline_readback_error_restores_backup_and_returns_verify_failed() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let src_root = tmp.path().join("src");
    let dst_root = tmp.path().join("dst");
    fs::create_dir_all(&src_root).expect("create src root");
    fs::create_dir_all(&dst_root).expect("create dst root");

    let src = MockProvider::new("Source", "src", "src", vec![src_root.clone()]);
    let dst = MockProvider::new("Target", "dst", "tgt", vec![dst_root.clone()]);

    let source_path = src_root.join("session-readback-error.json");
    let written_path = dst_root.join("out-readback-error.json");
    let backup_path = dst_root.join("out-readback-error.json.bak");
    src.set_owned_session("sid-readback-error", source_path.clone());
    src.set_read_session(source_path, valid_session_with_id("sid-readback-error"));
    dst.set_write_success(WrittenSession {
        paths: vec![written_path.clone()],
        session_id: "target-readback-error".to_string(),
        resume_command: "tgt --resume target-readback-error".to_string(),
        backup_path: Some(backup_path.clone()),
    });
    dst.set_read_error(written_path.clone(), "cannot parse written file");

    fs::write(&written_path, "broken-target-content").expect("seed broken target");
    fs::write(&backup_path, "restorable-original-content").expect("seed backup");

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(src), Box::new(dst)]),
    };
    let err = pipeline
        .convert("tgt", "sid-readback-error", options(false, None))
        .expect_err("readback error should fail conversion");

    match err.downcast_ref::<CasrError>() {
        Some(CasrError::VerifyFailed { detail, .. }) => {
            assert!(
                detail.contains("rollback succeeded"),
                "expected rollback detail, got: {detail}"
            );
        }
        other => panic!("expected VerifyFailed, got {other:?}"),
    }

    let restored = fs::read_to_string(&written_path).expect("restored target should exist");
    assert_eq!(restored, "restorable-original-content");
    assert!(
        !backup_path.exists(),
        "backup should be consumed during restore"
    );
}

#[test]
fn validate_session_errors_for_empty_and_single_sided() {
    let mut empty = valid_session_with_id("empty");
    empty.messages.clear();
    assert!(
        validate_session(&empty).has_errors(),
        "empty session should fail validation"
    );

    let mut user_only = valid_session_with_id("user-only");
    user_only
        .messages
        .retain(|m| matches!(m.role, MessageRole::User));
    assert!(
        validate_session(&user_only).has_errors(),
        "user-only session should fail validation"
    );

    let mut assistant_only = valid_session_with_id("assistant-only");
    assistant_only
        .messages
        .retain(|m| matches!(m.role, MessageRole::Assistant));
    assert!(
        validate_session(&assistant_only).has_errors(),
        "assistant-only session should fail validation"
    );
}

#[test]
fn validate_session_warnings_and_info_for_quality_issues() {
    let mut session = valid_session_with_id("quality");
    session.workspace = None;
    for msg in &mut session.messages {
        msg.timestamp = None;
    }
    session.messages = vec![
        msg(0, MessageRole::User, "u1", None),
        msg(1, MessageRole::User, "u2", None),
        msg(2, MessageRole::Assistant, "a1", None),
    ];
    session.messages[2].tool_results = vec![ToolResult {
        call_id: Some("missing-call-id".to_string()),
        content: "result".to_string(),
        is_error: false,
    }];

    let validation = validate_session(&session);

    let warnings = validation.warnings.join("\n");
    assert!(warnings.contains("no workspace"), "warnings: {warnings}");
    assert!(warnings.contains("no timestamps"), "warnings: {warnings}");
    let info_joined = validation.info.join("\n");
    assert!(
        info_joined.contains("unknown tool call id"),
        "info: {info_joined}"
    );
}

#[test]
fn validate_session_reports_tool_call_info_when_present() {
    let mut session = valid_session_with_id("tool-calls");
    session.messages[1].tool_calls.push(casr::model::ToolCall {
        id: Some("call-1".to_string()),
        name: "Read".to_string(),
        arguments: serde_json::json!({"file":"src/lib.rs"}),
    });
    let validation = validate_session(&session);
    assert!(
        validation
            .info
            .iter()
            .any(|line| line.contains("Session contains tool calls")),
        "expected tool-call info line; got {:?}",
        validation.info
    );
}

// ===========================================================================
// Real-provider pipeline tests (no mocks)
//
// These exercise the full ConversionPipeline with real providers operating on
// real fixture files in temp directories. Error-injection tests above still
// use MockProvider because real providers don't fail predictably.
// ===========================================================================

static CC_ENV: test_env::EnvLock = test_env::EnvLock;
static CODEX_ENV: test_env::EnvLock = test_env::EnvLock;
static GEMINI_ENV: test_env::EnvLock = test_env::EnvLock;

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

fn seed_cc_fixture(claude_home: &Path) -> String {
    let src = fixtures_dir().join("claude_code/cc_simple.jsonl");
    let first_line: serde_json::Value = {
        let content = std::fs::read_to_string(&src).expect("read cc_simple fixture");
        serde_json::from_str(content.lines().next().unwrap()).expect("parse first line")
    };
    let session_id = first_line["sessionId"].as_str().unwrap_or("cc-simple-001");
    let cwd = first_line["cwd"].as_str().unwrap_or("/tmp");
    let project_key = cwd.replace(|c: char| !c.is_alphanumeric(), "-");
    let target_dir = claude_home.join(format!("projects/{project_key}"));
    fs::create_dir_all(&target_dir).expect("create CC project dir");
    fs::copy(&src, target_dir.join(format!("{session_id}.jsonl"))).expect("copy CC fixture");
    session_id.to_string()
}

#[test]
fn pipeline_real_cc_to_codex_happy_path() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _codex_lock = CODEX_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));
    let _codex_env = EnvGuard::set("CODEX_HOME", &tmp.path().join("codex"));

    let cc_sid = seed_cc_fixture(&tmp.path().join("claude"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Codex)]),
    };

    let result = pipeline
        .convert(
            "cod",
            &cc_sid,
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect("real CC→Codex pipeline should succeed");

    assert_eq!(result.source_provider, "claude-code");
    assert_eq!(result.target_provider, "codex");
    assert!(result.written.is_some(), "should have written output");
    let written = result.written.unwrap();
    assert!(
        !written.session_id.is_empty(),
        "target session_id should be set"
    );
    assert!(written.paths[0].exists(), "written Codex file should exist");
}

#[test]
fn pipeline_real_cc_to_gemini_happy_path() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _gemini_lock = GEMINI_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));
    let _gemini_env = EnvGuard::set("GEMINI_HOME", &tmp.path().join("gemini"));

    let cc_sid = seed_cc_fixture(&tmp.path().join("claude"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Gemini)]),
    };

    let result = pipeline
        .convert(
            "gmi",
            &cc_sid,
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect("real CC→Gemini pipeline should succeed");

    assert_eq!(result.source_provider, "claude-code");
    assert_eq!(result.target_provider, "gemini");
    assert!(result.written.is_some());
}

#[test]
fn pipeline_real_dry_run_skips_write() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _codex_lock = CODEX_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));
    let _codex_env = EnvGuard::set("CODEX_HOME", &tmp.path().join("codex"));

    let cc_sid = seed_cc_fixture(&tmp.path().join("claude"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Codex)]),
    };

    let result = pipeline
        .convert(
            "cod",
            &cc_sid,
            ConvertOptions {
                dry_run: true,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect("real dry-run should succeed");

    assert!(result.written.is_none(), "dry-run should not write");
    // No Codex session files should exist.
    let codex_sessions = tmp.path().join("codex/sessions");
    assert!(
        !codex_sessions.exists(),
        "dry-run should not create codex session dir"
    );
}

#[test]
fn pipeline_real_same_provider_short_circuit() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));

    let cc_sid = seed_cc_fixture(&tmp.path().join("claude"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode)]),
    };

    let result = pipeline
        .convert(
            "cc",
            &cc_sid,
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect("real same-provider should short-circuit");

    assert!(
        result
            .warnings
            .iter()
            .any(|w| w.contains("Source and target provider are the same")),
        "expected same-provider warning; got {:?}",
        result.warnings
    );
}

#[test]
fn pipeline_real_source_hint_narrows_resolution() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _codex_lock = CODEX_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _gemini_lock = GEMINI_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));
    let _codex_env = EnvGuard::set("CODEX_HOME", &tmp.path().join("codex"));
    let _gemini_env = EnvGuard::set("GEMINI_HOME", &tmp.path().join("gemini"));

    let cc_sid = seed_cc_fixture(&tmp.path().join("claude"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![
            Box::new(ClaudeCode),
            Box::new(Codex),
            Box::new(Gemini),
        ]),
    };

    let result = pipeline
        .convert(
            "gmi",
            &cc_sid,
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: Some("cc".to_string()),
            },
        )
        .expect("source hint 'cc' should resolve to ClaudeCode");

    assert_eq!(result.source_provider, "claude-code");
    assert_eq!(result.target_provider, "gemini");
    assert!(result.written.is_some());
}

#[test]
fn pipeline_real_session_not_found() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _codex_lock = CODEX_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));
    let _codex_env = EnvGuard::set("CODEX_HOME", &tmp.path().join("codex"));

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Codex)]),
    };

    let err = pipeline
        .convert(
            "cod",
            "nonexistent-session-id",
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect_err("real not-found should error");

    assert!(matches!(
        err.downcast_ref::<CasrError>(),
        Some(CasrError::SessionNotFound { .. })
    ));
}

#[test]
fn pipeline_real_unknown_target_alias() {
    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode)]),
    };

    let err = pipeline
        .convert(
            "nonexistent-alias",
            "any-session",
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect_err("unknown alias should error");

    assert!(matches!(
        err.downcast_ref::<CasrError>(),
        Some(CasrError::UnknownProviderAlias { .. })
    ));
}

// ---------------------------------------------------------------------------
// Tracing / observability tests
// ---------------------------------------------------------------------------

use tracing_subscriber::prelude::*;

#[derive(Debug, Clone)]
struct CapturedEvent {
    level: tracing::Level,
    fields: BTreeMap<String, String>,
}

#[derive(Clone, Default)]
struct LogCollector {
    events: Arc<Mutex<Vec<CapturedEvent>>>,
}

impl LogCollector {
    fn snapshot(&self) -> Vec<CapturedEvent> {
        self.events.lock().expect("log collector lock").clone()
    }
}

impl<S> tracing_subscriber::Layer<S> for LogCollector
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let meta = event.metadata();
        let mut fields = BTreeMap::new();
        event.record(&mut FieldVisitor {
            fields: &mut fields,
        });
        self.events
            .lock()
            .expect("log collector lock")
            .push(CapturedEvent {
                level: *meta.level(),
                fields,
            });
    }
}

struct FieldVisitor<'a> {
    fields: &'a mut BTreeMap<String, String>,
}

impl<'a> tracing::field::Visit for FieldVisitor<'a> {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn fmt::Debug) {
        self.fields
            .insert(field.name().to_string(), format!("{value:?}"));
    }
}

fn event_has_message(event: &CapturedEvent, needle: &str) -> bool {
    event
        .fields
        .get("message")
        .is_some_and(|msg| msg.contains(needle))
}

#[test]
fn pipeline_emits_trace_events_for_detection_read_write_verify() {
    let _cc_lock = CC_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let _codex_lock = CODEX_ENV.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = tempfile::TempDir::new().unwrap();
    let _cc_env = EnvGuard::set("CLAUDE_HOME", &tmp.path().join("claude"));
    let _codex_env = EnvGuard::set("CODEX_HOME", &tmp.path().join("codex"));
    let cc_sid = seed_cc_fixture(&tmp.path().join("claude"));

    let collector = LogCollector::default();
    let subscriber = tracing_subscriber::registry().with(
        collector
            .clone()
            .with_filter(tracing_subscriber::filter::LevelFilter::TRACE),
    );
    let _guard = tracing::subscriber::set_default(subscriber);

    let pipeline = ConversionPipeline {
        registry: ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Codex)]),
    };

    pipeline
        .convert(
            "cod",
            &cc_sid,
            ConvertOptions {
                dry_run: false,
                force: false,
                verbose: false,
                enrich: false,
                source_hint: None,
            },
        )
        .expect("conversion should succeed");

    let events = collector.snapshot();

    assert!(
        events
            .iter()
            .any(|e| e.level == tracing::Level::INFO && event_has_message(e, "starting conversion")),
        "missing starting conversion INFO event; got {events:#?}"
    );
    assert!(
        events
            .iter()
            .any(|e| e.level == tracing::Level::TRACE && event_has_message(e, "detection")),
        "missing provider detection TRACE event; got {events:#?}"
    );
    assert!(
        events.iter().any(|e| e.level == tracing::Level::DEBUG
            && event_has_message(e, "found Claude Code session")),
        "missing session discovery DEBUG event; got {events:#?}"
    );
    assert!(
        events.iter().any(|e| e.level == tracing::Level::DEBUG
            && event_has_message(e, "Claude Code session parsed")),
        "missing source read DEBUG event; got {events:#?}"
    );
    assert!(
        events
            .iter()
            .any(|e| e.level == tracing::Level::INFO
                && event_has_message(e, "atomic write complete")),
        "missing atomic write INFO event; got {events:#?}"
    );
    assert!(
        events
            .iter()
            .any(|e| e.level == tracing::Level::DEBUG
                && event_has_message(e, "Codex session parsed")),
        "missing read-back verify DEBUG event; got {events:#?}"
    );
}
