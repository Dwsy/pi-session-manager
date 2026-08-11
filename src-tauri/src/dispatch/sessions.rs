//! Sessions command adapter routes.

use super::*;

pub(super) const COMMANDS: &[&str] = &[
    "scan_sessions",
    "scan_sessions_paginated",
    "session_digest",
    "read_session_file",
    "read_session_file_chunk",
    "read_session_file_incremental",
    "read_session_file_incremental_offset",
    "get_file_stats",
    "get_session_entries",
    "get_session_labels",
    "detect_session_format",
    "list_supported_session_providers",
    "convert_session_format",
    "get_session_by_path",
    "get_session_by_id",
    "delete_session",
    "delete_sessions",
    "export_session",
    "rename_session",
    "fork_session",
    "get_session_stats",
    "get_session_stats_light",
    "get_all_favorites",
    "add_favorite",
    "remove_favorite",
    "is_favorite",
    "toggle_favorite",
    "get_all_tags",
    "create_tag",
    "update_tag",
    "delete_tag",
    "get_all_session_tags",
    "assign_tag",
    "remove_tag_from_session",
    "move_session_tag",
    "reorder_tags",
];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "scan_sessions" => {
                    let result = crate::core::scanner::scan_sessions().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "scan_sessions_paginated" => {
                    let offset = payload.get("offset").and_then(|v| v.as_u64()).map(|v| v as usize);
                    let limit = payload.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
                    let search_query = extract_optional_string(payload, "search_query").or_else(|| extract_optional_string(payload, "searchQuery"));
                    let project_filter = extract_optional_string(payload, "project_filter").or_else(|| extract_optional_string(payload, "projectFilter"));
                    let filter_tag_ids = payload.get("filter_tag_ids").or_else(|| payload.get("filterTagIds")).and_then(|value| value.as_array()).map(|items| items.iter().filter_map(|item| item.as_str().map(|text| text.to_string())).collect::<Vec<String>>());
                    let source_filter_slugs = payload.get("source_filter_slugs").or_else(|| payload.get("sourceFilterSlugs")).and_then(|value| value.as_array()).map(|items| items.iter().filter_map(|item| item.as_str().map(|text| text.to_string())).collect::<Vec<String>>());
                    let sort_by = extract_optional_string(payload, "sort_by").or_else(|| extract_optional_string(payload, "sortBy"));
                    let result = crate::scan_sessions_paginated(offset, limit, search_query, project_filter, filter_tag_ids, source_filter_slugs, sort_by).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "session_digest" => {
                    let (version, count) = crate::core::scanner::get_session_digest();
                    Ok(serde_json::json!({ "version": version, "count": count }))
                }

                // ═══════════════════════════════════════════════════════════════
                // Session file reading
                // ═══════════════════════════════════════════════════════════════,
                "read_session_file" => {
                    let path = extract(payload, "path")?;
                    let result = crate::read_session_file(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "read_session_file_chunk" => {
                    let path = extract(payload, "path")?;
                    let offset = payload.get("offset").and_then(|v| v.as_u64());
                    let max_bytes = payload.get("maxBytes").and_then(|v| v.as_u64()).map(|v| v as usize);
                    let result = crate::read_session_file_chunk(path, offset, max_bytes).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "read_session_file_incremental" => {
                    let path = extract(payload, "path")?;
                    let from_line = extract_usize(payload, "fromLine")?;
                    let result = crate::read_session_file_incremental(path, from_line).await?;
                    Ok(serde_json::json!(result))
                }
                "read_session_file_incremental_offset" => {
                    let path = extract(payload, "path")?;
                    let from_offset = payload.get("fromOffset").and_then(|v| v.as_u64()).ok_or_else(|| "Missing or invalid field: fromOffset".to_string())?;
                    let (new_offset, new_content) = crate::read_session_file_incremental_offset(path, from_offset).await?;
                    Ok(serde_json::json!([new_offset, new_content]))
                }
                "get_file_stats" => {
                    let path = extract(payload, "path")?;
                    let result = crate::get_file_stats(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_entries" => {
                    let path = extract(payload, "path")?;
                    let result = crate::get_session_entries(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_labels" => {
                    let path = extract(payload, "path")?;
                    let result = crate::get_session_labels(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "detect_session_format" => {
                    let path = extract(payload, "path")?;
                    let result = crate::detect_session_format(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "list_supported_session_providers" => {
                    let result = crate::list_supported_session_providers().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "convert_session_format" => {
                    let path = extract(payload, "path")?;
                    let target_format = extract_optional_string(payload, "target_format").or_else(|| extract_optional_string(payload, "targetFormat")).ok_or_else(|| "Missing field: target_format".to_string())?;
                    let dry_run = payload.get("dry_run").or_else(|| payload.get("dryRun")).and_then(|value| value.as_bool());
                    let force = payload.get("force").and_then(|value| value.as_bool());
                    let result = crate::convert_session_format(path, target_format, dry_run, force).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_by_path" => {
                    let path = extract(payload, "path")?;
                    let result = crate::get_session_by_path(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_by_id" => {
                    let id = extract(payload, "id")?;
                    let result = crate::get_session_by_id(id).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "delete_session" => {
                    let path = extract(payload, "path")?;
                    crate::core::delete::delete_session_file_and_cache(&path)?;
                    Ok(Value::Null)
                }
                "delete_sessions" => {
                    let paths: Vec<String> = serde_json::from_value(payload.get("paths").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid paths: {e}"))?;
                    let result = crate::delete_sessions(paths).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "export_session" => {
                    let path = extract(payload, "path")?;
                    let format = extract(payload, "format")?;
                    let output_path = extract(payload, "outputPath")?;
                    crate::export::export_session(&path, &format, &output_path).await?;
                    Ok(Value::Null)
                }
                "rename_session" => {
                    let path = extract(payload, "path")?;
                    let new_name = extract(payload, "newName")?;
                    crate::rename_session(path, new_name).await?;
                    Ok(Value::Null)
                }
                "fork_session" => {
                    let source_path = extract(payload, "sourcePath")?;
                    let target_name = payload.get("targetName").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let result = crate::commands::session_file::fork_session_impl(source_path, target_name).await?;
                    Ok(to_val(result, "serialize result")?)
                }

                // ═══════════════════════════════════════════════════════════════
                // Statistics
                // ═══════════════════════════════════════════════════════════════,
                "get_session_stats" => {
                    let sessions: Vec<crate::types::SessionInfo> = serde_json::from_value(payload.get("sessions").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid sessions: {e}"))?;
                    let result = crate::stats::calculate_stats(&sessions);
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_stats_light" => {
                    let sessions: Vec<crate::stats::SessionStatsInput> = serde_json::from_value(payload.get("sessions").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid sessions: {e}"))?;
                    let result = crate::stats::calculate_stats_from_inputs(&sessions);
                    Ok(to_val(result, "serialize result")?)
                }
                // ═══════════════════════════════════════════════════════════════
                // Search
                // ═══════════════════════════════════════════════════════════════,
                "get_all_favorites" => {
                    let result = crate::get_all_favorites().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "add_favorite" => {
                    let id = extract(payload, "id")?;
                    let favorite_type = extract(payload, "favoriteType")?;
                    let name = extract(payload, "name")?;
                    let path = extract(payload, "path")?;
                    crate::add_favorite(id, favorite_type, name, path).await?;
                    Ok(Value::Null)
                }
                "remove_favorite" => {
                    let id = extract(payload, "id")?;
                    crate::remove_favorite(id).await?;
                    Ok(Value::Null)
                }
                "is_favorite" => {
                    let id = extract(payload, "id")?;
                    let result = crate::is_favorite(id).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "toggle_favorite" => {
                    let id = extract(payload, "id")?;
                    let favorite_type = extract(payload, "favoriteType")?;
                    let name = extract(payload, "name")?;
                    let path = extract(payload, "path")?;
                    let result = crate::toggle_favorite(id, favorite_type, name, path).await?;
                    Ok(to_val(result, "serialize result")?)
                }

                // ═══════════════════════════════════════════════════════════════
                // Skills & prompts
                // ═══════════════════════════════════════════════════════════════,
                "get_all_tags" => {
                    let result = crate::get_all_tags().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "create_tag" => {
                    let name = extract(payload, "name")?;
                    let color = extract(payload, "color")?;
                    let icon = extract_optional_string(payload, "icon");
                    let parent_id = extract_optional_string(payload, "parentId");
                    let result = crate::create_tag(name, color, icon, parent_id).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "update_tag" => {
                    let id = extract(payload, "id")?;
                    let name = extract_optional_string(payload, "name");
                    let color = extract_optional_string(payload, "color");
                    let icon = extract_optional_string(payload, "icon");
                    let sort_order = payload.get("sortOrder").and_then(|v| v.as_i64());
                    let parent_id = if payload.get("parentId").is_some() { Some(extract_optional_string(payload, "parentId")) } else { None };
                    crate::update_tag(id, name, color, icon, sort_order, parent_id).await?;
                    Ok(Value::Null)
                }
                "delete_tag" => {
                    let id = extract(payload, "id")?;
                    crate::delete_tag(id).await?;
                    Ok(Value::Null)
                }
                "get_all_session_tags" => {
                    let result = crate::get_all_session_tags().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "assign_tag" => {
                    let session_id = extract(payload, "sessionId")?;
                    let tag_id = extract(payload, "tagId")?;
                    crate::assign_tag(session_id, tag_id).await?;
                    Ok(Value::Null)
                }
                "remove_tag_from_session" => {
                    let session_id = extract(payload, "sessionId")?;
                    let tag_id = extract(payload, "tagId")?;
                    crate::remove_tag_from_session(session_id, tag_id).await?;
                    Ok(Value::Null)
                }
                "move_session_tag" => {
                    let session_id = extract(payload, "sessionId")?;
                    let from_tag_id = extract_optional_string(payload, "fromTagId");
                    let to_tag_id = extract(payload, "toTagId")?;
                    let position = payload.get("position").and_then(|v| v.as_i64()).unwrap_or(0);
                    crate::move_session_tag(session_id, from_tag_id, to_tag_id, position).await?;
                    Ok(Value::Null)
                }
                "reorder_tags" => {
                    let tag_ids: Vec<String> = serde_json::from_value(payload.get("tagIds").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid tagIds: {e}"))?;
                    crate::reorder_tags(tag_ids).await?;
                    Ok(Value::Null)
                }

                // ═══════════════════════════════════════════════════════════════
                // Auth / API keys
                // ═══════════════════════════════════════════════════════════════,
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}
