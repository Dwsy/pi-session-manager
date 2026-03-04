use crate::app_state::SharedAppState;
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_create(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    id: String,
    cwd: String,
    shell: String,
    rows: u16,
    cols: u16,
) -> Result<String, String> {
    let event_tx = state.event_tx.clone();
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(id, app, event_tx, cwd, shell, rows, cols)
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, SharedAppState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.write_to_session(&id, data)
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, SharedAppState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.resize_session(&id, rows, cols)
}

#[tauri::command]
pub async fn terminal_close(state: State<'_, SharedAppState>, id: String) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.close_session(&id)
}

fn command_exists(executable: &str) -> bool {
    let executable = executable.trim();
    if executable.is_empty() {
        return false;
    }

    let explicit_path = executable.contains('/') || executable.contains('\\');
    if explicit_path || Path::new(executable).is_absolute() {
        return Path::new(executable).is_file();
    }

    let Some(path_var) = std::env::var_os("PATH") else {
        return false;
    };

    #[cfg(target_os = "windows")]
    {
        let has_ext = Path::new(executable).extension().is_some();
        let mut candidates = Vec::new();
        if has_ext {
            candidates.push(executable.to_string());
        } else {
            let path_ext =
                std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
            for ext in path_ext.split(';').filter(|ext| !ext.trim().is_empty()) {
                candidates.push(format!("{executable}{ext}"));
            }
            candidates.push(executable.to_string());
        }

        for dir in std::env::split_paths(&path_var) {
            for candidate in &candidates {
                if dir.join(candidate).is_file() {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::split_paths(&path_var).any(|dir| dir.join(executable).is_file())
    }
}

fn shell_candidate_exists(candidate: &str) -> bool {
    let is_explicit = candidate.contains('/') || candidate.contains('\\');
    if is_explicit || Path::new(candidate).is_absolute() {
        Path::new(candidate).exists()
    } else {
        command_exists(candidate)
    }
}

pub fn scan_shells() -> Vec<(String, String)> {
    #[cfg(target_os = "windows")]
    let candidates: &[(&str, &[&str])] = &[
        (
            "PowerShell",
            &[
                r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
                "powershell.exe",
            ],
        ),
        (
            "pwsh",
            &[r"C:\Program Files\PowerShell\7\pwsh.exe", "pwsh.exe"],
        ),
        ("cmd", &[r"C:\Windows\System32\cmd.exe", "cmd.exe"]),
        (
            "Git Bash",
            &[r"C:\Program Files\Git\bin\bash.exe", "bash.exe"],
        ),
    ];

    #[cfg(not(target_os = "windows"))]
    let candidates: &[(&str, &[&str])] = &[
        (
            "zsh",
            &[
                "/bin/zsh",
                "/usr/bin/zsh",
                "/usr/local/bin/zsh",
                "/opt/homebrew/bin/zsh",
            ],
        ),
        (
            "bash",
            &[
                "/bin/bash",
                "/usr/bin/bash",
                "/usr/local/bin/bash",
                "/opt/homebrew/bin/bash",
            ],
        ),
        ("sh", &["/bin/sh", "/usr/bin/sh"]),
        (
            "fish",
            &[
                "/usr/local/bin/fish",
                "/opt/homebrew/bin/fish",
                "/usr/bin/fish",
            ],
        ),
        (
            "nu",
            &["/usr/local/bin/nu", "/opt/homebrew/bin/nu", "/usr/bin/nu"],
        ),
    ];

    let mut shells = Vec::new();
    for (label, paths) in candidates {
        for path in *paths {
            if shell_candidate_exists(path) {
                shells.push((label.to_string(), path.to_string()));
                break;
            }
        }
    }
    shells
}

#[tauri::command]
pub async fn get_default_shell() -> Result<String, String> {
    let shells = scan_shells();
    let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
    Ok(shells
        .first()
        .map(|(_, p)| p.clone())
        .unwrap_or_else(|| fallback.to_string()))
}

#[tauri::command]
pub async fn get_available_shells() -> Result<Vec<(String, String)>, String> {
    Ok(scan_shells())
}
