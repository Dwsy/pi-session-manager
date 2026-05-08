use crate::app_state::SharedAppState;
use crate::utils::scan_shells;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn terminal_create(app: AppHandle, state: State<'_, SharedAppState>, id: String, cwd: String, shell: String, rows: u16, cols: u16) -> Result<String, String> {
    let event_tx = state.event_tx.clone();
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(id, app, event_tx, cwd, shell, rows, cols)
}

#[tauri::command]
pub async fn terminal_write(state: State<'_, SharedAppState>, id: String, data: String) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.write_to_session(&id, data)
}

#[tauri::command]
pub async fn terminal_resize(state: State<'_, SharedAppState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.resize_session(&id, rows, cols)
}

#[tauri::command]
pub async fn terminal_close(state: State<'_, SharedAppState>, id: String) -> Result<(), String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.close_session(&id)
}

#[tauri::command]
pub async fn get_default_shell() -> Result<String, String> {
    let shells = scan_shells();
    let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
    Ok(shells.first().map(|(_, p)| p.clone()).unwrap_or_else(|| fallback.to_string()))
}

#[tauri::command]
pub async fn get_available_shells() -> Result<Vec<(String, String)>, String> {
    Ok(scan_shells())
}
