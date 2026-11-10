use anyhow::{anyhow, Result};
use colored::*;
use pi_session_manager::core::parser::{parse_session_details, SessionDetails};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsSummary {
    pub target: String,
    pub total_sessions: usize,
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub tool_results: usize,
    pub custom_messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub models: Vec<String>,
    pub model_breakdown: HashMap<String, ModelBreakdown>,
    pub first_message_time: Option<String>,
    pub last_message_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelBreakdown {
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub cost: f64,
}

#[derive(Debug, Clone, Default)]
pub struct StatsOptions {
    pub target: Option<String>,
    pub cwd: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub json: bool,
}

pub fn summarize_details(target_label: &str, session_count: usize, details: &SessionDetails) -> StatsSummary {
    let mut model_breakdown = HashMap::new();
    for (model, usage) in &details.model_usage {
        model_breakdown.insert(
            model.clone(),
            ModelBreakdown {
                messages: usage.messages,
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_read_tokens: usage.cache_read_tokens,
                cache_write_tokens: usage.cache_write_tokens,
                cost: usage.cost,
            },
        );
    }

    StatsSummary {
        target: target_label.to_string(),
        total_sessions: session_count,
        total_messages: details.total_messages(),
        user_messages: details.user_messages,
        assistant_messages: details.assistant_messages,
        tool_results: details.tool_results,
        custom_messages: details.custom_messages,
        input_tokens: details.input_tokens,
        output_tokens: details.output_tokens,
        cache_read_tokens: details.cache_read_tokens,
        cache_write_tokens: details.cache_write_tokens,
        total_tokens: details.total_tokens(),
        total_cost: details.total_cost(),
        models: details.models.clone(),
        model_breakdown,
        first_message_time: details.first_message_time.map(|t| t.to_rfc3339()),
        last_message_time: details.last_message_time.map(|t| t.to_rfc3339()),
    }
}

pub fn stats_from_file(path: &Path) -> Result<StatsSummary> {
    let content = fs::read_to_string(path)
        .map_err(|e| anyhow!("Failed to read session file {}: {}", path.display(), e))?;
    let details = parse_session_details(&content);
    Ok(summarize_details(&path.display().to_string(), 1, &details))
}

pub fn stats_from_directory(dir_path: &Path) -> Result<StatsSummary> {
    let mut total_details = SessionDetails::default();
    let mut session_count = 0;

    fn walk_jsonl(dir: &Path, count: &mut usize, cum_details: &mut SessionDetails) -> Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let _ = walk_jsonl(&path, count, cum_details);
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
                if let Ok(content) = fs::read_to_string(&path) {
                    let d = parse_session_details(&content);
                    cum_details.merge_delta(&d);
                    *count += 1;
                }
            }
        }
        Ok(())
    }

    walk_jsonl(dir_path, &mut session_count, &mut total_details)?;
    Ok(summarize_details(&dir_path.display().to_string(), session_count, &total_details))
}

pub async fn execute_stats(opts: StatsOptions) -> Result<()> {
    let summary = if let Some(target) = &opts.target {
        let p = Path::new(target);
        if p.is_file() {
            stats_from_file(p)?
        } else if p.is_dir() {
            stats_from_directory(p)?
        } else {
            return Err(anyhow!("Target path not found: {}", target));
        }
    } else {
        // Query local sessions directory by default
        let sessions_dir = pi_session_manager::paths::pi_agent_sessions_dir()
            .map_err(|e| anyhow!("Failed to locate sessions directory: {e}"))?;
        if sessions_dir.exists() {
            stats_from_directory(&sessions_dir)?
        } else {
            return Err(anyhow!("No active sessions directory found at: {}", sessions_dir.display()));
        }
    };

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&summary)?);
        return Ok(());
    }

    println!("{}", format!("📊 Session Statistics: {}", summary.target).green().bold());
    println!("{}", "═════════════════════════════════════════════════════".blue());
    println!("  Sessions Analyzed:  {}", summary.total_sessions.to_string().yellow().bold());
    println!("  Total Messages:     {}", summary.total_messages.to_string().cyan());
    println!(
        "  Message Breakdown:  {} user, {} assistant, {} tool results",
        summary.user_messages.to_string().cyan(),
        summary.assistant_messages.to_string().cyan(),
        summary.tool_results.to_string().cyan()
    );
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    println!(
        "  Total Tokens:       {}",
        format!("{}", summary.total_tokens).yellow().bold()
    );
    println!(
        "  Token Details:      in: {} | out: {} | cache_read: {} | cache_write: {}",
        summary.input_tokens, summary.output_tokens, summary.cache_read_tokens, summary.cache_write_tokens
    );
    println!(
        "  Estimated Cost:     {}",
        format!("${:.4}", summary.total_cost).green().bold()
    );

    if !summary.model_breakdown.is_empty() {
        println!("{}", "─────────────────────────────────────────────────────".dimmed());
        println!("{}", "  Models Used:".bold());
        for (model, u) in &summary.model_breakdown {
            println!(
                "    • {:<32} {:>5} msgs | {:>10} toks | ${:.4}",
                model.cyan(),
                u.messages,
                format!("{}", u.input_tokens + u.output_tokens),
                u.cost
            );
        }
    }

    if let (Some(first), Some(last)) = (&summary.first_message_time, &summary.last_message_time) {
        println!("{}", "─────────────────────────────────────────────────────".dimmed());
        println!("  Time Span:          {}  ──►  {}", first.dimmed(), last.dimmed());
    }
    println!("{}", "═════════════════════════════════════════════════════".blue());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stats_from_synthetic_content() {
        let content = r#"{"type":"session","id":"sess-1","created":"2026-04-01T10:00:00Z"}
{"type":"message","id":"m1","timestamp":"2026-04-01T10:01:00Z","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}
{"type":"message","id":"m2","timestamp":"2026-04-01T10:02:00Z","message":{"role":"assistant","model":"gpt-4o","provider":"openai","content":[{"type":"text","text":"world"}],"usage":{"input":100,"output":50,"cost":{"input":0.001,"output":0.002}}}}
"#;
        let details = parse_session_details(content);
        let summary = summarize_details("test", 1, &details);
        assert_eq!(summary.total_messages, 2);
        assert_eq!(summary.user_messages, 1);
        assert_eq!(summary.assistant_messages, 1);
        assert_eq!(summary.input_tokens, 100);
        assert_eq!(summary.output_tokens, 50);
        assert_eq!(summary.total_tokens, 150);
        assert_eq!(summary.models.len(), 1);
        assert!(summary.model_breakdown.contains_key("openai/gpt-4o"));
    }
}
