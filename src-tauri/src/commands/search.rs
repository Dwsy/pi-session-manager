use crate::types::{FullTextSearchResponse, SessionInfo};

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_sessions(sessions: Vec<SessionInfo>, query: String, search_mode: String, role_filter: String, include_tools: bool) -> Result<Vec<crate::types::SearchResult>, String> {
    crate::domain::session_search::search_sessions(sessions, query, search_mode, role_filter, include_tools).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_sessions_fts(query: String, limit: usize) -> Result<Vec<SessionInfo>, String> {
    crate::domain::session_search::search_sessions_fts(query, limit).await
}

#[cfg_attr(feature = "gui", tauri::command)]
#[allow(clippy::too_many_arguments)]
pub async fn full_text_search(
    query: String,
    role_filter: String,
    glob_pattern: Option<String>,
    project_path: Option<String>,
    page: usize,
    page_size: usize,
    match_mode: Option<String>,
    sort_order: Option<String>,
    source_filter: Option<String>,
    from: Option<String>,
    to: Option<String>,
) -> Result<FullTextSearchResponse, String> {
    crate::domain::session_search::full_text_search(query, role_filter, glob_pattern, project_path, page, page_size, match_mode, sort_order, source_filter, from, to).await
}
