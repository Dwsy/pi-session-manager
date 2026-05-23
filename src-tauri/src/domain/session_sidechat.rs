use crate::types::SessionEntry;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const DEFAULT_LIMIT: usize = 6;
const MAX_LIMIT: usize = 12;
const MAX_SNIPPET_CHARS: usize = 700;
const MAX_CONTEXT_CHARS: usize = 8_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSidechatCitation {
    pub index: usize,
    pub entry_id: String,
    pub session_path: String,
    pub role: String,
    pub timestamp: String,
    pub snippet: String,
    pub score: f32,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSidechatResponse {
    pub answer: String,
    pub citations: Vec<SessionSidechatCitation>,
    pub provider: String,
    pub model: String,
    pub used_entry_ids: Vec<String>,
    pub session_path: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SidechatSnippet {
    pub entry_id: String,
    pub session_path: String,
    pub role: String,
    pub timestamp: String,
    pub content: String,
    pub score: f32,
    pub source: String,
}

pub async fn answer_session_sidechat_with_snippets(session_path: &str, question: &str, snippets: Vec<SidechatSnippet>, provider: Option<&str>, model: Option<&str>, language: Option<&str>, thinking_level: Option<&str>) -> Result<SessionSidechatResponse, String> {
    if snippets.is_empty() {
        return Err("No relevant indexed or parsed context found for this session".to_string());
    }

    let context = build_sidechat_context(question, &snippets);
    let system_prompt = sidechat_system_prompt(language, thinking_level);
    let (answer, provider_name, model_id) = crate::domain::session_summary::generate_model_text(&system_prompt, &context, provider, model).await?;

    let citations: Vec<SessionSidechatCitation> = snippets
        .iter()
        .enumerate()
        .map(|(idx, snippet)| SessionSidechatCitation {
            index: idx + 1,
            entry_id: snippet.entry_id.clone(),
            session_path: snippet.session_path.clone(),
            role: snippet.role.clone(),
            timestamp: snippet.timestamp.clone(),
            snippet: snippet.content.clone(),
            score: snippet.score,
            source: snippet.source.clone(),
        })
        .collect();

    Ok(SessionSidechatResponse { answer: answer.trim().to_string(), used_entry_ids: citations.iter().map(|citation| citation.entry_id.clone()).collect(), citations, provider: provider_name, model: model_id, session_path: session_path.to_string() })
}

pub fn select_session_sidechat_snippets(conn: &rusqlite::Connection, session_path: &str, question: &str, limit: usize) -> Result<Vec<SidechatSnippet>, String> {
    let bounded_limit = limit.clamp(1, MAX_LIMIT);
    let mut snippets = search_indexed_snippets(conn, session_path, question, bounded_limit)?;
    if snippets.is_empty() {
        snippets = select_lexical_snippets_from_db(conn, session_path, question, bounded_limit)?;
    }
    Ok(limit_context_chars(snippets, MAX_CONTEXT_CHARS))
}

fn search_indexed_snippets(conn: &rusqlite::Connection, session_path: &str, question: &str, limit: usize) -> Result<Vec<SidechatSnippet>, String> {
    if !message_fts_exists(conn)? {
        return Ok(Vec::new());
    }

    let fts_query = build_fts_query(question);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

    let sql = "SELECT
            m.entry_id,
            m.session_path,
            m.role,
            m.timestamp,
            snippet(message_fts, 3, '', '', '...', 96) AS snippet,
            bm25(message_fts) AS rank
        FROM message_entries m
        JOIN message_fts ON m.rowid = message_fts.rowid
        WHERE message_fts MATCH ?1
          AND m.session_path = ?2
          AND m.role IN ('user', 'assistant')
          AND m.source_type IN ('user', 'assistant')
          AND TRIM(m.content) != ''
          AND m.content NOT LIKE '[Tool:%'
          AND m.content NOT LIKE '[Tool Output]%'
        ORDER BY rank ASC, julianday(m.timestamp) DESC
        LIMIT ?3";

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Failed to prepare sidechat FTS query: {e}"))?;
    let rows = stmt
        .query_map(params![fts_query, session_path, limit as i64], |row| {
            Ok(SidechatSnippet { entry_id: row.get(0)?, session_path: row.get(1)?, role: row.get(2)?, timestamp: row.get(3)?, content: truncate_chars(row.get::<_, String>(4)?.trim(), MAX_SNIPPET_CHARS), score: -(row.get::<_, f32>(5)?), source: "fts".to_string() })
        })
        .map_err(|e| format!("Failed to execute sidechat FTS query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect sidechat FTS snippets: {e}"))?;

    Ok(deduplicate_snippets(rows))
}

fn select_lexical_snippets_from_db(conn: &rusqlite::Connection, session_path: &str, question: &str, limit: usize) -> Result<Vec<SidechatSnippet>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT entry_id, session_path, role, timestamp, content
             FROM message_entries
             WHERE session_path = ?1
               AND role IN ('user', 'assistant')
               AND source_type IN ('user', 'assistant')
               AND TRIM(content) != ''
               AND content NOT LIKE '[Tool:%'
               AND content NOT LIKE '[Tool Output]%'
             ORDER BY timestamp ASC",
        )
        .map_err(|e| format!("Failed to prepare sidechat lexical query: {e}"))?;

    let rows = stmt
        .query_map(params![session_path], |row| Ok(SidechatSnippet { entry_id: row.get(0)?, session_path: row.get(1)?, role: row.get(2)?, timestamp: row.get(3)?, content: row.get(4)?, score: 0.0, source: "lexical".to_string() }))
        .map_err(|e| format!("Failed to execute sidechat lexical query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect sidechat lexical snippets: {e}"))?;

    Ok(select_lexical_snippets(rows, question, limit))
}

pub fn select_lexical_snippets(mut candidates: Vec<SidechatSnippet>, question: &str, limit: usize) -> Vec<SidechatSnippet> {
    let terms = tokenize_question(question);
    if terms.is_empty() {
        candidates.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        return candidates.into_iter().take(limit.clamp(1, MAX_LIMIT)).map(with_truncated_content).collect();
    }

    for candidate in &mut candidates {
        let content_lower = candidate.content.to_ascii_lowercase();
        let mut score = 0.0;
        for term in &terms {
            let count = content_lower.matches(term).count() as f32;
            if count > 0.0 {
                score += 1.0 + count.min(5.0);
            }
        }
        if content_lower.contains(&question.to_ascii_lowercase()) {
            score += 5.0;
        }
        candidate.score = score;
    }

    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal).then_with(|| b.timestamp.cmp(&a.timestamp)));
    let bounded_limit = limit.clamp(1, MAX_LIMIT);
    let scored: Vec<SidechatSnippet> = candidates.iter().filter(|candidate| candidate.score > 0.0).take(bounded_limit).cloned().map(with_truncated_content).collect();
    if !scored.is_empty() {
        return scored;
    }
    candidates
        .into_iter()
        .take(bounded_limit)
        .map(|mut snippet| {
            snippet.source = "recent".to_string();
            with_truncated_content(snippet)
        })
        .collect()
}

pub fn select_session_sidechat_snippets_from_entries(session_path: &str, entries: &[SessionEntry], question: &str, limit: usize) -> Vec<SidechatSnippet> {
    let candidates: Vec<SidechatSnippet> = entries
        .iter()
        .filter_map(|entry| {
            let message = entry.message.as_ref()?;
            if !matches!(message.role.as_str(), "user" | "assistant") {
                return None;
            }
            let content = message.content.iter().filter_map(|item| item.text.as_deref()).collect::<Vec<_>>().join("\n");
            if content.trim().is_empty() || content.starts_with("[Tool:") || content.starts_with("[Tool Output]") {
                return None;
            }
            Some(SidechatSnippet { entry_id: entry.id.clone(), session_path: session_path.to_string(), role: message.role.clone(), timestamp: entry.timestamp.to_rfc3339(), content, score: 0.0, source: "parsed".to_string() })
        })
        .collect();
    select_lexical_snippets(candidates, question, limit)
}

pub fn build_sidechat_context(question: &str, snippets: &[SidechatSnippet]) -> String {
    let mut output = String::new();
    output.push_str("Question:\n");
    output.push_str(question.trim());
    output.push_str("\n\nRelevant session snippets:\n");

    for (idx, snippet) in snippets.iter().enumerate() {
        let safe_content = truncate_chars(snippet.content.trim(), MAX_SNIPPET_CHARS);
        let line = format!("\n[{}] role={} entry_id={} timestamp={}\n{}\n", idx + 1, snippet.role, snippet.entry_id, snippet.timestamp, safe_content.trim());
        if output.len() + line.len() > MAX_CONTEXT_CHARS {
            break;
        }
        output.push_str(&line);
    }

    output
}

fn sidechat_system_prompt(language: Option<&str>, thinking_level: Option<&str>) -> String {
    let language_instruction = language.map(str::trim).filter(|value| !value.is_empty()).unwrap_or("the user's current UI language");
    let thinking_instruction = match thinking_level.map(str::trim).filter(|value| !value.is_empty()) {
        Some("off") => "Keep reasoning minimal and answer directly.",
        Some("minimal") => "Use very light reasoning and keep the answer compact.",
        Some("low") => "Use brief reasoning and prefer concise answers.",
        Some("medium") => "Use balanced reasoning with concise but clear answers.",
        Some("high") => "Use deeper reasoning, but stay grounded in the cited snippets.",
        Some("xhigh") => "Use the deepest careful reasoning available, while staying strictly grounded in the cited snippets.",
        Some(_) | None => "Use balanced reasoning with concise but clear answers.",
    };
    format!(
        "You answer questions about one Pi Session Manager session. Use only the provided snippets. If the snippets are insufficient, say that the available context is insufficient and explain what is missing. Cite snippets inline as [1], [2], etc. Answer in {language_instruction}. {thinking_instruction} Do not invent facts outside the snippets."
    )
}

fn message_fts_exists(conn: &rusqlite::Connection) -> Result<bool, String> {
    conn.query_row("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'message_fts'", [], |_| Ok(true)).optional().map(|value| value.unwrap_or(false)).map_err(|e| format!("Failed to inspect message_fts table: {e}"))
}

fn build_fts_query(question: &str) -> String {
    tokenize_question(question).into_iter().take(12).map(|term| format!("{}*", escape_fts_token(&term))).collect::<Vec<_>>().join(" OR ")
}

fn tokenize_question(question: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    question.split(|ch: char| !ch.is_alphanumeric() && ch != '_' && ch != '-').map(|term| term.trim_matches('-').to_ascii_lowercase()).filter(|term| term.len() >= 2).filter(|term| seen.insert(term.clone())).collect()
}

fn escape_fts_token(token: &str) -> String {
    token.replace('"', "")
}

fn deduplicate_snippets(snippets: Vec<SidechatSnippet>) -> Vec<SidechatSnippet> {
    let mut seen = HashSet::new();
    snippets.into_iter().filter(|snippet| seen.insert(snippet.entry_id.clone())).collect()
}

fn limit_context_chars(snippets: Vec<SidechatSnippet>, max_chars: usize) -> Vec<SidechatSnippet> {
    let mut total = 0;
    let mut selected = Vec::new();
    for snippet in snippets {
        let len = snippet.content.len();
        if !selected.is_empty() && total + len > max_chars {
            break;
        }
        total += len;
        selected.push(snippet);
    }
    selected
}

fn with_truncated_content(mut snippet: SidechatSnippet) -> SidechatSnippet {
    snippet.content = truncate_chars(snippet.content.trim(), MAX_SNIPPET_CHARS);
    snippet
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut iter = value.chars();
    let truncated: String = iter.by_ref().take(max_chars).collect();
    if iter.next().is_some() {
        format!("{truncated}...[truncated]")
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snippet(id: &str, text: &str) -> SidechatSnippet {
        SidechatSnippet { entry_id: id.to_string(), session_path: "/tmp/session.jsonl".to_string(), role: "assistant".to_string(), timestamp: format!("2026-05-23T00:00:0{id}Z"), content: text.to_string(), score: 0.0, source: "test".to_string() }
    }

    #[test]
    fn lexical_selection_prefers_relevant_snippets() {
        let rows = vec![snippet("1", "Discussed unrelated theme colors."), snippet("2", "The plugin records API stores session intelligence metadata."), snippet("3", "Kanban tags can organize session workflow state.")];
        let selected = select_lexical_snippets(rows, "How do plugin records store metadata?", 2);

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].entry_id, "2");
        assert!(selected[0].score > 0.0);
    }

    fn entry(id: &str, role: &str, text: &str) -> SessionEntry {
        SessionEntry {
            entry_type: "message".to_string(),
            id: id.to_string(),
            parent_id: None,
            timestamp: chrono::DateTime::parse_from_rfc3339(&format!("2026-05-23T00:00:0{id}Z")).unwrap().with_timezone(&chrono::Utc),
            message: Some(crate::types::Message { role: role.to_string(), content: vec![crate::types::Content { content_type: "text".to_string(), text: Some(text.to_string()) }], model: None, provider: None, usage: None }),
            target_id: None,
            label: None,
            name: None,
            provider: None,
            model_id: None,
        }
    }

    #[test]
    fn lexical_selection_falls_back_to_recent_snippets_when_terms_do_not_match() {
        let rows = vec![snippet("1", "Discussed plugin records."), snippet("2", "Reviewed session summary settings.")];
        let selected = select_lexical_snippets(rows, "zzzz unmatched question", 2);

        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].entry_id, "2");
    }

    #[test]
    fn parsed_entries_provide_context_when_index_has_no_hits() {
        let entries = vec![entry("1", "user", "Initial question about plugin settings"), entry("2", "assistant", "Explained the sidechat configuration panel")];
        let selected = select_session_sidechat_snippets_from_entries("/tmp/session.jsonl", &entries, "unmatched wording", 2);

        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].entry_id, "2");
        assert_eq!(selected[0].source, "recent");
    }

    #[test]
    fn context_builder_uses_numbered_citations_and_limits_size() {
        let long_text = "plugin ".repeat(2_000);
        let snippets = vec![snippet("1", &long_text), snippet("2", "second relevant snippet")];
        let context = build_sidechat_context("What happened?", &snippets);

        assert!(context.contains("Question:"));
        assert!(context.contains("[1] role=assistant entry_id=1"));
        assert!(context.len() <= MAX_CONTEXT_CHARS + 500);
    }
}
