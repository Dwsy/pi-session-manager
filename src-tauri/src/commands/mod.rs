mod auth;
pub mod config_bundle;
pub mod config_versions;
mod favorites;
mod model_config;
mod models;
#[cfg(feature = "gui")]
mod pi_live;
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

pub use auth::*;
pub use config_bundle::*;
pub use config_versions::*;
pub use favorites::*;
pub use model_config::*;
pub use models::*;
#[cfg(feature = "gui")]
pub use pi_live::*;
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
