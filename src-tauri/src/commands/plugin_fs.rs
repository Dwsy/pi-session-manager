use crate::domain::plugin_fs::{PsmFsEntry, PsmFsReadResult, PsmFsRootInfo};

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn plugin_fs_roots() -> Result<Vec<PsmFsRootInfo>, String> {
    crate::domain::plugin_fs::plugin_fs_roots()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn plugin_fs_list(root_id: String, path: Option<String>) -> Result<Vec<PsmFsEntry>, String> {
    crate::domain::plugin_fs::plugin_fs_list(root_id, path)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn plugin_fs_read(root_id: String, path: String, encoding: Option<String>, max_bytes: Option<u64>) -> Result<PsmFsReadResult, String> {
    crate::domain::plugin_fs::plugin_fs_read(root_id, path, encoding, max_bytes)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn plugin_fs_stat(root_id: String, path: String) -> Result<Option<PsmFsEntry>, String> {
    crate::domain::plugin_fs::plugin_fs_stat(root_id, path)
}
