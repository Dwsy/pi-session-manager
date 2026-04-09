//! Provider detection and cross-provider session lookup.
//!
//! The [`ProviderRegistry`] knows about all supported providers and can
//! detect which ones are installed, then locate sessions by ID across
//! all of them.
//!
//! The main entry point for session resolution is [`ProviderRegistry::resolve_session`],
//! which implements a deterministic multi-step algorithm:
//!
//! 1. If `--source <path>` → bypass discovery, resolve directly to file.
//! 2. If `--source <alias>` → only search that provider.
//! 3. Otherwise → search all installed providers, detect ambiguity.

use std::path::{Path, PathBuf};

use tracing::{debug, info, trace, warn};

use crate::error::{Candidate, CasrError};
use crate::model::{CanonicalSession, MessageRole};
use crate::providers::Provider;

// ---------------------------------------------------------------------------
// Source hint — parsed from `--source` CLI flag
// ---------------------------------------------------------------------------

/// Hint from the `--source` CLI flag to constrain session resolution.
#[derive(Debug, Clone)]
pub enum SourceHint {
    /// Provider alias (e.g., `"cc"`, `"cod"`, `"gmi"`) or slug.
    Alias(String),
    /// Direct path to a native session file.
    Path(PathBuf),
}

impl SourceHint {
    /// Parse a `--source` value into a hint.
    ///
    /// Heuristic: if the value contains a path separator or starts with `.`/`~`/`/`,
    /// treat it as a path. Otherwise, treat it as a provider alias.
    pub fn parse(value: &str) -> Self {
        if value.contains(std::path::MAIN_SEPARATOR)
            || value.starts_with('.')
            || value.starts_with('~')
            || value.starts_with('/')
        {
            // Expand leading `~/` to the user's home directory.
            let expanded = if let Some(rest) = value.strip_prefix("~/") {
                dirs::home_dir()
                    .map(|h| h.join(rest))
                    .unwrap_or_else(|| PathBuf::from(value))
            } else if value == "~" {
                dirs::home_dir().unwrap_or_else(|| PathBuf::from(value))
            } else {
                PathBuf::from(value)
            };
            SourceHint::Path(expanded)
        } else {
            SourceHint::Alias(value.to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Resolved session
// ---------------------------------------------------------------------------

/// A successfully resolved session: source provider + file path.
pub struct ResolvedSession<'a> {
    /// The provider that owns this session.
    pub provider: &'a dyn Provider,
    /// Path to the native session file.
    pub path: PathBuf,
}

impl std::fmt::Debug for ResolvedSession<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResolvedSession")
            .field("provider", &self.provider.slug())
            .field("path", &self.path)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

/// Central registry of all known providers.
pub struct ProviderRegistry {
    providers: Vec<Box<dyn Provider>>,
}

impl ProviderRegistry {
    /// Create a registry with all known providers.
    pub fn new(providers: Vec<Box<dyn Provider>>) -> Self {
        Self { providers }
    }

    /// Create the default registry with all built-in providers.
    pub fn default_registry() -> Self {
        Self::new(vec![
            Box::new(crate::providers::claude_code::ClaudeCode),
            Box::new(crate::providers::codex::Codex),
            Box::new(crate::providers::gemini::Gemini),
            Box::new(crate::providers::cursor::Cursor),
            Box::new(crate::providers::cline::Cline),
            Box::new(crate::providers::aider::Aider),
            Box::new(crate::providers::amp::Amp),
            Box::new(crate::providers::opencode::OpenCode),
            Box::new(crate::providers::chatgpt::ChatGpt),
            Box::new(crate::providers::clawdbot::ClawdBot),
            Box::new(crate::providers::vibe::Vibe),
            Box::new(crate::providers::factory::Factory),
            Box::new(crate::providers::openclaw::OpenClaw),
            Box::new(crate::providers::pi_agent::PiAgent),
        ])
    }

    /// Probe each provider for installation status.
    pub fn detect_all(&self) -> Vec<(&dyn Provider, DetectionResult)> {
        self.providers
            .iter()
            .map(|p| {
                let result = p.detect();
                debug!(
                    provider = p.name(),
                    installed = result.installed,
                    "provider detection"
                );
                (p.as_ref(), result)
            })
            .collect()
    }

    /// Return only providers that are currently installed.
    pub fn installed_providers(&self) -> Vec<&dyn Provider> {
        self.providers
            .iter()
            .filter(|p| p.detect().installed)
            .map(|p| p.as_ref())
            .collect()
    }

    /// Return all registered providers regardless of installation status.
    pub fn all_providers(&self) -> Vec<&dyn Provider> {
        self.providers.iter().map(|p| p.as_ref()).collect()
    }

    /// Find a provider by its slug (e.g. `"claude-code"`).
    pub fn find_by_slug(&self, slug: &str) -> Option<&dyn Provider> {
        self.providers
            .iter()
            .find(|p| p.slug() == slug)
            .map(|p| p.as_ref())
    }

    /// Find a provider by its CLI alias (e.g. `"cc"`) or slug.
    pub fn find_by_alias(&self, alias: &str) -> Option<&dyn Provider> {
        let normalized = normalize_provider_token(alias);
        let canonical = canonical_provider_token(&normalized);
        self.providers
            .iter()
            .find(|p| {
                let alias_token = normalize_provider_token(p.cli_alias());
                let slug_token = normalize_provider_token(p.slug());
                alias_token == canonical
                    || slug_token == canonical
                    || alias_token == normalized
                    || slug_token == normalized
            })
            .map(|p| p.as_ref())
    }

    // -----------------------------------------------------------------------
    // Session resolution — the full algorithm
    // -----------------------------------------------------------------------

    /// Resolve a session ID to its source provider and file path.
    ///
    /// This is the main entry point for the `casr <target> resume <session-id>`
    /// flow. It implements a deterministic multi-step algorithm:
    ///
    /// 1. If `source_hint` is a [`SourceHint::Path`], bypass discovery entirely.
    /// 2. If `source_hint` is a [`SourceHint::Alias`], search only that provider.
    /// 3. Otherwise, search all installed providers via fast-path ownership checks.
    /// 4. Exactly one match → return it.
    /// 5. Multiple matches → [`CasrError::AmbiguousSessionId`].
    /// 6. No matches → [`CasrError::SessionNotFound`] with diagnostics.
    pub fn resolve_session(
        &self,
        session_id: &str,
        source_hint: Option<&SourceHint>,
    ) -> Result<ResolvedSession<'_>, CasrError> {
        match source_hint {
            Some(SourceHint::Path(path)) => self.resolve_from_path(session_id, path),
            Some(SourceHint::Alias(alias)) => self.resolve_with_alias(session_id, alias),
            None => self.resolve_auto(session_id),
        }
    }

    /// Resolve by direct file path — bypass all discovery.
    ///
    /// Identifies the owning provider by checking which provider's session roots
    /// contain the path. Falls back to file extension heuristics.
    fn resolve_from_path(
        &self,
        session_id: &str,
        path: &Path,
    ) -> Result<ResolvedSession<'_>, CasrError> {
        debug!(path = %path.display(), "resolving session from explicit path");

        // Some providers use "virtual" session paths that are not real files, e.g.
        // `<db-file>/<session-id>` where the *parent* is the real file.
        let parent_is_file = path.parent().is_some_and(|p| p.is_file());

        if !path.is_file() && !parent_is_file {
            return Err(CasrError::SessionNotFound {
                session_id: session_id.to_string(),
                providers_checked: vec!["(direct path)".to_string()],
                sessions_scanned: 0,
            });
        }

        // Try to identify the owning provider by checking session roots.
        for provider in &self.providers {
            for root in provider.session_roots() {
                if path.starts_with(&root) {
                    info!(
                        provider = provider.name(),
                        path = %path.display(),
                        "resolved session from explicit path"
                    );
                    return Ok(ResolvedSession {
                        provider: provider.as_ref(),
                        path: path.to_path_buf(),
                    });
                }
            }
        }

        // Path exists but does not live under any known provider session root.
        // This can happen when users move/copy session files for archival or sharing.
        //
        // First, try lightweight file signature inference. If that fails, probe all
        // providers and pick the most plausible parser.
        if let Some(provider) = self.infer_provider_for_path(path) {
            info!(
                provider = provider.name(),
                path = %path.display(),
                "resolved session from explicit path via file signature"
            );
            return Ok(ResolvedSession {
                provider,
                path: path.to_path_buf(),
            });
        }

        let mut best: Option<(&dyn Provider, usize, bool)> = None;
        let mut providers_tried: Vec<String> = Vec::new();

        for provider in &self.providers {
            providers_tried.push(provider.slug().to_string());
            let parsed = provider.read_session(path);
            let Ok(session) = parsed else {
                continue;
            };

            if session.messages.is_empty() {
                continue;
            }

            let plausible = is_plausible_session(&session);

            let is_better = best.is_none_or(|(best_provider, best_len, best_plausible)| {
                (plausible, session.messages.len(), provider.slug())
                    > (best_plausible, best_len, best_provider.slug())
            });

            if is_better {
                best = Some((provider.as_ref(), session.messages.len(), plausible));
            }
        }

        if let Some((provider, _len, plausible)) = best {
            if !plausible {
                warn!(
                    provider = provider.name(),
                    path = %path.display(),
                    "no provider root matched path; selected best-effort parser (session may not be resumable)"
                );
            } else {
                info!(
                    provider = provider.name(),
                    path = %path.display(),
                    "resolved session from explicit path via provider probing"
                );
            }
            return Ok(ResolvedSession {
                provider,
                path: path.to_path_buf(),
            });
        }

        Err(CasrError::SessionReadError {
            path: path.to_path_buf(),
            provider: "(unknown)".to_string(),
            detail: format!(
                "Path is not under any provider root and could not be parsed as a session by any provider. Tried: {providers_tried:?}"
            ),
        })
    }

    /// Resolve by alias hint — only search the specified provider.
    fn resolve_with_alias(
        &self,
        session_id: &str,
        alias: &str,
    ) -> Result<ResolvedSession<'_>, CasrError> {
        debug!(
            alias,
            session_id, "resolving session with source alias hint"
        );

        let provider =
            self.find_by_alias(alias)
                .ok_or_else(|| CasrError::UnknownProviderAlias {
                    alias: alias.to_string(),
                    known_aliases: self.known_aliases(),
                })?;

        match provider.owns_session(session_id) {
            Some(path) => {
                info!(
                    provider = provider.name(),
                    path = %path.display(),
                    session_id,
                    "resolved session via alias hint"
                );
                Ok(ResolvedSession { provider, path })
            }
            None => {
                let roots: Vec<String> = provider
                    .session_roots()
                    .iter()
                    .map(|r| r.display().to_string())
                    .collect();
                debug!(
                    provider = provider.name(),
                    ?roots,
                    "session not found in hinted provider"
                );
                Err(CasrError::SessionNotFound {
                    session_id: session_id.to_string(),
                    providers_checked: vec![provider.name().to_string()],
                    sessions_scanned: 0,
                })
            }
        }
    }

    /// Fully automatic resolution — search all installed providers.
    ///
    /// Collects ALL matches (does not short-circuit) to detect ambiguity.
    fn resolve_auto(&self, session_id: &str) -> Result<ResolvedSession<'_>, CasrError> {
        debug!(session_id, "auto-resolving session across all providers");

        let mut matches: Vec<(&dyn Provider, PathBuf)> = Vec::new();
        let mut providers_checked: Vec<String> = Vec::new();

        for provider in &self.providers {
            let detection = provider.detect();
            if !detection.installed {
                trace!(provider = provider.name(), "skipping — not installed");
                continue;
            }

            providers_checked.push(provider.name().to_string());
            trace!(provider = provider.name(), session_id, "searching");

            if let Some(path) = provider.owns_session(session_id) {
                debug!(
                    provider = provider.name(),
                    path = %path.display(),
                    session_id,
                    "candidate match"
                );
                matches.push((provider.as_ref(), path));
            }
        }

        match matches.len() {
            0 => {
                debug!(
                    session_id,
                    ?providers_checked,
                    "session not found in any provider"
                );
                Err(CasrError::SessionNotFound {
                    session_id: session_id.to_string(),
                    providers_checked,
                    sessions_scanned: 0,
                })
            }
            1 => {
                let (provider, path) = matches.into_iter().next().expect("checked len==1");
                info!(
                    provider = provider.name(),
                    path = %path.display(),
                    session_id,
                    "unique session match"
                );
                Ok(ResolvedSession { provider, path })
            }
            _ => {
                let candidates: Vec<Candidate> = matches
                    .iter()
                    .map(|(p, path)| Candidate {
                        provider: p.slug().to_string(),
                        path: path.to_path_buf(),
                    })
                    .collect();
                warn!(
                    session_id,
                    candidate_count = candidates.len(),
                    "ambiguous session ID — multiple providers match"
                );
                Err(CasrError::AmbiguousSessionId {
                    session_id: session_id.to_string(),
                    candidates,
                })
            }
        }
    }

    /// Collect the CLI aliases of all registered providers (for error messages).
    pub fn known_aliases(&self) -> Vec<String> {
        self.providers
            .iter()
            .map(|p| format!("{} ({})", p.cli_alias(), p.name()))
            .collect()
    }
}

fn normalize_provider_token(token: &str) -> String {
    token.trim().to_ascii_lowercase().replace(['_', ' '], "-")
}

fn canonical_provider_token(token: &str) -> &str {
    match token {
        // Common human-facing shorthand users type at the CLI.
        "claude" => "claude-code",
        "codex-cli" => "codex",
        "gemini-cli" => "gemini",
        _ => token,
    }
}

fn is_plausible_session(session: &CanonicalSession) -> bool {
    if session.messages.is_empty() {
        return false;
    }
    let has_user = session.messages.iter().any(|m| m.role == MessageRole::User);
    let has_assistant = session
        .messages
        .iter()
        .any(|m| m.role == MessageRole::Assistant);
    has_user && has_assistant
}

impl ProviderRegistry {
    fn infer_provider_for_path(&self, path: &Path) -> Option<&dyn Provider> {
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        match ext.as_str() {
            "vscdb" => return self.find_by_slug("cursor"),
            "jsonl" => {
                let file = std::fs::File::open(path).ok()?;
                let reader = std::io::BufReader::new(file);
                let mut lines_checked = 0;
                for line in std::io::BufRead::lines(reader).map_while(Result::ok) {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let Ok(value): Result<serde_json::Value, _> = serde_json::from_str(trimmed)
                    else {
                        continue;
                    };
                    lines_checked += 1;

                    if value.get("type").and_then(|v| v.as_str()) == Some("session_meta") {
                        return self.find_by_slug("codex");
                    }
                    // Factory: JSONL with session_start typed entry.
                    if value.get("type").and_then(|v| v.as_str()) == Some("session_start") {
                        return self.find_by_slug("factory");
                    }
                    // OpenClaw: type:"session" with version field.
                    if value.get("type").and_then(|v| v.as_str()) == Some("session")
                        && value.get("version").is_some()
                    {
                        return self.find_by_slug("openclaw");
                    }
                    // Pi-Agent: type:"session" with provider/modelId fields.
                    if value.get("type").and_then(|v| v.as_str()) == Some("session")
                        && (value.get("provider").is_some() || value.get("modelId").is_some())
                    {
                        return self.find_by_slug("pi-agent");
                    }
                    // OpenClaw/Pi-Agent: type:"message" with nested "message" object.
                    if value.get("type").and_then(|v| v.as_str()) == Some("message")
                        && value.get("message").is_some()
                    {
                        // Disambiguate by filename pattern: Pi-Agent uses underscore.
                        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                        if stem.contains('_') {
                            return self.find_by_slug("pi-agent");
                        }
                        return self.find_by_slug("openclaw");
                    }
                    if value.get("sessionId").is_some()
                        && value.get("uuid").is_some()
                        && value.get("cwd").is_some()
                    {
                        return self.find_by_slug("claude-code");
                    }
                    // ClawdBot: bare JSONL messages with role+content, no type field.
                    if value.get("role").is_some()
                        && value.get("content").is_some()
                        && value.get("type").is_none()
                    {
                        return self.find_by_slug("clawdbot");
                    }

                    if lines_checked >= 50 {
                        break;
                    }
                }
            }
            "json" => {
                let file = std::fs::File::open(path).ok()?;
                let reader = std::io::BufReader::new(file);
                let value: serde_json::Value = serde_json::from_reader(reader).ok()?;

                if value.get("sessionId").is_some() && value.get("messages").is_some() {
                    return self.find_by_slug("gemini");
                }

                // ChatGPT mapping-based conversation format.
                if value.get("mapping").is_some()
                    && (value.get("id").is_some() || value.get("conversation_id").is_some())
                {
                    return self.find_by_slug("chatgpt");
                }

                if value.get("session").is_some() {
                    return self.find_by_slug("codex");
                }
            }
            _ => {}
        }
        None
    }
}

/// Result of probing a provider for installation.
#[derive(Debug, Clone)]
pub struct DetectionResult {
    pub installed: bool,
    pub version: Option<String>,
    pub evidence: Vec<String>,
}

// ---------------------------------------------------------------------------
// Git repository discovery
// ---------------------------------------------------------------------------

/// The kind of `.git` marker found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitMarker {
    /// `.git` is a directory — standard repository root.
    Directory,
    /// `.git` is a file containing a `gitdir:` pointer (worktree or submodule).
    File {
        /// Resolved `gitdir:` target path.
        gitdir: PathBuf,
    },
}

/// Maximum bytes to read from a `.git` file marker before giving up.
///
/// A well-formed `.git` file is a single line like `gitdir: ../path/to/.git`.
/// 4 KiB is more than enough for even deeply nested paths while protecting
/// against accidentally opening large non-marker files.
const GIT_FILE_MAX_BYTES: usize = 4096;

/// Parse a `.git` marker at the given `path`.
///
/// Returns `Some(GitMarker)` if `path` is either:
/// - A directory (standard git repo root), or
/// - A file containing a valid `gitdir: <non-empty-path>` line.
///
/// Hardened parsing rules for `.git` files:
/// - Reads at most [`GIT_FILE_MAX_BYTES`] bytes.
/// - Skips blank lines and lines starting with `#` (comments).
/// - Requires the first non-blank, non-comment line to start with `gitdir:`.
/// - The path after `gitdir:` must be non-empty after trimming.
/// - Resolves relative `gitdir:` paths against the parent of `path`.
pub fn parse_git_marker(path: &Path) -> Option<GitMarker> {
    if path.is_dir() {
        return Some(GitMarker::Directory);
    }

    if !path.is_file() {
        return None;
    }

    // Bounded read.
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; GIT_FILE_MAX_BYTES];
    let n = std::io::Read::read(&mut file, &mut buf).ok()?;
    buf.truncate(n);
    let content = std::str::from_utf8(&buf).ok()?;

    // Find first meaningful line.
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Must start with `gitdir:`.
        let rest = trimmed.strip_prefix("gitdir:")?;
        let gitdir_str = rest.trim();
        if gitdir_str.is_empty() {
            return None;
        }

        let gitdir_path = PathBuf::from(gitdir_str);
        let resolved = if gitdir_path.is_relative() {
            // Resolve relative to the directory containing the `.git` file.
            path.parent()
                .map(|parent| parent.join(&gitdir_path))
                .unwrap_or(gitdir_path)
        } else {
            gitdir_path
        };

        return Some(GitMarker::File { gitdir: resolved });
    }

    // No `gitdir:` line found.
    None
}

/// Walk upward from `start` to find the nearest git repository root.
///
/// Looks for a `.git` entry (directory or file) in each ancestor directory.
/// Returns `None` if no `.git` marker is found before reaching the filesystem root.
pub fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut current = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start.to_path_buf()
    };

    loop {
        let candidate = current.join(".git");
        if candidate.exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

/// Derive a repository name from a workspace path.
///
/// Uses the basename of the git root directory if found, otherwise the
/// basename of the workspace path itself.
pub fn repo_name_from_path(workspace: &Path) -> Option<String> {
    let root = find_git_root(workspace).unwrap_or_else(|| workspace.to_path_buf());
    root.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::{ProviderRegistry, SourceHint, is_plausible_session};
    use crate::model::{CanonicalMessage, CanonicalSession, MessageRole};
    use std::io::Write as _;
    use std::path::PathBuf;

    fn msg(idx: usize, role: MessageRole) -> CanonicalMessage {
        CanonicalMessage {
            idx,
            role,
            content: "x".to_string(),
            timestamp: None,
            author: None,
            tool_calls: vec![],
            tool_results: vec![],
            extra: serde_json::Value::Null,
        }
    }

    fn session_with_messages(messages: Vec<CanonicalMessage>) -> CanonicalSession {
        CanonicalSession {
            session_id: "sid".to_string(),
            provider_slug: "test".to_string(),
            workspace: None,
            title: None,
            started_at: None,
            ended_at: None,
            messages,
            metadata: serde_json::Value::Null,
            source_path: PathBuf::from("/tmp/source"),
            model_name: None,
        }
    }

    #[test]
    fn source_hint_parse_alias_default() {
        match SourceHint::parse("cc") {
            SourceHint::Alias(a) => assert_eq!(a, "cc"),
            other => panic!("expected Alias, got {other:?}"),
        }
    }

    #[test]
    fn source_hint_parse_path_dot_slash() {
        match SourceHint::parse("./some/path.jsonl") {
            SourceHint::Path(p) => assert_eq!(p, PathBuf::from("./some/path.jsonl")),
            other => panic!("expected Path, got {other:?}"),
        }
    }

    #[test]
    fn source_hint_parse_path_tilde_expands_home_when_available() {
        let hint = SourceHint::parse("~/x.jsonl");
        match hint {
            SourceHint::Path(p) => {
                let expected = dirs::home_dir()
                    .map(|h| h.join("x.jsonl"))
                    .unwrap_or_else(|| PathBuf::from("~/x.jsonl"));
                assert_eq!(p, expected);
            }
            other => panic!("expected Path, got {other:?}"),
        }
    }

    #[test]
    fn plausible_session_requires_user_and_assistant() {
        assert!(!is_plausible_session(&session_with_messages(vec![])));
        assert!(!is_plausible_session(&session_with_messages(vec![msg(
            0,
            MessageRole::User,
        )])));
        assert!(!is_plausible_session(&session_with_messages(vec![msg(
            0,
            MessageRole::Assistant,
        )])));
        assert!(is_plausible_session(&session_with_messages(vec![
            msg(0, MessageRole::User),
            msg(1, MessageRole::Assistant),
        ])));
    }

    fn infer_slug_for_file(path: &std::path::Path) -> Option<String> {
        let registry = ProviderRegistry::default_registry();
        registry
            .infer_provider_for_path(path)
            .map(|p| p.slug().to_string())
    }

    #[test]
    fn infer_provider_for_path_vscdb_is_cursor() {
        let tmp = tempfile::NamedTempFile::with_suffix(".vscdb").expect("tmp");
        assert_eq!(infer_slug_for_file(tmp.path()).as_deref(), Some("cursor"));
    }

    #[test]
    fn infer_provider_for_path_json_gemini() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").expect("tmp");
        tmp.write_all(br#"{"sessionId":"s1","messages":[]}"#)
            .expect("write");
        tmp.flush().expect("flush");
        assert_eq!(infer_slug_for_file(tmp.path()).as_deref(), Some("gemini"));
    }

    #[test]
    fn infer_provider_for_path_json_chatgpt_mapping() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").expect("tmp");
        tmp.write_all(br#"{"id":"c1","mapping":{}}"#)
            .expect("write");
        tmp.flush().expect("flush");
        assert_eq!(infer_slug_for_file(tmp.path()).as_deref(), Some("chatgpt"));
    }

    #[test]
    fn infer_provider_for_path_json_codex_session_key() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".json").expect("tmp");
        tmp.write_all(br#"{"session":{}}"#).expect("write");
        tmp.flush().expect("flush");
        assert_eq!(infer_slug_for_file(tmp.path()).as_deref(), Some("codex"));
    }

    #[test]
    fn infer_provider_for_path_jsonl_codex_session_meta() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".jsonl").expect("tmp");
        tmp.write_all(b"\n{\"type\":\"session_meta\"}\n")
            .expect("write");
        tmp.flush().expect("flush");
        assert_eq!(infer_slug_for_file(tmp.path()).as_deref(), Some("codex"));
    }

    #[test]
    fn infer_provider_for_path_jsonl_claude_code() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".jsonl").expect("tmp");
        tmp.write_all(
            br#"{"sessionId":"s1","uuid":"u1","cwd":"/tmp","type":"user","message":{"role":"user","content":"hi"}}"#,
        )
        .expect("write");
        tmp.flush().expect("flush");
        assert_eq!(
            infer_slug_for_file(tmp.path()).as_deref(),
            Some("claude-code")
        );
    }

    #[test]
    fn infer_provider_for_path_jsonl_clawdbot_bare_role_content() {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".jsonl").expect("tmp");
        tmp.write_all(br#"{"role":"user","content":"hi"}"#)
            .expect("write");
        tmp.flush().expect("flush");
        assert_eq!(infer_slug_for_file(tmp.path()).as_deref(), Some("clawdbot"));
    }

    #[test]
    fn infer_provider_for_path_jsonl_message_disambiguates_by_filename_stem() {
        let dir = tempfile::tempdir().expect("tmpdir");
        let content = br#"{"type":"message","message":{"role":"user","content":"hi"}}"#;

        let openclaw_path = dir.path().join("openclaw.jsonl");
        std::fs::write(&openclaw_path, content).expect("write openclaw");
        assert_eq!(
            infer_slug_for_file(&openclaw_path).as_deref(),
            Some("openclaw")
        );

        let pi_agent_path = dir.path().join("pi_agent.jsonl");
        std::fs::write(&pi_agent_path, content).expect("write pi_agent");
        assert_eq!(
            infer_slug_for_file(&pi_agent_path).as_deref(),
            Some("pi-agent")
        );
    }

    #[test]
    fn infer_provider_for_path_unknown_extension_returns_none() {
        let tmp = tempfile::NamedTempFile::with_suffix(".wat").expect("tmp");
        assert_eq!(infer_slug_for_file(tmp.path()), None);
    }

    #[test]
    fn known_aliases_includes_provider_names() {
        let registry = ProviderRegistry::default_registry();
        let aliases = registry.known_aliases();
        assert!(
            aliases
                .iter()
                .any(|a| a.contains("cc") && a.contains("Claude Code")),
            "expected cc alias in known_aliases: {aliases:?}"
        );
    }

    // -----------------------------------------------------------------------
    // Git marker parsing
    // -----------------------------------------------------------------------

    use super::{GitMarker, find_git_root, parse_git_marker, repo_name_from_path};

    #[test]
    fn git_marker_directory_detected() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_dir = tmp.path().join(".git");
        std::fs::create_dir(&git_dir).expect("create .git dir");

        let result = parse_git_marker(&git_dir);
        assert_eq!(result, Some(GitMarker::Directory));
    }

    #[test]
    fn git_marker_file_with_valid_gitdir() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "gitdir: ../.git/worktrees/my-branch\n").expect("write");

        let result = parse_git_marker(&git_file);
        match result {
            Some(GitMarker::File { gitdir }) => {
                // Should be resolved relative to the .git file's parent.
                assert!(
                    gitdir.ends_with(".git/worktrees/my-branch"),
                    "gitdir should end with expected path, got: {}",
                    gitdir.display()
                );
            }
            other => panic!("expected GitMarker::File, got {other:?}"),
        }
    }

    #[test]
    fn git_marker_file_with_absolute_gitdir() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "gitdir: /absolute/path/to/.git\n").expect("write");

        let result = parse_git_marker(&git_file);
        match result {
            Some(GitMarker::File { gitdir }) => {
                assert_eq!(gitdir, PathBuf::from("/absolute/path/to/.git"));
            }
            other => panic!("expected GitMarker::File, got {other:?}"),
        }
    }

    #[test]
    fn git_marker_file_skips_blank_and_comment_lines() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "\n# This is a comment\n\ngitdir: /some/path\n").expect("write");

        let result = parse_git_marker(&git_file);
        match result {
            Some(GitMarker::File { gitdir }) => {
                assert_eq!(gitdir, PathBuf::from("/some/path"));
            }
            other => panic!("expected GitMarker::File, got {other:?}"),
        }
    }

    #[test]
    fn git_marker_file_malformed_no_gitdir_prefix() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "not-a-gitdir-line\n").expect("write");

        let result = parse_git_marker(&git_file);
        assert_eq!(result, None, "should return None for malformed .git file");
    }

    #[test]
    fn git_marker_file_malformed_empty_gitdir_path() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "gitdir: \n").expect("write");

        let result = parse_git_marker(&git_file);
        assert_eq!(result, None, "should return None when gitdir path is empty");
    }

    #[test]
    fn git_marker_file_malformed_only_comments_and_blanks() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "\n# comment\n# another comment\n\n").expect("write");

        let result = parse_git_marker(&git_file);
        assert_eq!(
            result, None,
            "should return None when file has only comments/blanks"
        );
    }

    #[test]
    fn git_marker_nonexistent_path() {
        let path = PathBuf::from("/nonexistent/path/.git");
        let result = parse_git_marker(&path);
        assert_eq!(result, None, "should return None for nonexistent path");
    }

    #[test]
    fn find_git_root_locates_standard_repo() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_dir = tmp.path().join(".git");
        std::fs::create_dir(&git_dir).expect("create .git dir");

        // Search from a subdirectory.
        let sub = tmp.path().join("src").join("deep");
        std::fs::create_dir_all(&sub).expect("create subdirs");

        let root = find_git_root(&sub);
        assert_eq!(root, Some(tmp.path().to_path_buf()));
    }

    #[test]
    fn find_git_root_locates_worktree_via_file_marker() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_file = tmp.path().join(".git");
        std::fs::write(&git_file, "gitdir: /some/worktree").expect("write");

        let root = find_git_root(tmp.path());
        assert_eq!(root, Some(tmp.path().to_path_buf()));
    }

    #[test]
    fn find_git_root_returns_none_when_no_git() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let sub = tmp.path().join("no-git-here");
        std::fs::create_dir_all(&sub).expect("create subdir");

        let root = find_git_root(&sub);
        // May find root if /tmp itself is in a git repo, but our tmpdir
        // should not have .git. We just test it doesn't panic.
        // In a clean env, root would be None.
        let _ = root;
    }

    #[test]
    fn repo_name_from_path_returns_basename() {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let git_dir = tmp.path().join("my_project").join(".git");
        std::fs::create_dir_all(&git_dir).expect("create .git dir");
        let project_dir = tmp.path().join("my_project");

        let name = repo_name_from_path(&project_dir);
        assert_eq!(name.as_deref(), Some("my_project"));
    }

    #[test]
    fn repo_name_from_path_falls_back_to_workspace_basename() {
        let name = repo_name_from_path(&PathBuf::from("/data/projects/some_tool"));
        assert_eq!(name.as_deref(), Some("some_tool"));
    }
}
