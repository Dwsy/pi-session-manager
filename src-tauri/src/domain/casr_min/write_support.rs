use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{DateTime, Utc};

use super::model::{CanonicalMessage, CanonicalSession, MessageRole};
use super::providers::ProviderKind;

#[derive(Debug, Clone)]
pub struct WritePlan {
    pub target_session_id: String,
    pub target_path: PathBuf,
    pub resume_command: String,
}

#[derive(Debug, Clone)]
pub struct AtomicWriteOutcome {
    pub target_path: PathBuf,
    pub backup_path: Option<PathBuf>,
}

static SESSION_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn build_write_plan(
    canonical: &CanonicalSession,
    target: ProviderKind,
    now: DateTime<Utc>,
) -> Result<WritePlan, String> {
    let target_session_id = generate_session_id();
    let target_path = target.build_target_path(canonical, &target_session_id, now)?;
    let resume_command = target.resume_command(&target_session_id, &target_path);
    Ok(WritePlan {
        target_session_id,
        target_path,
        resume_command,
    })
}

pub fn atomic_write(
    target_path: &Path,
    content: &[u8],
    force: bool,
    provider_name: &str,
) -> Result<AtomicWriteOutcome, String> {
    let parent = target_path
        .parent()
        .ok_or_else(|| format!("{provider_name}: target path has no parent directory"))?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("{provider_name}: failed to create target directory: {e}"))?;

    let backup_path = if target_path.exists() {
        if !force {
            return Err(format!(
                "{provider_name}: target already exists at {} (pass force to overwrite)",
                target_path.display()
            ));
        }
        let backup_path = next_backup_path(target_path);
        fs::rename(target_path, &backup_path).map_err(|e| {
            format!(
                "{provider_name}: failed to create backup {}: {e}",
                backup_path.display()
            )
        })?;
        Some(backup_path)
    } else {
        None
    };

    let temp_path = parent.join(format!(
        ".{}.{}.tmp",
        target_path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("session"),
        SESSION_ID_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    let write_result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp_path)
            .map_err(|e| format!("{provider_name}: failed to create temp file: {e}"))?;
        file.write_all(content)
            .map_err(|e| format!("{provider_name}: failed to write temp file: {e}"))?;
        file.flush()
            .map_err(|e| format!("{provider_name}: failed to flush temp file: {e}"))?;
        drop(file);
        fs::rename(&temp_path, target_path)
            .map_err(|e| format!("{provider_name}: failed to move temp file into place: {e}"))?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        if let Some(backup) = &backup_path {
            let _ = fs::rename(backup, target_path);
        }
        return Err(error);
    }

    Ok(AtomicWriteOutcome {
        target_path: target_path.to_path_buf(),
        backup_path,
    })
}

pub fn restore_backup(outcome: &AtomicWriteOutcome) -> Result<(), String> {
    if let Some(backup) = &outcome.backup_path {
        let _ = fs::remove_file(&outcome.target_path);
        fs::rename(backup, &outcome.target_path)
            .map_err(|e| format!("Failed to restore backup {}: {e}", backup.display()))
    } else {
        fs::remove_file(&outcome.target_path)
            .map_err(|e| format!("Failed to remove invalid target file: {e}"))
    }
}

pub fn verify_written_session(
    original: &CanonicalSession,
    target: ProviderKind,
    target_path: &Path,
) -> Result<(), String> {
    let readback = target.read_session(target_path)?;
    let original_messages = verification_messages(original);
    let readback_messages = verification_messages(&readback);

    if original_messages.len() != readback_messages.len() {
        return Err(format!(
            "Read-back verification failed for {}: wrote {} messages, read back {}",
            target.display_name(),
            original_messages.len(),
            readback_messages.len()
        ));
    }

    for (index, (expected, actual)) in original_messages
        .iter()
        .zip(readback_messages.iter())
        .enumerate()
    {
        if verification_role_bucket(&expected.role) != verification_role_bucket(&actual.role) {
            return Err(format!(
                "Read-back verification failed for {} at message {}: role mismatch",
                target.display_name(),
                index
            ));
        }
        if normalize_verify_text(&expected.content) != normalize_verify_text(&actual.content) {
            return Err(format!(
                "Read-back verification failed for {} at message {}: content mismatch",
                target.display_name(),
                index
            ));
        }
    }
    Ok(())
}

fn verification_messages(session: &CanonicalSession) -> Vec<&CanonicalMessage> {
    session
        .messages
        .iter()
        .filter(|message| {
            !message.content.trim().is_empty()
                || !message.tool_calls.is_empty()
                || !message.tool_results.is_empty()
        })
        .collect()
}

fn verification_role_bucket(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::Assistant => "assistant",
        MessageRole::User | MessageRole::Tool | MessageRole::System | MessageRole::Other(_) => {
            "user_like"
        }
    }
}

fn normalize_verify_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn next_backup_path(target_path: &Path) -> PathBuf {
    let name = target_path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("session");
    let mut candidate = target_path.with_file_name(format!("{name}.bak"));
    if !candidate.exists() {
        return candidate;
    }
    let mut index = 1usize;
    loop {
        candidate = target_path.with_file_name(format!("{name}.bak.{index}"));
        if !candidate.exists() {
            return candidate;
        }
        index += 1;
    }
}

fn generate_session_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let counter = SESSION_ID_COUNTER.fetch_add(1, Ordering::Relaxed) as u128;
    let mut hex = format!("{:032x}", nanos ^ counter);
    if hex.len() < 32 {
        hex = format!("{hex:0>32}");
    }
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}
