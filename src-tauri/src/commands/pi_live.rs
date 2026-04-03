use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn get_pi_live_sessions(
    state: State<'_, crate::app_state::SharedAppState>,
) -> Result<Vec<crate::pi_agent_registry::PiLiveSession>, String> {
    Ok(state.pi_agent_registry.list())
}

#[tauri::command]
pub async fn pi_agent_steering(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    message: String,
    deliver_as: Option<String>,
) -> Result<(), String> {
    let is_streaming = state.pi_agent_registry.get_live_session(&session_id)
        .map(|s| s.is_streaming)
        .unwrap_or(false);

    let command_type = if is_streaming {
        deliver_as.unwrap_or_else(|| "steer".to_string())
    } else {
        "prompt".to_string()
    };

    let command = json!({
        "type": command_type,
        "message": message,
    });
    
    state
        .pi_agent_registry
        .send_rpc(&session_id, command)
        .await?;
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
    state
        .pi_agent_registry
        .send_rpc(&session_id, command)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_set_thinking(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    level: String,
) -> Result<(), String> {
    let command = json!({
        "type": "set_thinking_level",
        "sessionId": session_id,
        "level": level,
    });
    state
        .pi_agent_registry
        .send_rpc(&session_id, command)
        .await?;
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
    state
        .pi_agent_registry
        .send_rpc(&session_id, command)
        .await
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
    state
        .pi_agent_registry
        .send_rpc(&session_id, command)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn pi_agent_send_message(
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
        "streamingBehavior": streaming_behavior.unwrap_or_else(|| "steer".to_string()),
    });
    state
        .pi_agent_registry
        .send_rpc(&session_id, command)
        .await?;
    Ok(())
}
