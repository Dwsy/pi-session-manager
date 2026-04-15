use std::path::{Path, PathBuf};

pub fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
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
