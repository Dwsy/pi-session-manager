use anyhow::{anyhow, Result};
use colored::*;
use pi_session_manager::types::SessionEntry;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecallItem {
    pub id: String,
    pub role: String,
    pub timestamp: String,
    pub text: String,
    pub is_match: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecallWindow {
    pub session_path: String,
    pub matched_entry_id: String,
    pub matched_role: String,
    pub items: Vec<RecallItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecallResponse {
    pub query: String,
    pub total_windows: usize,
    pub windows: Vec<RecallWindow>,
}

#[derive(Debug, Clone)]
pub struct RecallOptions {
    pub query: String,
    pub target: Option<String>,
    pub before: usize,
    pub after: usize,
    pub max_results: usize,
    pub max_chars_per_entry: usize,
    pub json: bool,
}

impl Default for RecallOptions {
    fn default() -> Self {
        Self {
            query: String::new(),
            target: None,
            before: 2,
            after: 2,
            max_results: 3,
            max_chars_per_entry: 1200,
            json: false,
        }
    }
}

pub fn extract_entry_text(entry: &SessionEntry) -> String {
    if let Some(msg) = &entry.message {
        let texts: Vec<&str> = msg.content.iter().filter_map(|c| c.text.as_deref()).collect();
        if !texts.is_empty() {
            return texts.join("\n");
        }
    }
    String::new()
}

pub fn truncate_text(text: &str, max_chars: usize) -> String {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        text.to_string()
    } else {
        let truncated: String = text.chars().take(max_chars).collect();
        format!("{truncated}… [truncated, total {char_count} chars]")
    }
}

pub fn load_entries_from_file(path: &Path) -> Result<Vec<SessionEntry>> {
    if let Ok(entries) = pi_session_manager::domain::session_bridge::parse_session_entries_from_path(path) {
        if !entries.is_empty() {
            return Ok(entries);
        }
    }

    // Resilient fallback: parse line-by-line
    let content = std::fs::read_to_string(path)?;
    let mut entries = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<SessionEntry>(trimmed) {
            entries.push(entry);
        }
    }
    Ok(entries)
}

pub fn recall_from_entries(
    entries: &[SessionEntry],
    session_path: &str,
    query: &str,
    before: usize,
    after: usize,
    max_results: usize,
    max_chars: usize,
) -> Vec<RecallWindow> {
    if query.trim().is_empty() || entries.is_empty() {
        return Vec::new();
    }

    let q_lower = query.to_lowercase();
    let mut windows = Vec::new();

    for (idx, entry) in entries.iter().enumerate() {
        let text = extract_entry_text(entry);
        if text.to_lowercase().contains(&q_lower) {
            let role = entry.message.as_ref().map(|m| m.role.as_str()).unwrap_or("unknown").to_string();
            let start = idx.saturating_sub(before);
            let end = (idx + after + 1).min(entries.len());

            let mut items = Vec::new();
            for (curr_idx, item_entry) in entries[start..end].iter().enumerate() {
                let actual_idx = start + curr_idx;
                let item_text = extract_entry_text(item_entry);
                items.push(RecallItem {
                    id: item_entry.id.clone(),
                    role: item_entry.message.as_ref().map(|m| m.role.clone()).unwrap_or_else(|| "unknown".to_string()),
                    timestamp: item_entry.timestamp.to_rfc3339(),
                    text: truncate_text(&item_text, max_chars),
                    is_match: actual_idx == idx,
                });
            }

            windows.push(RecallWindow {
                session_path: session_path.to_string(),
                matched_entry_id: entry.id.clone(),
                matched_role: role,
                items,
            });

            if windows.len() >= max_results {
                break;
            }
        }
    }

    windows
}

pub async fn execute_recall(opts: RecallOptions) -> Result<()> {
    let query = opts.query.trim();
    if query.is_empty() {
        return Err(anyhow!("Query cannot be empty"));
    }

    let mut all_windows = Vec::new();

    if let Some(target) = &opts.target {
        let target_path = Path::new(target);
        if target_path.is_file() {
            let entries = load_entries_from_file(target_path)?;
            all_windows = recall_from_entries(
                &entries,
                target,
                query,
                opts.before,
                opts.after,
                opts.max_results,
                opts.max_chars_per_entry,
            );
        } else {
            return Err(anyhow!("Target file not found: {}", target));
        }
    } else {
        // Global search: search via offline SQLite engine directly
        let res = pi_session_manager::domain::session_search::full_text_search(
            query.to_string(),
            "all".to_string(),
            None,
            None,
            0,
            opts.max_results * 3,
            None,
            None,
            None,
            None,
            None,
        ).await;

        match res {
            Ok(search_resp) => {
                let mut seen_paths = std::collections::HashSet::new();
                for hit in search_resp.hits {
                    if seen_paths.contains(&hit.session_path) {
                        continue;
                    }
                    seen_paths.insert(hit.session_path.clone());

                    let session_path = Path::new(&hit.session_path);
                    if session_path.exists() {
                        if let Ok(entries) = load_entries_from_file(session_path) {
                            let mut win = recall_from_entries(
                                &entries,
                                &hit.session_path,
                                query,
                                opts.before,
                                opts.after,
                                1,
                                opts.max_chars_per_entry,
                            );
                            all_windows.append(&mut win);
                            if all_windows.len() >= opts.max_results {
                                break;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                return Err(anyhow!("Search index query failed: {e}"));
            }
        }
    }

    let resp = RecallResponse {
        query: query.to_string(),
        total_windows: all_windows.len(),
        windows: all_windows,
    };

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&resp)?);
    } else if resp.windows.is_empty() {
        println!("{}", format!("No dialogue windows found matching: \"{query}\"").yellow());
    } else {
        println!(
            "{}",
            format!("🎯 Found {} recall window(s) matching \"{}\":", resp.total_windows, query)
                .green()
                .bold()
        );
        for (i, win) in resp.windows.iter().enumerate() {
            println!("\n{}", format!("─── Window #{} [{}] ───", i + 1, win.session_path).cyan().bold());
            for item in &win.items {
                let role_label = if item.is_match {
                    format!("▶ [{}]", item.role).red().bold()
                } else {
                    format!("  [{}]", item.role).blue()
                };
                let preview = if item.text.trim().is_empty() {
                    "(no text content)".dimmed().to_string()
                } else {
                    item.text.clone()
                };
                println!("{role_label} ({})", item.timestamp.dimmed());
                println!("  {preview}\n");
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use pi_session_manager::types::{Content, Message};

    fn make_entry(id: &str, role: &str, text: &str) -> SessionEntry {
        SessionEntry {
            entry_type: "message".to_string(),
            id: id.to_string(),
            parent_id: None,
            timestamp: Utc::now(),
            message: Some(Message {
                role: role.to_string(),
                content: vec![Content {
                    content_type: "text".to_string(),
                    id: None,
                    name: None,
                    arguments: None,
                    text: Some(text.to_string()),
                }],
                tool_call_id: None,
                tool_name: None,
                is_error: None,
                model: None,
                provider: None,
                usage: None,
            }),
            target_id: None,
            label: None,
            name: None,
            provider: None,
            model_id: None,
        }
    }

    #[test]
    fn test_recall_window_slicing() {
        let entries = vec![
            make_entry("1", "user", "Hello first question"),
            make_entry("2", "assistant", "Answer to first question"),
            make_entry("3", "user", "Now investigate Tantivy indexing bug"),
            make_entry("4", "assistant", "Found the bug in schema definition"),
            make_entry("5", "user", "Great, let's fix it"),
        ];

        let windows = recall_from_entries(&entries, "test.jsonl", "tantivy", 1, 1, 3, 1000);
        assert_eq!(windows.len(), 1);
        let win = &windows[0];
        assert_eq!(win.matched_entry_id, "3");
        assert_eq!(win.items.len(), 3); // 2, 3, 4
        assert_eq!(win.items[0].id, "2");
        assert_eq!(win.items[1].id, "3");
        assert!(win.items[1].is_match);
        assert_eq!(win.items[2].id, "4");
    }

    #[test]
    fn test_truncation() {
        let long_text = "a".repeat(200);
        let truncated = truncate_text(&long_text, 50);
        assert!(truncated.contains("… [truncated, total 200 chars]"));
        assert_eq!(truncated.chars().take(50).collect::<String>(), "a".repeat(50));
    }
}
