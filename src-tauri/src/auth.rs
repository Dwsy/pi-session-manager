use lazy_static::lazy_static;
use serde::Serialize;
use std::collections::HashSet;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static! {
    static ref TOKENS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref RUNTIME_TOKENS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref ENABLED: Mutex<bool> = Mutex::new(false);
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct TokenInfo {
    pub name: String,
    pub key_preview: String,
    pub created_at: String,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredToken {
    token: String,
    name: String,
    created_at: String,
    last_used: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthTokensFile {
    version: u32,
    migrated_at: Option<String>,
    tokens: Vec<StoredToken>,
}

impl Default for AuthTokensFile {
    fn default() -> Self {
        Self {
            version: 1,
            migrated_at: None,
            tokens: Vec::new(),
        }
    }
}

fn auth_tokens_path() -> Result<PathBuf, String> {
    Ok(crate::unified_config::config_root_dir()?.join("auth_tokens.json"))
}

fn legacy_db_path() -> Result<PathBuf, String> {
    if let Ok(test_db) = std::env::var("PPM_TEST_DB") {
        return Ok(PathBuf::from(test_db));
    }
    Ok(crate::paths::pi_agent_sessions_dir()?.join("sessions.db"))
}

fn open_legacy_db() -> Result<rusqlite::Connection, String> {
    rusqlite::Connection::open(legacy_db_path()?).map_err(|e| format!("Failed to open DB: {e}"))
}

fn table_exists(conn: &rusqlite::Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1",
        rusqlite::params![table],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .unwrap_or(false)
}

fn write_tokens_file(file: &AuthTokensFile) -> Result<(), String> {
    let path = auth_tokens_path()?;
    let content =
        serde_json::to_string_pretty(file).map_err(|e| format!("Serialize auth tokens: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("Write auth tokens: {e}"))
}

fn load_tokens_file() -> Result<AuthTokensFile, String> {
    let path = auth_tokens_path()?;
    if path.exists() {
        let content =
            std::fs::read_to_string(&path).map_err(|e| format!("Read auth tokens: {e}"))?;
        return serde_json::from_str(&content).map_err(|e| format!("Parse auth tokens: {e}"));
    }

    let conn = open_legacy_db()?;
    let tokens = if table_exists(&conn, "auth_tokens") {
        let mut stmt = conn
            .prepare("SELECT token, name, created_at, last_used FROM auth_tokens ORDER BY created_at DESC")
            .map_err(|e| format!("Prepare auth token migration: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(StoredToken {
                    token: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    last_used: row.get(3)?,
                })
            })
            .map_err(|e| format!("Query auth token migration: {e}"))?;
        rows.filter_map(Result::ok).collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    let file = AuthTokensFile {
        version: 1,
        migrated_at: Some(chrono::Utc::now().to_rfc3339()),
        tokens,
    };
    write_tokens_file(&file)?;
    Ok(file)
}

fn reload_tokens() -> Result<(), String> {
    let file = load_tokens_file()?;
    let tokens = file
        .tokens
        .into_iter()
        .map(|item| item.token)
        .collect::<HashSet<_>>();
    *TOKENS.lock().expect("mutex poisoned") = tokens;
    Ok(())
}

pub fn init() -> Result<String, String> {
    let mut file = load_tokens_file()?;

    let token = if let Some(existing) = file.tokens.first() {
        existing.token.clone()
    } else {
        let default = StoredToken {
            token: "pi-session-manager".to_string(),
            name: "default".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            last_used: None,
        };
        let token = default.token.clone();
        file.tokens.push(default);
        write_tokens_file(&file)?;
        token
    };

    reload_tokens()?;
    *ENABLED.lock().expect("mutex poisoned") = true;
    Ok(token)
}

pub fn list_tokens() -> Result<Vec<TokenInfo>, String> {
    let file = load_tokens_file()?;
    Ok(file
        .tokens
        .into_iter()
        .map(|token| TokenInfo {
            name: token.name,
            key_preview: if token.token.len() >= 8 {
                format!("{}…", &token.token[..8])
            } else {
                token.token.clone()
            },
            created_at: token.created_at,
            last_used: token.last_used,
        })
        .collect())
}

pub fn create_token(name: &str, token_value: Option<&str>) -> Result<String, String> {
    let mut file = load_tokens_file()?;
    let token = match token_value {
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err("Token value cannot be empty".to_string());
            }
            trimmed.to_string()
        }
        None => generate_token(),
    };

    if file.tokens.iter().any(|item| item.token == token) {
        return Err("Token already exists".to_string());
    }

    file.tokens.push(StoredToken {
        token: token.clone(),
        name: name.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        last_used: None,
    });
    write_tokens_file(&file)?;
    reload_tokens()?;
    Ok(token)
}

pub fn revoke_token(key_preview: &str) -> Result<(), String> {
    let prefix = key_preview.trim_end_matches('…');
    let mut file = load_tokens_file()?;
    let before = file.tokens.len();
    file.tokens.retain(|item| !item.token.starts_with(prefix));
    if before == file.tokens.len() {
        return Err("Token not found".to_string());
    }
    write_tokens_file(&file)?;
    reload_tokens()?;
    Ok(())
}

pub fn update_last_used(token: &str) {
    if let Ok(mut file) = load_tokens_file() {
        if let Some(item) = file.tokens.iter_mut().find(|item| item.token == token) {
            item.last_used = Some(chrono::Utc::now().to_rfc3339());
            let _ = write_tokens_file(&file);
        }
    }
}

pub fn validate(token: &str) -> bool {
    let runtime_tokens = RUNTIME_TOKENS.lock().expect("mutex poisoned");
    if !runtime_tokens.is_empty() {
        return runtime_tokens.contains(token);
    }
    drop(runtime_tokens);

    let persistent_valid = TOKENS.lock().expect("mutex poisoned").contains(token);
    if persistent_valid {
        update_last_used(token);
        return true;
    }
    false
}

pub fn set_runtime_tokens(tokens: Vec<String>) -> Result<(), String> {
    let mut normalized = HashSet::new();
    for token in tokens {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err("Runtime token cannot be empty".to_string());
        }
        normalized.insert(trimmed.to_string());
    }

    *RUNTIME_TOKENS.lock().expect("mutex poisoned") = normalized;
    Ok(())
}

pub fn is_auth_required(ip: &IpAddr) -> bool {
    *ENABLED.lock().expect("mutex poisoned") && !ip.is_loopback()
}

pub fn is_local(ip: &IpAddr) -> bool {
    ip.is_loopback()
}

fn generate_token() -> String {
    let mut buf = [0u8; 32];
    #[cfg(unix)]
    {
        use std::io::Read;
        if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
            let _ = f.read_exact(&mut buf);
            return buf.iter().map(|b| format!("{b:02x}")).collect();
        }
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("psm-{nanos:x}")
}

