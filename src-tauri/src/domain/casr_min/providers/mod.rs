pub mod antigravity;
pub mod claude_code;
pub mod clawdbot;
pub mod codex;
pub mod cursor;
pub mod factory;
pub mod gemini;
pub mod omp_agent;
pub mod opencode;
pub mod pi_agent;
pub mod vendored;

use std::path::{Path, PathBuf};

use crate::domain::casr_min::model::CanonicalSession;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderKind {
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

impl ProviderKind {
    pub const ALL: [Self; 18] = [Self::Pi, Self::Omp, Self::ClaudeCode, Self::Codex, Self::OpenCode, Self::Gemini, Self::Factory, Self::ClawdBot, Self::Cursor, Self::Antigravity, Self::Aider, Self::Amp, Self::ChatGpt, Self::Cline, Self::OpenClaw, Self::Vibe, Self::Kiro, Self::Grok];

    /// Providers with no hand-written `casr_min` reader: parsing and writing
    /// are delegated to the vendored CASR crate. See [`vendored`].
    pub const VENDOR_DELEGATED: [Self; 8] = [Self::Aider, Self::Amp, Self::ChatGpt, Self::Cline, Self::OpenClaw, Self::Vibe, Self::Kiro, Self::Grok];

    pub fn is_vendor_delegated(self) -> bool {
        matches!(self, Self::Aider | Self::Amp | Self::ChatGpt | Self::Cline | Self::OpenClaw | Self::Vibe | Self::Kiro | Self::Grok)
    }

    /// Providers whose `casr_min` reader is authoritative, so the vendored CASR
    /// reader is skipped even though CASR ships one.
    ///
    /// - OMP shares Pi-Agent's on-disk format, and CASR has no OMP provider, so
    ///   it would attribute those sessions to Pi.
    /// - Antigravity sessions are discovered through
    ///   `brain/<uuid>/.system_generated/logs/transcript.jsonl`, whereas CASR
    ///   enters through `conversations/<uuid>.db` and falls back to the file
    ///   stem for a transcript path — every session would be named
    ///   "transcript".
    pub fn prefers_casr_min_reader(self) -> bool {
        matches!(self, Self::Omp | Self::Antigravity)
    }

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
            Self::Aider => "aider",
            Self::Amp => "amp",
            Self::ChatGpt => "chatgpt",
            Self::Cline => "cline",
            Self::OpenClaw => "openclaw",
            Self::Vibe => "vibe",
            Self::Kiro => "kiro",
            Self::Grok => "grok",
        }
    }

    /// Slug used by the vendored CASR registry, which spells multi-word
    /// providers with a hyphen.
    pub fn casr_slug(self) -> &'static str {
        match self {
            Self::Pi | Self::Omp => "pi-agent",
            Self::ClaudeCode => "claude-code",
            other => other.slug(),
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
            Self::Aider => "Aider",
            Self::Amp => "Amp",
            Self::ChatGpt => "ChatGPT",
            Self::Cline => "Cline",
            Self::OpenClaw => "OpenClaw",
            Self::Vibe => "Vibe",
            Self::Kiro => "Kiro CLI",
            Self::Grok => "Grok Build",
        }
    }

    pub fn can_scan(self) -> bool {
        true
    }

    pub fn can_convert_target(self) -> bool {
        !matches!(self, Self::Cursor | Self::Antigravity)
    }

    pub fn parse_alias(value: &str) -> Result<Self, String> {
        let normalized = value.trim().to_ascii_lowercase().replace('_', "-");
        match normalized.as_str() {
            "pi" | "pi-agent" => Ok(Self::Pi),
            "omp" | "oh-my-pi" => Ok(Self::Omp),
            "claude" | "claude-code" | "cc" => Ok(Self::ClaudeCode),
            "codex" | "cod" => Ok(Self::Codex),
            "opencode" | "open-code" | "opc" => Ok(Self::OpenCode),
            "gemini" | "gemini-cli" | "gmi" => Ok(Self::Gemini),
            "factory" | "fac" => Ok(Self::Factory),
            "clawdbot" | "clawd-bot" | "cwb" => Ok(Self::ClawdBot),
            "cursor" | "cur" => Ok(Self::Cursor),
            "antigravity" | "agy" => Ok(Self::Antigravity),
            "aider" | "aid" => Ok(Self::Aider),
            "amp" => Ok(Self::Amp),
            "chatgpt" | "gpt" => Ok(Self::ChatGpt),
            "cline" | "cln" => Ok(Self::Cline),
            "openclaw" | "open-claw" | "ocl" => Ok(Self::OpenClaw),
            "vibe" | "vib" => Ok(Self::Vibe),
            "kiro" | "kiro-cli" | "kr" => Ok(Self::Kiro),
            "grok" | "grok-build" | "grk" => Ok(Self::Grok),
            _ => Err(format!("Unsupported target format: {value}")),
        }
    }

    pub fn session_roots(self) -> Vec<PathBuf> {
        match self {
            Self::Pi => pi_agent::session_roots(),
            Self::Omp => omp_agent::session_roots(),
            Self::ClaudeCode => claude_code::session_roots(),
            Self::Codex => codex::session_roots(),
            Self::OpenCode => opencode::session_roots(),
            Self::Gemini => gemini::session_roots(),
            Self::Factory => factory::session_roots(),
            Self::ClawdBot => clawdbot::session_roots(),
            Self::Cursor => cursor::session_roots(),
            Self::Antigravity => antigravity::session_roots(),
            other => vendored::session_roots(other.casr_slug()),
        }
    }

    pub fn matches_path(self, path: &Path) -> bool {
        let normalized = path.to_string_lossy().replace('\\', "/");
        match self {
            Self::Pi => crate::paths::pi_agent_sessions_dir().ok().map(|path| path.to_string_lossy().replace('\\', "/")).is_some_and(|root| normalized.contains(&root)),
            Self::Omp => crate::paths::omp_agent_sessions_dir().ok().map(|path| path.to_string_lossy().replace('\\', "/")).is_some_and(|root| normalized.contains(&root)),
            Self::ClaudeCode => normalized.contains("/.claude/projects/"),
            Self::Codex => normalized.contains("/.codex/sessions/"),
            Self::OpenCode => opencode::matches_path(path),
            Self::Gemini => gemini::matches_path(path),
            Self::Factory => factory::matches_path(path),
            Self::ClawdBot => clawdbot::matches_path(path),
            Self::Cursor => cursor::matches_path(path),
            Self::Antigravity => antigravity::matches_path(path),
            Self::Aider => vendored::aider_matches_path(path),
            Self::Amp => vendored::amp_matches_path(path),
            Self::ChatGpt => vendored::chatgpt_matches_path(path),
            Self::Cline => vendored::cline_matches_path(path),
            Self::OpenClaw => vendored::openclaw_matches_path(path),
            Self::Vibe => vendored::vibe_matches_path(path),
            Self::Kiro => vendored::kiro_matches_path(path),
            Self::Grok => vendored::grok_matches_path(path),
        }
    }

    pub fn read_session(self, path: &Path) -> Result<CanonicalSession, String> {
        match self {
            Self::Pi => pi_agent::read_session(path),
            Self::Omp => omp_agent::read_session(path),
            Self::ClaudeCode => claude_code::read_session(path),
            Self::Codex => codex::read_session(path),
            Self::OpenCode => opencode::read_session(path),
            Self::Gemini => gemini::read_session(path),
            Self::Factory => factory::read_session(path),
            Self::ClawdBot => clawdbot::read_session(path),
            Self::Cursor => cursor::read_session(path),
            Self::Antigravity => antigravity::read_session(path),
            other => vendored::read_session(other.casr_slug(), path),
        }
    }

    pub fn read_session_from_str(self, path_hint: &Path, content: &str) -> Result<CanonicalSession, String> {
        match self {
            Self::Pi => pi_agent::read_session_from_str(path_hint, content),
            Self::Omp => omp_agent::read_session_from_str(path_hint, content),
            Self::ClaudeCode => claude_code::read_session_from_str(path_hint, content),
            Self::Codex => codex::read_session_from_str(path_hint, content),
            Self::OpenCode => opencode::read_session_from_str(path_hint, content),
            Self::Gemini => gemini::read_session_from_str(path_hint, content),
            Self::Factory => factory::read_session_from_str(path_hint, content),
            Self::ClawdBot => clawdbot::read_session_from_str(path_hint, content),
            Self::Cursor => cursor::read_session_from_str(path_hint, content),
            Self::Antigravity => antigravity::read_session_from_str(path_hint, content),
            // Delegated readers work off the path: several of these formats span
            // sibling files (Kiro triplets, Grok summary.json, Cline task dirs)
            // that a single in-memory buffer cannot represent.
            other => vendored::read_session(other.casr_slug(), path_hint),
        }
    }

    pub fn write_preview(self, session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
        match self {
            Self::Pi => pi_agent::render_session(session, target_session_id),
            Self::Omp => omp_agent::render_session(session, target_session_id),
            Self::ClaudeCode => claude_code::render_session(session, target_session_id),
            Self::Codex => codex::render_session(session, target_session_id),
            Self::OpenCode => opencode::render_session(session, target_session_id),
            Self::Gemini => gemini::render_session(session, target_session_id),
            Self::Factory => factory::render_session(session, target_session_id),
            Self::ClawdBot => clawdbot::render_session(session, target_session_id),
            Self::Cursor => cursor::render_session(session, target_session_id),
            Self::Antigravity => antigravity::render_session(session, target_session_id),
            other => Err(format!("{} sessions are written by the vendored CASR writer, not by casr_min", other.display_name())),
        }
    }

    pub fn build_target_path(self, session: &CanonicalSession, target_session_id: &str, now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
        match self {
            Self::Pi => pi_agent::build_target_path(target_session_id, now),
            Self::Omp => omp_agent::build_target_path(target_session_id, now),
            Self::ClaudeCode => claude_code::build_target_path(session, target_session_id),
            Self::Codex => codex::build_target_path(target_session_id, now),
            Self::OpenCode => opencode::build_target_path(session, target_session_id),
            Self::Gemini => gemini::build_target_path(session, target_session_id, now),
            Self::Factory => factory::build_target_path(session, target_session_id),
            Self::ClawdBot => clawdbot::build_target_path(target_session_id),
            Self::Cursor => cursor::build_target_path(session, target_session_id, now),
            Self::Antigravity => antigravity::build_target_path(session, target_session_id, now),
            other => Err(format!("{} target paths are owned by the vendored CASR writer, not by casr_min", other.display_name())),
        }
    }

    pub fn resume_command(self, target_session_id: &str, target_path: &Path) -> String {
        match self {
            Self::Pi => pi_agent::resume_command(target_path),
            Self::Omp => omp_agent::resume_command(target_path),
            Self::ClaudeCode => claude_code::resume_command(target_session_id),
            Self::Codex => codex::resume_command(target_session_id),
            Self::OpenCode => opencode::resume_command(),
            Self::Gemini => gemini::resume_command(target_session_id),
            Self::Factory => factory::resume_command(target_session_id),
            Self::ClawdBot => clawdbot::resume_command(target_session_id),
            Self::Cursor => cursor::resume_command(),
            Self::Antigravity => antigravity::resume_command(target_session_id),
            other => vendored::resume_command(other.casr_slug(), target_session_id),
        }
    }

    pub fn backing_store_path(self, path: &Path) -> PathBuf {
        match self {
            Self::OpenCode => opencode::backing_store_path(path),
            Self::Cursor => cursor::backing_store_path(path),
            _ => path.to_path_buf(),
        }
    }
}

/// Path detectors, most specific first. Antigravity lives under the Gemini
/// home and Kiro/Grok claim one file out of a multi-file session, so ordering
/// here decides which provider wins an ambiguous path.
const PATH_DETECTION_ORDER: [ProviderKind; 18] = [
    ProviderKind::Antigravity,
    ProviderKind::Cursor,
    ProviderKind::Pi,
    ProviderKind::Omp,
    ProviderKind::ClaudeCode,
    ProviderKind::Codex,
    ProviderKind::OpenCode,
    ProviderKind::Gemini,
    ProviderKind::Factory,
    ProviderKind::ClawdBot,
    ProviderKind::Cline,
    ProviderKind::ChatGpt,
    ProviderKind::Amp,
    ProviderKind::Aider,
    ProviderKind::Kiro,
    ProviderKind::Grok,
    ProviderKind::OpenClaw,
    ProviderKind::Vibe,
];

pub fn detect_provider(path_hint: Option<&Path>, content: &str) -> Option<ProviderKind> {
    if let Some(path) = path_hint {
        // Prefer path-specific detectors before content heuristics.
        for provider in PATH_DETECTION_ORDER {
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

    if first_value.get("step_index").is_some()
        && first_value.get("source").is_some()
        && matches!(entry_type, Some("USER_INPUT") | Some("PLANNER_RESPONSE") | Some("VIEW_FILE") | Some("EDIT_FILE") | Some("RUN_COMMAND") | Some("SYSTEM_MESSAGE") | Some("EPHEMERAL_MESSAGE") | Some("CONVERSATION_HISTORY"))
    {
        return Some(ProviderKind::Antigravity);
    }
    if omp_agent::looks_like_session_content(trimmed) {
        return Some(ProviderKind::Omp);
    }
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
