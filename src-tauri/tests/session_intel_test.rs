use chrono::Utc;
use pi_session_manager::models::{Content, FullTextSearchHit, Message, SessionEntry};
use pi_session_manager::session_intel::{
    build_structured_recall, classify_intent, extract_experiences, suggest_workflow,
};

fn mk_entry(id: &str, role: &str, text: &str) -> SessionEntry {
    SessionEntry {
        entry_type: "message".to_string(),
        id: id.to_string(),
        parent_id: None,
        timestamp: Utc::now(),
        message: Some(Message {
            role: role.to_string(),
            content: vec![Content {
                content_type: "text".to_string(),
                text: Some(text.to_string()),
            }],
        }),
    }
}

#[test]
fn test_classify_intent() {
    assert_eq!(classify_intent("修复这个error"), "debugging");
    assert_eq!(classify_intent("做系统架构设计"), "architecture");
    assert_eq!(classify_intent("实现接口"), "implementation");
}

#[test]
fn test_build_structured_recall() {
    let hit = FullTextSearchHit {
        session_id: "s1".to_string(),
        session_path: "/tmp/s1.jsonl".to_string(),
        session_name: Some("s1".to_string()),
        entry_id: "e1".to_string(),
        role: "assistant".to_string(),
        content: "修复了一个关键错误并通过验证".to_string(),
        timestamp: Utc::now(),
        score: 0.9,
    };

    let r = build_structured_recall("error 修复", vec![hit]);
    assert_eq!(r.intent, "debugging");
    assert_eq!(r.evidence.len(), 1);
    assert!(r.confidence > 0.4);
}

#[test]
fn test_extract_experiences() {
    let entries = vec![
        mk_entry("u1", "user", "修复登录报错"),
        mk_entry("a1", "assistant", "已完成修复并通过测试"),
        mk_entry("u2", "user", "再跑一次测试"),
        mk_entry("a2", "assistant", "测试完成"),
    ];

    let xs = extract_experiences("session-1", &entries, 10);
    assert!(xs.len() >= 2);
    assert_eq!(xs[0].session_id, "session-1");
    assert!(!xs[0].problem.is_empty());
    assert!(!xs[0].action.is_empty());
    assert!(!xs[0].outcome.is_empty());
}

#[test]
fn test_suggest_workflow() {
    let actions = suggest_workflow("debugging", 0.8);
    assert!(actions.iter().any(|x| x == "apply-minimal-fix"));

    let uncertain = suggest_workflow("general", 0.3);
    assert_eq!(uncertain[0], "clarify-intent");
}
