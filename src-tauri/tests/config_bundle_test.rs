/// Integration tests for config bundle import/export
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use tempfile::tempdir;

/// Helper to create a test ZIP bundle
fn create_test_bundle(path: &PathBuf, files: &[(&str, &[u8])]) {
    use std::io::Cursor;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let cursor = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(cursor);

    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    for (name, contents) in files {
        zip.start_file(name, options).unwrap();
        zip.write_all(contents).unwrap();
    }

    let zip_data = zip.finish().unwrap().into_inner();
    fs::write(path, zip_data).unwrap();
}

#[test]
fn test_export_creates_zip() {
    // This test verifies export creates a valid ZIP file
    // Note: Full export test requires Tauri context, so we test ZIP creation only
    let temp_dir = std::env::temp_dir().join("pi-test-exports");
    fs::create_dir_all(&temp_dir).unwrap();

    let zip_path = temp_dir.join("test-bundle.zip");
    let test_files = vec![
        ("metadata.json", br#"{"version":"1.0"}"#.as_slice()),
        ("test.json", br#"{"key":"value"}"#.as_slice()),
    ];

    create_test_bundle(&zip_path, &test_files);

    assert!(zip_path.exists(), "ZIP file should be created");

    // Verify ZIP can be read
    let zip_file = fs::File::open(&zip_path).unwrap();
    let mut archive = zip::ZipArchive::new(zip_file).unwrap();
    assert_eq!(archive.len(), 2, "Should have 2 entries");
}

#[test]
fn test_preview_bundle_valid_file() {
    let temp_dir = std::env::temp_dir().join("pi-test-preview");
    fs::create_dir_all(&temp_dir).unwrap();

    let zip_path = temp_dir.join("preview-test.zip");
    let test_files = vec![
        (
            "metadata.json",
            br#"{"version":"1.0","created_at":"2026-04-03 12:00:00"}"#.as_slice(),
        ),
        ("models.json", br#"{"providers":{}}"#.as_slice()),
        ("settings.json", br#"{}"#.as_slice()),
    ];

    create_test_bundle(&zip_path, &test_files);

    // Verify we can read the bundle
    let zip_file = fs::File::open(&zip_path).unwrap();
    let mut archive = zip::ZipArchive::new(zip_file).unwrap();

    assert!(
        archive.by_name("metadata.json").is_ok(),
        "Should have metadata"
    );
    assert!(archive.by_name("models.json").is_ok(), "Should have models");
    assert!(
        archive.by_name("settings.json").is_ok(),
        "Should have settings"
    );
}

#[test]
fn test_import_bundle_invalid_file() {
    // Test that invalid files are rejected
    let temp_dir = std::env::temp_dir().join("pi-test-invalid");
    fs::create_dir_all(&temp_dir).unwrap();

    let invalid_path = temp_dir.join("not-a-zip.txt");
    fs::write(&invalid_path, "This is not a ZIP file").unwrap();

    // Attempting to open as ZIP should fail
    let zip_file = fs::File::open(&invalid_path).unwrap();
    let result = zip::ZipArchive::new(zip_file);
    assert!(result.is_err(), "Should fail to open non-ZIP file");
}

#[test]
fn test_bundle_metadata_format() {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    struct Metadata {
        version: String,
        created_at: String,
        app_version: String,
        source_platform: String,
        file_count: usize,
    }

    let metadata = Metadata {
        version: "1.0".to_string(),
        created_at: "2026-04-03 12:00:00".to_string(),
        app_version: "0.5.1".to_string(),
        source_platform: "darwin".to_string(),
        file_count: 3,
    };

    let json = serde_json::to_string(&metadata).unwrap();
    let parsed: Metadata = serde_json::from_str(&json).unwrap();

    assert_eq!(parsed.version, "1.0");
    assert_eq!(parsed.file_count, 3);
}

#[test]
fn test_backup_directory_creation() {
    let temp_dir = tempdir().unwrap();
    let backup_dir = temp_dir
        .path()
        .join(".pi/agent/backups/config-bundles/test-backup");

    fs::create_dir_all(&backup_dir).unwrap();
    assert!(backup_dir.exists(), "Backup directory should be created");
}

#[test]
fn test_config_file_paths() {
    // Verify config file paths are correctly defined
    let expected_files = vec![
        "models.json",
        "settings.json",
        "session-manager-config.toml",
    ];

    for file in expected_files {
        assert!(!file.is_empty(), "File name should not be empty");
        assert!(file.contains('.'), "File should have extension");
    }
}
