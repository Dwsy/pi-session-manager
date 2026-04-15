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

fn migrate_tags_if_needed() -> Result<(), String> {
    let tags_path = tags_config_path()?;
    let marks_path = session_mark_path()?;

    if tags_path.exists() && marks_path.exists() {
        return Ok(());
    }

    let conn = get_conn()?;
    let migrated_at = Some(Utc::now().to_rfc3339());

    if !tags_path.exists() {
        let tags = crate::data::sqlite::get_all_tags(&conn)?
            .into_iter()
            .map(TagItem::from)
            .collect::<Vec<_>>();
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
        let session_tags = crate::data::sqlite::get_all_session_tags(&conn)?
            .into_iter()
            .map(SessionTagItem::from)
            .collect::<Vec<_>>();
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
        auto_rules: None,
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

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn update_tag_auto_rules(id: String, auto_rules: Option<String>) -> Result<(), String> {
    let mut file = load_tags_file()?;
    let Some(tag) = file.tags.iter_mut().find(|tag| tag.id == id) else {
        return Err(format!("Tag not found: {id}"));
    };
    tag.auto_rules = auto_rules;
    save_tags_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn evaluate_auto_rules(session_id: String, text: String) -> Result<Vec<String>, String> {
    let tags_file = load_tags_file()?;
    let mut marks_file = load_session_marks_file()?;
    let mut matched = Vec::new();

    for tag in &tags_file.tags {
        let rules_json = match &tag.auto_rules {
            Some(value) if !value.is_empty() => value,
            _ => continue,
        };
        let rules: Vec<serde_json::Value> = serde_json::from_str(rules_json).unwrap_or_default();
        for rule in &rules {
            let enabled = rule
                .get("enabled")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            let pattern = rule
                .get("pattern")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if !enabled || pattern.is_empty() {
                continue;
            }
            if let Ok(re) = regex::Regex::new(pattern) {
                if re.is_match(&text) {
                    assign_tag_in_memory(&mut marks_file.session_tags, &session_id, &tag.id);
                    matched.push(tag.id.clone());
                    break;
                }
            }
        }
    }

    if !matched.is_empty() {
        save_session_marks_file(&marks_file)?;
    }

    Ok(matched)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use serde_json::json;
    use std::sync::{Mutex, OnceLock};
    use tempfile::tempdir;

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn lock_env() -> std::sync::MutexGuard<'static, ()> {
        env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn setup_env() -> tempfile::TempDir {
        std::env::remove_var("HOME");
        std::env::remove_var("PPM_TEST_DB");
        let temp = tempdir().expect("tempdir");
        std::env::set_var("HOME", temp.path());
        std::env::set_var("PPM_TEST_DB", temp.path().join("sessions.db"));
        crate::config::save_config(&Config::default()).expect("save config");
        temp
    }

    #[tokio::test]
    async fn migrates_tags_from_db_when_json_missing() {
        let _guard = lock_env();
        let temp = setup_env();
        let conn = get_conn().expect("db conn");

        crate::data::sqlite::create_tag(&conn, "tag-a", "Alpha", "blue", None, None)
            .expect("create db tag");
        crate::data::sqlite::assign_tag(&conn, "session-1", "tag-a").expect("assign db tag");

        let tags = get_all_tags().await.expect("load tags");
        let marks = get_all_session_tags().await.expect("load marks");

        assert!(tags.iter().any(|tag| tag.id == "tag-a"));
        assert_eq!(marks.len(), 1);
        assert_eq!(marks[0].session_id, "session-1");

        let tags_file = load_tags_file().expect("tags file");
        let marks_file = load_session_marks_file().expect("marks file");
        assert!(tags_config_path().expect("tags path").exists());
        assert!(session_mark_path().expect("marks path").exists());
        assert!(tags_file.migrated_at.is_some());
        assert!(marks_file.migrated_at.is_some());

        drop(conn);
        drop(temp);
        std::env::remove_var("PPM_TEST_DB");
        std::env::remove_var("HOME");
    }

    #[tokio::test]
    async fn create_reorder_assign_and_delete_tags_in_json_files() {
        let _guard = lock_env();
        let temp = setup_env();

        let first = create_tag("Alpha".into(), "blue".into(), None, None)
            .await
            .expect("create first tag");
        let second = create_tag("Beta".into(), "green".into(), None, None)
            .await
            .expect("create second tag");

        reorder_tags(vec![second.id.clone(), first.id.clone()])
            .await
            .expect("reorder tags");
        assign_tag("session-1".into(), second.id.clone())
            .await
            .expect("assign second tag");
        remove_tag_from_session("session-1".into(), second.id.clone())
            .await
            .expect("remove tag from session");
        delete_tag(first.id.clone())
            .await
            .expect("delete first tag");

        let tags = get_all_tags().await.expect("get tags after delete");
        let marks = get_all_session_tags()
            .await
            .expect("get marks after delete");
        assert!(tags.iter().any(|tag| tag.id == second.id));
        assert!(!tags.iter().any(|tag| tag.id == first.id));
        assert!(marks.is_empty());

        let tags_file = load_tags_file().expect("tags file");
        assert!(tags_file.tags.iter().any(|tag| tag.id == second.id));

        drop(temp);
        std::env::remove_var("PPM_TEST_DB");
        std::env::remove_var("HOME");
    }

    #[tokio::test]
    async fn evaluate_auto_rules_writes_session_marks() {
        let _guard = lock_env();
        let temp = setup_env();

        let tag = create_tag("Important".into(), "red".into(), None, None)
            .await
            .expect("create tag");
        let rules = json!([
            {
                "enabled": true,
                "pattern": "urgent"
            }
        ]);
        update_tag_auto_rules(tag.id.clone(), Some(rules.to_string()))
            .await
            .expect("update auto rules");

        let matched = evaluate_auto_rules("session-42".into(), "this is urgent work".into())
            .await
            .expect("evaluate rules");
        assert_eq!(matched, vec![tag.id.clone()]);

        let marks = get_all_session_tags()
            .await
            .expect("marks after auto rules");
        assert_eq!(marks.len(), 1);
        assert_eq!(marks[0].session_id, "session-42");
        assert_eq!(marks[0].tag_id, tag.id);

        drop(temp);
        std::env::remove_var("PPM_TEST_DB");
        std::env::remove_var("HOME");
    }
}
