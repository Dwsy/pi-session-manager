//! Integration tests for Pi Live functionality

use pi_session_manager::pi_agent_registry::{PiAgentRegistry, PiLiveSession};
use std::sync::Arc;

#[test]
fn test_registry_empty_list() {
    let registry = Arc::new(PiAgentRegistry::new());
    let sessions = registry.list();
    assert!(sessions.is_empty());
}

#[test]
fn test_registry_register_session() {
    let registry = Arc::new(PiAgentRegistry::new());

    registry.register(
        "test-session-1".to_string(),
        Some("/path/to/session.jsonl".to_string()),
        Some(12345),
        Some("/home/user/project".to_string()),
        vec![],
    );

    let sessions = registry.list();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].session_id, "test-session-1");
    assert_eq!(sessions[0].pid, Some(12345));
    assert_eq!(sessions[0].cwd, Some("/home/user/project".to_string()));
    assert!(!sessions[0].is_streaming);
}

#[test]
fn test_registry_remove_session() {
    let registry = Arc::new(PiAgentRegistry::new());

    registry.register(
        "test-session-2".to_string(),
        None,
        Some(54321),
        None,
        vec![],
    );

    assert_eq!(registry.list().len(), 1);

    registry.remove("test-session-2");

    assert!(registry.list().is_empty());
}

#[test]
fn test_registry_get_live_session() {
    let registry = Arc::new(PiAgentRegistry::new());

    registry.register(
        "test-session-3".to_string(),
        None,
        None,
        None,
        vec![],
    );

    // Exact match
    let session = registry.get_live_session("test-session-3");
    assert!(session.is_some());
    assert_eq!(session.unwrap().session_id, "test-session-3");

    // Partial match
    let session = registry.get_live_session("session-3");
    assert!(session.is_some());

    // Not found
    let session = registry.get_live_session("non-existent");
    assert!(session.is_none());
}

#[test]
fn test_registry_update_streaming_state() {
    let registry = Arc::new(PiAgentRegistry::new());

    registry.register(
        "streaming-session".to_string(),
        None,
        None,
        None,
        vec![],
    );

    assert!(!registry.get_live_session("streaming-session").unwrap().is_streaming);

    registry.update_streaming_state("streaming-session", true);
    assert!(registry.get_live_session("streaming-session").unwrap().is_streaming);

    registry.update_streaming_state("streaming-session", false);
    assert!(!registry.get_live_session("streaming-session").unwrap().is_streaming);
}

#[test]
fn test_registry_increment_entry_count() {
    let registry = Arc::new(PiAgentRegistry::new());

    registry.register(
        "entries-session".to_string(),
        None,
        None,
        None,
        vec![],
    );

    assert_eq!(registry.get_live_session("entries-session").unwrap().entry_count, 0);

    registry.increment_entry_count("entries-session");
    assert_eq!(registry.get_live_session("entries-session").unwrap().entry_count, 1);

    registry.increment_entry_count("entries-session");
    assert_eq!(registry.get_live_session("entries-session").unwrap().entry_count, 2);
}

#[test]
fn test_registry_touch() {
    let registry = Arc::new(PiAgentRegistry::new());

    registry.register(
        "touch-session".to_string(),
        None,
        None,
        None,
        vec![],
    );

    let session_before = registry.get_live_session("touch-session").unwrap();
    let timestamp_before = session_before.last_seen.clone();

    // Small delay to ensure timestamp changes
    std::thread::sleep(std::time::Duration::from_millis(10));

    registry.touch("touch-session");

    let session_after = registry.get_live_session("touch-session").unwrap();
    assert_ne!(session_before.last_seen, session_after.last_seen);
}
