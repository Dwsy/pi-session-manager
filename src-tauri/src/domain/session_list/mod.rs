//! Session list domain module
//!
//! Organized as:
//! - types.rs: SessionSortBy, PaginatedSessionsResult
//! - sorting.rs: Sorting logic (8 sort modes)
//! - filtering.rs: Search, project, and tag filtering
//! - pagination.rs: Pagination and payload stripping
//!
//! The paginated endpoint caches the filtered+sorted result so that
//! repeated calls with the same parameters (e.g. paging through results)
//! skip the full clone + filter + sort pipeline. The cache is invalidated
//! when the underlying scanner cache version changes or filter params change.

pub mod filtering;
pub mod pagination;
pub mod sorting;
pub mod types;

pub use filtering::*;
pub use pagination::*;
pub use sorting::*;
pub use types::*;

use crate::types::SessionInfo;
use std::sync::RwLock;

/// Cached filtered+sorted session list for the paginated endpoint.
/// Avoids re-cloning from SCAN_CACHE and re-filtering/re-sorting on
/// every page request when only offset/limit changes.
struct ListCacheEntry {
    /// Scanner cache version when this entry was computed.
    scanner_version: u64,
    /// Session count when computed (extra staleness signal).
    scanner_count: usize,
    search_query: Option<String>,
    project_filter: Option<String>,
    filter_tag_ids: Option<Vec<String>>,
    source_filter_slugs: Option<Vec<String>>,
    sort_by: Option<String>,
    /// The fully filtered and sorted session list, ready for pagination.
    sessions: Vec<SessionInfo>,
}

static LIST_CACHE: RwLock<Option<ListCacheEntry>> = RwLock::new(None);

/// Invalidate the derived paginated-list cache after metadata mutations that
/// do not change the scanner version (for example, session tag assignments).
pub fn invalidate_list_cache() {
    if let Ok(mut guard) = LIST_CACHE.write() {
        *guard = None;
    }
}

/// Main entry point: scan sessions with pagination, filtering, and sorting
pub async fn scan_sessions_paginated_impl(offset: Option<usize>, limit: Option<usize>, search_query: Option<String>, project_filter: Option<String>, filter_tag_ids: Option<Vec<String>>, source_filter_slugs: Option<Vec<String>>, sort_by: Option<String>) -> Result<PaginatedSessionsResult, String> {
    use crate::{config, scanner};

    let (scanner_version, scanner_count) = scanner::get_session_digest();

    // Try to serve from list cache: same scanner version + same filter params.
    {
        let guard = LIST_CACHE.read().map_err(|e| format!("List cache lock: {e}"))?;
        if let Some(ref entry) = *guard {
            if entry.scanner_version == scanner_version && entry.scanner_count == scanner_count && entry.search_query == search_query && entry.project_filter == project_filter && entry.filter_tag_ids == filter_tag_ids && entry.source_filter_slugs == source_filter_slugs && entry.sort_by == sort_by {
                tracing::debug!("[ListCache] hit: version={scanner_version} count={scanner_count}");
                return Ok(build_paginated_result(&entry.sessions, offset, limit));
            }
        }
    }

    // Cache miss: rebuild the filtered+sorted list.
    tracing::debug!("[ListCache] miss: version={scanner_version} count={scanner_count}");

    let mut sessions = if let Some(cached) = scanner::get_cached_sessions_for_list() {
        cached
    } else {
        let config = config::load_config()?;
        let conn = crate::data::sqlite::init_db_with_config(&config)?;
        let db_sessions = crate::data::sqlite::get_all_sessions_for_list(&conn)?;
        if db_sessions.is_empty() {
            // Synchronous scan: block until all files are parsed.
            // Frontend shows loading page while this runs.
            scanner::scan_sessions().await?
        } else {
            db_sessions
        }
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

    // Store in cache for subsequent paginated calls.
    {
        let mut guard = LIST_CACHE.write().map_err(|e| format!("List cache lock: {e}"))?;
        *guard = Some(ListCacheEntry { scanner_version, scanner_count, search_query: search_query.clone(), project_filter: project_filter.clone(), filter_tag_ids: filter_tag_ids.clone(), source_filter_slugs: source_filter_slugs.clone(), sort_by: sort_by.clone(), sessions });
    }

    // Re-read from cache to paginate (avoids moving data out).
    let guard = LIST_CACHE.read().map_err(|e| format!("List cache lock: {e}"))?;
    let entry = guard.as_ref().ok_or("List cache empty after write")?;
    Ok(build_paginated_result(&entry.sessions, offset, limit))
}

#[cfg(test)]
mod tests {
    use super::{invalidate_list_cache, ListCacheEntry, LIST_CACHE};

    #[test]
    fn invalidate_list_cache_clears_metadata_only_staleness() {
        *LIST_CACHE.write().expect("list cache lock") =
            Some(ListCacheEntry { scanner_version: 1, scanner_count: 10, search_query: None, project_filter: None, filter_tag_ids: Some(vec!["tag-1".to_string()]), source_filter_slugs: None, sort_by: Some("modified_desc".to_string()), sessions: Vec::new() });
        assert!(LIST_CACHE.read().expect("list cache lock").is_some());

        invalidate_list_cache();

        assert!(LIST_CACHE.read().expect("list cache lock").is_none());
    }
}
