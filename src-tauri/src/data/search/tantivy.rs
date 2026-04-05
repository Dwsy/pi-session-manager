// Tantivy search engine - placeholder for future implementation
// Full implementation would require more complex setup

use crate::data::search::client::{RoleFilter, SearchMode};
use crate::types::{SearchResult, SessionInfo};

pub fn search_sessions(sessions: &[SessionInfo], query: &str) -> Vec<SearchResult> {
    // For now, delegate to the existing regex-based search
    crate::data::search::client::search_sessions(
        sessions,
        query,
        SearchMode::Content,
        RoleFilter::All,
        true,
    )
}

pub fn init_index(_sessions: &[SessionInfo]) -> Result<(), String> {
    // Placeholder - would initialize Tantivy index
    Ok(())
}
