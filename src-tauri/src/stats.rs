//! Statistics module - delegates to domain layer
//!
//! All heavy logic moved to `domain/stats/`

pub use crate::domain::stats::*;

// Re-export for backward compatibility
pub use crate::domain::stats::aggregator::{calculate_stats, calculate_stats_from_inputs, extract_project_name, merge_model_usage, parse_modified, record_model_presence, DailyStatsCollector};
pub use crate::domain::stats::day_stats::{get_activity_timeline, get_day_stats};
pub use crate::domain::stats::heatmap::{generate_heatmap_data, generate_time_distribution};
pub use crate::domain::stats::types::{DailyActivity, DayProjectBreakdown, DaySession, DayStats, HeatmapPoint, ModelTokenStats, SessionStats, SessionStatsInput, TimeDistributionPoint, TokenDetails};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SessionInfo;
    use chrono::{TimeZone, Timelike};

    #[test]
    fn calculate_stats_from_inputs_fallback_counts_messages() {
        let sessions = vec![
            SessionStatsInput { path: "/tmp/does-not-exist-1.jsonl".to_string(), cwd: "/Users/example/project-alpha".to_string(), modified: chrono::Utc.with_ymd_and_hms(2025, 1, 2, 10, 0, 0).unwrap().to_rfc3339(), message_count: 5 },
            SessionStatsInput { path: "/tmp/does-not-exist-2.jsonl".to_string(), cwd: "/Users/example/project-beta".to_string(), modified: chrono::Utc.with_ymd_and_hms(2025, 1, 3, 16, 0, 0).unwrap().to_rfc3339(), message_count: 3 },
        ];

        let stats = calculate_stats_from_inputs(&sessions);

        assert_eq!(stats.total_sessions, 2);
        assert_eq!(stats.total_messages, 8);
        assert_eq!(stats.sessions_by_project.get("project-alpha"), Some(&1));
        assert_eq!(stats.sessions_by_project.get("project-beta"), Some(&1));

        let utc_time1 = chrono::Utc.with_ymd_and_hms(2025, 1, 2, 10, 0, 0).unwrap();
        let local_hour1 = utc_time1.with_timezone(&chrono::Local).hour().to_string();
        let utc_time2 = chrono::Utc.with_ymd_and_hms(2025, 1, 3, 16, 0, 0).unwrap();
        let local_hour2 = utc_time2.with_timezone(&chrono::Local).hour().to_string();

        assert_eq!(stats.messages_by_hour.get(&local_hour1), Some(&5));
        assert_eq!(stats.messages_by_hour.get(&local_hour2), Some(&3));
    }

    fn make_session(path: &str, cwd: &str, modified: chrono::DateTime<chrono::Utc>, message_count: usize) -> SessionInfo {
        SessionInfo {
            path: path.to_string(),
            id: format!("id-{path}"),
            cwd: cwd.to_string(),
            name: None,
            created: modified,
            modified,
            message_count,
            first_message: "hello".to_string(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: "user".to_string(),
            parent_session_path: None,
            model: None,
            models: None,
        }
    }

    #[test]
    fn get_day_stats_groups_projects_by_path_and_populates_hourly_distribution() {
        let modified_a = chrono::Utc.with_ymd_and_hms(2026, 1, 18, 2, 0, 0).unwrap();
        let modified_b = chrono::Utc.with_ymd_and_hms(2026, 1, 18, 8, 0, 0).unwrap();
        let target_date = modified_a.format("%Y-%m-%d").to_string();

        let sessions = vec![make_session("/tmp/non-existent-day-stats-a.jsonl", "/Users/demo/workspace/foo-app", modified_a, 10), make_session("/tmp/non-existent-day-stats-b.jsonl", "/Users/demo/workspace/bar-app", modified_b, 12)];

        let stats = get_day_stats(&target_date, &sessions).expect("day stats should be calculated");

        assert_eq!(stats.session_count, 2);
        assert_eq!(stats.project_count, 2);
        assert_eq!(stats.project_breakdown.len(), 2);

        let project_paths: std::collections::HashSet<_> = stats.project_breakdown.iter().map(|p| p.project_path.as_str()).collect();
        assert!(project_paths.contains("/Users/demo/workspace/foo-app"));
        assert!(project_paths.contains("/Users/demo/workspace/bar-app"));

        let local_hour_a = modified_a.with_timezone(&chrono::Local).hour() as usize;
        let local_hour_b = modified_b.with_timezone(&chrono::Local).hour() as usize;
        assert!(stats.hourly_distribution[local_hour_a] > 0);
        assert!(stats.hourly_distribution[local_hour_b] > 0);
    }

    #[test]
    fn get_day_stats_distinguishes_same_project_name_different_paths() {
        let modified = chrono::Utc.with_ymd_and_hms(2026, 1, 20, 3, 0, 0).unwrap();
        let target_date = modified.format("%Y-%m-%d").to_string();

        let sessions = vec![make_session("/tmp/non-existent-day-stats-c.jsonl", "/Users/demo/workspace/a/service", modified, 5), make_session("/tmp/non-existent-day-stats-d.jsonl", "/Users/demo/workspace/b/service", modified, 6)];

        let stats = get_day_stats(&target_date, &sessions).expect("day stats should be calculated");

        assert_eq!(stats.project_count, 2);
        assert_eq!(stats.project_breakdown.len(), 2);
        assert!(stats.project_breakdown.iter().all(|project| project.project_name == "service"));
    }

    #[test]
    fn extract_project_name_supports_windows_path_separator() {
        assert_eq!(extract_project_name(r"C:\Users\demo\workspace\alpha"), "alpha");
        assert_eq!(extract_project_name(r"C:\Users\demo\workspace\beta\"), "beta");
        assert_eq!(extract_project_name(r"C:/Users/demo/workspace/gamma"), "gamma");
        assert_eq!(extract_project_name(""), "unknown");
    }
}
