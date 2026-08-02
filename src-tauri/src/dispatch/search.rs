//! Search command adapter routes.

use super::*;

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
                    let result = crate::full_text_search(query, role_filter, glob_pattern, project_path, page, page_size, match_mode, sort_order, source_filter, from, to).await?;
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
