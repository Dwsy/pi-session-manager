use super::deps::*;
use super::types::{DbSessionTag, DbTag};

pub fn get_all_tags(conn: &Connection) -> Result<Vec<DbTag>, String> {
    let mut stmt = conn.prepare("SELECT id, name, color, icon, sort_order, is_builtin, created_at, parent_id FROM tags ORDER BY sort_order").map_err(|e| format!("Failed to prepare tags statement: {e}"))?;

    let tags = stmt
        .query_map([], |row| Ok(DbTag { id: row.get(0)?, name: row.get(1)?, color: row.get(2)?, icon: row.get(3)?, sort_order: row.get(4)?, is_builtin: row.get(5)?, created_at: row.get(6)?, parent_id: row.get(7)? }))
        .map_err(|e| format!("Failed to query tags: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect tags: {e}"))?;

    Ok(tags)
}

pub fn create_tag(conn: &Connection, id: &str, name: &str, color: &str, icon: Option<&str>, parent_id: Option<&str>) -> Result<(), String> {
    let max_order: i64 = conn.query_row("SELECT COALESCE(MAX(sort_order), -1) FROM tags", [], |r| r.get(0)).unwrap_or(-1);
    conn.execute("INSERT INTO tags (id, name, color, icon, sort_order, is_builtin, created_at, parent_id) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)", params![id, name, color, icon, max_order + 1, Utc::now().to_rfc3339(), parent_id]).map_err(|e| format!("Failed to create tag: {e}"))?;
    Ok(())
}

pub fn update_tag(conn: &Connection, id: &str, name: Option<&str>, color: Option<&str>, icon: Option<&str>, sort_order: Option<i64>, parent_id: Option<Option<&str>>) -> Result<(), String> {
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(v) = name {
        sets.push("name = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = color {
        sets.push("color = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = icon {
        sets.push("icon = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = sort_order {
        sets.push("sort_order = ?");
        values.push(Box::new(v));
    }
    if let Some(v) = parent_id {
        sets.push("parent_id = ?");
        values.push(Box::new(v.map(|s| s.to_string())));
    }
    if sets.is_empty() {
        return Ok(());
    }
    values.push(Box::new(id.to_string()));
    let sql = format!("UPDATE tags SET {} WHERE id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|b| b.as_ref()).collect();
    conn.execute(&sql, params.as_slice()).map_err(|e| format!("Failed to update tag: {e}"))?;
    Ok(())
}

pub fn delete_tag(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM session_tags WHERE tag_id = ?", params![id]).map_err(|e| format!("Failed to remove tag associations: {e}"))?;
    conn.execute("DELETE FROM tags WHERE id = ?", params![id]).map_err(|e| format!("Failed to delete tag: {e}"))?;
    Ok(())
}

pub fn get_all_session_tags(conn: &Connection) -> Result<Vec<DbSessionTag>, String> {
    let mut stmt = conn.prepare("SELECT session_id, tag_id, position, assigned_at FROM session_tags ORDER BY position").map_err(|e| format!("Failed to prepare session_tags statement: {e}"))?;

    let items = stmt
        .query_map([], |row| Ok(DbSessionTag { session_id: row.get(0)?, tag_id: row.get(1)?, position: row.get(2)?, assigned_at: row.get(3)? }))
        .map_err(|e| format!("Failed to query session_tags: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect session_tags: {e}"))?;

    Ok(items)
}

pub fn assign_tag(conn: &Connection, session_id: &str, tag_id: &str) -> Result<(), String> {
    let max_pos: i64 = conn.query_row("SELECT COALESCE(MAX(position), -1) FROM session_tags WHERE tag_id = ?", params![tag_id], |r| r.get(0)).unwrap_or(-1);
    conn.execute("INSERT OR IGNORE INTO session_tags (session_id, tag_id, position, assigned_at) VALUES (?1, ?2, ?3, ?4)", params![session_id, tag_id, max_pos + 1, Utc::now().to_rfc3339()]).map_err(|e| format!("Failed to assign tag: {e}"))?;
    Ok(())
}

pub fn remove_tag_from_session(conn: &Connection, session_id: &str, tag_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?", params![session_id, tag_id]).map_err(|e| format!("Failed to remove tag: {e}"))?;
    Ok(())
}

pub fn move_session_tag(conn: &Connection, session_id: &str, from_tag_id: Option<&str>, to_tag_id: &str, position: i64) -> Result<(), String> {
    if let Some(from) = from_tag_id {
        conn.execute("DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?", params![session_id, from]).map_err(|e| format!("Failed to remove old tag: {e}"))?;
    }
    conn.execute("INSERT OR REPLACE INTO session_tags (session_id, tag_id, position, assigned_at) VALUES (?1, ?2, ?3, ?4)", params![session_id, to_tag_id, position, Utc::now().to_rfc3339()]).map_err(|e| format!("Failed to move session tag: {e}"))?;
    Ok(())
}

pub fn reorder_tags(conn: &Connection, tag_ids: &[String]) -> Result<(), String> {
    for (i, id) in tag_ids.iter().enumerate() {
        conn.execute("UPDATE tags SET sort_order = ? WHERE id = ?", params![i as i64, id]).map_err(|e| format!("Failed to reorder tag: {e}"))?;
    }
    Ok(())
}
