//! Corrupted SQLite database tests for Cursor and OpenCode providers.
//!
//! Tests: (1) completely corrupted file (random bytes), (2) valid SQLite but
//! wrong schema (missing tables), (3) valid schema but no rows, (4) valid
//! header but truncated. Each case should return a graceful error, never panic.

use std::fs;

use casr::providers::Provider;
use casr::providers::cursor::Cursor;
use casr::providers::opencode::OpenCode;

/// Create a valid SQLite database with custom SQL.
fn create_sqlite_db(path: &std::path::Path, sql: &str) {
    let conn = rusqlite::Connection::open(path).expect("create SQLite db");
    conn.execute_batch(sql).expect("execute SQL");
}

// ===========================================================================
// Cursor: completely corrupted file (random bytes)
// ===========================================================================

#[test]
fn cursor_corrupted_random_bytes() {
    let tmp = tempfile::NamedTempFile::with_suffix(".vscdb").expect("create temp file");
    fs::write(
        tmp.path(),
        b"\x00\x01\x02\xff\xfe\xfd\x80\x81\x82garbage\n\x00",
    )
    .expect("write garbage");
    let result = Cursor.read_session(tmp.path());
    assert!(
        result.is_err(),
        "cursor: reading garbage .vscdb should return Err"
    );
}

// ===========================================================================
// Cursor: valid SQLite but wrong schema (missing cursorDiskKV table)
// ===========================================================================

#[test]
fn cursor_wrong_schema_missing_table() {
    let tmp = tempfile::NamedTempFile::with_suffix(".vscdb").expect("create temp file");
    create_sqlite_db(
        tmp.path(),
        "CREATE TABLE wrong_table (id INTEGER PRIMARY KEY, data TEXT);
         INSERT INTO wrong_table VALUES (1, 'test');",
    );
    let result = Cursor.read_session(tmp.path());
    assert!(
        result.is_err(),
        "cursor: reading SQLite without cursorDiskKV should return Err"
    );
}

// ===========================================================================
// Cursor: correct schema but no rows
// ===========================================================================

#[test]
fn cursor_correct_schema_no_rows() {
    let tmp = tempfile::NamedTempFile::with_suffix(".vscdb").expect("create temp file");
    create_sqlite_db(
        tmp.path(),
        "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
    );
    let result = Cursor.read_session(tmp.path());
    // Provider should return Err or Ok with 0 messages.
    match &result {
        Err(_) => {} // Fine.
        Ok(session) => {
            assert!(
                session.messages.is_empty(),
                "cursor: empty cursorDiskKV should produce 0 messages, got {}",
                session.messages.len()
            );
        }
    }
}

// ===========================================================================
// Cursor: valid SQLite header but truncated
// ===========================================================================

#[test]
fn cursor_truncated_sqlite_header() {
    let tmp = tempfile::NamedTempFile::with_suffix(".vscdb").expect("create temp file");
    // Write just the SQLite header magic bytes, then truncate.
    fs::write(tmp.path(), b"SQLite format 3\x00").expect("write truncated header");
    let result = Cursor.read_session(tmp.path());
    assert!(
        result.is_err(),
        "cursor: truncated SQLite header should return Err"
    );
}

// ===========================================================================
// Cursor: valid schema, composerData key with invalid JSON value
// ===========================================================================

#[test]
fn cursor_valid_schema_invalid_json_value() {
    let tmp = tempfile::NamedTempFile::with_suffix(".vscdb").expect("create temp file");
    create_sqlite_db(
        tmp.path(),
        "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);
         INSERT INTO cursorDiskKV VALUES ('composerData:test-001', 'NOT VALID JSON {{{');",
    );
    let result = Cursor.read_session(tmp.path());
    // Should gracefully error or return empty — not panic.
    match &result {
        Err(_) => {} // Fine.
        Ok(session) => {
            assert!(
                session.messages.is_empty(),
                "cursor: invalid JSON composerData should produce 0 messages, got {}",
                session.messages.len()
            );
        }
    }
}

// ===========================================================================
// OpenCode: completely corrupted file (random bytes)
// ===========================================================================

#[test]
fn opencode_corrupted_random_bytes() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    fs::write(&db_path, b"\x00\x01garbage\xff\xfe").expect("write garbage");
    let result = OpenCode.read_session(&db_path);
    assert!(
        result.is_err(),
        "opencode: reading garbage db should return Err"
    );
}

// ===========================================================================
// OpenCode: valid SQLite but wrong schema (missing sessions/messages tables)
// ===========================================================================

#[test]
fn opencode_wrong_schema_missing_tables() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    create_sqlite_db(
        &db_path,
        "CREATE TABLE wrong_table (id INTEGER PRIMARY KEY, data TEXT);
         INSERT INTO wrong_table VALUES (1, 'test');",
    );
    let result = OpenCode.read_session(&db_path);
    assert!(
        result.is_err(),
        "opencode: reading SQLite without sessions/messages tables should return Err"
    );
}

// ===========================================================================
// OpenCode: correct schema but no rows
// ===========================================================================

#[test]
fn opencode_correct_schema_no_rows() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    create_sqlite_db(
        &db_path,
        "CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            parent_session_id TEXT,
            title TEXT NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0,
            summary TEXT NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            parts TEXT NOT NULL DEFAULT '[]',
            model TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    );
    let result = OpenCode.read_session(&db_path);
    // Empty schema is fine — should error or return 0 messages.
    match &result {
        Err(_) => {} // Fine.
        Ok(session) => {
            assert!(
                session.messages.is_empty(),
                "opencode: empty tables should produce 0 messages, got {}",
                session.messages.len()
            );
        }
    }
}

// ===========================================================================
// OpenCode: truncated SQLite header
// ===========================================================================

#[test]
fn opencode_truncated_sqlite_header() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    fs::write(&db_path, b"SQLite format 3\x00").expect("write truncated header");
    let result = OpenCode.read_session(&db_path);
    assert!(
        result.is_err(),
        "opencode: truncated SQLite header should return Err"
    );
}

// ===========================================================================
// OpenCode: valid schema, messages with invalid JSON parts
// ===========================================================================

#[test]
fn opencode_valid_schema_invalid_json_parts() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let db_dir = tmp.path().join(".opencode");
    fs::create_dir_all(&db_dir).expect("create .opencode dir");
    let db_path = db_dir.join("opencode.db");
    create_sqlite_db(
        &db_path,
        "CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            parent_session_id TEXT,
            title TEXT NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0,
            summary TEXT NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            parts TEXT NOT NULL DEFAULT '[]',
            model TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         INSERT INTO sessions VALUES ('bad-parts-001', NULL, 'Test', 1, 0, 0, 0, '', datetime('now'), datetime('now'));
         INSERT INTO messages VALUES ('msg-1', 'bad-parts-001', 'user', 'NOT VALID JSON {{{', NULL, datetime('now'));",
    );
    let result = OpenCode.read_session(&db_path);
    // Should error or skip the bad message — not panic.
    match &result {
        Err(_) => {} // Fine.
        Ok(session) => {
            // If it tolerates the bad parts, it might return 0 messages.
            eprintln!(
                "opencode: invalid JSON parts returned Ok with {} messages",
                session.messages.len()
            );
        }
    }
}
