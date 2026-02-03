use crate::{config, sqlite_cache};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FavoriteItem {
    pub id: String,
    #[serde(rename = "type")]
    pub favorite_type: String,
    pub name: String,
    pub path: String,
    pub added_at: String,
}

#[tauri::command]
pub async fn add_favorite(
    id: String,
    favorite_type: String,
    name: String,
    path: String,
) -> Result<(), String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    sqlite_cache::add_favorite(&conn, &id, &favorite_type, &name, &path)?;
    Ok(())
}

#[tauri::command]
pub async fn remove_favorite(id: String) -> Result<(), String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    sqlite_cache::remove_favorite(&conn, &id)?;
    Ok(())
}

#[tauri::command]
pub async fn get_all_favorites() -> Result<Vec<FavoriteItem>, String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    let db_favorites = sqlite_cache::get_all_favorites(&conn)?;
    Ok(db_favorites
        .into_iter()
        .map(|f| FavoriteItem {
            id: f.id,
            favorite_type: f.favorite_type,
            name: f.name,
            path: f.path,
            added_at: f.added_at,
        })
        .collect())
}

#[tauri::command]
pub async fn is_favorite(id: String) -> Result<bool, String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    sqlite_cache::is_favorite(&conn, &id)
}

#[tauri::command]
pub async fn toggle_favorite(
    id: String,
    favorite_type: String,
    name: String,
    path: String,
) -> Result<bool, String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    sqlite_cache::toggle_favorite(&conn, &id, &favorite_type, &name, &path)
}
