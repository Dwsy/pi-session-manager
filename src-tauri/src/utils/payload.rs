//! Payload extraction utilities for dispatch layer
use serde_json::Value;

pub fn extract_string(payload: &Value, key: &str) -> Result<String, String> {
    payload.get(key).and_then(|v| v.as_str()).map(|s| s.to_string()).ok_or_else(|| format!("Missing or invalid field: {key}"))
}

pub fn extract_optional_string(payload: &Value, key: &str) -> Option<String> {
    payload.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

pub fn extract_usize(payload: &Value, key: &str) -> Result<usize, String> {
    payload.get(key).and_then(|v| v.as_u64()).map(|v| v as usize).ok_or_else(|| format!("Missing or invalid field: {key}"))
}

pub fn extract_i64(payload: &Value, key: &str) -> Result<i64, String> {
    payload.get(key).and_then(|v| v.as_i64()).ok_or_else(|| format!("Missing or invalid field: {key}"))
}

pub fn extract_bool(payload: &Value, key: &str, default: bool) -> bool {
    payload.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

pub fn extract_array<T: serde::de::DeserializeOwned>(payload: &Value, key: &str) -> Result<Vec<T>, String> {
    serde_json::from_value(payload.get(key).cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid {key}: {e}"))
}
