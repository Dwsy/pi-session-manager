use crate::models::{Match, SearchResult, SessionInfo};

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

/// Search sessions
/// Optimizations:
/// 1. Use lowercase query cache to avoid repeated conversions
/// 2. Fast filtering: check if all_messages_text contains query first
/// 3. Reduce unnecessary string allocations
pub fn search_sessions(
    sessions: &[SessionInfo],
    query: &str,
    search_mode: SearchMode,
    role_filter: RoleFilter,
    include_tools: bool,
) -> Vec<SearchResult> {
    let query_trimmed = query.trim();
    if query_trimmed.is_empty() {
        return vec![];
    }

    // Pre-compute query words (lowercase) to avoid repeated conversions
    let query_lower = query_trimmed.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    if query_words.is_empty() {
        return vec![];
    }

    let mut results = Vec::new();

    for session in sessions {
        if search_mode == SearchMode::Name {
            // Search session name and first message
            if matches_session_name(session, &query_words) {
                results.push(SearchResult {
                    session_id: session.id.clone(),
                    session_path: session.path.clone(),
                    session_name: session.name.clone(),
                    first_message: session.first_message.clone(),
                    matches: vec![],
                    score: 1.0,
                });
            }
        } else {
            // Fast filter: check if all_messages_text contains query first
            // Avoid reading file for every session
            if !has_match_in_text(&session.all_messages_text, &query_words) {
                continue;
            }

            // Search message content
            let matches = find_matches(session, &query_words, role_filter, include_tools);
            if !matches.is_empty() {
                let score = calculate_score(&matches, &query_words);
                results.push(SearchResult {
                    session_id: session.id.clone(),
                    session_path: session.path.clone(),
                    session_name: session.name.clone(),
                    first_message: session.first_message.clone(),
                    matches,
                    score,
                });
            }
        }
    }

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results
}

/// Quickly check if text contains any query words (OR logic)
/// Used for fast filtering - returns true if any word is found
fn has_match_in_text(text: &str, query_words: &[&str]) -> bool {
    let text_lower = text.to_lowercase();
    query_words.iter().any(|word| text_lower.contains(word))
}

/// Match session name
/// Optimization: reduce string allocations, avoid creating intermediate strings
fn matches_session_name(session: &SessionInfo, query_words: &[&str]) -> bool {
    if query_words.is_empty() {
        return false;
    }

    let name = session.name.as_deref().unwrap_or("");
    let first_msg = &session.first_message;

    // Check if each query word matches name or first message
    // Avoid creating merged strings, reduce memory allocations
    query_words
        .iter()
        .all(|word| name.to_lowercase().contains(word) || first_msg.to_lowercase().contains(word))
}

/// Find matches
/// Optimizations:
/// 1. Remove duplicate all_messages_text check (already done in search_sessions)
/// 2. Use BufReader to read large files line by line, avoid loading entire file at once
/// 3. Reduce string allocations
fn find_matches(
    session: &SessionInfo,
    query_words: &[&str],
    role_filter: RoleFilter,
    include_tools: bool,
) -> Vec<Match> {
    if query_words.is_empty() {
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
        let content_lower = entry.content.to_lowercase();

        // Check if any query word matches (OR logic)
        let any_word_match = query_words.iter().any(|word| content_lower.contains(word));

        if any_word_match {
            // Find position of first matching word, generate snippet
            for word in query_words {
                if let Some(word_pos) = content_lower.find(word) {
                    let snippet_start = word_pos.saturating_sub(30);
                    let snippet_end = (word_pos + word.len() + 100).min(entry.content.len());
                    let snippet = entry.content[snippet_start..snippet_end].to_string();

                    matches.push(Match {
                        entry_id: entry.id.clone(),
                        role: entry.role.clone(),
                        snippet,
                        timestamp: entry.timestamp,
                    });
                    break; // Add only one snippet per entry
                }
            }
        }
    }

    matches.dedup_by(|a, b| a.entry_id == b.entry_id);
    matches.truncate(5);
    matches
}

struct MessageEntry {
    id: String,
    role: String,
    content: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

/// Parse session entries from BufReader
/// Optimization: support streaming read, avoid large file memory issues
fn parse_session_entries_from_reader<R: std::io::BufRead>(
    reader: R,
    role_filter: RoleFilter,
    include_tools: bool,
) -> Vec<MessageEntry> {
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
                let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());

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
                        entries.push(MessageEntry {
                            id: entry["id"].as_str().unwrap_or("").to_string(),
                            role: role.to_string(),
                            content: text,
                            timestamp,
                        });
                    }
                }
            }
        }
    }

    entries
}

fn get_filtered_session_content(path: &str, role_filter: RoleFilter) -> Result<String, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read session file: {e}"))?;

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
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read session file: {e}"))?;

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
            // Check word boundary matches, avoid creating too many temporary strings
            if let Some(pos) = snippet_lower.find(word) {
                let word_len = word.len();
                let snippet_bytes = snippet_lower.as_bytes();

                // Check if it is a word boundary
                let is_word_boundary_start =
                    pos == 0 || !snippet_bytes[pos - 1].is_ascii_alphanumeric();
                let is_word_boundary_end = pos + word_len >= snippet_bytes.len()
                    || !snippet_bytes[pos + word_len].is_ascii_alphanumeric();

                if is_word_boundary_start && is_word_boundary_end {
                    score += 0.5;
                }
            }
        }
    }

    score
}
