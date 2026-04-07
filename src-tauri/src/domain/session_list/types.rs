//! Session list domain types
use crate::types::SessionInfo;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionSortBy {
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
    pub fn from_raw(value: Option<&str>) -> Self {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedSessionsResult {
    pub sessions: Vec<SessionInfo>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}
