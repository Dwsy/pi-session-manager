use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use super::pi_agent::{extract_tool_calls, flatten_pi_content, shell_escape};
use crate::domain::casr_min::model::{normalize_role, parse_timestamp, reindex_messages, truncate_title, CanonicalMessage, CanonicalSession, MessageRole, ToolResult};

/// oh-my-pi stores sessions in the pi-mono JSONL shape under
/// `~/.omp/agent/sessions`, but prepends a mutable `{"type":"title",...}`
/// record ahead of the immutable `{"type":"session",...}` header. This
/// reader tolerates the title record (wherever it appears) and lifts the
/// session name out of it.
pub fn session_roots() -> Vec<PathBuf> {
    crate::paths::home_dir().ok().map(|home| home.join(".omp").join("agent").join("sessions")).filter(|p| p.is_dir()).map(|p| vec![p]).unwrap_or_default()
}

pub fn matches_path(path: &Path) -> bool {
    path.to_string_lossy().replace('\\', "/").contains("/.omp/agent/sessions/")
}

/// Content sniff: distinguishing feature versus stock pi-mono files is a
/// leading (or early) `type:"title"` record with its `v`/`updatedAt`/`pad`
/// shape.
pub fn looks_like_session_content(content: &str) -> bool {
    content
        .trim_start()
        .lines()
        .find(|line| !line.trim().is_empty())
        .and_then(|line| serde_json::from_str::<Value>(line).ok())
        .map(|value| value.get("type").and_then(Value::as_str) == Some("title") && value.get("v").and_then(Value::as_u64).is_some() && value.get("updatedAt").and_then(Value::as_str).is_some())
        .unwrap_or(false)
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    read_session_from_reader(path, BufReader::new(file))
}

pub fn read_session_from_str(path: &Path, content: &str) -> Result<CanonicalSession, String> {
    read_session_from_reader(path, BufReader::new(content.as_bytes()))
}

fn read_session_from_reader<R: BufRead>(path: &Path, reader: R) -> Result<CanonicalSession, String> {
    let mut messages: Vec<CanonicalMessage> = Vec::new();
    let mut started_at: Option<i64> = None;
    let mut ended_at: Option<i64> = None;
    let mut session_cwd: Option<String> = None;
    let mut session_id_from_header: Option<String> = None;
    let mut model_id: Option<String> = None;
    let mut provider_name: Option<String> = None;
    let mut title: Option<String> = None;
    let mut title_source: Option<String> = None;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let val: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entry_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match entry_type {
            "session" => {
                session_id_from_header = val.get("id").and_then(|v| v.as_str()).map(String::from);
                session_cwd = val.get("cwd").and_then(|v| v.as_str()).map(String::from);
                provider_name = val.get("provider").and_then(|v| v.as_str()).map(String::from);
                model_id = val.get("modelId").and_then(|v| v.as_str()).map(String::from);
                if title.is_none() {
                    title = val.get("title").and_then(|v| v.as_str()).map(str::trim).filter(|t| !t.is_empty()).map(String::from);
                    title_source = val.get("titleSource").and_then(|v| v.as_str()).map(String::from);
                }
                if let Some(ts) = val.get("timestamp").and_then(parse_timestamp) {
                    started_at = Some(ts);
                }
            }
            "title" => {
                // Mutable first-line record; track latest value.
                if let Some(t) = val.get("title").and_then(|v| v.as_str()).map(str::trim).filter(|t| !t.is_empty()) {
                    title = Some(t.to_string());
                    title_source = val.get("source").and_then(|v| v.as_str()).map(String::from);
                }
            }
            "message" => {
                let Some(msg) = val.get("message") else {
                    continue;
                };
                let role_str = msg.get("role").and_then(|v| v.as_str()).unwrap_or("unknown");
                let normalized = match role_str {
                    "toolResult" => "tool",
                    other => other,
                };
                let role = normalize_role(normalized);
                let content_val = msg.get("content");
                let content = content_val.map(flatten_pi_content).unwrap_or_default();
                let tool_calls = content_val.map(extract_tool_calls).unwrap_or_default();
                let tool_results = if role == MessageRole::Tool { vec![ToolResult { call_id: msg.get("toolCallId").and_then(|v| v.as_str()).map(String::from), content: content.clone(), is_error: msg.get("isError").and_then(|v| v.as_bool()).unwrap_or(false) }] } else { vec![] };
                if content.trim().is_empty() && tool_calls.is_empty() && tool_results.is_empty() {
                    continue;
                }
                let ts = val.get("timestamp").and_then(parse_timestamp);
                if started_at.is_none() {
                    started_at = ts;
                }
                if ts.is_some() {
                    ended_at = ts;
                }
                let author = if role == MessageRole::Assistant {
                    let msg_provider = msg.get("provider").and_then(|v| v.as_str());
                    let msg_model = msg.get("model").and_then(|v| v.as_str());

                    if let (Some(provider), Some(model)) = (msg_provider, msg_model) {
                        Some(format!("{provider}/{model}"))
                    } else if let Some(model) = msg_model {
                        Some(model.to_string())
                    } else {
                        model_id.clone()
                    }
                } else {
                    None
                };
                messages.push(CanonicalMessage { idx: 0, role, content, timestamp: ts, author, tool_calls, tool_results, extra: val });
            }
            "model_change" => {
                provider_name = val.get("provider").and_then(|v| v.as_str()).map(String::from);
                model_id = val.get("model").and_then(|v| v.as_str()).map(String::from).or(model_id.take());
            }
            _ => {}
        }
    }

    reindex_messages(&mut messages);
    let session_id = session_id_from_header.unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string());
    let title = title.or_else(|| messages.iter().find(|m| m.role == MessageRole::User).map(|m| truncate_title(&m.content, 100)));
    let workspace = session_cwd.as_ref().map(PathBuf::from);
    Ok(CanonicalSession {
        session_id,
        provider_slug: "omp".to_string(),
        workspace,
        title,
        started_at,
        ended_at,
        messages,
        metadata: json!({"source": "omp", "provider": provider_name, "model_id": model_id.clone(), "title_source": title_source}),
        source_path: path.to_path_buf(),
        model_name: model_id,
    })
}

pub fn render_session(session: &CanonicalSession, target_session_id: &str) -> Result<String, String> {
    // Conversion resumes through the pi-mono CLI; always render stock
    // session-first pi format regardless of the omp title prefix.
    super::pi_agent::render_session(session, target_session_id)
}

pub fn build_target_path(_session: &CanonicalSession, target_session_id: &str, _now: chrono::DateTime<chrono::Utc>) -> Result<PathBuf, String> {
    Err(format!("oh-my-pi sessions cannot be a conversion target (id {target_session_id})"))
}

pub fn resume_command(target_path: &Path) -> String {
    format!("omp --session {}", shell_escape(target_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER_FIRST: &str = concat!(
        r#"{"type":"session","version":3,"id":"sess-omp","timestamp":"2026-07-22T13:51:33.725Z","cwd":"/Users/x/Projects","title":"Header title","titleSource":"auto"}"#,
        "\n",
        r#"{"type":"message","id":"m1","timestamp":"2026-07-22T13:51:34.000Z","message":{"role":"user","content":[{"type":"text","text":"hello world"}]}}"#,
        "\n",
    );

    const TITLE_FIRST: &str = concat!(
        r#"{"type":"title","v":1,"title":"List current user IDs","source":"auto","updatedAt":"2026-07-22T13:52:28Z","pad":"   "}"#,
        "\n",
        r#"{"type":"session","version":3,"id":"sess-omp","timestamp":"2026-07-22T13:51:33.725Z","cwd":"/Users/x/Projects"}"#,
        "\n",
        r#"{"type":"model_change","id":"mc1","timestamp":"2026-07-22T13:51:34.000Z","model":"modal/k3"}"#,
        "\n",
        r#"{"type":"message","id":"m1","timestamp":"2026-07-22T13:51:35.000Z","message":{"role":"user","content":[{"type":"text","text":"first question"}]}}"#,
        "\n",
    );

    #[test]
    fn reads_title_first_file() {
        let session = read_session_from_str(Path::new("/tmp/sess-omp.jsonl"), TITLE_FIRST).expect("parse title-first session");
        assert_eq!(session.session_id, "sess-omp");
        assert_eq!(session.title.as_deref(), Some("List current user IDs"));
        assert_eq!(session.provider_slug, "omp");
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "first question");
        assert_eq!(session.model_name.as_deref(), Some("modal/k3"));
        assert_eq!(session.metadata.get("title_source").and_then(Value::as_str), Some("auto"));
    }

    #[test]
    fn reads_header_title_when_title_record_absent() {
        let session = read_session_from_str(Path::new("/tmp/sess-omp.jsonl"), HEADER_FIRST).expect("parse header-first session");
        assert_eq!(session.title.as_deref(), Some("Header title"));
    }

    #[test]
    fn detects_title_first_content_only() {
        assert!(looks_like_session_content(TITLE_FIRST));
        assert!(!looks_like_session_content(HEADER_FIRST));
    }

    #[test]
    fn matches_omp_dir_paths() {
        assert!(matches_path(Path::new("/Users/x/.omp/agent/sessions/-Projects/a.jsonl")));
        assert!(!matches_path(Path::new("/Users/x/.pi/agent/sessions/--a--/b.jsonl")));
    }
}
