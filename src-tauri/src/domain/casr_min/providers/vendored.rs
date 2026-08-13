//! Path discovery and read delegation for providers whose parsers live in the
//! vendored CASR crate.
//!
//! These providers deliberately have no hand-written `casr_min` reader. CASR
//! already ships a maintained implementation for each of them, and a second
//! parser would only drift. What `casr_min` still needs to own is path
//! matching: the scanner classifies every candidate file by path alone and
//! cannot afford to build the CASR registry per file.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use casr::discovery::ProviderRegistry;

use crate::domain::casr_min::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};

/// Shared CASR registry. Building it boxes every provider, so it is created
/// once and reused across reads.
pub fn registry() -> &'static ProviderRegistry {
    static REGISTRY: OnceLock<ProviderRegistry> = OnceLock::new();
    REGISTRY.get_or_init(ProviderRegistry::default_registry)
}

pub fn session_roots(slug: &str) -> Vec<PathBuf> {
    let Some(provider) = registry().find_by_slug(slug) else {
        return Vec::new();
    };
    provider.session_roots().into_iter().filter(|root| root.is_dir()).collect()
}

pub fn read_session(slug: &str, path: &Path) -> Result<CanonicalSession, String> {
    let provider = registry().find_by_slug(slug).ok_or_else(|| format!("CASR provider not registered: {slug}"))?;
    provider.read_session(path).map(canonical_from_casr).map_err(|error| format!("failed to read {} session {}: {error}", slug, path.display()))
}

pub fn resume_command(slug: &str, session_id: &str) -> String {
    registry().find_by_slug(slug).map(|provider| provider.resume_command(session_id)).unwrap_or_default()
}

/// Convert a CASR canonical session into the `casr_min` mirror of the same
/// shape. The two models are field-for-field identical; they stay separate so
/// `casr_min` does not leak CASR types into the rest of the app.
pub fn canonical_from_casr(session: casr::model::CanonicalSession) -> CanonicalSession {
    CanonicalSession {
        session_id: session.session_id,
        provider_slug: session.provider_slug,
        workspace: session.workspace,
        title: session.title,
        started_at: session.started_at,
        ended_at: session.ended_at,
        messages: session
            .messages
            .into_iter()
            .map(|message| CanonicalMessage {
                idx: message.idx,
                role: role_from_casr(&message.role),
                content: message.content,
                timestamp: message.timestamp,
                author: message.author,
                tool_calls: message.tool_calls.into_iter().map(|call| ToolCall { id: call.id, name: call.name, arguments: call.arguments }).collect(),
                tool_results: message.tool_results.into_iter().map(|result| ToolResult { call_id: result.call_id, content: result.content, is_error: result.is_error }).collect(),
                extra: message.extra,
            })
            .collect(),
        metadata: session.metadata,
        source_path: session.source_path,
        model_name: session.model_name,
    }
}

pub fn role_from_casr(role: &casr::model::MessageRole) -> MessageRole {
    match role {
        casr::model::MessageRole::User => MessageRole::User,
        casr::model::MessageRole::Assistant => MessageRole::Assistant,
        casr::model::MessageRole::Tool => MessageRole::Tool,
        casr::model::MessageRole::System => MessageRole::System,
        casr::model::MessageRole::Other(other) => MessageRole::Other(other.clone()),
    }
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

pub fn aider_matches_path(path: &Path) -> bool {
    let name = file_name(path);
    // Aider appends to a single markdown transcript per project, so the file
    // name is the only reliable signal — the file lives in the user's repo,
    // not under a provider home.
    if name == ".aider.chat.history.md" {
        return true;
    }
    env_root_matches("AIDER_CHAT_HISTORY_FILE", path) || (env_root_matches("AIDER_HOME", path) && name.ends_with(".md"))
}

pub fn amp_matches_path(path: &Path) -> bool {
    if !has_extension(path, "json") {
        return false;
    }
    let normalized = normalize(path);
    normalized.contains("/amp/threads/") || normalized.contains("/sourcegraph.amp/threads3/") || (env_root_matches("AMP_HOME", path) && normalized.contains("/threads/"))
}

pub fn chatgpt_matches_path(path: &Path) -> bool {
    if !has_extension(path, "json") {
        return false;
    }
    let normalized = normalize(path);
    (normalized.contains("/com.openai.chat/") || env_root_matches("CHATGPT_HOME", path)) && normalized.contains("/conversations")
}

pub fn cline_matches_path(path: &Path) -> bool {
    // Only the API history counts as the session file. `ui_messages.json` is a
    // sibling view of the same task and would double-count in discovery.
    if file_name(path) != "api_conversation_history.json" {
        return false;
    }
    let normalized = normalize(path);
    normalized.contains("/saoudrizwan.claude-dev/tasks/") || (env_root_matches("CLINE_HOME", path) && normalized.contains("/tasks/"))
}

pub fn openclaw_matches_path(path: &Path) -> bool {
    has_extension(path, "jsonl") && (normalize(path).contains("/.openclaw/") || env_root_matches("OPENCLAW_HOME", path))
}

pub fn vibe_matches_path(path: &Path) -> bool {
    has_extension(path, "jsonl") && (normalize(path).contains("/.vibe/logs/session/") || env_root_matches("VIBE_HOME", path))
}

pub fn kiro_matches_path(path: &Path) -> bool {
    // A Kiro session is a `<id>.json` / `<id>.jsonl` / `<id>.history` triplet.
    // Claiming only the journal keeps one session per triplet.
    if !has_extension(path, "jsonl") {
        return false;
    }
    let normalized = normalize(path);
    normalized.contains("/.kiro/sessions/cli/") || (env_root_matches("KIRO_HOME", path) && normalized.contains("/sessions/cli/"))
}

pub fn grok_matches_path(path: &Path) -> bool {
    // Each session directory holds several JSONL streams; `updates.jsonl` is
    // the authoritative one CASR reads.
    if file_name(path) != "updates.jsonl" {
        return false;
    }
    let normalized = normalize(path);
    normalized.contains("/.grok/sessions/") || (env_root_matches("GROK_HOME", path) && normalized.contains("/sessions/"))
}

fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn file_name(path: &Path) -> &str {
    path.file_name().and_then(|name| name.to_str()).unwrap_or_default()
}

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some(extension)
}

/// Whether `path` sits under the directory named by an environment override.
/// Values are cached because the scanner calls this for every candidate file
/// and the process environment does not change at runtime.
fn env_root_matches(var: &'static str, path: &Path) -> bool {
    let Some(root) = env_root(var) else {
        return false;
    };
    normalize(path).contains(root)
}

fn env_root(var: &'static str) -> Option<&'static str> {
    static CACHE: OnceLock<std::collections::HashMap<&'static str, Option<String>>> = OnceLock::new();
    const VARS: [&str; 8] = ["AIDER_HOME", "AIDER_CHAT_HISTORY_FILE", "AMP_HOME", "CHATGPT_HOME", "CLINE_HOME", "OPENCLAW_HOME", "VIBE_HOME", "KIRO_HOME"];

    let cache = CACHE.get_or_init(|| {
        let mut map = std::collections::HashMap::new();
        for name in VARS.into_iter().chain(std::iter::once("GROK_HOME")) {
            let value = std::env::var(name).ok().map(|value| value.trim().replace('\\', "/")).filter(|value| !value.is_empty());
            map.insert(name, value);
        }
        map
    });

    cache.get(var).and_then(|value| value.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_matchers_accept_default_locations() {
        assert!(aider_matches_path(Path::new("/Users/demo/work/.aider.chat.history.md")));
        assert!(amp_matches_path(Path::new("/Users/demo/.local/share/amp/threads/T-1.json")));
        assert!(chatgpt_matches_path(Path::new("/Users/demo/Library/Application Support/com.openai.chat/conversations-v2/c1.json")));
        assert!(cline_matches_path(Path::new("/Users/demo/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/17/api_conversation_history.json")));
        assert!(openclaw_matches_path(Path::new("/Users/demo/.openclaw/agents/openclaw/sessions/s1.jsonl")));
        assert!(vibe_matches_path(Path::new("/Users/demo/.vibe/logs/session/s1/messages.jsonl")));
        assert!(kiro_matches_path(Path::new("/Users/demo/.kiro/sessions/cli/s1.jsonl")));
        assert!(grok_matches_path(Path::new("/Users/demo/.grok/sessions/%2Fwork/s1/updates.jsonl")));
    }

    #[test]
    fn path_matchers_reject_sibling_artifacts() {
        // Only one file per session may claim ownership, otherwise discovery
        // reports the same conversation several times.
        assert!(!kiro_matches_path(Path::new("/Users/demo/.kiro/sessions/cli/s1.json")));
        assert!(!kiro_matches_path(Path::new("/Users/demo/.kiro/sessions/cli/s1.history")));
        assert!(!grok_matches_path(Path::new("/Users/demo/.grok/sessions/%2Fwork/s1/chat_history.jsonl")));
        assert!(!cline_matches_path(Path::new("/Users/demo/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/17/ui_messages.json")));
    }

    #[test]
    fn path_matchers_reject_foreign_paths() {
        assert!(!openclaw_matches_path(Path::new("/Users/demo/.claude/projects/x/s.jsonl")));
        assert!(!vibe_matches_path(Path::new("/Users/demo/.codex/sessions/2026/01/01/rollout-a.jsonl")));
        assert!(!amp_matches_path(Path::new("/Users/demo/.local/share/amp/threads/T-1.txt")));
    }

    #[test]
    fn every_delegated_slug_resolves_in_the_casr_registry() {
        for slug in ["aider", "amp", "chatgpt", "cline", "openclaw", "vibe", "kiro", "grok"] {
            assert!(registry().find_by_slug(slug).is_some(), "CASR registry is missing provider {slug}");
        }
    }
}
