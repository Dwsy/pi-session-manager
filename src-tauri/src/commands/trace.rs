//! Trace analytics Tauri command.

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_trace_analytics(session_path: String) -> Result<crate::domain::trace::SessionTraceAnalytics, String> {
    crate::domain::trace::extract_trace_analytics(&session_path)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_inspect_data(session_path: String) -> Result<crate::domain::trace::InspectData, String> {
    crate::domain::trace::extract_inspect_data(&session_path)
}
