#![allow(clippy::await_holding_lock)]
#![allow(clippy::type_complexity)]

use chrono::Utc;
use lazy_static::lazy_static;
use pi_session_manager::commands::full_text_search as backend_full_text_search;
use pi_session_manager::config::Config;
use pi_session_manager::scanner;
use pi_session_manager::sqlite_cache;
use pi_session_manager::FullTextSearchResponse;
use rusqlite::{params, Connection};
use std::env;
use std::fs;
use std::sync::Mutex;
use tempfile::tempdir;

lazy_static! {
    static ref TEST_DB_LOCK: Mutex<()> = Mutex::new(());
}

/// Helper: create a minimal session file with multiple messages
fn make_session_file(id: &str, cwd: &str, messages: &[(&str, &str)]) -> String {
    let header = format!(
        r#"{{"type":"session","version":3,"id":"{id}","timestamp":"2026-02-10T22:00:00Z","cwd":"{cwd}"}}"#
    );
    let mut lines = vec![header];
    for (i, (role, text)) in messages.iter().enumerate() {
        let entry_id = format!("{id}-msg{i}");
        let timestamp = format!("2026-02-10T22:00:{i:02}Z");
        // Escape backslashes and double quotes for JSON
        let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
        let msg = format!(
            r#"{{"type":"message","id":"{entry_id}","parentId":null,"timestamp":"{timestamp}","message":{{"role":"{role}","content":[{{"type":"text","text":"{escaped}"}}]}}}}"#
        );
        lines.push(msg);
    }
    lines.join("\n")
}

fn write_app_settings(include_thinking_in_search: bool) {
    pi_session_manager::settings_store::set(
        "app_settings",
        &serde_json::json!({
            "search": {
                "includeThinkingInSearch": include_thinking_in_search,
            }
        }),
    )
    .unwrap();
}

fn make_session_file_with_thinking(
    id: &str,
    cwd: &str,
    messages: &[(&str, &str, Option<&str>)],
) -> String {
    let header = format!(
        r#"{{"type":"session","version":3,"id":"{id}","timestamp":"2026-02-10T22:00:00Z","cwd":"{cwd}"}}"#
    );
    let mut lines = vec![header];
    for (i, (role, text, thinking)) in messages.iter().enumerate() {
        let entry_id = format!("{id}-msg{i}");
        let timestamp = format!("2026-02-10T22:00:{i:02}Z");
        let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
        let content = if let Some(thinking_text) = thinking {
            let escaped_thinking = thinking_text.replace('\\', "\\\\").replace('"', "\\\"");
            format!(
                r#"[{{"type":"text","text":"{escaped}"}},{{"type":"thinking","thinking":"{escaped_thinking}"}}]"#
            )
        } else {
            format!(r#"[{{"type":"text","text":"{escaped}"}}]"#)
        };
        let msg = format!(
            r#"{{"type":"message","id":"{entry_id}","parentId":null,"timestamp":"{timestamp}","message":{{"role":"{role}","content":{content}}}}}"#
        );
        lines.push(msg);
    }
    lines.join("\n")
}

/// Set up a test database with sessions and message entries
fn setup_test_db(sessions: &[(&str, &str, &[(&str, &str)])]) -> tempfile::TempDir {
    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();

    // Set HOME so config uses temp dir for DB
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", temp_dir.path());

    let config = Config::default();
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();

    for (id, cwd, messages) in sessions {
        let path = sessions_dir.join(format!("{id}.jsonl"));
        let content = make_session_file(id, cwd, messages);
        fs::write(&path, content).unwrap();

        let (session, entries) = scanner::parse_session_info(&path).unwrap();
        sqlite_cache::upsert_session(&mut conn, &session, Utc::now(), Some(&entries)).unwrap();
        // No separate upsert_message_entries; it's handled inside upsert_session
    }

    // Drop connection to avoid locks when full_text_search opens its own connection
    drop(conn);

    temp_dir
}

fn setup_test_db_from_raw_sessions(sessions: &[(&str, &str)]) -> tempfile::TempDir {
    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();
    env::set_var("HOME", temp_dir.path());

    let config = Config::default();
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();

    for (id, content) in sessions {
        let path = sessions_dir.join(format!("{id}.jsonl"));
        fs::write(&path, content).unwrap();
        let (session, entries) = scanner::parse_session_info(&path).unwrap();
        sqlite_cache::upsert_session(&mut conn, &session, Utc::now(), Some(&entries)).unwrap();
    }

    drop(conn);
    temp_dir
}

fn make_session_file_with_labels(id: &str, cwd: &str, entries: &[&str]) -> String {
    let header = format!(
        r#"{{"type":"session","version":3,"id":"{id}","timestamp":"2026-02-10T22:00:00Z","cwd":"{cwd}"}}"#
    );
    std::iter::once(header)
        .chain(entries.iter().map(|entry| entry.to_string()))
        .collect::<Vec<_>>()
        .join("\n")
}

fn make_session_file_with_explicit_timestamps(
    id: &str,
    cwd: &str,
    messages: &[(&str, &str, &str)],
) -> String {
    let header = format!(
        r#"{{"type":"session","version":3,"id":"{id}","timestamp":"{}","cwd":"{cwd}"}}"#,
        messages
            .first()
            .map(|(_, _, timestamp)| *timestamp)
            .unwrap_or("2026-02-10T22:00:00Z")
    );
    let mut lines = vec![header];
    for (i, (role, text, timestamp)) in messages.iter().enumerate() {
        let entry_id = format!("{id}-msg{i}");
        let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
        lines.push(format!(
            r#"{{"type":"message","id":"{entry_id}","parentId":null,"timestamp":"{timestamp}","message":{{"role":"{role}","content":[{{"type":"text","text":"{escaped}"}}]}}}}"#
        ));
    }
    lines.join("\n")
}

async fn full_text_search(
    query: String,
    role_filter: String,
    glob_pattern: Option<String>,
    project_path: Option<String>,
    page: usize,
    page_size: usize,
    match_mode: Option<String>,
    sort_order: Option<String>,
) -> Result<FullTextSearchResponse, String> {
    backend_full_text_search(
        query,
        role_filter,
        glob_pattern,
        project_path,
        page,
        page_size,
        match_mode,
        sort_order,
        None,
        None,
        None,
    )
    .await
}

async fn full_text_search_with_source_filter(
    query: String,
    role_filter: String,
    source_filter: Option<String>,
    page: usize,
    page_size: usize,
) -> Result<FullTextSearchResponse, String> {
    backend_full_text_search(
        query,
        role_filter,
        None,
        None,
        page,
        page_size,
        None,
        None,
        source_filter,
        None,
        None,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn full_text_search_with_scope(
    query: String,
    role_filter: String,
    glob_pattern: Option<String>,
    project_path: Option<String>,
    page: usize,
    page_size: usize,
    match_mode: Option<String>,
    sort_order: Option<String>,
    source_filter: Option<String>,
    from: Option<String>,
    to: Option<String>,
) -> Result<FullTextSearchResponse, String> {
    backend_full_text_search(
        query,
        role_filter,
        glob_pattern,
        project_path,
        page,
        page_size,
        match_mode,
        sort_order,
        source_filter,
        from,
        to,
    )
    .await
}

fn make_codex_session_file(id: &str, cwd: &str, user_text: &str) -> String {
    serde_json::json!([
        {
            "type": "session_meta",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "payload": { "id": id, "cwd": cwd }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{ "type": "input_text", "text": user_text }]
            }
        }
    ])
    .to_string()
}

#[tokio::test]
async fn test_full_text_search_command_basic() {
    // Acquire global test lock to prevent concurrent DB access
    let _lock = TEST_DB_LOCK.lock().unwrap();

    // Setup sessions
    let _temp_dir = setup_test_db(&[
        (
            "sess1",
            "/cwd1",
            &[
                ("user", "I like banana and apple"),
                ("assistant", "Here is a banana recipe"),
                ("user", "banana smoothie recipe"),
            ],
        ),
        (
            "sess2",
            "/cwd2",
            &[
                ("user", "How to learn Rust?"),
                (
                    "assistant",
                    "Rust is a systems programming language with ownership",
                ),
                ("user", "Is Rust safe?"),
                (
                    "assistant",
                    "Yes, Rust guarantees memory safety without garbage collection",
                ),
            ],
        ),
        (
            "sess3",
            "/cwd3",
            &[
                ("user", "How to use tokio?"),
                (
                    "assistant",
                    "Tokio is an async runtime for Rust. Use tokio::main.",
                ),
            ],
        ),
    ]);

    // Test 1: Search for "banana"
    let response: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(
        response.total_hits >= 1,
        "Expected at least 1 hit for 'banana'"
    );
    assert!(
        response.hits.iter().any(|h| h.session_id == "sess1"),
        "Expected sess1 to be in results"
    );
    assert!(response.hits.iter().all(|h| h.session_id == "sess1"));
    assert!(response.hits[0].score.is_finite());

    // Test 2: Search for "rust"
    let response: FullTextSearchResponse = full_text_search(
        "rust".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(response.total_hits >= 2);
    let sess_ids: Vec<String> = response.hits.iter().map(|h| h.session_id.clone()).collect();
    assert!(sess_ids.contains(&"sess2".to_string()));
    assert!(sess_ids.contains(&"sess3".to_string()));

    // Test 3: Role filter - user only on "banana"
    let response: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "user".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!response.hits.is_empty());
    assert!(response.hits.iter().all(|h| h.role == "user"));
    assert!(!response.hits.iter().any(|h| h.role == "assistant"));

    // Test 4: Role filter - assistant only on "banana"
    let response: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "assistant".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!response.hits.is_empty());
    assert!(response.hits.iter().all(|h| h.role == "assistant"));

    // Test 5: Empty query
    let response: FullTextSearchResponse = full_text_search(
        "".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(response.total_hits, 0);
    assert!(response.hits.is_empty());

    // Test 6: No match
    let response: FullTextSearchResponse = full_text_search(
        "xyznonexistent".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(response.total_hits, 0);
    assert!(response.hits.is_empty());

    // Test 7: Pagination
    let page0: FullTextSearchResponse = full_text_search(
        "rust".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        2,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(page0.total_hits >= 2);
    assert!(page0.hits.len() <= 2);

    let page1: FullTextSearchResponse = full_text_search(
        "rust".to_string(),
        "all".to_string(),
        None,
        None,
        1,
        2,
        None,
        None,
    )
    .await
    .unwrap();
    let total_from_pages = page0.hits.len() + page1.hits.len();
    assert!(total_from_pages <= page0.total_hits);

    // Test 8: Glob pattern
    let response: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "all".to_string(),
        Some("/cwd1/*".to_string()),
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(response
        .hits
        .iter()
        .all(|h| h.session_path.contains("/cwd1")));

    // Test 9: Score is positive
    let response: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    for hit in &response.hits {
        assert!(hit.score.is_finite());
    }

    println!("✅ All full_text_search command tests passed!");
}

#[tokio::test]
async fn test_full_text_search_excludes_external_sessions_by_default() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let temp_dir = tempdir().unwrap();
    let home = temp_dir.path();
    std::env::set_var("HOME", home);

    let pi_dir = home
        .join(".pi")
        .join("agent")
        .join("sessions")
        .join("local");
    std::fs::create_dir_all(&pi_dir).unwrap();
    let codex_dir = home
        .join(".codex")
        .join("sessions")
        .join("2026")
        .join("01")
        .join("01");
    std::fs::create_dir_all(&codex_dir).unwrap();

    let pi_path = pi_dir.join("pi-test.jsonl");
    std::fs::write(
        &pi_path,
        make_session_file(
            "pi-test",
            "/repo/pi",
            &[("user", "shared needle"), ("assistant", "pi answer")],
        ),
    )
    .unwrap();

    let codex_path = codex_dir.join("rollout-codex-test.jsonl");
    std::fs::write(
        &codex_path,
        [
            serde_json::json!({
                "type": "session_meta",
                "timestamp": "2026-01-01T00:00:00.000Z",
                "payload": { "id": "codex-test", "cwd": "/repo/codex" }
            }),
            serde_json::json!({
                "type": "response_item",
                "timestamp": "2026-01-01T00:00:01.000Z",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{ "type": "input_text", "text": "shared needle" }]
                }
            }),
        ]
        .iter()
        .map(|value| serde_json::to_string(value).unwrap())
        .collect::<Vec<_>>()
        .join("\n"),
    )
    .unwrap();

    let config = Config::default();
    pi_session_manager::config::save_config(&config).unwrap();
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();

    let (pi_session, pi_entries) = scanner::parse_session_info(&pi_path).unwrap();
    sqlite_cache::upsert_session(&mut conn, &pi_session, Utc::now(), Some(&pi_entries)).unwrap();

    let (codex_session, codex_entries) = scanner::parse_session_info(&codex_path).unwrap();
    sqlite_cache::upsert_session(&mut conn, &codex_session, Utc::now(), Some(&codex_entries))
        .unwrap();
    drop(conn);

    let response = full_text_search(
        "shared needle".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        20,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!response.hits.is_empty());
    let normalized_pi_root = pi_session_manager::paths::pi_agent_sessions_dir()
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    assert!(response.hits.iter().all(|hit| hit
        .session_path
        .replace('\\', "/")
        .contains(&normalized_pi_root)));
}

#[tokio::test]
async fn test_full_text_search_pagination_across_sessions() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[
        ("s1", "/cwd1", &[("user", "apple"); 5]),
        ("s2", "/cwd2", &[("user", "banana"); 5]),
        ("s3", "/cwd3", &[("user", "cherry"); 5]),
    ]);

    // Query "banana" with page size 3, per-session limit 3
    let page0: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        3,
        None,
        None,
    )
    .await
    .unwrap();

    // sess2 has 5 matches but per-session limit is 3
    assert_eq!(page0.total_hits, 3);
    assert_eq!(page0.hits.len(), 3);
    assert!(page0.hits.iter().all(|h| h.session_id == "s2"));

    // Query "apple" with page size 10
    let page0: FullTextSearchResponse = full_text_search(
        "apple".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(page0.total_hits, 3);
    assert!(page0.hits.iter().all(|h| h.session_id == "s1"));

    println!("✅ Pagination across sessions test passed!");
}

#[tokio::test]
async fn test_full_text_search_result_structure() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "s1",
        "/projects/test",
        &[("user", "Hello world"), ("assistant", "Hi there!")],
    )]);

    let response: FullTextSearchResponse = full_text_search(
        "hello".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!response.hits.is_empty());
    let hit = &response.hits[0];

    assert!(!hit.session_id.is_empty());
    assert!(!hit.session_path.is_empty());
    assert!(!hit.entry_id.is_empty());
    assert!(!hit.role.is_empty());
    assert!(!hit.content.is_empty());
    // Timestamp is DateTime<Utc>; convert to RFC3339 string
    let ts_str = hit.timestamp.to_rfc3339();
    assert!(!ts_str.is_empty());
    assert!(hit.score.is_finite());

    assert!(hit.role == "user" || hit.role == "assistant");
    assert!(hit.session_path.ends_with(".jsonl"));

    let dt = chrono::DateTime::parse_from_rfc3339(&ts_str);
    assert!(dt.is_ok());

    println!("✅ Result structure test passed!");
}

#[tokio::test]
async fn test_full_text_search_escaping_special_chars() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "s1",
        "/cwd",
        &[
            ("user", r#"This has "double quotes" and \ backslash"#),
            ("assistant", r#"Also contains 'single' quotes"#),
        ],
    )]);

    // Search for "double quotes"
    let response: FullTextSearchResponse = full_text_search(
        r#"double quotes"#.to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!response.hits.is_empty());

    // Search for backslash
    let response: FullTextSearchResponse = full_text_search(
        "backslash".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!response.hits.is_empty());

    // Search with quote in query
    let response: FullTextSearchResponse = full_text_search(
        r#""double""#.to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    // Should not panic

    println!("✅ Special character escaping test passed!");
}

#[tokio::test]
async fn test_full_text_search_after_session_update() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let temp_dir = setup_test_db(&[(
        "s1",
        "/cwd",
        &[
            ("user", "Initial content"),
            ("assistant", "Initial response"),
        ],
    )]);

    let sess_path = temp_dir.path().join("sessions").join("s1.jsonl");

    // Verify initial search
    let resp1: FullTextSearchResponse = full_text_search(
        "Initial".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!resp1.hits.is_empty());

    // Append new message (ensure newline separation)
    let additional = r#"{"type":"message","id":"new-msg","parentId":null,"timestamp":"2026-02-10T23:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Updated with new content"}]}}"#;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&sess_path)
        .unwrap();
    use std::io::Write;
    writeln!(file, "\n{additional}").unwrap();
    file.sync_all().unwrap();

    // Rescan changed file
    let changed_paths = vec![sess_path.to_string_lossy().to_string()];
    let _diff = scanner::rescan_changed_files(changed_paths).await.unwrap();

    // Search for "Updated"
    let resp2: FullTextSearchResponse = full_text_search(
        "Updated".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!resp2.hits.is_empty());
    assert!(resp2.hits.iter().any(|h| h.session_id == "s1"));

    // Original "Initial" should still be there
    let resp3: FullTextSearchResponse = full_text_search(
        "Initial".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!resp3.hits.is_empty());

    println!("✅ Session update test passed!");
}

#[tokio::test]
async fn test_full_text_search_cascade_delete() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let temp_dir = setup_test_db(&[
        ("s1", "/cwd1", &[("user", "deleteme")]),
        ("s2", "/cwd2", &[("user", "keepme")]),
    ]);

    let sess1_path = temp_dir.path().join("sessions").join("s1.jsonl");
    let sess2_path = temp_dir.path().join("sessions").join("s2.jsonl");

    // Open a connection to perform DELETE
    let config = Config::default();
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();

    // Verify both searchable
    let resp_before: FullTextSearchResponse = full_text_search(
        "deleteme".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!resp_before.hits.is_empty());

    // Delete session 1
    conn.execute(
        "DELETE FROM sessions WHERE path = ?",
        params![sess1_path.to_string_lossy().to_string()],
    )
    .unwrap();

    // Check cascade
    let me_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ?",
            params![sess1_path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(me_count, 0);

    let fts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_fts WHERE session_path = ?",
            params![sess1_path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(fts_count, 0);

    // Search for "deleteme" should not find anything
    let resp_after: FullTextSearchResponse = full_text_search(
        "deleteme".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(resp_after.hits.is_empty());

    // Search for "keepme" should still work
    let resp_keep: FullTextSearchResponse = full_text_search(
        "keepme".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!resp_keep.hits.is_empty());

    println!("✅ Cascade delete test passed!");
}

#[tokio::test]
async fn test_full_text_search_per_session_limit_uses_recent() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "s1",
        "/cwd1",
        &[
            ("user", "test"),
            ("user", "test"),
            ("user", "test"),
            ("user", "test"),
            ("user", "test"),
        ],
    )]);

    // Search for "test" with page size 10 to retrieve all hits (per-session limit applies)
    let response: FullTextSearchResponse = full_text_search(
        "test".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    // Per-session limit is 3, so total_hits should be 3
    assert_eq!(response.total_hits, 3);
    assert_eq!(response.hits.len(), 3);

    // All hits from session s1
    assert!(response.hits.iter().all(|h| h.session_id == "s1"));

    // Verify that the hits correspond to the three most recent messages (msg2, msg3, msg4)
    let entry_ids: Vec<String> = response.hits.iter().map(|h| h.entry_id.clone()).collect();
    assert!(entry_ids.contains(&"s1-msg2".to_string()));
    assert!(entry_ids.contains(&"s1-msg3".to_string()));
    assert!(entry_ids.contains(&"s1-msg4".to_string()));
    // The older messages (msg0, msg1) should not be present
    assert!(!entry_ids.contains(&"s1-msg0".to_string()));
    assert!(!entry_ids.contains(&"s1-msg1".to_string()));

    println!("✅ Per-session limit uses most recent messages test passed!");
}

#[tokio::test]
async fn test_full_text_search_role_filter_case_insensitive() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "s1",
        "/cwd1",
        &[("user", "Hello world"), ("assistant", "Hi there!")],
    )]);

    // Search with uppercase "USER" should still return only user messages
    let response: FullTextSearchResponse = full_text_search(
        "Hello".to_string(),
        "USER".to_string(), // case-insensitive
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!response.hits.is_empty());
    assert!(response.hits.iter().all(|h| h.role == "user"));

    // Mixed case "AssIstant" should return only assistant messages for "Hi"
    let response: FullTextSearchResponse = full_text_search(
        "Hi".to_string(),
        "AssIstant".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert!(!response.hits.is_empty());
    assert!(response.hits.iter().all(|h| h.role == "assistant"));

    println!("✅ Role filter case insensitivity test passed!");
}

#[tokio::test]
async fn test_full_text_search_match_modes() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "s1",
        "/cwd",
        &[
            ("user", "I love Rust programming"),
            ("user", "Rust is safe"),
            ("user", "I love learning"),
            ("user", "Love and Rust together"),
        ],
    )]);

    // any mode: matches any word (union)
    let resp_any: FullTextSearchResponse = full_text_search(
        "love Rust".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        Some("any".to_string()),
        None,
    )
    .await
    .unwrap();
    // All 4 messages contain either "love" or "rust", but per‑session limit is 3
    assert_eq!(resp_any.total_hits, 3);
    assert!(resp_any.hits.iter().all(|h| h.session_id == "s1"));
    for hit in &resp_any.hits {
        let content = hit.content.to_ascii_lowercase();
        assert!(content.contains("love") || content.contains("rust"));
    }

    // all mode: requires both "love" and "rust"
    let resp_all: FullTextSearchResponse = full_text_search(
        "love Rust".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        Some("all".to_string()),
        None,
    )
    .await
    .unwrap();
    // msg0 and msg3 contain both words
    assert_eq!(resp_all.total_hits, 2);
    for hit in &resp_all.hits {
        let content = hit.content.to_ascii_lowercase();
        assert!(content.contains("love"));
        assert!(content.contains("rust"));
    }

    // phrase mode: exact phrase "love Rust"
    let resp_phrase: FullTextSearchResponse = full_text_search(
        "love Rust".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        Some("phrase".to_string()),
        None,
    )
    .await
    .unwrap();
    // Only msg0 has contiguous "love Rust"
    assert_eq!(resp_phrase.total_hits, 1);
    let hit = &resp_phrase.hits[0];
    assert_eq!(hit.entry_id, "s1-msg0");
    let content = hit.content.to_ascii_lowercase();
    assert!(content.contains("love rust"));

    println!("✅ Match modes test passed!");
}

#[tokio::test]
async fn test_full_text_search_defaults_to_smart_phrase_priority() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "smart-default",
        "/workspace/smart",
        &[("user", "foo bar"), ("user", "foo only")],
    )]);

    let response = full_text_search(
        "foo bar".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert_eq!(response.total_hits, 2);
    assert_eq!(response.hits[0].entry_id, "smart-default-msg0");
    assert!(response
        .hits
        .iter()
        .any(|hit| hit.entry_id == "smart-default-msg1"));
}

#[tokio::test]
async fn test_full_text_search_applies_native_time_scope() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let recent_session = make_session_file_with_explicit_timestamps(
        "recent-scope",
        "/workspace/scope",
        &[("user", "alpha latest", "2026-04-10T10:00:00Z")],
    );
    let older_session = make_session_file_with_explicit_timestamps(
        "older-scope",
        "/workspace/scope",
        &[("user", "alpha older", "2026-03-01T10:00:00Z")],
    );
    let _temp_dir = setup_test_db_from_raw_sessions(&[
        ("recent-scope", &recent_session),
        ("older-scope", &older_session),
    ]);

    let response = full_text_search_with_scope(
        "alpha".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        Some("newest".to_string()),
        None,
        Some("2026-04-01T00:00:00Z".to_string()),
        Some("2026-04-30T23:59:59Z".to_string()),
    )
    .await
    .unwrap();

    assert_eq!(response.total_hits, 1);
    assert_eq!(response.hits[0].session_id, "recent-scope");
}

#[tokio::test]
async fn test_full_text_search_any_mode_honors_quoted_phrase() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "s1",
        "/cwd",
        &[
            ("user", "foo middle bar"),
            ("user", "prefix foo bar suffix"),
            ("user", "foo bar and extra"),
        ],
    )]);

    let response: FullTextSearchResponse = full_text_search(
        "\"foo bar\"".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!response.hits.is_empty());
    assert!(response
        .hits
        .iter()
        .all(|hit| hit.content.to_lowercase().contains("foo bar")));
    assert!(!response
        .hits
        .iter()
        .any(|hit| hit.content.to_lowercase().contains("foo middle bar")));
}

#[tokio::test]
async fn test_full_text_search_project_path_filter() {
    let _lock = TEST_DB_LOCK.lock().unwrap();
    let _temp_dir = setup_test_db(&[
        (
            "proj1",
            "/workspace/project-a",
            &[("user", "shared keyword")],
        ),
        (
            "proj2",
            "/workspace/project-b",
            &[("user", "shared keyword")],
        ),
    ]);

    let response = full_text_search(
        "shared keyword".to_string(),
        "all".to_string(),
        None,
        Some("/workspace/project-a".to_string()),
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert_eq!(response.total_hits, 1);
    assert_eq!(response.hits.len(), 1);
    assert!(response.hits.iter().all(|hit| hit.session_id == "proj1"));
}

#[tokio::test]
async fn test_full_text_search_ignores_tool_result_entries_during_upsert() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();
    env::set_var("HOME", temp_dir.path());

    let config = Config::default();
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();

    let path = sessions_dir.join("tool-result.jsonl");
    fs::write(
        &path,
        concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"tool-session\",\"timestamp\":\"2026-04-08T01:49:02.501Z\",\"cwd\":\"/workspace/tool\"}\n",
            "{\"type\":\"message\",\"id\":\"user-1\",\"timestamp\":\"2026-04-08T01:49:03.000Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"read file\"}]}}\n",
            "{\"type\":\"message\",\"id\":\"assistant-1\",\"parentId\":\"user-1\",\"timestamp\":\"2026-04-08T01:49:04.000Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"toolCall\",\"id\":\"call_1\",\"name\":\"read\",\"arguments\":{\"path\":\"README.md\"}}]}}\n",
            "{\"type\":\"message\",\"id\":\"tool-1\",\"parentId\":\"assistant-1\",\"timestamp\":\"2026-04-08T01:49:05.000Z\",\"message\":{\"role\":\"toolResult\",\"content\":[{\"type\":\"text\",\"text\":\"# README\"}]}}\n",
            "{\"type\":\"message\",\"id\":\"assistant-2\",\"parentId\":\"tool-1\",\"timestamp\":\"2026-04-08T01:49:06.000Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"done\"}]}}\n"
        ),
    )
    .unwrap();

    let (session, entries) = scanner::parse_session_info(&path).unwrap();
    sqlite_cache::upsert_session(&mut conn, &session, Utc::now(), Some(&entries)).unwrap();

    let indexed_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ?",
            params![path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(indexed_rows, 3);

    let tool_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ? AND role NOT IN ('user', 'assistant')",
            params![path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(tool_rows, 0);
}

#[tokio::test]
async fn test_full_text_search_thinking_toggle() {
    let _lock = TEST_DB_LOCK.lock().unwrap();
    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();
    env::set_var("HOME", temp_dir.path());

    write_app_settings(false);
    let config = Config::default();
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();

    let path = sessions_dir.join("thinking.jsonl");
    fs::write(
        &path,
        make_session_file_with_thinking(
            "thinking",
            "/workspace/project-thinking",
            &[(
                "assistant",
                "visible answer",
                Some("hidden chain of thought"),
            )],
        ),
    )
    .unwrap();

    let (session, entries) = scanner::parse_session_info(&path).unwrap();
    sqlite_cache::upsert_session(&mut conn, &session, Utc::now(), Some(&entries)).unwrap();
    drop(conn);

    let disabled = full_text_search(
        "hidden chain of thought".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(disabled.total_hits, 0);

    write_app_settings(true);
    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();
    let (session, entries) = scanner::parse_session_info(&path).unwrap();
    sqlite_cache::upsert_session(&mut conn, &session, Utc::now(), Some(&entries)).unwrap();
    drop(conn);

    let enabled = full_text_search(
        "hidden chain of thought".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(enabled.total_hits, 1);
    assert_eq!(enabled.hits[0].source_type, "thinking");
    assert_eq!(enabled.hits[0].entry_id, "thinking-msg0");
}

#[tokio::test]
async fn test_full_text_search_cjk_substring_query() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[(
        "cjk1",
        "/workspace/project-cjk",
        &[("user", "你这人真弱智吗")],
    )]);

    let response = full_text_search(
        "弱智".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert_eq!(response.total_hits, 1);
    assert_eq!(response.hits.len(), 1);
    assert_eq!(response.hits[0].entry_id, "cjk1-msg0");
    assert!(response.hits[0].content.contains("弱智"));
}

#[tokio::test]
async fn test_full_text_search_excludes_external_sessions_when_search_disabled() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let temp_dir = tempdir().unwrap();
    env::set_var("HOME", temp_dir.path());

    let pi_sessions_dir = temp_dir
        .path()
        .join(".pi")
        .join("agent")
        .join("sessions")
        .join("project");
    let codex_sessions_dir = temp_dir
        .path()
        .join(".codex")
        .join("sessions")
        .join("2026")
        .join("04")
        .join("11");
    fs::create_dir_all(&pi_sessions_dir).unwrap();
    fs::create_dir_all(&codex_sessions_dir).unwrap();

    let pi_path = pi_sessions_dir.join("pi-alpha.jsonl");
    let codex_path = codex_sessions_dir.join("codex-alpha.jsonl");

    fs::write(
        &pi_path,
        make_session_file(
            "pi-alpha",
            "/repo/pi",
            &[("user", "alpha visible in pi search")],
        ),
    )
    .unwrap();
    fs::write(
        &codex_path,
        make_codex_session_file(
            "codex-alpha",
            "/repo/codex",
            "alpha hidden in external search",
        ),
    )
    .unwrap();

    let mut config = Config::default();
    config.external_sessions_include_in_search = false;
    pi_session_manager::config::save_config(&config).unwrap();

    let mut conn = sqlite_cache::init_db_with_config(&config).unwrap();
    for path in [&pi_path, &codex_path] {
        let (session, entries) = scanner::parse_session_info(path).unwrap();
        sqlite_cache::upsert_session(&mut conn, &session, Utc::now(), Some(&entries)).unwrap();
    }
    drop(conn);

    let content_results = full_text_search(
        "alpha".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    let pi_path_str = pi_path.to_string_lossy().to_string();
    assert!(content_results
        .hits
        .iter()
        .all(|hit| hit.session_path == pi_path_str.as_str()));
    assert!(content_results
        .hits
        .iter()
        .all(|hit| hit.session_id != "codex-alpha"));

    let session_id_results = full_text_search(
        "codex-alpha".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(session_id_results.hits.is_empty());
    assert_eq!(session_id_results.total_hits, 0);
}

#[tokio::test]
async fn test_full_text_search_prioritizes_label_hits_for_same_node() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db_from_raw_sessions(&[
        (
            "label-priority",
            &make_session_file_with_labels(
                "label-priority",
                "/workspace/labels",
                &[
                    r#"{"type":"message","id":"label-priority-msg0","timestamp":"2026-02-10T22:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"alpha appears in ordinary content"}]}}"#,
                    r#"{"type":"label","id":"label-priority-label0","parentId":"label-priority-msg0","targetId":"label-priority-msg0","timestamp":"2026-02-10T22:00:05Z","label":"alpha priority label"}"#,
                ],
            ),
        ),
        (
            "content-fallback",
            &make_session_file(
                "content-fallback",
                "/workspace/content",
                &[("user", "alpha only appears in ordinary content")],
            ),
        ),
    ]);

    let response = full_text_search(
        "alpha".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(response.total_hits >= 2);
    assert_eq!(response.hits[0].session_id, "label-priority");
    assert_eq!(response.hits[0].entry_id, "label-priority-msg0");
    assert_eq!(response.hits[0].source_type, "label");
    assert_eq!(response.hits[0].match_reason.as_deref(), Some("label"));
    assert!(response
        .hits
        .iter()
        .any(|hit| { hit.session_id == "content-fallback" && hit.source_type != "label" }));
}

#[tokio::test]
async fn test_full_text_search_source_filters_and_label_browse_mode() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db_from_raw_sessions(&[
        (
            "labels-a",
            &make_session_file_with_labels(
                "labels-a",
                "/workspace/labels-a",
                &[
                    r#"{"type":"message","id":"labels-a-msg0","timestamp":"2026-02-10T22:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"alpha content body"}]}}"#,
                    r#"{"type":"label","id":"labels-a-label0","parentId":"labels-a-msg0","targetId":"labels-a-msg0","timestamp":"2026-02-10T22:00:02Z","label":"alpha label"}"#,
                ],
            ),
        ),
        (
            "labels-b",
            &make_session_file_with_labels(
                "labels-b",
                "/workspace/labels-b",
                &[
                    r#"{"type":"message","id":"labels-b-msg0","timestamp":"2026-02-10T22:00:03Z","message":{"role":"user","content":[{"type":"text","text":"beta content body"}]}}"#,
                    r#"{"type":"label","id":"labels-b-label0","parentId":"labels-b-msg0","targetId":"labels-b-msg0","timestamp":"2026-02-10T22:00:04Z","label":"beta label"}"#,
                ],
            ),
        ),
        (
            "feedface-1111",
            &make_session_file(
                "feedface-1111",
                "/workspace/session-id",
                &[("assistant", "session id rediscovery preview")],
            ),
        ),
        (
            "content-only-session",
            &make_session_file(
                "content-only-session",
                "/workspace/content-only",
                &[("user", "feedface shows up only in message content")],
            ),
        ),
    ]);

    let labels_only = full_text_search_with_source_filter(
        "alpha".to_string(),
        "all".to_string(),
        Some("labels_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(labels_only.total_hits, 1);
    assert!(labels_only
        .hits
        .iter()
        .all(|hit| hit.source_type == "label"));
    assert!(labels_only
        .hits
        .iter()
        .all(|hit| hit.match_reason.as_deref() == Some("label")));

    let content_only = full_text_search_with_source_filter(
        "alpha".to_string(),
        "all".to_string(),
        Some("content_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(content_only.total_hits, 1);
    assert!(content_only.hits.iter().all(|hit| hit.source_type == "user"
        || hit.source_type == "assistant"
        || hit.source_type == "thinking"));
    assert!(content_only
        .hits
        .iter()
        .all(|hit| hit.match_reason.as_deref() == Some("content")));

    let all_results = full_text_search_with_source_filter(
        "alpha".to_string(),
        "all".to_string(),
        Some("all".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(all_results.total_hits, 1);
    assert_eq!(all_results.hits[0].source_type, "label");
    assert_eq!(all_results.hits[0].match_reason.as_deref(), Some("label"));

    let labels_only_empty = full_text_search_with_source_filter(
        "".to_string(),
        "all".to_string(),
        Some("labels_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(labels_only_empty.total_hits, 2);
    assert_eq!(labels_only_empty.hits.len(), 2);
    assert!(labels_only_empty
        .hits
        .iter()
        .all(|hit| hit.source_type == "label"));
    assert_eq!(labels_only_empty.hits[0].entry_id, "labels-b-msg0");
    assert_eq!(labels_only_empty.hits[1].entry_id, "labels-a-msg0");

    let all_empty = full_text_search_with_source_filter(
        "".to_string(),
        "all".to_string(),
        Some("all".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(all_empty.total_hits, 0);
    assert!(all_empty.hits.is_empty());

    let content_only_empty = full_text_search_with_source_filter(
        "".to_string(),
        "all".to_string(),
        Some("content_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(content_only_empty.total_hits, 0);
    assert!(content_only_empty.hits.is_empty());

    let session_id_all = full_text_search_with_source_filter(
        "feedface".to_string(),
        "all".to_string(),
        Some("all".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(session_id_all.hits[0].entry_id, "");
    assert_eq!(
        session_id_all.hits[0].match_reason.as_deref(),
        Some("session_id_prefix")
    );

    let session_id_content_only = full_text_search_with_source_filter(
        "feedface".to_string(),
        "all".to_string(),
        Some("content_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert!(session_id_content_only
        .hits
        .iter()
        .all(|hit| hit.match_reason.as_deref() == Some("content")));
    assert!(session_id_content_only
        .hits
        .iter()
        .all(|hit| hit.entry_id != ""));

    let session_id_labels_only = full_text_search_with_source_filter(
        "feedface".to_string(),
        "all".to_string(),
        Some("labels_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(session_id_labels_only.total_hits, 0);
    assert!(session_id_labels_only.hits.is_empty());
}

#[tokio::test]
async fn test_full_text_search_does_not_match_role_or_source_type_metadata() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db_from_raw_sessions(&[(
        "metadata-guard",
        &make_session_file_with_labels(
            "metadata-guard",
            "/workspace/metadata",
            &[
                r#"{"type":"message","id":"metadata-guard-msg0","timestamp":"2026-02-10T22:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"plain content"}]}}"#,
                r#"{"type":"label","id":"metadata-guard-label0","parentId":"metadata-guard-msg0","targetId":"metadata-guard-msg0","timestamp":"2026-02-10T22:00:02Z","label":"bookmark"}"#,
            ],
        ),
    )]);

    let content_only = full_text_search_with_source_filter(
        "assistant".to_string(),
        "all".to_string(),
        Some("content_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(content_only.total_hits, 0);

    let labels_only = full_text_search_with_source_filter(
        "label".to_string(),
        "all".to_string(),
        Some("labels_only".to_string()),
        0,
        10,
    )
    .await
    .unwrap();
    assert_eq!(labels_only.total_hits, 0);
}

#[tokio::test]
async fn test_full_text_search_prioritizes_session_id_matches() {
    let _lock = TEST_DB_LOCK.lock().unwrap();

    let _temp_dir = setup_test_db(&[
        (
            "feedface-1111",
            "/workspace/project-id",
            &[("assistant", "session lookup preview")],
        ),
        (
            "other-session",
            "/workspace/project-id",
            &[("user", "feedface appears in logs and transcripts")],
        ),
    ]);

    let prefix_response = full_text_search(
        "feedface".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(prefix_response.total_hits >= 2);
    assert_eq!(prefix_response.hits[0].session_id, "feedface-1111");
    assert_eq!(prefix_response.hits[0].entry_id, "");
    assert_eq!(
        prefix_response.hits[0].match_reason.as_deref(),
        Some("session_id_prefix")
    );

    let exact_response = full_text_search(
        "feedface-1111".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!exact_response.hits.is_empty());
    assert_eq!(exact_response.hits[0].session_id, "feedface-1111");
    assert_eq!(exact_response.hits[0].entry_id, "");
    assert_eq!(
        exact_response.hits[0].match_reason.as_deref(),
        Some("session_id_exact")
    );

    let quoted_exact_response = full_text_search(
        "\"feedface-1111\"".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        10,
        None,
        None,
    )
    .await
    .unwrap();

    assert!(!quoted_exact_response.hits.is_empty());
    assert_eq!(quoted_exact_response.hits[0].session_id, "feedface-1111");
    assert_eq!(
        quoted_exact_response.hits[0].match_reason.as_deref(),
        Some("session_id_exact")
    );
}
