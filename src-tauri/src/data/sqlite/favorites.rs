use super::deps::*;
use super::types::DbFavoriteItem;

pub fn add_favorite(
    conn: &Connection,
    id: &str,
    favorite_type: &str,
    name: &str,
    path: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO favorites (id, type, name, path, added_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, favorite_type, name, path, Utc::now().to_rfc3339()],
    ).map_err(|e| format!("Failed to add favorite: {e}"))?;
    Ok(())
}

pub fn remove_favorite(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM favorites WHERE id = ?", params![id])
        .map_err(|e| format!("Failed to remove favorite: {e}"))?;
    Ok(())
}

pub fn get_all_favorites(conn: &Connection) -> Result<Vec<DbFavoriteItem>, String> {
    let mut stmt = conn
        .prepare("SELECT id, type, name, path, added_at FROM favorites ORDER BY added_at DESC")
        .map_err(|e| format!("Failed to prepare favorites statement: {e}"))?;

    let favorites = stmt
        .query_map([], |row| {
            Ok(DbFavoriteItem {
                id: row.get(0)?,
                favorite_type: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                added_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query favorites: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect favorites: {e}"))?;

    Ok(favorites)
}

pub fn is_favorite(conn: &Connection, id: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM favorites WHERE id = ?",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check favorite: {e}"))?;
    Ok(count > 0)
}

pub fn toggle_favorite(
    conn: &Connection,
    id: &str,
    favorite_type: &str,
    name: &str,
    path: &str,
) -> Result<bool, String> {
    let exists = is_favorite(conn, id)?;
    if exists {
        remove_favorite(conn, id)?;
        Ok(false)
    } else {
        add_favorite(conn, id, favorite_type, name, path)?;
        Ok(true)
    }
}
