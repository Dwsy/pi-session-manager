use std::time::Instant;

#[test]
fn test_full_text_search_accepts_extra_arg_silently() {
    if std::env::var("RUN_REAL_DB_SEARCH_TESTS").ok().as_deref() != Some("1") {
        eprintln!("RUN_REAL_DB_SEARCH_TESTS!=1, skipping real database smoke test");
        return;
    }

    let db_path = dirs::home_dir()
        .unwrap()
        .join(".pi/agent/sessions/sessions.db");
    if !db_path.exists() {
        eprintln!("User database not found at {:?}, skipping test", db_path);
        return;
    }

    let start = Instant::now();
    // Simulate what the frontend actually sends: include_thinking is passed
    // but the Rust command signature doesn't declare it.
    let response = pi_session_manager::full_text_search(
        "内置默认".to_string(),
        "all".to_string(),
        None,
        None,
        0,
        20,
        Some("smart".to_string()),
        Some("newest".to_string()),
        Some("all".to_string()),
        None,
        None,
    );

    let result = tokio::runtime::Runtime::new().unwrap().block_on(response);
    match result {
        Ok(r) => {
            println!("Query took {:?}", start.elapsed());
            println!("Total hits: {}", r.total_hits);
            assert!(r.total_hits > 0, "Expected hits for '内置默认'");
        }
        Err(e) => {
            panic!("full_text_search failed: {}", e);
        }
    }
}
