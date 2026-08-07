use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub use crate::domain::casr_min::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult};
use crate::domain::casr_min::providers::ProviderKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionBridgeSource {
    Pi,
    ClaudeCode,
    Codex,
    OpenCode,
    Gemini,
    Factory,
    ClawdBot,
    Cursor,
    Antigravity,
    Omp,
}

impl SessionBridgeSource {
    pub const ALL: [Self; 10] = [Self::Pi, Self::ClaudeCode, Self::Codex, Self::OpenCode, Self::Gemini, Self::Factory, Self::ClawdBot, Self::Cursor, Self::Antigravity, Self::Omp];

    pub fn slug(self) -> &'static str {
        match self {
            Self::Pi => "pi",
            Self::ClaudeCode => "claude_code",
            Self::Codex => "codex",
            Self::OpenCode => "opencode",
            Self::Gemini => "gemini",
            Self::Factory => "factory",
            Self::ClawdBot => "clawdbot",
            Self::Cursor => "cursor",
            Self::Antigravity => "antigravity",
            Self::Omp => "omp",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Pi => "Pi",
            Self::ClaudeCode => "Claude Code",
            Self::Codex => "Codex",
            Self::OpenCode => "OpenCode",
            Self::Gemini => "Gemini CLI",
            Self::Factory => "Factory",
            Self::ClawdBot => "ClawdBot",
            Self::Cursor => "Cursor",
            Self::Antigravity => "Antigravity",
            Self::Omp => "oh-my-pi",
        }
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        match self {
            Self::Pi => crate::paths::pi_agent_sessions_dir().ok().filter(|path| path.is_dir()).map(|path| vec![path]).unwrap_or_default(),
            Self::ClaudeCode => crate::domain::casr_min::providers::claude_code::session_roots(),
            Self::Codex => crate::domain::casr_min::providers::codex::session_roots(),
            Self::Gemini => crate::domain::casr_min::providers::gemini::session_roots(),
            Self::Factory => crate::domain::casr_min::providers::factory::session_roots(),
            Self::ClawdBot => crate::domain::casr_min::providers::clawdbot::session_roots(),
            Self::OpenCode => crate::domain::casr_min::providers::opencode::session_roots(),
            Self::Cursor => crate::domain::casr_min::providers::cursor::session_roots(),
            Self::Antigravity => crate::domain::casr_min::providers::antigravity::session_roots(),
            Self::Omp => crate::domain::casr_min::providers::omp::session_roots(),
        }
    }

    pub fn matches_path(self, path: &Path) -> bool {
        let normalized = path.to_string_lossy().replace('\\', "/");
        match self {
            Self::Pi => crate::paths::pi_agent_sessions_dir().ok().map(|path| path.to_string_lossy().replace('\\', "/")).is_some_and(|root| normalized.contains(&root)),
            Self::ClaudeCode => normalized.contains("/.claude/projects/"),
            Self::Codex => normalized.contains("/.codex/sessions/"),
            Self::Gemini => crate::domain::casr_min::providers::gemini::is_session_file(path),
            Self::Factory => normalized.contains("/.factory/sessions/") && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"),
            Self::ClawdBot => normalized.contains("/.clawdbot/sessions/") && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"),
            Self::OpenCode => path.file_name().and_then(|value| value.to_str()) == Some("opencode.db") || normalized.contains("/.opencode/") || normalized.contains("/opencode.db/"),
            Self::Cursor => crate::domain::casr_min::providers::cursor::matches_path(path),
            Self::Antigravity => crate::domain::casr_min::providers::antigravity::matches_path(path),
            Self::Omp => crate::domain::casr_min::providers::omp::matches_path(path),
        }
    }

    pub fn parse_alias(value: &str) -> Result<Self, String> {
        match value.trim().replace('_', "-").to_ascii_lowercase().as_str() {
            "pi" => Ok(Self::Pi),
            "claude-code" | "claudecode" | "cc" => Ok(Self::ClaudeCode),
            "codex" | "cod" => Ok(Self::Codex),
            "opencode" | "oc" => Ok(Self::OpenCode),
            "gemini" | "gemini-cli" | "gmi" => Ok(Self::Gemini),
            "factory" | "fac" => Ok(Self::Factory),
            "clawdbot" | "clawd-bot" | "cb" => Ok(Self::ClawdBot),
            "cursor" | "cur" => Ok(Self::Cursor),
            "antigravity" | "agy" => Ok(Self::Antigravity),
            "omp" | "oh-my-pi" => Ok(Self::Omp),
            other => Err(format!("Unsupported session provider alias: {other}")),
        }
    }

    pub fn can_scan(self) -> bool {
        true
    }

    pub fn can_convert_target(self) -> bool {
        !matches!(self, Self::Cursor | Self::Antigravity | Self::Omp)
    }
}

impl From<SessionBridgeSource> for ProviderKind {
    fn from(value: SessionBridgeSource) -> Self {
        match value {
            SessionBridgeSource::Pi => ProviderKind::Pi,
            SessionBridgeSource::ClaudeCode => ProviderKind::ClaudeCode,
            SessionBridgeSource::Codex => ProviderKind::Codex,
            SessionBridgeSource::OpenCode => ProviderKind::OpenCode,
            SessionBridgeSource::Gemini => ProviderKind::Gemini,
            SessionBridgeSource::Factory => ProviderKind::Factory,
            SessionBridgeSource::ClawdBot => ProviderKind::ClawdBot,
            SessionBridgeSource::Cursor => ProviderKind::Cursor,
            SessionBridgeSource::Antigravity => ProviderKind::Antigravity,
            SessionBridgeSource::Omp => ProviderKind::Omp,
        }
    }
}

impl From<ProviderKind> for SessionBridgeSource {
    fn from(value: ProviderKind) -> Self {
        match value {
            ProviderKind::Pi => SessionBridgeSource::Pi,
            ProviderKind::ClaudeCode => SessionBridgeSource::ClaudeCode,
            ProviderKind::Codex => SessionBridgeSource::Codex,
            ProviderKind::OpenCode => SessionBridgeSource::OpenCode,
            ProviderKind::Gemini => SessionBridgeSource::Gemini,
            ProviderKind::Factory => SessionBridgeSource::Factory,
            ProviderKind::ClawdBot => SessionBridgeSource::ClawdBot,
            ProviderKind::Cursor => SessionBridgeSource::Cursor,
            ProviderKind::Antigravity => SessionBridgeSource::Antigravity,
            ProviderKind::Omp => SessionBridgeSource::Omp,
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
