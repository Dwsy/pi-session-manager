//! Unit tests for provider detection and session discovery (`ProviderRegistry`).

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use casr::{
    discovery::{DetectionResult, ProviderRegistry, SourceHint},
    error::CasrError,
    model::{CanonicalMessage, CanonicalSession, MessageRole},
    providers::{Provider, WriteOptions, WrittenSession},
};

#[derive(Clone)]
struct MockProvider {
    name: String,
    slug: String,
    alias: String,
    installed: bool,
    roots: Vec<PathBuf>,
    owns: HashMap<String, PathBuf>,
    can_read_orphan_paths: bool,
}

impl MockProvider {
    fn new(name: &str, slug: &str, alias: &str, installed: bool, roots: Vec<PathBuf>) -> Self {
        Self {
            name: name.to_string(),
            slug: slug.to_string(),
            alias: alias.to_string(),
            installed,
            roots,
            owns: HashMap::new(),
            can_read_orphan_paths: false,
        }
    }

    fn with_owned_session(mut self, session_id: &str, path: impl Into<PathBuf>) -> Self {
        self.owns.insert(session_id.to_string(), path.into());
        self
    }

    fn with_orphan_path_read_support(mut self) -> Self {
        self.can_read_orphan_paths = true;
        self
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
        DetectionResult {
            installed: self.installed,
            version: None,
            evidence: vec![format!("installed={}", self.installed)],
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        self.roots.clone()
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        self.owns.get(session_id).cloned()
    }

    fn read_session(&self, _path: &Path) -> anyhow::Result<CanonicalSession> {
        if !self.can_read_orphan_paths {
            return Err(anyhow::anyhow!("mock provider cannot read this path"));
        }

        Ok(CanonicalSession {
            session_id: "mock-session".to_string(),
            provider_slug: self.slug.clone(),
            workspace: None,
            title: None,
            started_at: None,
            ended_at: None,
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "hi".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: Vec::new(),
                    tool_results: Vec::new(),
                    extra: serde_json::json!({}),
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "hello".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: Vec::new(),
                    tool_results: Vec::new(),
                    extra: serde_json::json!({}),
                },
            ],
            metadata: serde_json::json!({}),
            source_path: _path.to_path_buf(),
            model_name: None,
        })
    }

    fn write_session(
        &self,
        _session: &CanonicalSession,
        _opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        Err(anyhow::anyhow!("not used in discovery tests"))
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("{} --resume {session_id}", self.alias)
    }
}

fn make_registry() -> ProviderRegistry {
    ProviderRegistry::new(vec![
        Box::new(MockProvider::new(
            "Claude Code",
            "claude-code",
            "cc",
            true,
            vec![PathBuf::from("/tmp/mock-cc")],
        )),
        Box::new(MockProvider::new(
            "Codex",
            "codex",
            "cod",
            true,
            vec![PathBuf::from("/tmp/mock-cod")],
        )),
        Box::new(MockProvider::new(
            "Gemini CLI",
            "gemini",
            "gmi",
            false,
            vec![PathBuf::from("/tmp/mock-gmi")],
        )),
    ])
}

#[test]
fn registry_find_by_slug_and_alias() {
    let registry = make_registry();
    assert_eq!(registry.all_providers().len(), 3);

    let by_slug = registry
        .find_by_slug("claude-code")
        .expect("claude-code slug should resolve");
    assert_eq!(by_slug.cli_alias(), "cc");

    let by_alias = registry
        .find_by_alias("cod")
        .expect("cod alias should resolve");
    assert_eq!(by_alias.slug(), "codex");

    let gmi_alias = registry
        .find_by_alias("gmi")
        .expect("gmi alias should resolve");
    assert_eq!(gmi_alias.slug(), "gemini");

    let claude_name = registry
        .find_by_alias("claude")
        .expect("claude standard name should resolve");
    assert_eq!(claude_name.slug(), "claude-code");

    let gemini_cli = registry
        .find_by_alias("gemini-cli")
        .expect("gemini-cli standard name should resolve");
    assert_eq!(gemini_cli.slug(), "gemini");

    assert!(registry.find_by_slug("missing").is_none());
    assert!(registry.find_by_alias("missing").is_none());
}

#[test]
fn detect_all_reports_every_provider_with_evidence() {
    let registry = make_registry();
    let statuses = registry.detect_all();
    assert_eq!(statuses.len(), 3);

    let mut by_slug: HashMap<String, DetectionResult> = HashMap::new();
    for (provider, status) in statuses {
        by_slug.insert(provider.slug().to_string(), status);
    }

    assert!(by_slug["claude-code"].installed);
    assert!(by_slug["codex"].installed);
    assert!(!by_slug["gemini"].installed);
    assert!(
        by_slug["claude-code"]
            .evidence
            .iter()
            .any(|e| e.contains("installed=true"))
    );
}

#[test]
fn installed_providers_filters_only_installed_entries() {
    let registry = make_registry();
    let installed = registry.installed_providers();
    let slugs: Vec<&str> = installed.iter().map(|p| p.slug()).collect();
    assert_eq!(slugs, vec!["claude-code", "codex"]);
}

#[test]
fn resolve_auto_finds_unique_match() {
    let cc = MockProvider::new(
        "Claude Code",
        "claude-code",
        "cc",
        true,
        vec![PathBuf::from("/tmp/mock-cc")],
    )
    .with_owned_session("sid-cc", "/tmp/mock-cc/sid-cc.jsonl");
    let cod = MockProvider::new(
        "Codex",
        "codex",
        "cod",
        true,
        vec![PathBuf::from("/tmp/mock-cod")],
    )
    .with_owned_session("sid-cod", "/tmp/mock-cod/sid-cod.jsonl");
    let gmi = MockProvider::new(
        "Gemini CLI",
        "gemini",
        "gmi",
        true,
        vec![PathBuf::from("/tmp/mock-gmi")],
    )
    .with_owned_session("sid-gmi", "/tmp/mock-gmi/sid-gmi.json");

    let registry = ProviderRegistry::new(vec![Box::new(cc), Box::new(cod), Box::new(gmi)]);

    let resolved_cc = registry
        .resolve_session("sid-cc", None)
        .expect("sid-cc should resolve uniquely");
    assert_eq!(resolved_cc.provider.slug(), "claude-code");
    assert_eq!(resolved_cc.path, PathBuf::from("/tmp/mock-cc/sid-cc.jsonl"));

    let resolved_cod = registry
        .resolve_session("sid-cod", None)
        .expect("sid-cod should resolve uniquely");
    assert_eq!(resolved_cod.provider.slug(), "codex");

    let resolved_gmi = registry
        .resolve_session("sid-gmi", None)
        .expect("sid-gmi should resolve uniquely");
    assert_eq!(resolved_gmi.provider.slug(), "gemini");
}

#[test]
fn resolve_auto_session_not_found_reports_installed_providers() {
    let registry = make_registry();
    let err = registry
        .resolve_session("missing-session", None)
        .expect_err("missing session should error");
    match err {
        CasrError::SessionNotFound {
            providers_checked, ..
        } => {
            assert_eq!(providers_checked, vec!["Claude Code", "Codex"]);
        }
        other => panic!("expected SessionNotFound, got {other:?}"),
    }
}

#[test]
fn resolve_auto_ambiguous_session_reports_candidates() {
    let cc = MockProvider::new(
        "Claude Code",
        "claude-code",
        "cc",
        true,
        vec![PathBuf::from("/tmp/mock-cc")],
    )
    .with_owned_session("same-id", "/tmp/mock-cc/same.jsonl");
    let cod = MockProvider::new(
        "Codex",
        "codex",
        "cod",
        true,
        vec![PathBuf::from("/tmp/mock-cod")],
    )
    .with_owned_session("same-id", "/tmp/mock-cod/same.jsonl");

    let registry = ProviderRegistry::new(vec![Box::new(cc), Box::new(cod)]);
    let err = registry
        .resolve_session("same-id", None)
        .expect_err("ambiguous session id should error");

    match err {
        CasrError::AmbiguousSessionId { candidates, .. } => {
            assert_eq!(candidates.len(), 2);
            assert!(candidates.iter().any(|c| c.provider == "claude-code"));
            assert!(candidates.iter().any(|c| c.provider == "codex"));
        }
        other => panic!("expected AmbiguousSessionId, got {other:?}"),
    }
}

#[test]
fn source_alias_hint_narrows_resolution_scope() {
    let cc = MockProvider::new(
        "Claude Code",
        "claude-code",
        "cc",
        true,
        vec![PathBuf::from("/tmp/mock-cc")],
    )
    .with_owned_session("same-id", "/tmp/mock-cc/same.jsonl");
    let cod = MockProvider::new(
        "Codex",
        "codex",
        "cod",
        true,
        vec![PathBuf::from("/tmp/mock-cod")],
    )
    .with_owned_session("same-id", "/tmp/mock-cod/same.jsonl");

    let registry = ProviderRegistry::new(vec![Box::new(cc), Box::new(cod)]);
    let hint = SourceHint::Alias("cc".to_string());
    let resolved = registry
        .resolve_session("same-id", Some(&hint))
        .expect("alias hint should disambiguate");

    assert_eq!(resolved.provider.slug(), "claude-code");
    assert_eq!(resolved.path, PathBuf::from("/tmp/mock-cc/same.jsonl"));
}

#[test]
fn source_alias_hint_unknown_alias_errors() {
    let registry = make_registry();
    let hint = SourceHint::Alias("missing-alias".to_string());
    let err = registry
        .resolve_session("whatever", Some(&hint))
        .expect_err("unknown alias should error");
    assert!(matches!(err, CasrError::UnknownProviderAlias { .. }));
}

#[test]
fn source_path_hint_bypasses_discovery_and_uses_owning_provider() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let cc_root = tmp.path().join("cc");
    std::fs::create_dir_all(&cc_root).expect("create cc root");
    let session_path = cc_root.join("session.jsonl");
    std::fs::write(&session_path, "{}").expect("seed source file");

    let cc = MockProvider::new(
        "Claude Code",
        "claude-code",
        "cc",
        true,
        vec![cc_root.clone()],
    );
    let cod = MockProvider::new("Codex", "codex", "cod", true, vec![tmp.path().join("cod")]);
    let registry = ProviderRegistry::new(vec![Box::new(cc), Box::new(cod)]);

    let hint = SourceHint::Path(session_path.clone());
    let resolved = registry
        .resolve_session("ignored-by-path-hint", Some(&hint))
        .expect("path hint should resolve");

    assert_eq!(resolved.provider.slug(), "claude-code");
    assert_eq!(resolved.path, session_path);
}

#[test]
fn source_path_hint_accepts_virtual_child_of_file() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let db_path = tmp.path().join("state.vscdb");
    std::fs::write(&db_path, "x").expect("seed db file");

    // Simulate providers that address specific sessions via `<file>/<id>` virtual paths.
    let virtual_path = db_path.join("session-123");

    let cur = MockProvider::new("Cursor", "cursor", "cur", true, vec![db_path.clone()]);
    let registry = ProviderRegistry::new(vec![Box::new(cur)]);

    let hint = SourceHint::Path(virtual_path.clone());
    let resolved = registry
        .resolve_session("ignored-by-path-hint", Some(&hint))
        .expect("virtual path hint should resolve");

    assert_eq!(resolved.provider.slug(), "cursor");
    assert_eq!(resolved.path, virtual_path);
}

#[test]
fn source_path_hint_non_file_non_virtual_errors() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let dir_path = tmp.path().join("not-a-file");
    std::fs::create_dir_all(&dir_path).expect("create dir");

    let cc = MockProvider::new(
        "Claude Code",
        "claude-code",
        "cc",
        true,
        vec![tmp.path().to_path_buf()],
    );
    let registry = ProviderRegistry::new(vec![Box::new(cc)]);

    let hint = SourceHint::Path(dir_path);
    let err = registry
        .resolve_session("ignored-by-path-hint", Some(&hint))
        .expect_err("dir path hint should error");

    assert!(matches!(err, CasrError::SessionNotFound { .. }));
}

#[test]
fn source_path_hint_without_root_match_selects_best_effort_provider() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let orphan_path = tmp.path().join("orphan.json");
    std::fs::write(&orphan_path, "{}").expect("seed orphan file");

    let cc = MockProvider::new(
        "Claude Code",
        "claude-code",
        "cc",
        true,
        vec![tmp.path().join("cc-root")],
    );
    let cod = MockProvider::new(
        "Codex",
        "codex",
        "cod",
        true,
        vec![tmp.path().join("cod-root")],
    )
    .with_orphan_path_read_support();
    let registry = ProviderRegistry::new(vec![Box::new(cc), Box::new(cod)]);

    let hint = SourceHint::Path(orphan_path.clone());
    let resolved = registry
        .resolve_session("ignored", Some(&hint))
        .expect("best-effort provider should be selected");
    assert_eq!(resolved.provider.slug(), "codex");
    assert_eq!(resolved.path, orphan_path);
}
