use crate::app_state::SharedAppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_create(
    app: AppHandle,
    state: State<'_, SharedAppState>,
    id: String,
    cwd: String,
    shell: String,
) -> Result<String, String> {
    let event_tx = state.event_tx.clone();
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(id, app, event_tx, cwd, shell)
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
pub async fn terminal_close(
    state: State<'_, SharedAppState>,
    id: String,
) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.close_session(&id)
}

pub fn scan_shells() -> Vec<(String, String)> {
    let candidates: &[(&str, &[&str])] = &[
        ("zsh", &["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"]),
        ("bash", &["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/opt/homebrew/bin/bash"]),
        ("sh", &["/bin/sh", "/usr/bin/sh"]),
        ("fish", &["/usr/local/bin/fish", "/opt/homebrew/bin/fish", "/usr/bin/fish"]),
        ("nu", &["/usr/local/bin/nu", "/opt/homebrew/bin/nu", "/usr/bin/nu"]),
    ];
    let mut shells = Vec::new();
    for (label, paths) in candidates {
        for path in *paths {
            if std::path::Path::new(path).exists() {
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
    Ok(shells.first().map(|(_, p)| p.clone()).unwrap_or_else(|| "/bin/sh".to_string()))
}

#[tauri::command]
pub async fn get_available_shells() -> Result<Vec<(String, String)>, String> {
    Ok(scan_shells())
}
