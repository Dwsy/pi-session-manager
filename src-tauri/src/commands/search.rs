use crate::metrics;
use crate::types::{FullTextSearchHit, FullTextSearchResponse, SessionInfo};
use crate::{config, search};
use rusqlite::ToSql;
use std::time::Instant;
use tokio::time::Duration;

const PER_SESSION_LIMIT: usize = 3;
const SESSION_ID_EXACT_SCORE: f32 = 1_000_000.0;
const SESSION_ID_PREFIX_SCORE: f32 = 999_000.0;
// These constants intentionally encode the user-facing ranking hierarchy:
// session-id rediscovery, intentional label rediscovery, ordinary content similarity
const LABEL_MATCH_BASE_SCORE: f32 = 500_000.0;
const CONTENT_LIKE_SCORE: f32 = 1.0;

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

    fn global_order_sql(self) -> &'static str {
        match self {
            Self::Newest => "timestamp DESC, score DESC, session_path ASC, entry_id ASC",
            Self::Oldest => "timestamp ASC, score DESC, session_path ASC, entry_id ASC",
            Self::Relevance => "score DESC, timestamp DESC, session_path ASC, entry_id ASC",
        }
    }

    fn label_browse_order_sql(self) -> &'static str {
        match self {
            Self::Oldest => "m.timestamp ASC, s.path ASC, m.entry_id ASC",
            _ => "m.timestamp DESC, s.path ASC, m.entry_id ASC",
        }
    }
}

fn session_allowed_in_search(path: &str, config: &crate::config::Config) -> bool {
    crate::domain::session_bridge::is_session_allowed_in_search(std::path::Path::new(path), config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_sessions(
    sessions: Vec<SessionInfo>,
    query: String,
    search_mode: String,
    role_filter: String,
    include_tools: bool,
) -> Result<Vec<crate::types::SearchResult>, String> {
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
    let sessions = sessions
        .into_iter()
        .filter(|session| session_allowed_in_search(&session.path, &config))
        .collect::<Vec<_>>();

    Ok(search::search_sessions(
        &sessions,
        &query,
        mode,
        role,
        include_tools,
    ))
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
) -> Result<FullTextSearchResponse, String> {
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::task::spawn_blocking(move || {
            full_text_search_blocking(
                query,
                role_filter,
                glob_pattern,
                project_path,
                page,
                page_size,
                match_mode,
                sort_order,
                source_filter,
            )
        }),
    )
    .await;

    match result {
        Ok(Ok(inner)) => inner,
        Ok(Err(e)) => Err(format!("Task panicked: {e}")),
        Err(_) => Err("Search query timed out after 5 seconds".to_string()),
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
) -> Result<FullTextSearchResponse, String> {
    let start = Instant::now();
    let trimmed = query.trim().to_string();
    let source_filter = SourceFilter::parse(source_filter.as_deref())?;
    let is_labels_browse_mode = source_filter == SourceFilter::LabelsOnly && trimmed.is_empty();
    let sort_mode = SortMode::parse(sort_order.as_deref(), is_labels_browse_mode);

    if trimmed.is_empty() && !is_labels_browse_mode {
        return Ok(FullTextSearchResponse {
            hits: vec![],
            total_hits: 0,
            has_more: false,
        });
    }

    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let conn = crate::data::sqlite::init_db_with_config(&config)
        .map_err(|e| format!("Failed to init database: {e}"))?;
    conn.execute("PRAGMA query_timeout = 5000", [])
        .map_err(|e| format!("Failed to set query_timeout: {e}"))?;

    let normalized_role_filter = role_filter.to_lowercase();
    let role_opt = match normalized_role_filter.as_str() {
        "user" => Some("user"),
        "assistant" => Some("assistant"),
        _ => None,
    };

    let like_pattern = glob_pattern
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| glob_to_like(&value));
    let project_path_owned = project_path
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let response = if is_labels_browse_mode {
        browse_all_labels(
            &conn,
            role_opt,
            like_pattern.as_ref(),
            project_path_owned.as_ref(),
            page,
            page_size,
            sort_mode,
            &config,
        )?
    } else {
        let session_id_matches = if source_filter.includes_session_id() {
            search_session_id_matches(
                &conn,
                &trimmed,
                role_opt,
                like_pattern.as_ref(),
                project_path_owned.as_ref(),
                &config,
            )?
        } else {
            Vec::new()
        };

        let session_id_count = session_id_matches.len();
        let global_offset = page * page_size;
        let global_limit = global_offset.saturating_add(page_size);
        let session_id_page_start = global_offset.min(session_id_count);
        let session_id_page_end = global_limit.min(session_id_count);
        let mut hits = session_id_matches[session_id_page_start..session_id_page_end].to_vec();

        let message_offset = global_offset.saturating_sub(session_id_count);
        let message_limit = page_size.saturating_sub(hits.len());
        let message_result = search_message_hits(
            &conn,
            &trimmed,
            role_opt,
            like_pattern.as_ref(),
            project_path_owned.as_ref(),
            message_offset,
            message_limit,
            match_mode.as_deref(),
            sort_mode,
            source_filter,
            &config,
        )?;

        hits.extend(message_result.hits);

        FullTextSearchResponse {
            hits,
            total_hits: session_id_count + message_result.total_hits,
            has_more: global_limit < session_id_count + message_result.total_hits,
        }
    };

    let latency = start.elapsed();
    metrics::record_search_latency(latency);
    metrics::inc_search_queries();
    metrics::add_search_results(response.hits.len());

    Ok(response)
}

#[allow(clippy::too_many_arguments)]
fn browse_all_labels(
    conn: &rusqlite::Connection,
    role_opt: Option<&str>,
    like_pattern: Option<&String>,
    project_path: Option<&String>,
    page: usize,
    page_size: usize,
    sort_mode: SortMode,
    config: &crate::config::Config,
) -> Result<FullTextSearchResponse, String> {
    let role_condition = match role_opt {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };

    let mut where_clause = format!("WHERE m.source_type = 'label' AND {role_condition}");
    let mut params: Vec<&dyn ToSql> = Vec::new();

    if let Some(pattern) = like_pattern {
        where_clause = format!("{where_clause} AND m.session_path LIKE ? ESCAPE '\\'");
        params.push(pattern);
    }

    if let Some(project_path) = project_path {
        where_clause = format!(
            "{where_clause} AND EXISTS (SELECT 1 FROM sessions s2 WHERE s2.path = m.session_path AND s2.cwd = ?)"
        );
        params.push(project_path);
    }

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
         ORDER BY {order_sql}"
    );

    let mut stmt = conn
        .prepare(&data_sql)
        .map_err(|e| format!("Failed to prepare label browse query: {e}"))?;

    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| format!("Failed to execute label browse query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect label browse hits: {e}"))?;

    // session_allowed_in_search() depends on runtime config + provider/path policy rather than
    // a persisted searchable flag, so we apply it after SQL. This keeps the fix simple and
    // correct; if it becomes hot, revisit with a persisted eligibility bit or bounded over-fetch.
    let allowed_rows = rows
        .into_iter()
        .filter(|(_, session_path, _, _, _, _, _, _)| {
            session_allowed_in_search(session_path, config)
        })
        .collect::<Vec<_>>();

    let total_hits = allowed_rows.len();
    let offset = page.saturating_mul(page_size);

    let hits = allowed_rows
        .into_iter()
        .skip(offset)
        .take(page_size)
        .map(
            |(
                session_id,
                session_path,
                session_name,
                entry_id,
                role,
                source_type,
                content,
                timestamp_str,
            )| {
                let timestamp = try_parse_timestamp(&timestamp_str).ok_or_else(|| {
                    format!(
                        "Invalid label browse timestamp for session {} entry {}: {}",
                        session_path, entry_id, timestamp_str
                    )
                })?;
                Ok(FullTextSearchHit {
                    session_id,
                    session_path,
                    session_name,
                    entry_id,
                    role,
                    source_type,
                    content,
                    timestamp,
                    score: LABEL_MATCH_BASE_SCORE,
                    match_reason: Some("label".to_string()),
                })
            },
        )
        .collect::<Result<Vec<_>, String>>()?;

    Ok(FullTextSearchResponse {
        hits,
        total_hits,
        has_more: offset + page_size < total_hits,
    })
}

fn search_session_id_matches(
    conn: &rusqlite::Connection,
    trimmed: &str,
    role_opt: Option<&str>,
    like_pattern: Option<&String>,
    project_path: Option<&String>,
    config: &crate::config::Config,
) -> Result<Vec<FullTextSearchHit>, String> {
    let exact_session_id_query = search::normalize_session_id_query(trimmed);
    let session_id_exact_only = search::session_id_query_is_exact(trimmed);
    let session_id_supports_prefix = !session_id_exact_only && exact_session_id_query.len() >= 3;

    let mut session_id_where_clause = if session_id_supports_prefix {
        "WHERE (lower(s.id) = ? OR substr(lower(s.id), 1, length(?)) = ?)".to_string()
    } else {
        "WHERE lower(s.id) = ?".to_string()
    };
    let mut session_id_params: Vec<&dyn ToSql> = if session_id_supports_prefix {
        vec![
            &exact_session_id_query,
            &exact_session_id_query,
            &exact_session_id_query,
        ]
    } else {
        vec![&exact_session_id_query]
    };

    if let Some(pattern) = like_pattern {
        session_id_where_clause =
            format!("{session_id_where_clause} AND s.path LIKE ? ESCAPE '\\'");
        session_id_params.push(pattern);
    }

    if let Some(project_path) = project_path {
        session_id_where_clause = format!("{session_id_where_clause} AND s.cwd = ?");
        session_id_params.push(project_path);
    }

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
         ORDER BY CASE WHEN lower(s.id) = ? THEN 0 ELSE 1 END, s.modified DESC, s.path ASC"
    );
    session_id_params.push(&session_id_order_query);

    let mut stmt = conn
        .prepare(&session_id_sql)
        .map_err(|e| format!("Failed to prepare session id query: {e}"))?;
    let rows = stmt
        .query_map(session_id_params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| format!("Failed to query sessions by id: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect session id results: {e}"))?;

    Ok(rows
        .into_iter()
        .filter_map(
            |(
                session_id,
                session_path,
                session_name,
                first_message,
                last_message,
                last_message_role,
                modified_str,
            )| {
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
            },
        )
        .collect())
}

struct MessageQueryResult {
    hits: Vec<FullTextSearchHit>,
    total_hits: usize,
}

#[allow(clippy::too_many_arguments)]
fn search_message_hits(
    conn: &rusqlite::Connection,
    trimmed: &str,
    role_opt: Option<&str>,
    like_pattern: Option<&String>,
    project_path: Option<&String>,
    message_offset: usize,
    message_limit: usize,
    match_mode: Option<&str>,
    sort_mode: SortMode,
    source_filter: SourceFilter,
    config: &crate::config::Config,
) -> Result<MessageQueryResult, String> {
    let use_content_like = contains_cjk(trimmed);
    let fts_query = build_fts_query(trimmed, match_mode);
    let content_like_pattern = format!("%{}%", trimmed.to_lowercase());
    let role_condition = match role_opt {
        Some("user") => "m.role = 'user'",
        Some("assistant") => "m.role = 'assistant'",
        _ => "1=1",
    };
    let source_condition = source_filter.message_source_condition();
    let from_clause = if use_content_like {
        "FROM message_entries m"
    } else {
        "FROM message_entries m JOIN message_fts ON m.rowid = message_fts.rowid"
    };
    let text_condition = if use_content_like {
        "lower(m.content) LIKE ?"
    } else {
        "message_fts MATCH ?"
    };
    let mut where_clause =
        format!("WHERE {text_condition} AND {role_condition} AND {source_condition}");

    let mut params: Vec<&dyn ToSql> = Vec::new();
    if use_content_like {
        params.push(&content_like_pattern);
    } else {
        params.push(&fts_query);
    }

    if let Some(pattern) = like_pattern {
        where_clause = format!("{where_clause} AND m.session_path LIKE ? ESCAPE '\\'");
        params.push(pattern);
    }

    if let Some(project_path) = project_path {
        where_clause = format!(
            "{where_clause} AND EXISTS (SELECT 1 FROM sessions s WHERE s.path = m.session_path AND s.cwd = ?)"
        );
        params.push(project_path);
    }

    let source_precedence =
        "CASE m.source_type WHEN 'label' THEN 0 WHEN 'user' THEN 1 WHEN 'assistant' THEN 2 ELSE 3 END";
    let text_score_expr = if use_content_like {
        CONTENT_LIKE_SCORE.to_string()
    } else {
        "-message_fts.rank".to_string()
    };
    let score_expr = format!(
        "CASE WHEN m.source_type = 'label' THEN {LABEL_MATCH_BASE_SCORE} + ({text_score_expr}) ELSE ({text_score_expr}) END"
    );

    let global_order = sort_mode.global_order_sql();
    let data_sql = format!(
        "WITH ranked AS (
            SELECT
                m.entry_id,
                m.session_path,
                m.role,
                m.source_type,
                m.content,
                m.timestamp,
                {score_expr} AS score,
                ROW_NUMBER() OVER (
                    PARTITION BY m.session_path, m.entry_id
                    ORDER BY {source_precedence}, m.timestamp DESC
                ) AS rn_in_entry
            {from_clause}
            {where_clause}
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
                    ORDER BY timestamp DESC, entry_id DESC
                ) AS rn_in_session
            FROM ranked
            WHERE rn_in_entry = 1
        ),
        filtered AS (
            SELECT
                entry_id,
                session_path,
                role,
                source_type,
                content,
                timestamp,
                score,
                ROW_NUMBER() OVER (ORDER BY {global_order}) AS global_rn
            FROM deduped
            WHERE rn_in_session <= {PER_SESSION_LIMIT}
        )
        SELECT
            f.entry_id,
            f.session_path,
            s.id,
            s.name,
            f.role,
            f.source_type,
            f.content,
            f.timestamp,
            f.score
        FROM filtered f
        JOIN sessions s ON s.path = f.session_path
        ORDER BY f.global_rn"
    );

    let mut stmt = conn
        .prepare(&data_sql)
        .map_err(|e| format!("Failed to prepare message search query: {e}"))?;
    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, f32>(8)?,
            ))
        })
        .map_err(|e| format!("Failed to execute message search query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect message search hits: {e}"))?;

    // session_allowed_in_search() is not represented in SQL. We post-filter in Rust, then
    // paginate the surviving rows; PER_SESSION_LIMIT still bounds row growth per session.
    let allowed_rows = rows
        .into_iter()
        .filter(|(_, session_path, _, _, _, _, _, _, _)| {
            session_allowed_in_search(session_path, config)
        })
        .collect::<Vec<_>>();

    let total_hits = allowed_rows.len();
    let hits = if message_limit == 0 || message_offset >= total_hits {
        Vec::new()
    } else {
        allowed_rows
            .into_iter()
            .skip(message_offset)
            .take(message_limit)
            .map(
                |(
                    entry_id,
                    session_path,
                    session_id,
                    session_name,
                    role,
                    source_type,
                    content,
                    timestamp_str,
                    score,
                )| {
                    let timestamp = try_parse_timestamp(&timestamp_str).ok_or_else(|| {
                        format!(
                            "Invalid search hit timestamp for session {} entry {}: {}",
                            session_path, entry_id, timestamp_str
                        )
                    })?;
                    Ok(FullTextSearchHit {
                        entry_id,
                        session_path,
                        session_id,
                        session_name,
                        role,
                        source_type: source_type.clone(),
                        content,
                        timestamp,
                        score,
                        match_reason: Some(if source_type == "label" {
                            "label".to_string()
                        } else {
                            "content".to_string()
                        }),
                    })
                },
            )
            .collect::<Result<Vec<_>, String>>()?
    };

    Ok(MessageQueryResult { hits, total_hits })
}

fn try_parse_timestamp(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
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
        let words = normalized_query
            .split_whitespace()
            .map(|word| word.to_string())
            .collect::<Vec<String>>();
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

    let words = remainder
        .split_whitespace()
        .map(|word| word.to_string())
        .collect::<Vec<String>>();

    if phrases.is_empty() {
        let fallback_words = normalized_query
            .split_whitespace()
            .map(|word| word.to_string())
            .collect::<Vec<String>>();
        return (vec![], fallback_words, false);
    }

    (phrases, words, true)
}

fn build_fts_query(trimmed_query: &str, mode: Option<&str>) -> String {
    let mode = match mode {
        Some("all") => "all",
        Some("phrase") => "phrase",
        _ => "any",
    };
    let (phrases, words, has_phrases) = parse_quoted_terms(trimmed_query);

    if mode == "phrase" {
        if has_phrases && words.is_empty() && phrases.len() == 1 {
            let escaped = escape_fts_term(&phrases[0]);
            return format!("\"{escaped}\"");
        }

        let escaped = escape_fts_term(trimmed_query);
        return format!("\"{escaped}\"");
    }

    if !has_phrases {
        let escaped_words: Vec<String> = words
            .iter()
            .map(|word| {
                let escaped = escape_fts_term(word);
                if word.chars().any(|ch| !ch.is_alphanumeric() && ch != '_') {
                    format!("\"{escaped}\"")
                } else {
                    escaped
                }
            })
            .collect();

        if mode == "all" {
            return escaped_words.join(" ");
        }

        return escaped_words.join(" OR ");
    }

    let mut terms: Vec<String> = words.iter().map(|word| escape_fts_term(word)).collect();
    terms.extend(
        phrases
            .iter()
            .map(|phrase| format!("\"{}\"", escape_fts_term(phrase))),
    );

    if terms.is_empty() {
        let escaped = escape_fts_term(trimmed_query);
        return format!("\"{escaped}\"");
    }

    if mode == "all" {
        terms.join(" ")
    } else {
        terms.join(" OR ")
    }
}

fn contains_cjk(value: &str) -> bool {
    value.chars().any(|ch| {
        matches!(
            ch as u32,
            0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF
        )
    })
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
