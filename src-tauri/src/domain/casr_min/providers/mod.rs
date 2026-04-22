pub mod claude_code;
pub mod clawdbot;
pub mod codex;
pub mod factory;
pub mod gemini;
pub mod opencode;
pub mod pi_agent;

use std::path::{Path, PathBuf};

use crate::domain::casr_min::model::CanonicalSession;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderKind {
    Pi,
    ClaudeCode,
    Codex,
    OpenCode,
    Gemini,
    Factory,
    ClawdBot,
}

impl ProviderKind {
    pub const ALL: [Self; 7] = [Self::Pi, Self::ClaudeCode, Self::Codex, Self::OpenCode, Self::Gemini, Self::Factory, Self::ClawdBot];

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

    pub fn can_scan(self) -> bool {
        true
    }

    pub fn can_convert_target(self) -> bool {
        true
    }

    pub fn parse_alias(value: &str) -> Result<Self, String> {
        let normalized = value.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "pi" | "pi-agent" | "pi_agent" => Ok(Self::Pi),
            "claude" | "claude-code" | "claude_code" | "cc" => Ok(Self::ClaudeCode),
            "codex" | "cod" => Ok(Self::Codex),
            "opencode" | "open-code" | "open_code" | "opc" => Ok(Self::OpenCode),
            "gemini" | "gemini-cli" | "gemini_cli" | "gmi" => Ok(Self::Gemini),
            "factory" | "fac" => Ok(Self::Factory),
            "clawdbot" | "clawd-bot" | "clawd_bot" | "cwb" => Ok(Self::ClawdBot),
            _ => Err(format!("Unsupported target format: {value}")),
        }
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        match self {
            Self::Pi => pi_agent::session_roots(),
            Self::ClaudeCode => claude_code::session_roots(),
            Self::Codex => codex::session_roots(),
            Self::OpenCode => opencode::session_roots(),
            Self::Gemini => gemini::session_roots(),
            Self::Factory => factory::session_roots(),
            Self::ClawdBot => clawdbot::session_roots(),
        }
    }

    pub fn matches_path(self, path: &Path) -> bool {
        let normalized = path.to_string_lossy().replace('\\', "/");
        match self {
            Self::Pi => crate::paths::pi_agent_sessions_dir().ok().map(|path| path.to_string_lossy().replace('\\', "/")).is_some_and(|root| normalized.contains(&root)),
            Self::ClaudeCode => normalized.contains("/.claude/projects/"),
            Self::Codex => normalized.contains("/.codex/sessions/"),
            Self::OpenCode => opencode::matches_path(path),
            Self::Gemini => gemini::matches_path(path),
            Self::Factory => factory::matches_path(path),
            Self::ClawdBot => clawdbot::matches_path(path),
        }
    }

    pub fn read_session(self, path: &Path) -> Result<CanonicalSession, String> {
        match self {
            Self::Pi => pi_agent::read_session(path),
            Self::ClaudeCode => claude_code::read_session(path),
            Self::Codex => codex::read_session(path),
            Self::OpenCode => opencode::read_session(path),
            Self::Gemini => gemini::read_session(path),
            Self::Factory => factory::read_session(path),
            Self::ClawdBot => clawdbot::read_session(path),
        }
    }

    pub fn read_session_from_str(self, path_hint: &Path, content: &str) -> Result<CanonicalSession, String> {
        match self {
            Self::Pi => pi_agent::read_session_from_str(path_hint, content),
            Self::ClaudeCode => claude_code::read_session_from_str(path_hint, content),
            Self::Codex => codex::read_session_from_str(path_hint, content),
            Self::OpenCode => opencode::read_session_from_str(path_hint, content),
            Self::Gemini => gemini::read_session_from_str(path_hint, content),
            Self::Factory => factory::read_session_from_str(path_hint, content),
            Self::ClawdBot => clawdbot::read_session_from_str(path_hint, content),
        }
    }

    pub fn write_preview(self, session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
        match self {
            Self::Pi => pi_agent::render_session(session, target_session_id),
            Self::ClaudeCode => claude_code::render_session(session, target_session_id),
            Self::Codex => codex::render_session(session, target_session_id),
            Self::OpenCode => opencode::render_session(session, target_session_id),
            Self::Gemini => gemini::render_session(session, target_session_id),
            Self::Factory => factory::render_session(session, target_session_id),
            Self::ClawdBot => clawdbot::render_session(session, target_session_id),
        }
    }

    pub fn build_target_path(self, session: &CanonicalSession, target_session_id: &str, now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
        match self {
            Self::Pi => pi_agent::build_target_path(target_session_id, now),
            Self::ClaudeCode => claude_code::build_target_path(session, target_session_id),
            Self::Codex => codex::build_target_path(target_session_id, now),
            Self::OpenCode => opencode::build_target_path(session, target_session_id),
            Self::Gemini => gemini::build_target_path(session, target_session_id, now),
            Self::Factory => factory::build_target_path(session, target_session_id),
            Self::ClawdBot => clawdbot::build_target_path(target_session_id),
        }
    }

    pub fn resume_command(self, target_session_id: &str, target_path: &Path) -> String {
        match self {
            Self::Pi => pi_agent::resume_command(target_path),
            Self::ClaudeCode => claude_code::resume_command(target_session_id),
            Self::Codex => codex::resume_command(target_session_id),
            Self::OpenCode => opencode::resume_command(),
            Self::Gemini => gemini::resume_command(target_session_id),
            Self::Factory => factory::resume_command(target_session_id),
            Self::ClawdBot => clawdbot::resume_command(target_session_id),
        }
    }

    pub fn backing_store_path(self, path: &Path) -> PathBuf {
        match self {
            Self::OpenCode => opencode::backing_store_path(path),
            Self::Pi | Self::ClaudeCode | Self::Codex | Self::Gemini | Self::Factory | Self::ClawdBot => path.to_path_buf(),
        }
    }
}

pub fn detect_provider(path_hint: Option<&Path>, content: &str) -> Option<ProviderKind> {
    if let Some(path) = path_hint {
        for provider in [ProviderKind::Pi, ProviderKind::ClaudeCode, ProviderKind::Codex, ProviderKind::OpenCode, ProviderKind::Gemini, ProviderKind::Factory, ProviderKind::ClawdBot] {
            if provider.matches_path(path) {
                return Some(provider);
            }
        }
    }

    let trimmed = content.trim_start();
    if trimmed.starts_with('[') {
        return Some(ProviderKind::Codex);
    }

    let first_value = trimmed.lines().find(|line| !line.trim().is_empty()).and_then(|line| serde_json::from_str::<serde_json::Value>(line).ok()).or_else(|| serde_json::from_str::<serde_json::Value>(trimmed).ok())?;
    let entry_type = first_value.get("type").and_then(serde_json::Value::as_str);
    if entry_type == Some("session") {
        return Some(ProviderKind::Pi);
    }
    if first_value.get("sessionId").is_some() && first_value.get("messages").is_some() && (first_value.get("startTime").is_some() || first_value.get("lastUpdated").is_some()) {
        return Some(ProviderKind::Gemini);
    }
    if matches!(entry_type, Some("user") | Some("assistant") | Some("summary") | Some("progress")) || first_value.get("sessionId").is_some() || first_value.get("uuid").is_some() {
        return Some(ProviderKind::ClaudeCode);
    }
    if first_value.get("session").is_some() || first_value.get("items").is_some() || matches!(entry_type, Some("session_meta") | Some("response_item") | Some("event_msg") | Some("turn_context")) || first_value.get("payload").is_some() {
        return Some(ProviderKind::Codex);
    }
    if entry_type == Some("session_start") {
        return Some(ProviderKind::Factory);
    }
    if first_value.get("role").is_some() && first_value.get("content").is_some() {
        return Some(ProviderKind::ClawdBot);
    }
    None
}
