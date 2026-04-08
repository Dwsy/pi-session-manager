use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::types::{SessionEntry, SessionInfo};

use super::adapters;
use super::model::{reindex_messages, CanonicalSession, MessageRole};
use super::providers::{detect_provider, ProviderKind};
use super::write_support;

#[derive(Debug, Clone)]
pub struct ConversionOutcome {
    pub target_session_id: String,
    pub written_paths: Vec<PathBuf>,
    pub resume_command: String,
    pub dry_run: bool,
    pub warnings: Vec<String>,
}

pub fn default_session_dirs(include_other_agents: bool) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for provider in ProviderKind::ALL {
        if !include_other_agents && provider != ProviderKind::Pi {
            continue;
        }
        for root in provider.session_roots() {
            if root.exists() && !dirs.iter().any(|existing| existing == &root) {
                dirs.push(root);
            }
        }
    }
    dirs
}

pub fn read_canonical_session_from_path(
    path: &Path,
) -> Result<(ProviderKind, CanonicalSession), String> {
    if let Some(provider) = detect_provider(Some(path), "") {
        return provider
            .read_session(path)
            .map(|canonical| (provider, canonical));
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read session file {}: {e}", path.display()))?;
    read_canonical_session_from_str(&content, Some(path))
}

pub fn read_canonical_session_from_str(
    content: &str,
    path_hint: Option<&Path>,
) -> Result<(ProviderKind, CanonicalSession), String> {
    let virtual_path = path_hint.unwrap_or_else(|| Path::new("/tmp/virtual-session.jsonl"));
    let provider = detect_provider(Some(virtual_path), content)
        .ok_or_else(|| "Unsupported session format".to_string())?;
    let canonical = provider.read_session_from_str(virtual_path, content)?;
    Ok((provider, canonical))
}

pub fn parse_session_info_from_path(
    path: &Path,
) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    let modified = file_modified_time(path)?;
    let entries = adapters::canonical_to_session_entries(&canonical);
    let info = adapters::canonical_to_session_info(&canonical, path, modified);
    Ok((info, entries))
}

pub fn parse_session_entries_from_path(path: &Path) -> Result<Vec<SessionEntry>, String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    Ok(adapters::canonical_to_session_entries(&canonical))
}

pub fn preview_session_format(
    canonical: &CanonicalSession,
    target: ProviderKind,
) -> Result<String, String> {
    target.write_preview(canonical, &canonical.session_id)
}

pub fn preview_session_for_viewer(canonical: &CanonicalSession) -> Result<String, String> {
    let mut canonical = canonical.clone();
    canonical.messages.retain(|message| {
        matches!(
            message.role,
            MessageRole::User | MessageRole::Assistant | MessageRole::Tool
        )
    });
    reindex_messages(&mut canonical.messages);
    ProviderKind::Pi.write_preview(&canonical, &canonical.session_id)
}

pub fn convert_canonical_session(
    source: ProviderKind,
    canonical: &CanonicalSession,
    target: ProviderKind,
    dry_run: bool,
    force: bool,
) -> Result<ConversionOutcome, String> {
    if source == target {
        let resume_command = target.resume_command(&canonical.session_id, &canonical.source_path);
        return Ok(ConversionOutcome {
            target_session_id: canonical.session_id.clone(),
            written_paths: vec![canonical.source_path.clone()],
            resume_command,
            dry_run,
            warnings: vec!["Source and target provider are the same; skipped writing.".to_string()],
        });
    }

    let now = Utc::now();
    let plan = write_support::build_write_plan(canonical, target, now)?;

    if dry_run {
        return Ok(ConversionOutcome {
            target_session_id: plan.target_session_id,
            written_paths: vec![plan.target_path],
            resume_command: plan.resume_command,
            dry_run: true,
            warnings: vec!["Dry run only; no files were written.".to_string()],
        });
    }

    let written_path = if target == ProviderKind::OpenCode {
        super::providers::opencode::write_session(canonical, &plan.target_session_id)?
    } else {
        let rendered = target.write_preview(canonical, &plan.target_session_id)?;
        let outcome = write_support::atomic_write(
            &plan.target_path,
            rendered.as_bytes(),
            force,
            target.display_name(),
        )?;

        if let Err(error) =
            write_support::verify_written_session(canonical, target, &outcome.target_path)
        {
            let _ = write_support::restore_backup(&outcome);
            return Err(error);
        }

        outcome.target_path
    };

    if let Err(error) = write_support::verify_written_session(canonical, target, &written_path) {
        return Err(error);
    }

    Ok(ConversionOutcome {
        target_session_id: plan.target_session_id,
        written_paths: vec![written_path],
        resume_command: plan.resume_command,
        dry_run: false,
        warnings: Vec::new(),
    })
}

pub fn backing_file_path(path: &Path) -> PathBuf {
    detect_provider(Some(path), "")
        .map(|provider| provider.backing_store_path(path))
        .unwrap_or_else(|| path.to_path_buf())
}

fn file_modified_time(path: &Path) -> Result<DateTime<Utc>, String> {
    fs::metadata(backing_file_path(path))
        .and_then(|m| m.modified())
        .map(DateTime::<Utc>::from)
        .map_err(|e| format!("Failed to get modified time: {e}"))
}
