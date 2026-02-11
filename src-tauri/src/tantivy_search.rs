// Tantivy search engine - placeholder for future implementation
// Full implementation would require more complex setup

use crate::models::{SearchResult, SessionInfo};
use crate::search::{RoleFilter, SearchMode};

pub fn search_sessions(sessions: &[SessionInfo], query: &str) -> Vec<SearchResult> {
    // For now, delegate to the existing regex-based search
    crate::search::search_sessions(sessions, query, SearchMode::Content, RoleFilter::All, true)
}

pub fn init_index(_sessions: &[SessionInfo]) -> Result<(), String> {
    // Placeholder - would initialize Tantivy index
    Ok(())
}
