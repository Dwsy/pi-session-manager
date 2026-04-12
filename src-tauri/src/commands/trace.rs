//! Trace analytics Tauri command.

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_trace_analytics(
    session_path: String,
) -> Result<crate::domain::trace::SessionTraceAnalytics, String> {
    crate::domain::trace::extract_trace_analytics(&session_path)
}
