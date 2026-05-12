//! Stats aggregation logic
use crate::core::parser::SessionModelUsage;
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
    pub fn add_session(&mut self, date: &str, project: &str, messages: usize, tokens: usize, cost: f64) {
        *self.messages.entry(date.to_string()).or_insert(0) += messages;
        *self.tokens.entry(date.to_string()).or_insert(0) += tokens;
        *self.cost.entry(date.to_string()).or_insert(0.0) += cost;
        *self.sessions.entry(date.to_string()).or_insert(0) += 1;
        *self.projects.entry(date.to_string()).or_default().entry(project.to_string()).or_insert(0) += messages;
    }

    pub fn top_project_for_date(&self, date: &str) -> Option<String> {
        self.projects.get(date)?.iter().max_by_key(|(_, count)| *count).map(|(project, _)| project.clone())
    }
}

pub fn extract_project_name(cwd: &str) -> String {
    cwd.rsplit(['/', '\\']).find(|segment| !segment.is_empty()).unwrap_or("unknown").to_string()
}

pub fn parse_modified(value: &str) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::parse_from_rfc3339(value).map(|dt| dt.with_timezone(&chrono::Utc)).unwrap_or_else(|_| chrono::Utc::now())
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

fn bump_model_project_count(model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>, model: &str, project: &str) {
    let project_map = model_usage_by_project.entry(model.to_string()).or_default();
    *project_map.entry(project.to_string()).or_insert(0) += 1;
}

/// Parse model string (provider/model or just model) into separate parts
/// Uses first '/' as delimiter between provider and model
fn parse_provider_model(full_model: &str) -> (&str, &str) {
    if let Some(pos) = full_model.find('/') {
        (&full_model[..pos], &full_model[pos + 1..])
    } else {
        ("", full_model)
    }
}

pub fn merge_model_usage(
    model_usage: &HashMap<String, SessionModelUsage>,
    project: &str,
    sessions_by_model: &mut HashMap<String, usize>,
    sessions_by_provider: &mut HashMap<String, usize>,
    tokens_by_model: &mut HashMap<String, ModelTokenStats>,
    tokens_by_provider: &mut HashMap<String, HashMap<String, ModelTokenStats>>,
    model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>,
) {
    for (full_model, usage) in model_usage {
        *sessions_by_model.entry(full_model.clone()).or_insert(0) += 1;
        bump_model_project_count(model_usage_by_project, full_model, project);

        let model_stats = tokens_by_model.entry(full_model.clone()).or_insert(ModelTokenStats { messages: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 0.0 });

        model_stats.messages += usage.messages;
        model_stats.input += usage.input_tokens as usize;
        model_stats.output += usage.output_tokens as usize;
        model_stats.cache_read += usage.cache_read_tokens as usize;
        model_stats.cache_write += usage.cache_write_tokens as usize;
        model_stats.cost += usage.cost;

        // Also aggregate by provider
        let (provider, model_name) = parse_provider_model(full_model);
        if !provider.is_empty() {
            *sessions_by_provider.entry(provider.to_string()).or_insert(0) += 1;
            let provider_models = tokens_by_provider.entry(provider.to_string()).or_default();
            let provider_stats = provider_models.entry(model_name.to_string()).or_insert(ModelTokenStats { messages: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 0.0 });
            provider_stats.messages += usage.messages;
            provider_stats.input += usage.input_tokens as usize;
            provider_stats.output += usage.output_tokens as usize;
            provider_stats.cache_read += usage.cache_read_tokens as usize;
            provider_stats.cache_write += usage.cache_write_tokens as usize;
            provider_stats.cost += usage.cost;
        }
    }
}

pub fn record_model_presence(models: &[String], project: &str, sessions_by_model: &mut HashMap<String, usize>, sessions_by_provider: &mut HashMap<String, usize>, model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>) {
    for model in models {
        *sessions_by_model.entry(model.clone()).or_insert(0) += 1;
        bump_model_project_count(model_usage_by_project, model, project);

        let (provider, _) = parse_provider_model(model);
        if !provider.is_empty() {
            *sessions_by_provider.entry(provider.to_string()).or_insert(0) += 1;
        }
    }
}

fn add_time_and_weekday_counts(messages_by_hour: &mut HashMap<String, usize>, messages_by_day_of_week: &mut HashMap<String, usize>, session_modified: chrono::DateTime<chrono::Utc>, messages_count: usize) {
    let hour = session_modified.with_timezone(&Local).hour();
    *messages_by_hour.entry(hour.to_string()).or_insert(0) += messages_count;

    let day_name = weekday_name(session_modified.weekday());
    *messages_by_day_of_week.entry(day_name.to_string()).or_insert(0) += messages_count;
}

pub fn calculate_stats(sessions: &[SessionInfo]) -> SessionStats {
    let light_sessions: Vec<SessionStatsInput> = sessions.iter().map(|session| SessionStatsInput { path: session.path.clone(), cwd: session.cwd.clone(), modified: session.modified.to_rfc3339(), message_count: session.message_count }).collect();

    calculate_stats_from_inputs(&light_sessions)
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
    sessions_by_provider: &mut HashMap<String, usize>,
    tokens_by_model: &mut HashMap<String, ModelTokenStats>,
    tokens_by_provider: &mut HashMap<String, HashMap<String, ModelTokenStats>>,
    model_usage_by_project: &mut HashMap<String, HashMap<String, usize>>,
    messages_by_date: &mut HashMap<String, usize>,
    messages_by_hour: &mut HashMap<String, usize>,
    messages_by_day_of_week: &mut HashMap<String, usize>,
    daily_stats: &mut DailyStatsCollector,
) -> (usize, usize, usize, usize, usize, usize, f64) {
    // 1. Check memory buffer first (fastest)
    let memory_cached = crate::core::write_buffer::get_buffered_details(&session.path).filter(|(_, file_modified)| file_modified.timestamp() >= session_modified.timestamp());

    if let Some((details, _)) = memory_cached {
        if details.model_usage.is_empty() {
            record_model_presence(&details.models, project_path, sessions_by_model, sessions_by_provider, model_usage_by_project);
        } else {
            merge_model_usage(&details.model_usage, project_path, sessions_by_model, sessions_by_provider, tokens_by_model, tokens_by_provider, model_usage_by_project);
        }

        let msg_count = details.user_messages + details.assistant_messages;
        let date = session_modified.format("%Y-%m-%d").to_string();
        *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
        daily_stats.add_session(&date, project, msg_count, (details.input_tokens + details.output_tokens + details.cache_read_tokens + details.cache_write_tokens) as usize, details.total_cost());
        add_time_and_weekday_counts(messages_by_hour, messages_by_day_of_week, session_modified, msg_count);

        return (details.user_messages, details.assistant_messages, details.input_tokens as usize, details.output_tokens as usize, details.cache_read_tokens as usize, details.cache_write_tokens as usize, details.input_cost + details.output_cost + details.cache_read_cost + details.cache_write_cost);
    }

    // 2. Then check database cache
    // Compare at second-level precision: filesystem mtime may lack sub-second granularity
    // while sessions.modified retains milliseconds, causing false "stale" detections.
    let cached_details = conn.and_then(|conn| crate::data::sqlite::get_session_details_cache(conn, &session.path).ok().flatten().filter(|cached| cached.file_modified.timestamp() >= session_modified.timestamp()));

    if let Some(cached) = cached_details {
        // Use cached data directly — no file I/O in stats calculation.
        // Background warm_details_cache handles stale/empty model_usage_json refresh.

        match serde_json::from_str::<HashMap<String, SessionModelUsage>>(&cached.model_usage_json) {
            Ok(model_usage) if !model_usage.is_empty() => {
                merge_model_usage(&model_usage, project_path, sessions_by_model, sessions_by_provider, tokens_by_model, tokens_by_provider, model_usage_by_project);
            }
            _ => {
                if let Ok(models) = serde_json::from_str::<Vec<String>>(&cached.models_json) {
                    record_model_presence(&models, project_path, sessions_by_model, sessions_by_provider, model_usage_by_project);
                }
            }
        }

        let msg_count = cached.user_messages + cached.assistant_messages;
        let date = session_modified.format("%Y-%m-%d").to_string();
        *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
        daily_stats.add_session(&date, project, msg_count, cached.input_tokens + cached.output_tokens + cached.cache_read_tokens + cached.cache_write_tokens, cached.input_cost + cached.output_cost + cached.cache_read_cost + cached.cache_write_cost);
        add_time_and_weekday_counts(messages_by_hour, messages_by_day_of_week, session_modified, msg_count);

        return (cached.user_messages, cached.assistant_messages, cached.input_tokens, cached.output_tokens, cached.cache_read_tokens, cached.cache_write_tokens, cached.input_cost + cached.output_cost + cached.cache_read_cost + cached.cache_write_cost);
    }

    // 3. Cache miss: use session-level fallback (NO file I/O)
    // Background warm_details_cache will populate cache asynchronously.
    // On next stats calculation, this entry will hit the cache.
    bump_model_project_count(model_usage_by_project, "unknown", project_path);
    *sessions_by_model.entry("unknown".to_string()).or_insert(0) += 1;
    let msg_count = session.message_count;
    let date = session_modified.format("%Y-%m-%d").to_string();
    *messages_by_date.entry(date.clone()).or_insert(0) += msg_count;
    daily_stats.add_session(&date, project, msg_count, 0, 0.0);
    add_time_and_weekday_counts(messages_by_hour, messages_by_day_of_week, session_modified, msg_count);

    (0, 0, 0, 0, 0, 0, 0.0)
}

pub fn calculate_stats_from_inputs(sessions: &[SessionStatsInput]) -> SessionStats {
    let total_sessions = sessions.len();
    log::trace!("Calculating stats for {total_sessions} sessions");

    let conn = crate::data::sqlite::init_db().ok();

    let mut sessions_by_project: HashMap<String, usize> = HashMap::new();
    let mut sessions_by_model: HashMap<String, usize> = HashMap::new();
    let mut sessions_by_provider: HashMap<String, usize> = HashMap::new();
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
    let mut tokens_by_provider: HashMap<String, HashMap<String, ModelTokenStats>> = HashMap::new();
    let mut daily_stats = DailyStatsCollector::default();

    for session in sessions {
        let session_modified = parse_modified(&session.modified);
        let project_path = session.cwd.clone();
        let project = extract_project_name(&project_path);
        *sessions_by_project.entry(project.clone()).or_insert(0) += 1;

        let (user_msgs, assistant_msgs, input, output, cache_read, cache_write, cost) = process_session_data(
            session,
            &project,
            &project_path,
            session_modified,
            conn.as_ref(),
            &mut sessions_by_model,
            &mut sessions_by_provider,
            &mut tokens_by_model,
            &mut tokens_by_provider,
            &mut model_usage_by_project,
            &mut messages_by_date,
            &mut messages_by_hour,
            &mut messages_by_day_of_week,
            &mut daily_stats,
        );

        total_user_messages += user_msgs;
        total_assistant_messages += assistant_msgs;
        let session_total_msgs = if user_msgs + assistant_msgs == 0 { session.message_count } else { user_msgs + assistant_msgs };
        total_messages += session_total_msgs;
        total_input += input;
        total_output += output;
        total_cache_read += cache_read;
        total_cache_write += cache_write;
        total_cost += cost;
    }

    // total_tokens includes cache tokens (providers charge for cached tokens too)
    let total_tokens = total_input + total_output + total_cache_read + total_cache_write;

    let unique_session_dirs: Vec<PathBuf> = sessions.iter().filter_map(|s| PathBuf::from(&s.path).parent().map(|p| p.to_path_buf())).collect::<HashSet<_>>().into_iter().collect();
    let subagent_summary = crate::subagent::scan_subagent_artifacts(&unique_session_dirs, conn.as_ref());

    let average_messages_per_session = if total_sessions > 0 { total_messages as f32 / total_sessions as f32 } else { 0.0 };

    let heatmap_data = crate::domain::stats::heatmap::generate_heatmap_data(&messages_by_date, &daily_stats);
    let time_distribution = crate::domain::stats::heatmap::generate_time_distribution(&messages_by_hour);

    log::trace!("Stats: {} user messages, {} assistant messages, {} total tokens", total_user_messages, total_assistant_messages, total_tokens);

    SessionStats {
        total_sessions,
        total_messages,
        user_messages: total_user_messages,
        assistant_messages: total_assistant_messages,
        total_tokens,
        sessions_by_project,
        sessions_by_model,
        sessions_by_provider,
        model_usage_by_project,
        messages_by_date,
        messages_by_hour,
        messages_by_day_of_week,
        average_messages_per_session,
        heatmap_data,
        time_distribution,
        token_details: TokenDetails { total_input, total_output, total_cache_read, total_cache_write, total_cost, tokens_by_model, tokens_by_provider },
        subagent_summary,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    struct EnvVarGuard {
        key: &'static str,
        previous: Option<OsString>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: impl AsRef<std::ffi::OsStr>) -> Self {
            let previous = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, previous }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.as_ref() {
                std::env::set_var(self.key, previous);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    #[test]
    fn calculate_stats_from_inputs_populates_daily_token_and_cost_totals() {
        let _env_lock = crate::paths::test_env_lock().lock().expect("test env lock");
        let temp = tempfile::tempdir().expect("tempdir");
        let _test_db = EnvVarGuard::set("PPM_TEST_DB", temp.path().join("stats.db"));
        let session_path = temp.path().join("stats-session.jsonl");
        std::fs::write(
            &session_path,
            "{\"type\":\"session\",\"id\":\"pi-1\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"cwd\":\"/repo/demo\"}\n{\"type\":\"message\",\"id\":\"u1\",\"timestamp\":\"2026-01-01T00:00:01Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}}\n{\"type\":\"message\",\"id\":\"a1\",\"timestamp\":\"2026-01-01T00:00:02Z\",\"message\":{\"role\":\"assistant\",\"model\":\"gpt-5\",\"provider\":\"openai\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}],\"usage\":{\"input\":10,\"output\":30,\"cacheRead\":0,\"cacheWrite\":0,\"cost\":{\"input\":0.01,\"output\":0.02,\"cacheRead\":0.0,\"cacheWrite\":0.0}}}}\n",
        )
        .expect("write session");

        // Pre-populate DB cache (since process_session_data no longer reads files)
        let modified = chrono::Utc::now();
        let content = std::fs::read_to_string(&session_path).unwrap();
        let details = crate::core::parser::parse_session_details(&content);
        let conn = crate::data::sqlite::init_db().unwrap();
        crate::data::sqlite::upsert_session_details_cache(&conn, &session_path.to_string_lossy(), modified, &details).unwrap();

        let stats = calculate_stats_from_inputs(&[SessionStatsInput { path: session_path.to_string_lossy().to_string(), cwd: "/repo/demo".to_string(), modified: modified.to_rfc3339(), message_count: 2 }]);

        let date = modified.format("%Y-%m-%d").to_string();
        let point = stats.heatmap_data.iter().find(|point| point.date == date).expect("heatmap point");

        assert_eq!(point.total_tokens, 40);
        assert!(point.total_cost > 0.0);
        assert_eq!(stats.token_details.total_input, 10);
        assert_eq!(stats.token_details.total_output, 30);
        assert!(stats.token_details.total_cost > 0.0);
    }
}
