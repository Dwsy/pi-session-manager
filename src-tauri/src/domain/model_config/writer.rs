//! Model configuration file writer
use crate::commands::config_versions::save_config_snapshot;
use crate::domain::model_config::backup::create_model_config_backup_internal;
use crate::domain::model_config::reader::get_models_json_path;
use crate::domain::model_config::types::{ensure_model_config_shape, validate_model_config_shape};
use std::fs;

pub fn write_models_config_internal(
    json: serde_json::Value,
    create_backup: bool,
) -> Result<(), String> {
    let json = ensure_model_config_shape(json);
    validate_model_config_shape(&json)?;

    let path = get_models_json_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create models parent dir: {e}"))?;
    }

    if create_backup && path.exists() {
        let _ = create_model_config_backup_internal(None);
    }

    let content =
        serde_json::to_string_pretty(&json).map_err(|e| format!("Serialize models.json: {e}"))?;
    fs::write(&path, &content).map_err(|e| format!("Write models.json: {e}"))?;

    let path_str = path.to_string_lossy().to_string();
    if let Err(e) = save_config_snapshot(&path_str, &content) {
        eprintln!("Warning: failed to save model config snapshot: {e}");
    }

    Ok(())
}
