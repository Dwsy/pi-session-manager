use chrono::Utc;
use pi_session_manager::scanner;
use pi_session_manager::sqlite_cache;
use rusqlite::{params, Connection};
use std::fs;
use tempfile::tempdir;

/// Helper: create a minimal session file content as JSONL
fn make_session_file(id: &str, cwd: &str, messages: &[(&str, &str)]) -> String {
    let header = format!(
        r#"{{"type":"session","version":3,"id":"{}","timestamp":"2026-02-10T22:00:00Z","cwd":"{}"}}"#,
        id, cwd
    );
    let mut lines = vec![header];
    for (i, (role, text)) in messages.iter().enumerate() {
        let entry_id = format!("{}-msg{}", id, i);
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
fn test_full_text_search_pagination_respects_per_session_limit() {
    // Create a session with 5 messages, all containing "banana"
    let temp_dir = tempdir().unwrap();
    let sessions_dir = temp_dir.path().join("sessions");
    fs::create_dir_all(&sessions_dir).unwrap();

    let sess_path = sessions_dir.join("multi.jsonl");
    let content = make_session_file(
        "multi",
        "/test",
        &[
            ("user", "I like banana"),
            ("user", "banana is yellow"),
            ("user", "bananas are tasty"),
            ("user", "eat more banana"),
            ("user", "banana smoothie"),
        ],
    );
    fs::write(&sess_path, content).unwrap();

    // Set up temporary database
    let temp_db = tempdir().unwrap();
    let db_file = temp_db.path().join("test.db");
    let conn = Connection::open(&db_file).unwrap();

    // Initialize schema
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

    sqlite_cache::ensure_message_fts_schema(&conn).unwrap();

    // Parse and insert session (parse_session_info now returns (SessionInfo, Vec<SessionEntry>))
    let (session, _entries) = scanner::parse_session_info(&sess_path).unwrap();
    let file_modified = Utc::now();
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
    sqlite_cache::insert_message_entries(&conn, &session).unwrap();

    // Build the pagination query as in full_text_search (page=0, page_size=3)
    let fts_query = "\"banana\"";
    let role_condition = "1=1";
    let where_clause = format!("WHERE message_fts MATCH ? AND {}", role_condition);

    // Count total hits after per-session limit
    let count_sql = format!(
        "SELECT COUNT(*) FROM (
            SELECT 1 FROM (
                SELECT ROW_NUMBER() OVER (PARTITION BY m.session_path ORDER BY m.rowid) as rn_in_session
                FROM message_entries m
                JOIN message_fts ON m.rowid = message_fts.rowid
                {}
            ) WHERE rn_in_session <= 3
        )",
        where_clause
    );
    let total_hits: usize = {
        let mut stmt = conn.prepare(&count_sql).unwrap();
        let count: i64 = stmt
            .query_row(params![fts_query], |row| row.get(0))
            .unwrap();
        count as usize
    };
    // Only one session, 5 matching messages, but per-session limit is 3, so total = 3
    assert_eq!(
        total_hits, 3,
        "Total hits after per-session limit should be 3"
    );

    // Fetch first page (global offset=0, limit=3)
    let data_sql = format!(
        "WITH ranked AS (
            SELECT 
                m.id,
                m.session_path,
                m.role,
                m.timestamp,
                m.rowid as rank,
                ROW_NUMBER() OVER (PARTITION BY m.session_path ORDER BY m.rowid) as rn_in_session,
                ROW_NUMBER() OVER (ORDER BY m.rowid) as global_rn
            FROM message_entries m
            JOIN message_fts ON m.rowid = message_fts.rowid
            {}
        ),
        filtered AS (
            SELECT id, session_path, role, timestamp, rank, global_rn
            FROM ranked
            WHERE rn_in_session <= 3
        )
        SELECT f.id, f.session_path, f.role, m.content, f.timestamp, f.rank
        FROM filtered f
        JOIN message_entries m ON f.id = m.id
        WHERE f.global_rn > 0 AND f.global_rn <= 3
        ORDER BY f.rank",
        where_clause
    );
    let mut stmt = conn.prepare(&data_sql).unwrap();
    let rows: Vec<(String, String, String, String, String, f32)> = stmt
        .query_map(params![fts_query], |row| {
            Ok((
                row.get(0)?, // id
                row.get(1)?, // session_path
                row.get(2)?, // role
                row.get(3)?, // content
                row.get(4)?, // timestamp
                row.get(5)?, // rank
            ))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(rows.len(), 3, "First page should contain exactly 3 hits");
    assert!(rows
        .iter()
        .all(|(_, sp, _, _, _, _)| sp == &sess_path.to_string_lossy()));
    // Also verify that content is non-empty for each hit (basic sanity)
    assert!(rows
        .iter()
        .all(|(_, _, _, content, _, _)| !content.is_empty()));
}
