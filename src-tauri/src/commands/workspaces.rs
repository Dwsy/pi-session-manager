use serde_json::Value;

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_workspaces() -> Result<Vec<crate::domain::workspaces::KanbanWorkspace>, String> {
    crate::domain::workspaces::get_workspaces_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_workspace(workspace: crate::domain::workspaces::KanbanWorkspace) -> Result<(), String> {
    crate::domain::workspaces::save_workspace_internal(workspace).await
}

pub async fn save_workspace_from_value(value: Value) -> Result<(), String> {
    crate::domain::workspaces::save_workspace_from_value_internal(value).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_workspace(id: String) -> Result<(), String> {
    crate::domain::workspaces::delete_workspace_internal(id).await
}
