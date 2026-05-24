use pi_session_manager::data::sqlite::{get_plugin_record, list_plugin_records_for_scope, search_plugin_records, upsert_plugin_record, DbPluginRecord};
use pi_session_manager::domain::session_summary::{refresh_session_intelligence_record_from_summary, SessionSummaryResult};
use pi_session_manager::{config::Config, sqlite_cache, Content, Message, SessionEntry};
use tempfile::tempdir;

fn text_entry(id: &str, role: &str, text: &str) -> SessionEntry {
    SessionEntry {
        entry_type: "message".to_string(),
        id: id.to_string(),
        parent_id: None,
        timestamp: chrono::Utc::now(),
        message: Some(Message { role: role.to_string(), content: vec![Content { content_type: "text".to_string(), id: None, name: None, arguments: None, text: Some(text.to_string()) }], tool_call_id: None, tool_name: None, is_error: None, model: None, provider: None, usage: None }),
        target_id: None,
        label: None,
        name: None,
        provider: None,
        model_id: None,
    }
}

fn init_test_db() -> rusqlite::Connection {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("plugin-records.db");
    let conn = sqlite_cache::init_db_with_path(&db_path, &Config::default()).expect("init db");
    std::mem::forget(dir);
    conn
}

fn sample_record(id: &str, scope_id: &str, searchable_text: &str) -> DbPluginRecord {
    DbPluginRecord {
        id: id.to_string(),
        plugin_id: "builtin.session-summary".to_string(),
        scope_type: "session".to_string(),
        scope_id: scope_id.to_string(),
        record_type: "session.intelligence".to_string(),
        schema_version: 1,
        payload_json: r#"{"summary":"Rust kernel exposes plugin records","status":"active"}"#.to_string(),
        searchable_text: Some(searchable_text.to_string()),
        created_at: "2026-05-23T00:00:00Z".to_string(),
        updated_at: "2026-05-23T00:00:00Z".to_string(),
    }
}

#[test]
fn plugin_records_upsert_get_and_replace() {
    let conn = init_test_db();
    let mut record = sample_record("rec-1", "/tmp/session-a.jsonl", "rust kernel plugin records");

    upsert_plugin_record(&conn, &record, &[]).expect("upsert");
    let stored = get_plugin_record(&conn, "rec-1").expect("get").expect("record exists");
    assert_eq!(stored.plugin_id, "builtin.session-summary");
    assert_eq!(stored.record_type, "session.intelligence");
    assert_eq!(stored.payload_json, record.payload_json);

    record.payload_json = r#"{"summary":"Updated by pi agent","status":"blocked"}"#.to_string();
    record.searchable_text = Some("updated pi agent status".to_string());
    record.updated_at = "2026-05-23T01:00:00Z".to_string();
    upsert_plugin_record(&conn, &record, &[]).expect("replace");

    let stored = get_plugin_record(&conn, "rec-1").expect("get").expect("record exists");
    assert!(stored.payload_json.contains("Updated by pi agent"));
    assert_eq!(stored.searchable_text.as_deref(), Some("updated pi agent status"));
}

#[test]
fn plugin_records_list_by_scope_and_type() {
    let conn = init_test_db();
    upsert_plugin_record(&conn, &sample_record("rec-1", "/tmp/session-a.jsonl", "alpha"), &[]).expect("upsert rec-1");
    upsert_plugin_record(&conn, &sample_record("rec-2", "/tmp/session-a.jsonl", "beta"), &[]).expect("upsert rec-2");
    upsert_plugin_record(&conn, &sample_record("rec-3", "/tmp/session-b.jsonl", "gamma"), &[]).expect("upsert rec-3");

    let rows = list_plugin_records_for_scope(&conn, "session", "/tmp/session-a.jsonl", Some("session.intelligence"), 10).expect("list");
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|row| row.scope_id == "/tmp/session-a.jsonl"));
}

#[test]
fn plugin_records_search_uses_fts_and_filters_record_type() {
    let conn = init_test_db();
    upsert_plugin_record(&conn, &sample_record("rec-1", "/tmp/session-a.jsonl", "rust kernel capability api"), &[]).expect("upsert rec-1");

    let mut other = sample_record("rec-2", "/tmp/session-b.jsonl", "rust kernel unrelated note");
    other.record_type = "other.note".to_string();
    upsert_plugin_record(&conn, &other, &[]).expect("upsert rec-2");

    let rows = search_plugin_records(&conn, "capability", Some("session.intelligence"), None, 10).expect("search");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].record.id, "rec-1");
    assert!(rows[0].snippet.contains("capability"));
}

#[test]
fn plugin_records_reject_invalid_json_payload() {
    let conn = init_test_db();
    let mut record = sample_record("rec-1", "/tmp/session-a.jsonl", "bad json");
    record.payload_json = "{not-json".to_string();

    let error = upsert_plugin_record(&conn, &record, &[]).expect_err("invalid json rejected");
    assert!(error.contains("Invalid plugin record payload_json"));
}

#[test]
fn refresh_session_intelligence_record_from_summary_persists_and_indexes_record() {
    let conn = init_test_db();
    let entries = vec![text_entry("msg-1", "user", "Design a lightweight plugin API for Pi Session Manager."), text_entry("msg-2", "assistant", "We will store plugin metadata in generic plugin_records.")];
    let summary =
        SessionSummaryResult { summary: "Designed a lightweight plugin API backed by plugin records.".to_string(), topics: vec!["plugin-api".to_string(), "session-intelligence".to_string()], status: "active".to_string(), unresolved_tasks: vec!["Wire the command into plugin tooling.".to_string()] };

    let record = refresh_session_intelligence_record_from_summary(&conn, "/tmp/session-a.jsonl", &entries, summary, "test-provider", "test-model").expect("refresh record");

    assert_eq!(record.plugin_id, "builtin.session-summary");
    assert_eq!(record.record_type, "session.intelligence");
    assert_eq!(record.scope_id, "/tmp/session-a.jsonl");
    assert!(record.searchable_text.as_deref().unwrap_or_default().contains("plugin records"));
    assert!(record.payload_json.contains("test-provider"));
    assert!(record.payload_json.contains("test-model"));
    assert!(record.payload_json.contains("message_count"));

    let stored = get_plugin_record(&conn, &record.id).expect("get").expect("stored record");
    assert_eq!(stored.payload_json, record.payload_json);

    let hits = search_plugin_records(&conn, "plugin", Some("session.intelligence"), Some("builtin.session-summary"), 10).expect("search");
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].record.id, record.id);
}
