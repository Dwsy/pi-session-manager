use lazy_static::lazy_static;
use serde::Serialize;
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const LEGACY_FIXED_TOKEN: &str = "pi-session-manager";

#[derive(Debug, Clone, Default)]
struct NetworkPolicy {
    trusted_proxies: Vec<String>,
    allowed_origins: Vec<String>,
    remote_terminal_enabled: bool,
}

lazy_static! {
    static ref TOKENS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref RUNTIME_TOKENS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref ENABLED: Mutex<bool> = Mutex::new(false);
    static ref NETWORK_POLICY: Mutex<NetworkPolicy> = Mutex::new(NetworkPolicy::default());
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

#[derive(Debug, Clone)]
pub struct AuthInitResult {
    pub created_or_rotated_token: Option<String>,
    pub active_token_preview: String,
    pub migration_performed: bool,
}

impl Default for AuthTokensFile {
    fn default() -> Self {
        Self { version: 1, migrated_at: None, tokens: Vec::new() }
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
    conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1", rusqlite::params![table], |row| row.get::<_, i64>(0)).map(|count| count > 0).unwrap_or(false)
}

fn ensure_secure_parent(path: &PathBuf) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Auth token path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Create auth token directory: {e}"))?;
    #[cfg(unix)]
    fs::set_permissions(parent, std::os::unix::fs::PermissionsExt::from_mode(0o700)).map_err(|e| format!("Set auth token directory permissions: {e}"))?;
    Ok(())
}

fn write_tokens_file(file: &AuthTokensFile) -> Result<(), String> {
    let path = auth_tokens_path()?;
    ensure_secure_parent(&path)?;
    let content = serde_json::to_vec_pretty(file).map_err(|e| format!("Serialize auth tokens: {e}"))?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| format!("Get token file timestamp: {e}"))?.as_nanos();
    let temp_path = path.with_file_name(format!(".auth_tokens.{nonce}.tmp"));
    let mut temp = OpenOptions::new().write(true).create_new(true).open(&temp_path).map_err(|e| format!("Create auth token temporary file: {e}"))?;
    #[cfg(unix)]
    fs::set_permissions(&temp_path, std::os::unix::fs::PermissionsExt::from_mode(0o600)).map_err(|e| format!("Set auth token file permissions: {e}"))?;
    let result = (|| -> Result<(), String> {
        temp.write_all(&content).map_err(|e| format!("Write auth tokens: {e}"))?;
        temp.sync_all().map_err(|e| format!("Sync auth tokens: {e}"))?;
        drop(temp);
        fs::rename(&temp_path, &path).map_err(|e| format!("Replace auth tokens atomically: {e}"))?;
        #[cfg(unix)]
        fs::set_permissions(&path, std::os::unix::fs::PermissionsExt::from_mode(0o600)).map_err(|e| format!("Set auth token file permissions: {e}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn load_tokens_file() -> Result<AuthTokensFile, String> {
    let path = auth_tokens_path()?;
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("Read auth tokens: {e}"))?;
        #[cfg(unix)]
        fs::set_permissions(&path, std::os::unix::fs::PermissionsExt::from_mode(0o600)).map_err(|e| format!("Set auth token file permissions: {e}"))?;
        return serde_json::from_str(&content).map_err(|e| format!("Parse auth tokens: {e}"));
    }

    let conn = open_legacy_db()?;
    let tokens = if table_exists(&conn, "auth_tokens") {
        let mut stmt = conn.prepare("SELECT token, name, created_at, last_used FROM auth_tokens ORDER BY created_at DESC").map_err(|e| format!("Prepare auth token migration: {e}"))?;
        let rows = stmt.query_map([], |row| Ok(StoredToken { token: row.get(0)?, name: row.get(1)?, created_at: row.get(2)?, last_used: row.get(3)? })).map_err(|e| format!("Query auth token migration: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Read auth token migration: {e}"))?
    } else {
        Vec::new()
    };

    let file = AuthTokensFile { version: 1, migrated_at: Some(chrono::Utc::now().to_rfc3339()), tokens };
    write_tokens_file(&file)?;
    Ok(file)
}

fn reload_tokens() -> Result<(), String> {
    let file = load_tokens_file()?;
    let tokens = file.tokens.into_iter().map(|item| item.token).collect::<HashSet<_>>();
    *TOKENS.lock().expect("mutex poisoned") = tokens;
    Ok(())
}

fn token_preview(token: &str) -> String {
    if token.len() >= 8 {
        format!("{}…", &token[..8])
    } else {
        "<redacted>".to_string()
    }
}

pub fn init() -> Result<AuthInitResult, String> {
    let mut file = load_tokens_file()?;
    let mut created_or_rotated_token = None;
    let mut migration_performed = false;

    if file.tokens.is_empty() {
        let token = generate_token()?;
        file.tokens.push(StoredToken { token: token.clone(), name: "default".to_string(), created_at: chrono::Utc::now().to_rfc3339(), last_used: None });
        created_or_rotated_token = Some(token);
        write_tokens_file(&file)?;
    } else if file.tokens.iter().any(|item| item.token == LEGACY_FIXED_TOKEN) {
        let token = generate_token()?;
        for item in &mut file.tokens {
            if item.token == LEGACY_FIXED_TOKEN {
                item.token = token.clone();
                item.created_at = chrono::Utc::now().to_rfc3339();
                item.last_used = None;
            }
        }
        created_or_rotated_token = Some(token);
        migration_performed = true;
        write_tokens_file(&file)?;
    }

    reload_tokens()?;
    *ENABLED.lock().expect("mutex poisoned") = true;
    let active = file.tokens.first().ok_or_else(|| "Auth token store is empty after initialization".to_string())?;
    Ok(AuthInitResult { created_or_rotated_token, active_token_preview: token_preview(&active.token), migration_performed })
}

pub fn list_tokens() -> Result<Vec<TokenInfo>, String> {
    let file = load_tokens_file()?;
    Ok(file.tokens.into_iter().map(|token| TokenInfo { name: token.name, key_preview: token_preview(&token.token), created_at: token.created_at, last_used: token.last_used }).collect())
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
        None => generate_token()?,
    };
    if file.tokens.iter().any(|item| item.token == token) {
        return Err("Token already exists".to_string());
    }
    file.tokens.push(StoredToken { token: token.clone(), name: name.to_string(), created_at: chrono::Utc::now().to_rfc3339(), last_used: None });
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
    }
    persistent_valid
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

pub fn auth_required() -> bool {
    *ENABLED.lock().expect("mutex poisoned")
}

pub fn is_auth_required(_ip: &IpAddr) -> bool {
    auth_required()
}

pub fn configure_network_policy(trusted_proxies: Vec<String>, allowed_origins: Vec<String>, remote_terminal_enabled: bool) {
    *NETWORK_POLICY.lock().expect("mutex poisoned") = NetworkPolicy { trusted_proxies, allowed_origins, remote_terminal_enabled };
}

fn ip_matches_rule(ip: &IpAddr, rule: &str) -> bool {
    let Some((network, prefix)) = rule.split_once('/') else {
        return rule.parse::<IpAddr>().map(|value| value == *ip).unwrap_or(false);
    };
    let Ok(network) = network.parse::<IpAddr>() else {
        return false;
    };
    let Ok(prefix) = prefix.parse::<u8>() else {
        return false;
    };
    match (network, *ip) {
        (IpAddr::V4(network), IpAddr::V4(ip)) if prefix <= 32 => {
            let mask = if prefix == 0 { 0 } else { u32::MAX << (32 - prefix) };
            u32::from(network) & mask == u32::from(ip) & mask
        }
        (IpAddr::V6(network), IpAddr::V6(ip)) if prefix <= 128 => {
            let mask = if prefix == 0 { 0 } else { u128::MAX << (128 - prefix) };
            u128::from(network) & mask == u128::from(ip) & mask
        }
        _ => false,
    }
}

fn is_trusted_proxy(ip: &IpAddr, policy: &NetworkPolicy) -> bool {
    policy.trusted_proxies.iter().any(|rule| ip_matches_rule(ip, rule))
}

pub fn resolve_client_ip(peer: IpAddr, forwarded_for: Option<&str>) -> IpAddr {
    let policy = NETWORK_POLICY.lock().expect("mutex poisoned").clone();
    if !is_trusted_proxy(&peer, &policy) {
        return peer;
    }
    let Some(header) = forwarded_for else {
        return peer;
    };
    let chain = header.split(',').map(str::trim).map(str::parse::<IpAddr>).collect::<Result<Vec<_>, _>>();
    let Ok(chain) = chain else {
        return peer;
    };
    let mut current = peer;
    for candidate in chain.iter().rev() {
        if !is_trusted_proxy(&current, &policy) {
            return current;
        }
        current = *candidate;
    }
    current
}

pub fn origin_allowed(origin: Option<&str>, host: Option<&str>) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    let policy = NETWORK_POLICY.lock().expect("mutex poisoned").clone();
    if policy.allowed_origins.iter().any(|allowed| allowed == origin) {
        return true;
    }
    let Some(host) = host else {
        return false;
    };
    origin == format!("http://{host}") || origin == "https://tauri.localhost" || origin == "tauri://localhost"
}

pub fn terminal_allowed(peer: IpAddr, has_origin: bool, origin_is_allowed: bool) -> bool {
    if !has_origin || !origin_is_allowed {
        return false;
    }
    let policy = NETWORK_POLICY.lock().expect("mutex poisoned");
    peer.is_loopback() || policy.remote_terminal_enabled
}

pub fn terminal_capability_allowed(peer: IpAddr, has_origin: bool, origin_is_allowed: bool, auth_is_required: bool, authenticated: bool, requested: bool) -> bool {
    if !auth_is_required || !authenticated || !requested {
        return false;
    }
    terminal_allowed(peer, has_origin, origin_is_allowed)
}

pub fn is_terminal_command(command: &str) -> bool {
    matches!(command, "terminal_create" | "terminal_write" | "terminal_resize" | "terminal_close" | "get_default_shell" | "get_available_shells")
}

fn generate_token() -> Result<String, String> {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).map_err(|e| format!("OS CSPRNG unavailable; refusing to create auth token: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};
    use std::sync::Mutex;

    static POLICY_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn rejects_forwarded_for_without_trusted_proxy() {
        let _guard = POLICY_TEST_LOCK.lock().expect("policy test lock poisoned");
        let peer = IpAddr::V4(Ipv4Addr::new(192, 0, 2, 10));
        configure_network_policy(Vec::new(), Vec::new(), false);
        assert_eq!(resolve_client_ip(peer, Some("127.0.0.1")), peer);
    }

    #[test]
    fn resolves_forwarded_for_only_for_trusted_peer() {
        let _guard = POLICY_TEST_LOCK.lock().expect("policy test lock poisoned");
        let peer = IpAddr::V4(Ipv4Addr::new(192, 0, 2, 10));
        configure_network_policy(vec!["192.0.2.0/24".to_string()], Vec::new(), false);
        assert_eq!(resolve_client_ip(peer, Some("198.51.100.20")), IpAddr::V4(Ipv4Addr::new(198, 51, 100, 20)));
    }

    #[test]
    fn terminal_requires_explicit_authenticated_capability() {
        let _guard = POLICY_TEST_LOCK.lock().expect("policy test lock poisoned");
        configure_network_policy(Vec::new(), Vec::new(), false);
        let peer = IpAddr::V4(Ipv4Addr::LOCALHOST);
        assert!(!terminal_capability_allowed(peer, true, true, false, false, true));
        assert!(!terminal_capability_allowed(peer, true, true, true, false, true));
        assert!(!terminal_capability_allowed(peer, true, true, true, true, false));
        assert!(terminal_capability_allowed(peer, true, true, true, true, true));
    }

    #[test]
    fn terminal_requires_origin_and_loopback_by_default() {
        let _guard = POLICY_TEST_LOCK.lock().expect("policy test lock poisoned");
        configure_network_policy(Vec::new(), Vec::new(), false);
        assert!(!terminal_allowed(IpAddr::V4(Ipv4Addr::LOCALHOST), false, true));
        assert!(terminal_allowed(IpAddr::V4(Ipv4Addr::LOCALHOST), true, true));
        assert!(!terminal_allowed(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 10)), true, true));
    }
}
