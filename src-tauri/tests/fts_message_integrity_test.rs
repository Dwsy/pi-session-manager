use chrono::Utc;
use pi_session_manager::scanner;
use pi_session_manager::sqlite_cache;
use rusqlite::{params, Connection};
use std::fs;
use std::io::Write;
use tempfile::tempdir;

/// Helper: create a minimal session file content as JSONL
fn make_session_file(id: &str, cwd: &str, messages: &[(&str, &str)]) -> String {
    let header = format!(
        r#"{{"type":"session","version":3,"id":"{id}","timestamp":"2026-02-10T22:00:00Z","cwd":"{cwd}"}}"#
    );
    let mut lines = vec![header];
    for (i, (role, text)) in messages.iter().enumerate() {
        // Use globally unique message IDs by combining session id and index
        let entry_id = format!("{id}-msg{i}");
        let msg = format!(
            r#"{{"type":"message","id":"{}","parentId":null,"timestamp":"2026-02-10T22:00:{:02}Z","message":{{"role":"{}","content":[{{"type":"text","text":"{}"}}]}}}}"#,
            entry_id,
            i,
            role,
            text.replace('"', "\\\"")
        );
        lines.push(msg);
    }
    lines.join("\n")
}

#[test]
fn test_fts_migration_and_integrity() {
    eprintln!(">>> test_fts_migration_and_integrity START");
    // 1. Setup temp dir with session files
    let temp_dir = tempfile::tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();

    // Create two session files with searchable content
    let sess1_path = sessions_dir.join("session1.jsonl");
    let sess1_content = make_session_file(
        "sess1",
        "/cwd1",
        &[
            ("user", "How do I implement a binary search tree in Rust"),
            ("assistant", "A binary search tree in Rust requires a Node struct with left and right child references and a value field."),
            ("user", "Can you show me some example code"),
            ("assistant", "Here is a simple implementation: struct Node { value: i32, left: Option<Box<Node>>, right: Option<Box<Node>> }"),
        ],
    );
    let mut f1 = fs::File::create(&sess1_path).unwrap();
    f1.write_all(sess1_content.as_bytes()).unwrap();
    f1.sync_all().unwrap();

    let sess2_path = sessions_dir.join("session2.jsonl");
    let sess2_content = make_session_file(
        "sess2",
        "/cwd2",
        &[
            ("user", "Explain how async/await works in Tokio"),
            ("assistant", "Async/await in Tokio allows you to write asynchronous code that looks synchronous, using the async keyword and .await to pause execution until a future completes."),
            ("user", "What is the difference between Send and Sync"),
            ("assistant", "Send indicates a type can be transferred across thread boundaries, while Sync indicates it can be referenced from multiple threads concurrently."),
        ],
    );
    let mut f2 = fs::File::create(&sess2_path).unwrap();
    f2.write_all(sess2_content.as_bytes()).unwrap();
    f2.sync_all().unwrap();

    // 2. Use a temporary database
    let temp_db = tempfile::tempdir().unwrap();
    let db_file = temp_db.path().join("test.db");
    let conn = Connection::open(&db_file).unwrap();

    // 3. Initialize DB schema (same as open_and_init_db up to FTS)
    // Enable WAL, foreign keys, create tables
    let _: String = conn
        .query_row("PRAGMA journal_mode=WAL;", [], |row| row.get(0))
        .unwrap();
    conn.execute("PRAGMA synchronous=NORMAL;", []).unwrap();
    conn.execute("PRAGMA foreign_keys=ON;", []).unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            cwd TEXT NOT NULL,
            name TEXT,
            created TEXT NOT NULL,
            modified TEXT NOT NULL,
            file_modified TEXT NOT NULL,
            message_count INTEGER NOT NULL,
            first_message TEXT,
            all_messages_text TEXT,
            user_messages_text TEXT,
            assistant_messages_text TEXT,
            last_message TEXT,
            last_message_role TEXT,
            cached_at TEXT NOT NULL,
            access_count INTEGER DEFAULT 0,
            last_accessed TEXT
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)",
        [],
    )
    .unwrap();

    // 4. Ensure FTS schema: this will create message_fts with auto-sync and drop any manual triggers
    sqlite_cache::ensure_message_fts_schema(&conn).unwrap();

    // 5. Parse and upsert sessions into DB (simulate scanner)
    let file_modified = Utc::now();
    for path in [&sess1_path, &sess2_path] {
        // Parse session info using crate's scanner
        let (session, _entries) = scanner::parse_session_info(path).unwrap();

        // Insert session row
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                &session.id,
                &session.path,
                &session.cwd,
                &session.name,
                &session.created.to_rfc3339(),
                &session.modified.to_rfc3339(),
                &file_modified.to_rfc3339(),
                session.message_count as i64,
                &session.first_message,
                &session.all_messages_text,
                &session.user_messages_text,
                &session.assistant_messages_text,
                &session.last_message,
                &session.last_message_role,
                &Utc::now().to_rfc3339(),
            ],
        ).unwrap();

        // Insert message entries for this session
        sqlite_cache::insert_message_entries(&conn, &session).unwrap();
    }

    // Since message_fts is auto-sync, inserting into message_entries automatically updates the FTS index.
    // For test determinism, we can check that message_fts count equals message_entries count.
    let me_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM message_entries", [], |row| row.get(0))
        .unwrap();
    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM message_fts", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        me_count, fts_count,
        "FTS index count should match message_entries count"
    );

    // 6. Perform searches (use simple terms without special characters)
    let queries = vec![
        ("binary", "session1"), // matches session1
        ("async", "session2"),  // matches session2
        ("send", "session2"),   // matches session2
        ("tokio", "session2"),  // matches session2
    ];

    for (query, expected_session_substr) in queries {
        let results = sqlite_cache::search_message_fts(&conn, query, None, 10).unwrap();
        assert!(
            !results.is_empty(),
            "Search for '{query}' should return results"
        );
        // At least one result should come from a session containing expected substring
        let found = results
            .iter()
            .any(|(_, session_path, _, _, _, _)| session_path.contains(expected_session_substr));
        assert!(
            found,
            "Search for '{}': expected session containing '{}' in path, got paths: {:?}",
            query,
            expected_session_substr,
            results.iter().map(|r| &r.1).collect::<Vec<_>>()
        );
    }

    // 7. Test deletion cascade: remove a session and verify its messages are gone from message_entries and message_fts
    conn.execute(
        "DELETE FROM sessions WHERE path = ?",
        params![&sess1_path.to_string_lossy()],
    )
    .unwrap();

    let count_after_delete: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ?",
            params![&sess1_path.to_string_lossy()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        count_after_delete, 0,
        "message_entries should be empty for deleted session after cascade"
    );

    // FTS auto-sync will have removed the corresponding rows from message_fts after the DELETE trigger fires.
    let fts_count_after: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_fts WHERE session_path = ?",
            params![&sess1_path.to_string_lossy()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        fts_count_after, 0,
        "message_fts should have no entries for deleted session"
    );

    // Search for terms that only existed in session1 should no longer return session1
    let results = sqlite_cache::search_message_fts(&conn, "binary search", None, 10).unwrap();
    let has_session1 = results
        .iter()
        .any(|(_, session_path, _, _, _, _)| session_path.contains("session1"));
    assert!(
        !has_session1,
        "After deletion, session1 should not appear in search results"
    );

    // Ensure snippets contain highlight tags (<b>)
    if let Some((_, _, _, snippet, _, _)) = results.first() {
        assert!(
            snippet.contains("<b>"),
            "Snippet missing opening <b> tag: {snippet}"
        );
        assert!(
            snippet.contains("</b>"),
            "Snippet missing closing </b> tag: {snippet}"
        );
    }

    // Print success
    println!("FTS migration and integrity test passed OK");
}

#[test]
fn test_backfill_when_message_entries_empty() {
    // Setup: create temp dir with session files
    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();

    // Create session files with searchable content
    let sess1_path = sessions_dir.join("session1.jsonl");
    let sess1_content = make_session_file("sess1", "/cwd1", &[
        ("user", "How do I implement a binary search tree in Rust"),
        ("assistant", "A binary search tree in Rust requires a Node struct with left and right child references."),
        ("user", "Can you show example code"),
        ("assistant", "Here is a simple implementation: struct Node { value: i32, left: Option<Box<Node>>, right: Option<Box<Node>> }"),
    ]);
    fs::write(&sess1_path, sess1_content).unwrap();

    let sess2_path = sessions_dir.join("session2.jsonl");
    let sess2_content = make_session_file("sess2", "/cwd2", &[
        ("user", "Explain async/await in Tokio"),
        ("assistant", "Async/await in Tokio allows you to write async code."),
        ("user", "What is Send vs Sync"),
        ("assistant", "Send indicates a type can be transferred across thread boundaries, while Sync indicates it can be referenced from multiple threads."),
    ]);
    fs::write(&sess2_path, sess2_content).unwrap();

    // Create temp DB
    let temp_db = tempdir().unwrap();
    let db_file = temp_db.path().join("test.db");
    let conn = Connection::open(&db_file).unwrap();

    // Init settings and create tables (sessions, message_entries)
    let _: String = conn
        .query_row("PRAGMA journal_mode=WAL;", [], |row| row.get(0))
        .unwrap();
    conn.execute("PRAGMA synchronous=NORMAL;", []).unwrap();
    conn.execute("PRAGMA foreign_keys=ON;", []).unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            cwd TEXT NOT NULL,
            name TEXT,
            created TEXT NOT NULL,
            modified TEXT NOT NULL,
            file_modified TEXT NOT NULL,
            message_count INTEGER NOT NULL,
            first_message TEXT,
            all_messages_text TEXT,
            user_messages_text TEXT,
            assistant_messages_text TEXT,
            last_message TEXT,
            last_message_role TEXT,
            cached_at TEXT NOT NULL,
            access_count INTEGER DEFAULT 0,
            last_accessed TEXT
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_entries (
            id TEXT PRIMARY KEY,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_entries_session ON message_entries(session_path)",
        [],
    )
    .unwrap();

    // Ensure FTS schema (creates message_fts)
    sqlite_cache::ensure_message_fts_schema(&conn).unwrap();
    eprintln!("[DEBUG] ensure_message_fts_schema completed");

    // Debug: check FTS table definition and triggers
    let fts_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='message_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    eprintln!("[DEBUG] message_fts CREATE (test2): {fts_sql}");
    let triggers: Vec<String> = match conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='message_entries'",
    ) {
        Ok(mut stmt) => stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap(),
        Err(e) => {
            eprintln!("[DEBUG] trigger query error: {e}");
            vec![]
        }
    };
    eprintln!("[DEBUG] triggers on message_entries after init (test2): {triggers:?}");

    // Debug: check FTS table definition
    let fts_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='message_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    eprintln!("[DEBUG] message_fts CREATE: {fts_sql}");
    // Debug: list triggers on message_entries
    let triggers: Vec<String> = match conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='message_entries'",
    ) {
        Ok(mut stmt) => stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap(),
        Err(e) => {
            eprintln!("[DEBUG] trigger query error: {e}");
            vec![]
        }
    };
    eprintln!("[DEBUG] triggers on message_entries after init: {triggers:?}");

    // Insert only sessions (skip message_entries) - simulate old DB with sessions but no per-message data
    let file_modified = Utc::now();
    for path in [&sess1_path, &sess2_path] {
        let (session, _entries) = scanner::parse_session_info(path).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, path, cwd, name, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                &session.id, &session.path, &session.cwd, &session.name,
                &session.created.to_rfc3339(), &session.modified.to_rfc3339(),
                &file_modified.to_rfc3339(),
                session.message_count as i64,
                &session.first_message, &session.all_messages_text,
                &session.user_messages_text, &session.assistant_messages_text,
                &session.last_message, &session.last_message_role,
                &Utc::now().to_rfc3339(),
            ],
        ).unwrap();
        // Intentionally NOT calling insert_message_entries here
    }

    // Verify message_entries is empty
    let me_count_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM message_entries", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        me_count_before, 0,
        "Expected message_entries to be empty before backfill"
    );

    // Run ensure_message_fts_schema again - this should trigger backfill because message_entries is empty while sessions exist
    sqlite_cache::ensure_message_fts_schema(&conn).unwrap();

    // After backfill, message_entries should have rows
    let me_count_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM message_entries", [], |row| row.get(0))
        .unwrap();
    assert!(
        me_count_after > 0,
        "Expected message_entries to be populated after backfill, got 0"
    );

    // FTS index should be in sync
    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM message_fts", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        me_count_after, fts_count,
        "FTS index should match message_entries count after backfill"
    );

    // DEBUG: inspect stored content
    let sample_content: String = conn
        .query_row("SELECT content FROM message_entries LIMIT 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    println!("[DEBUG] Sample message_entries.content: {sample_content}");
    let fts_content_opt: Option<String> = conn
        .query_row("SELECT content FROM message_fts LIMIT 1", [], |row| {
            row.get(0)
        })
        .ok();
    println!("[DEBUG] Sample message_fts.content (first row): {fts_content_opt:?}");

    // List triggers on message_entries to see if auto-sync triggers exist
    let triggers: Vec<String> = match conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='message_entries'",
    ) {
        Ok(mut stmt) => stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap(),
        Err(e) => {
            println!("[DEBUG] Trigger query error: {e}");
            vec![]
        }
    };
    println!("[DEBUG] Triggers on message_entries: {triggers:?}");

    // Dump FTS rows to see indexed content
    let fts_rows: Vec<(i64, String, String, String)> =
        match conn.prepare("SELECT rowid, session_path, role, content FROM message_fts") {
            Ok(mut stmt) => stmt
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap(),
            Err(e) => {
                println!("[DEBUG] FTS dump error: {e}");
                vec![]
            }
        };
    println!(
        "[DEBUG] FTS rows (count={}): {:?}",
        fts_rows.len(),
        fts_rows
    );

    // Direct MATCH tests
    let direct_matches_bin: Vec<i64> =
        match conn.prepare("SELECT rowid FROM message_fts WHERE message_fts MATCH 'binary*'") {
            Ok(mut stmt) => stmt
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap(),
            Err(e) => {
                println!("[DEBUG] MATCH 'binary*' error: {e}");
                vec![]
            }
        };
    println!(
        "[DEBUG] Direct 'binary*' matches count: {}",
        direct_matches_bin.len()
    );

    // Test with a term we saw in sample content: tokio
    let direct_matches_tok: Vec<i64> =
        match conn.prepare("SELECT rowid FROM message_fts WHERE message_fts MATCH 'tokio*'") {
            Ok(mut stmt) => stmt
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap(),
            Err(e) => {
                println!("[DEBUG] MATCH 'tokio*' error: {e}");
                vec![]
            }
        };
    println!(
        "[DEBUG] Direct 'tokio*' matches count: {}",
        direct_matches_tok.len()
    );

    // Also test a non-prefix exact term (lowercase)
    let direct_matches_exact: Vec<i64> =
        match conn.prepare("SELECT rowid FROM message_fts WHERE message_fts MATCH 'tokio'") {
            Ok(mut stmt) => stmt
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap(),
            Err(e) => {
                println!("[DEBUG] MATCH 'tokio' error: {e}");
                vec![]
            }
        };
    println!(
        "[DEBUG] Direct 'tokio' matches count: {}",
        direct_matches_exact.len()
    );

    // Test exact 'binary'
    let direct_binary: Vec<i64> =
        match conn.prepare("SELECT rowid FROM message_fts WHERE message_fts MATCH 'binary'") {
            Ok(mut stmt) => stmt
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap(),
            Err(e) => {
                println!("[DEBUG] MATCH 'binary' error: {e}");
                vec![]
            }
        };
    println!(
        "[DEBUG] Direct 'binary' matches count: {}",
        direct_binary.len()
    );

    // Search should work
    let results = sqlite_cache::search_message_fts(&conn, "binary search", None, 10).unwrap();
    assert!(
        !results.is_empty(),
        "Expected search results after backfill"
    );
    assert!(
        results
            .iter()
            .any(|(_, p, _, _, _, _)| p.contains("session1")),
        "Expected results to include session1; got paths: {:?}",
        results.iter().map(|r| &r.1).collect::<Vec<_>>()
    );

    // Deletion cascade should still work
    conn.execute(
        "DELETE FROM sessions WHERE path = ?",
        params![&sess2_path.to_string_lossy()],
    )
    .unwrap();
    let me_remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_entries WHERE session_path = ?",
            params![&sess2_path.to_string_lossy()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(me_remaining, 0);
}

#[test]
fn test_fts_escaping_and_snippet_tags() {
    // Minimal in-memory database with FTS schema
    let conn = rusqlite::Connection::open_in_memory().unwrap();

    // Create sessions table
    conn.execute(
        "CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            cwd TEXT NOT NULL,
            name TEXT,
            created TEXT NOT NULL,
            modified TEXT NOT NULL,
            file_modified TEXT NOT NULL,
            message_count INTEGER NOT NULL,
            first_message TEXT,
            all_messages_text TEXT,
            user_messages_text TEXT,
            assistant_messages_text TEXT,
            last_message TEXT,
            last_message_role TEXT,
            cached_at TEXT NOT NULL,
            access_count INTEGER DEFAULT 0,
            last_accessed TEXT
        )",
        [],
    )
    .unwrap();

    // Insert a dummy session to satisfy foreign key for message_entries
    conn.execute(
        "INSERT INTO sessions (id, path, cwd, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            "sess1",
            "/test/session.jsonl",
            "/test",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            0i64,
            "",
            "",
            "",
            "",
            "",
            "",
            Utc::now().to_rfc3339(),
        ],
    ).unwrap();

    // Create message_entries table
    conn.execute(
        "CREATE TABLE message_entries (
            id TEXT PRIMARY KEY,
            session_path TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_path) REFERENCES sessions(path) ON DELETE CASCADE
        )",
        [],
    )
    .unwrap();

    // Ensure FTS schema (creates message_fts virtual table and sync triggers)
    sqlite_cache::ensure_message_fts_schema(&conn).unwrap();

    // Insert a message entry with special characters: quotes and backslash
    conn.execute(
        "INSERT INTO message_entries (id, session_path, role, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            "m1",
            "/test/session.jsonl",
            "user",
            "This contains \"double quotes\" and \\ backslash in the text",
            "2025-01-01T00:00:00Z"
        ],
    ).unwrap();

    // Verify FTS has the entry
    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM message_fts", [], |row| row.get(0))
        .unwrap();
    assert_eq!(fts_count, 1, "FTS should have one entry after auto-sync");

    // Search for a term that exists: "quotes" - should work
    let results = sqlite_cache::search_message_fts(&conn, "quotes", None, 10).unwrap();
    assert!(!results.is_empty(), "Should find entry with 'quotes'");
    // The snippet should contain highlighting tags
    let snippet = &results[0].3;
    assert!(
        snippet.contains("<b>"),
        "Snippet should contain <b> tag for query match"
    );
    assert!(
        snippet.contains("quotes") || snippet.contains("QUOTES"),
        "Snippet should contain the matched term 'quotes' (case-insensitive)"
    );

    // Search with a query containing double quotes - should not error
    let _ = sqlite_cache::search_message_fts(&conn, "\"double quotes\"", None, 10).unwrap();
    // Search with a backslash - also should not error
    let _ = sqlite_cache::search_message_fts(&conn, "backslash", None, 10).unwrap();

    // Additional check: snippet contains </b> as well
    assert!(
        snippet.contains("</b>"),
        "Snippet should contain closing </b> tag"
    );
}

#[test]
fn test_database_recovery_from_message_fts_corruption() {
    use chrono::Utc;
    use pi_session_manager::config::Config;
    use pi_session_manager::sqlite_cache;
    use rusqlite::{params, Connection, OptionalExtension};
    use std::env;
    use tempfile::tempdir;

    let temp_dir = tempdir().unwrap();
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", temp_dir.path());

    // Ensure no existing DB
    let db_path = sqlite_cache::get_db_path().expect("get_db_path should succeed");
    let _ = std::fs::remove_file(&db_path);

    let config = Config::default();
    let session_path = "/test/session1.jsonl".to_string();

    // First initialization: should succeed and create DB with FTS
    {
        let conn = sqlite_cache::init_db_with_config(&config).expect("initial init should succeed");
        // Insert test session and message
        conn.execute(
            "INSERT INTO sessions (id, path, cwd, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                "sess1",
                &session_path,
                "/cwd",
                "2025-01-01T00:00:00Z",
                "2025-01-01T00:00:00Z",
                "2025-01-01T00:00:00Z",
                1i64,
                "Hello",
                "",
                "",
                "",
                "",
                "",
                Utc::now().to_rfc3339(),
            ],
        ).unwrap();
        conn.execute(
            "INSERT INTO message_entries (id, session_path, role, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["m1", &session_path, "user", "Hello world", "2025-01-01T00:00:00Z"]
        ).unwrap();

        // Verify FTS works
        let results = sqlite_cache::search_message_fts(&conn, "hello", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].1, session_path);
    }

    // Corrupt the FTS by dropping its shadow tables
    {
        let corrupt_conn = Connection::open(&db_path).unwrap();
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_data", []);
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_idx", []);
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_docsize", []);
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_config", []);
        drop(corrupt_conn);
    }

    // Second initialization: should recover by deleting corrupted DB and recreating fresh
    let conn2 =
        sqlite_cache::init_db_with_config(&config).expect("init after corruption should recover");

    // After full DB recovery, the previous data is gone; we need to repopulate
    conn2.execute(
        "INSERT INTO sessions (id, path, cwd, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            "sess1",
            &session_path,
            "/cwd",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            1i64,
            "Hello",
            "",
            "",
            "",
            "",
            "",
            Utc::now().to_rfc3339(),
        ],
    ).unwrap();
    conn2.execute(
        "INSERT INTO message_entries (id, session_path, role, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["m1", &session_path, "user", "Hello world", "2025-01-01T00:00:00Z"]
    ).unwrap();

    // Verify FTS works after recovery
    let results_after = sqlite_cache::search_message_fts(&conn2, "hello", None, 10).unwrap();
    assert_eq!(results_after.len(), 1);
    assert_eq!(results_after[0].1, session_path);

    // Restore HOME
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    } else {
        env::remove_var("HOME");
    }
}
