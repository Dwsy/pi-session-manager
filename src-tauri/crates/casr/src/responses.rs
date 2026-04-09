//! Typed JSON response structs for all machine-readable CLI outputs.
//!
//! Every `--json` subcommand serializes one of these structs. Using concrete
//! `#[derive(Serialize)]` types instead of ad-hoc `serde_json::json!` objects
//! guarantees that field names, types, and `schema_version` are consistent
//! across the codebase and testable at compile time.

use std::path::PathBuf;

use serde::Serialize;

/// Current schema version for all JSON envelopes and per-record outputs.
///
/// Bump this when adding/removing/renaming fields in any response struct.
pub const SCHEMA_VERSION: u32 = 2;

// ---------------------------------------------------------------------------
// `list --json`
// ---------------------------------------------------------------------------

/// Versioned envelope wrapping `list --json` output.
#[derive(Debug, Clone, Serialize)]
pub struct ListEnvelope {
    pub schema_version: u32,
    pub items: Vec<ListItem>,
}

impl ListEnvelope {
    pub fn new(items: Vec<ListItem>) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            items,
        }
    }
}

/// A single session entry in `list --json` output.
#[derive(Debug, Clone, Serialize)]
pub struct ListItem {
    pub schema_version: u32,
    pub session_id: String,
    pub provider: String,
    pub title: Option<String>,
    pub messages: usize,
    pub workspace: Option<String>,
    pub started_at: Option<i64>,
    pub last_active_at: Option<i64>,
    pub file_size_bytes: u64,
    pub file_size_kb: u64,
    pub unique_user_messages: usize,
    pub avg_agent_response_chars: f64,
    pub avg_agent_response_chars_rounded: u64,
    pub tool_uses: usize,
    pub path: String,
    /// Workspace name derived from session metadata (directory basename or title).
    pub workspace_name: Option<String>,
    /// How `workspace_name` was determined.
    pub workspace_name_source: Option<String>,
    /// Repository name from filesystem git root (only when `--enrich-fs` is set).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_name: Option<String>,
}

// ---------------------------------------------------------------------------
// `info --json`
// ---------------------------------------------------------------------------

/// Response struct for `info --json`.
#[derive(Debug, Clone, Serialize)]
pub struct InfoResponse {
    pub schema_version: u32,
    pub session_id: String,
    pub provider: String,
    pub title: Option<String>,
    pub workspace: Option<String>,
    pub messages: usize,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub model_name: Option<String>,
    pub source_path: String,
    pub metadata: serde_json::Value,
    /// Workspace name derived from session metadata (directory basename or title).
    pub workspace_name: Option<String>,
    /// How `workspace_name` was determined.
    pub workspace_name_source: Option<String>,
    /// Repository name from filesystem git root (only when `--enrich-fs` is set).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_name: Option<String>,
}

// ---------------------------------------------------------------------------
// `providers --json`
// ---------------------------------------------------------------------------

/// A single provider entry in `providers --json`.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    pub name: String,
    pub slug: String,
    pub alias: String,
    pub installed: bool,
    pub version: Option<String>,
    pub evidence: Vec<String>,
}

// ---------------------------------------------------------------------------
// `resume --json` (success)
// ---------------------------------------------------------------------------

/// Response struct for a successful `resume --json` (including dry-run).
#[derive(Debug, Clone, Serialize)]
pub struct ResumeSuccess {
    pub ok: bool,
    pub source_provider: String,
    pub target_provider: String,
    pub source_session_id: String,
    pub target_session_id: Option<String>,
    pub written_paths: Option<Vec<String>>,
    pub resume_command: Option<String>,
    pub dry_run: bool,
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

/// JSON envelope for error responses.
#[derive(Debug, Clone, Serialize)]
pub struct ErrorEnvelope {
    pub ok: bool,
    pub error_type: String,
    pub message: String,
}

impl ErrorEnvelope {
    pub fn new(error_type: &str, message: String) -> Self {
        Self {
            ok: false,
            error_type: error_type.to_string(),
            message,
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace name derivation
// ---------------------------------------------------------------------------

/// Source description for how `workspace_name` was resolved.
pub const WS_NAME_SOURCE_SESSION_PATH: &str = "session_workspace_path";
pub const WS_NAME_SOURCE_NONE: &str = "none";

/// Derive a human-readable workspace name from a workspace path.
///
/// Returns the last component of the path (the directory name) as the name,
/// along with the source tag describing how it was derived.
pub fn workspace_name_from_path(workspace: Option<&PathBuf>) -> (Option<String>, Option<String>) {
    match workspace {
        Some(ws) => {
            let name = ws
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string());
            if name.is_some() {
                (name, Some(WS_NAME_SOURCE_SESSION_PATH.to_string()))
            } else {
                (None, Some(WS_NAME_SOURCE_NONE.to_string()))
            }
        }
        None => (None, Some(WS_NAME_SOURCE_NONE.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Schema version is consistent
    // -----------------------------------------------------------------------

    #[test]
    fn schema_version_is_2() {
        assert_eq!(SCHEMA_VERSION, 2);
    }

    // -----------------------------------------------------------------------
    // ListEnvelope serialization
    // -----------------------------------------------------------------------

    #[test]
    fn list_envelope_empty_items_serializes() {
        let envelope = ListEnvelope::new(vec![]);
        let json = serde_json::to_value(&envelope).unwrap();
        assert_eq!(json["schema_version"], 2);
        assert!(json["items"].as_array().unwrap().is_empty());
    }

    #[test]
    fn list_envelope_with_items_serializes() {
        let item = ListItem {
            schema_version: SCHEMA_VERSION,
            session_id: "sid-1".to_string(),
            provider: "claude-code".to_string(),
            title: Some("Test".to_string()),
            messages: 10,
            workspace: Some("/data/projects/test".to_string()),
            started_at: Some(1_700_000_000_000),
            last_active_at: Some(1_700_001_000_000),
            file_size_bytes: 4096,
            file_size_kb: 4,
            unique_user_messages: 3,
            avg_agent_response_chars: 500.5,
            avg_agent_response_chars_rounded: 501,
            tool_uses: 7,
            path: "/tmp/session.jsonl".to_string(),
            workspace_name: Some("test".to_string()),
            workspace_name_source: Some("session_workspace_path".to_string()),
            repo_name: None,
        };
        let envelope = ListEnvelope::new(vec![item]);
        let json = serde_json::to_value(&envelope).unwrap();
        assert_eq!(json["schema_version"], 2);
        assert_eq!(json["items"].as_array().unwrap().len(), 1);
        let first = &json["items"][0];
        assert_eq!(first["schema_version"], 2);
        assert_eq!(first["session_id"], "sid-1");
        assert_eq!(first["provider"], "claude-code");
        assert_eq!(first["messages"], 10);
        assert_eq!(first["workspace_name"], "test");
        assert_eq!(first["workspace_name_source"], "session_workspace_path");
    }

    // -----------------------------------------------------------------------
    // InfoResponse serialization
    // -----------------------------------------------------------------------

    #[test]
    fn info_response_serializes_all_fields() {
        let info = InfoResponse {
            schema_version: SCHEMA_VERSION,
            session_id: "sid-info".to_string(),
            provider: "codex".to_string(),
            title: None,
            workspace: None,
            messages: 5,
            started_at: None,
            ended_at: None,
            model_name: Some("gpt-4".to_string()),
            source_path: "/tmp/session.jsonl".to_string(),
            metadata: serde_json::json!({"key": "value"}),
            workspace_name: None,
            workspace_name_source: Some("none".to_string()),
            repo_name: None,
        };
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["schema_version"], 2);
        assert_eq!(json["session_id"], "sid-info");
        assert_eq!(json["provider"], "codex");
        assert!(json["title"].is_null());
        assert!(json["workspace"].is_null());
        assert_eq!(json["messages"], 5);
        assert_eq!(json["model_name"], "gpt-4");
        assert!(json["workspace_name"].is_null());
        assert_eq!(json["workspace_name_source"], "none");
    }

    // -----------------------------------------------------------------------
    // ProviderInfo serialization
    // -----------------------------------------------------------------------

    #[test]
    fn provider_info_serializes() {
        let pi = ProviderInfo {
            name: "Claude Code".to_string(),
            slug: "claude-code".to_string(),
            alias: "cc".to_string(),
            installed: true,
            version: Some("1.0".to_string()),
            evidence: vec!["found binary".to_string()],
        };
        let json = serde_json::to_value(&pi).unwrap();
        assert_eq!(json["name"], "Claude Code");
        assert_eq!(json["slug"], "claude-code");
        assert_eq!(json["alias"], "cc");
        assert_eq!(json["installed"], true);
        assert_eq!(json["version"], "1.0");
        assert_eq!(json["evidence"][0], "found binary");
    }

    // -----------------------------------------------------------------------
    // ResumeSuccess serialization
    // -----------------------------------------------------------------------

    #[test]
    fn resume_success_dry_run_serializes() {
        let rs = ResumeSuccess {
            ok: true,
            source_provider: "claude-code".to_string(),
            target_provider: "codex".to_string(),
            source_session_id: "sid-src".to_string(),
            target_session_id: None,
            written_paths: None,
            resume_command: None,
            dry_run: true,
            warnings: vec![],
        };
        let json = serde_json::to_value(&rs).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["dry_run"], true);
        assert!(json["target_session_id"].is_null());
        assert!(json["written_paths"].is_null());
        assert!(json["resume_command"].is_null());
    }

    #[test]
    fn resume_success_actual_write_serializes() {
        let rs = ResumeSuccess {
            ok: true,
            source_provider: "codex".to_string(),
            target_provider: "claude-code".to_string(),
            source_session_id: "sid-src".to_string(),
            target_session_id: Some("sid-tgt".to_string()),
            written_paths: Some(vec!["/tmp/written.jsonl".to_string()]),
            resume_command: Some("claude --resume sid-tgt".to_string()),
            dry_run: false,
            warnings: vec!["missing workspace".to_string()],
        };
        let json = serde_json::to_value(&rs).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["dry_run"], false);
        assert_eq!(json["target_session_id"], "sid-tgt");
        assert_eq!(json["written_paths"][0], "/tmp/written.jsonl");
        assert_eq!(json["resume_command"], "claude --resume sid-tgt");
        assert_eq!(json["warnings"][0], "missing workspace");
    }

    // -----------------------------------------------------------------------
    // ErrorEnvelope serialization
    // -----------------------------------------------------------------------

    #[test]
    fn list_item_repo_name_omitted_when_none() {
        let item = ListItem {
            schema_version: SCHEMA_VERSION,
            session_id: "sid".to_string(),
            provider: "test".to_string(),
            title: None,
            messages: 0,
            workspace: None,
            started_at: None,
            last_active_at: None,
            file_size_bytes: 0,
            file_size_kb: 0,
            unique_user_messages: 0,
            avg_agent_response_chars: 0.0,
            avg_agent_response_chars_rounded: 0,
            tool_uses: 0,
            path: "/tmp/x".to_string(),
            workspace_name: None,
            workspace_name_source: Some("none".to_string()),
            repo_name: None,
        };
        let json = serde_json::to_value(&item).unwrap();
        assert!(
            !json.as_object().unwrap().contains_key("repo_name"),
            "repo_name should be omitted from JSON when None"
        );
    }

    #[test]
    fn list_item_repo_name_present_when_set() {
        let item = ListItem {
            schema_version: SCHEMA_VERSION,
            session_id: "sid".to_string(),
            provider: "test".to_string(),
            title: None,
            messages: 0,
            workspace: Some("/data/projects/my_repo".to_string()),
            started_at: None,
            last_active_at: None,
            file_size_bytes: 0,
            file_size_kb: 0,
            unique_user_messages: 0,
            avg_agent_response_chars: 0.0,
            avg_agent_response_chars_rounded: 0,
            tool_uses: 0,
            path: "/tmp/x".to_string(),
            workspace_name: Some("my_repo".to_string()),
            workspace_name_source: Some("session_workspace_path".to_string()),
            repo_name: Some("my_repo".to_string()),
        };
        let json = serde_json::to_value(&item).unwrap();
        assert_eq!(json["repo_name"], "my_repo");
    }

    #[test]
    fn info_response_repo_name_omitted_when_none() {
        let info = InfoResponse {
            schema_version: SCHEMA_VERSION,
            session_id: "sid".to_string(),
            provider: "test".to_string(),
            title: None,
            workspace: None,
            messages: 0,
            started_at: None,
            ended_at: None,
            model_name: None,
            source_path: "/tmp/x".to_string(),
            metadata: serde_json::json!(null),
            workspace_name: None,
            workspace_name_source: Some("none".to_string()),
            repo_name: None,
        };
        let json = serde_json::to_value(&info).unwrap();
        assert!(
            !json.as_object().unwrap().contains_key("repo_name"),
            "repo_name should be omitted from info JSON when None"
        );
    }

    #[test]
    fn error_envelope_serializes() {
        let ee = ErrorEnvelope::new("SessionNotFound", "not found".to_string());
        let json = serde_json::to_value(&ee).unwrap();
        assert_eq!(json["ok"], false);
        assert_eq!(json["error_type"], "SessionNotFound");
        assert_eq!(json["message"], "not found");
    }

    // -----------------------------------------------------------------------
    // workspace_name_from_path
    // -----------------------------------------------------------------------

    #[test]
    fn workspace_name_from_some_path() {
        let ws = PathBuf::from("/data/projects/my_project");
        let (name, source) = workspace_name_from_path(Some(&ws));
        assert_eq!(name.as_deref(), Some("my_project"));
        assert_eq!(source.as_deref(), Some("session_workspace_path"));
    }

    #[test]
    fn workspace_name_from_none() {
        let (name, source) = workspace_name_from_path(None);
        assert!(name.is_none());
        assert_eq!(source.as_deref(), Some("none"));
    }

    #[test]
    fn workspace_name_from_root_path() {
        // Root path "/" has no file_name, so name should be None.
        let ws = PathBuf::from("/");
        let (name, source) = workspace_name_from_path(Some(&ws));
        assert!(name.is_none());
        assert_eq!(source.as_deref(), Some("none"));
    }
}
