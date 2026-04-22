//! Session list sorting logic
use crate::domain::session_list::types::SessionSortBy;
use crate::types::SessionInfo;
use std::collections::HashMap;
use std::fs;

fn resolve_session_name(session: &SessionInfo) -> String {
    session.name.as_deref().filter(|name| !name.trim().is_empty()).unwrap_or(session.first_message.as_str()).to_lowercase()
}

fn get_session_size_bytes(path: &str) -> u64 {
    fs::metadata(crate::domain::session_bridge::backing_file_path(std::path::Path::new(path))).map(|metadata| metadata.len()).unwrap_or(0)
}

pub fn sort_sessions(sessions: &mut [SessionInfo], raw_sort_by: Option<&str>) {
    match SessionSortBy::from_raw(raw_sort_by) {
        SessionSortBy::ModifiedAsc => sessions.sort_by(|a, b| a.modified.cmp(&b.modified).then_with(|| a.path.cmp(&b.path))),
        SessionSortBy::ModifiedDesc => sessions.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.path.cmp(&b.path))),
        SessionSortBy::CreatedAsc => sessions.sort_by(|a, b| a.created.cmp(&b.created).then_with(|| a.modified.cmp(&b.modified)).then_with(|| a.path.cmp(&b.path))),
        SessionSortBy::CreatedDesc => sessions.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| b.modified.cmp(&a.modified)).then_with(|| a.path.cmp(&b.path))),
        SessionSortBy::NameAsc => sessions.sort_by(|a, b| resolve_session_name(a).cmp(&resolve_session_name(b)).then_with(|| b.modified.cmp(&a.modified)).then_with(|| a.path.cmp(&b.path))),
        SessionSortBy::NameDesc => sessions.sort_by(|a, b| resolve_session_name(b).cmp(&resolve_session_name(a)).then_with(|| b.modified.cmp(&a.modified)).then_with(|| a.path.cmp(&b.path))),
        SessionSortBy::SizeAsc => {
            let size_map: HashMap<String, u64> = sessions.iter().map(|s| (s.path.clone(), get_session_size_bytes(&s.path))).collect();
            sessions.sort_by(|a, b| {
                let a_size = size_map.get(&a.path).copied().unwrap_or(0);
                let b_size = size_map.get(&b.path).copied().unwrap_or(0);
                a_size.cmp(&b_size).then_with(|| b.modified.cmp(&a.modified)).then_with(|| a.path.cmp(&b.path))
            });
        }
        SessionSortBy::SizeDesc => {
            let size_map: HashMap<String, u64> = sessions.iter().map(|s| (s.path.clone(), get_session_size_bytes(&s.path))).collect();
            sessions.sort_by(|a, b| {
                let a_size = size_map.get(&a.path).copied().unwrap_or(0);
                let b_size = size_map.get(&b.path).copied().unwrap_or(0);
                b_size.cmp(&a_size).then_with(|| b.modified.cmp(&a.modified)).then_with(|| a.path.cmp(&b.path))
            });
        }
    }
}
