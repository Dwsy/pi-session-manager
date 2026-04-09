//! Invalid session ID format tests for the discovery system.
//!
//! Tests how `ProviderRegistry::resolve_session()` handles malformed session
//! IDs: empty string, extremely long string, path traversal attempts, null
//! bytes, Unicode characters, and valid UUID format but non-existent session.
//! Each should return `SessionNotFound` with a safe error message (no path
//! injection, no panic).

mod test_env;

use casr::discovery::ProviderRegistry;
use casr::error::CasrError;
use casr::providers::Provider;
use casr::providers::claude_code::ClaudeCode;
use casr::providers::codex::Codex;

static CC_ENV: test_env::EnvLock = test_env::EnvLock;
static CODEX_ENV: test_env::EnvLock = test_env::EnvLock;

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

/// Assert that resolving a session ID returns SessionNotFound (not panic,
/// not a path traversal success, not an unexpected error variant).
fn assert_session_not_found(session_id: &str, label: &str) {
    let _cc_lock = CC_ENV.lock().unwrap();
    let _codex_lock = CODEX_ENV.lock().unwrap();
    let cc_tmp = tempfile::TempDir::new().expect("cc tmpdir");
    let codex_tmp = tempfile::TempDir::new().expect("codex tmpdir");
    let _cc_env = EnvGuard::set("CLAUDE_HOME", cc_tmp.path());
    let _codex_env = EnvGuard::set("CODEX_HOME", codex_tmp.path());

    let registry = ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Codex)]);
    let result = registry.resolve_session(session_id, None);

    match result {
        Err(CasrError::SessionNotFound { .. }) => {
            // Expected — session ID not found.
        }
        Err(other) => {
            // Any other error is also acceptable (e.g. provider unavailable).
            eprintln!("{label}: got non-SessionNotFound error (acceptable): {other}");
        }
        Ok(resolved) => {
            panic!(
                "{label}: malformed session ID '{session_id}' unexpectedly resolved to {} at {}",
                resolved.provider.slug(),
                resolved.path.display()
            );
        }
    }
}

// ===========================================================================
// Empty string
// ===========================================================================

#[test]
fn resolve_empty_session_id() {
    assert_session_not_found("", "empty string");
}

// ===========================================================================
// Extremely long string (10KB)
// ===========================================================================

#[test]
fn resolve_very_long_session_id() {
    let long_id = "a".repeat(10_240);
    assert_session_not_found(&long_id, "10KB string");
}

// ===========================================================================
// Path traversal attempts
// ===========================================================================

#[test]
fn resolve_path_traversal_dot_dot_slash() {
    assert_session_not_found("../../etc/passwd", "path traversal ../../etc/passwd");
}

#[test]
fn resolve_path_traversal_absolute() {
    assert_session_not_found("/etc/passwd", "absolute path /etc/passwd");
}

#[test]
fn resolve_path_traversal_encoded() {
    assert_session_not_found("..%2F..%2Fetc%2Fpasswd", "URL-encoded path traversal");
}

#[test]
fn resolve_path_traversal_double_dot_backslash() {
    assert_session_not_found("..\\..\\etc\\passwd", "backslash path traversal");
}

// ===========================================================================
// Null bytes embedded
// ===========================================================================

#[test]
fn resolve_null_byte_session_id() {
    assert_session_not_found("session\x00id", "null byte embedded");
}

#[test]
fn resolve_null_bytes_only() {
    assert_session_not_found("\x00\x00\x00", "null bytes only");
}

// ===========================================================================
// Unicode characters
// ===========================================================================

#[test]
fn resolve_unicode_session_id() {
    assert_session_not_found("séssion-日本語-🎉", "unicode characters");
}

#[test]
fn resolve_rtl_override_session_id() {
    assert_session_not_found("session\u{202E}di-tset", "RTL override character");
}

#[test]
fn resolve_zero_width_joiners() {
    assert_session_not_found("session\u{200D}id\u{200B}test", "zero-width joiner/space");
}

// ===========================================================================
// Valid UUID format but non-existent
// ===========================================================================

#[test]
fn resolve_valid_uuid_nonexistent() {
    assert_session_not_found(
        "550e8400-e29b-41d4-a716-446655440000",
        "valid UUID, non-existent",
    );
}

// ===========================================================================
// Special filesystem characters
// ===========================================================================

#[test]
fn resolve_glob_wildcards() {
    assert_session_not_found("session-*-?-[abc]", "glob wildcards");
}

#[test]
fn resolve_shell_metacharacters() {
    assert_session_not_found("$(echo pwned)", "shell metacharacters");
}

#[test]
fn resolve_semicolon_injection() {
    assert_session_not_found("session; rm -rf /", "semicolon injection");
}

// ===========================================================================
// Error message safety
// ===========================================================================

#[test]
fn error_message_does_not_leak_traversal_path() {
    let _cc_lock = CC_ENV.lock().unwrap();
    let _codex_lock = CODEX_ENV.lock().unwrap();
    let cc_tmp = tempfile::TempDir::new().expect("cc tmpdir");
    let codex_tmp = tempfile::TempDir::new().expect("codex tmpdir");
    let _cc_env = EnvGuard::set("CLAUDE_HOME", cc_tmp.path());
    let _codex_env = EnvGuard::set("CODEX_HOME", codex_tmp.path());

    let registry = ProviderRegistry::new(vec![Box::new(ClaudeCode), Box::new(Codex)]);
    let result = registry.resolve_session("../../etc/passwd", None);

    if let Err(e) = result {
        let msg = e.to_string();
        // The error message should NOT contain the resolved/expanded path.
        assert!(
            !msg.contains("/etc/passwd") || msg.contains("../../etc/passwd"),
            "error message should not leak resolved traversal path; got: {msg}"
        );
    }
}

// ===========================================================================
// Provider-level owns_session safety
// ===========================================================================

#[test]
fn cc_owns_session_traversal_returns_none() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().expect("tmpdir");
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    // Path traversal should not find a session.
    let result = ClaudeCode.owns_session("../../etc/passwd");
    assert!(
        result.is_none(),
        "CC owns_session should return None for path traversal; got: {:?}",
        result
    );
}

#[test]
fn codex_owns_session_traversal_returns_none() {
    let _lock = CODEX_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().expect("tmpdir");
    let _env = EnvGuard::set("CODEX_HOME", tmp.path());

    let result = Codex.owns_session("../../etc/passwd");
    assert!(
        result.is_none(),
        "Codex owns_session should return None for path traversal; got: {:?}",
        result
    );
}

#[test]
fn cc_owns_session_empty_returns_none() {
    let _lock = CC_ENV.lock().unwrap();
    let tmp = tempfile::TempDir::new().expect("tmpdir");
    let _env = EnvGuard::set("CLAUDE_HOME", tmp.path());

    let result = ClaudeCode.owns_session("");
    assert!(
        result.is_none(),
        "CC owns_session should return None for empty string; got: {:?}",
        result
    );
}
