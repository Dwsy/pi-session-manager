use std::path::{Path, PathBuf};

use crate::types::{SessionEntry, SessionInfo};

pub use crate::domain::casr_min::adapters::{
    canonical_to_session_entries, canonical_to_session_info,
};
use crate::domain::casr_min::providers::{detect_provider, ProviderKind};
use crate::domain::casr_min::write_support;
use crate::domain::session_bridge::types::{
    map_read_result, CanonicalSession, SessionBridgeConvertOptions, SessionBridgeConvertResult,
    SessionBridgeSource,
};

pub fn default_session_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for source in SessionBridgeSource::ALL {
        for root in source.session_roots() {
            if root.exists() && !dirs.iter().any(|existing| existing == &root) {
                dirs.push(root);
            }
        }
    }
    dirs
}

pub fn default_external_session_provider_slugs() -> Vec<String> {
    SessionBridgeSource::ALL
        .into_iter()
        .filter(|source| *source != SessionBridgeSource::Pi)
        .map(|source| source.slug().replace('_', "-"))
        .collect()
}

pub fn read_canonical_session_from_path(
    path: &Path,
) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let should_try_vendor = SessionBridgeSource::ALL
        .into_iter()
        .any(|source| source.matches_path(path));

    if should_try_vendor {
        if let Ok(result) = super::vendor::read_canonical_session_from_path(path) {
            return Ok(result);
        }
    }

    if let Some(provider) = detect_provider(Some(path), "") {
        return provider
            .read_session(path)
            .map(|canonical| (provider, canonical))
            .map(map_read_result);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("Failed to read session file {}: {error}", path.display()))?;
    read_canonical_session_from_str(&content, Some(path))
}

pub fn read_canonical_session_from_str(
    content: &str,
    path_hint: Option<&Path>,
) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let virtual_path = path_hint.unwrap_or_else(|| Path::new("/tmp/virtual-session.jsonl"));
    let provider = detect_provider(Some(virtual_path), content)
        .ok_or_else(|| "Unsupported session format".to_string())?;
    let canonical = provider.read_session_from_str(virtual_path, content)?;
    Ok(map_read_result((provider, canonical)))
}

pub fn parse_session_info_from_path(
    path: &Path,
) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    let modified = std::fs::metadata(backing_file_path(path))
        .and_then(|metadata| metadata.modified())
        .map(chrono::DateTime::<chrono::Utc>::from)
        .map_err(|error| format!("Failed to get modified time: {error}"))?;
    let entries = canonical_to_session_entries(&canonical);
    let info = canonical_to_session_info(&canonical, path, modified);
    Ok((info, entries))
}

pub fn parse_session_entries_from_path(path: &Path) -> Result<Vec<SessionEntry>, String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    Ok(canonical_to_session_entries(&canonical))
}

pub fn preview_session_format(path: &Path, target: SessionBridgeSource) -> Result<String, String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    super::preview::preview_canonical_for_target(&canonical, target)
}

pub fn preview_session_for_viewer(path: &Path) -> Result<String, String> {
    let (_, canonical) = read_canonical_session_from_path(path)?;
    super::preview::preview_canonical_for_viewer(&canonical)
}

pub fn backing_file_path(path: &Path) -> PathBuf {
    if is_opencode_db_path(path)
        || path
            .to_string_lossy()
            .replace('\\', "/")
            .contains("/opencode.db/")
    {
        return crate::domain::casr_min::providers::opencode::backing_store_path(path);
    }
    path.to_path_buf()
}

pub fn is_gemini_session_file(path: &Path) -> bool {
    crate::domain::casr_min::providers::gemini::is_session_file(path)
}

pub fn is_opencode_db_path(path: &Path) -> bool {
    path.file_name().and_then(|value| value.to_str())
        == Some(crate::domain::casr_min::providers::opencode::DB_FILENAME)
}

pub fn expand_opencode_session_paths(path: &Path) -> Vec<PathBuf> {
    crate::domain::casr_min::providers::opencode::list_session_paths_in_db(path)
        .unwrap_or_else(|_| vec![path.to_path_buf()])
}

pub fn convert_session_format(
    path: &Path,
    target: SessionBridgeSource,
    options: SessionBridgeConvertOptions,
) -> Result<SessionBridgeConvertResult, String> {
    if !options.dry_run {
        return super::vendor::convert_session_format(path, target, options.force);
    }

    let (source, canonical) = read_canonical_session_from_path(path)?;
    let target_kind: ProviderKind = target.into();

    if source == target {
        let resume_command =
            target_kind.resume_command(&canonical.session_id, &canonical.source_path);
        return Ok(SessionBridgeConvertResult {
            source_provider: source.display_name().to_string(),
            target_provider: target.display_name().to_string(),
            source_session_id: canonical.session_id.clone(),
            target_session_id: canonical.session_id.clone(),
            written_paths: vec![canonical.source_path.to_string_lossy().to_string()],
            resume_command,
            dry_run: true,
            warnings: vec![
                "Source and target provider are the same; skipped writing.".to_string(),
                "Dry run only; no files were written.".to_string(),
            ],
        });
    }

    let plan = write_support::build_write_plan(&canonical, target_kind, chrono::Utc::now())?;

    Ok(SessionBridgeConvertResult {
        source_provider: source.display_name().to_string(),
        target_provider: target.display_name().to_string(),
        source_session_id: canonical.session_id.clone(),
        target_session_id: plan.target_session_id,
        written_paths: vec![plan.target_path.to_string_lossy().to_string()],
        resume_command: plan.resume_command,
        dry_run: true,
        warnings: vec!["Dry run only; no files were written.".to_string()],
    })
}
