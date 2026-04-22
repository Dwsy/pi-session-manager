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
