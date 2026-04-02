use crate::metrics;
use crate::models::{FullTextSearchHit, FullTextSearchResponse, SessionInfo};
use crate::{config, search, sqlite_cache};
use chrono::{DateTime, Utc};
use rusqlite::ToSql;
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
    let sort_order = sort_order.unwrap_or_else(|| "relevance".to_string());
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

            fn contains_cjk(value: &str) -> bool {
                value.chars().any(|ch| matches!(ch as u32, 0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF))
            }

            fn build_fts_query(trimmed_query: &str, mode: &str) -> String {
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
                            if word
                                .chars()
                                .any(|ch| !ch.is_alphanumeric() && ch != '_')
                            {
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

            // Build the query string. CJK terms fall back to substring matching because unicode61 tokenization is unreliable for Chinese words.
            let use_content_like = contains_cjk(trimmed);
            let fts_query = build_fts_query(trimmed, mode);
            let content_like_query = trimmed.to_lowercase();
            let exact_session_id_query = search::normalize_session_id_query(trimmed);
            let session_id_exact_only = search::session_id_query_is_exact(trimmed);
            let session_id_supports_prefix = !session_id_exact_only && exact_session_id_query.len() >= 3;
            let like_pattern = glob_pattern
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .map(|value| glob_to_like(&value));
            let project_path_owned: Option<String> = project_path
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            let mut session_id_where_clause = if session_id_supports_prefix {
                "WHERE (lower(s.id) = ? OR substr(lower(s.id), 1, length(?)) = ?)".to_string()
            } else {
                "WHERE lower(s.id) = ?".to_string()
            };
            let mut session_id_params: Vec<&dyn rusqlite::ToSql> = if session_id_supports_prefix {
                vec![
                    &exact_session_id_query,
                    &exact_session_id_query,
                    &exact_session_id_query,
                ]
            } else {
                vec![&exact_session_id_query]
            };

            if let Some(pattern) = like_pattern.as_ref() {
                session_id_where_clause =
                    format!("{session_id_where_clause} AND s.path LIKE ? ESCAPE '\\'");
                session_id_params.push(pattern);
            }

            if let Some(project_path) = project_path_owned.as_ref() {
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

            let mut session_id_stmt = conn
                .prepare(&session_id_sql)
                .map_err(|e| format!("Failed to prepare session id query: {e}"))?;
            let session_id_rows = session_id_stmt
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

            let session_id_matches: Vec<FullTextSearchHit> = session_id_rows
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
                        let timestamp = match chrono::DateTime::parse_from_rfc3339(&modified_str) {
                            Ok(dt) => dt.with_timezone(&chrono::Utc),
                            Err(e) => {
                                eprintln!(
                                    "[FTS] Invalid modified timestamp '{modified_str}' for session {session_id}: {e}"
                                );
                                return None;
                            }
                        };

                        let match_kind = search::session_id_match_kind(&session_id, trimmed)?;
                        let preview = if !last_message.trim().is_empty() {
                            last_message.clone()
                        } else if !first_message.trim().is_empty() {
                            first_message.clone()
                        } else {
                            session_name
                                .clone()
                                .unwrap_or_else(|| session_path.clone())
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
                                search::SessionIdMatchKind::Exact => 1_000_000.0,
                                search::SessionIdMatchKind::Prefix => 999_000.0,
                            },
                            match_reason: Some(match match_kind {
                                search::SessionIdMatchKind::Exact => {
                                    "session_id_exact".to_string()
                                }
                                search::SessionIdMatchKind::Prefix => {
                                    "session_id_prefix".to_string()
                                }
                            }),
                        })
                    },
                )
                .collect();

            let session_id_count = session_id_matches.len();
            let global_offset = page * page_size;
            let global_limit = global_offset.saturating_add(page_size);
            let session_id_page_start = global_offset.min(session_id_count);
            let session_id_page_end = global_limit.min(session_id_count);
            let mut all_hits = session_id_matches[session_id_page_start..session_id_page_end].to_vec();

            // Build the base WHERE clause for message search and role filter.
            let role_condition = match role_opt {
                Some("user") => "m.role = 'user'",
                Some("assistant") => "m.role = 'assistant'",
                _ => "1=1",
            };
            let mut where_clause = if use_content_like {
                format!("WHERE lower(m.content) LIKE ? AND {role_condition}")
            } else {
                format!("WHERE message_fts MATCH ? AND {role_condition}")
            };
            let mut params: Vec<&dyn rusqlite::ToSql> = Vec::new();
            let like_content_pattern = format!("%{content_like_query}%");
            if use_content_like {
                params.push(&like_content_pattern);
            } else {
                params.push(&fts_query);
            }

            if let Some(pattern) = like_pattern.as_ref() {
                where_clause = format!("{where_clause} AND m.session_path LIKE ? ESCAPE '\\'");
                params.push(pattern);
            }

            if let Some(project_path) = project_path_owned.as_ref() {
                where_clause = format!(
                    "{where_clause} AND EXISTS (SELECT 1 FROM sessions s WHERE s.path = m.session_path AND s.cwd = ?)"
                );
                params.push(project_path);
            }

            // --- Count total message hits after per-session limit (max 3 per session) ---
            let count_sql = format!(
                "SELECT COUNT(*) FROM (
                    WITH ranked AS (
                        SELECT
                            m.entry_id,
                            m.session_path,
                            m.timestamp,
                            ROW_NUMBER() OVER (
                                PARTITION BY m.session_path, m.entry_id
                                ORDER BY CASE m.source_type WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END, m.timestamp DESC
                            ) as rn_in_entry
                        FROM message_entries m
                        JOIN message_fts ON m.rowid = message_fts.rowid
                        {where_clause}
                    ),
                    deduped AS (
                        SELECT
                            entry_id,
                            session_path,
                            timestamp,
                            ROW_NUMBER() OVER (PARTITION BY session_path ORDER BY timestamp DESC, entry_id DESC) as rn_in_session
                        FROM ranked
                        WHERE rn_in_entry = 1
                    )
                    SELECT 1 FROM deduped WHERE rn_in_session <= 3
                )"
            );
            let mut count_stmt = conn
                .prepare(&count_sql)
                .map_err(|e| format!("Failed to prepare total count query: {e}"))?;
            let message_total_hits: usize = count_stmt
                .query_row(params.as_slice(), |row| row.get::<_, i64>(0))
                .map_err(|e| format!("Failed to get total hits count: {e}"))?
                as usize;

            let message_offset = global_offset.saturating_sub(session_id_count);
            let message_limit = page_size.saturating_sub(all_hits.len());

            if message_limit > 0 && message_offset < message_total_hits {
                let rank_expr = if use_content_like { "-1.0" } else { "message_fts.rank" };

                // Sort expressions.
                // filtered CTE has no table aliases — use bare column names.
                // final ORDER BY sees f (filtered) and m (message_entries) — needs f. prefix.
                let bare_order = match sort_order.as_str() {
                    "newest" => "timestamp DESC",
                    "oldest" => "timestamp ASC",
                    _ => "rank",
                };
                let final_order = match sort_order.as_str() {
                    "newest" => "f.timestamp DESC",
                    "oldest" => "f.timestamp ASC",
                    _ => "f.rank",
                };

                let data_sql = format!(
                    "WITH ranked AS (
                        SELECT
                            m.entry_id,
                            m.session_path,
                            m.role,
                            m.source_type,
                            m.timestamp,
                            {rank_expr} as rank,
                            ROW_NUMBER() OVER (
                                PARTITION BY m.session_path, m.entry_id
                                ORDER BY CASE m.source_type WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END, m.timestamp DESC
                            ) as rn_in_entry
                        FROM message_entries m
                        JOIN message_fts ON m.rowid = message_fts.rowid
                        {where_clause}
                    ),
                    deduped AS (
                        SELECT
                            entry_id, session_path, role, source_type, timestamp, rank,
                            ROW_NUMBER() OVER (PARTITION BY session_path ORDER BY timestamp DESC, entry_id DESC) as rn_in_session
                        FROM ranked
                        WHERE rn_in_entry = 1
                    ),
                    filtered AS (
                        SELECT
                            entry_id,
                            session_path,
                            role,
                            source_type,
                            timestamp,
                            rank,
                            ROW_NUMBER() OVER (ORDER BY ORDER_BY_EXPR) as global_rn
                        FROM deduped
                        WHERE rn_in_session <= 3
                    )
                    SELECT
                        f.entry_id,
                        f.session_path,
                        s.id,
                        s.name,
                        f.role,
                        f.source_type,
                        m.content,
                        f.timestamp,
                        f.rank
                    FROM filtered f
                    JOIN message_entries m ON f.entry_id = m.entry_id AND f.session_path = m.session_path AND f.source_type = m.source_type
                    JOIN sessions s ON s.path = f.session_path
                    WHERE f.global_rn > ? AND f.global_rn <= ?
                    ORDER BY FINAL_ORDER_EXPR"
                );

                // Insert sort order (safe, only valid sort expressions)
                let data_sql = data_sql
                    .replace("ORDER_BY_EXPR", bare_order)
                    .replace("FINAL_ORDER_EXPR", final_order);

                let offset_i64 = message_offset as i64;
                let limit_i64 = message_offset.saturating_add(message_limit) as i64;
                let mut data_params: Vec<&dyn rusqlite::ToSql> = params.clone();
                data_params.push(&offset_i64);
                data_params.push(&limit_i64);

                let mut stmt = conn
                    .prepare(&data_sql)
                    .map_err(|e| format!("Failed to prepare data query: {e}"))?;

                let rows = stmt
                    .query_map(data_params.as_slice(), |row| {
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
                    .map_err(|e| format!("Failed to query message FTS: {e}"))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| format!("Failed to collect message FTS results: {e}"))?;

                for (
                    entry_id,
                    session_path,
                    session_id,
                    session_name,
                    role,
                    source_type,
                    content,
                    timestamp_str,
                    rank,
                ) in rows
                {
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
                        session_id,
                        session_path,
                        session_name,
                        entry_id,
                        role,
                        source_type,
                        content,
                        timestamp,
                        score: rank,
                        match_reason: Some("content".to_string()),
                    });
                }
            }

            let total_hits = session_id_count + message_total_hits;
            let has_more = global_limit < total_hits;

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
