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

fn history_dir() -> Result<PathBuf, String> {
    let dir = crate::unified_config::config_root_dir()?.join("history").join("config-versions");
    fs::create_dir_all(&dir).map_err(|e| format!("Create history dir: {e}"))?;
    Ok(dir)
}

fn snapshot_path(id: i64) -> Result<PathBuf, String> {
    Ok(history_dir()?.join(format!("{id}.json")))
}

fn read_version(path: &std::path::Path) -> Result<ConfigVersion, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Read snapshot: {e}"))?;
    serde_json::from_str::<ConfigVersion>(&content).map_err(|e| format!("Parse snapshot: {e}"))
}

fn load_all_versions() -> Result<Vec<ConfigVersion>, String> {
    let dir = history_dir()?;
    let mut versions = Vec::new();

    for entry in fs::read_dir(&dir).map_err(|e| format!("Read history dir: {e}"))? {
        let entry = entry.map_err(|e| format!("Read history entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        if let Ok(version) = read_version(&path) {
            versions.push(version);
        }
    }

    versions.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(versions)
}

fn next_snapshot_id() -> Result<i64, String> {
    let mut id = chrono::Utc::now().timestamp_millis();
    while snapshot_path(id)?.exists() {
        id += 1;
    }
    Ok(id)
}

fn prune_versions(file_path: &str) -> Result<(), String> {
    let versions = load_all_versions()?;
    let mut kept = 0usize;
    for version in versions.into_iter().filter(|version| version.file_path == file_path) {
        kept += 1;
        if kept <= MAX_CONFIG_VERSIONS {
            continue;
        }
        let path = snapshot_path(version.id)?;
        if path.exists() {
            fs::remove_file(path).map_err(|e| format!("Remove old snapshot: {e}"))?;
        }
    }
    Ok(())
}

pub fn save_config_snapshot(file_path: &str, content: &str) -> Result<(), String> {
    let id = next_snapshot_id()?;
    let version = ConfigVersion { id, file_path: file_path.to_string(), content: content.to_string(), created_at: crate::unified_config::snapshot_timestamp(), size_bytes: content.len() };
    let serialized = serde_json::to_string_pretty(&version).map_err(|e| format!("Serialize snapshot: {e}"))?;
    fs::write(snapshot_path(id)?, serialized).map_err(|e| format!("Write snapshot: {e}"))?;
    prune_versions(file_path)
}

pub async fn list_config_versions_internal(file_path: Option<String>) -> Result<Vec<ConfigVersionMeta>, String> {
    let versions = load_all_versions()?;
    Ok(versions
        .into_iter()
        .filter(|version| match file_path.as_ref() {
            Some(path) => &version.file_path == path,
            None => true,
        })
        .take(MAX_CONFIG_VERSIONS)
        .map(|version| ConfigVersionMeta { id: version.id, file_path: version.file_path, created_at: version.created_at, size_bytes: version.size_bytes })
        .collect())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_config_versions(file_path: Option<String>) -> Result<Vec<ConfigVersionMeta>, String> {
    list_config_versions_internal(file_path).await
}

pub async fn get_config_version_internal(id: i64) -> Result<ConfigVersion, String> {
    read_version(&snapshot_path(id)?)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_config_version(id: i64) -> Result<ConfigVersion, String> {
    get_config_version_internal(id).await
}

pub async fn restore_config_version_internal(id: i64) -> Result<(), String> {
    let version = get_config_version_internal(id).await?;
    let (path, section) = crate::unified_config::parse_identifier(&version.file_path)?;

    if let Some(section_name) = section {
        let current = crate::unified_config::read_section_string(&section_name)?;
        save_config_snapshot(&version.file_path, &current)?;
        crate::unified_config::write_section_string(&section_name, &version.content)?;
        return Ok(());
    }

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
