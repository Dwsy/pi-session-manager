use crate::{config, sqlite_cache};

#[derive(serde::Serialize, Clone, Debug)]
pub struct ClearCacheResult {
    pub sessions_deleted: usize,
    pub details_deleted: usize,
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn clear_cache() -> Result<ClearCacheResult, String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    let (sessions_deleted, details_deleted) = sqlite_cache::clear_all_cache(&conn)?;
    Ok(ClearCacheResult {
        sessions_deleted,
        details_deleted,
    })
}
