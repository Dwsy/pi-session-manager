use crate::metrics;
use crate::types::{FullTextSearchHit, FullTextSearchResponse, SessionInfo};
use crate::{config, search};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rusqlite::ToSql;
use std::collections::HashSet;
use std::time::Instant;
use tokio::time::Duration;

const PER_SESSION_LIMIT: usize = 3;
const SESSION_ID_EXACT_SCORE: f32 = 1_000_000.0;
const SESSION_ID_PREFIX_SCORE: f32 = 999_000.0;
// These constants intentionally encode the user-facing ranking hierarchy:
// session-id rediscovery, intentional label rediscovery, ordinary content similarity
const LABEL_MATCH_BASE_SCORE: f32 = 500_000.0;
const SMART_PHRASE_MATCH_BOOST: f32 = 100_000.0;
const SEARCH_TIMEOUT_SECS: u64 = 30;
const SEARCH_RESULT_WINDOW_MULTIPLIER: usize = PER_SESSION_LIMIT + 1;
const SEARCH_RESULT_WINDOW_FLOOR: usize = 32;
const MESSAGE_SEARCH_CANDIDATE_MULTIPLIER: usize = PER_SESSION_LIMIT;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceFilter {
    All,
    LabelsOnly,
    ContentOnly,
}

impl SourceFilter {
    fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("all") {
            "all" => Ok(Self::All),
            "labels_only" => Ok(Self::LabelsOnly),
            "content_only" => Ok(Self::ContentOnly),
            other => Err(format!("Invalid source_filter: {other}")),
        }
    }

    fn includes_session_id(self) -> bool {
        matches!(self, Self::All)
    }

    fn message_source_condition(self) -> &'static str {
        match self {
            Self::All => "1=1",
            Self::LabelsOnly => "m.source_type = 'label'",
            Self::ContentOnly => "m.source_type IN ('user', 'assistant', 'thinking')",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SortMode {
    Relevance,
    Newest,
    Oldest,
}

impl SortMode {
    fn parse(value: Option<&str>, force_timestamp_sort: bool) -> Self {
        if force_timestamp_sort {
            return match value {
                Some("oldest") => Self::Oldest,
                _ => Self::Newest,
            };
        }

        match value.unwrap_or("relevance") {
            "newest" => Self::Newest,
            "oldest" => Self::Oldest,
            "score" | "relevance" => Self::Relevance,
            _ => Self::Relevance,
        }
    }

    fn label_browse_order_sql(self) -> &'static str {
        match self {
            Self::Oldest => "julianday(m.timestamp) ASC, s.path ASC, m.entry_id ASC",
            _ => "julianday(m.timestamp) DESC, s.path ASC, m.entry_id ASC",
        }
    }

    fn per_session_order_sql(self) -> &'static str {
        match self {
            Self::Oldest => "julianday(timestamp) ASC, entry_id ASC",
            _ => "julianday(timestamp) DESC, entry_id DESC",
        }
    }

    fn uses_recent_priority(self) -> bool {
        matches!(self, Self::Newest)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchMode {
    Any,
    All,
    Phrase,
    Smart,
}

impl MatchMode {
    fn parse(value: Option<&str>) -> Self {
        match value.unwrap_or("smart") {
            "all" => Self::All,
            "phrase" => Self::Phrase,
            "any" => Self::Any,
            "smart" => Self::Smart,
            _ => Self::Smart,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TimeScope {
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
}

impl TimeScope {
    fn parse(from: Option<&str>, to: Option<&str>) -> Result<Self, String> {
        let from = from.map(str::trim).filter(|value| !value.is_empty()).map(parse_time_bound).transpose()?;
        let to = to.map(str::trim).filter(|value| !value.is_empty()).map(parse_time_bound).transpose()?;

        if let (Some(from), Some(to)) = (from, to) {
            if from > to {
                return Err("Invalid time range: 'from' must be earlier than or equal to 'to'".to_string());
            }
        }

        Ok(Self { from, to })
    }

    fn intersect(&self, other: &Self) -> Option<Self> {
        let from = match (self.from, other.from) {
            (Some(left), Some(right)) => Some(left.max(right)),
            (Some(left), None) => Some(left),
            (None, Some(right)) => Some(right),
            (None, None) => None,
        };
        let to = match (self.to, other.to) {
            (Some(left), Some(right)) => Some(left.min(right)),
            (Some(left), None) => Some(left),
            (None, Some(right)) => Some(right),
            (None, None) => None,
        };

        if let (Some(from), Some(to)) = (from, to) {
            if from > to {
                return None;
            }
        }

        Some(Self { from, to })
    }

    fn to_sql_params(&self) -> (Option<String>, Option<String>) {
        (self.from.map(|value| value.to_rfc3339()), self.to.map(|value| value.to_rfc3339()))
    }
}

fn session_allowed_in_search(path: &str, config: &crate::config::Config) -> bool {
    crate::domain::session_bridge::is_session_allowed_in_search(std::path::Path::new(path), config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_sessions(sessions: Vec<SessionInfo>, query: String, search_mode: String, role_filter: String, include_tools: bool) -> Result<Vec<crate::types::SearchResult>, String> {
    let mode = match search_mode.as_str() {
        "name" => search::SearchMode::Name,
        _ => search::SearchMode::Content,
    };

    let role = match role_filter.as_str() {
        "user" => search::RoleFilter::User,
        "assistant" => search::RoleFilter::Assistant,
        _ => search::RoleFilter::All,
    };
    let config = config::load_config()?;
    let sessions = sessions.into_iter().filter(|session| session_allowed_in_search(&session.path, &config)).collect::<Vec<_>>();

    Ok(search::search_sessions(&sessions, &query, mode, role, include_tools))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_sessions_fts(query: String, limit: usize) -> Result<Vec<SessionInfo>, String> {
    let config = config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;

    let paths = crate::data::sqlite::search_fts5(&conn, &query, limit)?;

    let mut sessions = Vec::new();
    for path in paths {
        if !session_allowed_in_search(&path, &config) {
            continue;
        }
        if let Some(session) = crate::data::sqlite::get_session(&conn, &path)? {
            sessions.push(session);
        }
    }

    Ok(sessions)
}

#[cfg_attr(feature = "gui", tauri::command)]
#[allow(clippy::too_many_arguments)]
pub async fn full_text_search(
    query: String,
    role_filter: String,
    glob_pattern: Option<String>,
    project_path: Option<String>,
    page: usize,
    page_size: usize,
    match_mode: Option<String>,
    sort_order: Option<String>,
    source_filter: Option<String>,
    from: Option<String>,
    to: Option<String>,
) -> Result<FullTextSearchResponse, String> {
    let result = tokio::time::timeout(Duration::from_secs(SEARCH_TIMEOUT_SECS), tokio::task::spawn_blocking(move || full_text_search_blocking(query, role_filter, glob_pattern, project_path, page, page_size, match_mode, sort_order, source_filter, from, to))).await;

    match result {
        Ok(Ok(inner)) => inner,
        Ok(Err(e)) => Err(format!("Task panicked: {e}")),
        Err(_) => Err(format!("Search query timed out after {SEARCH_TIMEOUT_SECS} seconds")),
    }
}

#[allow(clippy::too_many_arguments)]
fn full_text_search_blocking(
    query: String,
    role_filter: String,
    glob_pattern: Option<String>,
    project_path: Option<String>,
    page: usize,
    page_size: usize,
    match_mode: Option<String>,
    sort_order: Option<String>,
    source_filter: Option<String>,
    from: Option<String>,
    to: Option<String>,
) -> Result<FullTextSearchResponse, String> {
    let start = Instant::now();
    let trimmed = query.trim().to_string();
    let source_filter = SourceFilter::parse(source_filter.as_deref())?;
    let is_labels_browse_mode = source_filter == SourceFilter::LabelsOnly && trimmed.is_empty();
    let sort_mode = SortMode::parse(sort_order.as_deref(), is_labels_browse_mode);
    let match_mode = MatchMode::parse(match_mode.as_deref());
    let time_scope = TimeScope::parse(from.as_deref(), to.as_deref())?;
    let fetch_limit = search_fetch_limit(page, page_size);
    let result_limit = search_result_limit(fetch_limit);

    if trimmed.is_empty() && !is_labels_browse_mode {
        return Ok(FullTextSearchResponse { hits: vec![], total_hits: 0, has_more: false });
    }

    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let conn = crate::data::sqlite::init_db_with_config(&config).map_err(|e| format!("Failed to init database: {e}"))?;
    conn.execute(format!("PRAGMA query_timeout = {}", SEARCH_TIMEOUT_SECS * 1000).as_str(), []).map_err(|e| format!("Failed to set query_timeout: {e}"))?;

    let normalized_role_filter = role_filter.to_lowercase();
    let role_opt = match normalized_role_filter.as_str() {
        "user" => Some("user"),
        "assistant" => Some("assistant"),
        _ => None,
    };

    let like_pattern = glob_pattern.as_ref().map(|value| value.trim().to_string()).filter(|value| !value.is_empty()).map(|value| glob_to_like(&value));
    let project_path_owned = project_path.as_ref().map(|value| value.trim().to_string()).filter(|value| !value.is_empty());

    let response = if is_labels_browse_mode {
        let hits = browse_all_labels_hits(&conn, role_opt, like_pattern.as_ref(), project_path_owned.as_ref(), sort_mode, &time_scope, &config, result_limit)?;
        paginate_hits(hits, page, page_size)
    } else {
        let session_id_matches = if source_filter.includes_session_id() { search_session_id_matches(&conn, &trimmed, role_opt, like_pattern.as_ref(), project_path_owned.as_ref(), &time_scope, &config, result_limit)? } else { Vec::new() };

        let message_hits = if sort_mode.uses_recent_priority() {
            search_message_hits_recent_first(&conn, &trimmed, role_opt, like_pattern.as_ref(), project_path_owned.as_ref(), match_mode, sort_mode, source_filter, &time_scope, &config, result_limit)?
        } else {
            search_message_hits(&conn, &trimmed, role_opt, like_pattern.as_ref(), project_path_owned.as_ref(), match_mode, sort_mode, source_filter, &time_scope, &config, result_limit)?
        };

        let combined_hits = truncate_hits(append_unique_hits(session_id_matches, message_hits), result_limit);
        paginate_hits(combined_hits, page, page_size)
    };

    let latency = start.elapsed();
    metrics::record_search_latency(latency);
    metrics::inc_search_queries();
    metrics::add_search_results(response.hits.len());

    Ok(response)
}

fn search_fetch_limit(page: usize, page_size: usize) -> usize {
    if page_size == 0 {
        return 0;
    }

    page.saturating_mul(page_size).saturating_add(page_size).saturating_add(1)
}

fn search_result_limit(fetch_limit: usize) -> usize {
    if fetch_limit == 0 {
        return 0;
    }

    fetch_limit.saturating_mul(SEARCH_RESULT_WINDOW_MULTIPLIER).max(SEARCH_RESULT_WINDOW_FLOOR)
}

fn message_candidate_limit(result_limit: usize) -> usize {
    if result_limit == 0 {
        return 0;
    }

    result_limit.saturating_mul(MESSAGE_SEARCH_CANDIDATE_MULTIPLIER).max(SEARCH_RESULT_WINDOW_FLOOR)
}

fn truncate_hits(mut hits: Vec<FullTextSearchHit>, fetch_limit: usize) -> Vec<FullTextSearchHit> {
    if fetch_limit == 0 {
        hits.clear();
    } else if hits.len() > fetch_limit {
        hits.truncate(fetch_limit);
    }
    hits
}

fn paginate_hits(hits: Vec<FullTextSearchHit>, page: usize, page_size: usize) -> FullTextSearchResponse {
    let total_hits = hits.len();
    let offset = page.saturating_mul(page_size);
    let paged_hits = if page_size == 0 || offset >= total_hits { Vec::new() } else { hits.into_iter().skip(offset).take(page_size).collect() };

    FullTextSearchResponse { has_more: offset.saturating_add(paged_hits.len()) < total_hits, total_hits, hits: paged_hits }
}

fn append_unique_hits(mut primary: Vec<FullTextSearchHit>, secondary: Vec<FullTextSearchHit>) -> Vec<FullTextSearchHit> {
    let mut seen = primary.iter().map(hit_identity_key).collect::<HashSet<String>>();

    for hit in secondary {
        let key = hit_identity_key(&hit);
        if seen.insert(key) {
            primary.push(hit);
        }
    }

    primary
}

fn hit_identity_key(hit: &FullTextSearchHit) -> String {
    format!("{}\u{1f}{}\u{1f}{}", hit.session_path, hit.entry_id, hit.source_type)
}

#[allow(clippy::too_many_arguments)]
fn browse_all_labels_hits(conn: &rusqlite::Connection, role_opt: Option<&str>, like_pattern: Option<&String>, project_path: Option<&String>, sort_mode: SortMode, time_scope: &TimeScope, config: &crate::config::Config, fetch_limit: usize) -> Result<Vec<FullTextSearchHit>, String> {
    let role_condition = match role_opt {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };

    let mut where_clause = format!("WHERE m.source_type = 'label' AND {role_condition}");
    let mut params: Vec<&dyn ToSql> = Vec::new();
    let (from_param, to_param) = time_scope.to_sql_params();

    if let Some(pattern) = like_pattern {
        where_clause = format!("{where_clause} AND m.session_path LIKE ? ESCAPE '\\'");
        params.push(pattern);
    }

    if let Some(project_path) = project_path {
        where_clause = format!("{where_clause} AND EXISTS (SELECT 1 FROM sessions s2 WHERE s2.path = m.session_path AND s2.cwd = ?)");
        params.push(project_path);
    }

    append_time_scope_sql(&mut where_clause, &mut params, "m.timestamp", from_param.as_ref(), to_param.as_ref());

    let order_sql = sort_mode.label_browse_order_sql();
    let data_sql = format!(
        "SELECT
            s.id,
            m.session_path,
            s.name,
            m.entry_id,
            m.role,
            m.source_type,
            m.content,
            m.timestamp
         FROM message_entries m
         JOIN sessions s ON s.path = m.session_path
         {where_clause}
         ORDER BY {order_sql}
         LIMIT {fetch_limit}"
    );

    let mut stmt = conn.prepare(&data_sql).map_err(|e| format!("Failed to prepare label browse query: {e}"))?;

    let rows = stmt
        .query_map(params.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?, row.get::<_, String>(6)?, row.get::<_, String>(7)?)))
        .map_err(|e| format!("Failed to execute label browse query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect label browse hits: {e}"))?;

    rows.into_iter()
        .filter(|(_, session_path, _, _, _, _, _, _)| session_allowed_in_search(session_path, config))
        .map(|(session_id, session_path, session_name, entry_id, role, source_type, content, timestamp_str)| {
            let timestamp = try_parse_timestamp(&timestamp_str).ok_or_else(|| format!("Invalid label browse timestamp for session {session_path} entry {entry_id}: {timestamp_str}"))?;
            Ok(FullTextSearchHit { session_id, session_path, session_name, entry_id, role, source_type, content, timestamp, score: LABEL_MATCH_BASE_SCORE, match_reason: Some("label".to_string()) })
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn search_session_id_matches(conn: &rusqlite::Connection, trimmed: &str, role_opt: Option<&str>, like_pattern: Option<&String>, project_path: Option<&String>, time_scope: &TimeScope, config: &crate::config::Config, fetch_limit: usize) -> Result<Vec<FullTextSearchHit>, String> {
    let exact_session_id_query = search::normalize_session_id_query(trimmed);
    let session_id_exact_only = search::session_id_query_is_exact(trimmed);
    let session_id_supports_prefix = !session_id_exact_only && exact_session_id_query.len() >= 3;

    let mut session_id_where_clause = if session_id_supports_prefix { "WHERE (lower(s.id) = ? OR substr(lower(s.id), 1, length(?)) = ?)".to_string() } else { "WHERE lower(s.id) = ?".to_string() };
    let mut session_id_params: Vec<&dyn ToSql> = if session_id_supports_prefix { vec![&exact_session_id_query, &exact_session_id_query, &exact_session_id_query] } else { vec![&exact_session_id_query] };
    let (from_param, to_param) = time_scope.to_sql_params();

    if let Some(pattern) = like_pattern {
        session_id_where_clause = format!("{session_id_where_clause} AND s.path LIKE ? ESCAPE '\\'");
        session_id_params.push(pattern);
    }

    if let Some(project_path) = project_path {
        session_id_where_clause = format!("{session_id_where_clause} AND s.cwd = ?");
        session_id_params.push(project_path);
    }

    append_time_scope_sql(&mut session_id_where_clause, &mut session_id_params, "s.modified", from_param.as_ref(), to_param.as_ref());

    let session_id_order_query = exact_session_id_query.clone();
    let session_id_sql = format!(
        "SELECT
            s.id,
            s.path,
            s.name,
            s.first_message,
            s.last_message,
            s.last_message_role,
            s.modified
         FROM sessions s
         {session_id_where_clause}
         ORDER BY CASE WHEN lower(s.id) = ? THEN 0 ELSE 1 END, julianday(s.modified) DESC, s.path ASC
         LIMIT {fetch_limit}"
    );
    session_id_params.push(&session_id_order_query);

    let mut stmt = conn.prepare(&session_id_sql).map_err(|e| format!("Failed to prepare session id query: {e}"))?;
    let rows = stmt
        .query_map(session_id_params.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?, row.get::<_, String>(6)?)))
        .map_err(|e| format!("Failed to query sessions by id: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect session id results: {e}"))?;

    Ok(rows
        .into_iter()
        .filter_map(|(session_id, session_path, session_name, first_message, last_message, last_message_role, modified_str)| {
            if !session_allowed_in_search(&session_path, config) {
                return None;
            }

            let timestamp = match try_parse_timestamp(&modified_str) {
                Some(timestamp) => timestamp,
                None => return None,
            };

            let match_kind = search::session_id_match_kind(&session_id, trimmed)?;
            let preview = if !last_message.trim().is_empty() {
                last_message.clone()
            } else if !first_message.trim().is_empty() {
                first_message.clone()
            } else {
                session_name.clone().unwrap_or_else(|| session_path.clone())
            };
            let role = match last_message_role.as_str() {
                "user" | "assistant" => last_message_role,
                _ => "assistant".to_string(),
            };

            if let Some(expected_role) = role_opt {
                if role != expected_role {
                    return None;
                }
            }

            Some(FullTextSearchHit {
                session_id,
                session_path,
                session_name,
                entry_id: String::new(),
                role: role.clone(),
                source_type: role,
                content: preview,
                timestamp,
                score: match match_kind {
                    search::SessionIdMatchKind::Exact => SESSION_ID_EXACT_SCORE,
                    search::SessionIdMatchKind::Prefix => SESSION_ID_PREFIX_SCORE,
                },
                match_reason: Some(match match_kind {
                    search::SessionIdMatchKind::Exact => "session_id_exact".to_string(),
                    search::SessionIdMatchKind::Prefix => "session_id_prefix".to_string(),
                }),
            })
        })
        .collect())
}

#[allow(clippy::too_many_arguments)]
fn search_message_hits_recent_first(
    conn: &rusqlite::Connection,
    trimmed: &str,
    role_opt: Option<&str>,
    like_pattern: Option<&String>,
    project_path: Option<&String>,
    match_mode: MatchMode,
    sort_mode: SortMode,
    source_filter: SourceFilter,
    time_scope: &TimeScope,
    config: &crate::config::Config,
    fetch_limit: usize,
) -> Result<Vec<FullTextSearchHit>, String> {
    if fetch_limit == 0 {
        return Ok(Vec::new());
    }

    let mut hits = Vec::new();
    for window_scope in build_recent_priority_scopes(time_scope) {
        let remaining = fetch_limit.saturating_sub(hits.len());
        if remaining == 0 {
            break;
        }

        let window_hits = search_message_hits(conn, trimmed, role_opt, like_pattern, project_path, match_mode, sort_mode, source_filter, &window_scope, config, remaining)?;
        hits = append_unique_hits(hits, window_hits);
        if hits.len() >= fetch_limit {
            hits.truncate(fetch_limit);
            break;
        }
    }
    Ok(hits)
}

#[allow(clippy::too_many_arguments)]
fn search_message_hits(
    conn: &rusqlite::Connection,
    trimmed: &str,
    role_opt: Option<&str>,
    like_pattern: Option<&String>,
    project_path: Option<&String>,
    match_mode: MatchMode,
    sort_mode: SortMode,
    source_filter: SourceFilter,
    time_scope: &TimeScope,
    config: &crate::config::Config,
    fetch_limit: usize,
) -> Result<Vec<FullTextSearchHit>, String> {
    if trimmed.is_empty() || fetch_limit == 0 {
        return Ok(Vec::new());
    }

    let contains_cjk_query = crate::utils::contains_cjk(trimmed);

    if match_mode == MatchMode::Smart && contains_cjk_query {
        let mut phrase_hits = search_message_hits_for_mode(conn, trimmed, role_opt, like_pattern, project_path, MatchMode::Phrase, sort_mode, source_filter, time_scope, config, fetch_limit)?;
        for hit in &mut phrase_hits {
            if hit.match_reason.as_deref() == Some("content") {
                hit.score += SMART_PHRASE_MATCH_BOOST;
            }
        }
        if phrase_hits.len() >= fetch_limit {
            return Ok(truncate_hits(phrase_hits, fetch_limit));
        }

        let all_hits = search_message_hits_for_mode(conn, trimmed, role_opt, like_pattern, project_path, MatchMode::All, sort_mode, source_filter, time_scope, config, fetch_limit)?;
        return Ok(truncate_hits(append_unique_hits(phrase_hits, all_hits), fetch_limit));
    }

    if match_mode == MatchMode::Smart && should_prioritize_phrase(trimmed) {
        let mut phrase_hits = search_message_hits_for_mode(conn, trimmed, role_opt, like_pattern, project_path, MatchMode::Phrase, sort_mode, source_filter, time_scope, config, fetch_limit)?;
        for hit in &mut phrase_hits {
            if hit.match_reason.as_deref() == Some("content") {
                hit.score += SMART_PHRASE_MATCH_BOOST;
            }
        }
        if phrase_hits.len() >= fetch_limit {
            return Ok(truncate_hits(phrase_hits, fetch_limit));
        }

        let any_hits = search_message_hits_for_mode(conn, trimmed, role_opt, like_pattern, project_path, MatchMode::Any, sort_mode, source_filter, time_scope, config, fetch_limit)?;
        return Ok(truncate_hits(append_unique_hits(phrase_hits, any_hits), fetch_limit));
    }

    let concrete_mode = if match_mode == MatchMode::Smart {
        if contains_cjk_query {
            MatchMode::All
        } else {
            MatchMode::Any
        }
    } else {
        match_mode
    };

    search_message_hits_for_mode(conn, trimmed, role_opt, like_pattern, project_path, concrete_mode, sort_mode, source_filter, time_scope, config, fetch_limit)
}

#[allow(clippy::too_many_arguments)]
fn search_message_hits_for_mode(
    conn: &rusqlite::Connection,
    trimmed: &str,
    role_opt: Option<&str>,
    like_pattern: Option<&String>,
    project_path: Option<&String>,
    match_mode: MatchMode,
    sort_mode: SortMode,
    source_filter: SourceFilter,
    time_scope: &TimeScope,
    config: &crate::config::Config,
    fetch_limit: usize,
) -> Result<Vec<FullTextSearchHit>, String> {
    if fetch_limit == 0 {
        return Ok(Vec::new());
    }

    let role_condition = match role_opt {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };
    let source_condition = source_filter.message_source_condition();
    let fts_query = build_fts_query(trimmed, match_mode);
    let mut params: Vec<&dyn ToSql> = vec![&fts_query];
    let mut where_clause = format!("WHERE message_fts MATCH ? AND {role_condition} AND {source_condition}");
    let (from_param, to_param) = time_scope.to_sql_params();

    if let Some(pattern) = like_pattern {
        where_clause = format!("{where_clause} AND m.session_path LIKE ? ESCAPE '\\'");
        params.push(pattern);
    }

    if let Some(project_path) = project_path {
        where_clause = format!("{where_clause} AND EXISTS (SELECT 1 FROM sessions s WHERE s.path = m.session_path AND s.cwd = ?)");
        params.push(project_path);
    }

    append_time_scope_sql(&mut where_clause, &mut params, "m.timestamp", from_param.as_ref(), to_param.as_ref());

    let candidate_source_precedence = "CASE source_type WHEN 'label' THEN 0 WHEN 'user' THEN 1 WHEN 'assistant' THEN 2 ELSE 3 END";
    let text_score_expr = "-message_fts.rank".to_string();
    let score_expr = format!("CASE WHEN m.source_type = 'label' THEN {LABEL_MATCH_BASE_SCORE} + ({text_score_expr}) ELSE ({text_score_expr}) END");

    let candidate_order = match sort_mode {
        SortMode::Newest => "julianday(m.timestamp) DESC, score DESC, m.session_path ASC, m.entry_id ASC",
        SortMode::Oldest => "julianday(m.timestamp) ASC, score DESC, m.session_path ASC, m.entry_id ASC",
        SortMode::Relevance => "score DESC, julianday(m.timestamp) DESC, m.session_path ASC, m.entry_id ASC",
    };
    let final_order = match sort_mode {
        SortMode::Newest => "julianday(d.timestamp) DESC, d.score DESC, d.session_path ASC, d.entry_id ASC",
        SortMode::Oldest => "julianday(d.timestamp) ASC, d.score DESC, d.session_path ASC, d.entry_id ASC",
        SortMode::Relevance => "d.score DESC, julianday(d.timestamp) DESC, d.session_path ASC, d.entry_id ASC",
    };
    let per_session_order = sort_mode.per_session_order_sql();
    let candidate_limit = message_candidate_limit(fetch_limit);
    let data_sql = format!(
        "WITH candidate_rows AS (
            SELECT
                m.entry_id,
                m.session_path,
                m.role,
                m.source_type,
                m.content,
                m.timestamp,
                {score_expr} AS score
            FROM message_entries m JOIN message_fts ON m.rowid = message_fts.rowid
            {where_clause}
            ORDER BY {candidate_order}
            LIMIT {candidate_limit}
        ),
        ranked AS (
            SELECT
                entry_id,
                session_path,
                role,
                source_type,
                content,
                timestamp,
                score,
                ROW_NUMBER() OVER (
                    PARTITION BY session_path, entry_id
                    ORDER BY {candidate_source_precedence}, julianday(timestamp) DESC
                ) AS rn_in_entry
            FROM candidate_rows
        ),
        deduped AS (
            SELECT
                entry_id,
                session_path,
                role,
                source_type,
                content,
                timestamp,
                score,
                ROW_NUMBER() OVER (
                    PARTITION BY session_path
                    ORDER BY {per_session_order}
                ) AS rn_in_session
            FROM ranked
            WHERE rn_in_entry = 1
        )
        SELECT
            d.entry_id,
            d.session_path,
            s.id,
            s.name,
            d.role,
            d.source_type,
            d.content,
            d.timestamp,
            d.score
        FROM deduped d
        JOIN sessions s ON s.path = d.session_path
        WHERE d.rn_in_session <= {PER_SESSION_LIMIT}
        ORDER BY {final_order}
        LIMIT {fetch_limit}"
    );

    let mut stmt = conn.prepare(&data_sql).map_err(|e| format!("Failed to prepare message search query: {e}"))?;
    let rows = stmt
        .query_map(params.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?, row.get::<_, String>(6)?, row.get::<_, String>(7)?, row.get::<_, f32>(8)?)))
        .map_err(|e| format!("Failed to execute message search query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message search hits: {e}"))?;

    rows.into_iter()
        .filter(|(_, session_path, _, _, _, _, _, _, _)| session_allowed_in_search(session_path, config))
        .map(|(entry_id, session_path, session_id, session_name, role, source_type, content, timestamp_str, score)| {
            let timestamp = try_parse_timestamp(&timestamp_str).ok_or_else(|| format!("Invalid search hit timestamp for session {session_path} entry {entry_id}: {timestamp_str}"))?;
            Ok(FullTextSearchHit { entry_id, session_path, session_id, session_name, role, source_type: source_type.clone(), content, timestamp, score, match_reason: Some(if source_type == "label" { "label".to_string() } else { "content".to_string() }) })
        })
        .collect()
}

fn build_recent_priority_scopes(base_scope: &TimeScope) -> Vec<TimeScope> {
    let now = Utc::now();
    let epsilon = ChronoDuration::microseconds(1);
    let seven_days_ago = now - ChronoDuration::days(7);
    let thirty_days_ago = now - ChronoDuration::days(30);
    let one_eighty_days_ago = now - ChronoDuration::days(180);

    [TimeScope { from: Some(seven_days_ago), to: None }, TimeScope { from: Some(thirty_days_ago), to: Some(seven_days_ago - epsilon) }, TimeScope { from: Some(one_eighty_days_ago), to: Some(thirty_days_ago - epsilon) }, TimeScope { from: None, to: Some(one_eighty_days_ago - epsilon) }]
        .into_iter()
        .filter_map(|window| base_scope.intersect(&window))
        .collect()
}

fn append_time_scope_sql<'a>(where_clause: &mut String, params: &mut Vec<&'a dyn ToSql>, column: &str, from_param: Option<&'a String>, to_param: Option<&'a String>) {
    if let Some(from) = from_param {
        *where_clause = format!("{where_clause} AND julianday({column}) >= julianday(?)");
        params.push(from);
    }

    if let Some(to) = to_param {
        *where_clause = format!("{where_clause} AND julianday({column}) <= julianday(?)");
        params.push(to);
    }
}

fn try_parse_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value).ok().map(|timestamp| timestamp.with_timezone(&Utc))
}

fn parse_time_bound(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value).map(|timestamp| timestamp.with_timezone(&Utc)).map_err(|error| format!("Invalid RFC3339 timestamp '{value}': {error}"))
}

fn escape_fts_term(term: &str) -> String {
    let mut escaped = String::new();
    for ch in term.chars() {
        match ch {
            '"' => escaped.push_str("\"\""),
            '\\' => escaped.push_str("\\\\"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn parse_quoted_terms(query: &str) -> (Vec<String>, Vec<String>, bool) {
    let normalized_query = query.replace(['“', '”'], "\"");
    let quote_count = normalized_query.chars().filter(|ch| *ch == '"').count();
    if quote_count == 0 || quote_count % 2 != 0 {
        let words = normalized_query.split_whitespace().map(|word| word.to_string()).collect::<Vec<String>>();
        return (vec![], words, false);
    }

    let mut phrases = Vec::new();
    let mut remainder = String::new();
    let mut current_phrase = String::new();
    let mut in_phrase = false;

    for ch in normalized_query.chars() {
        if ch == '"' {
            if in_phrase {
                if !current_phrase.trim().is_empty() {
                    phrases.push(current_phrase.clone());
                }
                current_phrase.clear();
            }
            in_phrase = !in_phrase;
            continue;
        }

        if in_phrase {
            current_phrase.push(ch);
        } else {
            remainder.push(ch);
        }
    }

    let words = remainder.split_whitespace().map(|word| word.to_string()).collect::<Vec<String>>();

    if phrases.is_empty() {
        let fallback_words = normalized_query.split_whitespace().map(|word| word.to_string()).collect::<Vec<String>>();
        return (vec![], fallback_words, false);
    }

    (phrases, words, true)
}

fn should_prioritize_phrase(trimmed_query: &str) -> bool {
    let (phrases, words, has_phrases) = parse_quoted_terms(trimmed_query);
    !has_phrases && phrases.is_empty() && words.len() > 1
}

fn build_phrase_text(trimmed_query: &str, phrases: &[String], words: &[String], has_phrases: bool) -> String {
    if has_phrases && words.is_empty() && phrases.len() == 1 {
        return phrases[0].clone();
    }

    if !words.is_empty() {
        return words.join(" ");
    }

    trimmed_query.trim().to_string()
}

fn build_fts_query(trimmed_query: &str, mode: MatchMode) -> String {
    let (phrases, words, has_phrases) = parse_quoted_terms(trimmed_query);

    if mode == MatchMode::Phrase {
        let phrase_text = build_phrase_text(trimmed_query, &phrases, &words, has_phrases);
        return build_exact_phrase_query(&phrase_text);
    }

    if !has_phrases {
        return join_fts_terms(build_fts_terms_for_words(&words), mode, trimmed_query);
    }

    let mut terms = build_fts_terms_for_words(&words);
    terms.extend(phrases.iter().map(|phrase| build_exact_phrase_query(phrase)));
    join_fts_terms(terms, mode, trimmed_query)
}

fn build_exact_phrase_query(value: &str) -> String {
    let normalized = crate::utils::normalize_search_text(value);
    if normalized.is_empty() {
        return format!("\"{}\"", escape_fts_term(value.trim()));
    }

    format!("\"{}\"", normalized.split_whitespace().map(escape_fts_term).collect::<Vec<_>>().join(" "))
}

fn build_fts_terms_for_words(words: &[String]) -> Vec<String> {
    words.iter().flat_map(|word| build_fts_terms_for_word(word)).collect()
}

fn build_fts_terms_for_word(word: &str) -> Vec<String> {
    let tokens = crate::utils::normalize_search_tokens(word);
    if tokens.is_empty() {
        return vec![];
    }

    if tokens.len() > 1 && !crate::utils::contains_cjk(word) {
        return vec![format!("\"{}\"", tokens.iter().map(|token| escape_fts_term(token)).collect::<Vec<_>>().join(" "))];
    }

    tokens.into_iter().map(|token| escape_fts_term(&token)).collect()
}

fn join_fts_terms(terms: Vec<String>, mode: MatchMode, fallback: &str) -> String {
    let final_terms = if terms.is_empty() {
        let normalized = crate::utils::normalize_search_text(fallback);
        if normalized.is_empty() {
            vec![format!("\"{}\"", escape_fts_term(fallback.trim()))]
        } else {
            normalized.split_whitespace().map(escape_fts_term).collect::<Vec<_>>()
        }
    } else {
        terms
    };

    if mode == MatchMode::All {
        final_terms.join(" ")
    } else {
        final_terms.join(" OR ")
    }
}

fn glob_to_like(pattern_str: &str) -> String {
    let mut like_pattern = String::new();
    for ch in pattern_str.chars() {
        match ch {
            '*' => like_pattern.push('%'),
            '?' => like_pattern.push('_'),
            '%' | '_' => {
                like_pattern.push('\\');
                like_pattern.push(ch);
            }
            '\\' => {
                like_pattern.push('\\');
                like_pattern.push('\\');
            }
            _ => like_pattern.push(ch),
        }
    }
    like_pattern
}

#[cfg(test)]
mod tests {
    use super::{build_fts_query, build_fts_terms_for_word, message_candidate_limit, search_fetch_limit, search_result_limit, MatchMode, SEARCH_RESULT_WINDOW_FLOOR};

    #[test]
    fn cjk_word_builds_character_terms() {
        let terms = build_fts_terms_for_word("默认系统中文");
        assert_eq!(terms, vec!["默", "认", "系", "统", "中", "文"]);
    }

    #[test]
    fn exact_phrase_query_uses_normalized_tokens() {
        let query = build_fts_query("\"默认识别系统\"", MatchMode::Phrase);
        assert_eq!(query, "\"默 认 识 别 系 统\"");
    }

    #[test]
    fn cjk_all_query_uses_character_terms() {
        let query = build_fts_query("默认系统中文", MatchMode::All);
        assert_eq!(query, "默 认 系 统 中 文");
    }

    #[test]
    fn latin_query_is_lowercased_and_tokenized() {
        let query = build_fts_query("Hello WORLD", MatchMode::All);
        assert_eq!(query, "hello world");
    }

    #[test]
    fn punctuation_split_word_uses_phrase_query() {
        let query = build_fts_query("codex-alpha", MatchMode::Any);
        assert_eq!(query, "\"codex alpha\"");
    }

    #[test]
    fn search_fetch_limit_reads_one_extra_row_for_has_more() {
        assert_eq!(search_fetch_limit(0, 8), 9);
        assert_eq!(search_fetch_limit(2, 8), 25);
        assert_eq!(search_fetch_limit(0, 0), 0);
    }

    #[test]
    fn message_candidate_limit_keeps_small_pages_bounded() {
        assert_eq!(search_result_limit(0), 0);
        assert_eq!(search_result_limit(9), SEARCH_RESULT_WINDOW_FLOOR.max(9 * 4));
        assert_eq!(message_candidate_limit(0), 0);
        assert_eq!(message_candidate_limit(64), 192);
    }
}
