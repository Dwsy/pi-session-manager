use crate::models::{AgentStats, SubagentRunInfo, SubagentSummary};
use crate::sqlite_cache;
use chrono::{DateTime, TimeZone, Utc};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tracing::warn;

/// Parse a single meta.json file content into a `SubagentRunInfo`.
///
/// Uses `serde_json::Value` for resilient parsing: missing or malformed fields
/// fall back to 0 / "unknown" instead of failing the whole scan.
/// Returns `None` only if the content is not valid JSON at all.
pub fn parse_meta_json(content: &str) -> Option<SubagentRunInfo> {
    let v: serde_json::Value = serde_json::from_str(content).ok()?;

    let usage = v.get("usage").cloned().unwrap_or(serde_json::Value::Null);

    Some(SubagentRunInfo {
        run_id: v
            .get("runId")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .to_string(),
        agent: v
            .get("agent")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .to_string(),
        model: v
            .get("model")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .to_string(),
        exit_code: v.get("exitCode").and_then(|x| x.as_i64()).unwrap_or(0) as i32,
        cost: usage.get("cost").and_then(|x| x.as_f64()).unwrap_or(0.0),
        input_tokens: usage.get("input").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
        output_tokens: usage.get("output").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
        cache_read_tokens: usage.get("cacheRead").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
        cache_write_tokens: usage
            .get("cacheWrite")
            .and_then(|x| x.as_u64())
            .unwrap_or(0) as usize,
        duration_ms: v.get("durationMs").and_then(|x| x.as_u64()).unwrap_or(0),
        tool_count: v.get("toolCount").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
        timestamp: v.get("timestamp").and_then(|x| x.as_i64()).unwrap_or(0),
        turns: usage.get("turns").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
    })
}

/// Aggregate a slice of `SubagentRunInfo` into a `SubagentSummary`.
pub fn aggregate_runs(runs: &[SubagentRunInfo]) -> SubagentSummary {
    let mut total_cost = 0.0f64;
    let mut total_tokens = 0usize;
    let mut runs_by_agent: HashMap<String, AgentStats> = HashMap::new();
    let mut runs_by_model: HashMap<String, f64> = HashMap::new();

    for run in runs {
        total_cost += run.cost;
        let tokens = run.input_tokens + run.output_tokens;
        total_tokens += tokens;

        let agent_stats = runs_by_agent
            .entry(run.agent.clone())
            .or_insert(AgentStats {
                runs: 0,
                cost: 0.0,
                tokens: 0,
            });
        agent_stats.runs += 1;
        agent_stats.cost += run.cost;
        agent_stats.tokens += tokens;

        *runs_by_model.entry(run.model.clone()).or_insert(0.0) += run.cost;
    }

    SubagentSummary {
        total_cost,
        total_runs: runs.len(),
        total_tokens,
        runs_by_agent,
        runs_by_model,
    }
}

/// Scan `subagent-artifacts/*_meta.json` files across all given session directories.
///
/// For each directory, checks for a `subagent-artifacts/` subdirectory, reads all
/// files whose name ends with `_meta.json`, and uses the SQLite cache to avoid
/// re-parsing unchanged files. Returns an aggregated `SubagentSummary`.
///
/// Accepts an optional SQLite connection to reuse the caller's connection instead
/// of opening a second one.
pub fn scan_subagent_artifacts(
    session_dirs: &[PathBuf],
    conn: Option<&rusqlite::Connection>,
) -> SubagentSummary {
    let mut all_runs: Vec<SubagentRunInfo> = Vec::new();

    for dir in session_dirs {
        let artifacts_dir = dir.join("subagent-artifacts");
        if !artifacts_dir.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(&artifacts_dir) {
            Ok(e) => e,
            Err(err) => {
                warn!(
                    "Failed to read subagent-artifacts dir {:?}: {}",
                    artifacts_dir, err
                );
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();

            if !filename.ends_with("_meta.json") {
                continue;
            }

            // Get file modification time
            let file_mtime: Option<DateTime<Utc>> = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let dur = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                    Utc.timestamp_opt(dur.as_secs() as i64, 0)
                        .single()
                        .unwrap_or_else(Utc::now)
                });

            let path_str = path.to_string_lossy().to_string();

            // Check cache
            if let (Some(mtime), Some(c)) = (file_mtime, conn) {
                if let Ok(Some((cached_mtime, run_info))) =
                    sqlite_cache::get_cached_subagent_meta(c, &path_str)
                {
                    if cached_mtime >= mtime {
                        all_runs.push(run_info);
                        continue;
                    }
                }
            }

            // Cache miss or stale — read and parse the file
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(err) => {
                    warn!("Failed to read meta.json {:?}: {}", path, err);
                    continue;
                }
            };

            match parse_meta_json(&content) {
                Some(run_info) => {
                    // Write to cache if we have a connection and mtime
                    if let (Some(mtime), Some(c)) = (file_mtime, conn) {
                        if let Err(err) =
                            sqlite_cache::upsert_subagent_meta(c, &path_str, mtime, &run_info)
                        {
                            warn!("Failed to cache subagent meta {:?}: {}", path, err);
                        }
                    }
                    all_runs.push(run_info);
                }
                None => {
                    warn!("Failed to parse meta.json (invalid JSON): {:?}", path);
                }
            }
        }
    }

    aggregate_runs(&all_runs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_meta_json_full() {
        let json = r#"{
            "runId": "21b1642e",
            "agent": "worker",
            "model": "claude-opus-4-6:minimal",
            "exitCode": 0,
            "usage": { "input": 13, "output": 1678, "cacheRead": 127270, "cacheWrite": 16527, "cost": 0.208, "turns": 11 },
            "durationMs": 44428,
            "toolCount": 13,
            "timestamp": 1771087154366
        }"#;

        let info = parse_meta_json(json).expect("should parse");
        assert_eq!(info.run_id, "21b1642e");
        assert_eq!(info.agent, "worker");
        assert_eq!(info.model, "claude-opus-4-6:minimal");
        assert_eq!(info.exit_code, 0);
        assert!((info.cost - 0.208).abs() < 1e-9);
        assert_eq!(info.input_tokens, 13);
        assert_eq!(info.output_tokens, 1678);
        assert_eq!(info.cache_read_tokens, 127270);
        assert_eq!(info.cache_write_tokens, 16527);
        assert_eq!(info.duration_ms, 44428);
        assert_eq!(info.tool_count, 13);
        assert_eq!(info.timestamp, 1771087154366);
        assert_eq!(info.turns, 11); // @tintinweb/pi-subagents compatibility
    }

    #[test]
    fn parse_meta_json_missing_fields_use_defaults() {
        let json = r#"{"runId": "abc"}"#;
        let info = parse_meta_json(json).expect("should parse with defaults");
        assert_eq!(info.run_id, "abc");
        assert_eq!(info.agent, "unknown");
        assert_eq!(info.model, "unknown");
        assert_eq!(info.cost, 0.0);
        assert_eq!(info.input_tokens, 0);
        assert_eq!(info.output_tokens, 0);
        assert_eq!(info.turns, 0); // turns defaults to 0 when missing
    }

    #[test]
    fn parse_meta_json_invalid_returns_none() {
        assert!(parse_meta_json("not json at all").is_none());
        assert!(parse_meta_json("").is_none());
    }

    #[test]
    fn aggregate_runs_totals() {
        let runs = vec![
            SubagentRunInfo {
                run_id: "a".to_string(),
                agent: "worker".to_string(),
                model: "opus".to_string(),
                exit_code: 0,
                cost: 0.10,
                input_tokens: 100,
                output_tokens: 200,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                duration_ms: 1000,
                tool_count: 5,
                timestamp: 0,
                turns: 3,
            },
            SubagentRunInfo {
                run_id: "b".to_string(),
                agent: "scout".to_string(),
                model: "haiku".to_string(),
                exit_code: 0,
                cost: 0.05,
                input_tokens: 50,
                output_tokens: 75,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                duration_ms: 500,
                tool_count: 2,
                timestamp: 0,
                turns: 2,
            },
            SubagentRunInfo {
                run_id: "c".to_string(),
                agent: "worker".to_string(),
                model: "opus".to_string(),
                exit_code: 0,
                cost: 0.20,
                input_tokens: 200,
                output_tokens: 300,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                duration_ms: 2000,
                tool_count: 8,
                timestamp: 0,
                turns: 5,
            },
        ];

        let summary = aggregate_runs(&runs);
        assert_eq!(summary.total_runs, 3);
        assert!((summary.total_cost - 0.35).abs() < 1e-9);
        assert_eq!(summary.total_tokens, 925); // (100+200) + (50+75) + (200+300)

        let worker = summary.runs_by_agent.get("worker").expect("worker stats");
        assert_eq!(worker.runs, 2);
        assert!((worker.cost - 0.30).abs() < 1e-9);
        assert_eq!(worker.tokens, 800); // (100+200) + (200+300)

        let scout = summary.runs_by_agent.get("scout").expect("scout stats");
        assert_eq!(scout.runs, 1);

        assert!((summary.runs_by_model.get("opus").copied().unwrap_or(0.0) - 0.30).abs() < 1e-9);
        assert!((summary.runs_by_model.get("haiku").copied().unwrap_or(0.0) - 0.05).abs() < 1e-9);
    }
}
