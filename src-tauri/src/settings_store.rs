use serde::{de::DeserializeOwned, Serialize};
use serde_json::{Map, Value};

fn key_to_path(key: &str) -> Vec<&str> {
    match key {
        "app_settings" => vec!["app"],
        "server_settings" => vec!["server"],
        "session_paths" => vec!["session", "sessionPaths"],
        "window_zoom_level" => vec!["ui", "windowZoomLevel"],
        other => vec!["app", other],
    }
}

fn get_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn set_at_path(root: &mut Value, path: &[&str], value: Value) -> Result<(), String> {
    if path.is_empty() {
        *root = value;
        return Ok(());
    }

    let mut current = root;
    for segment in &path[..path.len() - 1] {
        if !current.is_object() {
            *current = Value::Object(Map::new());
        }
        let object = current
            .as_object_mut()
            .ok_or("Unified config node is not an object".to_string())?;
        current = object
            .entry((*segment).to_string())
            .or_insert_with(|| Value::Object(Map::new()));
    }

    if !current.is_object() {
        *current = Value::Object(Map::new());
    }
    let object = current
        .as_object_mut()
        .ok_or("Unified config node is not an object".to_string())?;
    object.insert(path[path.len() - 1].to_string(), value);
    Ok(())
}

pub fn get<T: DeserializeOwned>(key: &str) -> Result<Option<T>, String> {
    let root = crate::unified_config::load_root()?;
    let path = key_to_path(key);
    let Some(value) = get_at_path(&root, &path).cloned() else {
        return Ok(None);
    };
    let parsed = serde_json::from_value::<T>(value)
        .map_err(|e| format!("Failed to deserialize setting '{key}': {e}"))?;
    Ok(Some(parsed))
}

pub fn set<T: Serialize>(key: &str, value: &T) -> Result<(), String> {
    let mut root = crate::unified_config::load_root()?;
    let json = serde_json::to_value(value)
        .map_err(|e| format!("Failed to serialize setting '{key}': {e}"))?;
    let path = key_to_path(key);
    set_at_path(&mut root, &path, json)?;
    crate::unified_config::save_root(&root)
}

pub fn get_or_default<T: DeserializeOwned + Serialize + Default>(key: &str) -> Result<T, String> {
    match get::<T>(key)? {
        Some(val) => Ok(val),
        None => {
            let default = T::default();
            set(key, &default)?;
            Ok(default)
        }
    }
}
