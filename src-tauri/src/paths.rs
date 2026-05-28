use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub fn home_dir() -> Result<PathBuf, String> {
    // Respect HOME env var for tests and portability, consistent with sqlite bootstrap
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home));
    }
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
}

pub fn local_and_wsl_home_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(home) = home_dir() {
        dirs.push(home);
    }
    dirs.extend(wsl_home_dirs());
    dedup_paths(dirs)
}

pub fn existing_home_relative_dirs(components: &[&str]) -> Vec<PathBuf> {
    local_and_wsl_home_dirs()
        .into_iter()
        .map(|mut home| {
            for component in components {
                home.push(component);
            }
            home
        })
        .filter(|path| path.is_dir())
        .fold(Vec::new(), |mut dirs, path| {
            if !dirs.iter().any(|existing| existing == &path) {
                dirs.push(path);
            }
            dirs
        })
}

fn dedup_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    paths.into_iter().fold(Vec::new(), |mut deduped, path| {
        if !deduped.iter().any(|existing| existing == &path) {
            deduped.push(path);
        }
        deduped
    })
}

#[cfg(target_os = "windows")]
fn wsl_home_dirs() -> Vec<PathBuf> {
    wsl_distribution_names().into_iter().flat_map(|distro| wsl_unc_home_dirs(&distro)).collect()
}

#[cfg(not(target_os = "windows"))]
fn wsl_home_dirs() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn wsl_distribution_names() -> Vec<String> {
    static WSL_DISTRIBUTIONS: OnceLock<Vec<String>> = OnceLock::new();
    WSL_DISTRIBUTIONS
        .get_or_init(|| {
            let Ok(output) = std::process::Command::new("wsl.exe").args(["-l", "-q"]).output() else {
                return Vec::new();
            };
            if !output.status.success() {
                return Vec::new();
            }

            decode_wsl_output(&output.stdout).lines().map(|line| line.trim_matches('\u{feff}').trim().trim_matches('\0').to_string()).filter(|line| !line.is_empty()).collect()
        })
        .clone()
}

#[cfg(target_os = "windows")]
fn decode_wsl_output(bytes: &[u8]) -> String {
    let looks_utf16 = bytes.len() >= 2 && bytes.chunks_exact(2).filter(|chunk| chunk[1] == 0).count() > bytes.len() / 6;
    if looks_utf16 {
        let words = bytes.chunks_exact(2).map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]])).collect::<Vec<_>>();
        return String::from_utf16_lossy(&words);
    }
    String::from_utf8_lossy(bytes).to_string()
}

#[cfg(target_os = "windows")]
fn wsl_unc_home_dirs(distro: &str) -> Vec<PathBuf> {
    [format!("\\\\wsl.localhost\\{}\\home", distro), format!("\\\\wsl$\\{}\\home", distro)].into_iter().filter_map(|home_root| std::fs::read_dir(home_root).ok()).flat_map(|entries| entries.flatten().map(|entry| entry.path()).collect::<Vec<_>>()).filter(|path| path.is_dir()).collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_home_relative_dirs_finds_local_home_directory() {
        let _guard = test_env_lock().lock().expect("test env lock");
        let previous_home = std::env::var("HOME").ok();
        let temp = tempfile::tempdir().expect("tempdir");
        let sessions_dir = temp.path().join(".codex").join("sessions");
        std::fs::create_dir_all(&sessions_dir).expect("create sessions dir");

        std::env::set_var("HOME", temp.path());
        let dirs = existing_home_relative_dirs(&[".codex", "sessions"]);

        match previous_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }

        assert!(dirs.iter().any(|dir| dir == &sessions_dir));
    }
}
