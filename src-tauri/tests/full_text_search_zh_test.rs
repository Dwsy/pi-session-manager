use std::time::Instant;

#[test]
fn test_full_text_search_builtin_default() {
    if std::env::var("RUN_REAL_DB_SEARCH_TESTS").ok().as_deref() != Some("1") {
        eprintln!("RUN_REAL_DB_SEARCH_TESTS!=1, skipping real database smoke test");
        return;
    }

    // This test connects to the real user database and verifies Chinese search works.
    let db_path = dirs::home_dir()
        .unwrap()
        .join(".pi/agent/sessions/sessions.db");
    if !db_path.exists() {
        eprintln!("User database not found at {:?}, skipping test", db_path);
        return;
    }

    let start = Instant::now();
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

    match tokio::runtime::Runtime::new().unwrap().block_on(response) {
        Ok(result) => {
            println!("Query took {:?}", start.elapsed());
            println!("Total hits: {}", result.total_hits);
            for hit in &result.hits {
                println!(
                    "  [{}] {} | entry={} | score={} | match_reason={:?}",
                    hit.role, hit.session_path, hit.entry_id, hit.score, hit.match_reason
                );
                let preview: String = hit.content.chars().take(120).collect();
                println!("    content preview: {}", preview);
            }
            assert!(
                result.total_hits > 0,
                "Expected at least 1 hit for '内置默认' in real database"
            );
        }
        Err(e) => {
            panic!("full_text_search failed: {}", e);
        }
    }
}
