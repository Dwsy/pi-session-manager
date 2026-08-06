use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::config::Config;
use crate::types::{SessionEntry, SessionInfo};
use chrono::{DateTime, Utc};

pub use crate::domain::casr_min::adapters::{canonical_to_session_entries, canonical_to_session_info};
use crate::domain::casr_min::providers::{detect_provider, ProviderKind};
use crate::domain::casr_min::write_support;
use crate::domain::session_bridge::types::{map_read_result, CanonicalSession, SessionBridgeConvertOptions, SessionBridgeConvertResult, SessionBridgeSource};
use tracing::{debug, warn};

const PROVIDER_DETECTION_PROBE_BYTES: usize = 64 * 1024;

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
    SessionBridgeSource::ALL.into_iter().filter(|source| *source != SessionBridgeSource::Pi).map(|source| source.slug().replace('_', "-")).collect()
}

pub fn source_from_path(path: &Path) -> Option<SessionBridgeSource> {
    SessionBridgeSource::ALL.into_iter().find(|source| source.matches_path(path))
}

pub fn is_external_source(source: SessionBridgeSource) -> bool {
    source != SessionBridgeSource::Pi
}

pub fn is_session_visible_under_config(path: &Path, config: &Config) -> bool {
    match source_from_path(path) {
        None | Some(SessionBridgeSource::Pi) => true,
        Some(source) => config.effective_external_session_provider_slugs().iter().any(|slug| slug == &source.slug().replace('_', "-")),
    }
}

pub fn is_session_allowed_in_stats(path: &Path, config: &Config) -> bool {
    match source_from_path(path) {
        None | Some(SessionBridgeSource::Pi) => true,
        Some(_) => config.external_sessions_include_in_stats,
    }
}

pub fn is_session_allowed_in_search(path: &Path, config: &Config) -> bool {
    match source_from_path(path) {
        None | Some(SessionBridgeSource::Pi) => true,
        Some(_) => config.external_sessions_include_in_search,
    }
}

pub fn read_canonical_session_from_path(path: &Path) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let started_at = Instant::now();
    // OMP shares the Pi-Agent JSONL format but CASR has no distinct OMP
    // provider, so its sessions are read via the casr_min provider path (which
    // attributes them to OMP) instead of the vendored CASR registry.
    let should_try_vendor = SessionBridgeSource::ALL.into_iter().any(|source| source != SessionBridgeSource::Omp && source.matches_path(path));

    if should_try_vendor {
        let vendor_started_at = Instant::now();
        match super::vendor::read_canonical_session_from_path(path) {
            Ok(result) => {
                debug!("session_bridge read {} via vendor in {}ms (total={}ms)", path.display(), vendor_started_at.elapsed().as_millis(), started_at.elapsed().as_millis());
                return Ok(result);
            }
            Err(error) => {
                warn!("session_bridge vendor read failed for {} after {}ms: {}", path.display(), vendor_started_at.elapsed().as_millis(), error);
            }
        }
    }

    if let Some(provider) = detect_provider(Some(path), "") {
        let provider_started_at = Instant::now();
        let result = provider.read_session(path).map(|canonical| (provider, canonical)).map(map_read_result);
        match &result {
            Ok((source, _)) => debug!("session_bridge read {} via provider {} in {}ms (total={}ms)", path.display(), source.display_name(), provider_started_at.elapsed().as_millis(), started_at.elapsed().as_millis()),
            Err(error) => warn!("session_bridge provider read failed for {} after {}ms: {}", path.display(), provider_started_at.elapsed().as_millis(), error),
        }
        return result;
    }

    let start = std::time::Instant::now();
    let content = std::fs::read_to_string(path).map_err(|error| format!("Failed to read session file {}: {error}", path.display()))?;
    let elapsed = start.elapsed();
    tracing::info!("[IO] session_bridge::read_canonical_session_from_path path={} bytes={} elapsed={:?}", path.display(), content.len(), elapsed);
    let result = read_canonical_session_from_str(&content, Some(path));
    match &result {
        Ok((source, _)) => debug!("session_bridge read {} via content fallback {} in {}ms", path.display(), source.display_name(), started_at.elapsed().as_millis()),
        Err(error) => warn!("session_bridge content fallback failed for {} after {}ms: {}", path.display(), started_at.elapsed().as_millis(), error),
    }
    result
}

pub fn read_canonical_session_from_str(content: &str, path_hint: Option<&Path>) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let virtual_path = path_hint.unwrap_or_else(|| Path::new("/tmp/virtual-session.jsonl"));
    let provider = detect_provider(Some(virtual_path), content).ok_or_else(|| "Unsupported session format".to_string())?;
    let canonical = provider.read_session_from_str(virtual_path, content)?;
    Ok(map_read_result((provider, canonical)))
}

pub fn parse_session_info_from_path(path: &Path) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    crate::domain::casr_min::bridge_ops::parse_session_info_from_path(path)
}

/// Lightweight header-only parse for fast initial scan.
/// Returns only metadata from the first line, with empty message fields.
pub fn parse_session_info_header_only(path: &Path, file_modified: DateTime<Utc>) -> Result<SessionInfo, String> {
    // Use path detection first, then a bounded header probe for custom Pi roots.
    if let Some(provider) = detect_provider_from_path_or_probe(path) {
        if provider == ProviderKind::Pi || provider == ProviderKind::Omp {
            return crate::domain::pi_session::parse_pi_session_header_only(path, file_modified);
        }
    }
    // For non-Pi formats, fall back to full parse (they're typically smaller)
    let (info, _) = parse_session_info_from_path(path)?;
    Ok(info)
}

fn detect_provider_from_path_or_probe(path: &Path) -> Option<ProviderKind> {
    if let Some(provider) = crate::domain::casr_min::providers::detect_provider(Some(path), "") {
        return Some(provider);
    }

    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = vec![0u8; PROVIDER_DETECTION_PROBE_BYTES];
    let bytes_read = file.read(&mut buffer).ok()?;
    buffer.truncate(bytes_read);

    let probe = String::from_utf8_lossy(&buffer);
    detect_provider(Some(path), &probe)
}

pub fn parse_session_entries_from_path(path: &Path) -> Result<Vec<SessionEntry>, String> {
    crate::domain::casr_min::bridge_ops::parse_session_entries_from_path(path)
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
    let normalized = path.to_string_lossy().replace('\\', "/");
    if is_opencode_db_path(path) || normalized.contains("/opencode.db/") {
        return crate::domain::casr_min::providers::opencode::backing_store_path(path);
    }
    if is_cursor_db_path(path) || crate::domain::casr_min::providers::cursor::matches_path(path) {
        return crate::domain::casr_min::providers::cursor::backing_store_path(path);
    }
    path.to_path_buf()
}

pub fn is_gemini_session_file(path: &Path) -> bool {
    crate::domain::casr_min::providers::gemini::is_session_file(path)
}

pub fn is_antigravity_session_file(path: &Path) -> bool {
    crate::domain::casr_min::providers::antigravity::is_transcript_path(path)
}

pub fn is_opencode_db_path(path: &Path) -> bool {
    path.file_name().and_then(|value| value.to_str()) == Some(crate::domain::casr_min::providers::opencode::DB_FILENAME)
}

pub fn is_cursor_db_path(path: &Path) -> bool {
    crate::domain::casr_min::providers::cursor::is_db_path(path)
}

pub fn expand_opencode_session_paths(path: &Path) -> Vec<PathBuf> {
    crate::domain::casr_min::providers::opencode::list_session_paths_in_db(path).unwrap_or_else(|_| vec![path.to_path_buf()])
}

pub fn expand_cursor_session_paths(path: &Path) -> Vec<PathBuf> {
    crate::domain::casr_min::providers::cursor::list_session_paths_in_db(path).unwrap_or_else(|_| vec![path.to_path_buf()])
}

pub fn convert_session_format(path: &Path, target: SessionBridgeSource, options: SessionBridgeConvertOptions) -> Result<SessionBridgeConvertResult, String> {
    if !target.can_convert_target() {
        return Err(format!("Provider {} is scan/source only and cannot be used as a conversion target", target.display_name()));
    }
    if !options.dry_run && !matches!(target, SessionBridgeSource::Pi | SessionBridgeSource::Omp) {
        return super::vendor::convert_session_format(path, target, options.force);
    }

    let (source, canonical) = read_canonical_session_from_path(path)?;
    let target_kind: ProviderKind = target.into();

    if source == target {
        let resume_command = target_kind.resume_command(&canonical.session_id, &canonical.source_path);
        return Ok(SessionBridgeConvertResult {
            source_provider: source.display_name().to_string(),
            target_provider: target.display_name().to_string(),
            source_session_id: canonical.session_id.clone(),
            target_session_id: canonical.session_id.clone(),
            written_paths: vec![canonical.source_path.to_string_lossy().to_string()],
            resume_command,
            dry_run: true,
            warnings: vec!["Source and target provider are the same; skipped writing.".to_string(), "Dry run only; no files were written.".to_string()],
        });
    }

    if !options.dry_run {
        let outcome = crate::domain::casr_min::bridge_ops::convert_canonical_session(source.into(), &canonical, target_kind, false, options.force)?;
        return Ok(SessionBridgeConvertResult {
            source_provider: source.display_name().to_string(),
            target_provider: target.display_name().to_string(),
            source_session_id: canonical.session_id.clone(),
            target_session_id: outcome.target_session_id,
            written_paths: outcome.written_paths.into_iter().map(|path| path.to_string_lossy().to_string()).collect(),
            resume_command: outcome.resume_command,
            dry_run: false,
            warnings: outcome.warnings,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visibility_and_analytics_policy_respect_config() {
        let mut config = Config::default();
        config.external_session_provider_slugs = vec!["codex".to_string()];
        config.scan_other_agent_jsonl = true;
        config.external_sessions_include_in_stats = false;
        config.external_sessions_include_in_search = false;

        let pi_root = crate::paths::pi_agent_sessions_dir().expect("pi sessions root");
        let pi_path_buf = pi_root.join("foo").join("session.jsonl");
        let pi_path = pi_path_buf.as_path();
        let codex_path = Path::new("/Users/demo/.codex/sessions/2026/01/01/rollout-a.jsonl");
        let claude_path = Path::new("/Users/demo/.claude/projects/-Users-demo-work/a-session.jsonl");

        assert!(is_session_visible_under_config(pi_path, &config));
        assert!(is_session_visible_under_config(codex_path, &config));
        assert!(!is_session_visible_under_config(claude_path, &config));

        assert!(is_session_allowed_in_stats(pi_path, &config));
        assert!(!is_session_allowed_in_stats(codex_path, &config));
        assert!(is_session_allowed_in_search(pi_path, &config));
        assert!(!is_session_allowed_in_search(codex_path, &config));

        config.external_sessions_include_in_stats = true;
        config.external_sessions_include_in_search = true;
        assert!(is_session_allowed_in_stats(codex_path, &config));
        assert!(is_session_allowed_in_search(codex_path, &config));
    }
}
