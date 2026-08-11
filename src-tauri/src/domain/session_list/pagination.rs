//! Session list pagination logic
use crate::domain::session_list::types::PaginatedSessionsResult;
use crate::types::SessionInfo;

pub fn strip_session_list_payload(session: &SessionInfo) -> SessionInfo {
    SessionInfo {
        path: session.path.clone(),
        id: session.id.clone(),
        cwd: session.cwd.clone(),
        name: session.name.clone(),
        created: session.created,
        modified: session.modified,
        message_count: session.message_count,
        first_message: session.first_message.clone(),
        user_messages_text: String::new(),
        assistant_messages_text: String::new(),
        last_message: session.last_message.clone(),
        last_message_role: session.last_message_role.clone(),
        parent_session_path: session.parent_session_path.clone(),
        model: session.model.clone(),
        models: session.models.clone(),
    }
}

pub fn build_paginated_result(sessions: &[SessionInfo], offset: Option<usize>, limit: Option<usize>) -> PaginatedSessionsResult {
    const DEFAULT_LIMIT: usize = 100;
    const MAX_LIMIT: usize = 500;

    let normalized_limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let total = sessions.len();
    let start = offset.unwrap_or(0).min(total);
    let end = start.saturating_add(normalized_limit).min(total);
    let page_sessions = sessions[start..end].iter().map(strip_session_list_payload).collect();

    PaginatedSessionsResult { sessions: page_sessions, total, offset: start, limit: normalized_limit, has_more: end < total }
}

#[cfg(test)]
mod tests {
    use super::build_paginated_result;
    use crate::types::SessionInfo;
    use chrono::Utc;

    fn session(index: usize) -> SessionInfo {
        SessionInfo {
            path: format!("/tmp/session-{index}.jsonl"),
            id: format!("session-{index:05}"),
            cwd: "/workspace".to_string(),
            name: Some(format!("Session {index}")),
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 2,
            first_message: "first".to_string(),
            user_messages_text: "large user payload that must not leak into list pages".repeat(4),
            assistant_messages_text: "large assistant payload that must not leak into list pages".repeat(4),
            last_message: "last".to_string(),
            last_message_role: "assistant".to_string(),
            parent_session_path: None,
            model: Some("test-model".to_string()),
            models: Some(vec!["test-model".to_string()]),
        }
    }

    #[test]
    fn ten_thousand_session_fixture_returns_only_requested_page_and_strips_bulk_text() {
        let sessions = (0..10_000).map(session).collect::<Vec<_>>();

        let result = build_paginated_result(&sessions, Some(9_980), Some(20));

        assert_eq!(result.total, 10_000);
        assert_eq!(result.offset, 9_980);
        assert_eq!(result.sessions.len(), 20);
        assert!(!result.has_more);
        assert!(result.sessions.iter().all(|session| session.user_messages_text.is_empty() && session.assistant_messages_text.is_empty()));
    }
}
