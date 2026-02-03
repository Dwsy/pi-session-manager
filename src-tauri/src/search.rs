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

/// 搜索会话
/// 优化点：
/// 1. 使用小写查询词缓存，避免重复转换
/// 2. 快速过滤：先检查 all_messages_text 是否包含查询词
/// 3. 减少不必要的字符串分配
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

    // 预计算查询词（小写），避免重复转换
    let query_lower = query_trimmed.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    if query_words.is_empty() {
        return vec![];
    }

    let mut results = Vec::new();

    for session in sessions {
        if search_mode == SearchMode::Name {
            // 搜索会话名称和第一条消息
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
            // 快速过滤：先检查 all_messages_text 是否包含查询词
            // 避免对每个会话都读取文件
            if !has_match_in_text(&session.all_messages_text, &query_words) {
                continue;
            }

            // 搜索消息内容
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

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results
}

/// 快速检查文本是否包含任何查询词（OR 逻辑）
/// 用于快速过滤，只要包含任意一个词就返回 true
fn has_match_in_text(text: &str, query_words: &[&str]) -> bool {
    let text_lower = text.to_lowercase();
    query_words.iter().any(|word| text_lower.contains(word))
}

/// 匹配会话名称
/// 优化：减少字符串分配，避免创建中间字符串
fn matches_session_name(session: &SessionInfo, query_words: &[&str]) -> bool {
    if query_words.is_empty() {
        return false;
    }

    let name = session.name.as_deref().unwrap_or("");
    let first_msg = &session.first_message;

    // 检查每个查询词是否匹配名称或第一条消息
    // 避免创建合并字符串，减少内存分配
    query_words.iter().all(|word| {
        name.to_lowercase().contains(word) || first_msg.to_lowercase().contains(word)
    })
}

/// 查找匹配项
/// 优化点：
/// 1. 移除重复的 all_messages_text 检查（已在 search_sessions 中检查）
/// 2. 使用 BufReader 逐行读取大文件，避免一次性加载整个文件
/// 3. 减少字符串分配
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

    // 使用 BufReader 逐行读取文件，避免大文件内存问题
    let file = match std::fs::File::open(&session.path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };
    let reader = std::io::BufReader::new(file);

    // 解析会话条目
    let entries = parse_session_entries_from_reader(reader, role_filter, include_tools);

    for entry in &entries {
        let content_lower = entry.content.to_lowercase();

        // 检查是否有任何查询词匹配（OR 逻辑）
        let any_word_match = query_words.iter().any(|word| content_lower.contains(word));

        if any_word_match {
            // 找到第一个匹配词的位置，生成片段
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
                    break; // 每个条目只添加一个片段
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

/// 从 BufReader 解析会话条目
/// 优化：支持流式读取，避免大文件内存问题
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
            // 只处理消息条目
            if entry["type"] != "message" {
                continue;
            }

            if let Some(message) = entry.get("message") {
                let role = message["role"].as_str().unwrap_or("unknown");
                let timestamp_str = entry["timestamp"].as_str().unwrap_or("");
                let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());

                // 按角色过滤
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

                        // 如果 include_tools 为 true，包含 thinking 内容
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
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

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
                                    full_text.push_str("\n");
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
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

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
                                full_text.push_str("\n");
                            }
                        }

                        // Include thinking content
                        if let Some(thinking) = item.get("thinking") {
                            if let Some(s) = thinking.as_str() {
                                full_text.push_str(s);
                                full_text.push_str("\n");
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

/// 计算匹配分数
/// 优化：减少字符串分配，使用更高效的边界检查
fn calculate_score(matches: &[Match], query_words: &[&str]) -> f32 {
    if matches.is_empty() {
        return 0.0;
    }

    // 基础分数：匹配数量
    let mut score = matches.len() as f32;

    // 精确匹配加分（词边界）
    for m in matches {
        let snippet_lower = m.snippet.to_lowercase();
        for word in query_words {
            // 检查词边界匹配，避免创建过多临时字符串
            if let Some(pos) = snippet_lower.find(word) {
                let word_len = word.len();
                let snippet_bytes = snippet_lower.as_bytes();

                // 检查是否是词边界
                let is_word_boundary_start = pos == 0
                    || !snippet_bytes[pos - 1].is_ascii_alphanumeric();
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