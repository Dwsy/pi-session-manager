//! OMP (oh-my-pi) provider — reads/writes JSONL sessions in the Pi-Agent format.
//!
//! OMP is a fork of Pi that stores sessions in the same JSONL format but under
//! `~/.omp/agent/sessions/`. The read/render logic is byte-identical to
//! Pi-Agent, so we reuse `pi_agent`'s parser and only differ in session roots,
//! the target path, and the resume command (`omp --session`).

use std::path::{Path, PathBuf};

use crate::domain::casr_min::model::CanonicalSession;

pub fn session_roots() -> Vec<PathBuf> {
    crate::paths::omp_agent_sessions_dir().ok().filter(|p| p.is_dir()).map(|p| vec![p]).unwrap_or_default()
}

pub fn build_target_path(target_session_id: &str, now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
    let root = crate::paths::omp_agent_sessions_dir().map(|dir| dir.join("bridge")).map_err(|_| "cannot determine OMP sessions directory".to_string())?;
    let stamp = now.format("%Y-%m-%dT%H-%M-%S%.3f").to_string();
    let suffix = target_session_id.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect::<String>();
    Ok(root.join(format!("{stamp}_{suffix}.jsonl")))
}

pub fn resume_command(target_path: &Path) -> String {
    format!("omp --session {}", shell_escape(target_path))
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let mut canonical = super::pi_agent::read_session(path)?;
    canonical.provider_slug = "omp".to_string();
    Ok(canonical)
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    let mut canonical = super::pi_agent::read_session_from_str(path, content)?;
    canonical.provider_slug = "omp".to_string();
    Ok(canonical)
}

pub fn render_session(session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
    super::pi_agent::render_session(session, target_session_id)
}

fn shell_escape(path: &Path) -> String {
    let text = path.to_string_lossy();
    if cfg!(windows) {
        format!("\"{}\"", text.replace('"', "\\\""))
    } else {
        format!("'{}'", text.replace('\'', "'\\''"))
    }
}