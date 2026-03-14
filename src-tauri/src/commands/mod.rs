mod auth_cmds;
mod cache;
mod config_versions;
mod favorites;
mod model_config;
mod models;
pub mod pi_resources;
mod pi_settings;
pub mod search;
mod session;
pub(super) mod session_file;
mod session_list;
mod session_open;
mod settings;
mod skills;
mod tags;
#[cfg(feature = "gui")]
pub mod terminal;

pub use auth_cmds::*;
pub use cache::*;
pub use config_versions::*;
pub use favorites::*;
pub use model_config::*;
pub use models::*;
pub use pi_resources::*;
pub use pi_settings::*;
pub use search::*;
pub use session::*;
pub use settings::*;
pub use skills::*;
pub use tags::*;
#[cfg(feature = "gui")]
pub use terminal::*;

#[cfg(feature = "gui")]
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
