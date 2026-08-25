//! Heatmap and time distribution generation
use crate::domain::stats::aggregator::DailyStatsCollector;
use crate::domain::stats::types::{HeatmapPoint, TimeDistributionPoint};
use std::collections::HashMap;

pub fn generate_heatmap_data(messages_by_date: &HashMap<String, usize>, daily_stats: &DailyStatsCollector) -> Vec<HeatmapPoint> {
    let mut data = Vec::new();
    let now = chrono::Utc::now();
    let days_ago = 365;

    // Relative intensity: level scales with the day's token share of the busiest day
    let max_tokens = daily_stats.tokens.values().copied().max().unwrap_or(0);

    for i in 0..=days_ago {
        let date = now - chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let message_count = messages_by_date.get(&date_str).copied().unwrap_or(0);

        let total_messages = daily_stats.messages.get(&date_str).copied().unwrap_or(0);
        let total_tokens = daily_stats.tokens.get(&date_str).copied().unwrap_or(0);
        let total_cost = daily_stats.cost.get(&date_str).copied().unwrap_or(0.0);

        let level = if total_tokens == 0 || max_tokens == 0 {
            0
        } else {
            (((total_tokens as f64 / max_tokens as f64) * 5.0).ceil() as usize).clamp(1, 5)
        };
        let session_count = daily_stats.sessions.get(&date_str).copied().unwrap_or(0);
        let top_project = daily_stats.top_project_for_date(&date_str);

        data.push(HeatmapPoint { date: date_str, level, total_messages, total_tokens, total_cost, session_count, top_project });
    }

    data.reverse();
    data
}

pub fn generate_time_distribution(messages_by_hour: &HashMap<String, usize>) -> Vec<TimeDistributionPoint> {
    let mut distribution = Vec::new();

    for hour in 0..24 {
        let message_count = messages_by_hour.get(&hour.to_string()).copied().unwrap_or(0);
        distribution.push(TimeDistributionPoint { hour, message_count });
    }

    distribution
}
