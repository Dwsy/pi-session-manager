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
    let Ok(mut path) = home_dir() else {
        return Vec::new();
    };
    for component in components {
        path.push(component);
    }
    path.is_dir().then_some(vec![path]).unwrap_or_default()
}

pub fn existing_relative_dir(home: &Path, components: &[&str]) -> Vec<PathBuf> {
    let mut path = home.to_path_buf();
    for component in components {
        path.push(component);
    }
    path.is_dir().then_some(vec![path]).unwrap_or_default()
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

pub fn wsl_distribution_names() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let Ok(output) = std::process::Command::new("wsl.exe").args(["-l", "-q"]).output() else {
            return Vec::new();
        };
        if !output.status.success() {
            return Vec::new();
        }

        return decode_wsl_output(&output.stdout).lines().map(|line| line.trim_matches('\u{feff}').trim().trim_matches('\0').to_string()).filter(|line| !line.is_empty()).collect();
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
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

pub fn wsl_linux_path_to_unc(distro: &str, linux_path: &str) -> PathBuf {
    wsl_linux_path_to_unc_host("wsl.localhost", distro, linux_path)
}

fn wsl_linux_path_to_unc_host(host: &str, distro: &str, linux_path: &str) -> PathBuf {
    let relative = linux_path.trim().trim_start_matches('/').replace('/', "\\");
    if relative.is_empty() {
        PathBuf::from(format!("\\\\{host}\\{distro}\\"))
    } else {
        PathBuf::from(format!("\\\\{host}\\{distro}\\{relative}"))
    }
}

pub fn wsl_unc_path_to_linux(distro: &str, path: &Path) -> Option<String> {
    let normalized = path.to_string_lossy().replace('\\', "/");
    for host in ["//wsl.localhost/", "//wsl$/"] {
        let prefix = format!("{host}{distro}/");
        if normalized.len() >= prefix.len() && normalized[..prefix.len()].eq_ignore_ascii_case(&prefix) {
            return Some(format!("/{}", &normalized[prefix.len()..]));
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn wsl_linux_home(distro: &str) -> Result<String, String> {
    let output = std::process::Command::new("wsl.exe").args(["-d", distro, "--", "sh", "-lc", "printf %s \"$HOME\""]).output().map_err(|error| format!("Failed to query WSL home for {distro}: {error}"))?;
    if !output.status.success() {
        return Err(format!("Failed to query WSL home for {distro}: exit status {}", output.status));
    }
    let home = decode_wsl_output(&output.stdout).trim_matches('\0').trim().to_string();
    if !home.starts_with('/') {
        return Err(format!("WSL distro {distro} returned an invalid HOME: {home}"));
    }
    Ok(home)
}

#[cfg(target_os = "windows")]
pub fn wsl_home_dir(distro: &str) -> Result<PathBuf, String> {
    let linux_home = wsl_linux_home(distro)?;
    let candidates = [wsl_linux_path_to_unc_host("wsl.localhost", distro, &linux_home), wsl_linux_path_to_unc_host("wsl$", distro, &linux_home)];
    candidates.into_iter().find(|path| path.is_dir()).ok_or_else(|| format!("Cannot access WSL home for distro {distro}: {linux_home}"))
}

#[cfg(not(target_os = "windows"))]
pub fn wsl_home_dir(_distro: &str) -> Result<PathBuf, String> {
    Err("WSL runtime is only available on Windows".to_string())
}

pub fn session_runtime_home_dir(config: &crate::config::Config) -> Result<PathBuf, String> {
    match config.session_runtime_environment {
        crate::config::SessionRuntimeEnvironment::Local => home_dir(),
        crate::config::SessionRuntimeEnvironment::Wsl => {
            let distro = config.wsl_distribution.as_deref().map(str::trim).filter(|value| !value.is_empty()).ok_or_else(|| "WSL runtime requires a selected distribution".to_string())?;
            wsl_home_dir(distro)
        }
    }
}

pub fn current_session_home_dir() -> Result<PathBuf, String> {
    let config = crate::config::Config::load().unwrap_or_default();
    session_runtime_home_dir(&config)
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

pub fn omp_root_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".omp"))
}

pub fn omp_agent_root_dir() -> Result<PathBuf, String> {
    Ok(omp_root_dir()?.join("agent"))
}

pub fn omp_agent_sessions_dir() -> Result<PathBuf, String> {
    Ok(omp_agent_root_dir()?.join("sessions"))
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

        assert_eq!(dirs, vec![sessions_dir]);
    }

    #[test]
    fn wsl_linux_path_maps_to_localhost_unc() {
        let path = wsl_linux_path_to_unc("Ubuntu", "/home/demo/.omp/agent/sessions/a.jsonl");
        assert_eq!(path.to_string_lossy(), r"\\wsl.localhost\Ubuntu\home\demo\.omp\agent\sessions\a.jsonl");
    }

    #[test]
    fn wsl_unc_path_maps_back_to_linux_for_both_hosts() {
        let localhost = Path::new(r"\\wsl.localhost\Ubuntu\home\demo\.pi\agent\sessions\a.jsonl");
        let legacy = Path::new(r"\\wsl$\Ubuntu\home\demo\.pi\agent\sessions\a.jsonl");

        assert_eq!(wsl_unc_path_to_linux("Ubuntu", localhost).as_deref(), Some("/home/demo/.pi/agent/sessions/a.jsonl"));
        assert_eq!(wsl_unc_path_to_linux("Ubuntu", legacy).as_deref(), Some("/home/demo/.pi/agent/sessions/a.jsonl"));
    }
}
