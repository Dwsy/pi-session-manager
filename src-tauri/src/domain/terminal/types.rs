//! Terminal launching types
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalLaunchResult {
    pub success: bool,
    pub terminal: String,
    pub error: Option<String>,
}
