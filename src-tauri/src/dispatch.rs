use serde_json::Value;

pub fn extract_string(payload: &Value, key: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing or invalid field: {key}"))
}

pub fn extract_optional_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn extract_usize(payload: &Value, key: &str) -> Result<usize, String> {
    payload
        .get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .ok_or_else(|| format!("Missing or invalid field: {key}"))
}

/// Dispatch a command to the appropriate handler.
/// This function contains all pure business logic (no Tauri dependency).
/// GUI-only commands (terminal, save_session_paths with watcher) are handled
/// by the caller in ws_adapter.rs.
pub async fn dispatch(command: &str, payload: &Value) -> Result<Value, String> {
    match command {
        "scan_sessions" => {
            let result = crate::scanner::scan_sessions().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "session_digest" => {
            let (version, count) = crate::scanner::get_session_digest();
            Ok(serde_json::json!({ "version": version, "count": count }))
        }
        "read_session_file" => {
            let path = extract_string(payload, "path")?;
            let result = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read session file: {e}"))?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "read_session_file_incremental" => {
            let path = extract_string(payload, "path")?;
            let from_line = extract_usize(payload, "fromLine")?;
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read session file: {e}"))?;
            let lines: Vec<&str> = content.lines().collect();
            let total_lines = lines.len();
            let new_content = if from_line >= total_lines {
                String::new()
            } else {
                lines[from_line..].join("\n")
            };
            Ok(serde_json::json!([total_lines, new_content]))
        }
        "get_file_stats" => {
            let path = extract_string(payload, "path")?;
            let metadata = std::fs::metadata(&path)
                .map_err(|e| format!("Failed to get file metadata: {e}"))?;
            let modified = metadata
                .modified()
                .map_err(|e| format!("Failed to get modified time: {e}"))?;
            let modified_at = modified
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("Failed to convert modified time: {e}"))?
                .as_millis() as u64;
            Ok(serde_json::json!({
                "size": metadata.len(),
                "modified_at": modified_at,
                "is_file": metadata.is_file()
            }))
        }
        "get_session_entries" => {
            let path = extract_string(payload, "path")?;
            let result = crate::get_session_entries(path).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "delete_session" => {
            let path = extract_string(payload, "path")?;
            std::fs::remove_file(&path).map_err(|e| format!("Failed to delete session: {e}"))?;
            Ok(Value::Null)
        }
        "export_session" => {
            let path = extract_string(payload, "path")?;
            let format = extract_string(payload, "format")?;
            let output_path = extract_string(payload, "outputPath")?;
            crate::export::export_session(&path, &format, &output_path).await?;
            Ok(Value::Null)
        }
        "rename_session" => {
            let path = extract_string(payload, "path")?;
            let new_name = extract_string(payload, "newName")?;
            crate::rename_session(path, new_name).await?;
            Ok(Value::Null)
        }
        "get_session_stats" => {
            let sessions: Vec<crate::models::SessionInfo> = serde_json::from_value(
                payload
                    .get("sessions")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid sessions: {e}"))?;
            let result = crate::stats::calculate_stats(&sessions);
            Ok(serde_json::to_value(result).unwrap())
        }
        "get_session_stats_light" => {
            let sessions: Vec<crate::stats::SessionStatsInput> = serde_json::from_value(
                payload
                    .get("sessions")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid sessions: {e}"))?;
            let result = crate::stats::calculate_stats_from_inputs(&sessions);
            Ok(serde_json::to_value(result).unwrap())
        }
        "search_sessions" => {
            let sessions: Vec<crate::models::SessionInfo> = serde_json::from_value(
                payload
                    .get("sessions")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid sessions: {e}"))?;
            let query = extract_string(payload, "query")?;
            let search_mode =
                extract_string(payload, "searchMode").unwrap_or_else(|_| "content".to_string());
            let role_filter =
                extract_string(payload, "roleFilter").unwrap_or_else(|_| "all".to_string());
            let include_tools = payload
                .get("includeTools")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let result =
                crate::search_sessions(sessions, query, search_mode, role_filter, include_tools)
                    .await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "search_sessions_fts" => {
            let query = extract_string(payload, "query")?;
            let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let result = crate::search_sessions_fts(query, limit).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Favorites
        "get_all_favorites" => {
            let result = crate::get_all_favorites().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "add_favorite" => {
            let id = extract_string(payload, "id")?;
            let favorite_type = extract_string(payload, "favoriteType")?;
            let name = extract_string(payload, "name")?;
            let path = extract_string(payload, "path")?;
            crate::add_favorite(id, favorite_type, name, path).await?;
            Ok(Value::Null)
        }
        "remove_favorite" => {
            let id = extract_string(payload, "id")?;
            crate::remove_favorite(id).await?;
            Ok(Value::Null)
        }
        "is_favorite" => {
            let id = extract_string(payload, "id")?;
            let result = crate::is_favorite(id).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "toggle_favorite" => {
            let id = extract_string(payload, "id")?;
            let favorite_type = extract_string(payload, "favoriteType")?;
            let name = extract_string(payload, "name")?;
            let path = extract_string(payload, "path")?;
            let result = crate::toggle_favorite(id, favorite_type, name, path).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Skills & prompts
        "scan_skills" => {
            let result = crate::scan_skills_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "scan_prompts" => {
            let result = crate::scan_prompts_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "get_skill_content" => {
            let path = extract_string(payload, "path")?;
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read skill file: {e}"))?;
            Ok(serde_json::to_value(content).unwrap())
        }
        "get_prompt_content" => {
            let path = extract_string(payload, "path")?;
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read prompt file: {e}"))?;
            Ok(serde_json::to_value(content).unwrap())
        }
        "get_system_prompt" => {
            let result = crate::get_system_prompt().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "get_session_system_prompt" => {
            let path = extract_string(payload, "path")?;
            let result = crate::get_session_system_prompt_internal(path).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Settings
        "load_pi_settings" => {
            let result = crate::load_pi_settings_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "save_pi_settings" => {
            let settings = serde_json::from_value(
                payload
                    .get("settings")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default())),
            )
            .map_err(|e| format!("Invalid settings: {e}"))?;
            crate::save_pi_settings(settings).await?;
            Ok(Value::Null)
        }
        "scan_all_resources" => {
            let cwd = extract_optional_string(payload, "cwd");
            let result = crate::scan_all_resources_internal(cwd).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "load_pi_settings_full" => {
            let result = crate::load_pi_settings_full_internal().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "save_pi_setting" => {
            let key = extract_string(payload, "key")?;
            let value = payload.get("value").cloned().unwrap_or(Value::Null);
            crate::save_pi_setting_internal(key, value).await?;
            Ok(Value::Null)
        }
        "toggle_resource" => {
            let resource_type = extract_string(payload, "resource_type")?;
            let path = extract_string(payload, "path")?;
            let enabled = payload
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let scope = extract_string(payload, "scope").unwrap_or_else(|_| "user".to_string());
            crate::toggle_resource_internal(resource_type, path, enabled, scope).await?;
            Ok(Value::Null)
        }
        "list_model_options_fast" => {
            let result = crate::list_model_options_fast_internal().await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "list_model_options_full" => {
            let result = crate::list_model_options_full_internal().await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "read_resource_file" => {
            let path = extract_string(payload, "path")?;
            let scope = extract_string(payload, "scope").unwrap_or_else(|_| "user".to_string());
            let result = crate::read_resource_file_internal(path, scope).await?;
            Ok(Value::String(result))
        }
        "list_config_versions" => {
            let file_path = payload
                .get("file_path")
                .and_then(|v| v.as_str())
                .map(String::from);
            let result = crate::list_config_versions_internal(file_path).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "get_config_version" => {
            let id = payload
                .get("id")
                .and_then(|v| v.as_i64())
                .ok_or("Missing id")?;
            let result = crate::get_config_version_internal(id).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "restore_config_version" => {
            let id = payload
                .get("id")
                .and_then(|v| v.as_i64())
                .ok_or("Missing id")?;
            crate::restore_config_version_internal(id).await?;
            Ok(Value::Null)
        }
        "load_app_settings" => crate::load_app_settings_internal().await,
        "save_app_settings" => {
            let settings = payload
                .get("settings")
                .cloned()
                .unwrap_or(Value::Object(Default::default()));
            crate::save_app_settings(settings).await?;
            Ok(Value::Null)
        }
        "load_server_settings" => {
            let result = crate::load_server_settings().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "save_server_settings" => {
            let settings = serde_json::from_value(
                payload
                    .get("settings")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default())),
            )
            .map_err(|e| format!("Invalid settings: {e}"))?;
            crate::save_server_settings(settings).await?;
            Ok(Value::Null)
        }
        "get_session_paths" => {
            let result = crate::get_session_paths().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "save_session_paths" => {
            let paths: Vec<String> = serde_json::from_value(
                payload
                    .get("paths")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid paths: {e}"))?;
            // Core logic only (no file watcher restart — GUI handles that in ws_adapter)
            crate::save_session_paths_core(paths).await?;
            Ok(Value::Null)
        }
        "get_all_session_dirs" => {
            let result = crate::get_all_session_dirs().await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Models
        "list_models" => {
            let search = extract_optional_string(payload, "search");
            let result = crate::list_models(search).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "test_model" => {
            let provider = extract_string(payload, "provider")?;
            let model = extract_string(payload, "model")?;
            let prompt = extract_optional_string(payload, "prompt");
            let result = crate::test_model(provider, model, prompt).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "test_models_batch" => {
            let models: Vec<(String, String)> = serde_json::from_value(
                payload
                    .get("models")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid models: {e}"))?;
            let prompt = extract_optional_string(payload, "prompt");
            let result = crate::test_models_batch(models, prompt).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Tags
        "get_all_tags" => {
            let result = crate::get_all_tags().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "create_tag" => {
            let name = extract_string(payload, "name")?;
            let color = extract_string(payload, "color")?;
            let icon = extract_optional_string(payload, "icon");
            let parent_id = extract_optional_string(payload, "parentId");
            let result = crate::create_tag(name, color, icon, parent_id).await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "update_tag" => {
            let id = extract_string(payload, "id")?;
            let name = extract_optional_string(payload, "name");
            let color = extract_optional_string(payload, "color");
            let icon = extract_optional_string(payload, "icon");
            let sort_order = payload.get("sortOrder").and_then(|v| v.as_i64());
            let parent_id = if payload.get("parentId").is_some() {
                Some(extract_optional_string(payload, "parentId"))
            } else {
                None
            };
            crate::update_tag(id, name, color, icon, sort_order, parent_id).await?;
            Ok(Value::Null)
        }
        "delete_tag" => {
            let id = extract_string(payload, "id")?;
            crate::delete_tag(id).await?;
            Ok(Value::Null)
        }
        "get_all_session_tags" => {
            let result = crate::get_all_session_tags().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "assign_tag" => {
            let session_id = extract_string(payload, "sessionId")?;
            let tag_id = extract_string(payload, "tagId")?;
            crate::assign_tag(session_id, tag_id).await?;
            Ok(Value::Null)
        }
        "remove_tag_from_session" => {
            let session_id = extract_string(payload, "sessionId")?;
            let tag_id = extract_string(payload, "tagId")?;
            crate::remove_tag_from_session(session_id, tag_id).await?;
            Ok(Value::Null)
        }
        "move_session_tag" => {
            let session_id = extract_string(payload, "sessionId")?;
            let from_tag_id = extract_optional_string(payload, "fromTagId");
            let to_tag_id = extract_string(payload, "toTagId")?;
            let position = payload
                .get("position")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            crate::move_session_tag(session_id, from_tag_id, to_tag_id, position).await?;
            Ok(Value::Null)
        }
        "reorder_tags" => {
            let tag_ids: Vec<String> = serde_json::from_value(
                payload
                    .get("tagIds")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .map_err(|e| format!("Invalid tagIds: {e}"))?;
            crate::reorder_tags(tag_ids).await?;
            Ok(Value::Null)
        }
        "update_tag_auto_rules" => {
            let id = extract_string(payload, "id")?;
            let auto_rules = extract_optional_string(payload, "autoRules");
            crate::update_tag_auto_rules(id, auto_rules).await?;
            Ok(Value::Null)
        }
        "evaluate_auto_rules" => {
            let session_id = extract_string(payload, "sessionId")?;
            let text = extract_string(payload, "text")?;
            let result = crate::evaluate_auto_rules(session_id, text).await?;
            Ok(serde_json::to_value(result).unwrap())
        }

        // Auth / API keys
        "list_api_keys" => {
            let result = crate::list_api_keys().await?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "create_api_key" => {
            let name = extract_string(payload, "name")?;
            let result = crate::create_api_key(name).await?;
            Ok(serde_json::json!(result))
        }
        "revoke_api_key" => {
            let key_preview = extract_string(payload, "keyPreview")?;
            crate::revoke_api_key(key_preview).await?;
            Ok(Value::Null)
        }

        // Desktop/GUI-only commands
        "terminal_create"
        | "terminal_write"
        | "terminal_resize"
        | "terminal_close"
        | "get_default_shell"
        | "get_available_shells" => Err(format!(
            "Command '{command}' requires GUI mode (terminal not available in CLI)"
        )),
        "open_session_in_browser" => Err("open_session_in_browser is desktop-only".to_string()),
        "open_session_in_terminal" => Err("open_session_in_terminal is desktop-only".to_string()),
        "toggle_devtools" => Err("toggle_devtools is not supported via WebSocket".to_string()),

        _ => Err(format!("Unknown command: {command}")),
    }
}
