//! Resources command adapter routes.

use super::*;

pub(super) const COMMANDS: &[&str] = &[
    "scan_skills",
    "scan_prompts",
    "get_skill_content",
    "get_prompt_content",
    "get_system_prompt",
    "get_session_system_prompt",
    "load_pi_settings",
    "save_pi_settings",
    "scan_all_resources",
    "get_project_resource_trust",
    "set_project_resource_trust",
    "load_pi_settings_full",
    "save_pi_setting",
    "set_resource_state",
    "toggle_resource",
    "read_resource_file",
    "write_resource_file",
    "delete_resource_file",
    "pi_agent_prompt",
];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "scan_skills" => {
                    let result = crate::scan_skills_internal().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "scan_prompts" => {
                    let result = crate::scan_prompts_internal().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_skill_content" => {
                    let path = extract(payload, "path")?;
                    let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read skill file: {e}"))?;
                    Ok(to_val(content, "serialize content")?)
                }
                "get_prompt_content" => {
                    let path = extract(payload, "path")?;
                    let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read prompt file: {e}"))?;
                    Ok(to_val(content, "serialize content")?)
                }
                "get_system_prompt" => {
                    let result = crate::get_system_prompt().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_session_system_prompt" => {
                    let path = extract(payload, "path")?;
                    let result = crate::get_session_system_prompt_internal(path).await?;
                    Ok(to_val(result, "serialize result")?)
                }

                // ═══════════════════════════════════════════════════════════════
                // Settings
                // ═══════════════════════════════════════════════════════════════,
                "load_pi_settings" => {
                    let result = crate::load_pi_settings_internal().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "save_pi_settings" => {
                    let settings = serde_json::from_value(payload.get("settings").cloned().unwrap_or(Value::Object(Default::default()))).map_err(|e| format!("Invalid settings: {e}"))?;
                    crate::save_pi_settings(settings).await?;
                    Ok(Value::Null)
                }
                "scan_all_resources" => {
                    let cwd = extract_optional_string(payload, "cwd");
                    let result = crate::scan_all_resources_internal(cwd).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "get_project_resource_trust" => {
                    let cwd = extract(payload, "cwd")?;
                    let result = crate::get_project_resource_trust_internal(cwd).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "set_project_resource_trust" => {
                    let cwd = extract(payload, "cwd")?;
                    let trusted = payload.get("trusted").and_then(|value| value.as_bool()).unwrap_or(false);
                    let result = crate::set_project_resource_trust_internal(cwd, trusted).await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "load_pi_settings_full" => {
                    let result = crate::load_pi_settings_full_internal().await?;
                    Ok(to_val(result, "serialize result")?)
                }
                "save_pi_setting" => {
                    let key = extract(payload, "key")?;
                    let value = payload.get("value").cloned().unwrap_or(Value::Null);
                    crate::save_pi_setting_internal(key, value).await?;
                    Ok(Value::Null)
                }
                "set_resource_state" => {
                    let resource_type = extract(payload, "resource_type")?;
                    let path = extract(payload, "path")?;
                    let state = extract(payload, "state")?;
                    let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
                    let cwd = extract_optional_string(payload, "cwd");
                    let origin = extract_optional_string(payload, "origin");
                    let source = extract_optional_string(payload, "source");
                    crate::set_resource_state_internal(resource_type, path, state, scope, cwd, origin, source).await?;
                    Ok(Value::Null)
                }
                "toggle_resource" => {
                    let resource_type = extract(payload, "resource_type")?;
                    let path = extract(payload, "path")?;
                    let enabled = payload.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                    let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
                    let cwd = extract_optional_string(payload, "cwd");
                    let origin = extract_optional_string(payload, "origin");
                    let source = extract_optional_string(payload, "source");
                    crate::toggle_resource_internal(resource_type, path, enabled, scope, cwd, origin, source).await?;
                    Ok(Value::Null)
                }
                "read_resource_file" => {
                    let path = extract(payload, "path")?;
                    let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
                    let cwd = extract_optional_string(payload, "cwd");
                    let base_dir = extract_optional_string(payload, "base_dir").or_else(|| extract_optional_string(payload, "baseDir"));
                    let result = crate::read_resource_file_internal(path, scope, cwd, base_dir).await?;
                    Ok(Value::String(result))
                }
                "write_resource_file" => {
                    let path = extract(payload, "path")?;
                    let content = extract(payload, "content")?;
                    let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
                    let cwd = extract_optional_string(payload, "cwd");
                    let base_dir = extract_optional_string(payload, "base_dir").or_else(|| extract_optional_string(payload, "baseDir"));
                    crate::write_resource_file_internal(path, content, scope, cwd, base_dir).await?;
                    Ok(Value::Null)
                }
                "delete_resource_file" => {
                    let path = extract(payload, "path")?;
                    let scope = extract(payload, "scope").unwrap_or_else(|_| "user".to_string());
                    let cwd = extract_optional_string(payload, "cwd");
                    let base_dir = extract_optional_string(payload, "base_dir").or_else(|| extract_optional_string(payload, "baseDir"));
                    crate::delete_resource_file_internal(path, scope, cwd, base_dir).await?;
                    Ok(Value::Null)
                }

                // ═══════════════════════════════════════════════════════════════
                // Model config (delegates to domain)
                // ═══════════════════════════════════════════════════════════════,
                "pi_agent_prompt" => {
                    let session_id = extract(payload, "sessionId")?;
                    let message = extract(payload, "message")?;
                    let images = payload.get("images").cloned();
                    let streaming_behavior = payload.get("streamingBehavior").and_then(|v| v.as_str()).map(|s| s.to_string());

                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("App state not available")?;
                        let command = serde_json::json!({
                            "type": "prompt",
                            "sessionId": session_id,
                            "message": message,
                            "images": images,
                            "streamingBehavior": streaming_behavior,
                        });
                        let response = state.pi_agent_registry.send_rpc(&session_id, command).await?;
                        unpack_pi_rpc_response(response)?;
                    }
                    Ok(serde_json::json!({ "status": "sent" }))
                }
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}
