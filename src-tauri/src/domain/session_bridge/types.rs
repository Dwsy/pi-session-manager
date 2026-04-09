use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub use crate::domain::casr_min::model::{
    CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult,
};
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
}

impl SessionBridgeSource {
    pub const ALL: [Self; 7] = [
        Self::Pi,
        Self::ClaudeCode,
        Self::Codex,
        Self::OpenCode,
        Self::Gemini,
        Self::Factory,
        Self::ClawdBot,
    ];

    pub fn slug(self) -> &'static str {
        match self {
            Self::Pi => "pi",
            Self::ClaudeCode => "claude_code",
            Self::Codex => "codex",
            Self::OpenCode => "opencode",
            Self::Gemini => "gemini",
            Self::Factory => "factory",
            Self::ClawdBot => "clawdbot",
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
        }
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        match self {
            Self::Pi => dirs::home_dir()
                .map(|home| home.join(".pi").join("agent").join("sessions"))
                .filter(|path| path.is_dir())
                .map(|path| vec![path])
                .unwrap_or_default(),
            Self::ClaudeCode => dirs::home_dir()
                .map(|home| home.join(".claude").join("projects"))
                .filter(|path| path.is_dir())
                .map(|path| vec![path])
                .unwrap_or_default(),
            Self::Codex => dirs::home_dir()
                .map(|home| home.join(".codex").join("sessions"))
                .filter(|path| path.is_dir())
                .map(|path| vec![path])
                .unwrap_or_default(),
            Self::Gemini => crate::domain::casr_min::providers::gemini::session_roots(),
            Self::Factory => {
                let root = if let Ok(home) = std::env::var("FACTORY_HOME") {
                    PathBuf::from(home)
                } else {
                    dirs::home_dir()
                        .unwrap_or_default()
                        .join(".factory")
                        .join("sessions")
                };
                root.is_dir().then_some(vec![root]).unwrap_or_default()
            }
            Self::ClawdBot => {
                let root = if let Ok(home) = std::env::var("CLAWDBOT_HOME") {
                    PathBuf::from(home)
                } else {
                    dirs::home_dir()
                        .unwrap_or_default()
                        .join(".clawdbot")
                        .join("sessions")
                };
                root.is_dir().then_some(vec![root]).unwrap_or_default()
            }
            Self::OpenCode => crate::domain::casr_min::providers::opencode::session_roots(),
        }
    }

    pub fn matches_path(self, path: &Path) -> bool {
        let normalized = path.to_string_lossy().replace('\\', "/");
        match self {
            Self::Pi => normalized.contains("/.pi/agent/sessions/"),
            Self::ClaudeCode => normalized.contains("/.claude/projects/"),
            Self::Codex => normalized.contains("/.codex/sessions/"),
            Self::Gemini => crate::domain::casr_min::providers::gemini::is_session_file(path),
            Self::Factory => {
                normalized.contains("/.factory/sessions/")
                    && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl")
            }
            Self::ClawdBot => {
                normalized.contains("/.clawdbot/sessions/")
                    && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl")
            }
            Self::OpenCode => {
                path.file_name().and_then(|value| value.to_str()) == Some("opencode.db")
                    || normalized.contains("/.opencode/")
                    || normalized.contains("/opencode.db/")
            }
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
            other => Err(format!("Unsupported session provider alias: {other}")),
        }
    }

    pub fn can_scan(self) -> bool {
        true
    }

    pub fn can_convert_target(self) -> bool {
        true
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

pub(crate) fn map_read_result(
    (provider, canonical): (ProviderKind, CanonicalSession),
) -> (SessionBridgeSource, CanonicalSession) {
    (provider.into(), canonical)
}
