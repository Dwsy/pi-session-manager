//! Unified native session resume and zero-conversion carry resolver.
//!
//! Fuses verified CLI contracts from `magpie` (`sessions.go`, `codex_resume.go`,
//! `carry.go`) with `casr` providers so native resume works directly without
//! forcing cross-agent format conversion.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::domain::casr_min::providers::{antigravity, codex, omp_agent, ProviderKind};
use crate::domain::session_bridge::types::SessionBridgeSource;
use crate::utils::string::{command_exists, shell_single_quote};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionCarryOption {
    pub target_provider: String,
    pub target_display_name: String,
    pub command: String,
    pub zero_conversion: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionResumeInfo {
    pub source_provider: String,
    pub source_display_name: String,
    pub session_id: String,
    pub cwd: String,
    pub can_native_resume: bool,
    pub cli_installed: bool,
    pub resume_command: Option<String>,
    pub raw_command: Option<String>,
    pub reason: Option<String>,
    pub carry_options: Vec<SessionCarryOption>,
}

const CLI_PROBE_TTL: Duration = Duration::from_secs(30);

fn cli_probe_cache() -> &'static Mutex<HashMap<String, (bool, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (bool, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn is_cli_installed_cached(binary: &str) -> bool {
    if binary.is_empty() {
        return false;
    }
    if let Ok(guard) = cli_probe_cache().lock() {
        if let Some((installed, at)) = guard.get(binary) {
            if at.elapsed() < CLI_PROBE_TTL {
                return *installed;
            }
        }
    }
    let installed = command_exists(binary);
    if let Ok(mut guard) = cli_probe_cache().lock() {
        guard.insert(binary.to_string(), (installed, Instant::now()));
    }
    installed
}

fn is_safe_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 256 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

fn quote_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    #[cfg(target_os = "windows")]
    {
        format!("'{}'", text.replace('\'', "''"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        shell_single_quote(&text)
    }
}

pub fn wrap_in_cwd(cwd: &str, run: &str) -> String {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return run.to_string();
    }
    #[cfg(target_os = "windows")]
    {
        format!("Set-Location -LiteralPath '{}'; {run}", cwd.replace('\'', "''"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        format!("cd {} && {run}", shell_single_quote(cwd))
    }
}

/// Primary CLI executable name for a provider (for installation detection).
pub fn cli_binary_for_provider(provider: ProviderKind) -> Option<&'static str> {
    match provider {
        ProviderKind::Pi => Some("pi"),
        ProviderKind::Omp => Some("omp"),
        ProviderKind::ClaudeCode => Some("claude"),
        ProviderKind::Codex => Some("codex"),
        ProviderKind::OpenCode => Some("opencode"),
        ProviderKind::Gemini => Some("gemini"),
        ProviderKind::Factory => Some("droid"),
        ProviderKind::ClawdBot => Some("clawdbot"),
        ProviderKind::Cursor => None,
        ProviderKind::Antigravity => Some("agy"),
        ProviderKind::Aider => Some("aider"),
        ProviderKind::Amp => Some("amp"),
        ProviderKind::ChatGpt => None,
        ProviderKind::Cline => Some("cline"),
        ProviderKind::OpenClaw => Some("openclaw"),
        ProviderKind::Vibe => Some("vibe"),
        ProviderKind::Kiro => Some("kiro-cli"),
        ProviderKind::Grok => Some("grok"),
    }
}

/// Authoritative CLI resume command for a converted or native target session
/// (without `cd <cwd> &&` prefix).
pub fn cli_command_for_target(provider: ProviderKind, session_id: &str, target_path: &Path) -> String {
    match provider {
        ProviderKind::Pi => format!("pi --session {}", quote_path(target_path)),
        ProviderKind::Omp => {
            if let Some(profile) = omp_agent::profile_from_path(target_path) {
                if is_safe_session_id(session_id) {
                    format!("omp --profile {profile} --resume {session_id}")
                } else {
                    format!("omp --profile {profile} --session {}", quote_path(target_path))
                }
            } else {
                format!("omp --session {}", quote_path(target_path))
            }
        }
        ProviderKind::ClaudeCode => format!("claude --resume {session_id}"),
        ProviderKind::Codex => codex::resolve_resume_command(session_id, target_path),
        ProviderKind::OpenCode => {
            if is_safe_session_id(session_id) {
                format!("opencode --session {session_id}")
            } else {
                "opencode".to_string()
            }
        }
        ProviderKind::Gemini => format!("gemini --resume {session_id}"),
        ProviderKind::Factory => format!("droid --resume {session_id}"),
        ProviderKind::ClawdBot => format!("clawdbot --resume {session_id}"),
        ProviderKind::Antigravity => format!("agy --conversation {session_id}"),
        ProviderKind::Aider => "aider --restore-chat-history".to_string(),
        ProviderKind::Amp => format!("amp threads continue --execute \"Continue from @{session_id}\""),
        ProviderKind::ChatGpt => format!("open \"https://chatgpt.com/c/{session_id}\""),
        ProviderKind::Cline => {
            let normalized = target_path.to_string_lossy().replace('\\', "/");
            if normalized.contains("/.cline/data/sessions/") && is_safe_session_id(session_id) {
                format!("cline --id {session_id}")
            } else {
                "code .".to_string()
            }
        }
        ProviderKind::OpenClaw => format!("openclaw --resume {session_id}"),
        ProviderKind::Vibe => format!("vibe --resume {session_id}"),
        ProviderKind::Kiro => format!("kiro-cli --resume-id {session_id}"),
        ProviderKind::Grok => format!("grok --resume {session_id}"),
        ProviderKind::Cursor => "cursor .".to_string(),
    }
}

/// Resolve native resume capability and zero-conversion carry options for a session file.
pub fn resolve_session_resume_info(path: &Path) -> Result<SessionResumeInfo, String> {
    let (source, canonical) = super::api::read_canonical_session_from_path(path)?;
    let provider: ProviderKind = source.into();
    let cwd = canonical.workspace.as_ref().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let session_id = canonical.session_id.clone();

    Ok(build_resume_info(source, provider, &session_id, &cwd, path))
}

pub fn build_resume_info(source: SessionBridgeSource, provider: ProviderKind, session_id: &str, cwd: &str, path: &Path) -> SessionResumeInfo {
    let source_provider = source.slug().replace('_', "-");
    let source_display_name = source.display_name().to_string();

    let mut carry_options = Vec::new();
    // Pi -> OMP zero-conversion fork (magpie `carry.go`): `omp --fork <pi_file>`
    if provider == ProviderKind::Pi && is_cli_installed_cached("omp") {
        let fork_run = format!("omp --fork {}", quote_path(path));
        carry_options.push(SessionCarryOption { target_provider: "omp".to_string(), target_display_name: "OMP".to_string(), command: wrap_in_cwd(cwd, &fork_run), zero_conversion: true });
    }

    // Read-only desktop / editor stores without CLI resume support.
    if provider == ProviderKind::Antigravity && !antigravity::is_cli_session(path) {
        return SessionResumeInfo {
            source_provider,
            source_display_name,
            session_id: session_id.to_string(),
            cwd: cwd.to_string(),
            can_native_resume: false,
            cli_installed: false,
            resume_command: None,
            raw_command: None,
            reason: Some("Antigravity Desktop / Insiders sessions are read-only; convert to another CLI to resume.".to_string()),
            carry_options,
        };
    }

    if provider == ProviderKind::Cursor {
        return SessionResumeInfo {
            source_provider,
            source_display_name,
            session_id: session_id.to_string(),
            cwd: cwd.to_string(),
            can_native_resume: false,
            cli_installed: false,
            resume_command: None,
            raw_command: None,
            reason: Some("Cursor Editor sessions are read-only; convert to a CLI agent to resume.".to_string()),
            carry_options,
        };
    }

    if provider == ProviderKind::ChatGpt {
        return SessionResumeInfo {
            source_provider,
            source_display_name,
            session_id: session_id.to_string(),
            cwd: cwd.to_string(),
            can_native_resume: false,
            cli_installed: false,
            resume_command: None,
            raw_command: None,
            reason: Some("ChatGPT sessions cannot be resumed in a local CLI; convert to another CLI to continue.".to_string()),
            carry_options,
        };
    }

    // Validate session ID before embedding into shell commands (except path-based Pi/OMP/Aider).
    let needs_id = !matches!(provider, ProviderKind::Pi | ProviderKind::Omp | ProviderKind::Aider);
    if needs_id && !is_safe_session_id(session_id) {
        return SessionResumeInfo {
            source_provider,
            source_display_name,
            session_id: session_id.to_string(),
            cwd: cwd.to_string(),
            can_native_resume: false,
            cli_installed: false,
            resume_command: None,
            raw_command: None,
            reason: Some("Session ID contains unsupported characters for shell resume.".to_string()),
            carry_options,
        };
    }

    let raw = cli_command_for_target(provider, session_id, path);
    let cli_installed = cli_binary_for_provider(provider).is_some_and(is_cli_installed_cached);
    let full = wrap_in_cwd(cwd, &raw);

    SessionResumeInfo { source_provider, source_display_name, session_id: session_id.to_string(), cwd: cwd.to_string(), can_native_resume: true, cli_installed, resume_command: Some(full), raw_command: Some(raw), reason: None, carry_options }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn antigravity_cli_resumes_without_hardcoded_model_and_desktop_is_readonly() {
        let cli_path = Path::new("/Users/demo/.gemini/antigravity-cli/brain/901d1db7-8590-4cb0-a7cb-35fac369d860/.system_generated/logs/transcript_full.jsonl");
        let cli_info = build_resume_info(SessionBridgeSource::Antigravity, ProviderKind::Antigravity, "901d1db7-8590-4cb0-a7cb-35fac369d860", "/work/app", cli_path);
        assert!(cli_info.can_native_resume);
        assert_eq!(cli_info.raw_command.as_deref(), Some("agy --conversation 901d1db7-8590-4cb0-a7cb-35fac369d860"));
        assert!(!cli_info.raw_command.as_deref().unwrap_or_default().contains("--model"));

        let desktop_path = Path::new("/Users/demo/.gemini/antigravity/brain/901d1db7-8590-4cb0-a7cb-35fac369d860/.system_generated/logs/transcript_full.jsonl");
        let desktop_info = build_resume_info(SessionBridgeSource::Antigravity, ProviderKind::Antigravity, "901d1db7-8590-4cb0-a7cb-35fac369d860", "/work/app", desktop_path);
        assert!(!desktop_info.can_native_resume);
        assert!(desktop_info.resume_command.is_none());
    }

    #[test]
    fn opencode_and_factory_and_omp_profile_commands_are_accurate() {
        let oc = cli_command_for_target(ProviderKind::OpenCode, "ses_123", Path::new("/tmp/opencode.db/ses_123"));
        assert_eq!(oc, "opencode --session ses_123");

        let droid = cli_command_for_target(ProviderKind::Factory, "fac-42", Path::new("/tmp/.factory/sessions/a/fac-42.jsonl"));
        assert_eq!(droid, "droid --resume fac-42");

        let omp_prof = cli_command_for_target(ProviderKind::Omp, "omp-77", Path::new("/Users/demo/.omp/profiles/work/agent/sessions/proj/2026_omp-77.jsonl"));
        assert_eq!(omp_prof, "omp --profile work --resume omp-77");
    }

    #[test]
    fn codex_injects_model_provider_when_mismatched_and_known() {
        let temp = tempfile::tempdir().expect("tempdir");
        let codex_home = temp.path().join(".codex");
        let sessions_dir = codex_home.join("sessions/2026/11/27");
        std::fs::create_dir_all(&sessions_dir).expect("mkdir");
        std::fs::write(codex_home.join("config.toml"), "model_provider = \"magpie\"\n\n[model_providers.magpie]\nbase_url = \"http://localhost:8080\"\n\n[model_providers.custom]\nbase_url = \"https://api.example.com\"\n").expect("write config");
        let rollout = sessions_dir.join("rollout-2026-11-27T10-00-00-thread-1.jsonl");
        std::fs::write(&rollout, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"thread-1\",\"cwd\":\"/work\",\"model_provider\":\"custom\"}}\n").expect("write rollout");

        let cmd = cli_command_for_target(ProviderKind::Codex, "thread-1", &rollout);
        assert_eq!(cmd, "codex resume -c model_provider=custom thread-1");
    }

    #[test]
    fn rejects_unsafe_session_id_characters() {
        let info = build_resume_info(SessionBridgeSource::ClaudeCode, ProviderKind::ClaudeCode, "abc; rm -rf /", "/work", Path::new("/Users/demo/.claude/projects/x/abc.jsonl"));
        assert!(!info.can_native_resume);
        assert!(info.resume_command.is_none());
    }
}
