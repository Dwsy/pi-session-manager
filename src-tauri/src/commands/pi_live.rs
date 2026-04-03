use tauri::State;

#[tauri::command]
pub fn get_pi_live_sessions(
    state: State<'_, crate::app_state::SharedAppState>,
) -> Result<Vec<crate::pi_agent_registry::PiLiveSession>, String> {
    Ok(state.pi_agent_registry.list())
}

#[tauri::command]
pub fn pi_agent_steering(
    state: State<'_, crate::app_state::SharedAppState>,
    session_id: String,
    message: String,
    deliver_as: Option<String>,
) -> Result<(), String> {
    let event = crate::app_state::WsEvent {
        event_type: "event".to_string(),
        event: "steer".to_string(),
        payload: serde_json::json!({
            "sessionId": session_id,
            "message": message,
            "deliverAs": deliver_as.unwrap_or_else(|| "steer".to_string()),
        }),
    };
    state
        .event_tx
        .send(event)
        .map(|_| ())
        .map_err(|e| format!("Failed to send steer event: {e}"))
}
