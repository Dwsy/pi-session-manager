use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub use crate::domain::casr_min::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};
use crate::domain::casr_min::providers::ProviderKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionBridgeSource {
    Pi,
    Omp,
    ClaudeCode,
    Codex,
    OpenCode,
    Gemini,
    Factory,
    ClawdBot,
    Cursor,
    Antigravity,
}

impl SessionBridgeSource {
    pub const ALL: [Self; 10] = [Self::Pi, Self::Omp, Self::ClaudeCode, Self::Codex, Self::OpenCode, Self::Gemini, Self::Factory, Self::ClawdBot, Self::Cursor, Self::Antigravity];

    pub fn slug(self) -> &'static str {
        match self {
            Self::Pi => "pi",
            Self::Omp => "omp",
            Self::ClaudeCode => "claude_code",
            Self::Codex => "codex",
            Self::OpenCode => "opencode",
            Self::Gemini => "gemini",
            Self::Factory => "factory",
            Self::ClawdBot => "clawdbot",
            Self::Cursor => "cursor",
            Self::Antigravity => "antigravity",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Pi => "Pi",
            Self::Omp => "OMP",
            Self::ClaudeCode => "Claude Code",
            Self::Codex => "Codex",
            Self::OpenCode => "OpenCode",
            Self::Gemini => "Gemini CLI",
            Self::Factory => "Factory",
            Self::ClawdBot => "ClawdBot",
            Self::Cursor => "Cursor",
            Self::Antigravity => "Antigravity",
        }
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        ProviderKind::from(self).session_roots()
    }

    pub fn session_roots_for_home(self, home: &Path) -> Vec<PathBuf> {
        ProviderKind::from(self).session_roots_for_home(home)
    }

    pub fn matches_path(self, path: &Path) -> bool {
        let normalized = path.to_string_lossy().replace('\\', "/");
        match self {
            Self::Pi => normalized.contains("/.pi/agent/sessions/"),
            Self::Omp => normalized.contains("/.omp/agent/sessions/"),
            Self::ClaudeCode => normalized.contains("/.claude/projects/"),
            Self::Codex => normalized.contains("/.codex/sessions/"),
            Self::Gemini => crate::domain::casr_min::providers::gemini::is_session_file(path),
            Self::Factory => normalized.contains("/.factory/sessions/") && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"),
            Self::ClawdBot => normalized.contains("/.clawdbot/sessions/") && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"),
            Self::OpenCode => path.file_name().and_then(|value| value.to_str()) == Some("opencode.db") || normalized.contains("/.opencode/") || normalized.contains("/opencode.db/"),
            Self::Cursor => crate::domain::casr_min::providers::cursor::matches_path(path),
            Self::Antigravity => crate::domain::casr_min::providers::antigravity::matches_path(path),
        }
    }

    pub fn parse_alias(value: &str) -> Result<Self, String> {
        match value.trim().replace('_', "-").to_ascii_lowercase().as_str() {
            "pi" => Ok(Self::Pi),
            "omp" | "oh-my-pi" => Ok(Self::Omp),
            "claude-code" | "claudecode" | "cc" => Ok(Self::ClaudeCode),
            "codex" | "cod" => Ok(Self::Codex),
            "opencode" | "oc" => Ok(Self::OpenCode),
            "gemini" | "gemini-cli" | "gmi" => Ok(Self::Gemini),
            "factory" | "fac" => Ok(Self::Factory),
            "clawdbot" | "clawd-bot" | "cb" => Ok(Self::ClawdBot),
            "cursor" | "cur" => Ok(Self::Cursor),
            "antigravity" | "agy" => Ok(Self::Antigravity),
            other => Err(format!("Unsupported session provider alias: {other}")),
        }
    }

    pub fn can_scan(self) -> bool {
        true
    }

    pub fn can_convert_target(self) -> bool {
        !matches!(self, Self::Cursor | Self::Antigravity)
    }
}

impl From<SessionBridgeSource> for ProviderKind {
    fn from(value: SessionBridgeSource) -> Self {
        match value {
            SessionBridgeSource::Pi => ProviderKind::Pi,
            SessionBridgeSource::Omp => ProviderKind::Omp,
            SessionBridgeSource::ClaudeCode => ProviderKind::ClaudeCode,
            SessionBridgeSource::Codex => ProviderKind::Codex,
            SessionBridgeSource::OpenCode => ProviderKind::OpenCode,
            SessionBridgeSource::Gemini => ProviderKind::Gemini,
            SessionBridgeSource::Factory => ProviderKind::Factory,
            SessionBridgeSource::ClawdBot => ProviderKind::ClawdBot,
            SessionBridgeSource::Cursor => ProviderKind::Cursor,
            SessionBridgeSource::Antigravity => ProviderKind::Antigravity,
        }
    }
}

impl From<ProviderKind> for SessionBridgeSource {
    fn from(value: ProviderKind) -> Self {
        match value {
            ProviderKind::Pi => SessionBridgeSource::Pi,
            ProviderKind::Omp => SessionBridgeSource::Omp,
            ProviderKind::ClaudeCode => SessionBridgeSource::ClaudeCode,
            ProviderKind::Codex => SessionBridgeSource::Codex,
            ProviderKind::OpenCode => SessionBridgeSource::OpenCode,
            ProviderKind::Gemini => SessionBridgeSource::Gemini,
            ProviderKind::Factory => SessionBridgeSource::Factory,
            ProviderKind::ClawdBot => SessionBridgeSource::ClawdBot,
            ProviderKind::Cursor => SessionBridgeSource::Cursor,
            ProviderKind::Antigravity => SessionBridgeSource::Antigravity,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "snake_case")]
pub struct SessionBridgeConvertOptions {
    pub dry_run: bool,
    pub force: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionBridgeConvertResult {
    pub source_provider: String,
    pub target_provider: String,
    pub source_session_id: String,
    pub target_session_id: String,
    pub written_paths: Vec<String>,
    pub resume_command: String,
    pub dry_run: bool,
    pub warnings: Vec<String>,
}

pub(crate) fn map_read_result((provider, canonical): (ProviderKind, CanonicalSession)) -> (SessionBridgeSource, CanonicalSession) {
    (provider.into(), canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn omp_matches_wsl_unc_session_path() {
        let path = Path::new(r"\\wsl.localhost\Ubuntu\home\demo\.omp\agent\sessions\project\session.jsonl");
        assert!(SessionBridgeSource::Omp.matches_path(path));
        assert!(!SessionBridgeSource::Pi.matches_path(path));
    }

    #[test]
    fn omp_roots_are_resolved_from_supplied_runtime_home() {
        let temp = tempfile::tempdir().expect("tempdir");
        let sessions = temp.path().join(".omp").join("agent").join("sessions");
        std::fs::create_dir_all(&sessions).expect("create OMP sessions");

        assert_eq!(SessionBridgeSource::Omp.session_roots_for_home(temp.path()), vec![sessions]);
    }
}
