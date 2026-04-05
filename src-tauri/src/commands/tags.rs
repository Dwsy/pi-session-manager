use crate::{config, sqlite_cache};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TagItem {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub is_builtin: bool,
    pub created_at: String,
    pub auto_rules: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionTagItem {
    pub session_id: String,
    pub tag_id: String,
    pub position: i64,
    pub assigned_at: String,
}

impl From<crate::data::sqlite::DbTag> for TagItem {
    fn from(t: crate::data::sqlite::DbTag) -> Self {
        Self {
            id: t.id,
            name: t.name,
            color: t.color,
            icon: t.icon,
            sort_order: t.sort_order,
            is_builtin: t.is_builtin,
            created_at: t.created_at,
            auto_rules: t.auto_rules,
            parent_id: t.parent_id,
        }
    }
}

impl From<crate::data::sqlite::DbSessionTag> for SessionTagItem {
    fn from(t: crate::data::sqlite::DbSessionTag) -> Self {
        Self {
            session_id: t.session_id,
            tag_id: t.tag_id,
            position: t.position,
            assigned_at: t.assigned_at,
        }
    }
}

fn get_conn() -> Result<rusqlite::Connection, String> {
    let config = config::load_config()?;
    crate::data::sqlite::init_db_with_config(&config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_tags() -> Result<Vec<TagItem>, String> {
    let conn = get_conn()?;
    Ok(crate::data::sqlite::get_all_tags(&conn)?
        .into_iter()
        .map(TagItem::from)
        .collect())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn create_tag(
    name: String,
    color: String,
    icon: Option<String>,
    parent_id: Option<String>,
) -> Result<TagItem, String> {
    let conn = get_conn()?;
    let id = format!("tag-{}", chrono::Utc::now().timestamp_millis());
    crate::data::sqlite::create_tag(
        &conn,
        &id,
        &name,
        &color,
        icon.as_deref(),
        parent_id.as_deref(),
    )?;
    crate::data::sqlite::get_all_tags(&conn)?
        .into_iter()
        .find(|t| t.id == id)
        .map(TagItem::from)
        .ok_or_else(|| "Failed to find created tag".to_string())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn update_tag(
    id: String,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    sort_order: Option<i64>,
    parent_id: Option<Option<String>>,
) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::update_tag(
        &conn,
        &id,
        name.as_deref(),
        color.as_deref(),
        icon.as_deref(),
        sort_order,
        parent_id.as_ref().map(|p| p.as_deref()),
    )
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_tag(id: String) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::delete_tag(&conn, &id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_session_tags() -> Result<Vec<SessionTagItem>, String> {
    let conn = get_conn()?;
    Ok(crate::data::sqlite::get_all_session_tags(&conn)?
        .into_iter()
        .map(SessionTagItem::from)
        .collect())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn assign_tag(session_id: String, tag_id: String) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::assign_tag(&conn, &session_id, &tag_id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn remove_tag_from_session(session_id: String, tag_id: String) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::remove_tag_from_session(&conn, &session_id, &tag_id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn move_session_tag(
    session_id: String,
    from_tag_id: Option<String>,
    to_tag_id: String,
    position: i64,
) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::move_session_tag(
        &conn,
        &session_id,
        from_tag_id.as_deref(),
        &to_tag_id,
        position,
    )
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn reorder_tags(tag_ids: Vec<String>) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::reorder_tags(&conn, &tag_ids)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn update_tag_auto_rules(id: String, auto_rules: Option<String>) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::update_tag_auto_rules(&conn, &id, auto_rules.as_deref())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn evaluate_auto_rules(session_id: String, text: String) -> Result<Vec<String>, String> {
    let conn = get_conn()?;
    crate::data::sqlite::evaluate_auto_rules(&conn, &session_id, &text)
}
