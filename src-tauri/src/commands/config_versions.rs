use std::fs;
use std::path::PathBuf;

const MAX_CONFIG_VERSIONS: usize = 50;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigVersion {
    pub id: i64,
    pub file_path: String,
    pub content: String,
    pub created_at: String,
    pub size_bytes: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigVersionMeta {
    pub id: i64,
    pub file_path: String,
    pub created_at: String,
    pub size_bytes: usize,
}

fn get_config_db() -> Result<rusqlite::Connection, String> {
    let db_path = crate::data::sqlite::get_db_path()?;
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| format!("Open config DB: {e}"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS config_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            size_bytes INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cv_file_path ON config_versions(file_path);
        CREATE INDEX IF NOT EXISTS idx_cv_created ON config_versions(created_at DESC);",
    )
    .map_err(|e| format!("Init config_versions table: {e}"))?;
    Ok(conn)
}

pub(super) fn save_config_snapshot(file_path: &str, content: &str) -> Result<(), String> {
    let conn = get_config_db()?;
    let size = content.len();

    conn.execute(
        "INSERT INTO config_versions (file_path, content, size_bytes) VALUES (?1, ?2, ?3)",
        rusqlite::params![file_path, content, size],
    )
    .map_err(|e| format!("Insert snapshot: {e}"))?;

    conn.execute(
        "DELETE FROM config_versions WHERE file_path = ?1 AND id NOT IN (
            SELECT id FROM config_versions WHERE file_path = ?1
            ORDER BY id DESC LIMIT ?2
        )",
        rusqlite::params![file_path, MAX_CONFIG_VERSIONS],
    )
    .map_err(|e| format!("Prune snapshots: {e}"))?;

    Ok(())
}

pub async fn list_config_versions_internal(
    file_path: Option<String>,
) -> Result<Vec<ConfigVersionMeta>, String> {
    let conn = get_config_db()?;
    let mut stmt = if let Some(ref fp) = file_path {
        let mut s = conn
            .prepare(
                "SELECT id, file_path, created_at, size_bytes FROM config_versions
                 WHERE file_path = ?1 ORDER BY id DESC LIMIT ?2",
            )
            .map_err(|e| format!("Prepare: {e}"))?;
        let rows = s
            .query_map(rusqlite::params![fp, MAX_CONFIG_VERSIONS], |row| {
                Ok(ConfigVersionMeta {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    created_at: row.get(2)?,
                    size_bytes: row.get(3)?,
                })
            })
            .map_err(|e| format!("Query: {e}"))?;
        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Collect: {e}"));
    } else {
        conn.prepare(
            "SELECT id, file_path, created_at, size_bytes FROM config_versions
             ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| format!("Prepare: {e}"))?
    };
    let rows = stmt
        .query_map(rusqlite::params![MAX_CONFIG_VERSIONS], |row| {
            Ok(ConfigVersionMeta {
                id: row.get(0)?,
                file_path: row.get(1)?,
                created_at: row.get(2)?,
                size_bytes: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Collect: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_config_versions(
    file_path: Option<String>,
) -> Result<Vec<ConfigVersionMeta>, String> {
    list_config_versions_internal(file_path).await
}

pub async fn get_config_version_internal(id: i64) -> Result<ConfigVersion, String> {
    let conn = get_config_db()?;
    conn.query_row(
        "SELECT id, file_path, content, created_at, size_bytes FROM config_versions WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(ConfigVersion {
                id: row.get(0)?,
                file_path: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                size_bytes: row.get(4)?,
            })
        },
    )
    .map_err(|e| format!("Get version {id}: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_config_version(id: i64) -> Result<ConfigVersion, String> {
    get_config_version_internal(id).await
}

pub async fn restore_config_version_internal(id: i64) -> Result<(), String> {
    let version = get_config_version_internal(id).await?;
    let path = PathBuf::from(&version.file_path);

    if path.exists() {
        let current = fs::read_to_string(&path).map_err(|e| format!("Read current: {e}"))?;
        save_config_snapshot(&version.file_path, &current)?;
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create dir: {e}"))?;
    }
    fs::write(&path, &version.content).map_err(|e| format!("Write restored: {e}"))?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn restore_config_version(id: i64) -> Result<(), String> {
    restore_config_version_internal(id).await
}
