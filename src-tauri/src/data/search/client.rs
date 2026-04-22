use crate::types::{Match, SearchResult, SessionInfo};

const MIN_SESSION_ID_PREFIX_LENGTH: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SearchMode {
    Name,
    Content,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RoleFilter {
    All,
    User,
    Assistant,
}

#[derive(Debug, Clone)]
struct ParsedQuotedQuery {
    phrases: Vec<String>,
    words: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionIdMatchKind {
    Exact,
    Prefix,
}

fn normalize_search_quotes(raw_query: &str) -> String {
    raw_query.replace(['“', '”'], "\"")
}

pub fn session_id_query_is_exact(raw_query: &str) -> bool {
    let normalized_query = normalize_search_quotes(raw_query);
    let trimmed = normalized_query.trim();
    trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') && !trimmed[1..trimmed.len() - 1].contains('"')
}

pub fn normalize_session_id_query(raw_query: &str) -> String {
    let normalized_query = normalize_search_quotes(raw_query);
    let trimmed = normalized_query.trim();
    if session_id_query_is_exact(trimmed) {
        return trimmed[1..trimmed.len() - 1].trim().to_lowercase();
    }

    trimmed.to_lowercase()
}

pub fn session_id_match_kind(session_id: &str, raw_query: &str) -> Option<SessionIdMatchKind> {
    let normalized_query = normalize_session_id_query(raw_query);
    let exact_only = session_id_query_is_exact(raw_query);
    if normalized_query.is_empty() {
        return None;
    }

    let lower_session_id = session_id.to_lowercase();
    if lower_session_id == normalized_query {
        return Some(SessionIdMatchKind::Exact);
    }

    if !exact_only && normalized_query.len() >= MIN_SESSION_ID_PREFIX_LENGTH && lower_session_id.starts_with(&normalized_query) {
        return Some(SessionIdMatchKind::Prefix);
    }

    None
}

fn parse_quoted_query_lower(query: &str) -> ParsedQuotedQuery {
    let normalized_query = normalize_search_quotes(query);
    let quote_count = normalized_query.chars().filter(|ch| *ch == '"').count();
    if quote_count == 0 || quote_count % 2 != 0 {
        let words = crate::utils::normalize_search_tokens(&normalized_query);
        return ParsedQuotedQuery { phrases: vec![], words };
    }

    let mut phrases = Vec::new();
    let mut remainder = String::new();
    let mut current_phrase = String::new();
    let mut in_phrase = false;

    for ch in normalized_query.chars() {
        if ch == '"' {
            if in_phrase {
                if !current_phrase.trim().is_empty() {
                    phrases.push(crate::utils::normalize_search_text(&current_phrase));
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

    let words = crate::utils::normalize_search_tokens(&remainder);

    ParsedQuotedQuery { phrases, words }
}

/// Search sessions
/// Optimizations:
/// 1. Use lowercase query cache to avoid repeated conversions
/// 2. Reduce unnecessary string allocations
pub fn search_sessions(sessions: &[SessionInfo], query: &str, search_mode: SearchMode, role_filter: RoleFilter, include_tools: bool) -> Vec<SearchResult> {
    let query_trimmed = query.trim();
    if query_trimmed.is_empty() {
        return vec![];
    }

    let parsed_query = parse_quoted_query_lower(query_trimmed);
    if parsed_query.words.is_empty() && parsed_query.phrases.is_empty() {
        return vec![];
    }

    let query_has_cjk = crate::utils::contains_cjk(query_trimmed);

    let mut results = Vec::new();

    for session in sessions {
        if session_id_match_kind(&session.id, query_trimmed).is_some() {
            results.push(SearchResult { session_id: session.id.clone(), session_path: session.path.clone(), session_name: session.name.clone(), first_message: session.first_message.clone(), matches: vec![], score: 1_000.0 });
            continue;
        }

        if search_mode == SearchMode::Name {
            // Search session name and first message
            if matches_session_name(session, &parsed_query, query_has_cjk) {
                results.push(SearchResult { session_id: session.id.clone(), session_path: session.path.clone(), session_name: session.name.clone(), first_message: session.first_message.clone(), matches: vec![], score: 1.0 });
            }
        } else {
            // Search message content
            let matches = find_matches(session, &parsed_query, query_has_cjk, role_filter, include_tools);
            if !matches.is_empty() {
                let query_terms: Vec<&str> = parsed_query.words.iter().chain(parsed_query.phrases.iter()).map(String::as_str).collect();
                let score = calculate_score(&matches, &query_terms);
                results.push(SearchResult { session_id: session.id.clone(), session_path: session.path.clone(), session_name: session.name.clone(), first_message: session.first_message.clone(), matches, score });
            }
        }
    }

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results
}

/// Match session name
/// Optimization: reduce string allocations, avoid creating intermediate strings
fn matches_session_name(session: &SessionInfo, parsed_query: &ParsedQuotedQuery, query_has_cjk: bool) -> bool {
    if parsed_query.words.is_empty() && parsed_query.phrases.is_empty() {
        return false;
    }

    let name = session.name.as_deref().unwrap_or("");
    let first_msg = &session.first_message;
    let normalized_name = crate::utils::normalize_search_text(name);
    let normalized_first_msg = crate::utils::normalize_search_text(first_msg);
    local_search_matches(
        &normalized_name,
        &normalized_first_msg,
        parsed_query,
        query_has_cjk,
        true, // Name search uses AND logic
    )
}

/// Find matches
/// Optimizations:
/// 1. Use BufReader to read large files line by line, avoid loading entire file at once
/// 2. Reduce string allocations
fn find_matches(session: &SessionInfo, parsed_query: &ParsedQuotedQuery, query_has_cjk: bool, role_filter: RoleFilter, include_tools: bool) -> Vec<Match> {
    if parsed_query.words.is_empty() && parsed_query.phrases.is_empty() {
        return vec![];
    }

    let mut matches = Vec::new();

    // Use BufReader to read file line by line, avoid large file memory issues
    let file = match std::fs::File::open(&session.path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };
    let reader = std::io::BufReader::new(file);

    // Parse session entries
    let entries = parse_session_entries_from_reader(reader, role_filter, include_tools);

    for entry in &entries {
        let normalized_content = crate::utils::normalize_search_text(&entry.content);
        if local_search_matches(
            &normalized_content,
            "",
            parsed_query,
            query_has_cjk,
            false, // Content search uses OR logic
        ) {
            // TODO: Snippet takes first 130 chars; if the match is in the middle or later,
            // it won't be visible. Should center around the match position instead,
            // e.g. substr(content, instr(content, ?) - 40, 120).
            let snippet = entry.content.chars().take(130).collect::<String>();
            matches.push(Match { entry_id: entry.id.clone(), role: entry.role.clone(), snippet, timestamp: entry.timestamp });
        }
    }

    matches.dedup_by(|a, b| a.entry_id == b.entry_id);
    matches.truncate(5);
    matches
}

fn local_search_matches(normalized_primary: &str, normalized_secondary: &str, parsed_query: &ParsedQuotedQuery, query_has_cjk: bool, and_logic: bool) -> bool {
    let phrases_match = parsed_query.phrases.iter().all(|phrase| (!phrase.is_empty() && normalized_primary.contains(phrase)) || (!phrase.is_empty() && normalized_secondary.contains(phrase)));

    if !phrases_match {
        return false;
    }

    if parsed_query.words.is_empty() {
        return !parsed_query.phrases.is_empty();
    }

    if query_has_cjk {
        parsed_query.words.iter().all(|word| normalized_primary.contains(word) || normalized_secondary.contains(word))
    } else if and_logic {
        parsed_query.words.iter().all(|word| normalized_primary.contains(word) || normalized_secondary.contains(word))
    } else {
        parsed_query.words.iter().any(|word| normalized_primary.contains(word) || normalized_secondary.contains(word))
    }
}

struct MessageEntry {
    id: String,
    role: String,
    content: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

/// Parse session entries from BufReader
/// Optimization: support streaming read, avoid large file memory issues
fn parse_session_entries_from_reader<R: std::io::BufRead>(reader: R, role_filter: RoleFilter, include_tools: bool) -> Vec<MessageEntry> {
    let mut entries = Vec::new();

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&line) {
            // Only process message entries
            if entry["type"] != "message" {
                continue;
            }

            if let Some(message) = entry.get("message") {
                let role = message["role"].as_str().unwrap_or("unknown");
                let timestamp_str = entry["timestamp"].as_str().unwrap_or("");
                let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp_str).map(|dt| dt.with_timezone(&chrono::Utc)).unwrap_or_else(|_| chrono::Utc::now());

                // Filter by role
                let include = match role_filter {
                    RoleFilter::All => true,
                    RoleFilter::User => role == "user",
                    RoleFilter::Assistant => role == "assistant",
                };

                if include {
                    let empty_array = vec![];
                    let content = message["content"].as_array().unwrap_or(&empty_array);

                    let mut text = String::new();
                    for item in content {
                        if let Some(text_content) = item.get("text") {
                            if let Some(s) = text_content.as_str() {
                                text.push_str(s);
                            }
                        }

                        // If include_tools is true, include thinking content
                        if include_tools {
                            if let Some(thinking) = item.get("thinking") {
                                if let Some(s) = thinking.as_str() {
                                    text.push_str(s);
                                }
                            }
                        }
                    }

                    if !text.is_empty() {
                        entries.push(MessageEntry { id: entry["id"].as_str().unwrap_or("").to_string(), role: role.to_string(), content: text, timestamp });
                    }
                }
            }
        }
    }

    entries
}

fn get_filtered_session_content(path: &str, role_filter: RoleFilter) -> Result<String, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut full_text = String::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
            if entry["type"] == "message" {
                if let Some(message) = entry.get("message") {
                    let role = message["role"].as_str().unwrap_or("");

                    // Filter by role
                    let include = match role_filter {
                        RoleFilter::All => true,
                        RoleFilter::User => role == "user",
                        RoleFilter::Assistant => role == "assistant",
                    };

                    if include {
                        let empty_array = vec![];
                        let content = message["content"].as_array().unwrap_or(&empty_array);

                        for item in content {
                            if let Some(text) = item.get("text") {
                                if let Some(s) = text.as_str() {
                                    full_text.push_str(s);
                                    full_text.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

fn role_to_string(role_filter: RoleFilter) -> String {
    match role_filter {
        RoleFilter::All => "all".to_string(),
        RoleFilter::User => "user".to_string(),
        RoleFilter::Assistant => "assistant".to_string(),
    }
}

fn get_full_session_content(path: &str) -> Result<String, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut full_text = String::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
            if entry["type"] == "message" {
                if let Some(message) = entry.get("message") {
                    let empty_array = vec![];
                    let content = message["content"].as_array().unwrap_or(&empty_array);

                    for item in content {
                        if let Some(text) = item.get("text") {
                            if let Some(s) = text.as_str() {
                                full_text.push_str(s);
                                full_text.push('\n');
                            }
                        }

                        // Include thinking content
                        if let Some(thinking) = item.get("thinking") {
                            if let Some(s) = thinking.as_str() {
                                full_text.push_str(s);
                                full_text.push('\n');
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

/// Calculate match score
/// Optimization: reduce string allocations, use more efficient boundary checking
fn calculate_score(matches: &[Match], query_words: &[&str]) -> f32 {
    if matches.is_empty() {
        return 0.0;
    }

    // Base score: number of matches
    let mut score = matches.len() as f32;

    // Bonus for exact matches (word boundaries)
    for m in matches {
        let snippet_lower = m.snippet.to_lowercase();
        for word in query_words {
            if word.chars().any(char::is_whitespace) {
                continue;
            }

            // Check word boundary matches, avoid creating too many temporary strings
            if let Some(pos) = snippet_lower.find(word) {
                let word_len = word.len();
                let snippet_bytes = snippet_lower.as_bytes();

                // Check if it is a word boundary
                let is_word_boundary_start = pos == 0 || !snippet_bytes[pos - 1].is_ascii_alphanumeric();
                let is_word_boundary_end = pos + word_len >= snippet_bytes.len() || !snippet_bytes[pos + word_len].is_ascii_alphanumeric();

                if is_word_boundary_start && is_word_boundary_end {
                    score += 0.5;
                }
            }
        }
    }

    score
}
