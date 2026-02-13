use lazy_static::lazy_static;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static! {
    static ref TOKENS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref ENABLED: Mutex<bool> = Mutex::new(false);
}

#[derive(Debug, Clone, Serialize)]
pub struct TokenInfo {
    pub name: String,
    pub key_preview: String,
    pub created_at: String,
    pub last_used: Option<String>,
}

fn db_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let dir = home.join(".pi").join("agent").join("sessions");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    Ok(dir.join("sessions.db"))
}

fn open_db() -> Result<Connection, String> {
    Connection::open(db_path()?).map_err(|e| format!("Failed to open DB: {e}"))
}

fn ensure_columns(conn: &Connection) {
    // Add last_used column if missing
    let _ = conn.execute("ALTER TABLE auth_tokens ADD COLUMN last_used TEXT", []);
}

pub fn init() -> Result<String, String> {
    let conn = open_db()?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS auth_tokens (
            token TEXT PRIMARY KEY,
            name TEXT,
            created_at TEXT NOT NULL,
            last_used TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create auth_tokens table: {e}"))?;

    ensure_columns(&conn);

    let existing: Option<String> = conn
        .query_row("SELECT token FROM auth_tokens LIMIT 1", [], |row| {
            row.get(0)
        })
        .ok();

    let token = match existing {
        Some(t) => t,
        None => {
            let t = "pi-session-manager".to_string();
            conn.execute(
                "INSERT INTO auth_tokens (token, name, created_at) VALUES (?1, ?2, ?3)",
                params![t, "default", chrono::Utc::now().to_rfc3339()],
            )
            .map_err(|e| format!("Failed to insert token: {e}"))?;
            t
        }
    };

    reload_tokens(&conn)?;
    *ENABLED.lock().unwrap() = true;

    Ok(token)
}

fn reload_tokens(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT token FROM auth_tokens")
        .map_err(|e| format!("Failed to query tokens: {e}"))?;
    let tokens: HashSet<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("{e}"))?
        .filter_map(|r| r.ok())
        .collect();
    *TOKENS.lock().unwrap() = tokens;
    Ok(())
}

pub fn list_tokens() -> Result<Vec<TokenInfo>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare("SELECT token, name, created_at, last_used FROM auth_tokens ORDER BY created_at DESC")
        .map_err(|e| format!("{e}"))?;
    let rows = stmt
        .query_map([], |row| {
            let token: String = row.get(0)?;
            let preview = if token.len() >= 8 {
                format!("{}…", &token[..8])
            } else {
                token.clone()
            };
            Ok(TokenInfo {
                name: row.get(1)?,
                key_preview: preview,
                created_at: row.get(2)?,
                last_used: row.get(3)?,
            })
        })
        .map_err(|e| format!("{e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("{e}"))
}

pub fn create_token(name: &str) -> Result<String, String> {
    let conn = open_db()?;
    let token = generate_token();
    conn.execute(
        "INSERT INTO auth_tokens (token, name, created_at) VALUES (?1, ?2, ?3)",
        params![token, name, chrono::Utc::now().to_rfc3339()],
    )
    .map_err(|e| format!("Failed to create token: {e}"))?;
    reload_tokens(&conn)?;
    Ok(token)
}

pub fn revoke_token(key_preview: &str) -> Result<(), String> {
    let conn = open_db()?;
    let prefix = key_preview.trim_end_matches('…');
    let pattern = format!("{prefix}%");
    let deleted = conn
        .execute("DELETE FROM auth_tokens WHERE token LIKE ?1", params![pattern])
        .map_err(|e| format!("Failed to revoke: {e}"))?;
    if deleted == 0 {
        return Err("Token not found".to_string());
    }
    reload_tokens(&conn)?;
    Ok(())
}

pub fn update_last_used(token: &str) {
    if let Ok(conn) = open_db() {
        let _ = conn.execute(
            "UPDATE auth_tokens SET last_used = ?1 WHERE token = ?2",
            params![chrono::Utc::now().to_rfc3339(), token],
        );
    }
}

pub fn validate(token: &str) -> bool {
    let valid = TOKENS.lock().unwrap().contains(token);
    if valid {
        update_last_used(token);
    }
    valid
}

pub fn is_auth_required(ip: &IpAddr) -> bool {
    *ENABLED.lock().unwrap() && !ip.is_loopback()
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
    // Fallback
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let bytes = nanos.to_le_bytes();
    buf[..16].copy_from_slice(&bytes);
    buf[16..32].copy_from_slice(&std::process::id().to_le_bytes().repeat(8)[..16]);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}
