use crate::domain::session_sidechat::SessionSidechatResponse;

fn get_conn() -> Result<rusqlite::Connection, String> {
    let config = crate::config::load_config()?;
    crate::data::sqlite::init_db_with_config(&config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn ask_session_sidechat(path: String, question: String, provider: Option<String>, model: Option<String>, language: Option<String>, limit: Option<usize>) -> Result<SessionSidechatResponse, String> {
    let trimmed_path = path.trim().to_string();
    if trimmed_path.is_empty() {
        return Err("Session path is required".to_string());
    }
    let trimmed_question = question.trim().to_string();
    if trimmed_question.is_empty() {
        return Err("Question is required".to_string());
    }

    let snippets = {
        let conn = get_conn()?;
        crate::domain::session_sidechat::select_session_sidechat_snippets(&conn, &trimmed_path, &trimmed_question, limit.unwrap_or(6))?
    };

    crate::domain::session_sidechat::answer_session_sidechat_with_snippets(&trimmed_path, &trimmed_question, snippets, provider.as_deref(), model.as_deref(), language.as_deref()).await
}
