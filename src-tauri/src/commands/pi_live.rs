use serde_json::json;
use tauri::State;

fn unpack_rpc_response(response: serde_json::Value) -> Result<serde_json::Value, String> {
    if response["success"].as_bool() == Some(false) {
        return Err(response["error"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| "Pi RPC command failed".to_string()));
    }

    Ok(response
        .get("data")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub fn get_pi_live_sessions(
    state: State<'_, crate::app_state::SharedAppState>,
) -> Result<Vec<crate::pi_agent_registry::PiLiveSession>, String> {
    Ok(state.pi_agent_registry.list())
}
#[tauri::command]
pub fn get_pi_agent_entries(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    if let Some(session) = state.pi_agent_registry.get_live_session(&session_id) {
        Ok(session.entries)
    } else {
        Err(format!("Live session not found: {session_id}"))
    }
}

#[tauri::command]
pub async fn pi_agent_prompt(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    message: String,
    images: Option<Vec<serde_json::Value>>,
    streaming_behavior: Option<String>,
) -> Result<(), String> {
    let command = json!({
        "type": "prompt",
        "sessionId": session_id,
        "message": message,
        "images": images,
        "streamingBehavior": streaming_behavior,
    });

    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_steer(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    message: String,
    images: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let command = json!({
        "type": "steer",
        "sessionId": session_id,
        "message": message,
        "images": images,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_follow_up(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    message: String,
    images: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let command = json!({
        "type": "follow_up",
        "sessionId": session_id,
        "message": message,
        "images": images,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_set_model(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    let command = json!({
        "type": "set_model",
        "sessionId": session_id,
        "provider": provider,
        "modelId": model_id,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_set_thinking_level(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    level: String,
) -> Result<(), String> {
    let command = json!({
        "type": "set_thinking_level",
        "sessionId": session_id,
        "level": level,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_get_state(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let command = json!({
        "type": "get_state",
        "sessionId": session_id,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )
}

#[tauri::command]
pub async fn pi_agent_get_commands(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let command = json!({
        "type": "get_commands",
        "sessionId": session_id,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )
}

#[tauri::command]
pub async fn pi_agent_get_available_models(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let command = json!({
        "type": "get_available_models",
        "sessionId": session_id,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )
}

#[tauri::command]
pub async fn pi_agent_abort(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
) -> Result<(), String> {
    let command = json!({
        "type": "abort",
        "sessionId": session_id,
    });
    unpack_rpc_response(
        state
            .pi_agent_registry
            .send_rpc(&session_id, command)
            .await?,
    )?;
    Ok(())
}
