use crate::domain::session_sidechat::{SessionSidechatResponse, SidechatSnippet};
use std::path::PathBuf;

fn get_conn() -> Result<rusqlite::Connection, String> {
    let config = crate::config::load_config()?;
    crate::data::sqlite::init_db_with_config(&config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn ask_session_sidechat(path: String, question: String, provider: Option<String>, model: Option<String>, language: Option<String>, thinking_level: Option<String>, limit: Option<usize>) -> Result<SessionSidechatResponse, String> {
    let trimmed_path = path.trim().to_string();
    if trimmed_path.is_empty() {
        return Err("Session path is required".to_string());
    }
    let trimmed_question = question.trim().to_string();
    if trimmed_question.is_empty() {
        return Err("Question is required".to_string());
    }

    let bounded_limit = limit.unwrap_or(6);
    let mut snippets = {
        let conn = get_conn()?;
        crate::domain::session_sidechat::select_session_sidechat_snippets(&conn, &trimmed_path, &trimmed_question, bounded_limit)?
    };
    if snippets.is_empty() {
        snippets = select_sidechat_snippets_from_file(trimmed_path.clone(), trimmed_question.clone(), bounded_limit).await?;
    }

    if snippets.is_empty() {
        return Err("No readable message context found for this session. Try rescanning sessions or open the session to confirm it contains user/assistant messages.".to_string());
    }

    crate::domain::session_sidechat::answer_session_sidechat_with_snippets(&trimmed_path, &trimmed_question, snippets, provider.as_deref(), model.as_deref(), language.as_deref(), thinking_level.as_deref()).await
}

async fn select_sidechat_snippets_from_file(path: String, question: String, limit: usize) -> Result<Vec<SidechatSnippet>, String> {
    tokio::task::spawn_blocking(move || {
        let path_buf = PathBuf::from(&path);
        let entries = crate::domain::session_bridge::parse_session_entries_from_path(&path_buf)?;
        Ok(crate::domain::session_sidechat::select_session_sidechat_snippets_from_entries(&path, &entries, &question, limit))
    })
    .await
    .map_err(|e| format!("Failed to parse session context: {e}"))?
}
