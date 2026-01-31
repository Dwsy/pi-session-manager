use pi_session_manager::{models::SessionInfo, search};

fn main() {
    println!("=== Pi Session Manager Search POC Test ===\n");

    // 创建测试数据
    let test_sessions = vec![
        SessionInfo {
            id: "test-1".to_string(),
            name: Some("资产管理系统".to_string()),
            path: "/tmp/test-session-1.jsonl".to_string(),
            cwd: "/Users/test/project1".to_string(),
            first_message: "实现资产管理功能".to_string(),
            last_message: "完成资产列表".to_string(),
            last_message_role: "assistant".to_string(),
            message_count: 10,
            created: chrono::Utc::now(),
            modified: chrono::Utc::now(),
            all_messages_text: "资产管理系统 实现资产管理功能 完成资产列表 资产数据".to_string(),
        },
        SessionInfo {
            id: "test-2".to_string(),
            name: Some("用户认证".to_string()),
            path: "/tmp/test-session-2.jsonl".to_string(),
            cwd: "/Users/test/project2".to_string(),
            first_message: "添加用户登录功能".to_string(),
            last_message: "完成认证".to_string(),
            last_message_role: "assistant".to_string(),
            message_count: 5,
            created: chrono::Utc::now(),
            modified: chrono::Utc::now(),
            all_messages_text: "用户认证 添加用户登录功能 完成认证".to_string(),
        },
        SessionInfo {
            id: "test-3".to_string(),
            name: Some("数据库优化".to_string()),
            path: "/tmp/test-session-3.jsonl".to_string(),
            cwd: "/Users/test/project3".to_string(),
            first_message: "优化数据库查询".to_string(),
            last_message: "完成索引".to_string(),
            last_message_role: "assistant".to_string(),
            message_count: 8,
            created: chrono::Utc::now(),
            modified: chrono::Utc::now(),
            all_messages_text: "数据库优化 优化数据库查询 完成索引".to_string(),
        },
    ];

    // 测试 1: 搜索 "资产"
    println!("Test 1: 搜索 '资产'");
    let results = search::search_sessions(
        &test_sessions,
        "资产",
        search::SearchMode::Content,
        search::RoleFilter::All,
        false,
    );
    println!("  结果数量: {}", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("  [{}] Session: {} (score: {})", i + 1, result.session_name.as_ref().unwrap_or(&"N/A".to_string()), result.score);
        println!("      First message: {}", result.first_message);
        println!("      Matches: {}", result.matches.len());
    }
    println!();

    // 测试 2: 搜索 "用户"
    println!("Test 2: 搜索 '用户'");
    let results = search::search_sessions(
        &test_sessions,
        "用户",
        search::SearchMode::Content,
        search::RoleFilter::All,
        false,
    );
    println!("  结果数量: {}", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("  [{}] Session: {} (score: {})", i + 1, result.session_name.as_ref().unwrap_or(&"N/A".to_string()), result.score);
    }
    println!();

    // 测试 3: 搜索 "数据库"
    println!("Test 3: 搜索 '数据库'");
    let results = search::search_sessions(
        &test_sessions,
        "数据库",
        search::SearchMode::Content,
        search::RoleFilter::All,
        false,
    );
    println!("  结果数量: {}", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("  [{}] Session: {} (score: {})", i + 1, result.session_name.as_ref().unwrap_or(&"N/A".to_string()), result.score);
    }
    println!();

    // 测试 4: 搜索不存在的内容
    println!("Test 4: 搜索 'xyz123'");
    let results = search::search_sessions(
        &test_sessions,
        "xyz123",
        search::SearchMode::Content,
        search::RoleFilter::All,
        false,
    );
    println!("  结果数量: {}", results.len());
    println!();

    // 测试 5: 空查询
    println!("Test 5: 空查询");
    let results = search::search_sessions(
        &test_sessions,
        "",
        search::SearchMode::Content,
        search::RoleFilter::All,
        false,
    );
    println!("  结果数量: {}", results.len());
    println!();

    // 测试 6: 名称搜索模式
    println!("Test 6: 名称搜索 '资产'");
    let results = search::search_sessions(
        &test_sessions,
        "资产",
        search::SearchMode::Name,
        search::RoleFilter::All,
        false,
    );
    println!("  结果数量: {}", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("  [{}] Session: {} (score: {})", i + 1, result.session_name.as_ref().unwrap_or(&"N/A".to_string()), result.score);
    }
    println!();

    println!("=== 所有测试完成 ===");
}
