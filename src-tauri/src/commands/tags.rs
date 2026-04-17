use crate::{config, sqlite_cache};
use chrono::Utc;
use std::fs;
use std::path::PathBuf;

const TAGS_CONFIG_FILE: &str = "tags_config.json";
const SESSION_MARK_FILE: &str = "session_mark.json";

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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct TagsConfigFile {
    version: u32,
    migrated_at: Option<String>,
    tags: Vec<TagItem>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct SessionMarkFile {
    version: u32,
    migrated_at: Option<String>,
    session_tags: Vec<SessionTagItem>,
}

impl Default for TagsConfigFile {
    fn default() -> Self {
        Self {
            version: 1,
            migrated_at: None,
            tags: Vec::new(),
        }
    }
}

impl Default for SessionMarkFile {
    fn default() -> Self {
        Self {
            version: 1,
            migrated_at: None,
            session_tags: Vec::new(),
        }
    }
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

fn tags_config_path() -> Result<PathBuf, String> {
    Ok(crate::unified_config::config_root_dir()?.join(TAGS_CONFIG_FILE))
}

fn session_mark_path() -> Result<PathBuf, String> {
    Ok(crate::unified_config::config_root_dir()?.join(SESSION_MARK_FILE))
}

fn read_json_file<T: serde::de::DeserializeOwned + Default>(path: &PathBuf) -> Result<T, String> {
    if !path.exists() {
        return Ok(T::default());
    }
    let content = fs::read_to_string(path).map_err(|e| format!("Read {}: {e}", path.display()))?;
    serde_json::from_str(&content).map_err(|e| format!("Parse {}: {e}", path.display()))
}

fn write_json_file<T: serde::Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create {}: {e}", parent.display()))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Serialize {}: {e}", path.display()))?;
    fs::write(path, content).map_err(|e| format!("Write {}: {e}", path.display()))
}

fn table_exists(conn: &rusqlite::Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1",
        rusqlite::params![table],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .unwrap_or(false)
}

fn migrate_tags_if_needed() -> Result<(), String> {
    let tags_path = tags_config_path()?;
    let marks_path = session_mark_path()?;

    if tags_path.exists() && marks_path.exists() {
        return Ok(());
    }

    let conn = get_conn()?;
    let migrated_at = Some(Utc::now().to_rfc3339());

    if !tags_path.exists() {
        let tags = if table_exists(&conn, "tags") {
            crate::data::sqlite::get_all_tags(&conn)?
                .into_iter()
                .map(TagItem::from)
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        write_json_file(
            &tags_path,
            &TagsConfigFile {
                version: 1,
                migrated_at: migrated_at.clone(),
                tags,
            },
        )?;
    }

    if !marks_path.exists() {
        let session_tags = if table_exists(&conn, "session_tags") {
            crate::data::sqlite::get_all_session_tags(&conn)?
                .into_iter()
                .map(SessionTagItem::from)
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        write_json_file(
            &marks_path,
            &SessionMarkFile {
                version: 1,
                migrated_at,
                session_tags,
            },
        )?;
    }

    Ok(())
}

fn load_tags_file() -> Result<TagsConfigFile, String> {
    migrate_tags_if_needed()?;
    read_json_file(&tags_config_path()?)
}

fn save_tags_file(file: &TagsConfigFile) -> Result<(), String> {
    write_json_file(&tags_config_path()?, file)
}

fn load_session_marks_file() -> Result<SessionMarkFile, String> {
    migrate_tags_if_needed()?;
    read_json_file(&session_mark_path()?)
}

fn save_session_marks_file(file: &SessionMarkFile) -> Result<(), String> {
    write_json_file(&session_mark_path()?, file)
}

fn next_sort_order(tags: &[TagItem]) -> i64 {
    tags.iter().map(|tag| tag.sort_order).max().unwrap_or(-1) + 1
}

fn next_position(session_tags: &[SessionTagItem], tag_id: &str) -> i64 {
    session_tags
        .iter()
        .filter(|item| item.tag_id == tag_id)
        .map(|item| item.position)
        .max()
        .unwrap_or(-1)
        + 1
}

fn assign_tag_in_memory(session_tags: &mut Vec<SessionTagItem>, session_id: &str, tag_id: &str) {
    if session_tags
        .iter()
        .any(|item| item.session_id == session_id && item.tag_id == tag_id)
    {
        return;
    }

    let position = next_position(session_tags, tag_id);
    session_tags.push(SessionTagItem {
        session_id: session_id.to_string(),
        tag_id: tag_id.to_string(),
        position,
        assigned_at: Utc::now().to_rfc3339(),
    });
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_tags() -> Result<Vec<TagItem>, String> {
    let mut file = load_tags_file()?;
    file.tags.sort_by_key(|tag| tag.sort_order);
    Ok(file.tags)
}

fn next_tag_id(tags: &[TagItem]) -> String {
    let mut id = format!("tag-{}", Utc::now().timestamp_millis());
    while tags.iter().any(|tag| tag.id == id) {
        id.push('x');
    }
    id
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn create_tag(
    name: String,
    color: String,
    icon: Option<String>,
    parent_id: Option<String>,
) -> Result<TagItem, String> {
    let mut file = load_tags_file()?;
    let tag = TagItem {
        id: next_tag_id(&file.tags),
        name,
        color,
        icon,
        sort_order: next_sort_order(&file.tags),
        is_builtin: false,
        created_at: Utc::now().to_rfc3339(),
        parent_id,
    };
    file.tags.push(tag.clone());
    save_tags_file(&file)?;
    Ok(tag)
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
    let mut file = load_tags_file()?;
    let Some(tag) = file.tags.iter_mut().find(|tag| tag.id == id) else {
        return Err(format!("Tag not found: {id}"));
    };
    if let Some(value) = name {
        tag.name = value;
    }
    if let Some(value) = color {
        tag.color = value;
    }
    if let Some(value) = icon {
        tag.icon = Some(value);
    }
    if let Some(value) = sort_order {
        tag.sort_order = value;
    }
    if let Some(value) = parent_id {
        tag.parent_id = value;
    }
    save_tags_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_tag(id: String) -> Result<(), String> {
    let mut tags_file = load_tags_file()?;
    let mut marks_file = load_session_marks_file()?;
    tags_file.tags.retain(|tag| tag.id != id);
    marks_file.session_tags.retain(|item| item.tag_id != id);
    save_tags_file(&tags_file)?;
    save_session_marks_file(&marks_file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_all_session_tags() -> Result<Vec<SessionTagItem>, String> {
    Ok(load_session_marks_file()?.session_tags)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn assign_tag(session_id: String, tag_id: String) -> Result<(), String> {
    let mut file = load_session_marks_file()?;
    assign_tag_in_memory(&mut file.session_tags, &session_id, &tag_id);
    save_session_marks_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn remove_tag_from_session(session_id: String, tag_id: String) -> Result<(), String> {
    let mut file = load_session_marks_file()?;
    file.session_tags
        .retain(|item| !(item.session_id == session_id && item.tag_id == tag_id));
    save_session_marks_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn move_session_tag(
    session_id: String,
    from_tag_id: Option<String>,
    to_tag_id: String,
    position: i64,
) -> Result<(), String> {
    let mut file = load_session_marks_file()?;
    if let Some(from) = from_tag_id {
        file.session_tags
            .retain(|item| !(item.session_id == session_id && item.tag_id == from));
    }
    file.session_tags
        .retain(|item| !(item.session_id == session_id && item.tag_id == to_tag_id));
    file.session_tags.push(SessionTagItem {
        session_id,
        tag_id: to_tag_id,
        position,
        assigned_at: Utc::now().to_rfc3339(),
    });
    save_session_marks_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn reorder_tags(tag_ids: Vec<String>) -> Result<(), String> {
    let mut file = load_tags_file()?;
    for (index, id) in tag_ids.iter().enumerate() {
        if let Some(tag) = file.tags.iter_mut().find(|tag| &tag.id == id) {
            tag.sort_order = index as i64;
        }
    }
    save_tags_file(&file)
}
