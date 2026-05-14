use crate::data::sqlite;
use crate::data::sqlite::bootstrap::VersionDowngradeInfo;
use serde::{Deserialize, Serialize};

/// Result of version downgrade check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionCheckResult {
    pub has_downgrade: bool,
    pub downgrade_info: Option<VersionDowngradeInfo>,
    pub current_app_version: String,
}

/// Check if the database was created with a newer app version (version downgrade).
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn check_version_downgrade() -> Result<VersionCheckResult, String> {
    let db_path = sqlite::get_db_path()?;
    let current_app_version = env!("CARGO_PKG_VERSION").to_string();

    match sqlite::check_version_downgrade(&db_path)? {
        Some(info) => Ok(VersionCheckResult { has_downgrade: true, downgrade_info: Some(info), current_app_version }),
        None => Ok(VersionCheckResult { has_downgrade: false, downgrade_info: None, current_app_version }),
    }
}

/// Backup the current database file
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn backup_database() -> Result<String, String> {
    let db_path = sqlite::get_db_path()?;

    if !db_path.exists() {
        return Err("Database file does not exist".to_string());
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let file_name = db_path.file_name().and_then(|s| s.to_str()).unwrap_or("sessions.db");
    let parent = db_path.parent().unwrap_or_else(|| std::path::Path::new("."));

    let backup_path = parent.join(format!("{}.backup.{}", file_name, timestamp));

    std::fs::copy(&db_path, &backup_path).map_err(|e| format!("Failed to backup database: {e}"))?;

    Ok(backup_path.display().to_string())
}

/// Reset the database by deleting it (after backup)
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn reset_database() -> Result<String, String> {
    let db_path = sqlite::get_db_path()?;

    if !db_path.exists() {
        return Err("Database file does not exist".to_string());
    }

    // Always backup before reset
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let file_name = db_path.file_name().and_then(|s| s.to_str()).unwrap_or("sessions.db");
    let parent = db_path.parent().unwrap_or_else(|| std::path::Path::new("."));

    let backup_path = parent.join(format!("{}.backup.{}", file_name, timestamp));

    std::fs::copy(&db_path, &backup_path).map_err(|e| format!("Failed to backup database before reset: {e}"))?;

    // Delete the database file
    std::fs::remove_file(&db_path).map_err(|e| format!("Failed to delete database: {e}"))?;

    // Also delete WAL and SHM files if they exist
    let wal_path = db_path.with_extension("db-wal");
    let shm_path = db_path.with_extension("db-shm");
    let _ = std::fs::remove_file(&wal_path);
    let _ = std::fs::remove_file(&shm_path);

    // Re-initialize the database
    let _conn = sqlite::init_db()?;

    Ok(format!("Database reset successfully. Backup saved to: {}", backup_path.display()))
}
