use lazy_static::lazy_static;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static! {
    static ref TOKENS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref ENABLED: Mutex<bool> = Mutex::new(false);
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

pub fn init() -> Result<String, String> {
    let conn = open_db()?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS auth_tokens (
            token TEXT PRIMARY KEY,
            name TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create auth_tokens table: {e}"))?;

    let existing: Option<String> = conn
        .query_row("SELECT token FROM auth_tokens LIMIT 1", [], |row| {
            row.get(0)
        })
        .ok();

    let token = match existing {
        Some(t) => t,
        None => {
            let t = generate_token();
            conn.execute(
                "INSERT INTO auth_tokens (token, name, created_at) VALUES (?1, ?2, ?3)",
                params![t, "default", chrono::Utc::now().to_rfc3339()],
            )
            .map_err(|e| format!("Failed to insert token: {e}"))?;
            t
        }
    };

    // Load all tokens into memory
    let mut stmt = conn
        .prepare("SELECT token FROM auth_tokens")
        .map_err(|e| format!("Failed to query tokens: {e}"))?;
    let tokens: HashSet<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("{e}"))?
        .filter_map(|r| r.ok())
        .collect();
    *TOKENS.lock().unwrap() = tokens;
    *ENABLED.lock().unwrap() = true;

    Ok(token)
}

pub fn validate(token: &str) -> bool {
    TOKENS.lock().unwrap().contains(token)
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
