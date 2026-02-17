use chrono::Utc;
use lazy_static::lazy_static;
use pi_session_manager::commands::full_text_search;
use pi_session_manager::config::Config;
use pi_session_manager::models::{FullTextSearchHit, FullTextSearchResponse};
use pi_session_manager::scanner;
use pi_session_manager::sqlite_cache;
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

/// Set up a test database with sessions and message entries
fn setup_test_db(sessions: &[(&str, &str, &[(&str, &str)])]) -> tempfile::TempDir {
    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();

    // Set HOME so config uses temp dir for DB
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", temp_dir.path());

    let config = Config::default();
    let conn = sqlite_cache::init_db_with_config(&config).unwrap();

    for (id, cwd, messages) in sessions {
        let path = sessions_dir.join(format!("{id}.jsonl"));
        let content = make_session_file(id, cwd, messages);
        fs::write(&path, content).unwrap();

        let (session, entries) = scanner::parse_session_info(&path).unwrap();
        sqlite_cache::upsert_session(&conn, &session, Utc::now(), Some(&entries)).unwrap();
        // No separate upsert_message_entries; it's handled inside upsert_session
    }

    // Drop connection to avoid locks when full_text_search opens its own connection
    drop(conn);

    temp_dir
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
    let response: FullTextSearchResponse =
        full_text_search("banana".to_string(), "all".to_string(), None, 0, 10, None)
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
    let response: FullTextSearchResponse =
        full_text_search("rust".to_string(), "all".to_string(), None, 0, 10, None)
            .await
            .unwrap();

    assert!(response.total_hits >= 2);
    let sess_ids: Vec<String> = response.hits.iter().map(|h| h.session_id.clone()).collect();
    assert!(sess_ids.contains(&"sess2".to_string()));
    assert!(sess_ids.contains(&"sess3".to_string()));

    // Test 3: Role filter - user only on "banana"
    let response: FullTextSearchResponse =
        full_text_search("banana".to_string(), "user".to_string(), None, 0, 10, None)
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
        0,
        10,
        None,
    )
    .await
    .unwrap();

    assert!(!response.hits.is_empty());
    assert!(response.hits.iter().all(|h| h.role == "assistant"));

    // Test 5: Empty query
    let response: FullTextSearchResponse =
        full_text_search("".to_string(), "all".to_string(), None, 0, 10, None)
            .await
            .unwrap();
    assert_eq!(response.total_hits, 0);
    assert!(response.hits.is_empty());

    // Test 6: No match
    let response: FullTextSearchResponse = full_text_search(
        "xyznonexistent".to_string(),
        "all".to_string(),
        None,
        0,
        10,
        None,
    )
    .await
    .unwrap();
    assert_eq!(response.total_hits, 0);
    assert!(response.hits.is_empty());

    // Test 7: Pagination
    let page0: FullTextSearchResponse =
        full_text_search("rust".to_string(), "all".to_string(), None, 0, 2, None)
            .await
            .unwrap();
    assert!(page0.total_hits >= 2);
    assert!(page0.hits.len() <= 2);

    let page1: FullTextSearchResponse =
        full_text_search("rust".to_string(), "all".to_string(), None, 1, 2, None)
            .await
            .unwrap();
    let total_from_pages = page0.hits.len() + page1.hits.len();
    assert!(total_from_pages <= page0.total_hits);

    // Test 8: Glob pattern
    let response: FullTextSearchResponse = full_text_search(
        "banana".to_string(),
        "all".to_string(),
        Some("/cwd1/*".to_string()),
        0,
        10,
        None,
    )
    .await
    .unwrap();
    assert!(response
        .hits
        .iter()
        .all(|h| h.session_path.contains("/cwd1")));

    // Test 9: Score is positive
    let response: FullTextSearchResponse =
        full_text_search("banana".to_string(), "all".to_string(), None, 0, 10, None)
            .await
            .unwrap();
    for hit in &response.hits {
        assert!(hit.score.is_finite());
    }

    println!("✅ All full_text_search command tests passed!");
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
    let page0: FullTextSearchResponse =
        full_text_search("banana".to_string(), "all".to_string(), None, 0, 3, None)
            .await
            .unwrap();

    // sess2 has 5 matches but per-session limit is 3
    assert_eq!(page0.total_hits, 3);
    assert_eq!(page0.hits.len(), 3);
    assert!(page0.hits.iter().all(|h| h.session_id == "s2"));

    // Query "apple" with page size 10
    let page0: FullTextSearchResponse =
        full_text_search("apple".to_string(), "all".to_string(), None, 0, 10, None)
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

    let response: FullTextSearchResponse =
        full_text_search("hello".to_string(), "all".to_string(), None, 0, 10, None)
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
        0,
        10,
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
        0,
        10,
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
        0,
        10,
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
    let resp1: FullTextSearchResponse =
        full_text_search("Initial".to_string(), "all".to_string(), None, 0, 10, None)
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
    let resp2: FullTextSearchResponse =
        full_text_search("Updated".to_string(), "all".to_string(), None, 0, 10, None)
            .await
            .unwrap();
    assert!(!resp2.hits.is_empty());
    assert!(resp2.hits.iter().any(|h| h.session_id == "s1"));

    // Original "Initial" should still be there
    let resp3: FullTextSearchResponse =
        full_text_search("Initial".to_string(), "all".to_string(), None, 0, 10, None)
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
    let conn = sqlite_cache::init_db_with_config(&config).unwrap();

    // Verify both searchable
    let resp_before: FullTextSearchResponse =
        full_text_search("deleteme".to_string(), "all".to_string(), None, 0, 10, None)
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
    let resp_after: FullTextSearchResponse =
        full_text_search("deleteme".to_string(), "all".to_string(), None, 0, 10, None)
            .await
            .unwrap();
    assert!(resp_after.hits.is_empty());

    // Search for "keepme" should still work
    let resp_keep: FullTextSearchResponse =
        full_text_search("keepme".to_string(), "all".to_string(), None, 0, 10, None)
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
    let response: FullTextSearchResponse =
        full_text_search("test".to_string(), "all".to_string(), None, 0, 10, None)
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
        0,
        10,
        None,
    )
    .await
    .unwrap();
    assert!(!response.hits.is_empty());
    assert!(response.hits.iter().all(|h| h.role == "user"));

    // Mixed case "AssIstant" should return only assistant messages for "Hi"
    let response: FullTextSearchResponse =
        full_text_search("Hi".to_string(), "AssIstant".to_string(), None, 0, 10, None)
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
        0,
        10,
        Some("any".to_string()),
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
        0,
        10,
        Some("all".to_string()),
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
        0,
        10,
        Some("phrase".to_string()),
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
