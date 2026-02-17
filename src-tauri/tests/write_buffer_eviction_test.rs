use chrono::Utc;
use pi_session_manager::models::SessionInfo;
use pi_session_manager::session_parser::SessionDetails;
use pi_session_manager::write_buffer::{
    buffer_details_write, buffer_session_write, get_buffered_details, get_buffered_session,
};

#[test]
fn test_write_buffer_eviction() {
    // Helper to create dummy SessionInfo
    fn make_session(i: usize) -> SessionInfo {
        SessionInfo {
            path: format!("/path/{i}"),
            id: format!("s{i}"),
            cwd: "/".to_string(),
            name: None,
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 1,
            first_message: "test".to_string(),
            all_messages_text: "test".to_string(),
            user_messages_text: "test".to_string(),
            assistant_messages_text: "".to_string(),
            last_message: "test".to_string(),
            last_message_role: "user".to_string(),
        }
    }

    const MAX: usize = 1000;
    let total = MAX + 100;

    // Sessions eviction
    for i in 0..total {
        let session = make_session(i);
        buffer_session_write(&session, Utc::now());
    }

    // Early indices evicted
    assert!(get_buffered_session(&format!("/path/{}", 0)).is_none());
    assert!(get_buffered_session(&format!("/path/{}", 99)).is_none());
    // Later indices present
    assert!(get_buffered_session(&format!("/path/{}", 100)).is_some());
    assert!(get_buffered_session(&format!("/path/{}", total - 1)).is_some());

    // Details eviction
    let dummy_details = SessionDetails::default();
    for i in 0..total {
        buffer_details_write(&format!("/path/{i}"), Utc::now(), &dummy_details);
    }

    assert!(get_buffered_details(&format!("/path/{}", 0)).is_none());
    assert!(get_buffered_details(&format!("/path/{}", 99)).is_none());
    assert!(get_buffered_details(&format!("/path/{}", 100)).is_some());
    assert!(get_buffered_details(&format!("/path/{}", total - 1)).is_some());
}
