//! Day-specific statistics
use crate::domain::stats::aggregator::extract_project_name;
use crate::domain::stats::types::{DayProjectBreakdown, DaySession, DayStats};
use crate::types::SessionInfo;
use chrono::{Datelike, Local, NaiveDate, Timelike, Weekday};
use std::collections::HashMap;

/// Get detailed statistics for a specific day
pub fn get_day_stats(date: &str, sessions: &[SessionInfo]) -> Result<DayStats, String> {
    let target_date = match NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(e) => return Err(format!("Invalid date format: {e}")),
    };

    let conn = crate::data::sqlite::init_db().ok();
    let mut day_sessions: Vec<DaySession> = Vec::new();
    let mut project_stats: HashMap<String, (String, usize, usize, usize)> = HashMap::new();
    let mut models_used: HashMap<String, usize> = HashMap::new();
    let mut hourly_distribution: Vec<usize> = vec![0; 24];
    let mut total_messages = 0usize;
    let mut total_tokens = 0usize;

    for session in sessions {
        let session_date = session.modified.format("%Y-%m-%d").to_string();
        if !session_date.starts_with(&target_date.to_string()) {
            continue;
        }

        let session_modified = session.modified;
        let project_path = session.cwd.clone();
        let project_name = extract_project_name(&project_path);
        let hour = session_modified.with_timezone(&Local).hour() as usize;

        let (messages, tokens, model) = get_session_detailed_stats(&session.path, session_modified, conn.as_ref(), session.message_count);

        total_messages += messages;
        total_tokens += tokens;
        hourly_distribution[hour] += messages;
        *models_used.entry(model.clone()).or_insert(0) += 1;

        let entry = project_stats.entry(project_path.clone()).or_insert((project_name.clone(), 0, 0, 0));
        entry.1 += 1;
        entry.2 += messages;
        entry.3 += tokens;

        day_sessions.push(DaySession { path: session.path.clone(), cwd: session.cwd.clone(), name: session.name.clone(), first_message: session.first_message.clone(), message_count: messages, token_count: tokens, model, timestamp: session.modified.to_rfc3339() });
    }

    day_sessions.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    let mut project_breakdown: Vec<DayProjectBreakdown> = project_stats.into_iter().map(|(path, (name, sessions, messages, tokens))| DayProjectBreakdown { project_path: path, project_name: name, session_count: sessions, message_count: messages, token_count: tokens }).collect();

    project_breakdown.sort_by_key(|b| std::cmp::Reverse(b.message_count));

    Ok(DayStats { date: date.to_string(), total_messages, total_tokens, session_count: day_sessions.len(), project_count: project_breakdown.len(), project_breakdown, sessions: day_sessions, hourly_distribution, models_used })
}

fn get_session_detailed_stats(path: &str, session_modified: chrono::DateTime<chrono::Utc>, conn: Option<&rusqlite::Connection>, fallback_message_count: usize) -> (usize, usize, String) {
    // Try memory buffer
    if let Some((details, _)) = crate::core::write_buffer::get_buffered_details(path).filter(|(_, fm)| *fm >= session_modified) {
        return (details.user_messages + details.assistant_messages, (details.input_tokens + details.output_tokens) as usize, details.models.first().cloned().unwrap_or_else(|| "unknown".to_string()));
    }

    // Try DB cache (compare at second-level precision to avoid false staleness)
    if let Some(cached) = conn.and_then(|c| crate::data::sqlite::get_session_details_cache(c, path).ok().flatten().filter(|c| c.file_modified.timestamp() >= session_modified.timestamp())) {
        let models: Vec<String> = serde_json::from_str(&cached.models_json).unwrap_or_default();
        return (cached.user_messages + cached.assistant_messages, cached.input_tokens + cached.output_tokens, models.first().cloned().unwrap_or_else(|| "unknown".to_string()));
    }

    // Cache miss: use fallback (no file I/O)
    (fallback_message_count, 0, "unknown".to_string())
}

pub fn get_activity_timeline(sessions: &[SessionInfo]) -> Vec<crate::domain::stats::types::DailyActivity> {
    use crate::domain::stats::types::DailyActivity;

    let mut activity: HashMap<String, (usize, usize)> = HashMap::new();

    for session in sessions {
        let date = session.modified.format("%Y-%m-%d").to_string();
        let entry = activity.entry(date).or_insert((0, 0));
        entry.0 += session.message_count;
        entry.1 += 1;
    }

    let mut timeline: Vec<DailyActivity> = activity.into_iter().map(|(date, (messages, sessions))| DailyActivity { date, message_count: messages, session_count: sessions }).collect();

    timeline.sort_by(|a, b| a.date.cmp(&b.date));
    timeline
}
