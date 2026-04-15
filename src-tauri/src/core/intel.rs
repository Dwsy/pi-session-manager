use crate::types::{FullTextSearchHit, SessionEntry};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct RecallEvidence {
    pub session_id: String,
    pub entry_id: String,
    pub score: f32,
    pub role: String,
    pub excerpt: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryRecallStructured {
    pub intent: String,
    pub confidence: f32,
    pub evidence: Vec<RecallEvidence>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExperienceItem {
    pub session_id: String,
    pub problem: String,
    pub action: String,
    pub outcome: String,
    pub user_entry_id: Option<String>,
    pub assistant_entry_id: Option<String>,
    pub timestamp: Option<chrono::DateTime<chrono::Utc>>,
}

pub fn classify_intent(query: &str) -> String {
    let q = query.to_lowercase();
    if q.contains("bug")
        || q.contains("error")
        || q.contains("修复")
        || q.contains("排查")
        || q.contains("失败")
        || q.contains("报错")
    {
        return "debugging".to_string();
    }
    if q.contains("架构") || q.contains("design") || q.contains("方案") || q.contains("系统")
    {
        return "architecture".to_string();
    }
    if q.contains("实现")
        || q.contains("开发")
        || q.contains("代码")
        || q.contains("build")
        || q.contains("实现")
    {
        return "implementation".to_string();
    }
    if q.contains("测试") || q.contains("test") || q.contains("验证") {
        return "testing".to_string();
    }
    "general".to_string()
}

pub fn build_structured_recall(
    query: &str,
    hits: Vec<FullTextSearchHit>,
) -> MemoryRecallStructured {
    let evidence: Vec<RecallEvidence> = hits
        .iter()
        .map(|h| RecallEvidence {
            session_id: h.session_id.clone(),
            entry_id: h.entry_id.clone(),
            score: h.score,
            role: h.role.clone(),
            excerpt: truncate(&h.content, 220),
            timestamp: h.timestamp,
        })
        .collect();

    let confidence = (0.42_f32 + (evidence.len() as f32 * 0.06_f32)).clamp(0.1, 0.95);
    MemoryRecallStructured {
        intent: classify_intent(query),
        confidence,
        evidence,
    }
}

pub fn extract_experiences(
    session_id: &str,
    entries: &[SessionEntry],
    limit: usize,
) -> Vec<ExperienceItem> {
    let mut out = Vec::new();
    if limit == 0 {
        return out;
    }

    for pair in entries.windows(2) {
        if out.len() >= limit {
            break;
        }
        let user = &pair[0];
        let assistant = &pair[1];

        let user_role = user.message.as_ref().map(|m| m.role.as_str()).unwrap_or("");
        let assistant_role = assistant
            .message
            .as_ref()
            .map(|m| m.role.as_str())
            .unwrap_or("");

        if user_role != "user" || assistant_role != "assistant" {
            continue;
        }

        let problem = extract_text_from_entry(user);
        let action = if problem.contains("测试") || problem.to_lowercase().contains("test") {
            "run_and_verify".to_string()
        } else if problem.contains("报错") || problem.contains("error") || problem.contains("修复")
        {
            "debug_and_fix".to_string()
        } else {
            "implement_solution".to_string()
        };

        let outcome_text = extract_text_from_entry(assistant);
        let outcome = if outcome_text.contains("完成")
            || outcome_text.contains("success")
            || outcome_text.contains("已")
        {
            "success_signal".to_string()
        } else {
            "response_generated".to_string()
        };

        out.push(ExperienceItem {
            session_id: session_id.to_string(),
            problem,
            action,
            outcome,
            user_entry_id: Some(user.id.clone()),
            assistant_entry_id: Some(assistant.id.clone()),
            timestamp: Some(assistant.timestamp),
        });
    }

    out
}

pub fn suggest_workflow(intent: &str, confidence: f32) -> Vec<String> {
    let mut actions = match intent {
        "debugging" => vec![
            "collect-errors".to_string(),
            "fulltext-search-related-fixes".to_string(),
            "apply-minimal-fix".to_string(),
            "run-regression-check".to_string(),
        ],
        "architecture" => vec![
            "collect-requirements".to_string(),
            "compare-options".to_string(),
            "define-api-contract".to_string(),
            "split-into-phases".to_string(),
        ],
        "implementation" => vec![
            "locate-target-files".to_string(),
            "implement-minimal-slice".to_string(),
            "run-tests".to_string(),
            "iterate".to_string(),
        ],
        "testing" => vec![
            "prepare-fixtures".to_string(),
            "run-targeted-tests".to_string(),
            "capture-failures".to_string(),
            "patch-and-rerun".to_string(),
        ],
        _ => vec![
            "scan-context".to_string(),
            "search-history".to_string(),
            "propose-next-step".to_string(),
        ],
    };

    if confidence < 0.5 {
        actions.insert(0, "clarify-intent".to_string());
    }
    actions
}

pub fn collect_sqlite_overview() -> Result<serde_json::Value, String> {
    let config = crate::config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;

    let sessions_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let details_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM session_details_cache", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);

    let top_cwds = {
        let mut stmt = conn
            .prepare(
                "SELECT cwd, COUNT(*) AS c \
                 FROM sessions \
                 GROUP BY cwd \
                 ORDER BY c DESC \
                 LIMIT 5",
            )
            .map_err(|e| format!("Prepare top_cwds failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                let cwd: String = row.get(0)?;
                let count: i64 = row.get(1)?;
                Ok(serde_json::json!({ "cwd": cwd, "count": count }))
            })
            .map_err(|e| format!("Query top_cwds failed: {e}"))?;

        rows.filter_map(|x| x.ok())
            .collect::<Vec<serde_json::Value>>()
    };

    let intent_counts = {
        // Note: all_messages_text removed, intent analysis now uses message_fts
        serde_json::json!({
            "debugging": 0i64,
            "architecture": 0i64,
            "implementation": 0i64,
            "testing": 0i64
        })
    };

    Ok(serde_json::json!({
        "sessions": sessions_count,
        "session_details_cache": details_count,
        "top_cwds": top_cwds,
        "intent_counts": intent_counts
    }))
}

fn extract_text_from_entry(entry: &SessionEntry) -> String {
    let text = entry
        .message
        .as_ref()
        .and_then(|m| m.content.iter().find_map(|c| c.text.clone()))
        .unwrap_or_default();
    truncate(&text, 200)
}

fn truncate(input: &str, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        return input.to_string();
    }
    let short: String = input.chars().take(max_chars).collect();
    format!("{short}...")
}
