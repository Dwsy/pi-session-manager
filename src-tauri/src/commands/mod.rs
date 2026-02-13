mod auth_cmds;
mod cache;
mod favorites;
mod models;
mod search;
mod session;
mod settings;
mod skills;
mod tags;
pub mod terminal;

pub use auth_cmds::*;
pub use cache::*;
pub use favorites::*;
pub use models::*;
pub use search::*;
pub use session::*;
pub use settings::*;
pub use skills::*;
pub use tags::*;
pub use terminal::*;

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
