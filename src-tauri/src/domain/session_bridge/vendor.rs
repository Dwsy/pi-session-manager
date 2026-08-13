use std::path::Path;

use casr::discovery::SourceHint;
use casr::pipeline::{ConversionPipeline, ConvertOptions};

use crate::domain::casr_min::providers::{vendored, ProviderKind};
use crate::domain::session_bridge::SessionBridgeConvertResult;
use crate::domain::session_bridge::{CanonicalSession, SessionBridgeSource};

fn casr_slug_from_target(target: SessionBridgeSource) -> &'static str {
    ProviderKind::from(target).casr_slug()
}

fn session_bridge_source_from_casr_slug(slug: &str) -> Result<SessionBridgeSource, String> {
    // OMP shares Pi-Agent's format, so CASR reports both as `pi-agent`.
    // Attribution back to OMP happens in the casr_min path, which is why OMP
    // sessions never reach the vendored reader.
    ProviderKind::parse_alias(slug).map(SessionBridgeSource::from).map_err(|_| format!("Unsupported CASR provider slug: {slug}"))
}

fn session_id_hint_from_path(path: &Path) -> String {
    path.file_stem().and_then(|stem| stem.to_str()).filter(|stem| !stem.trim().is_empty()).unwrap_or("session").to_string()
}

/// Read `path` with the vendored CASR reader for an already-identified provider.
///
/// The provider is passed in rather than resolved by CASR: for files outside a
/// known provider root, `resolve_session` falls back to "whichever parser yields
/// the most messages, ties broken by slug", which lets permissive JSONL readers
/// claim another provider's session. PSM's own path detection is authoritative
/// and also distinguishes OMP from Pi, which CASR does not model.
pub fn read_canonical_session_with_provider(kind: ProviderKind, path: &Path) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let slug = kind.casr_slug();
    let provider = vendored::registry().find_by_slug(slug).ok_or_else(|| format!("CASR provider not registered: {slug}"))?;
    let canonical = provider.read_session(path).map_err(|error| error.to_string())?;
    Ok((kind.into(), vendored::canonical_from_casr(canonical)))
}

/// Read `path` letting CASR identify the provider. Used when PSM's own path
/// detection came up empty.
pub fn read_canonical_session_from_path(path: &Path) -> Result<(SessionBridgeSource, CanonicalSession), String> {
    let session_id = session_id_hint_from_path(path);
    let resolved = vendored::registry().resolve_session(&session_id, Some(&SourceHint::Path(path.to_path_buf()))).map_err(|error| error.to_string())?;
    let source = session_bridge_source_from_casr_slug(resolved.provider.slug())?;
    let canonical = resolved.provider.read_session(&resolved.path).map_err(|error| error.to_string())?;
    Ok((source, vendored::canonical_from_casr(canonical)))
}

pub fn convert_session_format(path: &Path, target: SessionBridgeSource, force: bool, dry_run: bool) -> Result<SessionBridgeConvertResult, String> {
    let target_slug = casr_slug_from_target(target);
    let pipeline = ConversionPipeline { registry: casr::discovery::ProviderRegistry::default_registry() };
    let options = ConvertOptions { dry_run, force, source_hint: Some(path.to_string_lossy().to_string()), ..ConvertOptions::default() };
    let result = pipeline.convert(target_slug, &session_id_hint_from_path(path), options).map_err(|error| error.to_string())?;

    let source = session_bridge_source_from_casr_slug(&result.source_provider)?;
    let source_session_id = result.canonical_session.session_id.clone();

    let (written_paths, target_session_id, resume_command) = match result.written {
        Some(written) => {
            let paths = if written.paths.is_empty() { vec![path.to_string_lossy().to_string()] } else { written.paths.into_iter().map(|value| value.to_string_lossy().to_string()).collect() };
            (paths, written.session_id, written.resume_command)
        }
        // A dry run stops before the writer, so there is no target path yet.
        // The resume command still resolves from the session id, which is what
        // the user actually needs from a preview.
        None => (Vec::new(), source_session_id.clone(), vendored::resume_command(target_slug, &source_session_id)),
    };

    Ok(SessionBridgeConvertResult { source_provider: source.display_name().to_string(), target_provider: target.display_name().to_string(), source_session_id, target_session_id, written_paths, resume_command, dry_run, warnings: result.warnings })
}
