mod auth;
pub mod config_bundle;
pub mod config_versions;
mod datasets;
mod favorites;
mod model_config;
mod models;
#[cfg(feature = "gui")]
mod notification;
#[cfg(feature = "gui")]
mod pi_live;
mod plugin_records;
mod psm_plugins;
pub mod search;
mod session;
// session_file is pub(super) to restrict direct access from outside commands/.
// Its public items are re-exported via `pub use session_file::*;` below for
// external consumers. Direct path `commands::session_file::X` is intentionally
// blocked to prevent tight coupling to internal fork/parse helpers.
pub(super) mod session_file;
mod session_list;
mod session_open;
mod settings;
mod skills;
mod tags;
#[cfg(feature = "gui")]
pub mod terminal;
mod version_check;
mod workspaces;

pub use auth::*;
pub use config_bundle::*;
pub use config_versions::*;
pub use datasets::*;
pub use favorites::*;
pub use model_config::*;
pub use models::*;
#[cfg(feature = "gui")]
pub use notification::*;
#[cfg(feature = "gui")]
pub use pi_live::*;
pub use plugin_records::*;
pub use psm_plugins::*;
pub use search::*;
pub use session::*;
pub use session_file::*;
pub use session_list::*;
pub use session_open::*;
pub use settings::*;
pub use skills::*;
pub use tags::*;
#[cfg(feature = "gui")]
pub use terminal::*;
pub use version_check::*;
pub use workspaces::*;

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn plugin_dispatch_command(state: tauri::State<'_, crate::app_state::SharedAppState>, command: String, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    crate::dispatch::dispatch_with_state(&Some(state.inner().clone()), &command, &payload).await
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
    Ok(())
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn set_window_zoom_level(window: tauri::WebviewWindow, level: f64) -> Result<(), String> {
    window.set_zoom(level).map_err(|e| e.to_string())?;
    crate::settings_store::set("window_zoom_level", &level)?;
    Ok(())
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    app.restart();
}

/// Get lightweight mode (minimize-to-tray on close).
#[cfg(feature = "gui")]
#[tauri::command]
pub async fn get_lightweight_mode() -> Result<bool, String> {
    crate::settings_store::get::<bool>("lightweight_mode").map(|v| v.unwrap_or(false))
}

/// Set lightweight mode and notify frontend.
#[cfg(feature = "gui")]
#[tauri::command]
pub async fn set_lightweight_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    crate::settings_store::set("lightweight_mode", &enabled)?;
    crate::tray::emit_lightweight_mode_changed(&app, enabled);
    Ok(())
}
