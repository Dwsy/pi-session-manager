//! Agent subscription usage collectors.
//!
//! Reads local provider credentials already present on the machine and sends
//! read-only HTTPS usage requests to fixed official endpoints. Tokens never
//! leave the collector as response data and are never written back.

mod credentials;
mod http;
mod parsers;
mod providers;
mod types;

pub use types::{AgentUsageMetric, AgentUsageProvider, AgentUsageState, AgentUsageStatus};

use providers::fetch_all_providers;
use std::collections::HashSet;

/// Collect usage snapshots for the requested providers (or all supported ones).
pub async fn get_agent_usage_status(provider_ids: Option<Vec<String>>) -> Result<AgentUsageStatus, String> {
    let allowed = provider_ids.map(|ids| ids.into_iter().map(|id| id.trim().to_ascii_lowercase()).filter(|id| !id.is_empty()).collect::<HashSet<_>>());

    let providers = fetch_all_providers(allowed.as_ref()).await;
    Ok(AgentUsageStatus { providers, fetched_at: chrono::Utc::now().to_rfc3339() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::agent_usage::parsers::{parse_claude_rows, parse_codex_rows, parse_opencode_go_rows};
    use serde_json::json;

    #[test]
    fn parses_claude_usage_windows() {
        let payload = json!({
            "plan": { "display_name": "Max" },
            "five_hour": { "utilization": 42.5, "resets_at": "2026-07-13T12:00:00Z" },
            "seven_day": { "utilization": 10.0, "resets_at": "2026-07-20T00:00:00Z" }
        });
        let parsed = parse_claude_rows(&payload);
        assert_eq!(parsed.plan_name.as_deref(), Some("Max"));
        assert_eq!(parsed.rows.len(), 2);
        assert_eq!(parsed.rows[0].label, "5h");
        assert_eq!(parsed.rows[0].used_percent, Some(42.5));
    }

    #[test]
    fn parses_codex_rate_limit_windows() {
        let payload = json!({
            "plan_type": "pro",
            "rate_limit": {
                "primary_window": { "used_percent": 12.0, "reset_at": "2026-07-13T15:00:00Z", "limit_window_seconds": 18000 },
                "secondary_window": { "used_percent": 33.0, "reset_at": "2026-07-20T00:00:00Z", "limit_window_seconds": 604800 }
            }
        });
        let parsed = parse_codex_rows(&payload);
        assert_eq!(parsed.plan_name.as_deref(), Some("Pro 20x"));
        assert_eq!(parsed.rows.len(), 2);
        assert_eq!(parsed.rows[0].label, "5h");
        assert_eq!(parsed.rows[1].label, "7d");
    }

    #[test]
    fn parses_opencode_go_usage_and_reset_times() {
        let payload = json!({"usage": {
            "rolling": {"status": "ok", "percent": 0, "resetsAt": "2026-11-21T15:00:00.000Z"},
            "weekly": {"status": "rate-limited", "percent": 100, "resetsAt": "2026-11-23T00:00:00.000Z"},
            "monthly": {"status": "ok", "percent": 50, "resetsAt": "2026-12-01T00:00:00.000Z"}
        }});
        let parsed = parse_opencode_go_rows(&payload);
        let meters = parsed.rows.iter().map(|row| (row.label.as_str(), row.used_percent, row.reset_at.as_deref())).collect::<Vec<_>>();
        assert_eq!(meters, vec![("5h", Some(0.0), Some("2026-11-21T15:00:00.000Z")), ("Weekly", Some(100.0), Some("2026-11-23T00:00:00.000Z")), ("Monthly", Some(50.0), Some("2026-12-01T00:00:00.000Z"))]);
        assert!(parse_opencode_go_rows(&json!({"usage": {"monthly": {"percent": 101}}})).rows.is_empty());
    }
}
