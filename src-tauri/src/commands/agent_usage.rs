use crate::domain::agent_usage::{get_agent_usage_status, AgentUsageStatus};

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_agent_usage_status_command(provider_ids: Option<Vec<String>>) -> Result<AgentUsageStatus, String> {
    get_agent_usage_status(provider_ids).await
}
