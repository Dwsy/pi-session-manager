use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const TRUST_REQUIRING_PROJECT_RESOURCES: [&str; 7] = ["settings.json", "extensions", "skills", "prompts", "themes", "SYSTEM.md", "APPEND_SYSTEM.md"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResourceTrust {
    pub cwd: String,
    pub required: bool,
    pub trusted: bool,
    pub decision: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inherited_from: Option<String>,
}

fn normalize_path(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() { path.to_path_buf() } else { std::env::current_dir().map_err(|error| format!("Resolve cwd: {error}"))?.join(path) };
    Ok(absolute.canonicalize().unwrap_or(absolute))
}

fn trust_store_path() -> Result<PathBuf, String> {
    crate::paths::pi_agent_root_dir().map(|path| path.join("trust.json")).map_err(|error| format!("Resolve Pi agent directory: {error}"))
}

fn read_trust_store(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("Read trust store {}: {error}", path.display()))?;
    let value: Value = serde_json::from_str(&content).map_err(|error| format!("Parse trust store {}: {error}", path.display()))?;
    value.as_object().cloned().ok_or_else(|| format!("Invalid trust store {}: expected an object", path.display()))
}

fn find_nearest_decision(store: &Map<String, Value>, cwd: &Path) -> Result<Option<(PathBuf, bool)>, String> {
    let mut current = normalize_path(cwd)?;
    loop {
        let key = current.to_string_lossy();
        if let Some(decision) = store.get(key.as_ref()).and_then(Value::as_bool) {
            return Ok(Some((current, decision)));
        }
        let Some(parent) = current.parent() else {
            return Ok(None);
        };
        if parent == current {
            return Ok(None);
        }
        current = parent.to_path_buf();
    }
}

fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut current = normalize_path(start).ok()?;
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        let parent = current.parent()?;
        if parent == current {
            return None;
        }
        current = parent.to_path_buf();
    }
}

pub(crate) fn ancestor_agents_skill_dirs(cwd: &Path) -> Result<Vec<PathBuf>, String> {
    let mut current = normalize_path(cwd)?;
    let git_root = find_git_root(&current);
    let mut directories = Vec::new();
    loop {
        directories.push(current.join(".agents").join("skills"));
        if git_root.as_ref().is_some_and(|root| root == &current) {
            break;
        }
        let Some(parent) = current.parent() else {
            break;
        };
        if parent == current {
            break;
        }
        current = parent.to_path_buf();
    }
    Ok(directories)
}

pub(crate) fn has_trust_requiring_project_resources(cwd: &Path) -> Result<bool, String> {
    let cwd = normalize_path(cwd)?;
    let project_pi = crate::paths::project_pi_dir(&cwd);
    if TRUST_REQUIRING_PROJECT_RESOURCES.iter().any(|entry| project_pi.join(entry).exists()) {
        return Ok(true);
    }

    let user_agents = crate::paths::home_dir().map_err(|error| format!("Resolve home directory: {error}"))?.join(".agents").join("skills");
    let user_agents = normalize_path(&user_agents)?;
    for directory in ancestor_agents_skill_dirs(&cwd)? {
        let normalized = normalize_path(&directory)?;
        if normalized != user_agents && directory.exists() {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) fn project_trust_decision(cwd: &Path) -> Result<Option<(PathBuf, bool)>, String> {
    let store = read_trust_store(&trust_store_path()?)?;
    find_nearest_decision(&store, cwd)
}

pub(crate) fn is_project_trusted(cwd: &Path) -> Result<bool, String> {
    Ok(project_trust_decision(cwd)?.is_some_and(|(_, decision)| decision))
}

pub async fn get_project_resource_trust_internal(cwd: String) -> Result<ProjectResourceTrust, String> {
    let normalized = normalize_path(Path::new(&cwd))?;
    let required = has_trust_requiring_project_resources(&normalized)?;
    let nearest = project_trust_decision(&normalized)?;
    let decision = nearest.as_ref().map(|(_, decision)| *decision);
    Ok(ProjectResourceTrust { cwd: normalized.to_string_lossy().to_string(), required, trusted: !required || decision == Some(true), decision, inherited_from: nearest.map(|(path, _)| path.to_string_lossy().to_string()) })
}

pub async fn set_project_resource_trust_internal(cwd: String, trusted: bool) -> Result<ProjectResourceTrust, String> {
    let normalized = normalize_path(Path::new(&cwd))?;
    let path = trust_store_path()?;
    let mut store = read_trust_store(&path)?;
    store.insert(normalized.to_string_lossy().to_string(), Value::Bool(trusted));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Create trust store directory: {error}"))?;
    }
    let content = serde_json::to_string_pretty(&Value::Object(store)).map_err(|error| format!("Serialize trust store: {error}"))?;
    fs::write(&path, format!("{content}\n")).map_err(|error| format!("Write trust store {}: {error}", path.display()))?;
    get_project_resource_trust_internal(normalized.to_string_lossy().to_string()).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_project_resource_trust(cwd: String) -> Result<ProjectResourceTrust, String> {
    get_project_resource_trust_internal(cwd).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn set_project_resource_trust(cwd: String, trusted: bool) -> Result<ProjectResourceTrust, String> {
    set_project_resource_trust_internal(cwd, trusted).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn nearest_parent_trust_decision_is_inherited() {
        let root = tempdir().unwrap();
        let child = root.path().join("workspace").join("project");
        fs::create_dir_all(&child).unwrap();
        let mut store = Map::new();
        store.insert(root.path().canonicalize().unwrap().to_string_lossy().to_string(), Value::Bool(true));

        let found = find_nearest_decision(&store, &child).unwrap().unwrap();
        assert_eq!(found.0, root.path().canonicalize().unwrap());
        assert!(found.1);
    }

    #[test]
    fn project_pi_resources_require_trust() {
        let root = tempdir().unwrap();
        fs::create_dir_all(root.path().join(".pi").join("skills")).unwrap();

        assert!(has_trust_requiring_project_resources(root.path()).unwrap());
    }
}
