//! Model configuration file reader
use crate::domain::model_config::types::{ensure_model_config_shape, validate_model_config_shape};
use std::fs;
use std::path::PathBuf;

fn models_json_path() -> Result<PathBuf, String> {
    crate::paths::pi_agent_models_path().map_err(|_| "No home dir".to_string())
}

pub fn read_models_config_internal() -> Result<serde_json::Value, String> {
    let path = models_json_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({ "providers": {} }));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Read models.json: {e}"))?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("Parse models.json: {e}"))?;
    Ok(ensure_model_config_shape(json))
}

pub fn get_models_json_path() -> Result<PathBuf, String> {
    models_json_path()
}
