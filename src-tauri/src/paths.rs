use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub fn home_dir() -> Result<PathBuf, String> {
    // Respect HOME env var for tests and portability, consistent with sqlite bootstrap
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home));
    }
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
}

/// Global lock for tests that mutate HOME/PPM_TEST_DB environment variables.
/// Prevents parallel tests from racing on shared process environment state.
pub fn test_env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn pi_root_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".pi"))
}

pub fn psm_root_dir() -> Result<PathBuf, String> {
    Ok(pi_root_dir()?.join("pi-session-manager"))
}

pub fn pi_agent_root_dir() -> Result<PathBuf, String> {
    Ok(pi_root_dir()?.join("agent"))
}

pub fn pi_agent_sessions_dir() -> Result<PathBuf, String> {
    Ok(pi_agent_root_dir()?.join("sessions"))
}

pub fn pi_agent_settings_path() -> Result<PathBuf, String> {
    Ok(pi_agent_root_dir()?.join("settings.json"))
}

pub fn pi_agent_models_path() -> Result<PathBuf, String> {
    Ok(pi_agent_root_dir()?.join("models.json"))
}

pub fn project_pi_dir(cwd: &Path) -> PathBuf {
    cwd.join(".pi")
}
