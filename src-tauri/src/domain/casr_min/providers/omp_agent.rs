//! OMP (oh-my-pi) provider — reads/writes JSONL sessions in the Pi-Agent format.
//!
//! OMP is a fork of Pi that stores sessions in the same JSONL format but under
//! `~/.omp/agent/sessions/`. The read/render logic is byte-identical to
//! Pi-Agent, so we reuse `pi_agent`'s parser and only differ in session roots,
//! the target path, and the resume command (`omp --session`).

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::domain::casr_min::model::CanonicalSession;

pub fn session_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(default_dir) = crate::paths::omp_agent_sessions_dir() {
        if default_dir.is_dir() {
            roots.push(default_dir.clone());
        }
        // ~/.omp/profiles/<name>/agent/sessions
        if let Some(omp_root) = default_dir.parent().and_then(Path::parent) {
            let profiles_dir = omp_root.join("profiles");
            if let Ok(entries) = std::fs::read_dir(profiles_dir) {
                for entry in entries.flatten() {
                    let candidate = entry.path().join("agent").join("sessions");
                    if candidate.is_dir() && !roots.iter().any(|existing| existing == &candidate) {
                        roots.push(candidate);
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        let trimmed = xdg.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed).join("omp").join("sessions");
            if candidate.is_dir() && !roots.iter().any(|existing| existing == &candidate) {
                roots.push(candidate);
            }
        }
    }
    roots
}

/// Extract OMP profile name from `~/.omp/profiles/<name>/agent/sessions/<cwd>/<file>.jsonl`.
pub fn profile_from_path(path: &Path) -> Option<String> {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let marker = "/.omp/profiles/";
    let idx = normalized.find(marker)?;
    let rest = &normalized[idx + marker.len()..];
    let (profile, tail) = rest.split_once('/')?;
    if !tail.starts_with("agent/sessions/") || profile.is_empty() {
        return None;
    }
    let valid = profile.len() <= 64
        && profile.chars().enumerate().all(|(i, c)| {
            if i == 0 {
                c.is_ascii_lowercase() || c.is_ascii_digit()
            } else {
                c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-')
            }
        });
    valid.then(|| profile.to_string())
}

pub fn looks_like_session_content(content: &str) -> bool {
    content
        .trim_start()
        .lines()
        .find(|line| !line.trim().is_empty())
        .and_then(|line| serde_json::from_str::<Value>(line).ok())
        .is_some_and(|value| value.get("type").and_then(Value::as_str) == Some("title") && value.get("v").and_then(Value::as_u64).is_some() && value.get("updatedAt").and_then(Value::as_str).is_some())
}

pub fn build_target_path(target_session_id: &str, now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
    let root = crate::paths::omp_agent_sessions_dir().map(|dir| dir.join("bridge")).map_err(|_| "cannot determine OMP sessions directory".to_string())?;
    let stamp = now.format("%Y-%m-%dT%H-%M-%S%.3f").to_string();
    let suffix = target_session_id.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect::<String>();
    Ok(root.join(format!("{stamp}_{suffix}.jsonl")))
}

pub fn resume_command(target_path: &Path) -> String {
    if let Some(profile) = profile_from_path(target_path) {
        format!("omp --profile {profile} --session {}", shell_escape(target_path))
    } else {
        format!("omp --session {}", shell_escape(target_path))
    }
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

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{looks_like_session_content, read_session_from_str};

    #[test]
    fn detects_omp_title_record() {
        assert!(looks_like_session_content("{\"type\":\"title\",\"v\":1,\"title\":\"OMP\",\"updatedAt\":\"2026-08-10T00:00:00Z\",\"pad\":\" \"}\n{\"type\":\"session\"}"));
        assert!(!looks_like_session_content("{\"type\":\"session\",\"version\":3}"));
    }

    #[test]
    fn falls_back_to_header_name_when_title_is_null() {
        let content = concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"omp-1\",\"timestamp\":\"2026-08-10T00:00:00Z\",\"cwd\":\"/tmp\",\"title\":null,\"name\":\"Named session\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"timestamp\":\"2026-08-10T00:01:00Z\",\"message\":{\"role\":\"user\",\"content\":\"fallback title\"}}\n"
        );

        let session = read_session_from_str(Path::new("/tmp/.omp/agent/sessions/session.jsonl"), content).expect("parse omp canonical session");
        assert_eq!(session.title.as_deref(), Some("Named session"));
    }

    #[test]
    fn preserves_mutable_omp_title_in_canonical_session() {
        let content = concat!(
            "{\"type\":\"title\",\"v\":1,\"title\":\"Mutable title\",\"updatedAt\":\"2026-08-10T00:00:00Z\",\"pad\":\" \"}\n",
            "{\"type\":\"session\",\"version\":3,\"id\":\"omp-1\",\"timestamp\":\"2026-08-10T00:00:00Z\",\"cwd\":\"/tmp\",\"title\":\"Header title\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"timestamp\":\"2026-08-10T00:01:00Z\",\"message\":{\"role\":\"user\",\"content\":\"fallback title\"}}\n"
        );

        let session = read_session_from_str(Path::new("/tmp/.omp/agent/sessions/session.jsonl"), content).expect("parse omp canonical session");
        assert_eq!(session.title.as_deref(), Some("Mutable title"));
    }
}
