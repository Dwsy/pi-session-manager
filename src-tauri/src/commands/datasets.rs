use crate::domain::datasets;
#[cfg(feature = "gui")]
use tauri::Manager;
use tracing::warn;

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_datasets() -> Result<Vec<datasets::DatasetInfo>, String> {
    datasets::list_datasets_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn start_dataset_import(source: String) -> Result<datasets::DatasetImportStatus, String> {
    datasets::start_dataset_import_internal(source).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_dataset_import_status(
    task_id: String,
) -> Result<datasets::DatasetImportStatus, String> {
    datasets::get_dataset_import_status_internal(task_id)
}

pub async fn save_session_source_core(
    mode: String,
    active_dataset_id: Option<String>,
    active_dataset_ids: Option<Vec<String>>,
) -> Result<(), String> {
    datasets::save_session_source_internal(mode, active_dataset_id, active_dataset_ids)
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn save_session_source(
    mode: String,
    active_dataset_id: Option<String>,
    active_dataset_ids: Option<Vec<String>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    save_session_source_core(mode, active_dataset_id, active_dataset_ids).await?;

    let watcher_state: tauri::State<'_, crate::file_watcher::FileWatcherState> = app_handle.state();
    if let Err(e) =
        crate::file_watcher::restart_watcher_with_config(&watcher_state, app_handle.clone())
    {
        warn!(
            "Failed to restart file watcher after save_session_source: {}",
            e
        );
    }

    Ok(())
}
