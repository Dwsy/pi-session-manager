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
pub async fn scan_sessions_paginated_impl(
    offset: Option<usize>,
    limit: Option<usize>,
    search_query: Option<String>,
    project_filter: Option<String>,
    filter_tag_ids: Option<Vec<String>>,
    sort_by: Option<String>,
) -> Result<PaginatedSessionsResult, String> {
    use crate::{config, scanner};

    let mut sessions = if let Some(cached) = scanner::get_cached_sessions_for_list() {
        cached
    } else {
        scanner::scan_sessions().await?
    };

    // Apply project filter
    if let Some(project) = project_filter
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions.retain(|session| session_matches_project_filter(session, project));
    }

    // Apply search filter
    if let Some(query) = search_query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions.retain(|session| session_matches_search_query(session, query));
    }

    // Apply tag filter
    if let Some(tag_ids) = filter_tag_ids.as_ref().filter(|ids| !ids.is_empty()) {
        filter_by_tags(&mut sessions, tag_ids)?;
    }

    // Apply sorting
    sort_sessions(&mut sessions, sort_by.as_deref());

    // Build paginated result
    Ok(build_paginated_result(&sessions, offset, limit))
}

#[cfg(test)]
mod tests {
    use super::filtering::{session_matches_project_filter, session_matches_search_query};
    use super::pagination::{build_paginated_result, strip_session_list_payload};
    use super::sorting::sort_sessions;
    use crate::types::SessionInfo;
    use chrono::{DateTime, Utc};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn build_session(cwd: &str, path: &str) -> SessionInfo {
        SessionInfo {
            path: path.to_string(),
            id: "s1".to_string(),
            cwd: cwd.to_string(),
            name: Some("session".to_string()),
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 1,
            first_message: "hello".to_string(),
            all_messages_text: String::new(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: "world".to_string(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
        }
    }

    fn build_session_with_time(
        id: &str,
        name: Option<&str>,
        first_message: &str,
        path: &str,
        created: &str,
        modified: &str,
    ) -> SessionInfo {
        SessionInfo {
            path: path.to_string(),
            id: id.to_string(),
            cwd: "/tmp/project".to_string(),
            name: name.map(str::to_string),
            created: DateTime::parse_from_rfc3339(created)
                .expect("valid created timestamp")
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339(modified)
                .expect("valid modified timestamp")
                .with_timezone(&Utc),
            message_count: 1,
            first_message: first_message.to_string(),
            all_messages_text: "all messages".to_string(),
            user_messages_text: "user messages".to_string(),
            assistant_messages_text: "assistant messages".to_string(),
            last_message: "last".to_string(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
        }
    }

    #[test]
    fn session_search_matches_session_id_prefix() {
        let session = build_session_with_time(
            "abc123def456",
            Some("Alpha"),
            "first",
            "/tmp/p-session-id.jsonl",
            "2026-01-03T00:00:00Z",
            "2026-01-05T00:00:00Z",
        );

        assert!(session_matches_search_query(&session, "abc123"));
        assert!(session_matches_search_query(&session, "ABC123"));
        assert!(session_matches_search_query(&session, "\"abc123def456\""));
        assert!(session_matches_search_query(&session, "abc"));
        assert!(!session_matches_search_query(&session, "ab"));
        assert!(!session_matches_search_query(&session, "123def"));
    }

    #[test]
    fn project_filter_matches_exact_cwd() {
        let session = build_session(
            "/Users/dengwenyu/Dev/code/company/Jly",
            "/Users/dengwenyu/.pi/agent/sessions/a/1.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_matches_child_cwd() {
        let session = build_session(
            "/Users/dengwenyu/Dev/code/company/Jly/sfm_web",
            "/Users/dengwenyu/.pi/agent/sessions/a/2.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_does_not_match_sibling_path() {
        let session = build_session(
            "/Users/dengwenyu/Dev/code/company/Jly2/sfm_web",
            "/Users/dengwenyu/.pi/agent/sessions/a/3.jsonl",
        );
        assert!(!session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_falls_back_to_session_file_path() {
        let session = build_session(
            "Unknown",
            "/Users/dengwenyu/Dev/code/company/Jly/.pi/agent/sessions/a/4.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_supports_windows_path_separator() {
        let session = build_session(
            r"C:\Users\demo\Dev\workspace\foo-app",
            r"C:\Users\demo\.pi\agent\sessions\foo\1.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            r"C:\Users\demo\Dev\workspace"
        ));
    }

    #[test]
    fn sort_by_name_orders_sessions_alphabetically() {
        let mut sessions = vec![
            build_session_with_time(
                "s-2",
                Some("zeta"),
                "ignored",
                "/tmp/s-2.jsonl",
                "2026-01-02T00:00:00Z",
                "2026-01-04T00:00:00Z",
            ),
            build_session_with_time(
                "s-1",
                Some("Alpha"),
                "ignored",
                "/tmp/s-1.jsonl",
                "2026-01-03T00:00:00Z",
                "2026-01-05T00:00:00Z",
            ),
            build_session_with_time(
                "s-3",
                None,
                "beta message",
                "/tmp/s-3.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-06T00:00:00Z",
            ),
        ];

        sort_sessions(&mut sessions, Some("name"));

        let sorted_ids: Vec<&str> = sessions.iter().map(|session| session.id.as_str()).collect();
        assert_eq!(sorted_ids, vec!["s-1", "s-3", "s-2"]);
    }

    #[test]
    fn sort_by_created_orders_sessions_descending() {
        let mut sessions = vec![
            build_session_with_time(
                "s-1",
                Some("one"),
                "one",
                "/tmp/s-c-1.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-03T00:00:00Z",
            ),
            build_session_with_time(
                "s-2",
                Some("two"),
                "two",
                "/tmp/s-c-2.jsonl",
                "2026-01-04T00:00:00Z",
                "2026-01-02T00:00:00Z",
            ),
        ];

        sort_sessions(&mut sessions, Some("created"));

        assert_eq!(sessions[0].id, "s-2");
        assert_eq!(sessions[1].id, "s-1");
    }

    #[test]
    fn sort_by_modified_orders_sessions_ascending() {
        let mut sessions = vec![
            build_session_with_time(
                "s-3",
                Some("three"),
                "three",
                "/tmp/s-m-3.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-03T00:00:00Z",
            ),
            build_session_with_time(
                "s-1",
                Some("one"),
                "one",
                "/tmp/s-m-1.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
            ),
            build_session_with_time(
                "s-2",
                Some("two"),
                "two",
                "/tmp/s-m-2.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
            ),
        ];

        sort_sessions(&mut sessions, Some("modified_asc"));

        let sorted_ids: Vec<&str> = sessions.iter().map(|session| session.id.as_str()).collect();
        assert_eq!(sorted_ids, vec!["s-1", "s-2", "s-3"]);
    }

    #[test]
    fn sort_by_name_orders_sessions_descending() {
        let mut sessions = vec![
            build_session_with_time(
                "s-2",
                Some("zeta"),
                "ignored",
                "/tmp/s-name-2.jsonl",
                "2026-01-02T00:00:00Z",
                "2026-01-04T00:00:00Z",
            ),
            build_session_with_time(
                "s-1",
                Some("Alpha"),
                "ignored",
                "/tmp/s-name-1.jsonl",
                "2026-01-03T00:00:00Z",
                "2026-01-05T00:00:00Z",
            ),
            build_session_with_time(
                "s-3",
                None,
                "beta message",
                "/tmp/s-name-3.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-06T00:00:00Z",
            ),
        ];

        sort_sessions(&mut sessions, Some("name_desc"));

        let sorted_ids: Vec<&str> = sessions.iter().map(|session| session.id.as_str()).collect();
        assert_eq!(sorted_ids, vec!["s-2", "s-3", "s-1"]);
    }

    #[test]
    fn sort_by_size_orders_sessions_descending() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("ppm-sort-size-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let small_path = base_dir.join("small.jsonl");
        let large_path = base_dir.join("large.jsonl");
        fs::write(&small_path, b"abc").expect("write small file");
        fs::write(&large_path, b"abcdefghijklmnopqrstuvwxyz").expect("write large file");

        let mut sessions = vec![
            build_session_with_time(
                "small",
                Some("small"),
                "small",
                small_path.to_str().expect("small path utf8"),
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
            ),
            build_session_with_time(
                "large",
                Some("large"),
                "large",
                large_path.to_str().expect("large path utf8"),
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
            ),
        ];

        sort_sessions(&mut sessions, Some("size"));

        assert_eq!(sessions[0].id, "large");
        assert_eq!(sessions[1].id, "small");

        let _ = fs::remove_file(&small_path);
        let _ = fs::remove_file(&large_path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[test]
    fn strip_session_list_payload_clears_message_fields() {
        let session = build_session_with_time(
            "s-1",
            Some("Alpha"),
            "first",
            "/tmp/p-1.jsonl",
            "2026-01-03T00:00:00Z",
            "2026-01-05T00:00:00Z",
        );

        let stripped = strip_session_list_payload(&session);
        assert_eq!(stripped.all_messages_text, "");
        assert_eq!(stripped.user_messages_text, "");
        assert_eq!(stripped.assistant_messages_text, "");
    }

    #[test]
    fn build_paginated_result_clamps_limit_and_offset() {
        let sessions = vec![
            build_session_with_time(
                "s-1",
                Some("Alpha"),
                "first",
                "/tmp/p-1.jsonl",
                "2026-01-03T00:00:00Z",
                "2026-01-05T00:00:00Z",
            ),
            build_session_with_time(
                "s-2",
                Some("Beta"),
                "second",
                "/tmp/p-2.jsonl",
                "2026-01-02T00:00:00Z",
                "2026-01-04T00:00:00Z",
            ),
        ];

        let result = build_paginated_result(&sessions, Some(10), Some(999));
        assert_eq!(result.total, 2);
        assert_eq!(result.offset, 2);
        assert_eq!(result.limit, 500);
        assert!(result.sessions.is_empty());
        assert!(!result.has_more);
    }

    #[test]
    fn build_paginated_result_sets_has_more_for_partial_page() {
        let sessions = vec![
            build_session_with_time(
                "s-1",
                Some("Alpha"),
                "first",
                "/tmp/p-partial-1.jsonl",
                "2026-01-03T00:00:00Z",
                "2026-01-05T00:00:00Z",
            ),
            build_session_with_time(
                "s-2",
                Some("Beta"),
                "second",
                "/tmp/p-partial-2.jsonl",
                "2026-01-02T00:00:00Z",
                "2026-01-04T00:00:00Z",
            ),
            build_session_with_time(
                "s-3",
                Some("Gamma"),
                "third",
                "/tmp/p-partial-3.jsonl",
                "2026-01-01T00:00:00Z",
                "2026-01-03T00:00:00Z",
            ),
        ];

        let result = build_paginated_result(&sessions, Some(1), Some(1));
        assert_eq!(result.total, 3);
        assert_eq!(result.offset, 1);
        assert_eq!(result.limit, 1);
        assert_eq!(result.sessions.len(), 1);
        assert_eq!(result.sessions[0].id, "s-2");
        assert!(result.has_more);
    }
}
