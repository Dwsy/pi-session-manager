//! Stats aggregation logic
use crate::core::parser::{parse_session_details, SessionModelUsage};
use crate::domain::stats::types::*;
use crate::types::SessionInfo;
use chrono::{Datelike, Local, Timelike, Weekday};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// Collects per-day statistics for heatmap enhancement
#[derive(Debug, Default)]
pub struct DailyStatsCollector {
    pub messages: HashMap<String, usize>,
    pub tokens: HashMap<String, usize>,
    pub cost: HashMap<String, f64>,
    pub sessions: HashMap<String, usize>,
    pub projects: HashMap<String, HashMap<String, usize>>,
}

impl DailyStatsCollector {
    pub fn add_session(
        &mut self,
        date: &str,
        project: &str,
        messages: usize,
        tokens: usize,
        cost: f64,
    ) {
        *self.messages.entry(date.to_string()).or_insert(0) += messages;
        *self.tokens.entry(date.to_string()).or_insert(0) += tokens;
        *self.cost.entry(date.to_string()).or_insert(0.0) += cost;
        *self.sessions.entry(date.to_string()).or_insert(0) += 1;
        *self
            .projects
            .entry(date.to_string())
            .or_default()
            .entry(project.to_string())
            .or_insert(0) += messages;
    }

    pub fn top_project_for_date(&self, date: &str) -> Option<String> {
        self.projects
            .get(date)?
            .iter()
            .max_by_key(|(_, count)| *count)
            .map(|(project, _)| project.clone())
    }
}

pub fn extract_project_name(cwd: &str) -> String {
    cwd.rsplit(['/', '\\'])
        .find(|segment| !segment.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

pub fn parse_modified(value: &str) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now())
}

fn weekday_name(weekday: Weekday) -> &'static str {
    match weekday {
        Weekday::Mon => "Monday",
        Weekday::Tue => "Tuesday",
        Weekday::Wed => "Wednesday",
        Weekday::Thu => "Thursday",
        Weekday::Fri => "Friday",
        Weekday::Sat => "Saturday",
        Weekday::Sun => "Sunday",
    }
}

fn bump_model_project_count(
    model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>,
    model: &str,
    project: &str,
) {
    let project_map = model_usage_by_project.entry(model.to_string()).or_default();
    *project_map.entry(project.to_string()).or_insert(0) += 1;
}

pub fn merge_model_usage(
    model_usage: &HashMap<String, SessionModelUsage>,
    project: &str,
    sessions_by_model: &mut HashMap<String, usize>,
    tokens_by_model: &mut HashMap<String, ModelTokenStats>,
    model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>,
) {
    for (model, usage) in model_usage {
        *sessions_by_model.entry(model.clone()).or_insert(0) += 1;
        bump_model_project_count(model_usage_by_project, model, project);

        let model_stats = tokens_by_model
            .entry(model.clone())
            .or_insert(ModelTokenStats {
                messages: 0,
                input: 0,
                output: 0,
                cache_read: 0,
                cache_write: 0,
                cost: 0.0,
            });

        model_stats.messages += usage.messages;
        model_stats.input += usage.input_tokens as usize;
        model_stats.output += usage.output_tokens as usize;
        model_stats.cache_read += usage.cache_read_tokens as usize;
        model_stats.cache_write += usage.cache_write_tokens as usize;
        model_stats.cost += usage.cost;
    }
}

pub fn record_model_presence(
    models: &[String],
    project: &str,
    sessions_by_model: &mut HashMap<String, usize>,
    model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>,
) {
    for model in models {
        *sessions_by_model.entry(model.clone()).or_insert(0) += 1;
        bump_model_project_count(model_usage_by_project, model, project);
    }
}

fn add_time_and_weekday_counts(
    messages_by_hour: &mut HashMap<String, usize>,
    messages_by_day_of_week: &mut HashMap<String, usize>,
    session_modified: chrono::DateTime<chrono::Utc>,
    messages_count: usize,
) {
    let hour = session_modified.with_timezone(&Local).hour();
    *messages_by_hour.entry(hour.to_string()).or_insert(0) += messages_count;

    let day_name = weekday_name(session_modified.weekday());
    *messages_by_day_of_week
        .entry(day_name.to_string())
        .or_insert(0) += messages_count;
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

fn should_refresh_cached_details(cached: &crate::data::sqlite::SessionDetailsCache) -> bool {
    let has_messages = cached.user_messages + cached.assistant_messages > 0;
    let has_no_usage = cached.input_tokens == 0
        && cached.output_tokens == 0
        && cached.cache_read_tokens == 0
        && cached.cache_write_tokens == 0
        && cached.input_cost == 0.0
        && cached.output_cost == 0.0
        && cached.cache_read_cost == 0.0
        && cached.cache_write_cost == 0.0;

    has_messages && has_no_usage
}

/// Process a single session's data from cache or file
#[allow(clippy::too_many_arguments)]
fn process_session_data(
    session: &SessionStatsInput,
    project: &str,
    project_path: &str,
    session_modified: chrono::DateTime<chrono::Utc>,
    conn: Option<&rusqlite::Connection>,
    sessions_by_model: &mut HashMap<String, usize>,
    tokens_by_model: &mut HashMap<String, ModelTokenStats>,
    model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>,
    messages_by_date: &mut HashMap<String, usize>,
    messages_by_hour: &mut HashMap<String, usize>,
    messages_by_day_of_week: &mut HashMap<String, usize>,
    daily_stats: &mut DailyStatsCollector,
) -> (usize, usize, usize, usize, usize, f64) {
    // 1. Check memory buffer first (fastest)
    let memory_cached = crate::core::write_buffer::get_buffered_details(&session.path)
        .filter(|(_, file_modified)| *file_modified >= session_modified);

    if let Some((details, _)) = memory_cached {
        if details.model_usage.is_empty() {
            record_model_presence(
                &details.models,
                project_path,
                sessions_by_model,
                model_usage_by_project,
            );
        } else {
            merge_model_usage(
                &details.model_usage,
                project_path,
                sessions_by_model,
                tokens_by_model,
                model_usage_by_project,
            );
        }

        let msg_count = details.user_messages + details.assistant_messages;
        let date = session_modified.format("%Y-%m-%d").to_string();
        *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
        daily_stats.add_session(
            &date,
            project,
            msg_count,
            (details.input_tokens + details.output_tokens) as usize,
            details.total_cost(),
        );
        add_time_and_weekday_counts(
            messages_by_hour,
            messages_by_day_of_week,
            session_modified,
            msg_count,
        );

        return (
            details.user_messages,
            details.assistant_messages,
            details.input_tokens as usize,
            details.output_tokens as usize,
            details.cache_read_tokens as usize + details.cache_write_tokens as usize,
            details.input_cost
                + details.output_cost
                + details.cache_read_cost
                + details.cache_write_cost,
        );
    }

    // 2. Then check database cache
    let cached_details = conn.and_then(|conn| {
        crate::data::sqlite::get_session_details_cache(conn, &session.path)
            .ok()
            .flatten()
            .filter(|cached| cached.file_modified >= session_modified)
    });

    if let Some(cached) = cached_details {
        let parsed_override = if should_refresh_cached_details(&cached) {
            std::fs::read_to_string(&session.path)
                .ok()
                .map(|content| parse_session_details(&content))
                .filter(|parsed| parsed.total_tokens() > 0 || parsed.total_cost() > 0.0)
        } else {
            None
        };

        if let Some(parsed) = parsed_override {
            crate::core::write_buffer::buffer_details_write(
                &session.path,
                session_modified,
                &parsed,
            );
            if let Some(conn) = conn {
                let _ = crate::data::sqlite::upsert_session_details_cache(
                    conn,
                    &session.path,
                    session_modified,
                    &parsed,
                );
            }
            if parsed.model_usage.is_empty() {
                record_model_presence(
                    &parsed.models,
                    project_path,
                    sessions_by_model,
                    model_usage_by_project,
                );
            } else {
                merge_model_usage(
                    &parsed.model_usage,
                    project_path,
                    sessions_by_model,
                    tokens_by_model,
                    model_usage_by_project,
                );
            }

            let msg_count = parsed.user_messages + parsed.assistant_messages;
            let date = session_modified.format("%Y-%m-%d").to_string();
            *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
            daily_stats.add_session(
                &date,
                project,
                msg_count,
                (parsed.input_tokens + parsed.output_tokens) as usize,
                parsed.total_cost(),
            );
            add_time_and_weekday_counts(
                messages_by_hour,
                messages_by_day_of_week,
                session_modified,
                msg_count,
            );

            return (
                parsed.user_messages,
                parsed.assistant_messages,
                parsed.input_tokens as usize,
                parsed.output_tokens as usize,
                parsed.cache_read_tokens as usize + parsed.cache_write_tokens as usize,
                parsed.total_cost(),
            );
        }

        match serde_json::from_str::<HashMap<String, SessionModelUsage>>(&cached.model_usage_json) {
            Ok(model_usage) if !model_usage.is_empty() => {
                merge_model_usage(
                    &model_usage,
                    project_path,
                    sessions_by_model,
                    tokens_by_model,
                    model_usage_by_project,
                );
            }
            _ => {
                if let Ok(models) = serde_json::from_str::<Vec<String>>(&cached.models_json) {
                    record_model_presence(
                        &models,
                        project_path,
                        sessions_by_model,
                        model_usage_by_project,
                    );
                }
            }
        }

        let msg_count = cached.user_messages + cached.assistant_messages;
        let date = session_modified.format("%Y-%m-%d").to_string();
        *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
        daily_stats.add_session(
            &date,
            project,
            msg_count,
            cached.input_tokens + cached.output_tokens,
            cached.input_cost
                + cached.output_cost
                + cached.cache_read_cost
                + cached.cache_write_cost,
        );
        add_time_and_weekday_counts(
            messages_by_hour,
            messages_by_day_of_week,
            session_modified,
            msg_count,
        );

        return (
            cached.user_messages,
            cached.assistant_messages,
            cached.input_tokens,
            cached.output_tokens,
            cached.cache_read_tokens + cached.cache_write_tokens,
            cached.input_cost
                + cached.output_cost
                + cached.cache_read_cost
                + cached.cache_write_cost,
        );
    }

    // 3. Parse session file (cache miss or stale)
    if let Ok(content) = std::fs::read_to_string(&session.path) {
        let session_stats = parse_session_details(&content);
        crate::core::write_buffer::buffer_details_write(
            &session.path,
            session_modified,
            &session_stats,
        );

        if session_stats.model_usage.is_empty() {
            record_model_presence(
                &session_stats.models,
                project_path,
                sessions_by_model,
                model_usage_by_project,
            );
        } else {
            merge_model_usage(
                &session_stats.model_usage,
                project_path,
                sessions_by_model,
                tokens_by_model,
                model_usage_by_project,
            );
        }

        let msg_count = session_stats.user_messages + session_stats.assistant_messages;
        let date = session_modified.format("%Y-%m-%d").to_string();
        *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
        daily_stats.add_session(
            &date,
            project,
            msg_count,
            (session_stats.input_tokens + session_stats.output_tokens) as usize,
            session_stats.total_cost(),
        );
        add_time_and_weekday_counts(
            messages_by_hour,
            messages_by_day_of_week,
            session_modified,
            msg_count,
        );

        return (
            session_stats.user_messages,
            session_stats.assistant_messages,
            session_stats.input_tokens as usize,
            session_stats.output_tokens as usize,
            session_stats.cache_read_tokens as usize + session_stats.cache_write_tokens as usize,
            session_stats.input_cost
                + session_stats.output_cost
                + session_stats.cache_read_cost
                + session_stats.cache_write_cost,
        );
    }

    // 4. Fallback
    bump_model_project_count(model_usage_by_project, "unknown", project_path);
    *sessions_by_model.entry("unknown".to_string()).or_insert(0) += 1;
    let date = session_modified.format("%Y-%m-%d").to_string();
    *messages_by_date.entry(date.clone()).or_insert(0) += session.message_count;
    daily_stats.add_session(
        &date,
        project,
        session.message_count,
        session.message_count * 100,
        0.0,
    );
    add_time_and_weekday_counts(
        messages_by_hour,
        messages_by_day_of_week,
        session_modified,
        session.message_count,
    );

    (0, 0, 0, 0, 0, 0.0)
}

pub fn calculate_stats_from_inputs(sessions: &[SessionStatsInput]) -> SessionStats {
    let total_sessions = sessions.len();
    log::trace!("Calculating stats for {total_sessions} sessions");

    let conn = crate::data::sqlite::init_db().ok();

    let mut sessions_by_project: HashMap<String, usize> = HashMap::new();
    let mut sessions_by_model: HashMap<String, usize> = HashMap::new();
    let mut model_usage_by_project: HashMap<String, HashMap<String, usize>> = HashMap::new();
    let mut messages_by_date: HashMap<String, usize> = HashMap::new();
    let mut messages_by_hour: HashMap<String, usize> = HashMap::new();
    let mut messages_by_day_of_week: HashMap<String, usize> = HashMap::new();

    let mut total_user_messages = 0usize;
    let mut total_assistant_messages = 0usize;
    let mut total_messages = 0usize;
    let mut total_input = 0usize;
    let mut total_output = 0usize;
    let mut total_cache_read = 0usize;
    let mut total_cache_write = 0usize;
    let mut total_cost = 0.0f64;
    let mut tokens_by_model: HashMap<String, ModelTokenStats> = HashMap::new();
    let mut daily_stats = DailyStatsCollector::default();

    for session in sessions {
        let session_modified = parse_modified(&session.modified);
        let project_path = session.cwd.clone();
        let project = extract_project_name(&project_path);
        *sessions_by_project.entry(project.clone()).or_insert(0) += 1;

        let (user_msgs, assistant_msgs, input, output, cache, cost) = process_session_data(
            session,
            &project,
            &project_path,
            session_modified,
            conn.as_ref(),
            &mut sessions_by_model,
            &mut tokens_by_model,
            &mut model_usage_by_project,
            &mut messages_by_date,
            &mut messages_by_hour,
            &mut messages_by_day_of_week,
            &mut daily_stats,
        );

        total_user_messages += user_msgs;
        total_assistant_messages += assistant_msgs;
        // Handle fallback case where process_session_data returns 0 but already recorded in daily_stats
        let session_total_msgs = if user_msgs + assistant_msgs == 0 {
            session.message_count
        } else {
            user_msgs + assistant_msgs
        };
        total_messages += session_total_msgs;
        total_input += input;
        total_output += output;
        total_cache_read += cache / 2; // approximate split
        total_cache_write += cache / 2;
        total_cost += cost;
    }

    let unique_session_dirs: Vec<PathBuf> = sessions
        .iter()
        .filter_map(|s| PathBuf::from(&s.path).parent().map(|p| p.to_path_buf()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let subagent_summary =
        crate::subagent::scan_subagent_artifacts(&unique_session_dirs, conn.as_ref());

    let average_messages_per_session = if total_sessions > 0 {
        total_messages as f32 / total_sessions as f32
    } else {
        0.0
    };

    let heatmap_data =
        crate::domain::stats::heatmap::generate_heatmap_data(&messages_by_date, &daily_stats);
    let time_distribution =
        crate::domain::stats::heatmap::generate_time_distribution(&messages_by_hour);

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
        model_usage_by_project,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculate_stats_from_inputs_populates_daily_token_and_cost_totals() {
        let temp = tempfile::tempdir().expect("tempdir");
        let session_path = temp.path().join("stats-session.jsonl");
        std::fs::write(
            &session_path,
            "{\"type\":\"session\",\"id\":\"pi-1\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"cwd\":\"/repo/demo\"}\n{\"type\":\"message\",\"id\":\"u1\",\"timestamp\":\"2026-01-01T00:00:01Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}}\n{\"type\":\"message\",\"id\":\"a1\",\"timestamp\":\"2026-01-01T00:00:02Z\",\"message\":{\"role\":\"assistant\",\"model\":\"gpt-5\",\"provider\":\"openai\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}],\"usage\":{\"input\":10,\"output\":30,\"cacheRead\":0,\"cacheWrite\":0,\"cost\":{\"input\":0.01,\"output\":0.02,\"cacheRead\":0.0,\"cacheWrite\":0.0}}}}\n",
        )
        .expect("write session");

        let modified = chrono::Utc::now().to_rfc3339();
        let stats = calculate_stats_from_inputs(&[SessionStatsInput {
            path: session_path.to_string_lossy().to_string(),
            cwd: "/repo/demo".to_string(),
            modified: modified.clone(),
            message_count: 2,
        }]);

        let date = parse_modified(&modified).format("%Y-%m-%d").to_string();
        let point = stats
            .heatmap_data
            .iter()
            .find(|point| point.date == date)
            .expect("heatmap point");

        assert_eq!(point.total_tokens, 40);
        assert!(point.total_cost > 0.0);
        assert_eq!(stats.token_details.total_input, 10);
        assert_eq!(stats.token_details.total_output, 30);
        assert!(stats.token_details.total_cost > 0.0);
    }
}
