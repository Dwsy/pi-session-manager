use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

pub fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

pub fn read_text(path: impl AsRef<Path>) -> Option<String> {
    std::fs::read_to_string(path.as_ref()).ok().map(|text| text.trim_end_matches('\0').to_string())
}

pub fn read_json(path: impl AsRef<Path>) -> Option<Value> {
    let text = read_text(path)?;
    serde_json::from_str(&text).ok()
}

pub fn json_path<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in keys {
        current = current.get(*key)?;
    }
    Some(current)
}

pub fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    json_path(value, keys)
        .and_then(|item| {
            item.as_str()
                .map(|text| text.trim().to_string())
                .filter(|text| !text.is_empty())
                .or_else(|| item.as_i64().map(|n| n.to_string()))
        })
}

pub fn first_string(candidates: impl IntoIterator<Item = Option<String>>) -> Option<String> {
    candidates.into_iter().flatten().find(|value| !value.trim().is_empty())
}

pub fn read_keychain(service: &str, account: Option<&str>) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("/usr/bin/security");
        cmd.arg("find-generic-password").arg("-s").arg(service).arg("-w");
        if let Some(account) = account {
            if !account.is_empty() {
                cmd.arg("-a").arg(account);
            }
        }
        let output = cmd.output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (service, account);
        None
    }
}

pub fn read_sqlite_map(db_path: &Path, keys: &[&str]) -> Option<std::collections::HashMap<String, String>> {
    if !db_path.exists() {
        return None;
    }
    let conn = rusqlite::Connection::open(db_path).ok()?;
    let placeholders = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT key, value FROM ItemTable WHERE key IN ({placeholders})");
    let mut stmt = conn.prepare(&sql).ok()?;
    let params = keys
        .iter()
        .map(|key| rusqlite::types::Value::Text((*key).to_string()))
        .collect::<Vec<_>>();
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|value| value as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .ok()?;
    let mut map = std::collections::HashMap::new();
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    if map.is_empty() {
        None
    } else {
        Some(map)
    }
}

pub fn read_sqlite_query(db_path: &Path, sql: &str) -> Option<Vec<Vec<String>>> {
    if !db_path.exists() {
        return None;
    }
    let conn = rusqlite::Connection::open(db_path).ok()?;
    let mut stmt = conn.prepare(sql).ok()?;
    let column_count = stmt.column_count();
    let rows = stmt
        .query_map([], |row| {
            let mut values = Vec::with_capacity(column_count);
            for index in 0..column_count {
                let value: rusqlite::types::Value = row.get(index)?;
                values.push(match value {
                    rusqlite::types::Value::Null => String::new(),
                    rusqlite::types::Value::Integer(n) => n.to_string(),
                    rusqlite::types::Value::Real(n) => n.to_string(),
                    rusqlite::types::Value::Text(text) => text,
                    rusqlite::types::Value::Blob(_) => String::new(),
                });
            }
            Ok(values)
        })
        .ok()?;
    Some(rows.flatten().collect())
}

pub fn parse_toml_string(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((left, right)) = trimmed.split_once('=') else { continue };
        if left.trim() != key {
            continue;
        }
        let mut value = right.trim().to_string();
        if value.is_empty() {
            return None;
        }
        let quote = value.chars().next()?;
        if quote == '"' || quote == '\'' {
            let end = value[1..].find(quote)? + 1;
            return Some(value[1..end].trim().to_string()).filter(|text| !text.is_empty());
        }
        if let Some(comment) = value.find('#') {
            value = value[..comment].trim().to_string();
        }
        return Some(value).filter(|text| !text.is_empty());
    }
    None
}

pub fn unwrap_go_keyring(raw: &str) -> String {
    let text = raw.trim();
    if let Some(encoded) = text.strip_prefix("go-keyring-base64:") {
        use base64::Engine;
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
            return String::from_utf8_lossy(&bytes).to_string();
        }
    }
    text.to_string()
}
