use crate::data::sqlite::{DbPluginRecord, DbPluginRecordIndexValue, PluginRecordSearchHit};
use serde::Deserialize;

fn get_conn() -> Result<rusqlite::Connection, String> {
    let config = crate::config::load_config()?;
    crate::data::sqlite::init_db_with_config(&config)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPluginRecordRequest {
    pub record: DbPluginRecord,
    #[serde(default)]
    pub index_values: Vec<DbPluginRecordIndexValue>,
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn upsert_plugin_record(record: DbPluginRecord, index_values: Option<Vec<DbPluginRecordIndexValue>>) -> Result<(), String> {
    let conn = get_conn()?;
    crate::data::sqlite::upsert_plugin_record(&conn, &record, &index_values.unwrap_or_default())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_plugin_record(id: String) -> Result<Option<DbPluginRecord>, String> {
    let conn = get_conn()?;
    crate::data::sqlite::get_plugin_record(&conn, &id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_plugin_records_for_scope(scope_type: String, scope_id: String, record_type: Option<String>, limit: Option<usize>) -> Result<Vec<DbPluginRecord>, String> {
    let conn = get_conn()?;
    crate::data::sqlite::list_plugin_records_for_scope(&conn, &scope_type, &scope_id, record_type.as_deref(), limit.unwrap_or(100))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_plugin_records(query: String, record_type: Option<String>, plugin_id: Option<String>, limit: Option<usize>) -> Result<Vec<PluginRecordSearchHit>, String> {
    let conn = get_conn()?;
    crate::data::sqlite::search_plugin_records(&conn, &query, record_type.as_deref(), plugin_id.as_deref(), limit.unwrap_or(50))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn refresh_session_intelligence_record(path: String, provider: Option<String>, model: Option<String>, language: Option<String>) -> Result<DbPluginRecord, String> {
    let conn = get_conn()?;
    let entries = crate::commands::session_file::get_session_entries_impl(path.clone()).await?;
    let context = crate::domain::session_summary::build_summary_context(&entries);
    if context.trim().is_empty() {
        return Err("Session has no user or assistant text to summarize".to_string());
    }

    let (summary, provider_name, model_id) = crate::domain::session_summary::generate_session_summary_with_language(&context, provider.as_deref(), model.as_deref(), language.as_deref()).await?;
    crate::domain::session_summary::refresh_session_intelligence_record_from_summary(&conn, &path, &entries, summary, &provider_name, &model_id)
}
