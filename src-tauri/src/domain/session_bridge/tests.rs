use crate::domain::session_bridge::*;
use rusqlite::Connection;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[test]
fn parses_codex_top_level_array_and_previews_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("codex-array.json");
    let content = serde_json::json!([
        {
            "type": "session_meta",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "payload": { "id": "codex-array-1", "cwd": "/repo/demo" }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{ "type": "input_text", "text": "Fix auth" }]
            }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "payload": {
                "type": "function_call",
                "call_id": "call_1",
                "name": "read_file",
                "arguments": { "path": "src/auth.ts" }
            }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "payload": {
                "type": "function_call_output",
                "call_id": "call_1",
                "output": "file contents"
            }
        }
    ]);
    std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).expect("write");

    let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
    assert_eq!(source, SessionBridgeSource::Codex);
    assert_eq!(canonical.session_id, "codex-array-1");
    assert!(canonical.messages.len() >= 3);

    let pi_preview = preview_session_format(&path, SessionBridgeSource::Pi).expect("preview");
    let entries = pi_preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert!(!entries.is_empty());
    assert_eq!(entries[0]["parentId"], Value::Null);
    for pair in entries.windows(2) {
        assert_eq!(pair[1]["parentId"], pair[0]["id"]);
    }
}

#[test]
fn codex_mixed_event_array_discards_bootstrap_and_keeps_conversation_chain() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("codex-mixed.json");
    let content = serde_json::json!([
        {
            "type": "session_meta",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "payload": { "id": "codex-mixed-1", "cwd": "/repo/demo" }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:00.100Z",
            "payload": {
                "type": "message",
                "role": "developer",
                "content": [{ "type": "input_text", "text": "system bootstrap" }]
            }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{ "type": "input_text", "text": "Fix auth" }]
            }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "payload": {
                "type": "reasoning",
                "content": [{ "type": "output_text", "text": "Need to inspect auth flow" }]
            }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "payload": {
                "type": "function_call",
                "call_id": "call_1",
                "name": "read_file",
                "arguments": { "path": "src/auth.ts" }
            }
        },
        {
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:04.000Z",
            "payload": {
                "type": "function_call_output",
                "call_id": "call_1",
                "output": "file contents"
            }
        }
    ]);
    std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).expect("write");

    let preview = preview_session_for_viewer(&path).expect("preview");
    let lines = preview.lines().collect::<Vec<_>>();
    assert!(lines.len() >= 4, "expected header + at least 3 viewer lines");

    let entries = lines.iter().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();

    let roles = entries.iter().map(|entry| entry["message"]["role"].as_str().unwrap_or("unknown").to_string()).collect::<Vec<_>>();

    assert_eq!(roles.first().map(String::as_str), Some("user"));
    assert!(roles.iter().filter(|role| role.as_str() == "toolResult").count() >= 1, "expected at least one toolResult node");
    let tool_call = entries.iter().flat_map(|entry| entry["message"]["content"].as_array().into_iter().flatten()).find(|content| content["type"] == "toolCall").expect("tool call content");
    assert_eq!(tool_call["id"], Value::String("call_1".to_string()));
    assert_eq!(tool_call["name"], Value::String("read_file".to_string()));
    assert_eq!(tool_call["arguments"]["path"], Value::String("src/auth.ts".to_string()));

    let tool_result = entries.iter().find(|entry| entry["message"]["role"] == "toolResult").expect("tool result entry");
    assert_eq!(tool_result["message"]["toolCallId"], Value::String("call_1".to_string()));
    for pair in entries.windows(2) {
        assert_eq!(pair[1]["parentId"], pair[0]["id"]);
    }
}

#[test]
fn codex_reasoning_preview_renders_as_thinking_not_model() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("codex-reasoning.jsonl");
    let lines = [
        serde_json::json!({
            "type": "session_meta",
            "timestamp": 1737300000.0,
            "payload": { "id": "codex-reasoning-preview", "cwd": "/repo/demo" }
        }),
        serde_json::json!({
            "type": "event_msg",
            "timestamp": 1737300001.0,
            "payload": { "type": "user_message", "message": "Fix the bug" }
        }),
        serde_json::json!({
            "type": "event_msg",
            "timestamp": 1737300002.0,
            "payload": { "type": "agent_reasoning", "text": "Need to inspect the failing path" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": 1737300003.0,
            "payload": { "role": "assistant", "content": [{ "type": "output_text", "text": "Fixed." }] }
        }),
    ];
    std::fs::write(&path, lines.iter().map(|value| serde_json::to_string(value).unwrap()).collect::<Vec<_>>().join("\n")).expect("write");

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    let reasoning = entries.iter().find(|entry| entry["message"]["content"].as_array().is_some_and(|content| content.iter().any(|item| item["type"] == "thinking"))).expect("reasoning entry should render as thinking");

    assert_eq!(reasoning["message"]["role"], Value::String("assistant".to_string()));
    assert_eq!(reasoning["message"]["content"][0]["type"], Value::String("thinking".to_string()));
    assert_eq!(reasoning["message"]["content"][0]["thinking"], Value::String("Need to inspect the failing path".to_string()));
    assert!(reasoning["message"].get("model").is_none(), "reasoning must not be presented as a model name");
}

#[test]
fn claude_tool_result_chain_survives_pi_preview() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("claude-mixed.jsonl");
    let lines = [
        serde_json::json!({
            "type": "user",
            "uuid": "u1",
            "sessionId": "claude-test-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "message": { "role": "user", "content": "Fix auth" }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a1",
            "sessionId": "claude-test-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "message": {
                "role": "assistant",
                "model": "claude-opus-4-6",
                "content": [{ "type": "thinking", "thinking": "Need to inspect auth flow" }]
            }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a2",
            "sessionId": "claude-test-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "message": {
                "role": "assistant",
                "model": "claude-opus-4-6",
                "content": [{ "type": "tool_use", "id": "toolu_1", "name": "Read", "input": { "file_path": "src/auth.ts" } }]
            }
        }),
        serde_json::json!({
            "type": "user",
            "uuid": "u2",
            "sessionId": "claude-test-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:04.000Z",
            "message": {
                "role": "user",
                "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": "file contents", "is_error": false }]
            }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write");

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();

    let roles = entries.iter().map(|entry| entry["message"]["role"].as_str().unwrap_or("unknown")).collect::<Vec<_>>();
    assert!(roles.contains(&"user"));
    assert!(roles.contains(&"assistant"));
    assert!(roles.contains(&"toolResult"));
    let thinking = entries.iter().flat_map(|entry| entry["message"]["content"].as_array().into_iter().flatten()).find(|content| content["type"] == "thinking").expect("thinking content");
    assert_eq!(thinking["thinking"], Value::String("Need to inspect auth flow".to_string()));
    let tool_call = entries.iter().flat_map(|entry| entry["message"]["content"].as_array().into_iter().flatten()).find(|content| content["type"] == "toolCall").expect("tool call content");
    assert_eq!(tool_call["id"], Value::String("toolu_1".to_string()));
    assert_eq!(tool_call["name"], Value::String("Read".to_string()));
    assert_eq!(tool_call["arguments"]["file_path"], Value::String("src/auth.ts".to_string()));

    let tool_result = entries.iter().find(|entry| entry["message"]["role"] == "toolResult").expect("tool result entry");
    assert_eq!(tool_result["message"]["toolCallId"], Value::String("toolu_1".to_string()));
    for pair in entries.windows(2) {
        assert_eq!(pair[1]["parentId"], pair[0]["id"]);
    }
}

#[test]
fn claude_tool_result_array_content_survives_pi_preview() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("claude-tool-array.jsonl");
    let lines = [
        serde_json::json!({
            "type": "assistant",
            "uuid": "a1",
            "sessionId": "claude-array-tool-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "message": {
                "role": "assistant",
                "model": "claude-opus-4-6",
                "content": [{ "type": "tool_use", "id": "toolu_array", "name": "Read", "input": { "file_path": "src/auth.ts" } }]
            }
        }),
        serde_json::json!({
            "type": "user",
            "uuid": "u1",
            "sessionId": "claude-array-tool-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "toolu_array",
                    "content": [{ "type": "text", "text": "first line" }, { "type": "text", "text": "second line" }],
                    "is_error": false
                }]
            }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write");

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    let tool_result = entries.iter().find(|entry| entry["message"]["role"] == "toolResult").expect("tool result entry");

    assert_eq!(tool_result["message"]["toolCallId"], Value::String("toolu_array".to_string()));
    assert_eq!(tool_result["message"]["content"][0]["text"], Value::String("first line\nsecond line".to_string()));
}

#[test]
fn canonical_entries_form_single_chain_for_viewer() {
    let canonical = CanonicalSession {
        session_id: "test-session".to_string(),
        provider_slug: "codex".to_string(),
        workspace: Some(PathBuf::from("/repo/demo")),
        title: Some("Fix auth".to_string()),
        started_at: None,
        ended_at: None,
        messages: vec![
            CanonicalMessage { idx: 0, role: MessageRole::User, content: "Fix auth".to_string(), timestamp: None, author: None, tool_calls: vec![], tool_results: vec![], extra: Value::Null },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Looking".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![ToolCall { id: Some("call_1".to_string()), name: "read_file".to_string(), arguments: serde_json::json!({"path":"src/auth.ts"}) }],
                tool_results: vec![],
                extra: Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::Tool,
                content: "file contents".to_string(),
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![ToolResult { call_id: Some("call_1".to_string()), content: "file contents".to_string(), is_error: false }],
                extra: Value::Null,
            },
        ],
        metadata: Value::Null,
        source_path: PathBuf::from("/tmp/test.json"),
        model_name: None,
    };

    let entries = canonical_to_session_entries(&canonical);
    assert_eq!(entries.len(), 3);
    assert!(entries[0].parent_id.is_none());
    assert_eq!(entries[1].parent_id.as_deref(), Some(entries[0].id.as_str()));
    assert_eq!(entries[2].parent_id.as_deref(), Some(entries[1].id.as_str()));
    let assistant = entries[1].message.as_ref().expect("assistant message");
    let tool_call = assistant.content.iter().find(|content| content.content_type == "toolCall").expect("tool call content");
    assert_eq!(tool_call.id.as_deref(), Some("call_1"));
    assert_eq!(tool_call.name.as_deref(), Some("read_file"));
    assert_eq!(tool_call.arguments.as_ref().and_then(|value| value.get("path")).and_then(Value::as_str), Some("src/auth.ts"));

    let tool_result = entries[2].message.as_ref().expect("tool result message");
    assert_eq!(tool_result.tool_call_id.as_deref(), Some("call_1"));
    assert_eq!(tool_result.is_error, Some(false));
}

#[test]
fn opencode_virtual_session_path_previews_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let canonical = CanonicalSession {
        session_id: "seed-opencode".to_string(),
        provider_slug: "claude-code".to_string(),
        workspace: Some(temp.path().to_path_buf()),
        title: Some("Set up CI".to_string()),
        started_at: Some(1_701_388_800_000),
        ended_at: Some(1_701_388_810_000),
        messages: vec![
            CanonicalMessage { idx: 0, role: MessageRole::User, content: "Help me set up CI".to_string(), timestamp: Some(1_701_388_800_000), author: None, tool_calls: vec![], tool_results: vec![], extra: Value::Null },
            CanonicalMessage { idx: 1, role: MessageRole::Assistant, content: "I'll create the workflow.".to_string(), timestamp: Some(1_701_388_803_000), author: Some("gpt-5.4".to_string()), tool_calls: vec![], tool_results: vec![], extra: Value::Null },
        ],
        metadata: Value::Null,
        source_path: temp.path().join("seed.jsonl"),
        model_name: Some("gpt-5.4".to_string()),
    };

    let written_path = crate::domain::casr_min::providers::opencode::write_session(&canonical, "opc-session-001").expect("write opencode");

    let (source, parsed) = read_canonical_session_from_path(&written_path).expect("read");
    assert_eq!(source, SessionBridgeSource::OpenCode);
    assert_eq!(parsed.provider_slug, "opencode");
    assert_eq!(parsed.messages.len(), 2);

    let preview = preview_session_for_viewer(&written_path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["message"]["role"], Value::String("user".to_string()));
    assert_eq!(entries[1]["parentId"], entries[0]["id"]);
}

#[test]
fn opencode_current_sqlite_schema_previews_parts_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("opencode.db");
    let conn = Connection::open(&db_path).expect("open db");
    conn.execute_batch(
        r#"
CREATE TABLE session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    parent_id TEXT,
    slug TEXT NOT NULL,
    directory TEXT NOT NULL,
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    share_url TEXT,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    time_compacting INTEGER,
    time_archived INTEGER
);
CREATE TABLE message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE part (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data TEXT NOT NULL
);
"#,
    )
    .expect("schema");

    let session_id = "oc-current-1";
    conn.execute(
        "INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, share_url, time_created, time_updated, time_compacting, time_archived) VALUES (?1, 'proj-1', NULL, 'current', '/repo/demo', 'Current schema', '1', NULL, 1700000000000, 1700000004000, NULL, NULL)",
        [session_id],
    )
    .expect("insert session");

    let user_data = serde_json::json!({
        "role": "user",
        "time": { "created": 1700000001000_i64 },
        "agent": "build",
        "model": { "providerID": "anthropic", "modelID": "claude-sonnet-4" }
    });
    let assistant_data = serde_json::json!({
        "role": "assistant",
        "time": { "created": 1700000002000_i64, "completed": 1700000004000_i64 },
        "parentID": "msg-user",
        "modelID": "claude-sonnet-4",
        "providerID": "anthropic",
        "mode": "build",
        "agent": "build",
        "path": { "cwd": "/repo/demo", "root": "/repo/demo" },
        "cost": 0,
        "tokens": { "input": 1, "output": 2, "reasoning": 3, "cache": { "read": 4, "write": 5 } }
    });
    conn.execute("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?1, ?2, ?3, ?4, ?5)", rusqlite::params!["msg-user", session_id, 1700000001000_i64, 1700000001000_i64, user_data.to_string()]).expect("insert user message");
    conn.execute("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?1, ?2, ?3, ?4, ?5)", rusqlite::params!["msg-assistant", session_id, 1700000002000_i64, 1700000004000_i64, assistant_data.to_string()]).expect("insert assistant message");

    let parts = [
        ("part-user-text", "msg-user", 1700000001000_i64, serde_json::json!({ "type": "text", "text": "Fix OpenCode current schema" })),
        ("part-reason", "msg-assistant", 1700000002000_i64, serde_json::json!({ "type": "reasoning", "text": "Need to inspect current tables", "time": { "start": 1700000002000_i64 } })),
        (
            "part-tool",
            "msg-assistant",
            1700000003000_i64,
            serde_json::json!({
                "type": "tool",
                "callID": "call-read",
                "tool": "read",
                "state": {
                    "status": "completed",
                    "input": { "file": "src/main.rs" },
                    "output": "file contents",
                    "title": "Read file",
                    "metadata": {},
                    "time": { "start": 1700000003000_i64, "end": 1700000004000_i64 }
                }
            }),
        ),
    ];
    for (part_id, message_id, timestamp, data) in parts {
        conn.execute("INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", rusqlite::params![part_id, message_id, session_id, timestamp, timestamp, data.to_string()]).expect("insert part");
    }

    let virtual_path = db_path.join(session_id);
    let (source, parsed) = read_canonical_session_from_path(&virtual_path).expect("read current opencode");
    assert_eq!(source, SessionBridgeSource::OpenCode);
    assert_eq!(parsed.session_id, session_id);
    assert_eq!(parsed.messages.len(), 3);

    let preview = preview_session_for_viewer(&virtual_path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    let thinking = entries.iter().flat_map(|entry| entry["message"]["content"].as_array().into_iter().flatten()).find(|content| content["type"] == "thinking").expect("thinking content");
    assert_eq!(thinking["thinking"], Value::String("Need to inspect current tables".to_string()));
    let tool_call = entries.iter().flat_map(|entry| entry["message"]["content"].as_array().into_iter().flatten()).find(|content| content["type"] == "toolCall").expect("tool call content");
    assert_eq!(tool_call["id"], Value::String("call-read".to_string()));
    assert_eq!(tool_call["name"], Value::String("read".to_string()));
    assert_eq!(tool_call["arguments"]["file"], Value::String("src/main.rs".to_string()));
    let tool_result = entries.iter().find(|entry| entry["message"]["role"] == "toolResult").expect("tool result entry");
    assert_eq!(tool_result["message"]["toolCallId"], Value::String("call-read".to_string()));
    assert_eq!(tool_result["message"]["content"][0]["text"], Value::String("file contents".to_string()));
}

#[test]
fn convert_codex_to_pi_writes_existing_pi_style_bridge_file() {
    let _env_lock = crate::paths::acquire_test_env_lock();
    let temp = tempfile::tempdir().expect("tempdir");
    let _home = crate::paths::TestHomeGuard::set(temp.path());

    let codex_dir = temp.path().join(".codex/sessions/2026/07/06");
    std::fs::create_dir_all(&codex_dir).expect("create codex sessions dir");
    let source_path = codex_dir.join("rollout-2026-07-06T11-35-33-codex-source-1.jsonl");
    let lines = [
        serde_json::json!({
            "type": "session_meta",
            "timestamp": 1737300000.0,
            "payload": { "id": "codex-source-1", "cwd": "/repo/demo" }
        }),
        serde_json::json!({
            "type": "event_msg",
            "timestamp": 1737300001.0,
            "payload": { "type": "user_message", "message": "Fix auth" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": 1737300002.0,
            "payload": { "type": "function_call", "call_id": "call-read", "name": "read_file", "arguments": { "path": "src/auth.ts" } }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": 1737300003.0,
            "payload": { "type": "function_call_output", "call_id": "call-read", "output": "file contents" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": 1737300004.0,
            "payload": { "role": "assistant", "content": [{ "type": "output_text", "text": "Done" }] }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&source_path, lines).expect("write source");

    let result = convert_session_format(&source_path, SessionBridgeSource::Pi, SessionBridgeConvertOptions { dry_run: false, force: false }).expect("convert codex to pi");

    let written_path = PathBuf::from(&result.written_paths[0]);
    assert!(written_path.exists(), "converted Pi bridge file should exist");
    let written = written_path.to_string_lossy().replace('\\', "/");
    assert!(written.contains("/.pi/agent/sessions/bridge/") || written.contains(".pi/agent/sessions/bridge"), "unexpected bridge path: {written}");
    assert!(result.resume_command.contains(written_path.to_string_lossy().as_ref()));

    let content = std::fs::read_to_string(&written_path).expect("read written");
    let entries = content.lines().map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries[0]["type"], Value::String("session".to_string()));
    assert_eq!(entries[0]["version"], Value::from(3));
    assert!(entries[1..].iter().all(|entry| entry["type"] == "message"));
    assert!(entries[1].get("id").is_some());
    assert!(entries[1].get("parentId").is_some());
    let tool_result = entries.iter().find(|entry| entry["message"]["role"] == "toolResult").expect("Codex function_call_output should become Pi toolResult");
    assert_eq!(tool_result["message"]["toolCallId"], Value::String("call-read".to_string()));
    assert_eq!(tool_result["message"]["content"][0]["text"], Value::String("file contents".to_string()));
    let assistant_plain_tool_output = entries.iter().any(|entry| entry["message"]["role"] == "assistant" && entry["message"]["content"][0]["text"] == "file contents");
    assert!(!assistant_plain_tool_output, "tool output must not be rendered as assistant text");
}

#[test]
fn convert_claude_code_to_pi_writes_existing_pi_style_bridge_file() {
    let _env_lock = crate::paths::acquire_test_env_lock();
    let temp = tempfile::tempdir().expect("tempdir");
    let _home = crate::paths::TestHomeGuard::set(temp.path());

    let claude_dir = temp.path().join(".claude/projects/-repo-demo");
    std::fs::create_dir_all(&claude_dir).expect("create claude projects dir");
    let source_path = claude_dir.join("claude-source-1.jsonl");
    let lines = [
        serde_json::json!({
            "type": "user",
            "uuid": "u1",
            "sessionId": "claude-source-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "message": { "role": "user", "content": "Fix auth" }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a1",
            "parentUuid": "u1",
            "sessionId": "claude-source-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "message": { "role": "assistant", "model": "claude-sonnet-4", "content": [{ "type": "tool_use", "id": "toolu-read", "name": "Read", "input": { "file_path": "/repo/demo/main.go" } }] }
        }),
        serde_json::json!({
            "type": "user",
            "uuid": "u2",
            "parentUuid": "a1",
            "sessionId": "claude-source-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu-read", "content": "file contents", "is_error": false }] }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a2",
            "parentUuid": "u2",
            "sessionId": "claude-source-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:04.000Z",
            "message": { "role": "assistant", "model": "claude-sonnet-4", "content": [{ "type": "text", "text": "Done" }] }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&source_path, lines).expect("write source");

    let result = convert_session_format(&source_path, SessionBridgeSource::Pi, SessionBridgeConvertOptions { dry_run: false, force: false }).expect("convert claude to pi");

    let written_path = PathBuf::from(&result.written_paths[0]);
    assert!(written_path.exists(), "converted Pi bridge file should exist");
    let written = written_path.to_string_lossy().replace('\\', "/");
    assert!(written.contains("/.pi/agent/sessions/bridge/") || written.contains(".pi/agent/sessions/bridge"), "unexpected bridge path: {written}");
    assert!(result.resume_command.contains(written_path.to_string_lossy().as_ref()));

    let content = std::fs::read_to_string(&written_path).expect("read written");
    let entries = content.lines().map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries[0]["type"], Value::String("session".to_string()));
    assert_eq!(entries[0]["version"], Value::from(3));
    assert!(entries[1..].iter().all(|entry| entry["type"] == "message"));
    assert!(entries[1].get("id").is_some());
    assert!(entries[1].get("parentId").is_some());
    let tool_result = entries.iter().find(|entry| entry["message"]["role"] == "toolResult").expect("Claude Code tool_result should become Pi toolResult");
    assert_eq!(tool_result["message"]["toolCallId"], Value::String("toolu-read".to_string()));
    assert_eq!(tool_result["message"]["content"][0]["text"], Value::String("file contents".to_string()));
    let user_plain_tool_output = entries.iter().any(|entry| entry["message"]["role"] == "user" && entry["message"]["content"][0]["text"] == "file contents");
    assert!(!user_plain_tool_output, "tool output must not be rendered as user text");
}

#[test]
fn gemini_pretty_json_previews_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path().join(".gemini").join("tmp").join("hash").join("chats");
    std::fs::create_dir_all(&root).expect("mkdir");
    let path = root.join("session-gmi-role-001.json");
    let content = serde_json::json!({
        "sessionId": "gmi-role-001",
        "startTime": "2026-01-17T09:00:00.000Z",
        "lastUpdated": "2026-01-17T09:03:00.000Z",
        "messages": [
            { "type": "user", "content": "Help me debug this segfault", "timestamp": "2026-01-17T09:00:00.000Z" },
            { "type": "gemini", "content": "Check the backtrace first.", "timestamp": "2026-01-17T09:01:00.000Z" }
        ]
    });
    std::fs::write(&path, serde_json::to_string_pretty(&content).unwrap()).expect("write");

    let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
    assert_eq!(source, SessionBridgeSource::Gemini);
    assert_eq!(canonical.messages.len(), 2);

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1]["parentId"], entries[0]["id"]);
}

#[test]
fn factory_jsonl_previews_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path().join(".factory").join("sessions").join("-home-user-webapp");
    std::fs::create_dir_all(&root).expect("mkdir");
    let path = root.join("factory-sess-001.jsonl");
    let content = [
        serde_json::json!({"type":"session_start","id":"factory-sess-001","title":"Refactor auth","cwd":"/home/user/webapp"}),
        serde_json::json!({"type":"message","timestamp":"2025-12-01T10:00:00Z","message":{"role":"user","content":"Refactor auth module"}}),
        serde_json::json!({"type":"message","timestamp":"2025-12-01T10:00:08Z","message":{"role":"assistant","content":"Start with JWT token generation.","model":"claude-opus"}}),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, content).expect("write");

    let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
    assert_eq!(source, SessionBridgeSource::Factory);
    assert_eq!(canonical.messages.len(), 2);

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1]["parentId"], entries[0]["id"]);
}

#[test]
fn clawdbot_jsonl_previews_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path().join(".clawdbot").join("sessions");
    std::fs::create_dir_all(&root).expect("mkdir");
    let path = root.join("clawdbot-simple.jsonl");
    let content = [serde_json::json!({"role":"user","content":"How does async work in Rust?","timestamp":"2025-01-27T03:30:00.000Z"}), serde_json::json!({"role":"assistant","content":"Async uses futures and executors.","timestamp":"2025-01-27T03:30:05.000Z"})]
        .iter()
        .map(|value| serde_json::to_string(value).unwrap())
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&path, content).expect("write");

    let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
    assert_eq!(source, SessionBridgeSource::ClawdBot);
    assert_eq!(canonical.messages.len(), 2);

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1]["parentId"], entries[0]["id"]);
}

#[test]
fn antigravity_transcript_previews_as_pi() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join(".gemini").join("antigravity-cli").join("brain").join("f1e2d3c4-b5a6-4789-9abc-def012345678").join(".system_generated").join("logs").join("transcript.jsonl");
    std::fs::create_dir_all(path.parent().unwrap()).expect("mkdir");
    let content = [
        serde_json::json!({
            "step_index": 1,
            "source": "USER_EXPLICIT",
            "type": "USER_INPUT",
            "created_at": "2026-06-11T20:14:42Z",
            "content": "<USER_REQUEST>hello agy</USER_REQUEST>"
        }),
        serde_json::json!({
            "step_index": 2,
            "source": "MODEL",
            "type": "PLANNER_RESPONSE",
            "created_at": "2026-06-11T20:14:43Z",
            "content": "hi there",
            "thinking": "plan"
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, content).expect("write");

    let (source, canonical) = read_canonical_session_from_path(&path).expect("canonical");
    assert_eq!(source, SessionBridgeSource::Antigravity);
    assert_eq!(canonical.session_id, "f1e2d3c4-b5a6-4789-9abc-def012345678");
    assert_eq!(canonical.messages.len(), 2);
    assert_eq!(canonical.messages[0].content, "hello agy");

    let preview = preview_session_for_viewer(&path).expect("preview");
    let entries = preview.lines().skip(1).map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1]["parentId"], entries[0]["id"]);
}

#[test]
fn cursor_virtual_session_path_reads_composer() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state.vscdb");
    {
        let conn = Connection::open(&db_path).expect("open db");
        conn.execute_batch("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);").expect("schema");
        let composer = serde_json::json!({
            "name": "Cursor demo",
            "createdAt": 1_700_000_000_000i64,
            "lastUpdatedAt": 1_700_000_100_000i64,
            "fullConversationHeadersOnly": [
                {"bubbleId": "b1"},
                {"bubbleId": "b2"}
            ]
        });
        let bubble_user = serde_json::json!({"type": 1, "text": "hello cursor", "timestamp": 1_700_000_000_000i64});
        let bubble_assistant = serde_json::json!({"type": 2, "text": "hi from cursor", "timestamp": 1_700_000_100_000i64, "modelType": "gpt"});
        conn.execute("INSERT INTO cursorDiskKV (key, value) VALUES (?1, ?2)", rusqlite::params!["composerData:cmp-1", composer.to_string()]).expect("insert composer");
        conn.execute("INSERT INTO cursorDiskKV (key, value) VALUES (?1, ?2)", rusqlite::params!["bubbleId:cmp-1:b1", bubble_user.to_string()]).expect("insert bubble user");
        conn.execute("INSERT INTO cursorDiskKV (key, value) VALUES (?1, ?2)", rusqlite::params!["bubbleId:cmp-1:b2", bubble_assistant.to_string()]).expect("insert bubble assistant");
    }

    let paths = expand_cursor_session_paths(&db_path);
    assert_eq!(paths.len(), 1);
    let virtual_path = &paths[0];
    assert!(virtual_path.to_string_lossy().ends_with("cmp-1") || virtual_path.to_string_lossy().contains("cmp-1"));

    let (source, canonical) = read_canonical_session_from_path(virtual_path).expect("canonical");
    assert_eq!(source, SessionBridgeSource::Cursor);
    assert_eq!(canonical.session_id, "cmp-1");
    assert_eq!(canonical.messages.len(), 2);
    assert_eq!(canonical.messages[0].content, "hello cursor");
    assert_eq!(canonical.messages[1].content, "hi from cursor");
    assert_eq!(backing_file_path(virtual_path), db_path);
}

/// Copy a fixture shipped with the vendored CASR crate into `dest`.
///
/// Reusing CASR's own fixtures keeps these cases honest: the formats for Kiro
/// triplets, Grok session directories and ChatGPT exports are intricate enough
/// that hand-written samples would drift from what the readers actually expect.
fn copy_casr_fixture(relative: &str, dest: &Path) {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("crates/casr/tests/fixtures").join(relative);
    std::fs::create_dir_all(dest.parent().expect("fixture destination parent")).expect("mkdir");
    std::fs::copy(&source, dest).unwrap_or_else(|error| panic!("copy fixture {} -> {}: {error}", source.display(), dest.display()));
}

#[test]
fn vendor_delegated_providers_are_detected_and_previewable() {
    struct Case {
        source: SessionBridgeSource,
        /// `(fixture path under crates/casr/tests/fixtures, path under tempdir)`
        files: &'static [(&'static str, &'static str)],
        /// The file the scanner would hand to the reader.
        session: &'static str,
    }

    let cases = [
        Case { source: SessionBridgeSource::Aider, files: &[("aider/aider_simple.md", "workspace/.aider.chat.history.md")], session: "workspace/.aider.chat.history.md" },
        Case { source: SessionBridgeSource::Amp, files: &[("amp/T-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json", "amp/threads/T-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json")], session: "amp/threads/T-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json" },
        Case { source: SessionBridgeSource::ChatGpt, files: &[("chatgpt/chatgpt_simple.json", "com.openai.chat/conversations-v2/chatgpt-conv-001.json")], session: "com.openai.chat/conversations-v2/chatgpt-conv-001.json" },
        Case {
            source: SessionBridgeSource::Cline,
            files: &[("cline/tasks/1700001234567/api_conversation_history.json", "Code/User/globalStorage/saoudrizwan.claude-dev/tasks/1700001234567/api_conversation_history.json"), ("cline/state/taskHistory.json", "Code/User/globalStorage/saoudrizwan.claude-dev/state/taskHistory.json")],
            session: "Code/User/globalStorage/saoudrizwan.claude-dev/tasks/1700001234567/api_conversation_history.json",
        },
        Case { source: SessionBridgeSource::OpenClaw, files: &[("openclaw/openclaw_simple.jsonl", ".openclaw/agents/openclaw/sessions/ocl-sess-001.jsonl")], session: ".openclaw/agents/openclaw/sessions/ocl-sess-001.jsonl" },
        Case { source: SessionBridgeSource::Vibe, files: &[("vibe/messages.jsonl", ".vibe/logs/session/vibe-sess-001/messages.jsonl")], session: ".vibe/logs/session/vibe-sess-001/messages.jsonl" },
        Case {
            source: SessionBridgeSource::Kiro,
            files: &[("kiro/0a5376f2-7e2f-4981-bcbc-67195586604a.jsonl", ".kiro/sessions/cli/0a5376f2-7e2f-4981-bcbc-67195586604a.jsonl"), ("kiro/0a5376f2-7e2f-4981-bcbc-67195586604a.json", ".kiro/sessions/cli/0a5376f2-7e2f-4981-bcbc-67195586604a.json")],
            session: ".kiro/sessions/cli/0a5376f2-7e2f-4981-bcbc-67195586604a.jsonl",
        },
        Case {
            source: SessionBridgeSource::Grok,
            files: &[
                ("grok/sessions/%2Fdata%2Fprojects%2Fdemo/019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5/updates.jsonl", ".grok/sessions/%2Fdata%2Fprojects%2Fdemo/019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5/updates.jsonl"),
                ("grok/sessions/%2Fdata%2Fprojects%2Fdemo/019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5/summary.json", ".grok/sessions/%2Fdata%2Fprojects%2Fdemo/019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5/summary.json"),
            ],
            session: ".grok/sessions/%2Fdata%2Fprojects%2Fdemo/019f75d0-aaaa-7bbb-8ccc-b0a1b2c3d4e5/updates.jsonl",
        },
    ];

    for case in cases {
        let temp = tempfile::tempdir().expect("tempdir");
        for (fixture, relative) in case.files {
            copy_casr_fixture(fixture, &temp.path().join(relative));
        }
        let path = temp.path().join(case.session);
        let name = case.source.display_name();

        let (source, canonical) = read_canonical_session_from_path(&path).unwrap_or_else(|error| panic!("{name}: read failed: {error}"));
        assert_eq!(source, case.source, "{name}: wrong provider attribution");
        assert!(!canonical.messages.is_empty(), "{name}: no messages parsed");

        let preview = preview_session_for_viewer(&path).unwrap_or_else(|error| panic!("{name}: preview failed: {error}"));
        assert!(preview.lines().count() > 1, "{name}: preview has no entries");
    }
}

#[test]
fn every_provider_maps_to_a_distinct_slug_and_alias() {
    let mut slugs = std::collections::HashSet::new();
    for source in SessionBridgeSource::ALL {
        assert!(slugs.insert(source.slug()), "duplicate slug {}", source.slug());
        // Round-tripping through the alias parser is what the settings layer,
        // the CLI and the HTTP API all rely on.
        let parsed = SessionBridgeSource::parse_alias(source.slug()).unwrap_or_else(|error| panic!("{}: {error}", source.slug()));
        assert_eq!(parsed, source, "alias round-trip changed provider for {}", source.slug());
    }
    assert_eq!(slugs.len(), SessionBridgeSource::ALL.len());
}

#[test]
fn convert_rejects_scan_only_targets() {
    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("seed.jsonl");
    std::fs::write(&path, r#"{"type":"session_meta","payload":{"id":"x"}}"#).expect("write");
    let cursor_err = convert_session_format(&path, SessionBridgeSource::Cursor, SessionBridgeConvertOptions { dry_run: true, force: false }).expect_err("cursor target");
    assert!(cursor_err.contains("scan/source only"), "{cursor_err}");
    let agy_err = convert_session_format(&path, SessionBridgeSource::Antigravity, SessionBridgeConvertOptions { dry_run: true, force: false }).expect_err("antigravity target");
    assert!(agy_err.contains("scan/source only"), "{agy_err}");
}

#[test]
fn pi_roundtrip_keeps_text_separate_from_tool_calls() {
    let canonical = CanonicalSession {
        session_id: "seed-pi".to_string(),
        provider_slug: "codex".to_string(),
        workspace: Some(PathBuf::from("/repo/demo")),
        title: Some("Fix auth".to_string()),
        started_at: Some(1_701_388_800_000),
        ended_at: Some(1_701_388_810_000),
        messages: vec![
            CanonicalMessage { idx: 0, role: MessageRole::User, content: "Fix auth".to_string(), timestamp: Some(1_701_388_800_000), author: None, tool_calls: vec![], tool_results: vec![], extra: Value::Null },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Looking".to_string(),
                timestamp: Some(1_701_388_803_000),
                author: Some("gpt-5.4".to_string()),
                tool_calls: vec![ToolCall { id: Some("call_1".to_string()), name: "read_file".to_string(), arguments: serde_json::json!({"path":"src/auth.ts"}) }],
                tool_results: vec![],
                extra: Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::Tool,
                content: "file contents".to_string(),
                timestamp: Some(1_701_388_804_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![ToolResult { call_id: Some("call_1".to_string()), content: "file contents".to_string(), is_error: false }],
                extra: Value::Null,
            },
        ],
        metadata: Value::Null,
        source_path: PathBuf::from("/tmp/seed.json"),
        model_name: Some("gpt-5.4".to_string()),
    };

    let rendered = crate::domain::casr_min::providers::pi_agent::render_session(&canonical, "pi-roundtrip-1").expect("render pi");
    let readback = crate::domain::casr_min::providers::pi_agent::read_session_from_str(Path::new("/tmp/pi-roundtrip-1.jsonl"), &rendered).expect("read pi");

    assert_eq!(readback.messages.len(), 3);
    assert_eq!(readback.messages[1].content, "Looking");
    assert_eq!(readback.messages[1].tool_calls.len(), 1);
    assert_eq!(readback.messages[1].tool_calls[0].name, "read_file");
    assert_eq!(readback.messages[2].tool_results.len(), 1);
    assert_eq!(readback.messages[2].tool_results[0].content, "file contents");
}

#[test]
fn pi_roundtrip_tool_result_without_message_content_verifies() {
    let canonical = CanonicalSession {
        session_id: "seed-pi-tool".to_string(),
        provider_slug: "codex".to_string(),
        workspace: Some(PathBuf::from("/repo/demo")),
        title: Some("Inspect logs".to_string()),
        started_at: Some(1_701_388_800_000),
        ended_at: Some(1_701_388_810_000),
        messages: vec![
            CanonicalMessage { idx: 0, role: MessageRole::User, content: "Inspect logs".to_string(), timestamp: Some(1_701_388_800_000), author: None, tool_calls: vec![], tool_results: vec![], extra: Value::Null },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Tool,
                content: String::new(),
                timestamp: Some(1_701_388_804_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![ToolResult { call_id: Some("call_9".to_string()), content: "line1\nline2".to_string(), is_error: false }],
                extra: Value::Null,
            },
        ],
        metadata: Value::Null,
        source_path: PathBuf::from("/tmp/seed-tool.json"),
        model_name: Some("gpt-5.4".to_string()),
    };

    let rendered = crate::domain::casr_min::providers::pi_agent::render_session(&canonical, "pi-roundtrip-tool-1").expect("render pi");
    let readback = crate::domain::casr_min::providers::pi_agent::read_session_from_str(Path::new("/tmp/pi-roundtrip-tool-1.jsonl"), &rendered).expect("read pi");

    assert_eq!(readback.messages.len(), 2);
    assert_eq!(readback.messages[1].content, "line1\nline2");
    assert_eq!(readback.messages[1].tool_results.len(), 1);
    assert_eq!(readback.messages[1].tool_results[0].content, "line1\nline2");
}

#[test]
fn codex_roundtrip_preserves_tool_blocks() {
    let canonical = CanonicalSession {
        session_id: "seed-codex".to_string(),
        provider_slug: "claude-code".to_string(),
        workspace: Some(PathBuf::from("/repo/demo")),
        title: Some("Fix auth".to_string()),
        started_at: Some(1_701_388_800_000),
        ended_at: Some(1_701_388_810_000),
        messages: vec![
            CanonicalMessage { idx: 0, role: MessageRole::User, content: "Fix auth".to_string(), timestamp: Some(1_701_388_800_000), author: None, tool_calls: vec![], tool_results: vec![], extra: Value::Null },
            CanonicalMessage {
                idx: 1,
                role: MessageRole::Assistant,
                content: "Looking".to_string(),
                timestamp: Some(1_701_388_803_000),
                author: None,
                tool_calls: vec![ToolCall { id: Some("call_1".to_string()), name: "read_file".to_string(), arguments: serde_json::json!({"path":"src/auth.ts"}) }],
                tool_results: vec![],
                extra: Value::Null,
            },
            CanonicalMessage {
                idx: 2,
                role: MessageRole::Tool,
                content: String::new(),
                timestamp: Some(1_701_388_804_000),
                author: None,
                tool_calls: vec![],
                tool_results: vec![ToolResult { call_id: Some("call_1".to_string()), content: "file contents".to_string(), is_error: false }],
                extra: Value::Null,
            },
        ],
        metadata: Value::Null,
        source_path: PathBuf::from("/tmp/seed-codex.json"),
        model_name: None,
    };

    let rendered = crate::domain::casr_min::providers::codex::render_session(&canonical, "codex-roundtrip-1").expect("render codex");
    let readback = crate::domain::casr_min::providers::codex::read_session_from_str(Path::new("/tmp/codex-roundtrip-1.jsonl"), &rendered).expect("read codex");

    assert_eq!(readback.messages.len(), 3);
    assert_eq!(readback.messages[1].content, "Looking");
    assert_eq!(readback.messages[1].tool_calls.len(), 1);
    assert_eq!(readback.messages[1].tool_calls[0].name, "read_file");
    assert_eq!(readback.messages[2].tool_results.len(), 1);
    assert_eq!(readback.messages[2].tool_results[0].content, "file contents");
}

#[test]
fn claude_code_read_groups_assistant_fragments_by_response_id() {
    use crate::domain::casr_min::providers::claude_code::read_session_from_str;

    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("claude-fragmented.jsonl");
    let response_id = "resp_0e2c4a75be94873b016a1339ced2d48191a9f7c4";
    let lines = [
        serde_json::json!({
            "type": "user",
            "uuid": "u1",
            "sessionId": "claude-frag-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "message": { "role": "user", "content": "Fix auth" }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a-thinking",
            "parentUuid": "u1",
            "sessionId": "claude-frag-1",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "message": {
                "id": response_id,
                "role": "assistant",
                "model": "claude-sonnet-4",
                "content": [{ "type": "thinking", "thinking": "Check the logs first." }]
            }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a-text",
            "parentUuid": "a-thinking",
            "sessionId": "claude-frag-1",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "message": {
                "id": response_id,
                "role": "assistant",
                "model": "claude-sonnet-4",
                "content": [{ "type": "text", "text": "Reading the auth file." }]
            }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a-tool-1",
            "parentUuid": "a-text",
            "sessionId": "claude-frag-1",
            "timestamp": "2026-04-08T10:00:04.000Z",
            "message": {
                "id": response_id,
                "role": "assistant",
                "model": "claude-sonnet-4",
                "content": [{ "type": "tool_use", "id": "toolu_1", "name": "read_file", "input": { "path": "src/auth.ts" } }]
            }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a-tool-2",
            "parentUuid": "a-tool-1",
            "sessionId": "claude-frag-1",
            "timestamp": "2026-04-08T10:00:05.000Z",
            "message": {
                "id": response_id,
                "role": "assistant",
                "model": "claude-sonnet-4",
                "content": [{ "type": "tool_use", "id": "toolu_2", "name": "bash", "input": { "command": "npm test" } }]
            }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write source");

    let canonical = read_session_from_str(&path, &std::fs::read_to_string(&path).unwrap()).expect("read claude");

    // 1 user + 1 grouped assistant (not 4 assistant fragments)
    assert_eq!(canonical.messages.len(), 2);
    let assistant = &canonical.messages[1];
    assert_eq!(assistant.role, MessageRole::Assistant);
    assert_eq!(assistant.author.as_deref(), Some("claude-sonnet-4"));
    // Text from the two text-bearing fragments is concatenated.
    assert!(assistant.content.contains("Check the logs first."));
    assert!(assistant.content.contains("Reading the auth file."));
    // Both tool calls are captured.
    assert_eq!(assistant.tool_calls.len(), 2);
    assert_eq!(assistant.tool_calls[0].name, "read_file");
    assert_eq!(assistant.tool_calls[1].name, "bash");
    assert_eq!(assistant.tool_calls[0].id.as_deref(), Some("toolu_1"));
}

#[test]
fn claude_code_read_does_not_merge_assistant_lines_without_response_id() {
    use crate::domain::casr_min::providers::claude_code::read_session_from_str;

    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("claude-no-id.jsonl");
    let lines = [
        serde_json::json!({
            "type": "assistant",
            "uuid": "a1",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "message": { "role": "assistant", "model": "claude-sonnet-4", "content": [{ "type": "text", "text": "one" }] }
        }),
        serde_json::json!({
            "type": "assistant",
            "uuid": "a2",
            "parentUuid": "a1",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "message": { "role": "assistant", "model": "claude-sonnet-4", "content": [{ "type": "text", "text": "two" }] }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write source");

    let canonical = read_session_from_str(&path, &std::fs::read_to_string(&path).unwrap()).expect("read claude");
    assert_eq!(canonical.messages.len(), 2, "without message.id, lines stay separate");
}

#[test]
fn claude_code_reads_wrapped_type_message_envelopes() {
    use crate::domain::casr_min::providers::claude_code::read_session_from_str;

    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("claude-type-message.jsonl");
    let lines = [
        serde_json::json!({
            "type": "message",
            "sessionId": "sess-msg-1",
            "cwd": "/repo/demo",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "message": {
                "role": "user",
                "content": [{ "type": "text", "text": "hello wrapped" }]
            }
        }),
        serde_json::json!({
            "type": "message",
            "sessionId": "sess-msg-1",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "message": {
                "role": "assistant",
                "model": "claude-sonnet-4",
                "content": [{ "type": "text", "text": "hi there" }]
            }
        }),
        serde_json::json!({
            "type": "summary",
            "summary": "ignored non-conversation"
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write source");

    let canonical = read_session_from_str(&path, &std::fs::read_to_string(&path).unwrap()).expect("read claude");
    assert_eq!(canonical.session_id, "sess-msg-1");
    assert_eq!(canonical.messages.len(), 2);
    assert_eq!(canonical.messages[0].role, MessageRole::User);
    assert_eq!(canonical.messages[0].content, "hello wrapped");
    assert_eq!(canonical.messages[1].role, MessageRole::Assistant);
    assert_eq!(canonical.messages[1].content, "hi there");
}

#[test]
fn codex_read_groups_function_call_fragments_with_final_message() {
    use crate::domain::casr_min::providers::codex::read_session_from_str;

    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("codex-fragmented.jsonl");
    let lines = [
        serde_json::json!({
            "type": "session_meta",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "payload": { "id": "codex-frag-1", "cwd": "/repo/demo" }
        }),
        serde_json::json!({
            "type": "event_msg",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "payload": { "type": "user_message", "message": "Fix auth" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "payload": { "type": "function_call", "call_id": "call_1", "name": "shell", "arguments": { "command": ["ls"] } }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:03.000Z",
            "payload": { "type": "function_call", "call_id": "call_2", "name": "read_file", "arguments": { "path": "src/auth.ts" } }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:04.000Z",
            "payload": { "type": "function_call_output", "call_id": "call_1", "output": "file list" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:05.000Z",
            "payload": { "type": "function_call_output", "call_id": "call_2", "output": "file contents" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:06.000Z",
            "payload": { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "Fixed the auth module." }] }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write source");

    let canonical = read_session_from_str(&path, &std::fs::read_to_string(&path).unwrap()).expect("read codex");

    // 1 user + 1 grouped assistant + 2 tool results = 4 messages.
    let assistants: Vec<_> = canonical.messages.iter().filter(|m| m.role == MessageRole::Assistant).collect();
    let tools: Vec<_> = canonical.messages.iter().filter(|m| m.role == MessageRole::Tool).collect();
    let users: Vec<_> = canonical.messages.iter().filter(|m| m.role == MessageRole::User).collect();
    assert_eq!(assistants.len(), 1, "two tool-call fragments + final text collapse into one assistant message");
    assert_eq!(tools.len(), 2, "tool results stay as separate messages");
    assert_eq!(users.len(), 1);

    let assistant = assistants[0];
    assert!(assistant.content.contains("Fixed the auth module."), "assistant content should carry the answer text: {}", assistant.content);
    assert_eq!(assistant.tool_calls.len(), 2, "both tool calls should be attached to the merged message");
    let mut tool_call_ids: Vec<&str> = assistant.tool_calls.iter().filter_map(|tc| tc.id.as_deref()).collect();
    tool_call_ids.sort();
    assert_eq!(tool_call_ids, vec!["call_1", "call_2"]);

    // Tool results keep their call_id linkage.
    let mut tool_call_links: Vec<&str> = tools.iter().filter_map(|m| m.tool_results.first()).filter_map(|tr| tr.call_id.as_deref()).collect();
    tool_call_links.sort();
    assert_eq!(tool_call_links, vec!["call_1", "call_2"]);
}

#[test]
fn codex_read_does_not_merge_isolated_assistant_text_messages() {
    use crate::domain::casr_min::providers::codex::read_session_from_str;

    let temp = tempfile::tempdir().expect("tempdir");
    let path = temp.path().join("codex-text-only.jsonl");
    let lines = [
        serde_json::json!({
            "type": "session_meta",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "payload": { "id": "codex-text-1", "cwd": "/repo/demo" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:01.000Z",
            "payload": { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "one" }] }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "payload": { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "two" }] }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&path, lines).expect("write source");

    let canonical = read_session_from_str(&path, &std::fs::read_to_string(&path).unwrap()).expect("read codex");
    let assistants: Vec<_> = canonical.messages.iter().filter(|m| m.role == MessageRole::Assistant).collect();
    assert_eq!(assistants.len(), 2, "back-to-back assistant text messages without tool calls stay separate");
}

#[test]
fn omp_session_parses_from_omp_sessions_dir() {
    let _env_lock = crate::paths::acquire_test_env_lock();
    let temp = tempfile::tempdir().expect("tempdir");
    let _home = crate::paths::TestHomeGuard::set(temp.path());

    // OMP stores Pi-format JSONL under ~/.omp/agent/sessions.
    let omp_dir = temp.path().join(".omp/agent/sessions");
    std::fs::create_dir_all(&omp_dir).expect("create omp sessions dir");
    let source_path = omp_dir.join("2026-04-08T10-00-00_omp-session-1.jsonl");
    let lines = [
        serde_json::json!({
            "type": "session",
            "version": 3,
            "id": "omp-session-1",
            "timestamp": "2026-04-08T10:00:00.000Z",
            "cwd": "/repo/demo",
            "provider": "anthropic",
            "modelId": "claude-sonnet-4-5"
        }),
        serde_json::json!({
            "type": "message",
            "id": "msg-1",
            "parentId": null,
            "timestamp": "2026-04-08T10:00:01.000Z",
            "message": { "role": "user", "content": "Fix auth" }
        }),
        serde_json::json!({
            "type": "message",
            "id": "msg-2",
            "parentId": "msg-1",
            "timestamp": "2026-04-08T10:00:02.000Z",
            "message": { "role": "assistant", "content": "Done" }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&source_path, lines).expect("write omp session");

    let (source, canonical) = read_canonical_session_from_path(&source_path).expect("read omp session");
    assert_eq!(source, SessionBridgeSource::Omp);
    assert_eq!(canonical.session_id, "omp-session-1");
    assert_eq!(canonical.messages.len(), 2);
    assert_eq!(canonical.messages[0].content, "Fix auth");
    assert_eq!(canonical.messages[1].content, "Done");
}

#[test]
fn convert_codex_to_omp_writes_omp_bridge_file_and_resume_command() {
    let _env_lock = crate::paths::acquire_test_env_lock();
    let temp = tempfile::tempdir().expect("tempdir");
    let _home = crate::paths::TestHomeGuard::set(temp.path());

    let codex_dir = temp.path().join(".codex/sessions/2026/07/06");
    std::fs::create_dir_all(&codex_dir).expect("create codex sessions dir");
    let source_path = codex_dir.join("rollout-2026-07-06T11-35-33-omp-source-1.jsonl");
    let lines = [
        serde_json::json!({
            "type": "session_meta",
            "timestamp": 1737300000.0,
            "payload": { "id": "omp-source-1", "cwd": "/repo/demo" }
        }),
        serde_json::json!({
            "type": "event_msg",
            "timestamp": 1737300001.0,
            "payload": { "type": "user_message", "message": "Fix auth" }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": 1737300002.0,
            "payload": { "type": "function_call", "call_id": "call-read", "name": "read_file", "arguments": { "path": "src/auth.ts" } }
        }),
        serde_json::json!({
            "type": "response_item",
            "timestamp": 1737300003.0,
            "payload": { "type": "function_call_output", "call_id": "call-read", "output": "file contents" }
        }),
    ]
    .iter()
    .map(|value| serde_json::to_string(value).unwrap())
    .collect::<Vec<_>>()
    .join("\n");
    std::fs::write(&source_path, lines).expect("write source");

    let result = convert_session_format(&source_path, SessionBridgeSource::Omp, SessionBridgeConvertOptions { dry_run: false, force: false }).expect("convert codex to omp");

    let written_path = PathBuf::from(&result.written_paths[0]);
    assert!(written_path.exists(), "converted OMP bridge file should exist");
    let written = written_path.to_string_lossy().replace('\\', "/");
    assert!(written.contains("/.omp/agent/sessions/bridge/") || written.contains(".omp/agent/sessions/bridge"), "unexpected bridge path: {written}");
    assert!(result.resume_command.starts_with("omp --session"), "resume command should use omp binary: {}", result.resume_command);
    assert!(result.resume_command.contains(written_path.to_string_lossy().as_ref()));

    let content = std::fs::read_to_string(&written_path).expect("read written");
    let entries = content.lines().map(|line| serde_json::from_str::<Value>(line).expect("json line")).collect::<Vec<_>>();
    assert_eq!(entries[0]["type"], Value::String("session".to_string()));
    assert!(entries[1..].iter().all(|entry| entry["type"] == "message"));
}
