use chrono::Utc;
use lazy_static::lazy_static;
use pi_session_manager::config::Config;
use pi_session_manager::scanner;
use pi_session_manager::session_delete::{self, DeletionMethod};
use pi_session_manager::sqlite_cache;
use rusqlite::params;
use std::env;
use std::fs;
use std::sync::Mutex;
use tempfile::tempdir;

lazy_static! {
    static ref TEST_DB_LOCK: Mutex<()> = Mutex::new(());
}

fn create_session_file(path: &std::path::Path, session_id: &str) {
    let content = format!(
        "{{\"type\":\"session\",\"version\":3,\"id\":\"{session_id}\",\"timestamp\":\"2026-02-26T00:00:00Z\",\"cwd\":\"/tmp/test\"}}\n{{\"type\":\"message\",\"id\":\"msg-1\",\"parentId\":null,\"timestamp\":\"2026-02-26T00:00:01Z\",\"message\":{{\"role\":\"user\",\"content\":[{{\"type\":\"text\",\"text\":\"hello\"}}]}}}}"
    );
    fs::write(path, content).expect("failed to write test session file");
}

#[tokio::test]
async fn test_delete_session_moves_or_falls_back_and_cleans_cache() {
    let _lock = TEST_DB_LOCK.lock().expect("failed to acquire test lock");

    let temp_dir = tempdir().expect("failed to create temp dir");
    let sessions_dir = temp_dir.path().join(".pi/agent/sessions");
    fs::create_dir_all(&sessions_dir).expect("failed to create sessions dir");

    let original_home = env::var("HOME").ok();
    env::set_var("HOME", temp_dir.path());

    let session_path = sessions_dir.join("delete-test.jsonl");
    create_session_file(&session_path, "delete-test-id");

    let config = Config::default();
    let connection =
        sqlite_cache::init_db_with_config(&config).expect("failed to initialize sqlite cache");

    let (session_info, entries) =
        scanner::parse_session_info(&session_path).expect("failed to parse test session file");
    sqlite_cache::upsert_session(&connection, &session_info, Utc::now(), Some(&entries))
        .expect("failed to upsert test session");

    let session_path_str = session_path
        .to_str()
        .expect("test session path is not valid UTF-8")
        .to_string();

    let session_count_before: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sessions WHERE path = ?",
            params![session_path_str],
            |row| row.get(0),
        )
        .expect("failed to count sessions before deletion");
    assert_eq!(session_count_before, 1);

    let message_entries_before: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ?",
            params![session_path_str],
            |row| row.get(0),
        )
        .expect("failed to count message entries before deletion");
    assert_eq!(message_entries_before, 1);

    drop(connection);

    let outcome = session_delete::delete_session_file_and_cache(&session_path_str)
        .expect("delete_session_file_and_cache should succeed");

    assert!(
        matches!(
            outcome.method,
            DeletionMethod::Trash | DeletionMethod::PermanentFallback
        ),
        "unexpected deletion method: {:?}",
        outcome.method
    );

    assert!(
        !session_path.exists(),
        "session file should no longer exist at original location"
    );

    let connection =
        sqlite_cache::init_db_with_config(&config).expect("failed to re-open sqlite cache");

    let session_count_after: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sessions WHERE path = ?",
            params![session_path_str],
            |row| row.get(0),
        )
        .expect("failed to count sessions after deletion");
    assert_eq!(session_count_after, 0);

    let message_entries_after: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ?",
            params![session_path_str],
            |row| row.get(0),
        )
        .expect("failed to count message entries after deletion");
    assert_eq!(message_entries_after, 0);

    let message_fts_table_exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'message_fts'",
            [],
            |row| row.get(0),
        )
        .expect("failed to check message_fts table existence");

    if message_fts_table_exists > 0 {
        let message_fts_after: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM message_fts WHERE session_path = ?",
                params![session_path_str],
                |row| row.get(0),
            )
            .expect("failed to count message fts rows after deletion");
        assert_eq!(message_fts_after, 0);
    }

    if let Some(home) = original_home {
        env::set_var("HOME", home);
    } else {
        env::remove_var("HOME");
    }
}
