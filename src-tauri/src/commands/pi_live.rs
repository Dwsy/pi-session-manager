use tauri::State;

#[tauri::command]
pub fn get_pi_live_sessions(state: State<'_, crate::app_state::SharedAppState>) -> Result<Vec<crate::pi_agent_registry::PiLiveSession>, String> {
    Ok(state.pi_agent_registry.list())
}
