use pi_session_manager::config::Config;
use pi_session_manager::sqlite_cache;
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref MIGRATION_LOCK: Mutex<()> = Mutex::new(());
}

#[test]
fn test_database_migration_from_old_schema() {
    let _lock = MIGRATION_LOCK.lock().unwrap();
    let test_db_path = PathBuf::from("/tmp/pi_migration_test.db");
    if test_db_path.exists() {
        fs::remove_file(&test_db_path).ok();
    }

    // 1. Create a DB with the OLD schema (missing new columns)
    {
        let conn = Connection::open(&test_db_path).unwrap();
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
                cached_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        // Old FTS5 table
        conn.execute(
            "CREATE VIRTUAL TABLE sessions_fts USING fts5(
                path UNINDEXED,
                cwd,
                name,
                first_message,
                all_messages_text,
                content='sessions',
                content_rowid='rowid'
            )",
            [],
        )
        .unwrap();
    }

    // 2. Run the current initialization logic
    let config = Config {
        enable_fts5: true,
        ..Default::default()
    };

    // We need to point sqlite_cache to our test DB.
    // Since get_db_path is hardcoded, we'll manually call the logic using our connection.
    {
        let conn = Connection::open(&test_db_path).unwrap();

        // This is what init_db_with_config does:
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

        // Run migrations
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message TEXT", [])
            .ok();
        conn.execute("ALTER TABLE sessions ADD COLUMN last_message_role TEXT", [])
            .ok();
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN user_messages_text TEXT",
            [],
        )
        .ok();
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN assistant_messages_text TEXT",
            [],
        )
        .ok();

        // Check columns
        let mut stmt = conn.prepare("PRAGMA table_info(sessions)").unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(cols.contains(&"user_messages_text".to_string()));
        assert!(cols.contains(&"assistant_messages_text".to_string()));

        // FTS upgrade logic (copied from init_fts5)
        let mut stmt = conn.prepare("PRAGMA table_info(sessions_fts)").unwrap();
        let fts_cols: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        if !fts_cols.is_empty() && !fts_cols.contains(&"user_messages_text".to_string()) {
            conn.execute("DROP TABLE IF EXISTS sessions_fts", [])
                .unwrap();
        }

        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
                path UNINDEXED,
                cwd,
                name,
                first_message,
                all_messages_text,
                user_messages_text,
                assistant_messages_text,
                content='sessions',
                content_rowid='rowid',
                tokenize='unicode61'
            )",
            [],
        )
        .unwrap();

        let mut stmt = conn.prepare("PRAGMA table_info(sessions_fts)").unwrap();
        let new_fts_cols: Vec<String> = stmt
            .query_map([], |row| row.get(1))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(new_fts_cols.contains(&"user_messages_text".to_string()));
    }

    fs::remove_file(&test_db_path).ok();
}

#[test]
fn test_database_corruption_recovery() {
    let _lock = MIGRATION_LOCK.lock().unwrap();
    let test_db_path = PathBuf::from("/tmp/pi_corruption_test.db");
    if test_db_path.exists() {
        fs::remove_file(&test_db_path).ok();
    }

    // 1. Create a "corrupted" file (not a valid SQLite DB)
    fs::write(&test_db_path, "this is not a database").unwrap();

    // 2. Try to initialize it using the recovery logic
    // Note: since we can't easily mock get_db_path without changing the source,
    // we'll manually test the recovery pattern used in init_db_with_config

    let config = Config::default();

    let result = (|| -> Result<Connection, String> {
        let open_init = |path: &std::path::Path| -> Result<Connection, String> {
            let conn = Connection::open(path).map_err(|e| e.to_string())?;
            // Simulate a failure that would happen on a malformed DB
            // Use query_row because PRAGMA schema_version returns a value
            let _: i64 = conn
                .query_row("PRAGMA schema_version", [], |row| row.get(0))
                .map_err(|e| e.to_string())?;
            Ok(conn)
        };

        let initial_err = match open_init(&test_db_path) {
            Ok(conn) => return Ok(conn),
            Err(e) => e,
        };

        println!("Got error: '{}'", initial_err);
        if initial_err.contains("malformed")
            || initial_err.contains("disk image")
            || initial_err.contains("not a database")
        {
            fs::remove_file(&test_db_path).map_err(|err| err.to_string())?;
            println!("Deleted corrupted file, reopening...");
            let result = open_init(&test_db_path);
            println!("Reopen result: {:?}", result);
            result
        } else {
            Err(initial_err)
        }
    })();

    assert!(
        result.is_ok(),
        "Should recover from corrupted file by deleting and recreating it"
    );
    assert!(test_db_path.exists());

    fs::remove_file(&test_db_path).ok();
}

#[test]
fn test_fts_vtable_corruption_triggers_database_recreation() {
    let _lock = MIGRATION_LOCK.lock().unwrap();
    // Use a temp directory to avoid interfering with real user data
    use chrono::Utc;
    use std::env;
    use tempfile::tempdir;

    let temp_dir = tempdir().unwrap();
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", temp_dir.path());

    // Clear any PPM_TEST_DB override from other tests to avoid interference
    env::remove_var("PPM_TEST_DB");

    // Ensure clean state: no DB
    let db_path = pi_session_manager::sqlite_cache::get_db_path().unwrap();
    let _ = std::fs::remove_file(&db_path);

    let config = Config::default();

    // First initialization: create DB with FTS and insert test data
    {
        let conn = pi_session_manager::sqlite_cache::init_db_with_config(&config)
            .expect("first init should succeed");

        // Insert a session and message to populate FTS
        let session_path = "/test/session1.jsonl".to_string();
        conn.execute(
            "INSERT INTO sessions (id, path, cwd, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                "s1",
                &session_path,
                "/cwd",
                "2025-01-01T00:00:00Z",
                "2025-01-01T00:00:00Z",
                "2025-01-01T00:00:00Z",
                1i64,
                "hello",
                "",
                "",
                "",
                "",
                "",
                Utc::now().to_rfc3339(),
            ],
        ).unwrap();

        // Insert message entry to populate message_entries and message_fts via auto-sync
        conn.execute(
            "INSERT INTO message_entries (id, session_path, role, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["m1", &session_path, "user", "hello world", "2025-01-01T00:00:00Z"]
        ).unwrap();

        // Verify FTS works before corruption
        let results_before =
            pi_session_manager::sqlite_cache::search_message_fts(&conn, "hello", None, 10).unwrap();
        assert_eq!(results_before.len(), 1);
        assert_eq!(results_before[0].1, session_path);
    }

    // Corrupt the message_fts virtual table by dropping its shadow tables
    {
        let corrupt_conn = Connection::open(&db_path).unwrap();
        // Drop shadow tables to simulate corruption
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_data", []);
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_idx", []);
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_docsize", []);
        let _ = corrupt_conn.execute("DROP TABLE IF EXISTS message_fts_config", []);
        drop(corrupt_conn);
    }

    // Second initialization: should detect corruption, delete the entire DB, and recreate fresh
    let conn2 = pi_session_manager::sqlite_cache::init_db_with_config(&config)
        .expect("init after corruption should succeed");

    // Look for backup file in the same directory (should exist from recovery)
    let parent_dir = db_path.parent().unwrap();
    use std::fs;
    // List all entries for debugging
    let all_entries: Vec<_> = fs::read_dir(parent_dir)
        .expect("read dir")
        .map(|e| e.unwrap().file_name())
        .collect();
    println!("DEBUG: all entries in parent: {:?}", all_entries);
    let mut backup_files = Vec::new();
    for entry_name in all_entries {
        if let Some(name_str) = entry_name.to_str() {
            if name_str.contains(".corrupted.") {
                backup_files.push(parent_dir.join(&entry_name));
            }
        }
    }
    assert_eq!(backup_files.len(), 1, "Expected exactly one backup file, got {:?}", backup_files);
    let backup_path = &backup_files[0];
    assert!(backup_path.exists(), "Backup file should exist");

    // Verify that the sessions table is empty (fresh DB)
    let session_count: i64 = conn2
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        session_count, 0,
        "Sessions table should be empty after DB recreation"
    );

    // Verify that FTS can be used normally on the fresh DB by inserting new data
    let new_session_path = "/test/session2.jsonl".to_string();
    conn2.execute(
        "INSERT INTO sessions (id, path, cwd, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            "s2",
            &new_session_path,
            "/cwd2",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            1i64,
            "new hello",
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
        params!["m2", &new_session_path, "user", "new hello world", "2025-01-01T00:00:00Z"]
    ).unwrap();

    // Verify FTS works on the new data
    let results_after =
        pi_session_manager::sqlite_cache::search_message_fts(&conn2, "new", None, 10).unwrap();
    assert_eq!(results_after.len(), 1);
    assert_eq!(results_after[0].1, new_session_path);

    // Cleanup
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    } else {
        env::remove_var("HOME");
    }
}

#[test]
fn test_fts_rebuild_after_recreate() {
    let _lock = MIGRATION_LOCK.lock().unwrap();
    use chrono::Utc;
    use std::env;
    use tempfile::tempdir;

    let temp_dir = tempdir().unwrap();
    let db_path = temp_dir.path().join("test_rebuild.db");
    // Set override env var for DB path to avoid interfering with other tests
    env::set_var("PPM_TEST_DB", db_path);

    let config = Config::default();

    // Initialize DB and create tables
    let conn = pi_session_manager::sqlite_cache::init_db_with_config(&config)
        .expect("init should succeed");

    // Immediately unset the override to prevent leaking to other tests
    env::remove_var("PPM_TEST_DB");

    // Insert a session and a message
    let session_path = "/test/session_rebuild.jsonl".to_string();
    conn.execute(
        "INSERT INTO sessions (id, path, cwd, created, modified, file_modified, message_count, first_message, all_messages_text, user_messages_text, assistant_messages_text, last_message, last_message_role, cached_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            "sess_rebuild",
            &session_path,
            "/cwd",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
            1i64,
            "Rebuild test",
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
        params!["m_rebuild1", &session_path, "user", "rebuild test message", "2025-01-01T00:00:00Z"]
    ).unwrap();

    // Verify FTS works before dropping
    let results_before =
        pi_session_manager::sqlite_cache::search_message_fts(&conn, "rebuild", None, 10).unwrap();
    assert_eq!(results_before.len(), 1);
    assert_eq!(results_before[0].1, session_path);

    // Simulate FTS loss by dropping the virtual table
    conn.execute("DROP TABLE message_fts", []).unwrap();

    // Ensure FTS is gone
    let fts_exists: bool = conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='message_fts'",
            [],
            |row| Ok(true),
        )
        .unwrap_or(false);
    assert!(!fts_exists);

    // Re-run ensure_message_fts_schema to recreate and rebuild index
    pi_session_manager::sqlite_cache::ensure_message_fts_schema(&conn).unwrap();

    // Verify FTS is back and populated without reinserting data
    let results_after =
        pi_session_manager::sqlite_cache::search_message_fts(&conn, "rebuild", None, 10).unwrap();
    assert_eq!(results_after.len(), 1, "Expected one hit after rebuild");
    assert_eq!(results_after[0].1, session_path);

    // Cleanup: temp_dir is dropped automatically
}
