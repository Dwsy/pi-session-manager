//! Model configuration domain types
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigBackupMeta {
    pub id: String,
    pub file_path: String,
    pub created_at: String,
    pub size_bytes: u64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelHttpTestResult {
    pub provider: String,
    pub model: String,
    pub api: String,
    pub method: String,
    pub url: String,
    pub status_code: Option<u16>,
    pub ok: bool,
    pub latency_ms: u64,
    pub curl_command: String,
    pub request_body: String,
    pub request_style: String,
    pub response_preview: Option<String>,
    pub attempt_count: u8,
    pub used_fallback: bool,
    pub response_body: String,
    pub error: Option<String>,
}

pub fn sort_model_options(options: &mut [ModelOption]) {
    options.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.model.cmp(&b.model)));
}

/// Ensure models.json has the correct shape
pub fn ensure_model_config_shape(mut json: Value) -> Value {
    if !json.is_object() {
        json = Value::Object(Map::new());
    }
    if !json
        .get("providers")
        .is_some_and(|providers| providers.is_object())
    {
        json["providers"] = Value::Object(Map::new());
    }
    json
}

/// Validate models.json structure
pub fn validate_model_config_shape(json: &Value) -> Result<(), String> {
    if !json.is_object() {
        return Err("models.json root must be an object".to_string());
    }
    if !json
        .get("providers")
        .is_some_and(|providers| providers.is_object())
    {
        return Err("models.json.providers must be an object".to_string());
    }
    Ok(())
}

/// Merge imported config into existing config
pub fn merge_model_config(existing: Value, imported: Value) -> Value {
    use std::collections::btree_map::Entry;

    let mut target = ensure_model_config_shape(existing);
    let source = ensure_model_config_shape(imported);

    let target_providers = match target.get_mut("providers").and_then(|v| v.as_object_mut()) {
        Some(v) => v,
        None => return target,
    };
    let source_providers = match source.get("providers").and_then(|v| v.as_object()) {
        Some(v) => v,
        None => return target,
    };

    for (provider_name, provider_value) in source_providers.clone() {
        target_providers.insert(provider_name, provider_value);
    }

    target
}
