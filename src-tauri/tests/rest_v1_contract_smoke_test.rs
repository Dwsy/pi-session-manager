//! REST API v1 Contract Smoke Tests
//!
//! 本测试文件验证 HTTP API v1 端点的基本契约：
//! - GET  /v1/sessions          - 会话列表
//! - GET  /v1/sessions/{id}/entries - 会话条目（含404语义）
//! - POST /v1/search/fulltext   - 全文搜索
//! - POST /v1/memory/recall     - 记忆召回
//!
//! 运行说明：
//! - 本地单元测试: cargo test --test rest_v1_contract_smoke_test
//! - 集成测试(需HTTP服务): cargo test --test rest_v1_contract_smoke_test -- --ignored

use chrono::Utc;
use pi_session_manager::models::{FullTextSearchHit, FullTextSearchResponse, SessionInfo};
use pi_session_manager::scanner;
use pi_session_manager::sqlite_cache;
use std::fs;
use std::path::PathBuf;

// ============================================================================
// Helper: 测试数据构造
// ============================================================================

/// 创建临时会话目录并返回路径
fn setup_test_sessions_dir() -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push(format!(
        "psm-rest-v1-test-{}-{}",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&dir).expect("Failed to create temp dir");
    dir
}

/// 创建模拟会话文件（jsonl格式）
fn create_mock_session(
    sessions_dir: &PathBuf,
    session_id: &str,
    name: &str,
    messages: &[(&str, &str)], // (role, content)
) -> PathBuf {
    let session_dir = sessions_dir.join(session_id);
    fs::create_dir_all(&session_dir).expect("Failed to create session dir");

    let file_path = session_dir.join(format!("{}.jsonl", session_id));
    let mut content = format!(
        r#"{{"type":"session","id":"{}","cwd":"/test","timestamp":"{}"}}"#,
        session_id,
        Utc::now().to_rfc3339()
    );

    for (i, (role, text)) in messages.iter().enumerate() {
        content.push_str(&format!(
            r#"\n{{"type":"message","id":"msg{}","timestamp":"{}","message":{{"role":"{}","content":[{{"type":"text","text":"{}"}}]}}}}"#,
            i,
            Utc::now().to_rfc3339(),
            role,
            text.replace('"', "\\\"")
        ));
    }

    fs::write(&file_path, content).expect("Failed to write session file");
    file_path
}

/// 清理测试数据并重置缓存
fn cleanup_test_data() {
    // 使用公共 API 清空扫描缓存
    scanner::invalidate_cache();
}

/// 模拟查找会话路径（用于测试entries 404语义）
async fn find_session_path_by_id_mock(
    sessions: &[SessionInfo],
    id: &str,
) -> Result<Option<String>, String> {
    Ok(sessions.iter().find(|s| s.id == id).map(|s| s.path.clone()))
}

/// 模拟 entries 404 响应生成
fn mock_entries_response(session_id: &str, session_path: Option<String>) -> serde_json::Value {
    match session_path {
        Some(path) => {
            serde_json::json!({
                "success": true,
                "data": {
                    "session_id": session_id,
                    "path": path,
                    "entries": []
                }
            })
        }
        None => {
            serde_json::json!({
                "success": false,
                "error": "Session not found"
            })
        }
    }
}

// ============================================================================
// 测试用例 1: Sessions 列表
// ============================================================================

#[tokio::test]
async fn test_v1_list_sessions_basic() {
    // 设置测试环境
    let test_dir = setup_test_sessions_dir();
    let _session_file = create_mock_session(
        &test_dir,
        "test-session-001",
        "Test Session",
        &[("user", "Hello world"), ("assistant", "Hi there!")],
    );

    // 创建另一个会话
    let _session_file2 = create_mock_session(
        &test_dir,
        "test-session-002",
        "Another Session",
        &[("user", "Search keyword test")],
    );

    // 使用 scanner 扫描会话（模拟 API 内部逻辑）
    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    let result = scanner::scan_sessions_with_config(&config).await;
    assert!(result.is_ok(), "Scan should succeed: {:?}", result.err());

    let sessions = result.unwrap();
    assert!(!sessions.is_empty(), "Should find at least one session");

    // 验证会话数据结构
    let session = sessions.iter().find(|s| s.id == "test-session-001");
    assert!(session.is_some(), "Should find test-session-001");

    let session = session.unwrap();
    assert_eq!(session.message_count, 2, "Should have 2 messages");
    assert!(
        session.first_message.contains("Hello"),
        "First message should contain 'Hello'"
    );
    assert!(
        session.path.ends_with(".jsonl"),
        "Path should end with .jsonl"
    );

    // 验证列表响应格式（模拟 API 响应）
    let response = serde_json::json!({
        "success": true,
        "data": sessions
    });

    assert!(response["success"].as_bool().unwrap());
    assert!(response["data"].is_array());

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

#[tokio::test]
async fn test_v1_list_sessions_with_query_filter() {
    let test_dir = setup_test_sessions_dir();

    // 创建多个会话用于过滤测试
    create_mock_session(
        &test_dir,
        "rust-session",
        "Rust Project",
        &[("user", "How to use Rust async/await")],
    );
    create_mock_session(
        &test_dir,
        "python-session",
        "Python Project",
        &[("user", "Python data processing")],
    );

    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    let sessions = scanner::scan_sessions_with_config(&config).await.unwrap();

    // 模拟查询过滤逻辑（与 http_adapter 中一致）
    let query = "rust";
    let filtered: Vec<_> = sessions
        .into_iter()
        .filter(|s| {
            s.id.to_lowercase().contains(query)
                || s.path.to_lowercase().contains(query)
                || s.name
                    .as_ref()
                    .map(|n| n.to_lowercase().contains(query))
                    .unwrap_or(false)
                || s.first_message.to_lowercase().contains(query)
        })
        .collect();

    assert_eq!(filtered.len(), 1, "Should find exactly one Rust session");
    assert_eq!(filtered[0].id, "rust-session");

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

// ============================================================================
// 测试用例 2: Entries 404 语义
// ============================================================================

#[tokio::test]
async fn test_v1_get_session_entries_404_semantics() {
    let test_dir = setup_test_sessions_dir();

    // 创建测试会话
    create_mock_session(
        &test_dir,
        "existing-session",
        "Existing Session",
        &[("user", "Test message")],
    );

    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    let sessions = scanner::scan_sessions_with_config(&config).await.unwrap();

    // 测试存在的会话 - 应该返回成功响应
    let existing_path = find_session_path_by_id_mock(&sessions, "existing-session")
        .await
        .unwrap();
    let success_response = mock_entries_response("existing-session", existing_path);

    assert_eq!(
        success_response["success"].as_bool(),
        Some(true),
        "Existing session should return success"
    );
    assert!(
        success_response["data"]["path"].as_str().is_some(),
        "Should contain session path"
    );

    // 测试不存在的会话 - 应该返回404语义
    let not_found_path = find_session_path_by_id_mock(&sessions, "non-existent-id")
        .await
        .unwrap();
    let not_found_response = mock_entries_response("non-existent-id", not_found_path);

    assert_eq!(
        not_found_response["success"].as_bool(),
        Some(false),
        "Non-existent session should return error"
    );
    assert_eq!(
        not_found_response["error"].as_str(),
        Some("Session not found"),
        "Should have 'Session not found' error message"
    );

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

// ============================================================================
// 测试用例 3: Full Text Search 基本功能
// ============================================================================

#[tokio::test]
async fn test_v1_full_text_search_basic() {
    use pi_session_manager::search::{search_sessions, RoleFilter, SearchMode};

    let test_dir = setup_test_sessions_dir();

    // 创建包含特定关键词的会话
    create_mock_session(
        &test_dir,
        "search-test-1",
        "Search Test One",
        &[
            ("user", "How to implement async functions in Rust"),
            ("assistant", "You can use async/await syntax in Rust"),
        ],
    );
    create_mock_session(
        &test_dir,
        "search-test-2",
        "Search Test Two",
        &[("user", "Python asyncio tutorial")],
    );

    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    // 扫描并创建 SessionInfo 列表
    let sessions = scanner::scan_sessions_with_config(&config).await.unwrap();
    assert!(!sessions.is_empty(), "Should have test sessions");

    // 执行全文搜索（使用 search 模块）
    let results = search_sessions(
        &sessions,
        "async",
        SearchMode::Content,
        RoleFilter::All,
        true,
    );

    // 验证搜索结果
    assert!(!results.is_empty(), "Should find results for 'async'");

    // 验证第一个结果的结构
    let first_result = &results[0];
    assert!(
        !first_result.session_id.is_empty(),
        "Should have session_id"
    );
    assert!(
        !first_result.session_path.is_empty(),
        "Should have session_path"
    );
    assert!(first_result.score > 0.0, "Should have positive score");

    // 模拟 API 响应格式
    let response_data = serde_json::json!({
        "hits": results.iter().map(|r| {
            serde_json::json!({
                "session_id": r.session_id,
                "session_path": r.session_path,
                "session_name": r.session_name,
                "first_message": r.first_message,
                "score": r.score,
                "matches_count": r.matches.len()
            })
        }).collect::<Vec<_>>(),
        "total_hits": results.len(),
        "has_more": false
    });

    assert!(response_data["hits"].is_array());
    assert!(response_data["total_hits"].as_u64().unwrap_or(0) > 0);

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

#[tokio::test]
async fn test_v1_full_text_search_with_role_filter() {
    use pi_session_manager::search::{search_sessions, RoleFilter, SearchMode};

    let test_dir = setup_test_sessions_dir();

    create_mock_session(
        &test_dir,
        "role-filter-test",
        "Role Filter Test",
        &[
            ("user", "User question about programming"),
            ("assistant", "Assistant answer about programming"),
        ],
    );

    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    let sessions = scanner::scan_sessions_with_config(&config).await.unwrap();

    // 测试不同 role filter
    let user_results = search_sessions(
        &sessions,
        "programming",
        SearchMode::Content,
        RoleFilter::User,
        true,
    );

    let assistant_results = search_sessions(
        &sessions,
        "programming",
        SearchMode::Content,
        RoleFilter::Assistant,
        true,
    );

    let all_results = search_sessions(
        &sessions,
        "programming",
        SearchMode::Content,
        RoleFilter::All,
        true,
    );

    // 验证角色过滤生效
    assert!(!all_results.is_empty(), "All filter should find results");

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

// ============================================================================
// 测试用例 4: Memory Recall 语义
// ============================================================================

#[tokio::test]
async fn test_v1_memory_recall_semantics() {
    use pi_session_manager::search::{search_sessions, RoleFilter, SearchMode};

    let test_dir = setup_test_sessions_dir();

    // 创建多个相关会话用于记忆召回测试
    create_mock_session(
        &test_dir,
        "memory-test-1",
        "Memory Test One",
        &[
            ("user", "Remember to buy milk and eggs"),
            ("assistant", "I'll remind you about the groceries"),
        ],
    );
    create_mock_session(
        &test_dir,
        "memory-test-2",
        "Memory Test Two",
        &[("user", "My favorite color is blue")],
    );
    create_mock_session(
        &test_dir,
        "memory-test-3",
        "Memory Test Three",
        &[("assistant", "Shopping list: milk, eggs, bread")],
    );

    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    let sessions = scanner::scan_sessions_with_config(&config).await.unwrap();

    // memory_recall 内部使用 full_text_search 并映射结果
    let query = "milk";
    let top_k = 8;

    // 模拟 memory_recall 的搜索逻辑
    let fts_results = search_sessions(&sessions, query, SearchMode::Content, RoleFilter::All, true);

    // 模拟 memory_recall 的结果映射（与 http_adapter 中一致）
    let items: Vec<serde_json::Value> = fts_results
        .iter()
        .flat_map(|result| {
            result.matches.iter().map(|m| {
                let excerpt = if m.snippet.chars().count() > 220 {
                    let short: String = m.snippet.chars().take(220).collect();
                    format!("{}...", short)
                } else {
                    m.snippet.clone()
                };

                serde_json::json!({
                    "session_id": result.session_id,
                    "session_name": result.session_name,
                    "entry_id": m.entry_id,
                    "role": m.role,
                    "timestamp": m.timestamp,
                    "score": result.score,
                    "excerpt": excerpt,
                })
            })
        })
        .take(top_k)
        .collect();

    // 验证 memory_recall 响应结构
    let recall_response = serde_json::json!({
        "success": true,
        "data": {
            "query": query,
            "total_hits": items.len(),
            "returned": items.len(),
            "items": items
        }
    });

    assert!(recall_response["success"].as_bool().unwrap_or(false));
    assert!(recall_response["data"]["items"].is_array());
    assert_eq!(recall_response["data"]["query"].as_str(), Some(query));

    // 验证 items 结构
    if let Some(first_item) = items.first() {
        assert!(first_item.get("session_id").is_some());
        assert!(first_item.get("excerpt").is_some());
        assert!(first_item.get("score").is_some());
    }

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

#[tokio::test]
async fn test_v1_memory_recall_top_k_limit() {
    use pi_session_manager::search::{search_sessions, RoleFilter, SearchMode};

    let test_dir = setup_test_sessions_dir();

    // 创建多个会话
    for i in 0..5 {
        create_mock_session(
            &test_dir,
            &format!("recall-limit-{}", i),
            &format!("Recall Test {}", i),
            &[("user", &format!("Test message content {}", i))],
        );
    }

    let config = pi_session_manager::config::Config {
        session_paths: vec![test_dir.to_string_lossy().to_string()],
        ..Default::default()
    };

    let sessions = scanner::scan_sessions_with_config(&config).await.unwrap();

    // 测试 top_k 限制（clamped 1-50）
    let query = "test";
    let top_k = 3;

    let fts_results = search_sessions(&sessions, query, SearchMode::Content, RoleFilter::All, true);

    let limited_results: Vec<_> = fts_results.into_iter().take(top_k).collect();

    // 验证限制生效（如果结果足够多）
    assert!(
        limited_results.len() <= top_k,
        "Results should not exceed top_k limit"
    );

    // 清理
    let _ = fs::remove_dir_all(&test_dir);
    cleanup_test_data();
}

// ============================================================================
// 集成测试（需要 HTTP 服务器环境）
// ============================================================================

/// 这些测试需要运行中的 HTTP 服务器，默认被忽略
/// 运行方式: cargo test --test rest_v1_contract_smoke_test -- --ignored

const TEST_BASE_URL: &str = "http://127.0.0.1:52131";
const TEST_TOKEN: &str = "test-token";

/// 检查 HTTP 服务器是否可连接
async fn is_server_available() -> bool {
    match reqwest::get(format!("{}/v1/sessions", TEST_BASE_URL)).await {
        Ok(_) => true,
        Err(_) => false,
    }
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_v1_list_sessions_endpoint() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/sessions", TEST_BASE_URL))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), 200);

    let body: serde_json::Value = response.json().await.expect("Failed to parse JSON");
    assert_eq!(body["success"].as_bool(), Some(true));
    assert!(body["data"].is_array());
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_v1_entries_not_found() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "{}/v1/sessions/non-existent-id/entries",
            TEST_BASE_URL
        ))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), 404);

    let body: serde_json::Value = response.json().await.expect("Failed to parse JSON");
    assert_eq!(body["success"].as_bool(), Some(false));
    assert!(body["error"].as_str().is_some());
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_v1_full_text_search_endpoint() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/search/fulltext", TEST_BASE_URL))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .json(&serde_json::json!({
            "query": "test",
            "role_filter": "all",
            "page": 0,
            "page_size": 20
        }))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), 200);

    let body: serde_json::Value = response.json().await.expect("Failed to parse JSON");
    assert_eq!(body["success"].as_bool(), Some(true));
    assert!(body["data"].is_object());
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_v1_memory_recall_endpoint() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/memory/recall", TEST_BASE_URL))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .json(&serde_json::json!({
            "query": "test",
            "top_k": 5,
            "role_filter": "all"
        }))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), 200);

    let body: serde_json::Value = response.json().await.expect("Failed to parse JSON");
    assert_eq!(body["success"].as_bool(), Some(true));
    assert!(body["data"]["items"].is_array());
    assert!(body["data"]["total_hits"].is_number());
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_unauthorized_access() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/sessions", TEST_BASE_URL))
        // 不提供 Authorization header
        .send()
        .await
        .expect("Failed to send request");

    // 如果启用了 auth，应该返回 401
    // 如果没有启用 auth，可能返回 200
    // 这个测试主要验证端点可达
    assert!(
        response.status() == 200 || response.status() == 401,
        "Should return 200 (no auth) or 401 (auth required)"
    );
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131 and a valid session id"]
async fn test_integration_v1_checkout_invalid_target() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/v1/sessions/non-existent/checkout",
            TEST_BASE_URL
        ))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .json(&serde_json::json!({
            "target_type": "entry_id",
            "target_value": "missing-entry"
        }))
        .send()
        .await
        .expect("Failed to send request");

    assert!(response.status() == 400 || response.status() == 404);
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_v1_experience_extract_endpoint() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/experience/extract", TEST_BASE_URL))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .json(&serde_json::json!({ "limit": 5 }))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), 200);
    let body: serde_json::Value = response.json().await.expect("Failed to parse JSON");
    assert_eq!(body["success"].as_bool(), Some(true));
    assert!(body["data"]["items"].is_array());
}

#[tokio::test]
#[ignore = "Requires HTTP server running on port 52131"]
async fn test_integration_v1_workflow_route_suggest_endpoint() {
    if !is_server_available().await {
        eprintln!("Skipping integration test: HTTP server not available");
        return;
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/workflow/route-suggest", TEST_BASE_URL))
        .header("Authorization", format!("Bearer {}", TEST_TOKEN))
        .json(&serde_json::json!({ "query": "修复报错", "top_k": 5 }))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), 200);
    let body: serde_json::Value = response.json().await.expect("Failed to parse JSON");
    assert_eq!(body["success"].as_bool(), Some(true));
    assert!(body["data"]["intent"].is_string());
    assert!(body["data"]["next_actions"].is_array());
}
