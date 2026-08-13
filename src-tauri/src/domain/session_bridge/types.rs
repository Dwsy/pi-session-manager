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
    Aider,
    Amp,
    ChatGpt,
    Cline,
    OpenClaw,
    Vibe,
    Kiro,
    Grok,
}

impl SessionBridgeSource {
    pub const ALL: [Self; 18] = [Self::Pi, Self::Omp, Self::ClaudeCode, Self::Codex, Self::OpenCode, Self::Gemini, Self::Factory, Self::ClawdBot, Self::Cursor, Self::Antigravity, Self::Aider, Self::Amp, Self::ChatGpt, Self::Cline, Self::OpenClaw, Self::Vibe, Self::Kiro, Self::Grok];

    pub fn slug(self) -> &'static str {
        ProviderKind::from(self).slug()
    }

    pub fn display_name(self) -> &'static str {
        ProviderKind::from(self).display_name()
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        match self {
            Self::Pi => crate::paths::pi_agent_sessions_dir().ok().filter(|path| path.is_dir()).map(|path| vec![path]).unwrap_or_default(),
            Self::Omp => crate::paths::omp_agent_sessions_dir().ok().filter(|path| path.is_dir()).map(|path| vec![path]).unwrap_or_default(),
            other => ProviderKind::from(other).session_roots(),
        }
    }

    pub fn matches_path(self, path: &Path) -> bool {
        ProviderKind::from(self).matches_path(path)
    }

    pub fn parse_alias(value: &str) -> Result<Self, String> {
        ProviderKind::parse_alias(value).map(Self::from).map_err(|_| format!("Unsupported session provider alias: {value}"))
    }

    pub fn can_scan(self) -> bool {
        ProviderKind::from(self).can_scan()
    }

    pub fn can_convert_target(self) -> bool {
        ProviderKind::from(self).can_convert_target()
    }

    /// Whether conversion to this provider is performed entirely by the
    /// vendored CASR writer, including dry runs.
    pub fn is_vendor_delegated(self) -> bool {
        ProviderKind::from(self).is_vendor_delegated()
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
            SessionBridgeSource::Aider => ProviderKind::Aider,
            SessionBridgeSource::Amp => ProviderKind::Amp,
            SessionBridgeSource::ChatGpt => ProviderKind::ChatGpt,
            SessionBridgeSource::Cline => ProviderKind::Cline,
            SessionBridgeSource::OpenClaw => ProviderKind::OpenClaw,
            SessionBridgeSource::Vibe => ProviderKind::Vibe,
            SessionBridgeSource::Kiro => ProviderKind::Kiro,
            SessionBridgeSource::Grok => ProviderKind::Grok,
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
            ProviderKind::Aider => SessionBridgeSource::Aider,
            ProviderKind::Amp => SessionBridgeSource::Amp,
            ProviderKind::ChatGpt => SessionBridgeSource::ChatGpt,
            ProviderKind::Cline => SessionBridgeSource::Cline,
            ProviderKind::OpenClaw => SessionBridgeSource::OpenClaw,
            ProviderKind::Vibe => SessionBridgeSource::Vibe,
            ProviderKind::Kiro => SessionBridgeSource::Kiro,
            ProviderKind::Grok => SessionBridgeSource::Grok,
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
