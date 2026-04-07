//! Heatmap and time distribution generation
use crate::domain::stats::aggregator::DailyStatsCollector;
use crate::domain::stats::types::{HeatmapPoint, TimeDistributionPoint};
use std::collections::HashMap;

pub fn generate_heatmap_data(
    messages_by_date: &HashMap<String, usize>,
    daily_stats: &DailyStatsCollector,
) -> Vec<HeatmapPoint> {
    let mut data = Vec::new();
    let now = chrono::Utc::now();
    let days_ago = 365;

    let max_messages = messages_by_date.values().copied().max().unwrap_or(1);

    for i in 0..=days_ago {
        let date = now - chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let message_count = messages_by_date.get(&date_str).copied().unwrap_or(0);

        let level = if message_count == 0 {
            0
        } else {
            ((message_count as f32 / max_messages as f32) * 5.0).round() as usize
        };

        let total_messages = daily_stats.messages.get(&date_str).copied().unwrap_or(0);
        let total_tokens = daily_stats.tokens.get(&date_str).copied().unwrap_or(0);
        let session_count = daily_stats.sessions.get(&date_str).copied().unwrap_or(0);
        let top_project = daily_stats.top_project_for_date(&date_str);

        data.push(HeatmapPoint {
            date: date_str,
            level,
            total_messages,
            total_tokens,
            session_count,
            top_project,
        });
    }

    data.reverse();
    data
}

pub fn generate_time_distribution(
    messages_by_hour: &HashMap<String, usize>,
) -> Vec<TimeDistributionPoint> {
    let mut distribution = Vec::new();

    for hour in 0..24 {
        let message_count = messages_by_hour.get(&hour.to_string()).copied().unwrap_or(0);
        distribution.push(TimeDistributionPoint { hour, message_count });
    }

    distribution
}
