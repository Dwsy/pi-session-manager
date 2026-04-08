//! Session list commands - thin layer delegating to domain
//!
//! All business logic moved to `domain/session_list/`

use crate::domain::session_list;

pub(super) async fn scan_sessions_paginated_impl(
    offset: Option<usize>,
    limit: Option<usize>,
    search_query: Option<String>,
    project_filter: Option<String>,
    filter_tag_ids: Option<Vec<String>>,
    source_filter_slugs: Option<Vec<String>>,
    sort_by: Option<String>,
) -> Result<session_list::PaginatedSessionsResult, String> {
    session_list::scan_sessions_paginated_impl(
        offset,
        limit,
        search_query,
        project_filter,
        filter_tag_ids,
        source_filter_slugs,
        sort_by,
    )
    .await
}
