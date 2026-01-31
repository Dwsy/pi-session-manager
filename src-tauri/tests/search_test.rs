use pi_session_manager::models::{SessionInfo};
use pi_session_manager::search::{search_sessions, SearchMode, RoleFilter};
use chrono::{DateTime, Utc};
use std::fs;
use std::path::PathBuf;

fn create_test_session_file(dir: &PathBuf, filename: &str, content: &str) -> String {
    let file_path = dir.join(filename);
    fs::write(&file_path, content).expect("Failed to write test session file");
    file_path.to_string_lossy().to_string()
}

fn cleanup_test_dir(dir: &PathBuf) {
    if dir.exists() {
        fs::remove_dir_all(dir).expect("Failed to cleanup test directory");
    }
}

#[test]
fn test_empty_query_returns_empty_results() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_empty");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello world"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Hello world".to_string(),
        all_messages_text: "Hello world".to_string(),
    }];

    // Test empty query
    let results = search_sessions(&sessions, "", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Empty query should return no results");

    // Test whitespace-only query
    let results = search_sessions(&sessions, "   ", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Whitespace-only query should return no results");

    let results = search_sessions(&sessions, "\t\n", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Tab/newline-only query should return no results");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_single_word_search() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_single");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello world, this is a test"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Hello world".to_string(),
        all_messages_text: "Hello world, this is a test".to_string(),
    }];

    // Test matching word
    let results = search_sessions(&sessions, "hello", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with 'hello'");
    assert_eq!(results[0].matches.len(), 1, "Should have 1 match");

    // Test case insensitivity
    let results = search_sessions(&sessions, "HELLO", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with 'HELLO' (case insensitive)");

    // Test non-matching word
    let results = search_sessions(&sessions, "xyz", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Should not find session with 'xyz'");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_multiple_word_search() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_multi");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Hello world, this is a test of search functionality"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Hello world".to_string(),
        all_messages_text: "Hello world, this is a test of search functionality".to_string(),
    }];

    // Test OR logic: any word matches should return results
    let results = search_sessions(&sessions, "hello world", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with 'hello' OR 'world'");

    // Test with one matching and one non-matching word
    let results = search_sessions(&sessions, "hello xyz", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with 'hello' (ignoring 'xyz')");

    // Test with all non-matching words
    let results = search_sessions(&sessions, "abc xyz", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Should not find session with no matching words");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_name_search_mode() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_name");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Some content here"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("My Important Project".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Some content here".to_string(),
        all_messages_text: "Some content here".to_string(),
    }];

    // Test searching by name
    let results = search_sessions(&sessions, "important", SearchMode::Name, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session by name");

    // Test searching by first message in name mode
    let results = search_sessions(&sessions, "content", SearchMode::Name, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session by first message in name mode");

    // Test non-matching name
    let results = search_sessions(&sessions, "nonexistent", SearchMode::Name, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Should not find session with non-matching name");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_role_filter() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_role");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"User message with keyword"}]}}
{"type":"message","id":"msg2","timestamp":"2025-01-01T00:01:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Assistant message with keyword"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 2,
        first_message: "User message with keyword".to_string(),
        all_messages_text: "User message with keyword Assistant message with keyword".to_string(),
    }];

    // Test user role filter
    let results = search_sessions(&sessions, "keyword", SearchMode::Content, RoleFilter::User, true);
    assert_eq!(results.len(), 1, "Should find session with user role");
    assert_eq!(results[0].matches.len(), 1, "Should have 1 user match");
    assert_eq!(results[0].matches[0].role, "user", "Match should be from user");

    // Test assistant role filter
    let results = search_sessions(&sessions, "keyword", SearchMode::Content, RoleFilter::Assistant, true);
    assert_eq!(results.len(), 1, "Should find session with assistant role");
    assert_eq!(results[0].matches.len(), 1, "Should have 1 assistant match");
    assert_eq!(results[0].matches[0].role, "assistant", "Match should be from assistant");

    // Test all roles filter
    let results = search_sessions(&sessions, "keyword", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with all roles");
    assert!(results[0].matches.len() >= 1, "Should have at least 1 match");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_multiple_sessions() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_multi_session");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session1_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Session about Rust programming"}]}}"#;
    let session1_path = create_test_session_file(&test_dir, "session1.jsonl", session1_content);

    let session2_content = r#"{"type":"message","id":"msg2","timestamp":"2025-01-01T01:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Session about Python programming"}]}}"#;
    let session2_path = create_test_session_file(&test_dir, "session2.jsonl", session2_content);

    let session3_content = r#"{"type":"message","id":"msg3","timestamp":"2025-01-01T02:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Session about JavaScript"}]}}"#;
    let session3_path = create_test_session_file(&test_dir, "session3.jsonl", session3_content);

    let sessions = vec![
        SessionInfo {
            path: session1_path.clone(),
            id: "session1".to_string(),
            cwd: "/test".to_string(),
            name: Some("Rust Session".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "Session about Rust programming".to_string(),
            all_messages_text: "Session about Rust programming".to_string(),
        },
        SessionInfo {
            path: session2_path.clone(),
            id: "session2".to_string(),
            cwd: "/test".to_string(),
            name: Some("Python Session".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-01T01:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-01T01:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "Session about Python programming".to_string(),
            all_messages_text: "Session about Python programming".to_string(),
        },
        SessionInfo {
            path: session3_path.clone(),
            id: "session3".to_string(),
            cwd: "/test".to_string(),
            name: Some("JS Session".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-01T02:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-01T02:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "Session about JavaScript".to_string(),
            all_messages_text: "Session about JavaScript".to_string(),
        },
    ];

    // Test search that matches multiple sessions
    let results = search_sessions(&sessions, "programming", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 2, "Should find 2 sessions with 'programming'");

    // Test search that matches single session
    let results = search_sessions(&sessions, "rust", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find 1 session with 'rust'");

    // Test search that matches no sessions
    let results = search_sessions(&sessions, "nonexistent", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Should find 0 sessions with 'nonexistent'");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_snippet_generation() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_snippet");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let long_text = "This is a very long message that contains the keyword somewhere in the middle of the text and we want to verify that the snippet is generated correctly with proper context around the matched keyword.";
    let session_content = format!(r#"{{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{{"role":"user","content":[{{"type":"text","text":"{}"}}]}}}}"#, long_text);
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", &session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: long_text[..50].to_string(),
        all_messages_text: long_text.to_string(),
    }];

    let results = search_sessions(&sessions, "keyword", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session");
    assert_eq!(results[0].matches.len(), 1, "Should have 1 match");
    assert!(results[0].matches[0].snippet.contains("keyword"), "Snippet should contain the keyword");
    assert!(results[0].matches[0].snippet.len() <= 200, "Snippet should be reasonably sized");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_score_calculation() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_score");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session1_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"test test test"}]}}"#;
    let session1_path = create_test_session_file(&test_dir, "session1.jsonl", session1_content);

    let session2_content = r#"{"type":"message","id":"msg2","timestamp":"2025-01-01T01:00:00Z","message":{"role":"user","content":[{"type":"text","text":"test"}]}}"#;
    let session2_path = create_test_session_file(&test_dir, "session2.jsonl", session2_content);

    let sessions = vec![
        SessionInfo {
            path: session1_path.clone(),
            id: "session1".to_string(),
            cwd: "/test".to_string(),
            name: Some("Session 1".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "test test test".to_string(),
            all_messages_text: "test test test".to_string(),
        },
        SessionInfo {
            path: session2_path.clone(),
            id: "session2".to_string(),
            cwd: "/test".to_string(),
            name: Some("Session 2".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-01T01:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-01T01:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "test".to_string(),
            all_messages_text: "test".to_string(),
        },
    ];

    let results = search_sessions(&sessions, "test", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 2, "Should find both sessions");
    // Session with more matches should appear first (higher score)
    assert_eq!(results[0].session_id, "session1", "Session with more matches should be first");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_thinking_content() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_thinking");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"This is thinking content with keyword"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Thinking...".to_string(),
        all_messages_text: "This is thinking content with keyword".to_string(),
    }];

    // Test with include_tools = true (should search thinking content)
    let results = search_sessions(&sessions, "keyword", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with keyword in thinking (include_tools=true)");

    // Test with include_tools = false (should not search thinking content)
    let results = search_sessions(&sessions, "keyword", SearchMode::Content, RoleFilter::All, false);
    assert_eq!(results.len(), 0, "Should not find session with keyword in thinking (include_tools=false)");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_empty_sessions_list() {
    let sessions: Vec<SessionInfo> = vec![];

    let results = search_sessions(&sessions, "test", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 0, "Empty sessions list should return no results");
}

#[test]
fn test_special_characters() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_special");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Test with symbols: @#$%^&*()_+-=[]{}|;':\",./<>?"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Test with symbols".to_string(),
        all_messages_text: "Test with symbols: @#$%^&*()_+-=[]{}|;':\",./<>?".to_string(),
    }];

    // Test searching for text without special characters
    let results = search_sessions(&sessions, "test", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with 'test'");

    // Test searching for text with special characters
    let results = search_sessions(&sessions, "@#$", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with special characters");

    cleanup_test_dir(&test_dir);
}

#[test]
fn test_unicode_search() {
    let test_dir = PathBuf::from("/tmp/pi_search_test_unicode");
    fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"这是一个中文测试"}]}}"#;
    let session_path = create_test_session_file(&test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/test".to_string(),
        name: Some("中文会话".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "这是一个中文测试".to_string(),
        all_messages_text: "这是一个中文测试".to_string(),
    }];

    // Test Chinese search
    let results = search_sessions(&sessions, "中文", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with Chinese text");

    // Test partial Chinese search
    let results = search_sessions(&sessions, "测试", SearchMode::Content, RoleFilter::All, true);
    assert_eq!(results.len(), 1, "Should find session with partial Chinese text");

    cleanup_test_dir(&test_dir);
}