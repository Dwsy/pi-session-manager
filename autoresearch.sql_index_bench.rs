use pi_session_manager::commands::full_text_search;
use pi_session_manager::config::Config;
use pi_session_manager::scanner;
use pi_session_manager::sqlite_cache;
use std::env;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy)]
struct BenchArgs {
    runs: usize,
    sessions: usize,
    messages_per_session: usize,
    page_size: usize,
}

impl Default for BenchArgs {
    fn default() -> Self {
        Self {
            runs: 5,
            sessions: 180,
            messages_per_session: 18,
            page_size: 20,
        }
    }
}

#[derive(Clone, Copy)]
struct QueryCase {
    label: &'static str,
    query: &'static str,
    role_filter: &'static str,
    project_path: Option<&'static str>,
    match_mode: Option<&'static str>,
    page: usize,
}

#[derive(Clone, Copy)]
struct RunMetrics {
    init_ms: f64,
    ingest_ms: f64,
    search_ms: f64,
    total_ms: f64,
    total_hits: usize,
}

struct EnvVarGuard {
    key: &'static str,
    original: Option<OsString>,
}

impl EnvVarGuard {
    fn set_path(key: &'static str, value: &Path) -> Self {
        let original = env::var_os(key);
        env::set_var(key, value);
        Self { key, original }
    }
}

impl Drop for EnvVarGuard {
    fn drop(&mut self) {
        if let Some(value) = &self.original {
            env::set_var(self.key, value);
        } else {
            env::remove_var(self.key);
        }
    }
}

fn boxed_error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(io::Error::other(message.into()))
}

fn parse_args() -> Result<BenchArgs, Box<dyn std::error::Error>> {
    let mut args = BenchArgs::default();
    let mut iter = env::args().skip(1);

    while let Some(flag) = iter.next() {
        match flag.as_str() {
            "--runs" => {
                let value = iter
                    .next()
                    .ok_or_else(|| boxed_error("missing value for --runs"))?;
                args.runs = value.parse()?;
            }
            "--sessions" => {
                let value = iter
                    .next()
                    .ok_or_else(|| boxed_error("missing value for --sessions"))?;
                args.sessions = value.parse()?;
            }
            "--messages" => {
                let value = iter
                    .next()
                    .ok_or_else(|| boxed_error("missing value for --messages"))?;
                args.messages_per_session = value.parse()?;
            }
            "--page-size" => {
                let value = iter
                    .next()
                    .ok_or_else(|| boxed_error("missing value for --page-size"))?;
                args.page_size = value.parse()?;
            }
            other => {
                return Err(boxed_error(format!("unknown argument: {other}")));
            }
        }
    }

    if args.runs == 0 || args.sessions == 0 || args.messages_per_session == 0 || args.page_size == 0 {
        return Err(boxed_error("all numeric benchmark arguments must be > 0"));
    }

    Ok(args)
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn unique_root(run_index: usize) -> PathBuf {
    env::temp_dir().join(format!(
        "pi-session-manager-sql-index-bench-{}-{}-{}",
        process::id(),
        now_millis(),
        run_index
    ))
}

fn build_queries() -> [QueryCase; 5] {
    [
        QueryCase {
            label: "common_fts",
            query: "sqlite index",
            role_filter: "all",
            project_path: None,
            match_mode: Some("all"),
            page: 0,
        },
        QueryCase {
            label: "phrase_fts",
            query: "\"vector cache\"",
            role_filter: "all",
            project_path: None,
            match_mode: Some("any"),
            page: 0,
        },
        QueryCase {
            label: "assistant_filter",
            query: "latency budget",
            role_filter: "assistant",
            project_path: None,
            match_mode: Some("all"),
            page: 0,
        },
        QueryCase {
            label: "project_filter",
            query: "tokio async",
            role_filter: "all",
            project_path: Some("/workspace/project-b"),
            match_mode: Some("all"),
            page: 0,
        },
        QueryCase {
            label: "paged_query",
            query: "search performance",
            role_filter: "user",
            project_path: None,
            match_mode: Some("all"),
            page: 1,
        },
    ]
}

fn write_session_file(
    path: &Path,
    session_idx: usize,
    messages_per_session: usize,
    cwd: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut file = File::create(path)?;
    let session_id = format!("session-{session_idx:04}");

    writeln!(
        file,
        "{{\"type\":\"session\",\"version\":3,\"id\":\"{session_id}\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"cwd\":\"{cwd}\"}}"
    )?;

    if session_idx % 6 == 0 {
        writeln!(
            file,
            "{{\"type\":\"session_info\",\"name\":\"SQL Bench Session {session_idx}\"}}"
        )?;
    }

    let project_tag = cwd
        .rsplit('/')
        .next()
        .ok_or_else(|| boxed_error("missing project tag in cwd"))?;

    for message_idx in 0..messages_per_session {
        let role = if message_idx % 2 == 0 {
            "user"
        } else {
            "assistant"
        };
        let role_phrase = if role == "user" {
            "user prompt"
        } else {
            "assistant synthesis"
        };
        let phrase = if session_idx % 2 == 0 {
            "vector cache"
        } else {
            "segment ranking"
        };
        let runtime = if cwd.ends_with("project-b") || session_idx % 3 == 0 {
            "tokio async runtime"
        } else {
            "axum service pipeline"
        };
        let latency = if message_idx % 3 == 0 {
            "latency budget"
        } else {
            "throughput steady"
        };
        let rarity = match session_idx % 4 {
            0 => "rare-orchid",
            1 => "rare-saffron",
            2 => "rare-cerulean",
            _ => "rare-vermilion",
        };
        let text = format!(
            "{role_phrase} session {session_idx} message {message_idx} sqlite index search performance {phrase} {runtime} {latency} {project_tag} {rarity} retrieval benchmark"
        );
        let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
        let minute = (message_idx / 60) % 60;
        let second = message_idx % 60;

        writeln!(
            file,
            "{{\"type\":\"message\",\"id\":\"{session_id}-msg-{message_idx:02}\",\"parentId\":null,\"timestamp\":\"2026-01-01T00:{minute:02}:{second:02}Z\",\"message\":{{\"role\":\"{role}\",\"content\":[{{\"type\":\"text\",\"text\":\"{escaped}\"}}]}}}}"
        )?;
    }

    Ok(())
}

fn prepare_dataset(
    root: &Path,
    sessions: usize,
    messages_per_session: usize,
) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let sessions_root = root.join("session-data");
    fs::create_dir_all(&sessions_root)?;

    let projects = [
        "/workspace/project-a",
        "/workspace/project-b",
        "/workspace/project-c",
    ];

    let mut paths = Vec::with_capacity(sessions);
    for session_idx in 0..sessions {
        let shard_dir = sessions_root.join(format!("day-{:02}", session_idx % 8));
        fs::create_dir_all(&shard_dir)?;

        let session_path = shard_dir.join(format!("session-{session_idx:04}.jsonl"));
        let cwd = projects[session_idx % projects.len()];
        write_session_file(&session_path, session_idx, messages_per_session, cwd)?;
        paths.push(session_path);
    }

    Ok(paths)
}

fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 1 {
        sorted[mid]
    } else {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    }
}

async fn run_once(
    run_index: usize,
    args: BenchArgs,
) -> Result<RunMetrics, Box<dyn std::error::Error>> {
    let root = unique_root(run_index);
    fs::create_dir_all(&root)?;

    let session_paths = prepare_dataset(&root, args.sessions, args.messages_per_session)?;
    let db_path = root.join("sessions.db");
    let _db_guard = EnvVarGuard::set_path("PPM_TEST_DB", &db_path);
    let _home_guard = EnvVarGuard::set_path("HOME", &root);

    let config = Config::default();

    let init_started = Instant::now();
    let conn = sqlite_cache::init_db_with_config(&config).map_err(boxed_error)?;
    let init_ms = init_started.elapsed().as_secs_f64() * 1000.0;

    let ingest_started = Instant::now();
    for session_path in &session_paths {
        let (session, entries) = scanner::parse_session_info(session_path).map_err(boxed_error)?;
        sqlite_cache::upsert_session(&mut conn, &session, session.modified, Some(&entries))
            .map_err(boxed_error)?;
    }
    let ingest_ms = ingest_started.elapsed().as_secs_f64() * 1000.0;
    drop(conn);

    let search_started = Instant::now();
    let mut total_hits = 0usize;
    for case in build_queries() {
        let response = full_text_search(
            case.query.to_string(),
            case.role_filter.to_string(),
            None,
            case.project_path.map(str::to_string),
            case.page,
            args.page_size,
            case.match_mode.map(str::to_string),
        )
        .await
        .map_err(boxed_error)?;

        if response.total_hits == 0 {
            return Err(boxed_error(format!(
                "benchmark query '{}' returned zero hits",
                case.label
            )));
        }
        total_hits += response.total_hits;
    }
    let search_ms = search_started.elapsed().as_secs_f64() * 1000.0;

    let total_ms = init_ms + ingest_ms + search_ms;

    let _ = fs::remove_dir_all(&root);

    Ok(RunMetrics {
        init_ms,
        ingest_ms,
        search_ms,
        total_ms,
        total_hits,
    })
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args()?;
    eprintln!(
        "sql_index_bench: runs={} sessions={} messages_per_session={} page_size={}",
        args.runs, args.sessions, args.messages_per_session, args.page_size
    );

    let mut all_runs = Vec::with_capacity(args.runs);
    for run_index in 0..args.runs {
        let metrics = run_once(run_index, args).await?;
        eprintln!(
            "run {} => init={:.3}ms ingest={:.3}ms search={:.3}ms total={:.3}ms hits={}",
            run_index + 1,
            metrics.init_ms,
            metrics.ingest_ms,
            metrics.search_ms,
            metrics.total_ms,
            metrics.total_hits
        );
        all_runs.push(metrics);
    }

    let init_values: Vec<f64> = all_runs.iter().map(|run| run.init_ms).collect();
    let ingest_values: Vec<f64> = all_runs.iter().map(|run| run.ingest_ms).collect();
    let search_values: Vec<f64> = all_runs.iter().map(|run| run.search_ms).collect();
    let total_values: Vec<f64> = all_runs.iter().map(|run| run.total_ms).collect();
    let total_hits = all_runs
        .first()
        .map(|run| run.total_hits)
        .ok_or_else(|| boxed_error("benchmark produced no runs"))?;

    println!("METRIC total_ms={:.3}", median(&total_values));
    println!("METRIC init_ms={:.3}", median(&init_values));
    println!("METRIC ingest_ms={:.3}", median(&ingest_values));
    println!("METRIC search_ms={:.3}", median(&search_values));
    println!("METRIC total_hits={}", total_hits);

    Ok(())
}
