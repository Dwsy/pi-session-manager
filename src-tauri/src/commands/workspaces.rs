use chrono::Utc;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const WORKSPACES_FILE: &str = "workspaces.json";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KanbanWorkspaceConfig {
    pub project_filter: Option<String>,
    pub filter_tag_ids: Vec<String>,
    pub source_filter_slugs: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KanbanWorkspace {
    pub id: String,
    pub name: String,
    pub config: KanbanWorkspaceConfig,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct WorkspacesFile {
    version: u32,
    workspaces: Vec<KanbanWorkspace>,
}

impl Default for WorkspacesFile {
    fn default() -> Self {
        Self {
            version: 1,
            workspaces: Vec::new(),
        }
    }
}

fn workspaces_path() -> Result<PathBuf, String> {
    Ok(crate::unified_config::config_root_dir()?.join(WORKSPACES_FILE))
}

fn load_workspaces_file() -> Result<WorkspacesFile, String> {
    let path = workspaces_path()?;
    if !path.exists() {
        return Ok(WorkspacesFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Read workspaces: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Parse workspaces: {e}"))
}

fn save_workspaces_file(file: &WorkspacesFile) -> Result<(), String> {
    let path = workspaces_path()?;
    let content = serde_json::to_string_pretty(file).map_err(|e| format!("Serialize workspaces: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Write workspaces: {e}"))
}

fn next_workspace_id(workspaces: &[KanbanWorkspace]) -> String {
    let mut id = format!("ws-{}", Utc::now().timestamp_millis());
    while workspaces.iter().any(|w| w.id == id) {
        id.push('x');
    }
    id
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_workspaces() -> Result<Vec<KanbanWorkspace>, String> {
    let file = load_workspaces_file()?;
    Ok(file.workspaces)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_workspace(workspace: Value) -> Result<(), String> {
    let mut ws: KanbanWorkspace = serde_json::from_value(workspace).map_err(|e| format!("Invalid workspace: {e}"))?;
    let mut file = load_workspaces_file()?;
    if ws.id.is_empty() || ws.id == "__new__" {
        ws.id = next_workspace_id(&file.workspaces);
    }
    ws.updated_at = Utc::now().to_rfc3339();
    if let Some(existing) = file.workspaces.iter_mut().find(|w| w.id == ws.id) {
        *existing = ws;
    } else {
        if ws.created_at.is_empty() {
            ws.created_at = Utc::now().to_rfc3339();
        }
        file.workspaces.push(ws);
    }
    save_workspaces_file(&file)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_workspace(id: String) -> Result<(), String> {
    let mut file = load_workspaces_file()?;
    file.workspaces.retain(|w| w.id != id);
    save_workspaces_file(&file)
}
