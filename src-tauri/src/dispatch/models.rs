//! Models command adapter routes.

use super::*;

pub(super) const COMMANDS: &[&str] = &[
    "get_agent_usage_status",
    "list_model_options_fast",
    "list_model_options_full",
    "load_model_config",
    "save_model_config",
    "export_model_config_content",
    "export_model_config_to_path",
    "import_model_config_content",
    "import_model_config_from_path",
    "create_model_config_backup",
    "list_model_config_backups",
    "restore_model_config_backup",
    "delete_model_config_backup",
    "list_model_config_versions",
    "test_model_http",
    "list_models",
    "test_model",
    "test_models_batch",
    "invoke_model_text",
    "invoke_model_text_stream",
    "get_pi_live_sessions",
    "get_pi_agent_entries",
    "pi_agent_steer",
    "pi_agent_follow_up",
    "pi_agent_set_model",
    "pi_agent_set_thinking_level",
    "pi_agent_get_state",
    "pi_agent_get_commands",
    "pi_agent_get_available_models",
    "pi_agent_abort",
];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "get_agent_usage_status" => {
                    let provider_ids = payload.get("providerIds").or_else(|| payload.get("provider_ids")).cloned().map(serde_json::from_value).transpose().map_err(|e| format!("Invalid providerIds: {e}"))?;
                    let result = crate::get_agent_usage_status_command(provider_ids).await?;
                    Ok(to_val(result, "serialize agent usage status")?)
                }
                "list_model_options_fast" => {
                    let result = crate::domain::model_config::list_model_options_fast_internal().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "list_model_options_full" => {
                    let result = crate::domain::model_config::list_model_options_full_internal().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "load_model_config" => {
                    let result = crate::domain::model_config::load_model_config_internal().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "save_model_config" => {
                    let content = payload.get("content").cloned().ok_or("Missing content")?;
                    let create_backup = payload.get("create_backup").or_else(|| payload.get("createBackup")).and_then(|v| v.as_bool());
                    crate::domain::model_config::save_model_config_internal(content, create_backup).await?;
                    Ok(Value::Null)
                }
                "export_model_config_content" => {
                    let result = crate::domain::model_config::export_model_config_content_internal().await?;
                    Ok(Value::String(result))
                }
                "export_model_config_to_path" => {
                    let path = extract(payload, "path")?;
                    let result = crate::domain::model_config::export_model_config_to_path_internal(path).await?;
                    Ok(Value::String(result))
                }
                "import_model_config_content" => {
                    let content = payload.get("content").and_then(|v| v.as_str()).ok_or("Missing content")?.to_string();
                    let mode = extract_optional_string(payload, "mode");
                    let result = crate::domain::model_config::import_model_config_content_internal(content, mode).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "import_model_config_from_path" => {
                    let path = extract(payload, "path")?;
                    let mode = extract_optional_string(payload, "mode");
                    let result = crate::domain::model_config::import_model_config_from_path_internal(path, mode).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "create_model_config_backup" => {
                    let note = extract_optional_string(payload, "note");
                    let result = crate::domain::model_config::create_model_config_backup_internal(note)?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "list_model_config_backups" => {
                    let result = crate::domain::model_config::list_model_config_backups_internal()?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "restore_model_config_backup" => {
                    let id = extract(payload, "id")?;
                    crate::domain::model_config::restore_model_config_backup_internal(id)?;
                    Ok(Value::Null)
                }
                "delete_model_config_backup" => {
                    let id = extract(payload, "id")?;
                    crate::domain::model_config::delete_model_config_backup_internal(id)?;
                    Ok(Value::Null)
                }
                "list_model_config_versions" => {
                    let result = crate::domain::model_config::list_model_config_versions_internal().await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "test_model_http" => {
                    let provider = extract(payload, "provider")?;
                    let model = extract(payload, "model")?;
                    let prompt = extract_optional_string(payload, "prompt");
                    let timeout_ms = payload.get("timeout_ms").or_else(|| payload.get("timeoutMs")).and_then(|v| v.as_u64());
                    let result = crate::domain::model_config::test_model_http_internal(provider, model, prompt, timeout_ms).await?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }

                // ═══════════════════════════════════════════════════════════════
                // PSM plugin config / lifecycle
                // ═══════════════════════════════════════════════════════════════,
                "list_models" => {
                    let search = extract_optional_string(payload, "search");
                    let result = crate::list_models(search).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "test_model" => {
                    let provider = extract(payload, "provider")?;
                    let model = extract(payload, "model")?;
                    let prompt = extract_optional_string(payload, "prompt");
                    let result = crate::test_model(provider, model, prompt).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "test_models_batch" => {
                    let models: Vec<(String, String)> = serde_json::from_value(payload.get("models").cloned().unwrap_or(Value::Array(vec![]))).map_err(|e| format!("Invalid models: {e}"))?;
                    let prompt = extract_optional_string(payload, "prompt");
                    let result = crate::test_models_batch(models, prompt).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "invoke_model_text" => {
                    let system_prompt = extract_optional_string(payload, "systemPrompt").or_else(|| extract_optional_string(payload, "system_prompt")).ok_or_else(|| "Missing field: systemPrompt".to_string())?;
                    let prompt = extract(payload, "prompt")?;
                    let provider = extract_optional_string(payload, "provider");
                    let model = extract_optional_string(payload, "model");
                    let reasoning = extract_optional_string(payload, "reasoning").or_else(|| extract_optional_string(payload, "thinkingLevel")).or_else(|| extract_optional_string(payload, "thinking_level"));
                    let result = crate::invoke_model_text(system_prompt, prompt, provider, model, reasoning).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "invoke_model_text_stream" => {
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or_else(|| "Streaming model text requires GUI app state".to_string())?.clone();
                        let request_id = extract_optional_string(payload, "requestId").or_else(|| extract_optional_string(payload, "request_id")).ok_or_else(|| "Missing field: requestId".to_string())?;
                        if payload.get("protocol").and_then(Value::as_str) == Some("pi-agent") {
                            let result = crate::invoke_model_agent_stream(state, request_id, payload.clone()).await?;
                            return Ok(result);
                        }
                        let system_prompt = extract_optional_string(payload, "systemPrompt").or_else(|| extract_optional_string(payload, "system_prompt")).ok_or_else(|| "Missing field: systemPrompt".to_string())?;
                        let prompt = extract(payload, "prompt")?;
                        let provider = extract_optional_string(payload, "provider");
                        let model = extract_optional_string(payload, "model");
                        let reasoning = extract_optional_string(payload, "reasoning").or_else(|| extract_optional_string(payload, "thinkingLevel")).or_else(|| extract_optional_string(payload, "thinking_level"));
                        let result = crate::invoke_model_text_stream(state, request_id, system_prompt, prompt, provider, model, reasoning).await?;
                        Ok(to_val(result, "serialize result")?)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err("Streaming model text requires GUI app state".to_string())
                    }
                }

                // ═══════════════════════════════════════════════════════════════
                // Version Check
                // ═══════════════════════════════════════════════════════════════,
                "get_pi_live_sessions" => {
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let sessions = state.pi_agent_registry.list();
                        Ok(to_val(sessions, "serialize pi_live_sessions")?)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Ok(serde_json::json!([]))
                    }
                }
                "get_pi_agent_entries" => {
                    let session_id = extract(payload, "sessionId")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        if let Some(session) = state.pi_agent_registry.get_live_session(&session_id) {
                            Ok(to_val(session.entries, "serialize agent_entries")?)
                        } else {
                            Err(format!("Live session not found: {session_id}"))
                        }
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err("pi_agent_get_entries unavailable in CLI mode".to_string())
                    }
                }
                "pi_agent_steer" => {
                    let session_id = extract(payload, "sessionId")?;
                    let message = extract(payload, "message")?;
                    let images = payload.get("images").cloned();
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({
                            "type": "steer",
                            "sessionId": session_id,
                            "message": message,
                            "images": images,
                        });
                        let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        unpack_pi_rpc_response(response)?;
                    }
                    Ok(serde_json::json!({ "status": "sent" }))
                }
                "pi_agent_follow_up" => {
                    let session_id = extract(payload, "sessionId")?;
                    let message = extract(payload, "message")?;
                    let images = payload.get("images").cloned();
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({
                            "type": "follow_up",
                            "sessionId": session_id,
                            "message": message,
                            "images": images,
                        });
                        let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        unpack_pi_rpc_response(response)?;
                    }
                    Ok(serde_json::json!({ "status": "sent" }))
                }

                // ═══════════════════════════════════════════════════════════════
                // Pi agent RPC
                // ═══════════════════════════════════════════════════════════════,
                "pi_agent_set_model" => {
                    let session_id = extract(payload, "sessionId")?;
                    let provider = extract(payload, "provider")?;
                    let model_id = extract(payload, "modelId")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({
                            "type": "set_model", "sessionId": session_id, "provider": provider, "modelId": model_id,
                        });
                        let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        unpack_pi_rpc_response(response)?;
                    }
                    Ok(serde_json::json!({ "status": "sent" }))
                }
                "pi_agent_set_thinking_level" => {
                    let session_id = extract(payload, "sessionId")?;
                    let level = extract(payload, "level")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({
                            "type": "set_thinking_level", "sessionId": session_id, "level": level,
                        });
                        let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        unpack_pi_rpc_response(response)?;
                    }
                    Ok(serde_json::json!({ "status": "sent" }))
                }
                "pi_agent_get_state" => {
                    let session_id = extract(payload, "sessionId")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({ "type": "get_state", "sessionId": session_id });
                        let result = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        Ok(unpack_pi_rpc_response(result)?)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Ok(serde_json::json!({}))
                    }
                }
                "pi_agent_get_commands" => {
                    let session_id = extract(payload, "sessionId")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({ "type": "get_commands", "sessionId": session_id });
                        let result = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        Ok(unpack_pi_rpc_response(result)?)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Ok(serde_json::json!({ "commands": [] }))
                    }
                }
                "pi_agent_get_available_models" => {
                    let session_id = extract(payload, "sessionId")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({ "type": "get_available_models", "sessionId": session_id });
                        let result = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        Ok(unpack_pi_rpc_response(result)?)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Ok(serde_json::json!({ "models": [] }))
                    }
                }
                "pi_agent_abort" => {
                    let session_id = extract(payload, "sessionId")?;
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({ "type": "abort", "sessionId": session_id });
                        let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        unpack_pi_rpc_response(response)?;
                    }
                    Ok(serde_json::json!({ "status": "sent" }))
                }

                // ═══════════════════════════════════════════════════════════════
                // Desktop/GUI-only commands
                // ═══════════════════════════════════════════════════════════════,
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}
