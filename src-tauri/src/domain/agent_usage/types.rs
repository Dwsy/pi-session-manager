use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentUsageState {
    Available,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsageMetric {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsageProvider {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_name: Option<String>,
    pub fetched_at: String,
    pub state: AgentUsageState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub metrics: Vec<AgentUsageMetric>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsageStatus {
    pub providers: Vec<AgentUsageProvider>,
    pub fetched_at: String,
}

#[derive(Debug, Clone)]
pub struct ProviderMeta {
    pub id: &'static str,
    pub name: &'static str,
}

pub const PROVIDER_CATALOG: &[ProviderMeta] = &[
    ProviderMeta { id: "antigravity", name: "Antigravity" },
    ProviderMeta { id: "amp", name: "Amp" },
    ProviderMeta { id: "claude", name: "Claude Code" },
    ProviderMeta { id: "codex", name: "Codex" },
    ProviderMeta { id: "copilot", name: "Copilot" },
    ProviderMeta { id: "cursor", name: "Cursor" },
    ProviderMeta { id: "devin", name: "Devin" },
    ProviderMeta { id: "factory", name: "Factory" },
    ProviderMeta { id: "grok", name: "Grok" },
    ProviderMeta { id: "openrouter", name: "OpenRouter" },
    ProviderMeta { id: "opencode-go", name: "OpenCode Go" },
    ProviderMeta { id: "kimi", name: "Kimi" },
    ProviderMeta { id: "minimax", name: "MiniMax" },
    ProviderMeta { id: "zai", name: "Z.ai" },
];

pub fn provider_meta(id: &str) -> Option<&'static ProviderMeta> {
    PROVIDER_CATALOG.iter().find(|item| item.id == id)
}

pub fn unavailable(meta: &ProviderMeta, message: impl Into<String>) -> AgentUsageProvider {
    AgentUsageProvider {
        id: meta.id.to_string(),
        name: meta.name.to_string(),
        plan_name: None,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        state: AgentUsageState::Unavailable,
        message: Some(message.into()),
        metrics: Vec::new(),
    }
}

pub fn error_snapshot(meta: &ProviderMeta, message: impl Into<String>) -> AgentUsageProvider {
    AgentUsageProvider {
        id: meta.id.to_string(),
        name: meta.name.to_string(),
        plan_name: None,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        state: AgentUsageState::Error,
        message: Some(message.into()),
        metrics: Vec::new(),
    }
}

pub fn available_snapshot(
    meta: &ProviderMeta,
    plan_name: Option<String>,
    metrics: Vec<AgentUsageMetric>,
) -> AgentUsageProvider {
    AgentUsageProvider {
        id: meta.id.to_string(),
        name: meta.name.to_string(),
        plan_name,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        state: AgentUsageState::Available,
        message: None,
        metrics,
    }
}
