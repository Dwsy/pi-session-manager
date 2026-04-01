use chrono::Utc;
/// Subagent Cost Integration Test
/// Validate the full flow of subagent cost scanning, aggregation, and statistics
use pi_session_manager::models::{AgentStats, SubagentRunInfo, SubagentSummary};
use pi_session_manager::subagent::{aggregate_runs, parse_meta_json, scan_subagent_artifacts};
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

/// Create a test meta.json file
fn create_meta_json(
    dir: &PathBuf,
    run_id: &str,
    agent: &str,
    model: &str,
    cost: f64,
    input: u64,
    output: u64,
) -> PathBuf {
    let file_path = dir.join(format!("{run_id}_{agent}_meta.json"));
    let content = format!(
        r#"{{
            "runId": "{}",
            "agent": "{}",
            "model": "{}",
            "exitCode": 0,
            "usage": {{
                "input": {},
                "output": {},
                "cacheRead": 0,
                "cacheWrite": 0,
                "cost": {},
                "turns": 1
            }},
            "durationMs": 1000,
            "toolCount": 5,
            "timestamp": {}
        }}"#,
        run_id,
        agent,
        model,
        input,
        output,
        cost,
        Utc::now().timestamp_millis()
    );
    fs::write(&file_path, content).expect("Failed to write meta.json");
    file_path
}

/// Test 1: Parse a single meta.json file
#[test]
fn test_parse_single_meta_json() {
    let json = r#"{
        "runId": "test123",
        "agent": "worker",
        "model": "claude-sonnet-4",
        "exitCode": 0,
        "usage": {
            "input": 1000,
            "output": 500,
            "cacheRead": 200,
            "cacheWrite": 100,
            "cost": 0.015,
            "turns": 5
        },
        "durationMs": 5000,
        "toolCount": 3,
        "timestamp": 1234567890
    }"#;

    let info = parse_meta_json(json).expect("Should parse valid JSON");
    assert_eq!(info.run_id, "test123");
    assert_eq!(info.agent, "worker");
    assert_eq!(info.model, "claude-sonnet-4");
    assert_eq!(info.exit_code, 0);
    assert!((info.cost - 0.015).abs() < 1e-9);
    assert_eq!(info.input_tokens, 1000);
    assert_eq!(info.output_tokens, 500);
    assert_eq!(info.cache_read_tokens, 200);
    assert_eq!(info.cache_write_tokens, 100);
    assert_eq!(info.duration_ms, 5000);
    assert_eq!(info.tool_count, 3);
    assert_eq!(info.timestamp, 1234567890);
}

/// Test 2: Aggregate multiple subagent run records
#[test]
fn test_aggregate_multiple_runs() {
    let runs = vec![
        SubagentRunInfo {
            run_id: "run1".to_string(),
            agent: "scout".to_string(),
            model: "haiku".to_string(),
            exit_code: 0,
            cost: 0.01,
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            duration_ms: 2000,
            tool_count: 2,
            timestamp: 1000,
            turns: 2,
        },
        SubagentRunInfo {
            run_id: "run2".to_string(),
            agent: "worker".to_string(),
            model: "sonnet".to_string(),
            exit_code: 0,
            cost: 0.05,
            input_tokens: 5000,
            output_tokens: 2000,
            cache_read_tokens: 1000,
            cache_write_tokens: 500,
            duration_ms: 10000,
            tool_count: 8,
            timestamp: 2000,
            turns: 3,
        },
        SubagentRunInfo {
            run_id: "run3".to_string(),
            agent: "worker".to_string(),
            model: "opus".to_string(),
            exit_code: 0,
            cost: 0.15,
            input_tokens: 10000,
            output_tokens: 5000,
            cache_read_tokens: 2000,
            cache_write_tokens: 1000,
            duration_ms: 20000,
            tool_count: 15,
            timestamp: 3000,
            turns: 5,
        },
    ];

    let summary = aggregate_runs(&runs);

    // Verify totals
    assert_eq!(summary.total_runs, 3);
    assert!((summary.total_cost - 0.21).abs() < 1e-9); // 0.01 + 0.05 + 0.15
    assert_eq!(summary.total_tokens, 23500); // (1000+500) + (5000+2000+1000+500) + (10000+5000+2000+1000)

    // Verify grouping by agent
    assert_eq!(summary.runs_by_agent.len(), 2);
    assert_eq!(summary.runs_by_agent["scout"].runs, 1);
    assert!((summary.runs_by_agent["scout"].cost - 0.01).abs() < 1e-9);
    assert_eq!(summary.runs_by_agent["worker"].runs, 2);
    assert!((summary.runs_by_agent["worker"].cost - 0.20).abs() < 1e-9);

    // Verify grouping by model
    assert_eq!(summary.runs_by_model.len(), 3);
    assert!((summary.runs_by_model["haiku"] - 0.01).abs() < 1e-9);
    assert!((summary.runs_by_model["sonnet"] - 0.05).abs() < 1e-9);
    assert!((summary.runs_by_model["opus"] - 0.15).abs() < 1e-9);
}

/// Test 3: Scan subagent artifacts in directories
#[test]
fn test_scan_subagent_artifacts() {
    // Create temporary directory structure
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let session_dir = temp_dir.path().join("session1");
    let artifacts_dir = session_dir.join("subagent-artifacts");
    fs::create_dir_all(&artifacts_dir).expect("Failed to create artifacts dir");

    // Create 3 meta.json files
    create_meta_json(&artifacts_dir, "abc123", "scout", "haiku", 0.02, 2000, 1000);
    create_meta_json(
        &artifacts_dir,
        "def456",
        "worker",
        "sonnet",
        0.08,
        8000,
        4000,
    );
    create_meta_json(
        &artifacts_dir,
        "ghi789",
        "reviewer",
        "opus",
        0.25,
        15000,
        8000,
    );

    // Scan artifacts (without DB cache)
    let session_dirs = vec![session_dir.clone()];
    let summary = scan_subagent_artifacts(&session_dirs, None);

    // Verify scan results
    assert_eq!(summary.total_runs, 3);
    assert!((summary.total_cost - 0.35).abs() < 1e-9); // 0.02 + 0.08 + 0.25
    assert_eq!(summary.runs_by_agent.len(), 3);
    assert!(summary.runs_by_agent.contains_key("scout"));
    assert!(summary.runs_by_agent.contains_key("worker"));
    assert!(summary.runs_by_agent.contains_key("reviewer"));

    println!(
        "✅ Scan test passed: {} runs, ${:.4} total cost",
        summary.total_runs, summary.total_cost
    );
}

/// Test 4: Rescan after file modification
#[test]
fn test_subagent_file_modification() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let session_dir = temp_dir.path().join("session_cached");
    let artifacts_dir = session_dir.join("subagent-artifacts");
    fs::create_dir_all(&artifacts_dir).expect("Failed to create artifacts dir");

    // Create meta.json
    let meta_path = create_meta_json(
        &artifacts_dir,
        "cache_test",
        "worker",
        "sonnet",
        0.10,
        5000,
        2500,
    );

    // First scan
    let summary1 = scan_subagent_artifacts(&[session_dir.clone()], None);
    assert_eq!(summary1.total_runs, 1);
    assert!((summary1.total_cost - 0.10).abs() < 1e-9);

    // Modify file content
    fs::write(&meta_path, r#"{"runId": "cache_test", "agent": "worker", "model": "opus", "exitCode": 0, "usage": {"input": 9999, "output": 9999, "cacheRead": 0, "cacheWrite": 0, "cost": 0.99, "turns": 1}, "durationMs": 9999, "toolCount": 99, "timestamp": 9999999999}"#)
        .expect("Failed to modify file");

    // Second scan - should read updated values
    let summary2 = scan_subagent_artifacts(&[session_dir.clone()], None);
    assert_eq!(summary2.total_runs, 1);
    assert!((summary2.total_cost - 0.99).abs() < 1e-9);
    assert!(summary2.runs_by_model.contains_key("opus"));

    println!("✅ File modification test passed: re-scanning picks up changes");
}

/// Test 5: Full subagent scan integration test
#[test]
fn test_full_subagent_scanning_integration() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");

    // Create session directories and subagent artifacts
    let session_dir = temp_dir.path().join("test_session");
    let artifacts_dir = session_dir.join("subagent-artifacts");
    fs::create_dir_all(&artifacts_dir).expect("Failed to create artifacts dir");

    // Create subagent run records
    create_meta_json(&artifacts_dir, "s1", "scout", "haiku", 0.03, 3000, 1500);
    create_meta_json(&artifacts_dir, "w1", "worker", "sonnet", 0.12, 12000, 6000);

    // Scan artifacts
    let summary = scan_subagent_artifacts(&[session_dir], None);

    // Verify subagent stats
    assert_eq!(summary.total_runs, 2);
    assert!((summary.total_cost - 0.15).abs() < 1e-9); // 0.03 + 0.12
    assert_eq!(summary.runs_by_agent.len(), 2);
    assert!(summary.runs_by_agent.contains_key("scout"));
    assert!(summary.runs_by_agent.contains_key("worker"));

    // Verify token stats
    let expected_subagent_tokens = (3000 + 1500) + (12000 + 6000); // 22500
    assert_eq!(summary.total_tokens, expected_subagent_tokens);

    println!("✅ Full integration test passed:");
    println!("   - Subagent runs: {}", summary.total_runs);
    println!("   - Subagent cost: ${:.4}", summary.total_cost);
    println!("   - Subagent tokens: {}", summary.total_tokens);
}

/// Test 6: Handling empty subagent directories
#[test]
fn test_empty_subagent_directory() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let session_dir = temp_dir.path().join("empty_session");
    let artifacts_dir = session_dir.join("subagent-artifacts");
    fs::create_dir_all(&artifacts_dir).expect("Failed to create artifacts dir");

    // Do not create any meta.json files

    let summary = scan_subagent_artifacts(&[session_dir], None);

    // Should return empty stats without errors
    assert_eq!(summary.total_runs, 0);
    assert_eq!(summary.total_cost, 0.0);
    assert_eq!(summary.total_tokens, 0);
    assert!(summary.runs_by_agent.is_empty());
    assert!(summary.runs_by_model.is_empty());

    println!("✅ Empty directory test passed: gracefully handles no artifacts");
}

/// Test 7: Subagent aggregation across multiple session directories
#[test]
fn test_multiple_session_directories() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");

    // Create 3 independent session directories
    let session1 = temp_dir.path().join("project_a");
    let session2 = temp_dir.path().join("project_b");
    let session3 = temp_dir.path().join("project_c");

    for dir in [&session1, &session2, &session3] {
        fs::create_dir_all(dir.join("subagent-artifacts")).expect("Failed to create artifacts dir");
    }

    // Each session has different subagent runs
    create_meta_json(
        &session1.join("subagent-artifacts"),
        "a1",
        "scout",
        "haiku",
        0.01,
        1000,
        500,
    );
    create_meta_json(
        &session2.join("subagent-artifacts"),
        "b1",
        "worker",
        "sonnet",
        0.05,
        5000,
        2500,
    );
    create_meta_json(
        &session3.join("subagent-artifacts"),
        "c1",
        "reviewer",
        "opus",
        0.20,
        10000,
        5000,
    );
    create_meta_json(
        &session3.join("subagent-artifacts"),
        "c2",
        "worker",
        "sonnet",
        0.08,
        8000,
        4000,
    );

    let summary = scan_subagent_artifacts(&[session1, session2, session3], None);

    // Verify cross-directory aggregation
    assert_eq!(summary.total_runs, 4);
    assert!((summary.total_cost - 0.34).abs() < 1e-9); // 0.01 + 0.05 + 0.20 + 0.08

    // Verify agent distribution
    assert_eq!(summary.runs_by_agent.len(), 3);
    assert_eq!(summary.runs_by_agent["scout"].runs, 1);
    assert_eq!(summary.runs_by_agent["worker"].runs, 2);
    assert_eq!(summary.runs_by_agent["reviewer"].runs, 1);

    println!(
        "✅ Multiple directories test passed: correctly aggregates across {} sessions",
        summary.total_runs
    );
}

/// Test 8: Fault tolerance for corrupted meta.json files
#[test]
fn test_malformed_meta_json_graceful_handling() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let session_dir = temp_dir.path().join("malformed_session");
    let artifacts_dir = session_dir.join("subagent-artifacts");
    fs::create_dir_all(&artifacts_dir).expect("Failed to create artifacts dir");

    // Create one valid file
    create_meta_json(&artifacts_dir, "good", "worker", "sonnet", 0.10, 5000, 2500);

    // Create a corrupted file
    fs::write(
        artifacts_dir.join("bad_meta.json"),
        "this is not valid json {{{",
    )
    .expect("Failed to write bad file");

    fs::write(artifacts_dir.join("empty_meta.json"), "").expect("Failed to write empty file");

    // Should not panic; gracefully skip corrupted files
    let summary = scan_subagent_artifacts(&[session_dir], None);

    // Count only valid files
    assert_eq!(summary.total_runs, 1);
    assert!((summary.total_cost - 0.10).abs() < 1e-9);

    println!("✅ Malformed JSON test passed: gracefully skips invalid files");
}
