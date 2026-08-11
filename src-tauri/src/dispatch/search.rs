//! Search command adapter routes.

use super::*;

fn truncate_search_content(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    const MARKER: &str = "… [truncated]";
    let marker_chars = MARKER.chars().count();
    if max_chars <= marker_chars {
        return MARKER.chars().take(max_chars).collect();
    }
    let mut value: String = text.chars().take(max_chars - marker_chars).collect();
    value.push_str(MARKER);
    value
}

pub(super) const COMMANDS: &[&str] = &["search_sessions", "search_sessions_fts", "full_text_search"];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "search_sessions" => {
                    let sessions: Vec<crate::types::SessionInfo> = serde_json::from_value(payload.get("sessions").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid sessions: {e}"))?;
                    let query = extract(payload, "query")?;
                    let search_mode = extract(payload, "searchMode").unwrap_or_else(|_| "content".to_string());
                    let role_filter = extract(payload, "roleFilter").unwrap_or_else(|_| "all".to_string());
                    let include_tools = payload.get("includeTools").and_then(|v| v.as_bool()).unwrap_or(false);
                    let result = crate::search_sessions(sessions, query, search_mode, role_filter, include_tools).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "search_sessions_fts" => {
                    let query = extract(payload, "query")?;
                    let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
                    let result = crate::search_sessions_fts(query, limit).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "full_text_search" => {
                    let query = extract(payload, "query")?;
                    let role_filter = extract(payload, "role_filter").or_else(|_| extract(payload, "roleFilter")).map_err(|_| "Missing required field: role_filter or roleFilter")?;
                    let glob_pattern = payload.get("glob_pattern").or_else(|| payload.get("globPattern")).and_then(|v| v.as_str()).map(String::from);
                    let project_path = payload.get("project_path").or_else(|| payload.get("projectPath")).and_then(|v| v.as_str()).map(String::from);
                    let page = payload.get("page").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let page_size = payload.get("page_size").or_else(|| payload.get("pageSize")).and_then(|v| v.as_u64()).unwrap_or(20) as usize;
                    let match_mode = payload.get("match_mode").or_else(|| payload.get("matchMode")).and_then(|v| v.as_str()).map(String::from);
                    let sort_order = payload.get("sort_order").or_else(|| payload.get("sortOrder")).and_then(|v| v.as_str()).map(String::from);
                    let source_filter = payload.get("source_filter").or_else(|| payload.get("sourceFilter")).and_then(|v| v.as_str()).map(String::from);
                    let from = payload.get("from").and_then(|v| v.as_str()).map(String::from);
                    let to = payload.get("to").and_then(|v| v.as_str()).map(String::from);
                    let max_content_chars = payload.get("max_content_chars").or_else(|| payload.get("maxContentChars")).and_then(|v| v.as_u64()).map(|v| (v as usize).clamp(64, 16 * 1024));
                    let mut result = crate::full_text_search(query, role_filter, glob_pattern, project_path, page, page_size, match_mode, sort_order, source_filter, from, to).await?;
                    if let Some(max_chars) = max_content_chars {
                        for hit in &mut result.hits {
                            hit.content = truncate_search_content(&hit.content, max_chars);
                        }
                    }
                    Ok(to_val(result, "serialize result")?)
                }

                // ═══════════════════════════════════════════════════════════════
                // Favorites
                // ═══════════════════════════════════════════════════════════════,
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}

#[cfg(test)]
mod tests {
    use super::truncate_search_content;

    #[test]
    fn search_content_cap_is_unicode_safe_and_explicit() {
        let value = format!("{}tail", "你".repeat(100));
        let truncated = truncate_search_content(&value, 64);

        assert_eq!(truncated.chars().take(64).count(), 64);
        assert!(truncated.ends_with("… [truncated]"));
        assert!(!truncated.contains("tail"));
    }
}
