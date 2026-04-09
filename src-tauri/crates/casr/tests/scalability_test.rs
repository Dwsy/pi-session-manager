//! Scalability regression test for discovery + provider readers.
//!
//! This test uses deterministic synthetic corpora and emits machine-readable
//! metrics in stdout for CI trend tracking.

use std::{
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use casr::{
    discovery::{DetectionResult, ProviderRegistry},
    error::CasrError,
    model::CanonicalSession,
    model::MessageRole,
    providers::{
        Provider, WriteOptions, WrittenSession, claude_code::ClaudeCode, codex::Codex,
        gemini::Gemini,
    },
};
use walkdir::WalkDir;

const FILES_PER_PROVIDER: usize = 400;
const LARGE_MESSAGE_COUNT: usize = 1200;
const DISCOVERY_FOUND_BUDGET_MS: u128 = 4000;
const DISCOVERY_MISS_BUDGET_MS: u128 = 4000;
const MIN_READER_THROUGHPUT_MSG_PER_SEC: f64 = 150.0;

#[derive(Clone)]
struct ScanProvider {
    name: String,
    slug: String,
    alias: String,
    roots: Vec<PathBuf>,
}

impl ScanProvider {
    fn new(name: &str, slug: &str, alias: &str, roots: Vec<PathBuf>) -> Self {
        Self {
            name: name.to_string(),
            slug: slug.to_string(),
            alias: alias.to_string(),
            roots,
        }
    }
}

impl Provider for ScanProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn slug(&self) -> &str {
        &self.slug
    }

    fn cli_alias(&self) -> &str {
        &self.alias
    }

    fn detect(&self) -> DetectionResult {
        DetectionResult {
            installed: true,
            version: None,
            evidence: self
                .roots
                .iter()
                .map(|r| format!("scan-root={}", r.display()))
                .collect(),
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        self.roots.clone()
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        for root in &self.roots {
            for entry in WalkDir::new(root)
                .max_depth(6)
                .into_iter()
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                if path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|stem| stem == session_id)
                    .unwrap_or(false)
                {
                    return Some(path.to_path_buf());
                }
            }
        }
        None
    }

    fn read_session(&self, _path: &Path) -> anyhow::Result<CanonicalSession> {
        Err(anyhow::anyhow!("scan provider does not parse sessions"))
    }

    fn write_session(
        &self,
        _session: &CanonicalSession,
        _opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        Err(anyhow::anyhow!("scan provider does not write sessions"))
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("{} --resume {session_id}", self.alias)
    }
}

fn seed_claude_corpus(projects_dir: &Path, target_id: &str) {
    for i in 0..FILES_PER_PROVIDER {
        let dir = projects_dir.join(format!("proj-{i:04}"));
        fs::create_dir_all(&dir).expect("create claude project dir");
        let session_id = if i == FILES_PER_PROVIDER - 1 {
            target_id.to_string()
        } else {
            format!("cc-noise-{i:04}")
        };
        let path = dir.join(format!("{session_id}.jsonl"));
        let entry = serde_json::json!({
            "type": "user",
            "sessionId": session_id,
            "cwd": "/tmp/ws",
            "timestamp": "2026-02-09T00:00:00Z",
            "message": {
                "role": "user",
                "content": "seed message",
                "model": "mock-model"
            }
        });
        fs::write(path, format!("{entry}\n")).expect("write claude seed file");
    }
}

fn seed_codex_corpus(sessions_dir: &Path) {
    for i in 0..FILES_PER_PROVIDER {
        let day_dir = sessions_dir.join(format!("2026/02/{:02}", (i % 28) + 1));
        fs::create_dir_all(&day_dir).expect("create codex date dir");
        let path = day_dir.join(format!(
            "rollout-2026-02-09T00-00-00-cod-noise-{i:04}.jsonl"
        ));
        let lines = [
            serde_json::json!({
                "type": "session_meta",
                "timestamp": 1_739_059_200.0,
                "payload": {
                    "id": format!("cod-noise-{i:04}"),
                    "cwd": "/tmp/ws"
                }
            }),
            serde_json::json!({
                "type": "event_msg",
                "timestamp": 1_739_059_201.0,
                "payload": {
                    "type": "user_message",
                    "message": "seed user"
                }
            }),
        ];
        let payload = lines
            .iter()
            .map(serde_json::Value::to_string)
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(path, payload).expect("write codex seed file");
    }
}

fn seed_gemini_corpus(tmp_dir: &Path) {
    for i in 0..FILES_PER_PROVIDER {
        let hash = format!("hash-{i:04}");
        let chats = tmp_dir.join(hash).join("chats");
        fs::create_dir_all(&chats).expect("create gemini chats dir");
        let session_id = format!("gmi-noise-{i:04}-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        let prefix = &session_id[..8];
        let path = chats.join(format!("session-2026-02-09T00-00-{prefix}.json"));
        let root = serde_json::json!({
            "sessionId": session_id,
            "startTime": "2026-02-09T00:00:00Z",
            "lastUpdated": "2026-02-09T00:00:10Z",
            "messages": [
                {"type":"user","content":"seed user","timestamp":"2026-02-09T00:00:00Z"},
                {"type":"model","content":"seed assistant","timestamp":"2026-02-09T00:00:01Z"}
            ]
        });
        fs::write(
            path,
            serde_json::to_vec(&root).expect("serialize gemini seed"),
        )
        .expect("write gemini seed file");
    }
}

fn write_large_claude_file(path: &Path, session_id: &str, message_count: usize) {
    let mut lines = Vec::with_capacity(message_count);
    for i in 0..message_count {
        let is_user = i % 2 == 0;
        let role = if is_user { "user" } else { "assistant" };
        let ts = format!("2026-02-09T00:{:02}:{:02}Z", (i / 60) % 60, i % 60);
        lines.push(serde_json::json!({
            "type": role,
            "sessionId": session_id,
            "cwd": "/tmp/ws",
            "timestamp": ts,
            "message": {
                "role": role,
                "content": format!("claude message {i}"),
                "model": "perf-model"
            }
        }));
    }
    let payload = lines
        .iter()
        .map(serde_json::Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(path, payload).expect("write large claude session");
}

fn write_large_codex_file(path: &Path, session_id: &str, message_count: usize) {
    let mut lines = Vec::with_capacity(message_count + 1);
    lines.push(serde_json::json!({
        "type": "session_meta",
        "timestamp": 1_739_059_200.0,
        "payload": {"id": session_id, "cwd": "/tmp/ws"}
    }));

    for i in 0..message_count {
        let ts = 1_739_059_200.0 + (i as f64);
        if i % 2 == 0 {
            lines.push(serde_json::json!({
                "type": "event_msg",
                "timestamp": ts,
                "payload": {"type":"user_message","message":format!("codex user {i}")}
            }));
        } else {
            lines.push(serde_json::json!({
                "type": "response_item",
                "timestamp": ts,
                "payload": {
                    "role": "assistant",
                    "content": [{"type":"input_text","text":format!("codex assistant {i}")}]
                }
            }));
        }
    }

    let payload = lines
        .iter()
        .map(serde_json::Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(path, payload).expect("write large codex session");
}

fn write_large_gemini_file(path: &Path, session_id: &str, message_count: usize) {
    let messages = (0..message_count)
        .map(|i| {
            let role = if i % 2 == 0 { "user" } else { "model" };
            serde_json::json!({
                "type": role,
                "content": format!("gemini message {i}"),
                "timestamp": format!("2026-02-09T00:{:02}:{:02}Z", (i / 60) % 60, i % 60),
            })
        })
        .collect::<Vec<_>>();

    let root = serde_json::json!({
        "sessionId": session_id,
        "startTime": "2026-02-09T00:00:00Z",
        "lastUpdated": "2026-02-09T01:00:00Z",
        "messages": messages
    });
    fs::write(
        path,
        serde_json::to_vec(&root).expect("serialize gemini payload"),
    )
    .expect("write large gemini session");
}

fn measure_reader_throughput(
    provider_name: &str,
    reader: &dyn Provider,
    session_path: &Path,
    expected_messages: usize,
) -> serde_json::Value {
    let start = Instant::now();
    let parsed = reader
        .read_session(session_path)
        .unwrap_or_else(|e| panic!("{provider_name} read failed: {e}"));
    let elapsed = start.elapsed();
    assert_eq!(
        parsed.messages.len(),
        expected_messages,
        "{provider_name} parsed unexpected message count"
    );

    let elapsed_secs = elapsed.as_secs_f64();
    let throughput = expected_messages as f64 / elapsed_secs.max(1e-9);
    assert!(
        throughput >= MIN_READER_THROUGHPUT_MSG_PER_SEC,
        "{provider_name} throughput too low: {throughput:.2} msg/s (budget {MIN_READER_THROUGHPUT_MSG_PER_SEC:.2})"
    );

    serde_json::json!({
        "provider": provider_name,
        "messages": expected_messages,
        "elapsed_ms": elapsed.as_millis(),
        "throughput_msg_per_sec": throughput,
    })
}

#[test]
fn discovery_and_reader_scalability_regression() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let claude_projects = tmp.path().join("claude-projects");
    let codex_sessions = tmp.path().join("codex-sessions");
    let gemini_tmp = tmp.path().join("gemini-tmp");
    fs::create_dir_all(&claude_projects).expect("create claude projects root");
    fs::create_dir_all(&codex_sessions).expect("create codex sessions root");
    fs::create_dir_all(&gemini_tmp).expect("create gemini tmp root");

    let target_session_id = "perf-target-session";
    seed_claude_corpus(&claude_projects, target_session_id);
    seed_codex_corpus(&codex_sessions);
    seed_gemini_corpus(&gemini_tmp);

    let registry = ProviderRegistry::new(vec![
        Box::new(ScanProvider::new(
            "scan-claude",
            "scan-claude",
            "scc",
            vec![claude_projects.clone()],
        )),
        Box::new(ScanProvider::new(
            "scan-codex",
            "scan-codex",
            "scod",
            vec![codex_sessions.clone()],
        )),
        Box::new(ScanProvider::new(
            "scan-gemini",
            "scan-gemini",
            "sgmi",
            vec![gemini_tmp.clone()],
        )),
    ]);

    let start_found = Instant::now();
    let resolved = registry
        .resolve_session(target_session_id, None)
        .expect("target session should resolve");
    let found_ms = start_found.elapsed().as_millis();
    assert_eq!(resolved.provider.slug(), "scan-claude");
    assert!(
        found_ms <= DISCOVERY_FOUND_BUDGET_MS,
        "discovery(found) budget exceeded: {found_ms}ms > {DISCOVERY_FOUND_BUDGET_MS}ms"
    );

    let start_miss = Instant::now();
    let missing = registry.resolve_session("perf-missing-session-id", None);
    let miss_ms = start_miss.elapsed().as_millis();
    assert!(
        matches!(missing, Err(CasrError::SessionNotFound { .. })),
        "missing session should produce SessionNotFound"
    );
    assert!(
        miss_ms <= DISCOVERY_MISS_BUDGET_MS,
        "discovery(miss) budget exceeded: {miss_ms}ms > {DISCOVERY_MISS_BUDGET_MS}ms"
    );

    let perf_dir = tmp.path().join("reader-perf");
    fs::create_dir_all(&perf_dir).expect("create perf dir");

    let claude_file = perf_dir.join("claude-large.jsonl");
    let codex_file = perf_dir.join("codex-large.jsonl");
    let gemini_file = perf_dir.join("gemini-large.json");

    write_large_claude_file(&claude_file, "claude-large-session", LARGE_MESSAGE_COUNT);
    write_large_codex_file(&codex_file, "codex-large-session", LARGE_MESSAGE_COUNT);
    write_large_gemini_file(&gemini_file, "gemini-large-session", LARGE_MESSAGE_COUNT);

    let claude = ClaudeCode;
    let codex = Codex;
    let gemini = Gemini;

    let reader_metrics = vec![
        measure_reader_throughput("claude-code", &claude, &claude_file, LARGE_MESSAGE_COUNT),
        measure_reader_throughput("codex", &codex, &codex_file, LARGE_MESSAGE_COUNT),
        measure_reader_throughput("gemini", &gemini, &gemini_file, LARGE_MESSAGE_COUNT),
    ];

    let metrics = serde_json::json!({
        "suite": "scalability_regression",
        "files_per_provider": FILES_PER_PROVIDER,
        "large_message_count": LARGE_MESSAGE_COUNT,
        "min_reader_throughput_msg_per_sec": MIN_READER_THROUGHPUT_MSG_PER_SEC,
        "discovery": {
            "found_elapsed_ms": found_ms,
            "found_budget_ms": DISCOVERY_FOUND_BUDGET_MS,
            "miss_elapsed_ms": miss_ms,
            "miss_budget_ms": DISCOVERY_MISS_BUDGET_MS,
            "resolved_provider": resolved.provider.slug(),
            "resolved_path": resolved.path,
        },
        "readers": reader_metrics,
    });

    if let Ok(path) = std::env::var("CASR_PERF_METRICS_FILE") {
        fs::write(
            PathBuf::from(path),
            serde_json::to_vec_pretty(&metrics).expect("serialize perf metrics"),
        )
        .expect("write perf metrics artifact");
    }

    println!(
        "SCALABILITY_METRICS:{}",
        serde_json::to_string(&metrics).expect("serialize metrics line")
    );

    // Sanity-check parsed role normalization is still user/assistant alternating.
    let parsed_claude = claude
        .read_session(&claude_file)
        .expect("re-read claude file for role sanity");
    assert_eq!(parsed_claude.messages[0].role, MessageRole::User);
    assert_eq!(parsed_claude.messages[1].role, MessageRole::Assistant);
}
