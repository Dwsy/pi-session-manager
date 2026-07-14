use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub fn home_dir() -> Result<PathBuf, String> {
    // Explicit test override (all platforms). Prefer this over HOME because
    // Windows production code must not trust Git Bash / MSYS HOME values, and
    // dirs::home_dir() uses the Known Folder API (ignores USERPROFILE env).
    if let Ok(home) = std::env::var("PPM_TEST_HOME") {
        return Ok(PathBuf::from(home));
    }
    // On Unix, respect HOME for portability. On Windows, HOME is usually
    // undefined and, when set by Git Bash / MSYS / WSL interop, may point to a
    // Unix-style or UNC path that Win32 cannot open — so prefer dirs::home_dir().
    #[cfg(not(target_os = "windows"))]
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

/// Acquire the test env lock, recovering from a poisoned mutex so one failed
/// env-mutating test does not cascade into every subsequent test.
pub fn acquire_test_env_lock() -> std::sync::MutexGuard<'static, ()> {
    test_env_lock().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Temporarily override process home for tests via `PPM_TEST_HOME`.
///
/// Also sets `HOME` so any Unix-only code paths keep working. Production
/// Windows `home_dir()` ignores `HOME` and uses Known Folder; tests must go
/// through `PPM_TEST_HOME` instead of relying on `USERPROFILE`.
#[cfg(test)]
pub struct TestHomeGuard {
    previous_test_home: Option<std::ffi::OsString>,
    previous_home: Option<std::ffi::OsString>,
}

#[cfg(test)]
impl TestHomeGuard {
    pub fn set(path: impl AsRef<std::path::Path>) -> Self {
        let previous_test_home = std::env::var_os("PPM_TEST_HOME");
        let previous_home = std::env::var_os("HOME");
        std::env::set_var("PPM_TEST_HOME", path.as_ref());
        std::env::set_var("HOME", path.as_ref());
        Self { previous_test_home, previous_home }
    }
}

#[cfg(test)]
impl Drop for TestHomeGuard {
    fn drop(&mut self) {
        match self.previous_test_home.take() {
            Some(value) => std::env::set_var("PPM_TEST_HOME", value),
            None => std::env::remove_var("PPM_TEST_HOME"),
        }
        match self.previous_home.take() {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
    }
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
        let _env_lock = acquire_test_env_lock();
        let temp = tempfile::tempdir().expect("tempdir");
        let sessions_dir = temp.path().join(".codex").join("sessions");
        std::fs::create_dir_all(&sessions_dir).expect("create sessions dir");

        let _home = TestHomeGuard::set(temp.path());
        let dirs = existing_home_relative_dirs(&[".codex", "sessions"]);

        assert!(dirs.iter().any(|dir| dir == &sessions_dir));
    }
}
