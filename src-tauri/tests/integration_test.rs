use pi_session_manager::models::{SessionInfo};
use pi_session_manager::search::{search_sessions, SearchMode, RoleFilter};
use pi_session_manager::commands::{scan_sessions, search_sessions as search_sessions_cmd};
use chrono::{DateTime, Utc};
use std::fs;

/// Create a mock session file in the test directory
fn create_mock_session(dir: &str, filename: &str, content: &str) -> String {
    let file_path = format!("{}/{}", dir, filename);
    fs::write(&file_path, content).expect("Failed to write mock session file");
    file_path
}

/// Cleanup test directory
fn cleanup_test_dir(dir: &str) {
    if std::path::Path::new(dir).exists() {
        fs::remove_dir_all(dir).expect("Failed to cleanup test directory");
    }
}

#[test]
fn test_search_integration() {
    let test_dir = "/tmp/pi_integration_test";
    cleanup_test_dir(test_dir);
    fs::create_dir_all(test_dir).expect("Failed to create test directory");

    // Create mock session files
    let session1_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-30T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"How to implement search in Rust?"}]}}"#;
    let session1_path = create_mock_session(test_dir, "session1.jsonl", session1_content);

    let session2_content = r#"{"type":"message","id":"msg2","timestamp":"2025-01-30T01:00:00Z","message":{"role":"user","content":[{"type":"text","text":"I want to learn React"}]}}"#;
    let session2_path = create_mock_session(test_dir, "session2.jsonl", session2_content);

    let session3_content = r#"{"type":"message","id":"msg3","timestamp":"2025-01-30T02:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Here is how you implement search in Rust..."}]}}"#;
    let session3_path = create_mock_session(test_dir, "session3.jsonl", session3_content);

    // Create SessionInfo objects
    let sessions = vec![
        SessionInfo {
            path: session1_path.clone(),
            id: "session1".to_string(),
            cwd: "/projects/rust-search".to_string(),
            name: Some("Rust Search Implementation".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-30T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-30T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "How to implement search in Rust?".to_string(),
            all_messages_text: "How to implement search in Rust?".to_string(),
        },
        SessionInfo {
            path: session2_path.clone(),
            id: "session2".to_string(),
            cwd: "/projects/react-tutorial".to_string(),
            name: Some("React Tutorial".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-30T01:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-30T01:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "I want to learn React".to_string(),
            all_messages_text: "I want to learn React".to_string(),
        },
        SessionInfo {
            path: session3_path.clone(),
            id: "session3".to_string(),
            cwd: "/projects/rust-search".to_string(),
            name: Some("Rust Search Answer".to_string()),
            created: DateTime::parse_from_rfc3339("2025-01-30T02:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            modified: DateTime::parse_from_rfc3339("2025-01-30T02:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            message_count: 1,
            first_message: "Here is how you implement search in Rust...".to_string(),
            all_messages_text: "Here is how you implement search in Rust...".to_string(),
        },
    ];

    // Test 1: Search for "Rust" - should find 2 sessions
    let results = search_sessions(&sessions, "Rust", SearchMode::Content, RoleFilter::All, true);
    println!("\n=== Test 1: Search for 'Rust' ===");
    println!("Found {} results", results.len());
    for result in &results {
        println!("  - Session: {} ({})", result.session_name.as_deref().unwrap_or("Untitled"), result.session_id);
        println!("    Matches: {}", result.matches.len());
    }
    assert_eq!(results.len(), 2, "Should find 2 sessions with 'Rust'");

    // Test 2: Search for "React" - should find 1 session
    let results = search_sessions(&sessions, "React", SearchMode::Content, RoleFilter::All, true);
    println!("\n=== Test 2: Search for 'React' ===");
    println!("Found {} results", results.len());
    assert_eq!(results.len(), 1, "Should find 1 session with 'React'");

    // Test 3: Search by name - "Rust Search Implementation" (AND logic - all words must match)
    let results = search_sessions(&sessions, "Rust Search Implementation", SearchMode::Name, RoleFilter::All, true);
    println!("\n=== Test 3: Search by name 'Rust Search Implementation' ===");
    println!("Found {} results", results.len());
    assert_eq!(results.len(), 1, "Should find 1 session by name (AND logic)");

    // Test 4: Search with role filter - assistant only
    let results = search_sessions(&sessions, "implement", SearchMode::Content, RoleFilter::Assistant, true);
    println!("\n=== Test 4: Search with role filter 'assistant' ===");
    println!("Found {} results", results.len());
    assert_eq!(results.len(), 1, "Should find 1 assistant message");

    // Test 5: Multi-word search (OR logic)
    let results = search_sessions(&sessions, "Rust React", SearchMode::Content, RoleFilter::All, true);
    println!("\n=== Test 5: Multi-word search 'Rust React' ===");
    println!("Found {} results", results.len());
    assert_eq!(results.len(), 3, "Should find all 3 sessions (Rust OR React)");

    // Test 6: Empty query
    let results = search_sessions(&sessions, "", SearchMode::Content, RoleFilter::All, true);
    println!("\n=== Test 6: Empty query ===");
    println!("Found {} results", results.len());
    assert_eq!(results.len(), 0, "Should find 0 sessions with empty query");

    // Test 7: Verify search results contain session metadata
    let results = search_sessions(&sessions, "Rust", SearchMode::Content, RoleFilter::All, true);
    println!("\n=== Test 7: Verify search results metadata ===");
    for result in &results {
        println!("  Session ID: {}", result.session_id);
        println!("  Session Path: {}", result.session_path);
        println!("  Session Name: {:?}", result.session_name);
        println!("  First Message: {}", result.first_message);
        println!("  Score: {}", result.score);
        println!("  Matches: {}", result.matches.len());
        if !result.matches.is_empty() {
            println!("    First match role: {}", result.matches[0].role);
            println!("    First match snippet: {}", result.matches[0].snippet.chars().take(50).collect::<String>());
        }
        assert!(!result.session_id.is_empty(), "Session ID should not be empty");
        assert!(!result.session_path.is_empty(), "Session path should not be empty");
        assert!(result.score > 0.0, "Score should be positive");
    }

    cleanup_test_dir(test_dir);
    println!("\n=== All integration tests passed! ===");
}

#[test]
fn test_search_results_mapping() {
    let test_dir = "/tmp/pi_mapping_test";
    cleanup_test_dir(test_dir);
    fs::create_dir_all(test_dir).expect("Failed to create test directory");

    let session_content = r#"{"type":"message","id":"msg1","timestamp":"2025-01-30T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Test search functionality"}]}}"#;
    let session_path = create_mock_session(test_dir, "session1.jsonl", session_content);

    let sessions = vec![SessionInfo {
        path: session_path.clone(),
        id: "session1".to_string(),
        cwd: "/projects/my-project".to_string(),
        name: Some("My Test Session".to_string()),
        created: DateTime::parse_from_rfc3339("2025-01-30T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        modified: DateTime::parse_from_rfc3339("2025-01-30T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        message_count: 1,
        first_message: "Test search functionality".to_string(),
        all_messages_text: "Test search functionality".to_string(),
    }];

    let results = search_sessions(&sessions, "test", SearchMode::Content, RoleFilter::All, true);

    println!("\n=== Test: Search Results Mapping ===");
    println!("Original session cwd: {}", sessions[0].cwd);
    println!("Original session name: {:?}", sessions[0].name);

    // Simulate frontend mapping
    for result in &results {
        let original_session = sessions.iter().find(|s| s.id == result.session_id);
        assert!(original_session.is_some(), "Should find original session by ID");

        let mapped = SessionInfo {
            path: result.session_path.clone(),
            id: result.session_id.clone(),
            cwd: original_session.unwrap().cwd.clone(),
            name: result.session_name.clone().or_else(|| original_session.unwrap().name.clone()),
            created: original_session.unwrap().created,
            modified: original_session.unwrap().modified,
            message_count: result.matches.len(),
            first_message: result.first_message.clone(),
            all_messages_text: String::new(),
        };

        println!("Mapped session cwd: {}", mapped.cwd);
        println!("Mapped session name: {:?}", mapped.name);
        assert_eq!(mapped.cwd, "/projects/my-project", "cwd should be preserved");
        assert_eq!(mapped.name, Some("My Test Session".to_string()), "name should be preserved");
    }

    cleanup_test_dir(test_dir);
    println!("=== Mapping test passed! ===");
}