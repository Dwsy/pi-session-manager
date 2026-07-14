use std::collections::HashMap;

use crate::types::{SessionEntry, SessionInfo};
use crate::{export, scanner, stats};

fn filter_sessions_for_stats(sessions: Vec<SessionInfo>) -> Vec<SessionInfo> {
    let config = crate::config::Config::load().unwrap_or_default();
    sessions.into_iter().filter(|session| crate::domain::session_bridge::is_session_allowed_in_stats(std::path::Path::new(&session.path), &config)).collect()
}

fn filter_session_stat_inputs_for_stats(sessions: Vec<stats::SessionStatsInput>) -> Vec<stats::SessionStatsInput> {
    let config = crate::config::Config::load().unwrap_or_default();
    sessions.into_iter().filter(|session| crate::domain::session_bridge::is_session_allowed_in_stats(std::path::Path::new(&session.path), &config)).collect()
}

// Re-export from domain
pub use crate::domain::session_bridge::SessionBridgeConvertResult;
pub use crate::domain::session_list::PaginatedSessionsResult;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionProviderCapabilities {
    pub can_scan: bool,
    pub can_convert_target: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionProviderInfo {
    pub slug: String,
    pub display_name: String,
    pub capabilities: SessionProviderCapabilities,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileStats {
    pub size: u64,
    pub modified_at: u64,
    pub is_file: bool,
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
pub async fn scan_sessions_paginated(offset: Option<usize>, limit: Option<usize>, search_query: Option<String>, project_filter: Option<String>, filter_tag_ids: Option<Vec<String>>, source_filter_slugs: Option<Vec<String>>, sort_by: Option<String>) -> Result<PaginatedSessionsResult, String> {
    super::session_list::scan_sessions_paginated_impl(offset, limit, search_query, project_filter, filter_tag_ids, source_filter_slugs, sort_by).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_chunk(path: String, offset: Option<u64>, max_bytes: Option<usize>) -> Result<SessionChunk, String> {
    super::session_file::read_session_file_chunk_impl(path, offset, max_bytes).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file(path: String) -> Result<String, String> {
    super::session_file::read_session_file_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_incremental(path: String, from_line: usize) -> Result<(usize, String), String> {
    super::session_file::read_session_file_incremental_impl(path, from_line).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_incremental_offset(path: String, from_offset: u64) -> Result<(u64, String), String> {
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

/// Preview mode: read user/assistant messages from SQLite instead of JSONL.
/// Skips tool calls, thinking blocks, and non-message entries.
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_preview_entries(session_path: String) -> Result<Vec<SessionEntry>, String> {
    super::session_file::get_session_preview_entries_impl(session_path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_labels(path: String) -> Result<HashMap<String, String>, String> {
    super::session_file::get_session_labels_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_session(path: String) -> Result<(), String> {
    crate::core::delete::delete_session_file_and_cache(&path)?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_sessions(paths: Vec<String>) -> Result<DeleteSessionsResult, String> {
    super::session_file::delete_sessions_impl(paths).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_session(path: String, format: String, output_path: String) -> Result<(), String> {
    export::export_session(&path, &format, &output_path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn rename_session(path: String, new_name: String) -> Result<(), String> {
    super::session_file::rename_session_impl(path, new_name).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn fork_session(source_path: String, target_name: Option<String>) -> Result<SessionInfo, String> {
    super::session_file::fork_session_impl(source_path, target_name).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_stats(sessions: Vec<SessionInfo>) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats(&filter_sessions_for_stats(sessions)))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_stats_light(sessions: Vec<stats::SessionStatsInput>) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats_from_inputs(&filter_session_stat_inputs_for_stats(sessions)))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_day_stats(date: String, sessions: Vec<SessionInfo>) -> Result<stats::DayStats, String> {
    let sessions = filter_sessions_for_stats(sessions);
    stats::get_day_stats(&date, &sessions)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_url_in_system(url: String) -> Result<(), String> {
    super::session_open::open_url_in_system_impl(url).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_path_with_default_app(path: String) -> Result<(), String> {
    super::session_open::open_path_with_default_app_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_session_in_terminal(path: String, cwd: String, terminal: Option<String>, pi_path: Option<String>, resume_command: Option<String>, shell: Option<String>) -> Result<(), String> {
    super::session_open::open_session_in_terminal_impl(path, cwd, terminal, pi_path, resume_command, shell).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub fn list_available_terminals() -> Vec<String> {
    crate::domain::terminal::utils::scan_available_terminals().into_iter().map(String::from).collect()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_session_in_browser(path: String) -> Result<(), String> {
    super::session_open::open_session_in_browser_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_path_in_system(path: String) -> Result<(), String> {
    super::session_open::open_path_in_system_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn detect_session_format(path: String) -> Result<String, String> {
    let (provider, _) = crate::domain::session_bridge::read_canonical_session_from_path(std::path::Path::new(&path))?;
    Ok(provider.display_name().to_string())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_supported_session_providers() -> Result<Vec<SessionProviderInfo>, String> {
    Ok(crate::domain::session_bridge::SessionBridgeSource::ALL
        .into_iter()
        .map(|source| SessionProviderInfo { slug: source.slug().replace('_', "-"), display_name: source.display_name().to_string(), capabilities: SessionProviderCapabilities { can_scan: source.can_scan(), can_convert_target: source.can_convert_target() } })
        .collect())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn convert_session_format(path: String, target_format: String, dry_run: Option<bool>, force: Option<bool>) -> Result<SessionBridgeConvertResult, String> {
    let target = crate::domain::session_bridge::SessionBridgeSource::parse_alias(&target_format)?;
    crate::domain::session_bridge::convert_session_format(std::path::Path::new(&path), target, crate::domain::session_bridge::SessionBridgeConvertOptions { dry_run: dry_run.unwrap_or(false), force: force.unwrap_or(false) })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_by_path(path: String) -> Result<Option<SessionInfo>, String> {
    super::session_file::get_session_by_path_impl(path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_by_id(id: String) -> Result<Option<SessionInfo>, String> {
    super::session_file::get_session_by_id_impl(id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[tokio::test]
    async fn get_session_stats_excludes_external_sessions_by_default() {
        let pi_root = crate::paths::pi_agent_sessions_dir().expect("pi sessions dir");
        let pi_session = SessionInfo {
            path: pi_root.join("foo").join("pi.jsonl").to_string_lossy().to_string(),
            id: "pi-1".to_string(),
            cwd: "/repo/pi".to_string(),
            name: Some("Pi".to_string()),
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 10,
            first_message: "hello".to_string(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
            model: None,
            models: None,
        };
        let codex_session = SessionInfo {
            path: "/Users/demo/.codex/sessions/2026/01/01/rollout-a.jsonl".to_string(),
            id: "codex-1".to_string(),
            cwd: "/repo/codex".to_string(),
            name: Some("Codex".to_string()),
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 20,
            first_message: "world".to_string(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
            model: None,
            models: None,
        };

        let stats = get_session_stats(vec![pi_session, codex_session]).await.expect("stats");
        assert_eq!(stats.total_sessions, 1);
        assert_eq!(stats.total_messages, 10);
    }
}
