use rusqlite::{params, Connection};
use serde::{de::DeserializeOwned, Serialize};

fn open_db() -> Result<Connection, String> {
    let db_path = crate::sqlite_cache::get_db_path()?;
    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open settings DB: {}", e))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create settings table: {}", e))?;
    Ok(conn)
}

pub fn get<T: DeserializeOwned>(key: &str) -> Result<Option<T>, String> {
    let conn = open_db()?;
    let result: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| {
            row.get(0)
        })
        .ok();
    match result {
        Some(json) => {
            let val = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to deserialize setting '{}': {}", key, e))?;
            Ok(Some(val))
        }
        None => Ok(None),
    }
}

pub fn set<T: Serialize>(key: &str, value: &T) -> Result<(), String> {
    let conn = open_db()?;
    let json =
        serde_json::to_string(value).map_err(|e| format!("Failed to serialize setting: {}", e))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, json, now],
    )
    .map_err(|e| format!("Failed to save setting: {}", e))?;
    Ok(())
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
