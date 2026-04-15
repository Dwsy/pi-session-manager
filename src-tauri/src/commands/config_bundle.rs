/// Configuration bundle import/export commands.
///
/// Provides unified export/import of all Pi Agent configuration files
/// as ZIP archives with automatic backup before import.
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::PathBuf;
use std::time::SystemTime;

/// Result of a config import operation.
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_files: Vec<String>,
    pub backup_id: Option<String>,
    pub backup_path: Option<String>,
    pub warnings: Vec<String>,
    pub timestamp: String,
}

/// Preview of what's inside a config bundle.
#[derive(Debug, Serialize, Deserialize)]
pub struct BundlePreview {
    pub file_count: usize,
    pub total_size: u64,
    pub files: Vec<BundleFileInfo>,
    pub created_at: Option<String>,
}

/// Information about a single file in the bundle.
#[derive(Debug, Serialize, Deserialize)]
pub struct BundleFileInfo {
    pub name: String,
    pub size: u64,
    pub exists_locally: bool,
    pub local_size: Option<u64>,
}

/// Metadata stored inside the ZIP archive.
#[derive(Debug, Serialize, Deserialize)]
pub struct BundleMetadata {
    pub version: String,
    pub created_at: String,
    pub app_version: String,
    pub source_platform: String,
    pub file_count: usize,
    pub notes: Option<String>,
}

/// Known config files to include in the bundle.
const CONFIG_FILES: &[(&str, &str)] = &[("config.json", "~/.pi/pi-session-manager/config.json")];

/// Resolve a path that may start with ~ to the home directory.
fn resolve_home_path(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(path)
}

/// Get the backup directory for config bundles.
fn backup_dir() -> PathBuf {
    crate::unified_config::backup_root_dir("config-bundles")
        .unwrap_or_else(|_| PathBuf::from("/tmp/pi-config-backups"))
}

/// Generate a timestamp-based backup ID.
fn generate_backup_id() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    format!(
        "import-{}-{:06}",
        secs / 86400 * 86400, // day-based
        secs % 86400          // time within day
    )
}

/// Format system time as ISO-like string.
fn format_timestamp(time: SystemTime) -> String {
    use chrono::{DateTime, Utc};
    let dt: DateTime<Utc> = time.into();
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Format current time for filename.
fn format_filename_timestamp() -> String {
    use chrono::{DateTime, Utc};
    let now = SystemTime::now();
    let dt: DateTime<Utc> = now.into();
    dt.format("%Y-%m-%d-%H%M%S").to_string()
}

/// Internal: Export all config files to a ZIP archive.
/// Returns the path to the created ZIP file.
pub async fn export_config_bundle_internal() -> Result<String, String> {
    let output_dir = std::env::temp_dir().join("pi-session-manager-exports");
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create export directory: {e}"))?;

    let filename = format!("pi-config-export-{}.zip", format_filename_timestamp());
    let zip_path = output_dir.join(&filename);

    // Create ZIP in memory first
    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    // Add metadata
    let metadata = BundleMetadata {
        version: "1.0".to_string(),
        created_at: format_timestamp(SystemTime::now()),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        source_platform: std::env::consts::OS.to_string(),
        file_count: 0, // Will update after adding files
        notes: None,
    };

    let metadata_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {e}"))?;

    zip.start_file("metadata.json", options)
        .map_err(|e| format!("Failed to write metadata: {e}"))?;
    zip.write_all(metadata_json.as_bytes())
        .map_err(|e| format!("Failed to write metadata: {e}"))?;

    let mut file_count = 0;
    let mut warnings = Vec::new();

    // Add each config file
    for (zip_name, config_path) in CONFIG_FILES {
        let path = resolve_home_path(config_path);
        if path.exists() {
            match fs::read(&path) {
                Ok(contents) => {
                    zip.start_file(zip_name, options)
                        .map_err(|e| format!("Failed to add {zip_name}: {e}"))?;
                    zip.write_all(&contents)
                        .map_err(|e| format!("Failed to write {zip_name}: {e}"))?;
                    file_count += 1;
                }
                Err(e) => {
                    warnings.push(format!("Failed to read {zip_name}: {e}"));
                }
            }
        } else {
            warnings.push(format!("{zip_name} does not exist, skipping"));
        }
    }

    if file_count == 0 {
        return Err("No configuration files found to export".to_string());
    }

    // Update metadata with actual file count
    let mut zip = zip
        .finish()
        .map_err(|e| format!("Failed to finalize ZIP: {e}"))?;

    // Write ZIP to disk
    let zip_data = zip.into_inner();
    fs::write(&zip_path, zip_data).map_err(|e| format!("Failed to write ZIP file: {e}"))?;

    Ok(zip_path.to_string_lossy().to_string())
}

/// Internal: Preview contents of a config bundle without extracting.
pub async fn preview_config_bundle_internal(bundle_path: &str) -> Result<BundlePreview, String> {
    let path = PathBuf::from(bundle_path);
    if !path.exists() {
        return Err(format!("Bundle file not found: {bundle_path}"));
    }

    let zip_file = fs::File::open(&path).map_err(|e| format!("Failed to open bundle: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|e| format!("Invalid ZIP file: {e}"))?;

    let mut files = Vec::new();
    let mut total_size = 0;
    let mut created_at = None;

    // Try to read metadata
    if let Ok(mut meta_file) = archive.by_name("metadata.json") {
        let mut contents = String::new();
        if meta_file.read_to_string(&mut contents).is_ok() {
            if let Ok(meta) = serde_json::from_str::<BundleMetadata>(&contents) {
                created_at = Some(meta.created_at);
            }
        }
    }

    // List all files except metadata
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().to_string();
            if name == "metadata.json" {
                continue; // Skip metadata from file list
            }

            let size = entry.size();
            total_size += size;

            // Check if file exists locally
            let local_path = CONFIG_FILES
                .iter()
                .find(|(zip_name, _)| *zip_name == name)
                .map(|(_, path)| resolve_home_path(path));

            let exists_locally = local_path.as_ref().is_some_and(|p| p.exists());
            let local_size = local_path.and_then(|p| {
                if p.exists() {
                    fs::metadata(&p).ok().map(|m| m.len())
                } else {
                    None
                }
            });

            files.push(BundleFileInfo {
                name,
                size,
                exists_locally,
                local_size,
            });
        }
    }

    Ok(BundlePreview {
        file_count: files.len(),
        total_size,
        files,
        created_at,
    })
}

/// Internal: Import config files from a ZIP bundle.
pub async fn import_config_bundle_internal(
    bundle_path: &str,
    create_backup: bool,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(bundle_path);
    if !path.exists() {
        return Err(format!("Bundle file not found: {bundle_path}"));
    }

    let zip_file = fs::File::open(&path).map_err(|e| format!("Failed to open bundle: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|e| format!("Invalid ZIP file: {e}"))?;

    let timestamp = format_timestamp(SystemTime::now());
    let mut imported_files = Vec::new();
    let mut warnings = Vec::new();
    let mut backup_id = None;
    let mut backup_path = None;

    // Create backup if requested
    if create_backup {
        let backup_subdir = generate_backup_id();
        let backup_dir = backup_dir().join(&backup_subdir);
        fs::create_dir_all(&backup_dir)
            .map_err(|e| format!("Failed to create backup directory: {e}"))?;

        // Backup existing config files
        for (zip_name, config_path) in CONFIG_FILES {
            let src = resolve_home_path(config_path);
            if src.exists() {
                let dest = backup_dir.join(zip_name);
                if let Err(e) = fs::copy(&src, &dest) {
                    warnings.push(format!("Failed to backup {zip_name}: {e}"));
                }
            }
        }

        // Write backup metadata
        let backup_meta = serde_json::json!({
            "backup_id": backup_subdir,
            "timestamp": timestamp,
            "source_bundle": bundle_path,
        });
        let meta_path = backup_dir.join("import-meta.json");
        if let Err(e) = fs::write(meta_path, backup_meta.to_string()) {
            warnings.push(format!("Failed to write backup metadata: {e}"));
        }

        backup_id = Some(backup_subdir);
        backup_path = Some(backup_dir.to_string_lossy().to_string());
    }

    // Extract config files
    for (zip_name, config_path) in CONFIG_FILES {
        if let Ok(mut file) = archive.by_name(zip_name) {
            let mut contents = Vec::new();
            if file.read_to_end(&mut contents).is_ok() {
                let dest = resolve_home_path(config_path);

                // Ensure parent directory exists
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create directory: {e}"))?;
                }

                fs::write(&dest, &contents)
                    .map_err(|e| format!("Failed to write {zip_name}: {e}"))?;

                imported_files.push(zip_name.to_string());
            } else {
                warnings.push(format!("Failed to read {zip_name} from bundle"));
            }
        } else {
            warnings.push(format!("{zip_name} not found in bundle"));
        }
    }

    if imported_files.is_empty() {
        return Err("No configuration files found in bundle".to_string());
    }

    Ok(ImportResult {
        imported_files,
        backup_id,
        backup_path,
        warnings,
        timestamp,
    })
}

/// Internal: Restore the most recent import backup.
pub async fn restore_import_backup_internal() -> Result<String, String> {
    let backup_base = backup_dir();
    if !backup_base.exists() {
        return Err("No backup directory found".to_string());
    }

    // Find the most recent backup directory
    let mut backups = Vec::new();
    for entry in fs::read_dir(&backup_base)
        .map_err(|e| format!("Failed to read backup directory: {e}"))?
        .flatten()
    {
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("import-") {
                    backups.push(path);
                }
            }
        }
    }

    if backups.is_empty() {
        return Err("No import backups found".to_string());
    }

    // Sort by name (timestamp-based) to get most recent
    backups.sort_by(|a, b| {
        b.file_name()
            .cmp(&a.file_name().or(Some(std::ffi::OsStr::new(""))))
    });

    let latest_backup = &backups[0];
    let mut restored = Vec::new();
    let mut warnings = Vec::new();

    // Restore each file
    for (zip_name, config_path) in CONFIG_FILES {
        let backup_file = latest_backup.join(zip_name);
        if backup_file.exists() {
            let dest = resolve_home_path(config_path);
            match fs::copy(&backup_file, &dest) {
                Ok(_) => {
                    restored.push(zip_name.to_string());
                }
                Err(e) => {
                    warnings.push(format!("Failed to restore {zip_name}: {e}"));
                }
            }
        }
    }

    if restored.is_empty() {
        return Err("No files found in backup to restore".to_string());
    }

    Ok(format!(
        "Restored {} files: {}",
        restored.len(),
        restored.join(", ")
    ))
}

/// Tauri command: Export all config files to a ZIP bundle.
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_config_bundle() -> Result<String, String> {
    export_config_bundle_internal().await
}

/// Tauri command: Preview contents of a config bundle.
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn preview_config_bundle(bundle_path: String) -> Result<BundlePreview, String> {
    preview_config_bundle_internal(&bundle_path).await
}

/// Tauri command: Import config files from a ZIP bundle.
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn import_config_bundle(
    bundle_path: String,
    create_backup: Option<bool>,
) -> Result<ImportResult, String> {
    let do_backup = create_backup.unwrap_or(true);
    import_config_bundle_internal(&bundle_path, do_backup).await
}

/// Tauri command: Restore the most recent import backup.
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn restore_import_backup() -> Result<String, String> {
    restore_import_backup_internal().await
}
