//! Actionable typed errors for casr.
//!
//! Each error variant includes enough context for the user to understand
//! what went wrong and what to do next. Internal propagation uses `anyhow`;
//! the public API exposes these `thiserror` types.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A candidate match returned when a session ID is ambiguous.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    /// Provider slug (e.g. `"claude-code"`).
    pub provider: String,
    /// Resolved path to the session file.
    pub path: PathBuf,
}

/// Errors that casr surfaces to the user.
///
/// Every variant carries enough context to render an actionable message
/// *and* to serialize as a stable JSON `error_type` string.
#[derive(Debug, thiserror::Error)]
pub enum CasrError {
    /// Session ID not found in any installed provider.
    #[error(
        "Session '{session_id}' not found. Checked: {providers_checked:?} ({sessions_scanned} sessions scanned). Run 'casr list' to see all sessions."
    )]
    SessionNotFound {
        session_id: String,
        providers_checked: Vec<String>,
        sessions_scanned: usize,
    },

    /// Session ID matched in multiple providers — user must disambiguate.
    #[error(
        "Session '{session_id}' found in multiple providers: {}. Use --source <alias> to choose.",
        candidates.iter().map(|c| c.provider.as_str()).collect::<Vec<_>>().join(", ")
    )]
    AmbiguousSessionId {
        session_id: String,
        candidates: Vec<Candidate>,
    },

    /// Unknown provider alias in CLI input.
    #[error("Unknown provider alias '{alias}'. Known aliases: {}", known_aliases.join(", "))]
    UnknownProviderAlias {
        alias: String,
        known_aliases: Vec<String>,
    },

    /// Provider cannot perform the requested operation.
    ///
    /// Reasons distinguish: binary missing, no readable roots, no writable
    /// roots, permission denied. A missing binary is only a hard error for
    /// `resume` (the target must be launchable); reads/writes may still work
    /// if roots exist.
    #[error("{provider}: {reason}")]
    ProviderUnavailable {
        provider: String,
        reason: String,
        evidence: Vec<String>,
    },

    /// Failed to parse a session from its native format.
    #[error("Failed to read {provider} session at {}: {detail}", path.display())]
    SessionReadError {
        path: PathBuf,
        provider: String,
        detail: String,
    },

    /// Failed to write a converted session to disk.
    #[error("Failed to write {provider} session to {}: {detail}", path.display())]
    SessionWriteError {
        path: PathBuf,
        provider: String,
        detail: String,
    },

    /// Target session file already exists and `--force` was not supplied.
    #[error(
        "Session already exists at {}. Use --force to overwrite (creates .bak backup).",
        existing_path.display()
    )]
    SessionConflict {
        session_id: String,
        existing_path: PathBuf,
    },

    /// Canonical session failed validation checks.
    ///
    /// `errors` are fatal (pipeline stops); `warnings` and `info` are
    /// surfaced in UX/JSON output but don't block conversion.
    #[error("Session validation failed: {}", errors.join("; "))]
    ValidationError {
        errors: Vec<String>,
        warnings: Vec<String>,
        info: Vec<String>,
    },

    /// Read-back verification failed after writing — this is a casr bug.
    #[error(
        "Written file(s) could not be read back ({provider}). This is a bug in casr. Detail: {detail}"
    )]
    VerifyFailed {
        provider: String,
        written_paths: Vec<PathBuf>,
        detail: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_not_found_display() {
        let err = CasrError::SessionNotFound {
            session_id: "abc-123".to_string(),
            providers_checked: vec!["claude-code".to_string(), "codex".to_string()],
            sessions_scanned: 42,
        };
        let msg = err.to_string();
        assert!(msg.contains("abc-123"), "should contain session id");
        assert!(msg.contains("42 sessions scanned"), "should contain count");
        assert!(msg.contains("casr list"), "should suggest casr list");
    }

    #[test]
    fn ambiguous_session_id_display() {
        let err = CasrError::AmbiguousSessionId {
            session_id: "shared-id".to_string(),
            candidates: vec![
                Candidate {
                    provider: "claude-code".to_string(),
                    path: PathBuf::from("/home/.claude/session.jsonl"),
                },
                Candidate {
                    provider: "codex".to_string(),
                    path: PathBuf::from("/home/.codex/session.jsonl"),
                },
            ],
        };
        let msg = err.to_string();
        assert!(msg.contains("shared-id"));
        assert!(msg.contains("claude-code"));
        assert!(msg.contains("codex"));
        assert!(msg.contains("--source"));
    }

    #[test]
    fn unknown_provider_alias_display() {
        let err = CasrError::UnknownProviderAlias {
            alias: "xyz".to_string(),
            known_aliases: vec!["cc".to_string(), "cod".to_string(), "gmi".to_string()],
        };
        let msg = err.to_string();
        assert!(msg.contains("xyz"));
        assert!(msg.contains("cc"));
        assert!(msg.contains("cod"));
        assert!(msg.contains("gmi"));
    }

    #[test]
    fn provider_unavailable_display() {
        let err = CasrError::ProviderUnavailable {
            provider: "gemini".to_string(),
            reason: "binary not found in PATH".to_string(),
            evidence: vec!["which gemini: not found".to_string()],
        };
        let msg = err.to_string();
        assert!(msg.contains("gemini"));
        assert!(msg.contains("binary not found"));
    }

    #[test]
    fn session_read_error_display() {
        let err = CasrError::SessionReadError {
            path: PathBuf::from("/home/.codex/session.jsonl"),
            provider: "codex".to_string(),
            detail: "invalid JSON at line 5".to_string(),
        };
        let msg = err.to_string();
        assert!(msg.contains("codex"));
        assert!(msg.contains("session.jsonl"));
        assert!(msg.contains("invalid JSON at line 5"));
    }

    #[test]
    fn session_write_error_display() {
        let err = CasrError::SessionWriteError {
            path: PathBuf::from("/home/.claude/output.jsonl"),
            provider: "claude-code".to_string(),
            detail: "permission denied".to_string(),
        };
        let msg = err.to_string();
        assert!(msg.contains("claude-code"));
        assert!(msg.contains("output.jsonl"));
        assert!(msg.contains("permission denied"));
    }

    #[test]
    fn session_conflict_display() {
        let err = CasrError::SessionConflict {
            session_id: "existing-id".to_string(),
            existing_path: PathBuf::from("/home/.claude/existing.jsonl"),
        };
        let msg = err.to_string();
        assert!(msg.contains("existing.jsonl"));
        assert!(msg.contains("--force"));
        assert!(msg.contains(".bak"));
    }

    #[test]
    fn validation_error_display() {
        let err = CasrError::ValidationError {
            errors: vec!["no messages".to_string(), "missing user role".to_string()],
            warnings: vec!["missing workspace".to_string()],
            info: vec!["tool calls present".to_string()],
        };
        let msg = err.to_string();
        assert!(msg.contains("no messages"));
        assert!(msg.contains("missing user role"));
        // Warnings and info are not in the Display output, only errors.
        assert!(
            !msg.contains("missing workspace"),
            "Display should only show errors, not warnings"
        );
    }

    #[test]
    fn verify_failed_display() {
        let err = CasrError::VerifyFailed {
            provider: "gemini".to_string(),
            written_paths: vec![PathBuf::from("/tmp/session.json")],
            detail: "message count mismatch: expected 10, got 8".to_string(),
        };
        let msg = err.to_string();
        assert!(msg.contains("gemini"));
        assert!(msg.contains("bug in casr"));
        assert!(msg.contains("message count mismatch"));
    }
}
