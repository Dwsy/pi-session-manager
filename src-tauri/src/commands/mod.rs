mod favorites;
mod models;
mod search;
mod session;
mod settings;
mod skills;

pub use favorites::*;
pub use models::*;
pub use search::*;
pub use session::*;
pub use settings::*;
pub use skills::*;

#[tauri::command]
pub async fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = window;
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        window.close_devtools();
        Ok(())
    }
}
