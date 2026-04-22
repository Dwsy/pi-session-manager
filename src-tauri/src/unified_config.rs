use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const CONFIG_FILE_NAME: &str = "config.json";
const LEGACY_SETTINGS_FILE: &str = "settings.json";
const LEGACY_MODELS_FILE: &str = "models.json";
const LEGACY_SESSION_CONFIG_FILE: &str = "session-manager-config.toml";
const LEGACY_SESSION_MANAGER_JSON: &str = "session-manager.json";

pub fn config_root_dir() -> Result<PathBuf, String> {
    let dir = crate::paths::psm_root_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config root dir: {e}"))?;
    Ok(dir)
}

pub fn config_file_path() -> Result<PathBuf, String> {
    Ok(config_root_dir()?.join(CONFIG_FILE_NAME))
}

pub fn config_file_identifier() -> Result<String, String> {
    Ok(config_file_path()?.to_string_lossy().to_string())
}

pub fn section_identifier(section: &str) -> Result<String, String> {
    Ok(format!("{}#{section}", config_file_identifier()?))
}

pub fn parse_identifier(identifier: &str) -> Result<(PathBuf, Option<String>), String> {
    let config_path = config_file_identifier()?;
    if let Some(section) = identifier.strip_prefix(&format!("{config_path}#")) {
        return Ok((PathBuf::from(config_path), Some(section.to_string())));
    }
    Ok((PathBuf::from(identifier), None))
}

fn default_server_section() -> Value {
    json!({
        "ws_enabled": true,
        "ws_port": 52131,
        "http_enabled": true,
        "http_port": 52131,
        "auth_enabled": true,
        "bind_addr": "127.0.0.1",
        "embedding_enabled": false
    })
}

fn default_meta_section() -> Value {
    json!({
        "schemaVersion": 1,
        "migratedAt": null,
        "migrationSources": []
    })
}

fn default_models_section() -> Value {
    json!({ "providers": {} })
}

fn default_root_value() -> Value {
    json!({
        "version": 1,
        "meta": default_meta_section(),
        "server": default_server_section(),
        "session": serde_json::to_value(crate::config::Config::default()).unwrap_or_else(|_| json!({})),
        "app": json!({}),
        "ui": json!({})
    })
}

fn normalize_object(value: Value) -> Value {
    if value.is_object() {
        value
    } else {
        json!({})
    }
}

fn normalize_server_section(value: Value) -> Value {
    let mut merged = default_server_section();
    if let (Some(target), Some(source)) = (merged.as_object_mut(), value.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    merged
}

fn normalize_meta_section(value: Value) -> Value {
    let mut merged = default_meta_section();
    if let (Some(target), Some(source)) = (merged.as_object_mut(), value.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    merged
}

fn normalize_root_value(value: Value) -> Value {
    let mut input = if let Some(map) = value.as_object() { map.clone() } else { Map::new() };

    let meta = normalize_meta_section(input.remove("meta").unwrap_or_else(default_meta_section));
    let server = normalize_server_section(input.remove("server").unwrap_or_else(default_server_section));
    let session = normalize_object(input.remove("session").unwrap_or_else(|| serde_json::to_value(crate::config::Config::default()).unwrap_or_else(|_| json!({}))));
    let app = normalize_object(input.remove("app").unwrap_or_else(|| json!({})));
    let ui = normalize_object(input.remove("ui").unwrap_or_else(|| json!({})));

    let mut root = Map::new();
    root.insert("version".to_string(), Value::from(1));
    root.insert("meta".to_string(), meta);
    root.insert("server".to_string(), server);
    root.insert("session".to_string(), session);
    root.insert("app".to_string(), app);
    root.insert("ui".to_string(), ui);

    Value::Object(root)
}

fn read_json_file(path: &Path) -> Option<Value> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&content).ok()
}

fn legacy_agent_dir() -> Result<PathBuf, String> {
    crate::paths::pi_agent_root_dir()
}

fn legacy_config_dir() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("PPM_TEST_CONFIG_DIR") {
        return Some(PathBuf::from(path));
    }
    dirs::config_dir()
}

fn legacy_db_path() -> Result<PathBuf, String> {
    if let Ok(test_db) = std::env::var("PPM_TEST_DB") {
        return Ok(PathBuf::from(test_db));
    }
    Ok(crate::paths::pi_agent_sessions_dir()?.join("sessions.db"))
}

fn open_legacy_settings_db() -> Option<Connection> {
    let path = legacy_db_path().ok()?;
    if !path.exists() {
        return None;
    }
    let conn = Connection::open(path).ok()?;
    let table_exists = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='settings'", [], |row| row.get::<_, i64>(0)).ok()?;
    if table_exists <= 0 {
        return None;
    }
    Some(conn)
}

fn legacy_db_setting(key: &str) -> Option<Value> {
    let conn = open_legacy_settings_db()?;
    let raw: String = conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn migrate_server_section() -> Value {
    let mut server = default_server_section();

    if let Some(value) = legacy_db_setting("server_settings") {
        server = normalize_server_section(value);
    }

    let mut legacy_candidates = Vec::new();
    if let Some(config_dir) = legacy_config_dir() {
        legacy_candidates.push(config_dir.join("pi-session-manager.json"));
    }
    if let Ok(agent_dir) = legacy_agent_dir() {
        legacy_candidates.push(agent_dir.join(LEGACY_SESSION_MANAGER_JSON));
    }

    for path in legacy_candidates {
        if !path.exists() {
            continue;
        }
        let Some(value) = read_json_file(&path) else {
            continue;
        };
        if let (Some(target), Some(source)) = (server.as_object_mut(), value.as_object()) {
            for key in ["ws_enabled", "ws_port", "http_enabled", "http_port", "auth_enabled", "bind_addr", "embedding_enabled"] {
                if let Some(value) = source.get(key) {
                    target.insert(key.to_string(), value.clone());
                }
            }
        }
        break;
    }

    server
}

fn migrate_session_section() -> Value {
    let mut session = serde_json::to_value(crate::config::Config::default()).unwrap_or_else(|_| json!({}));

    if let Ok(agent_dir) = legacy_agent_dir() {
        let legacy_path = agent_dir.join(LEGACY_SESSION_CONFIG_FILE);
        if legacy_path.exists() {
            if let Ok(content) = fs::read_to_string(&legacy_path) {
                if let Ok(config) = toml::from_str::<crate::config::Config>(&content) {
                    session = serde_json::to_value(config).unwrap_or_else(|_| session.clone());
                }
            }
        }
    }

    if let Some(session_paths) = legacy_db_setting("session_paths") {
        if let Some(paths) = session_paths.as_array() {
            if let Some(obj) = session.as_object_mut() {
                let current_empty = obj.get("session_paths").and_then(Value::as_array).is_none_or(|items| items.is_empty());
                if current_empty {
                    obj.insert("session_paths".to_string(), Value::Array(paths.clone()));
                }
            }
        }
    }

    normalize_object(session)
}

fn migrate_app_section() -> Value {
    if let Some(value) = legacy_db_setting("app_settings") {
        return normalize_object(value);
    }

    if let Some(config_dir) = legacy_config_dir() {
        let legacy_path = config_dir.join("pi-session-manager").join(LEGACY_SETTINGS_FILE);
        if legacy_path.exists() {
            if let Some(value) = read_json_file(&legacy_path) {
                return normalize_object(value);
            }
        }
    }

    json!({})
}

fn migrate_models_section() -> Value {
    if let Ok(agent_dir) = legacy_agent_dir() {
        let legacy_path = agent_dir.join(LEGACY_MODELS_FILE);
        if legacy_path.exists() {
            if let Some(value) = read_json_file(&legacy_path) {
                return normalize_object(value);
            }
        }
    }
    default_models_section()
}

fn migrate_pi_section() -> Value {
    if let Ok(agent_dir) = legacy_agent_dir() {
        let legacy_path = agent_dir.join(LEGACY_SETTINGS_FILE);
        if legacy_path.exists() {
            if let Some(value) = read_json_file(&legacy_path) {
                return normalize_object(value);
            }
        }
    }
    json!({})
}

fn migrate_ui_section() -> Value {
    let mut ui = json!({});
    if let Some(value) = legacy_db_setting("window_zoom_level") {
        if let Some(obj) = ui.as_object_mut() {
            obj.insert("windowZoomLevel".to_string(), value);
        }
    }
    ui
}

fn migration_sources() -> Vec<String> {
    vec![
        "db:settings".to_string(),
        "json:~/.pi/agent/settings.json".to_string(),
        "json:~/.pi/agent/models.json".to_string(),
        "json:dirs::config_dir()/pi-session-manager.json".to_string(),
        "json:dirs::config_dir()/pi-session-manager/settings.json".to_string(),
        "toml:~/.pi/agent/session-manager-config.toml".to_string(),
    ]
}

fn migrate_legacy_root() -> Value {
    normalize_root_value(json!({
        "version": 1,
        "meta": {
            "schemaVersion": 1,
            "migratedAt": snapshot_timestamp(),
            "migrationSources": migration_sources()
        },
        "server": migrate_server_section(),
        "session": migrate_session_section(),
        "app": migrate_app_section(),
        "ui": migrate_ui_section()
    }))
}

pub fn load_root() -> Result<Value, String> {
    let path = config_file_path()?;
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read unified config: {e}"))?;
        let value = serde_json::from_str::<Value>(&content).map_err(|e| format!("Failed to parse unified config: {e}"))?;
        let normalized = normalize_root_value(value);
        let normalized_content = serde_json::to_string_pretty(&normalized).map_err(|e| format!("Failed to serialize unified config: {e}"))?;
        if content != normalized_content {
            fs::write(&path, normalized_content).map_err(|e| format!("Failed to normalize unified config: {e}"))?;
        }
        return Ok(normalized);
    }

    let migrated = migrate_legacy_root();
    save_root(&migrated)?;
    Ok(migrated)
}

pub fn save_root(root: &Value) -> Result<(), String> {
    let path = config_file_path()?;
    let normalized = normalize_root_value(root.clone());
    let content = serde_json::to_string_pretty(&normalized).map_err(|e| format!("Failed to serialize unified config: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write unified config: {e}"))
}

pub fn read_section(section: &str) -> Result<Value, String> {
    let root = load_root()?;
    Ok(root.get(section).cloned().unwrap_or_else(|| default_root_value()[section].clone()))
}

pub fn write_section(section: &str, value: Value) -> Result<(), String> {
    let mut root = load_root()?;
    let Some(map) = root.as_object_mut() else {
        return Err("Unified config root is not an object".to_string());
    };
    map.insert(section.to_string(), value);
    save_root(&Value::Object(map.clone()))
}

pub fn read_section_string(section: &str) -> Result<String, String> {
    let section_value = read_section(section)?;
    serde_json::to_string_pretty(&section_value).map_err(|e| format!("Failed to serialize config section: {e}"))
}

pub fn write_section_string(section: &str, content: &str) -> Result<(), String> {
    let value = serde_json::from_str::<Value>(content).map_err(|e| format!("Failed to parse section JSON: {e}"))?;
    write_section(section, value)
}

pub fn current_config_content() -> Result<String, String> {
    let root = load_root()?;
    serde_json::to_string_pretty(&root).map_err(|e| format!("Failed to serialize config content: {e}"))
}

pub fn backup_root_dir(name: &str) -> Result<PathBuf, String> {
    let dir = config_root_dir()?.join("backups").join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create backup dir: {e}"))?;
    Ok(dir)
}

pub fn snapshot_timestamp() -> String {
    Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
