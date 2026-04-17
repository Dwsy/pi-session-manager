use chrono::Utc;
use std::fs;
use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FavoriteItem {
    pub id: String,
    #[serde(rename = "type")]
    pub favorite_type: String,
    pub name: String,
    pub path: String,
    pub added_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct FavoritesFile {
    version: u32,
    migrated_at: Option<String>,
    favorites: Vec<FavoriteItem>,
}

fn favorites_path() -> Result<PathBuf, String> {
    Ok(crate::unified_config::config_root_dir()?.join("favorites.json"))
}

fn get_conn() -> Result<rusqlite::Connection, String> {
    let config = crate::config::load_config()?;
    crate::data::sqlite::init_db_with_config(&config)
}

fn write_favorites_file(file: &FavoritesFile) -> Result<(), String> {
    let path = favorites_path()?;
    let content =
        serde_json::to_string_pretty(file).map_err(|e| format!("Serialize favorites: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Write favorites: {e}"))
}

fn load_favorites_file() -> Result<FavoritesFile, String> {
    let path = favorites_path()?;
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("Read favorites: {e}"))?;
        return serde_json::from_str(&content).map_err(|e| format!("Parse favorites: {e}"));
    }

    let conn = get_conn()?;
    let db_favorites = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='favorites'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false)
        .then(|| crate::data::sqlite::get_all_favorites(&conn))
        .transpose()?
        .unwrap_or_default();
    let file = FavoritesFile {
        version: 1,
        migrated_at: Some(Utc::now().to_rfc3339()),
        favorites: db_favorites
            .into_iter()
            .map(|f| FavoriteItem {
                id: f.id,
                favorite_type: f.favorite_type,
                name: f.name,
                path: f.path,
                added_at: f.added_at,
            })
            .collect(),
    };
    write_favorites_file(&file)?;
    Ok(file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn add_favorite(
    id: String,
    favorite_type: String,
    name: String,
    path: String,
) -> Result<(), String> {
    let mut file = load_favorites_file()?;
    file.favorites.retain(|item| item.id != id);
    file.favorites.push(FavoriteItem {
        id,
        favorite_type,
        name,
        path,
        added_at: Utc::now().to_rfc3339(),
    });
    write_favorites_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn remove_favorite(id: String) -> Result<(), String> {
    let mut file = load_favorites_file()?;
    file.favorites.retain(|item| item.id != id);
    write_favorites_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_favorites() -> Result<Vec<FavoriteItem>, String> {
    let mut file = load_favorites_file()?;
    file.favorites.sort_by(|a, b| b.added_at.cmp(&a.added_at));
    Ok(file.favorites)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn is_favorite(id: String) -> Result<bool, String> {
    let file = load_favorites_file()?;
    Ok(file.favorites.iter().any(|item| item.id == id))
}
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn toggle_favorite(
    id: String,
    favorite_type: String,
    name: String,
    path: String,
) -> Result<bool, String> {
    let mut file = load_favorites_file()?;
    if file.favorites.iter().any(|item| item.id == id) {
        file.favorites.retain(|item| item.id != id);
        write_favorites_file(&file)?;
        Ok(false)
    } else {
        file.favorites.push(FavoriteItem {
            id,
            favorite_type,
            name,
            path,
            added_at: Utc::now().to_rfc3339(),
        });
        write_favorites_file(&file)?;
        Ok(true)
    }
}
