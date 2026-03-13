use crate::models::SessionInfo;
use crate::{config, scanner, sqlite_cache};
use std::collections::{HashMap, HashSet};
use std::fs;

use super::session::PaginatedSessionsResult;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SessionSortBy {
    ModifiedAsc,
    ModifiedDesc,
    CreatedAsc,
    CreatedDesc,
    NameAsc,
    NameDesc,
    SizeAsc,
    SizeDesc,
}

impl SessionSortBy {
    fn from_raw(value: Option<&str>) -> Self {
        match value
            .map(str::trim)
            .filter(|raw| !raw.is_empty())
            .map(str::to_lowercase)
            .as_deref()
        {
            Some("name") | Some("name_asc") => Self::NameAsc,
            Some("name_desc") => Self::NameDesc,
            Some("created") | Some("created_desc") | Some("last_created") => Self::CreatedDesc,
            Some("created_asc") => Self::CreatedAsc,
            Some("size") | Some("size_desc") => Self::SizeDesc,
            Some("size_asc") => Self::SizeAsc,
            Some("modified") | Some("modified_desc") | Some("last_modified") => Self::ModifiedDesc,
            Some("modified_asc") => Self::ModifiedAsc,
            _ => Self::ModifiedDesc,
        }
    }
}

fn resolve_session_name(session: &SessionInfo) -> String {
    session
        .name
        .as_deref()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or(session.first_message.as_str())
        .to_lowercase()
}

fn get_session_size_bytes(path: &str) -> u64 {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn sort_sessions(sessions: &mut [SessionInfo], raw_sort_by: Option<&str>) {
    match SessionSortBy::from_raw(raw_sort_by) {
        SessionSortBy::ModifiedAsc => sessions.sort_by(|a, b| {
            a.modified
                .cmp(&b.modified)
                .then_with(|| a.path.cmp(&b.path))
        }),
        SessionSortBy::ModifiedDesc => sessions.sort_by(|a, b| {
            b.modified
                .cmp(&a.modified)
                .then_with(|| a.path.cmp(&b.path))
        }),
        SessionSortBy::CreatedAsc => sessions.sort_by(|a, b| {
            a.created
                .cmp(&b.created)
                .then_with(|| a.modified.cmp(&b.modified))
                .then_with(|| a.path.cmp(&b.path))
        }),
        SessionSortBy::CreatedDesc => sessions.sort_by(|a, b| {
            b.created
                .cmp(&a.created)
                .then_with(|| b.modified.cmp(&a.modified))
                .then_with(|| a.path.cmp(&b.path))
        }),
        SessionSortBy::NameAsc => sessions.sort_by(|a, b| {
            resolve_session_name(a)
                .cmp(&resolve_session_name(b))
                .then_with(|| b.modified.cmp(&a.modified))
                .then_with(|| a.path.cmp(&b.path))
        }),
        SessionSortBy::NameDesc => sessions.sort_by(|a, b| {
            resolve_session_name(b)
                .cmp(&resolve_session_name(a))
                .then_with(|| b.modified.cmp(&a.modified))
                .then_with(|| a.path.cmp(&b.path))
        }),
        SessionSortBy::SizeAsc => {
            let size_map: HashMap<String, u64> = sessions
                .iter()
                .map(|session| (session.path.clone(), get_session_size_bytes(&session.path)))
                .collect();

            sessions.sort_by(|a, b| {
                let a_size = size_map.get(&a.path).copied().unwrap_or(0);
                let b_size = size_map.get(&b.path).copied().unwrap_or(0);
                a_size
                    .cmp(&b_size)
                    .then_with(|| b.modified.cmp(&a.modified))
                    .then_with(|| a.path.cmp(&b.path))
            });
        }
        SessionSortBy::SizeDesc => {
            let size_map: HashMap<String, u64> = sessions
                .iter()
                .map(|session| (session.path.clone(), get_session_size_bytes(&session.path)))
                .collect();

            sessions.sort_by(|a, b| {
                let a_size = size_map.get(&a.path).copied().unwrap_or(0);
                let b_size = size_map.get(&b.path).copied().unwrap_or(0);
                b_size
                    .cmp(&a_size)
                    .then_with(|| b.modified.cmp(&a.modified))
                    .then_with(|| a.path.cmp(&b.path))
            });
        }
    }
}

fn session_matches_search_query(session: &SessionInfo, raw_query: &str) -> bool {
    let query = raw_query.trim().to_lowercase();
    if query.is_empty() {
        return true;
    }

    let name = session.name.as_deref().unwrap_or_default();
    let fields = [
        name,
        session.first_message.as_str(),
        session.last_message.as_str(),
        session.cwd.as_str(),
    ];

    fields
        .into_iter()
        .any(|field| field.to_lowercase().contains(&query))
}

fn normalize_path_for_match(path: &str) -> String {
    let unified = path.trim().replace('\\', "/");
    let trimmed = unified.trim_end_matches('/');
    #[allow(clippy::if_same_then_else)]
    let normalized = if cfg!(target_os = "windows") {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    };

    if normalized.is_empty() {
        "/".to_string()
    } else {
        normalized
    }
}

fn path_is_same_or_child(path: &str, root: &str) -> bool {
    if path == root {
        return true;
    }

    if root == "/" {
        return path.starts_with('/');
    }

    path.starts_with(root) && path.as_bytes().get(root.len()) == Some(&b'/')
}

fn session_matches_project_filter(session: &SessionInfo, raw_project: &str) -> bool {
    let project = normalize_path_for_match(raw_project);
    if project.is_empty() {
        return true;
    }

    let session_cwd = normalize_path_for_match(&session.cwd);
    if path_is_same_or_child(&session_cwd, &project) {
        return true;
    }

    let session_path = normalize_path_for_match(&session.path);
    path_is_same_or_child(&session_path, &project)
}

fn strip_session_list_payload(session: &SessionInfo) -> SessionInfo {
    SessionInfo {
        path: session.path.clone(),
        id: session.id.clone(),
        cwd: session.cwd.clone(),
        name: session.name.clone(),
        created: session.created,
        modified: session.modified,
        message_count: session.message_count,
        first_message: session.first_message.clone(),
        all_messages_text: String::new(),
        user_messages_text: String::new(),
        assistant_messages_text: String::new(),
        last_message: session.last_message.clone(),
        last_message_role: session.last_message_role.clone(),
    }
}

fn build_paginated_result(
    sessions: &[SessionInfo],
    offset: Option<usize>,
    limit: Option<usize>,
) -> PaginatedSessionsResult {
    const DEFAULT_LIMIT: usize = 100;
    const MAX_LIMIT: usize = 500;

    let normalized_limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let total = sessions.len();
    let start = offset.unwrap_or(0).min(total);
    let end = start.saturating_add(normalized_limit).min(total);
    let page_sessions = sessions[start..end]
        .iter()
        .map(strip_session_list_payload)
        .collect();

    PaginatedSessionsResult {
        sessions: page_sessions,
        total,
        offset: start,
        limit: normalized_limit,
        has_more: end < total,
    }
}

pub(super) async fn scan_sessions_paginated_impl(
    offset: Option<usize>,
    limit: Option<usize>,
    search_query: Option<String>,
    project_filter: Option<String>,
    filter_tag_ids: Option<Vec<String>>,
    sort_by: Option<String>,
) -> Result<PaginatedSessionsResult, String> {
    let mut sessions = if let Some(cached) = scanner::get_cached_sessions_for_list() {
        cached
    } else {
        scanner::scan_sessions().await?
    };

    if let Some(project) = project_filter
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions.retain(|session| session_matches_project_filter(session, project));
    }

    if let Some(query) = search_query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions.retain(|session| session_matches_search_query(session, query));
    }

    if let Some(tag_ids) = filter_tag_ids.as_ref().filter(|ids| !ids.is_empty()) {
        let tag_filter: HashSet<&str> = tag_ids.iter().map(String::as_str).collect();
        let config = config::load_config()?;
        let conn = sqlite_cache::init_db_with_config(&config)?;
        let matched_session_ids: HashSet<String> = sqlite_cache::get_all_session_tags(&conn)?
            .into_iter()
            .filter(|item| tag_filter.contains(item.tag_id.as_str()))
            .map(|item| item.session_id)
            .collect();
        sessions.retain(|session| matched_session_ids.contains(session.id.as_str()));
    }

    sort_sessions(&mut sessions, sort_by.as_deref());
    Ok(build_paginated_result(&sessions, offset, limit))
}

#[cfg(test)]
mod tests {
    use super::{
        build_paginated_result, session_matches_project_filter, sort_sessions,
        strip_session_list_payload,
    };
    use crate::models::SessionInfo;
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
        }
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

    #[cfg(target_os = "windows")]
    #[test]
    fn project_filter_is_case_insensitive_on_windows() {
        let session = build_session(
            r"C:\Users\Demo\Dev\workspace\Foo-App",
            r"C:\Users\Demo\.pi\agent\sessions\foo\1.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            r"c:\users\demo\dev\workspace\foo-app"
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
