use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use crate::{config, scanner, sqlite_cache};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeletionMethod {
    Trash,
    PermanentFallback,
    AlreadyMissing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeleteSessionOutcome {
    pub method: DeletionMethod,
}

pub fn delete_session_file_and_cache(path: &str) -> Result<DeleteSessionOutcome, String> {
    if path.trim().is_empty() {
        return Err("Failed to delete session: path is empty".to_string());
    }

    let session_path = Path::new(path);
    let canonical_session_path = fs::canonicalize(session_path).ok().and_then(|canonical| canonical.to_str().map(str::to_string));

    let deletion_method = if !session_path.exists() {
        DeletionMethod::AlreadyMissing
    } else if session_path.is_dir() {
        return Err("Failed to delete session: expected a file path, got directory".to_string());
    } else {
        delete_session_file(session_path)?
    };

    if let Err(error) = cleanup_session_cache(path, canonical_session_path.as_deref()) {
        log::warn!("Session file deleted but cache cleanup failed for {path}: {error}");
    }

    let mut removed_paths = vec![path.to_string()];
    if let Some(canonical) = canonical_session_path.as_deref() {
        if canonical != path {
            removed_paths.push(canonical.to_string());
        }
    }
    scanner::remove_cached_sessions(&removed_paths);

    Ok(DeleteSessionOutcome { method: deletion_method })
}

fn cleanup_session_cache(path: &str, canonical_path: Option<&str>) -> Result<(), String> {
    let app_config = config::Config::load().unwrap_or_default();
    let connection = crate::data::sqlite::init_db_with_config(&app_config)?;

    crate::data::sqlite::delete_session(&connection, path)?;
    let _ = crate::data::sqlite::delete_scan_state(&connection, path);

    if let Some(canonical) = canonical_path {
        if canonical != path {
            crate::data::sqlite::delete_session(&connection, canonical)?;
            let _ = crate::data::sqlite::delete_scan_state(&connection, canonical);
        }
    }

    Ok(())
}

fn delete_session_file(path: &Path) -> Result<DeletionMethod, String> {
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        match trash::delete(path) {
            Ok(_) => Ok(DeletionMethod::Trash),
            Err(error) if is_recoverable_delete_unavailable(&error) => delete_file_permanently(path).map_err(|io_error| format!("Failed to delete session: {io_error}")),
            Err(error) => Err(format!("Failed to move session to trash: {error}")),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        delete_file_permanently(path).map_err(|io_error| format!("Failed to delete session: {io_error}"))
    }
}

fn delete_file_permanently(path: &Path) -> Result<DeletionMethod, std::io::Error> {
    match fs::remove_file(path) {
        Ok(_) => Ok(DeletionMethod::PermanentFallback),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(DeletionMethod::AlreadyMissing),
        Err(error) => Err(error),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn is_recoverable_delete_unavailable(error: &trash::Error) -> bool {
    let error_text = error.to_string().to_lowercase();

    ["not supported", "unsupported", "trash is disabled", "recycle bin is disabled", "recycle bin unavailable", "trash directory is not available", "can't get application", "can’t get application"].iter().any(|indicator| error_text.contains(indicator))
}
