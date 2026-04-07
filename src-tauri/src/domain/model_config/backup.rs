//! Model configuration backup management
use crate::domain::model_config::reader::{get_models_json_path, read_models_config_internal};
use crate::domain::model_config::types::ModelConfigBackupMeta;
use crate::utils::string::shell_single_quote;
use chrono::Utc;
use std::fs;
use std::path::PathBuf;

fn models_backup_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    Ok(home.join(".pi/agent/backups/models"))
}

pub fn create_model_config_backup_internal(
    note: Option<String>,
) -> Result<ModelConfigBackupMeta, String> {
    let models_path = get_models_json_path()?;
    if !models_path.exists() {
        return Err("models.json not found".to_string());
    }

    let content = fs::read_to_string(&models_path).map_err(|e| format!("Read models.json: {e}"))?;

    let backup_dir = models_backup_dir()?;
    fs::create_dir_all(&backup_dir).map_err(|e| format!("Create backup dir: {e}"))?;

    let now = Utc::now();
    let id = format!("models-{}", now.format("%Y%m%d-%H%M%S-%3f"));
    let backup_path = backup_dir.join(format!("{id}.json"));
    fs::write(&backup_path, &content).map_err(|e| format!("Write backup: {e}"))?;

    if let Some(ref note_text) = note {
        let note_path = backup_dir.join(format!("{id}.meta.json"));
        let note_json = serde_json::json!({
            "note": note_text,
            "createdAt": now.to_rfc3339(),
        });
        let note_content = serde_json::to_string_pretty(&note_json)
            .map_err(|e| format!("Serialize backup note: {e}"))?;
        fs::write(note_path, note_content).map_err(|e| format!("Write backup note: {e}"))?;
    }

    Ok(ModelConfigBackupMeta {
        id,
        file_path: backup_path.to_string_lossy().to_string(),
        created_at: now.to_rfc3339(),
        size_bytes: content.len() as u64,
        note,
    })
}

pub fn list_model_config_backups_internal() -> Result<Vec<ModelConfigBackupMeta>, String> {
    let backup_dir = models_backup_dir()?;
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();

    for entry in fs::read_dir(&backup_dir).map_err(|e| format!("Read backup dir: {e}"))? {
        let entry = entry.map_err(|e| format!("Read backup entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".meta.json"))
        {
            continue;
        }

        let Some(id) = path.file_stem().and_then(|v| v.to_str()) else {
            continue;
        };

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Read backup metadata: {e}"))?;
        let modified = metadata.modified().ok();
        let created_at = modified
            .map(chrono::DateTime::<chrono::Utc>::from)
            .map(|t| t.to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339());

        let note_path = backup_dir.join(format!("{id}.meta.json"));
        let note = if note_path.exists() {
            fs::read_to_string(&note_path)
                .ok()
                .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
                .and_then(|v| v.get("note").and_then(|n| n.as_str()).map(str::to_string))
        } else {
            None
        };

        backups.push(ModelConfigBackupMeta {
            id: id.to_string(),
            file_path: path.to_string_lossy().to_string(),
            created_at,
            size_bytes: metadata.len(),
            note,
        });
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

pub fn restore_model_config_backup_internal(id: String) -> Result<(), String> {
    let id = sanitize_backup_id(&id)?;
    let backup_path = models_backup_dir()?.join(format!("{id}.json"));
    if !backup_path.exists() {
        return Err(format!("Backup not found: {id}"));
    }

    let content = fs::read_to_string(&backup_path).map_err(|e| format!("Read backup file: {e}"))?;
    let imported: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Parse backup JSON: {e}"))?;
    crate::domain::model_config::writer::write_models_config_internal(imported, true)
}

pub fn delete_model_config_backup_internal(id: String) -> Result<(), String> {
    let id = sanitize_backup_id(&id)?;
    let backup_dir = models_backup_dir()?;
    let backup_path = backup_dir.join(format!("{id}.json"));
    let note_path = backup_dir.join(format!("{id}.meta.json"));

    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|e| format!("Delete backup file: {e}"))?;
    }
    if note_path.exists() {
        fs::remove_file(&note_path).map_err(|e| format!("Delete backup note: {e}"))?;
    }

    Ok(())
}

fn sanitize_backup_id(id: &str) -> Result<String, String> {
    if id.is_empty() {
        return Err("Backup id is empty".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Backup id contains invalid characters".to_string());
    }
    Ok(id.to_string())
}
