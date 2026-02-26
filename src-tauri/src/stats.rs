use crate::models::{SessionInfo, SubagentSummary};
use crate::session_parser::parse_session_details;
use crate::sqlite_cache;
use crate::subagent;
use crate::write_buffer;
use chrono::{Datelike, Local, Timelike, Weekday};
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    pub total_sessions: usize,
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub total_tokens: usize,
    pub sessions_by_project: HashMap<String, usize>,
    pub sessions_by_model: HashMap<String, usize>,
    pub messages_by_date: HashMap<String, usize>,
    pub messages_by_hour: HashMap<String, usize>,
    pub messages_by_day_of_week: HashMap<String, usize>,
    pub average_messages_per_session: f32,
    pub heatmap_data: Vec<HeatmapPoint>,
    pub time_distribution: Vec<TimeDistributionPoint>,
    pub token_details: TokenDetails,
    pub subagent_summary: SubagentSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatsInput {
    pub path: String,
    pub cwd: String,
    pub modified: String,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenDetails {
    pub total_input: usize,
    pub total_output: usize,
    pub total_cache_read: usize,
    pub total_cache_write: usize,
    pub total_cost: f64,
    pub tokens_by_model: HashMap<String, ModelTokenStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelTokenStats {
    pub input: usize,
    pub output: usize,
    pub cache_read: usize,
    pub cache_write: usize,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapPoint {
    pub date: String,
    pub level: usize,
    // Enhanced fields for tooltip and modal
    pub total_messages: usize,
    pub total_tokens: usize,
    pub session_count: usize,
    pub top_project: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayProjectBreakdown {
    pub project_path: String,
    pub project_name: String,
    pub session_count: usize,
    pub message_count: usize,
    pub token_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaySession {
    pub path: String,
    pub cwd: String,
    pub name: Option<String>,
    pub first_message: String,
    pub message_count: usize,
    pub token_count: usize,
    pub model: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayStats {
    pub date: String,
    pub total_messages: usize,
    pub total_tokens: usize,
    pub session_count: usize,
    pub project_count: usize,
    pub project_breakdown: Vec<DayProjectBreakdown>,
    pub sessions: Vec<DaySession>,
    pub hourly_distribution: Vec<usize>, // 24 hours
    pub models_used: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeDistributionPoint {
    pub hour: usize,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String,
    pub message_count: usize,
    pub session_count: usize,
}

pub fn calculate_stats(sessions: &[SessionInfo]) -> SessionStats {
    let light_sessions: Vec<SessionStatsInput> = sessions
        .iter()
        .map(|session| SessionStatsInput {
            path: session.path.clone(),
            cwd: session.cwd.clone(),
            modified: session.modified.to_rfc3339(),
            message_count: session.message_count,
        })
        .collect();

    calculate_stats_from_inputs(&light_sessions)
}

/// Collects per-day statistics for heatmap enhancement
#[derive(Debug, Default)]
struct DailyStatsCollector {
    messages: HashMap<String, usize>,
    tokens: HashMap<String, usize>,
    sessions: HashMap<String, usize>,
    projects: HashMap<String, HashMap<String, usize>>, // date -> project -> count
}

impl DailyStatsCollector {
    fn add_session(&mut self, date: &str, project: &str, messages: usize, tokens: usize) {
        *self.messages.entry(date.to_string()).or_insert(0) += messages;
        *self.tokens.entry(date.to_string()).or_insert(0) += tokens;
        *self.sessions.entry(date.to_string()).or_insert(0) += 1;
        *self
            .projects
            .entry(date.to_string())
            .or_default()
            .entry(project.to_string())
            .or_insert(0) += messages;
    }

    fn top_project_for_date(&self, date: &str) -> Option<String> {
        self.projects
            .get(date)?
            .iter()
            .max_by_key(|(_, count)| *count)
            .map(|(project, _)| project.clone())
    }
}

pub fn calculate_stats_from_inputs(sessions: &[SessionStatsInput]) -> SessionStats {
    let total_sessions = sessions.len();

    log::trace!("Calculating stats for {total_sessions} sessions");

    let conn = sqlite_cache::init_db().ok();

    let mut sessions_by_project: HashMap<String, usize> = HashMap::new();
    let mut sessions_by_model: HashMap<String, usize> = HashMap::new();
    let mut messages_by_date: HashMap<String, usize> = HashMap::new();
    let mut messages_by_hour: HashMap<String, usize> = HashMap::new();
    let mut messages_by_day_of_week: HashMap<String, usize> = HashMap::new();

    // Message counts
    let mut total_user_messages = 0usize;
    let mut total_assistant_messages = 0usize;
    let mut total_messages = 0usize;

    // Token statistics
    let mut total_input = 0usize;
    let mut total_output = 0usize;
    let mut total_cache_read = 0usize;
    let mut total_cache_write = 0usize;
    let mut total_cost = 0.0f64;
    let tokens_by_model: HashMap<String, ModelTokenStats> = HashMap::new();

    // Daily stats collector for heatmap enhancement
    let mut daily_stats = DailyStatsCollector::default();

    for session in sessions {
        let session_modified = parse_modified(&session.modified);
        // Extract project from cwd
        let project = extract_project_name(&session.cwd);
        *sessions_by_project.entry(project.clone()).or_insert(0) += 1;

        // 1. Check memory buffer first (fastest)
        let memory_cached = write_buffer::get_buffered_details(&session.path)
            .filter(|(_, file_modified)| *file_modified >= session_modified);

        if let Some((details, _)) = memory_cached {
            for model in &details.models {
                *sessions_by_model.entry(model.clone()).or_insert(0) += 1;
            }

            total_user_messages += details.user_messages;
            total_assistant_messages += details.assistant_messages;
            total_messages += details.user_messages + details.assistant_messages;

            total_input += details.input_tokens as usize;
            total_output += details.output_tokens as usize;
            total_cache_read += details.cache_read_tokens as usize;
            total_cache_write += details.cache_write_tokens as usize;
            total_cost += details.input_cost
                + details.output_cost
                + details.cache_read_cost
                + details.cache_write_cost;

            let date = session_modified.format("%Y-%m-%d").to_string();
            let messages_count = details.user_messages + details.assistant_messages;
            let tokens_count = details.input_tokens + details.output_tokens;
            *messages_by_date.entry(date.clone()).or_insert(0) += messages_count;

            // Collect daily stats for heatmap
            daily_stats.add_session(&date, &project, messages_count, tokens_count as usize);

            let hour = session_modified.with_timezone(&Local).hour();
            *messages_by_hour.entry(hour.to_string()).or_insert(0) += messages_count;

            let weekday = session_modified.weekday();
            let day_name = match weekday {
                Weekday::Mon => "Monday",
                Weekday::Tue => "Tuesday",
                Weekday::Wed => "Wednesday",
                Weekday::Thu => "Thursday",
                Weekday::Fri => "Friday",
                Weekday::Sat => "Saturday",
                Weekday::Sun => "Sunday",
            };
            *messages_by_day_of_week
                .entry(day_name.to_string())
                .or_insert(0) += details.user_messages + details.assistant_messages;
            continue;
        }

        // 2. Then check database cache
        let cached_details = conn.as_ref().and_then(|conn| {
            sqlite_cache::get_session_details_cache(conn, &session.path)
                .ok()
                .flatten()
                .filter(|cached| cached.file_modified >= session_modified)
        });

        if let Some(cached) = cached_details {
            if let Ok(models) = serde_json::from_str::<Vec<String>>(&cached.models_json) {
                for model in models {
                    *sessions_by_model.entry(model).or_insert(0) += 1;
                }
            }

            total_user_messages += cached.user_messages;
            total_assistant_messages += cached.assistant_messages;
            total_messages += cached.user_messages + cached.assistant_messages;

            total_input += cached.input_tokens;
            total_output += cached.output_tokens;
            total_cache_read += cached.cache_read_tokens;
            total_cache_write += cached.cache_write_tokens;
            total_cost += cached.input_cost
                + cached.output_cost
                + cached.cache_read_cost
                + cached.cache_write_cost;

            let date = session_modified.format("%Y-%m-%d").to_string();
            let messages_count = cached.user_messages + cached.assistant_messages;
            let tokens_count = cached.input_tokens + cached.output_tokens;
            *messages_by_date.entry(date.clone()).or_insert(0) += messages_count;

            // Collect daily stats for heatmap
            daily_stats.add_session(&date, &project, messages_count, tokens_count as usize);

            let hour = session_modified.with_timezone(&Local).hour();
            *messages_by_hour.entry(hour.to_string()).or_insert(0) += messages_count;

            let weekday = session_modified.weekday();
            let day_name = match weekday {
                Weekday::Mon => "Monday",
                Weekday::Tue => "Tuesday",
                Weekday::Wed => "Wednesday",
                Weekday::Thu => "Thursday",
                Weekday::Fri => "Friday",
                Weekday::Sat => "Saturday",
                Weekday::Sun => "Sunday",
            };
            *messages_by_day_of_week
                .entry(day_name.to_string())
                .or_insert(0) += cached.user_messages + cached.assistant_messages;
            continue;
        }

        // Parse session file for detailed stats (cache miss or stale)
        if let Ok(content) = std::fs::read_to_string(&session.path) {
            let session_stats = parse_session_details(&content);

            // Use memory buffer to reduce database write frequency
            write_buffer::buffer_details_write(&session.path, session_modified, &session_stats);

            for model in &session_stats.models {
                *sessions_by_model.entry(model.clone()).or_insert(0) += 1;
            }

            total_user_messages += session_stats.user_messages;
            total_assistant_messages += session_stats.assistant_messages;
            total_messages += session_stats.user_messages + session_stats.assistant_messages;

            total_input += session_stats.input_tokens as usize;
            total_output += session_stats.output_tokens as usize;
            total_cache_read += session_stats.cache_read_tokens as usize;
            total_cache_write += session_stats.cache_write_tokens as usize;
            total_cost += session_stats.input_cost
                + session_stats.output_cost
                + session_stats.cache_read_cost
                + session_stats.cache_write_cost;

            let date = session_modified.format("%Y-%m-%d").to_string();
            let messages_count = session_stats.user_messages + session_stats.assistant_messages;
            let tokens_count = session_stats.input_tokens + session_stats.output_tokens;
            *messages_by_date.entry(date.clone()).or_insert(0) += messages_count;

            // Collect daily stats for heatmap
            daily_stats.add_session(&date, &project, messages_count, tokens_count as usize);

            let hour = session_modified.with_timezone(&Local).hour();
            *messages_by_hour.entry(hour.to_string()).or_insert(0) += messages_count;

            let weekday = session_modified.weekday();
            let day_name = match weekday {
                Weekday::Mon => "Monday",
                Weekday::Tue => "Tuesday",
                Weekday::Wed => "Wednesday",
                Weekday::Thu => "Thursday",
                Weekday::Fri => "Friday",
                Weekday::Sat => "Saturday",
                Weekday::Sun => "Sunday",
            };
            *messages_by_day_of_week
                .entry(day_name.to_string())
                .or_insert(0) += session_stats.user_messages + session_stats.assistant_messages;
        } else {
            // Fallback if parsing fails
            *sessions_by_model.entry("unknown".to_string()).or_insert(0) += 1;
            total_messages += session.message_count;

            let date = session_modified.format("%Y-%m-%d").to_string();
            *messages_by_date.entry(date.clone()).or_insert(0) += session.message_count;

            // Collect daily stats for heatmap (fallback uses message_count as tokens approximation)
            daily_stats.add_session(
                &date,
                &project,
                session.message_count,
                session.message_count * 100,
            );

            let hour = session_modified.with_timezone(&Local).hour();
            *messages_by_hour.entry(hour.to_string()).or_insert(0) += session.message_count;

            let weekday = session_modified.weekday();
            let day_name = match weekday {
                Weekday::Mon => "Monday",
                Weekday::Tue => "Tuesday",
                Weekday::Wed => "Wednesday",
                Weekday::Thu => "Thursday",
                Weekday::Fri => "Friday",
                Weekday::Sat => "Saturday",
                Weekday::Sun => "Sunday",
            };
            *messages_by_day_of_week
                .entry(day_name.to_string())
                .or_insert(0) += session.message_count;
        }
    }

    // Collect unique parent directories from session paths for subagent scanning
    let unique_session_dirs: Vec<PathBuf> = sessions
        .iter()
        .filter_map(|s| PathBuf::from(&s.path).parent().map(|p| p.to_path_buf()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let subagent_summary = subagent::scan_subagent_artifacts(&unique_session_dirs, conn.as_ref());

    let average_messages_per_session = if total_sessions > 0 {
        total_messages as f32 / total_sessions as f32
    } else {
        0.0
    };

    // Generate heatmap data (last 365 days) with enhanced daily stats
    let heatmap_data = generate_heatmap_data(&messages_by_date, &daily_stats);

    // Generate time distribution
    let time_distribution = generate_time_distribution(&messages_by_hour);

    log::trace!(
        "Stats: {} user messages, {} assistant messages, {} total tokens",
        total_user_messages,
        total_assistant_messages,
        total_input + total_output
    );

    SessionStats {
        total_sessions,
        total_messages,
        user_messages: total_user_messages,
        assistant_messages: total_assistant_messages,
        total_tokens: total_input + total_output,
        sessions_by_project,
        sessions_by_model,
        messages_by_date,
        messages_by_hour,
        messages_by_day_of_week,
        average_messages_per_session,
        heatmap_data,
        time_distribution,
        token_details: TokenDetails {
            total_input,
            total_output,
            total_cache_read,
            total_cache_write,
            total_cost,
            tokens_by_model,
        },
        subagent_summary,
    }
}

fn extract_project_name(cwd: &str) -> String {
    cwd.split('/').next_back().unwrap_or("unknown").to_string()
}

fn generate_heatmap_data(
    messages_by_date: &HashMap<String, usize>,
    daily_stats: &DailyStatsCollector,
) -> Vec<HeatmapPoint> {
    let mut data = Vec::new();
    let now = chrono::Utc::now();
    let days_ago = 365;

    // Find max messages for normalization
    let max_messages = messages_by_date.values().copied().max().unwrap_or(1);

    for i in 0..=days_ago {
        let date = now - chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let message_count = messages_by_date.get(&date_str).copied().unwrap_or(0);

        // Calculate activity level (0-5)
        let level = if message_count == 0 {
            0
        } else {
            ((message_count as f32 / max_messages as f32) * 5.0).round() as usize
        };

        // Get enhanced stats from daily collector
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

fn generate_time_distribution(
    messages_by_hour: &HashMap<String, usize>,
) -> Vec<TimeDistributionPoint> {
    let mut distribution = Vec::new();

    for hour in 0..24 {
        let message_count = messages_by_hour
            .get(&hour.to_string())
            .copied()
            .unwrap_or(0);
        distribution.push(TimeDistributionPoint {
            hour,
            message_count,
        });
    }

    distribution
}

/// Get detailed statistics for a specific day
pub fn get_day_stats(date: &str, sessions: &[SessionInfo]) -> Result<DayStats, String> {
    use crate::session_parser::parse_session_details;
    use crate::sqlite_cache;
    use crate::write_buffer;

    let target_date = match chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(e) => return Err(format!("Invalid date format: {}", e)),
    };

    let conn = sqlite_cache::init_db().ok();
    let mut day_sessions: Vec<DaySession> = Vec::new();
    let mut project_stats: HashMap<String, (String, usize, usize, usize)> = HashMap::new(); // path -> (name, sessions, messages, tokens)
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

        // Try to get detailed stats from cache or parse
        let (messages, tokens, model) = if let Some((details, _)) =
            write_buffer::get_buffered_details(&session.path)
                .filter(|(_, fm)| *fm >= session_modified)
        {
            let msg_count = details.user_messages + details.assistant_messages;
            let tok_count = (details.input_tokens + details.output_tokens) as usize;
            let primary_model = details
                .models
                .first()
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            (msg_count, tok_count, primary_model)
        } else if let Some(cached) = conn.as_ref().and_then(|c| {
            sqlite_cache::get_session_details_cache(c, &session.path)
                .ok()
                .flatten()
                .filter(|c| c.file_modified >= session_modified)
        }) {
            let msg_count = cached.user_messages + cached.assistant_messages;
            let tok_count = cached.input_tokens + cached.output_tokens;
            let models: Vec<String> = serde_json::from_str(&cached.models_json).unwrap_or_default();
            let primary_model = models
                .first()
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            (msg_count, tok_count, primary_model)
        } else if let Ok(content) = std::fs::read_to_string(&session.path) {
            let details = parse_session_details(&content);
            let msg_count = details.user_messages + details.assistant_messages;
            let tok_count = (details.input_tokens + details.output_tokens) as usize;
            let primary_model = details
                .models
                .first()
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            (msg_count, tok_count, primary_model)
        } else {
            (
                session.message_count,
                session.message_count * 100,
                "unknown".to_string(),
            )
        };

        // Update aggregates
        total_messages += messages;
        total_tokens += tokens;
        hourly_distribution[hour] += messages;
        *models_used.entry(model.clone()).or_insert(0) += 1;

        let entry = project_stats
            .entry(project_path.clone())
            .or_insert((project_name.clone(), 0, 0, 0));
        entry.1 += 1; // session count
        entry.2 += messages; // message count
        entry.3 += tokens; // token count

        // Add to sessions list
        day_sessions.push(DaySession {
            path: session.path.clone(),
            cwd: session.cwd.clone(),
            name: session.name.clone(),
            first_message: session.first_message.clone(),
            message_count: messages,
            token_count: tokens,
            model,
            timestamp: session.modified.to_rfc3339(),
        });
    }

    // Sort sessions by timestamp
    day_sessions.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    // Build project breakdown
    let mut project_breakdown: Vec<DayProjectBreakdown> = project_stats
        .into_iter()
        .map(|(path, (name, sessions, messages, tokens))| DayProjectBreakdown {
            project_path: path,
            project_name: name,
            session_count: sessions,
            message_count: messages,
            token_count: tokens,
        })
        .collect();

    project_breakdown.sort_by(|a, b| b.message_count.cmp(&a.message_count));

    Ok(DayStats {
        date: date.to_string(),
        total_messages,
        total_tokens,
        session_count: day_sessions.len(),
        project_count: project_breakdown.len(),
        project_breakdown,
        sessions: day_sessions,
        hourly_distribution,
        models_used,
    })
}

pub fn get_activity_timeline(sessions: &[SessionInfo]) -> Vec<DailyActivity> {
    let mut activity: HashMap<String, (usize, usize)> = HashMap::new();

    for session in sessions {
        let date = session.modified.format("%Y-%m-%d").to_string();
        let entry = activity.entry(date).or_insert((0, 0));
        entry.0 += session.message_count;
        entry.1 += 1;
    }

    let mut timeline: Vec<DailyActivity> = activity
        .into_iter()
        .map(|(date, (messages, sessions))| DailyActivity {
            date,
            message_count: messages,
            session_count: sessions,
        })
        .collect();

    timeline.sort_by(|a, b| a.date.cmp(&b.date));
    timeline
}

fn parse_modified(value: &str) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SessionInfo;
    use chrono::TimeZone;

    #[test]
    fn calculate_stats_from_inputs_fallback_counts_messages() {
        let sessions = vec![
            SessionStatsInput {
                path: "/tmp/does-not-exist-1.jsonl".to_string(),
                cwd: "/Users/example/project-alpha".to_string(),
                modified: chrono::Utc
                    .with_ymd_and_hms(2025, 1, 2, 10, 0, 0)
                    .unwrap()
                    .to_rfc3339(),
                message_count: 5,
            },
            SessionStatsInput {
                path: "/tmp/does-not-exist-2.jsonl".to_string(),
                cwd: "/Users/example/project-beta".to_string(),
                modified: chrono::Utc
                    .with_ymd_and_hms(2025, 1, 3, 16, 0, 0)
                    .unwrap()
                    .to_rfc3339(),
                message_count: 3,
            },
        ];

        let stats = calculate_stats_from_inputs(&sessions);

        assert_eq!(stats.total_sessions, 2);
        assert_eq!(stats.total_messages, 8);
        assert_eq!(stats.sessions_by_project.get("project-alpha"), Some(&1));
        assert_eq!(stats.sessions_by_project.get("project-beta"), Some(&1));

        // Hours are converted to local timezone
        let utc_time1 = chrono::Utc.with_ymd_and_hms(2025, 1, 2, 10, 0, 0).unwrap();
        let local_hour1 = utc_time1.with_timezone(&Local).hour().to_string();
        let utc_time2 = chrono::Utc.with_ymd_and_hms(2025, 1, 3, 16, 0, 0).unwrap();
        let local_hour2 = utc_time2.with_timezone(&Local).hour().to_string();

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
            all_messages_text: String::new(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: String::new(),
            last_message_role: "user".to_string(),
        }
    }

    #[test]
    fn get_day_stats_groups_projects_by_path_and_populates_hourly_distribution() {
        let modified_a = chrono::Utc.with_ymd_and_hms(2026, 1, 18, 2, 0, 0).unwrap();
        let modified_b = chrono::Utc.with_ymd_and_hms(2026, 1, 18, 8, 0, 0).unwrap();
        let target_date = modified_a.format("%Y-%m-%d").to_string();

        let sessions = vec![
            make_session(
                "/tmp/non-existent-day-stats-a.jsonl",
                "/Users/demo/workspace/foo-app",
                modified_a,
                10,
            ),
            make_session(
                "/tmp/non-existent-day-stats-b.jsonl",
                "/Users/demo/workspace/bar-app",
                modified_b,
                12,
            ),
        ];

        let stats = get_day_stats(&target_date, &sessions).expect("day stats should be calculated");

        assert_eq!(stats.session_count, 2);
        assert_eq!(stats.project_count, 2);
        assert_eq!(stats.project_breakdown.len(), 2);

        let project_paths: std::collections::HashSet<_> = stats
            .project_breakdown
            .iter()
            .map(|p| p.project_path.as_str())
            .collect();
        assert!(project_paths.contains("/Users/demo/workspace/foo-app"));
        assert!(project_paths.contains("/Users/demo/workspace/bar-app"));

        let local_hour_a = modified_a.with_timezone(&Local).hour() as usize;
        let local_hour_b = modified_b.with_timezone(&Local).hour() as usize;
        assert!(stats.hourly_distribution[local_hour_a] > 0);
        assert!(stats.hourly_distribution[local_hour_b] > 0);
    }

    #[test]
    fn get_day_stats_distinguishes_same_project_name_different_paths() {
        let modified = chrono::Utc.with_ymd_and_hms(2026, 1, 20, 3, 0, 0).unwrap();
        let target_date = modified.format("%Y-%m-%d").to_string();

        let sessions = vec![
            make_session(
                "/tmp/non-existent-day-stats-c.jsonl",
                "/Users/demo/workspace/a/service",
                modified,
                5,
            ),
            make_session(
                "/tmp/non-existent-day-stats-d.jsonl",
                "/Users/demo/workspace/b/service",
                modified,
                6,
            ),
        ];

        let stats = get_day_stats(&target_date, &sessions).expect("day stats should be calculated");

        assert_eq!(stats.project_count, 2);
        assert_eq!(stats.project_breakdown.len(), 2);
        assert!(stats
            .project_breakdown
            .iter()
            .all(|project| project.project_name == "service"));
    }
}
