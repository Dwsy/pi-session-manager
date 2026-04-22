//! Session list domain module
//!
//! Organized as:
//! - types.rs: SessionSortBy, PaginatedSessionsResult
//! - sorting.rs: Sorting logic (8 sort modes)
//! - filtering.rs: Search, project, and tag filtering
//! - pagination.rs: Pagination and payload stripping

pub mod filtering;
pub mod pagination;
pub mod sorting;
pub mod types;

pub use filtering::*;
pub use pagination::*;
pub use sorting::*;
pub use types::*;

/// Main entry point: scan sessions with pagination, filtering, and sorting
pub async fn scan_sessions_paginated_impl(offset: Option<usize>, limit: Option<usize>, search_query: Option<String>, project_filter: Option<String>, filter_tag_ids: Option<Vec<String>>, source_filter_slugs: Option<Vec<String>>, sort_by: Option<String>) -> Result<PaginatedSessionsResult, String> {
    use crate::{config, scanner};

    let mut sessions = if let Some(cached) = scanner::get_cached_sessions_for_list() {
        cached
    } else {
        let config = config::load_config()?;
        let conn = crate::data::sqlite::init_db_with_config(&config)?;
        let db_sessions = crate::data::sqlite::get_all_sessions_for_list(&conn)?;
        if db_sessions.is_empty() {
            // Keep the paginated endpoint non-blocking on cold start, but warm the
            // in-memory cache/database in the background so follow-up refreshes do
            // not stay empty until the user manually rescans.
            #[cfg(feature = "gui")]
            {
                use tauri::async_runtime::spawn;
                spawn(async {
                    let _ = scanner::scan_sessions().await;
                });
            }
        }
        db_sessions
    };

    if let Some(project) = project_filter.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        sessions.retain(|session| session_matches_project_filter(session, project));
    }

    if let Some(query) = search_query.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        sessions.retain(|session| session_matches_search_query(session, query));
    }

    if let Some(tag_ids) = filter_tag_ids.as_ref().filter(|ids| !ids.is_empty()) {
        filter_by_tags(&mut sessions, tag_ids)?;
    }

    if let Some(source_slugs) = source_filter_slugs.as_ref().filter(|ids| !ids.is_empty()) {
        filter_by_source_slugs(&mut sessions, source_slugs);
    }

    sort_sessions(&mut sessions, sort_by.as_deref());

    Ok(build_paginated_result(&sessions, offset, limit))
}
