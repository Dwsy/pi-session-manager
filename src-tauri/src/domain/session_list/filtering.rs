//! Session list filtering logic (search, project, tags)
use crate::types::SessionInfo;
use std::collections::HashSet;

pub fn session_matches_search_query(session: &SessionInfo, raw_query: &str) -> bool {
    let query = raw_query.trim().to_lowercase();
    if query.is_empty() {
        return true;
    }

    if crate::search::session_id_match_kind(&session.id, &query).is_some() {
        return true;
    }

    let name = session.name.as_deref().unwrap_or_default();
    let fields = [name, session.first_message.as_str(), session.last_message.as_str(), session.cwd.as_str()];

    fields.into_iter().any(|field| field.to_lowercase().contains(&query))
}

fn normalize_path_for_match(path: &str) -> String {
    let unified = path.trim().replace('\\', "/");
    let trimmed = unified.trim_end_matches('/');
    #[allow(clippy::if_same_then_else)]
    let normalized = if cfg!(target_os = "windows") { trimmed.to_lowercase() } else { trimmed.to_string() };

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

pub fn session_matches_project_filter(session: &SessionInfo, raw_project: &str) -> bool {
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

pub fn filter_by_tags(sessions: &mut Vec<SessionInfo>, tag_ids: &[String]) -> Result<(), String> {
    if tag_ids.is_empty() {
        return Ok(());
    }
    let tag_filter: HashSet<&str> = tag_ids.iter().map(String::as_str).collect();
    let config = crate::config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    let matched_session_ids: HashSet<String> = crate::data::sqlite::get_all_session_tags(&conn)?.into_iter().filter(|item| tag_filter.contains(item.tag_id.as_str())).map(|item| item.session_id).collect();
    sessions.retain(|session| matched_session_ids.contains(session.id.as_str()));
    Ok(())
}

pub fn session_matches_source_filter(session: &SessionInfo, source_slug: &str) -> bool {
    let normalized = source_slug.trim().replace('_', "-").to_ascii_lowercase();
    if normalized.is_empty() {
        return true;
    }

    crate::domain::session_bridge::SessionBridgeSource::ALL.into_iter().find(|source| source.slug().replace('_', "-") == normalized).is_some_and(|source| source.matches_path(std::path::Path::new(&session.path)))
}

pub fn filter_by_source_slugs(sessions: &mut Vec<SessionInfo>, source_slugs: &[String]) {
    if source_slugs.is_empty() {
        return;
    }

    sessions.retain(|session| source_slugs.iter().any(|source_slug| session_matches_source_filter(session, source_slug)));
}
