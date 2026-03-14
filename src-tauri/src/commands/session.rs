use crate::models::{SessionEntry, SessionInfo};
use crate::{export, scanner, stats};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileStats {
    pub size: u64,
    pub modified_at: u64,
    pub is_file: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PaginatedSessionsResult {
    pub sessions: Vec<SessionInfo>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DeleteSessionFailure {
    pub path: String,
    pub error: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DeleteSessionsResult {
    pub deleted_count: usize,
    pub failed: Vec<DeleteSessionFailure>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SessionChunk {
    pub content: String,
    pub next_offset: u64,
    pub file_size: u64,
    pub has_more: bool,
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    scanner::scan_sessions().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_sessions_paginated(
    offset: Option<usize>,
    limit: Option<usize>,
    search_query: Option<String>,
    project_filter: Option<String>,
    filter_tag_ids: Option<Vec<String>>,
    sort_by: Option<String>,
) -> Result<PaginatedSessionsResult, String> {
    super::session_list::scan_sessions_paginated_impl(
        offset,
        limit,
        search_query,
        project_filter,
        filter_tag_ids,
        sort_by,
    )
    .await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_chunk(
    path: String,
    offset: Option<u64>,
    max_bytes: Option<usize>,
) -> Result<SessionChunk, String> {
    super::session_file::read_session_file_chunk_impl(path, offset, max_bytes).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file(path: String) -> Result<String, String> {
    super::session_file::read_session_file_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_incremental(
    path: String,
    from_line: usize,
) -> Result<(usize, String), String> {
    super::session_file::read_session_file_incremental_impl(path, from_line).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_incremental_offset(
    path: String,
    from_offset: u64,
) -> Result<(u64, String), String> {
    super::session_file::read_session_file_incremental_offset_impl(path, from_offset).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_file_stats(path: String) -> Result<FileStats, String> {
    super::session_file::get_file_stats_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_entries(path: String) -> Result<Vec<SessionEntry>, String> {
    super::session_file::get_session_entries_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_session(path: String) -> Result<(), String> {
    crate::session_delete::delete_session_file_and_cache(&path)?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_sessions(paths: Vec<String>) -> Result<DeleteSessionsResult, String> {
    super::session_file::delete_sessions_impl(paths).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_session(
    path: String,
    format: String,
    output_path: String,
) -> Result<(), String> {
    export::export_session(&path, &format, &output_path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn rename_session(path: String, new_name: String) -> Result<(), String> {
    super::session_file::rename_session_impl(path, new_name).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn fork_session(
    source_path: String,
    target_name: Option<String>,
) -> Result<SessionInfo, String> {
    super::session_file::fork_session_impl(source_path, target_name).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_stats(sessions: Vec<SessionInfo>) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats(&sessions))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_stats_light(
    sessions: Vec<stats::SessionStatsInput>,
) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats_from_inputs(&sessions))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_day_stats(
    date: String,
    sessions: Vec<SessionInfo>,
) -> Result<stats::DayStats, String> {
    stats::get_day_stats(&date, &sessions)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_session_in_terminal(
    path: String,
    cwd: String,
    terminal: Option<String>,
    pi_path: Option<String>,
) -> Result<(), String> {
    super::session_open::open_session_in_terminal_impl(path, cwd, terminal, pi_path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_session_in_browser(path: String) -> Result<(), String> {
    super::session_open::open_session_in_browser_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_by_path(path: String) -> Result<Option<SessionInfo>, String> {
    super::session_file::get_session_by_path_impl(path).await
}
