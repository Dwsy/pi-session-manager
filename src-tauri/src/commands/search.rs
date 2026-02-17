use crate::metrics;
use crate::models::{FullTextSearchHit, FullTextSearchResponse, SessionInfo};
use crate::{config, search, sqlite_cache};
use chrono::{DateTime, Utc};
use rusqlite::ToSql;
use std::collections::HashMap;
use std::time::Instant;
use tokio::time::Duration;

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_sessions(
    sessions: Vec<SessionInfo>,
    query: String,
    search_mode: String,
    role_filter: String,
    include_tools: bool,
) -> Result<Vec<crate::models::SearchResult>, String> {
    let mode = match search_mode.as_str() {
        "name" => search::SearchMode::Name,
        _ => search::SearchMode::Content,
    };

    let role = match role_filter.as_str() {
        "user" => search::RoleFilter::User,
        "assistant" => search::RoleFilter::Assistant,
        _ => search::RoleFilter::All,
    };

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
    let conn = sqlite_cache::init_db_with_config(&config)?;

    let paths = sqlite_cache::search_fts5(&conn, &query, limit)?;

    let mut sessions = Vec::new();
    for path in paths {
        if let Some(session) = sqlite_cache::get_session(&conn, &path)? {
            sessions.push(session);
        }
    }

    Ok(sessions)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn full_text_search(
    query: String,
    role_filter: String,
    glob_pattern: Option<String>,
    page: usize,
    page_size: usize,
    match_mode: Option<String>,
) -> Result<FullTextSearchResponse, String> {
    // Quick validation
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(FullTextSearchResponse {
            hits: vec![],
            total_hits: 0,
            has_more: false,
        });
    }

    // Wrap all blocking DB operations in spawn_blocking with timeout
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::task::spawn_blocking(move || {
            // Compute trimmed query inside closure (query moved)
            let trimmed = query.trim();
            let start = Instant::now();

            // Load config (blocking file I/O)
            let config = config::load_config()
                .map_err(|e| format!("Failed to load config: {e}"))?;
            // Open database
            let conn = sqlite_cache::init_db_with_config(&config)
                .map_err(|e| format!("Failed to init database: {e}"))?;
            // Set query timeout at SQLite level (in milliseconds)
            conn.execute("PRAGMA query_timeout = 5000", [])
                .map_err(|e| format!("Failed to set query_timeout: {e}"))?;

            // Determine role filter for message FTS (case-insensitive)
            let role_filter = role_filter.to_lowercase();
            let role_opt = match role_filter.as_str() {
                "user" => Some("user"),
                "assistant" => Some("assistant"),
                _ => None,
            };

            // Build FTS query based on match_mode
            // Determine match mode: default "any"
            let mode = match match_mode.as_deref() {
                Some("all") => "all",
                Some("phrase") => "phrase",
                _ => "any", // default to any (OR)
            };

            // Helper to escape a word for FTS5
            fn escape_word(word: &str) -> String {
                let mut escaped = String::new();
                for ch in word.chars() {
                    match ch {
                        '"' => escaped.push_str("\"\""),
                        '\\' => escaped.push_str("\\\\"),
                        _ => escaped.push(ch),
                    }
                }
                escaped
            }

            // Build the FTS query string
            let fts_query = if mode == "phrase" {
                // Treat entire query as a phrase
                let escaped = escape_word(trimmed);
                format!("\"{escaped}\"")
            } else {
                // Split into words; for 'all' we use space (AND), for 'any' we use OR
                let words: Vec<&str> = trimmed.split_whitespace().collect();
                let escaped_words: Vec<String> = words.iter().map(|w| escape_word(w)).collect();
                if mode == "all" {
                    escaped_words.join(" ")
                } else {
                    // any mode
                    escaped_words.join(" OR ")
                }
            };

            // Build the base WHERE clause for FTS and role filter
            let role_condition = match role_opt {
                Some("user") => "m.role = 'user'",
                Some("assistant") => "m.role = 'assistant'",
                _ => "1=1",
            };
            let mut where_clause = format!("WHERE message_fts MATCH ? AND {role_condition}");
            let mut params: Vec<&dyn rusqlite::ToSql> = Vec::new();
            params.push(&fts_query);

            // Include glob pattern if provided: convert to LIKE with escaping
            let mut like_pattern = String::new(); // allocate early to extend lifetime
            if let Some(pattern_str) = &glob_pattern {
                if !pattern_str.is_empty() {
                    // Convert glob pattern (* and ?) to LIKE patterns (% and _) and escape LIKE wildcards (% and _) and backslash
                    like_pattern.clear();
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
                    where_clause = format!("{where_clause} AND m.session_path LIKE ? ESCAPE '\\'");
                    params.push(&like_pattern);
                }
            }

            // --- Count total hits after per-session limit (max 3 per session) ---
            let count_sql = format!(
                "SELECT COUNT(*) FROM (
                    SELECT 1 FROM (
                        SELECT
                            ROW_NUMBER() OVER (PARTITION BY m.session_path ORDER BY m.timestamp DESC) as rn_in_session
                        FROM message_entries m JOIN message_fts ON m.rowid = message_fts.rowid
                        {where_clause}
                    ) WHERE rn_in_session <= 3
                )"
            );

            let total_hits: usize = {
                let mut stmt = conn
                    .prepare(&count_sql)
                    .map_err(|e| format!("Failed to prepare total count query: {e}"))?;
                let count: i64 = match stmt.query_row(params.as_slice(), |row| row.get(0)) {
                    Ok(c) => c,
                    Err(e) => return Err(format!("Failed to get total hits count: {e}")),
                };
                count as usize
            };

            // --- Fetch the page of hits with global ordering and per-session limit ---
            let offset = page * page_size;
            let limit = page_size;
            let data_sql = format!(
                "WITH ranked AS (
                    SELECT
                        m.id,
                        m.session_path,
                        m.role,
                        m.timestamp,
                        message_fts.rank as rank,
                        ROW_NUMBER() OVER (PARTITION BY m.session_path ORDER BY m.timestamp DESC) as rn_in_session
                    FROM message_entries m
                    JOIN message_fts ON m.rowid = message_fts.rowid
                    {where_clause}
                ),
                filtered AS (
                    SELECT
                        id, session_path, role, timestamp, rank,
                        ROW_NUMBER() OVER (ORDER BY rank) as global_rn
                    FROM ranked
                    WHERE rn_in_session <= 3
                )
                SELECT f.id, f.session_path, f.role, m.content, f.timestamp, f.rank
                FROM filtered f
                JOIN message_entries m ON f.id = m.id
                WHERE f.global_rn > ? AND f.global_rn <= ?
                ORDER BY f.rank"
            );

            // Prepare parameters for data query: base params (fts_query, optional glob) plus offset and limit for global_rn
            let offset_i64 = offset as i64;
            let limit_i64 = (offset + limit) as i64;
            let mut data_params: Vec<&dyn rusqlite::ToSql> = params.clone();
            data_params.push(&offset_i64);
            data_params.push(&limit_i64);

            let mut stmt = conn
                .prepare(&data_sql)
                .map_err(|e| format!("Failed to prepare data query: {e}"))?;

            let rows = stmt
                .query_map(data_params.as_slice(), |row| {
                    Ok((
                        row.get::<_, String>(0)?, // entry_id
                        row.get::<_, String>(1)?, // session_path
                        row.get::<_, String>(2)?, // role
                        row.get::<_, String>(3)?, // content
                        row.get::<_, String>(4)?, // timestamp
                        row.get::<_, f32>(5)?,    // rank
                    ))
                })
                .map_err(|e| format!("Failed to query message FTS: {e}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to collect message FTS results: {e}"))?;

            // Batch fetch session details and build hits
            let mut all_hits = Vec::new();
            let mut sessions_cache: HashMap<String, SessionInfo> = HashMap::new();

            for (entry_id, session_path, role, content, timestamp_str, rank) in rows {
                // Get session from cache or DB
                let session = if let Some(sess) = sessions_cache.get(&session_path) {
                    sess.clone()
                } else if let Some(sess) = sqlite_cache::get_session(&conn, &session_path)? {
                    sessions_cache.insert(session_path.clone(), sess.clone());
                    sess
                } else {
                    continue;
                };

                // Parse timestamp
                let timestamp = match chrono::DateTime::parse_from_rfc3339(&timestamp_str) {
                    Ok(dt) => dt.with_timezone(&chrono::Utc),
                    Err(e) => {
                        eprintln!(
                            "[FTS] Invalid timestamp '{timestamp_str}' for entry {entry_id}: {e}"
                        );
                        continue;
                    }
                };

                all_hits.push(FullTextSearchHit {
                    session_id: session.id.clone(),
                    session_path: session.path.clone(),
                    session_name: session.name.clone(),
                    entry_id,
                    role,
                    content,
                    timestamp,
                    score: rank,
                });
            }

            // Rows are already ordered by global_rn, so all_hits is in correct order.

            let has_more = (page + 1) * page_size < total_hits;

            // Record metrics
            let latency = start.elapsed();
            metrics::record_search_latency(latency);
            metrics::inc_search_queries();
            metrics::add_search_results(all_hits.len());

            Ok(FullTextSearchResponse {
                hits: all_hits,
                total_hits,
                has_more,
            })
        })
    ).await;

    match result {
        Ok(Ok(inner)) => inner,
        Ok(Err(e)) => Err(format!("Task panicked: {e}")),
        Err(_) => Err("Search query timed out after 5 seconds".to_string()),
    }
}
