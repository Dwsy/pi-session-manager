use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::types::{Content, Message, SessionEntry, SessionInfo};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedLabel {
    pub text: String,
    pub labeled_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct PiSessionHeader {
    id: String,
    cwd: String,
    timestamp: DateTime<Utc>,
    name: Option<String>,
    parent_session_path: Option<String>,
}

#[derive(Debug, Clone)]
struct RawEntryBase {
    entry_type: String,
    id: String,
    parent_id: Option<String>,
    timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone)]
enum RawPiEntry {
    Message { base: RawEntryBase, message: Message },
    Label { base: RawEntryBase, target_id: String, label: Option<String> },
    SessionInfo { base: RawEntryBase, name: Option<String> },
    Other { base: RawEntryBase },
}

impl RawPiEntry {
    fn timestamp(&self) -> DateTime<Utc> {
        match self {
            Self::Message { base, .. } | Self::Label { base, .. } | Self::SessionInfo { base, .. } | Self::Other { base } => base.timestamp,
        }
    }

    fn to_session_entry(&self) -> SessionEntry {
        match self {
            Self::Message { base, message } => SessionEntry { entry_type: base.entry_type.clone(), id: base.id.clone(), parent_id: base.parent_id.clone(), timestamp: base.timestamp, message: Some(message.clone()), target_id: None, label: None, name: None, provider: None, model_id: None },
            Self::Label { base, target_id, label } => {
                SessionEntry { entry_type: base.entry_type.clone(), id: base.id.clone(), parent_id: base.parent_id.clone(), timestamp: base.timestamp, message: None, target_id: Some(target_id.clone()), label: label.clone(), name: None, provider: None, model_id: None }
            }
            Self::SessionInfo { base, name } => SessionEntry { entry_type: base.entry_type.clone(), id: base.id.clone(), parent_id: base.parent_id.clone(), timestamp: base.timestamp, message: None, target_id: None, label: None, name: name.clone(), provider: None, model_id: None },
            Self::Other { base } => SessionEntry { entry_type: base.entry_type.clone(), id: base.id.clone(), parent_id: base.parent_id.clone(), timestamp: base.timestamp, message: None, target_id: None, label: None, name: None, provider: None, model_id: None },
        }
    }
}

pub fn parse_pi_session_info(path: &Path, file_modified: DateTime<Utc>) -> Result<(SessionInfo, Vec<SessionEntry>), String> {
    let start = std::time::Instant::now();
    let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let (header, raw_entries) = parse_pi_session(path)?;
    let elapsed = start.elapsed();
    crate::core::io_trace::trace_file_read(&path.to_string_lossy(), file_size, elapsed);
    let entries = raw_entries.iter().map(RawPiEntry::to_session_entry).collect::<Vec<_>>();

    let mut message_count = 0usize;
    let mut first_message = String::new();
    let mut last_message = String::new();
    let mut last_message_role = String::new();
    let mut latest_message_activity = None;
    let mut last_model = None;

    for raw_entry in &raw_entries {
        let RawPiEntry::Message { message, .. } = raw_entry else {
            continue;
        };

        if !is_searchable_message_role(&message.role) {
            continue;
        }

        message_count += 1;
        latest_message_activity = Some(latest_message_activity.map(|current: DateTime<Utc>| current.max(raw_entry.timestamp())).unwrap_or_else(|| raw_entry.timestamp()));

        if message.model.is_some() {
            last_model = message.model.clone();
        }

        let visible_text = visible_message_text(message);
        if visible_text.is_empty() {
            continue;
        }

        if first_message.is_empty() && message.role == "user" {
            first_message = truncate_text(&visible_text, 100);
        }

        last_message = truncate_text(&visible_text, 150);
        last_message_role = message.role.clone();
    }

    let latest_entry_activity = raw_entries.iter().map(RawPiEntry::timestamp).max();
    let modified = latest_entry_activity.unwrap_or(header.timestamp).max(file_modified).max(latest_message_activity.unwrap_or(header.timestamp));
    let session_name = resolve_session_name(header.name.clone(), &raw_entries);

    Ok((
        SessionInfo {
            path: path.to_string_lossy().to_string(),
            id: header.id,
            cwd: header.cwd,
            name: session_name,
            created: header.timestamp,
            modified,
            message_count,
            first_message,
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message,
            last_message_role,
            parent_session_path: header.parent_session_path,
            model: last_model,
        },
        entries,
    ))
}

pub fn parse_pi_session_entries(path: &Path) -> Result<Vec<SessionEntry>, String> {
    let start = std::time::Instant::now();
    let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let (_, raw_entries) = parse_pi_session(path)?;
    let elapsed = start.elapsed();
    crate::core::io_trace::trace_file_read(&path.to_string_lossy(), file_size, elapsed);
    tracing::info!("[IO] parse_pi_session_entries path={} bytes={} entries={} elapsed={:?}", path.display(), file_size, raw_entries.len(), elapsed);
    Ok(raw_entries.iter().map(RawPiEntry::to_session_entry).collect())
}

pub fn resolve_labels(entries: &[SessionEntry]) -> HashMap<String, ResolvedLabel> {
    let mut labels_by_target = HashMap::new();

    for entry in entries {
        if entry.entry_type != "label" {
            continue;
        }

        let Some(target_id) = entry.target_id.as_ref().map(|value| value.trim()) else {
            continue;
        };
        if target_id.is_empty() {
            continue;
        }

        let normalized_label = entry.label.as_deref().map(str::trim).filter(|label| !label.is_empty());

        if let Some(label_text) = normalized_label {
            labels_by_target.insert(target_id.to_string(), ResolvedLabel { text: label_text.to_string(), labeled_at: entry.timestamp });
        } else {
            labels_by_target.remove(target_id);
        }
    }

    labels_by_target
}

fn parse_pi_session(path: &Path) -> Result<(PiSessionHeader, Vec<RawPiEntry>), String> {
    let file = File::open(path).map_err(|e| format!("Failed to open Pi session {}: {e}", path.display()))?;
    parse_pi_session_reader(BufReader::new(file), path)
}

/// Lightweight header-only parse: reads only the first line.
/// Returns a minimal SessionInfo with empty message fields.
/// Used for fast initial scan when DB is empty.
pub fn parse_pi_session_header_only(path: &Path, file_modified: DateTime<Utc>) -> Result<SessionInfo, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open Pi session {}: {e}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut header_line = String::new();
    reader.read_line(&mut header_line).map_err(|e| format!("Failed to read Pi session header {}: {e}", path.display()))?;

    let header = parse_header(header_line.trim(), path)?;

    let metadata = std::fs::metadata(path).ok();
    let file_size = metadata.as_ref().map(|item| item.len()).unwrap_or(0);
    let (last_message, last_message_role, model) = read_last_message_hint(path, file_size).unwrap_or_default();

    // Estimate message count from file size (rough: ~200 bytes per message).
    let estimated_message_count = (file_size / 200) as usize;

    Ok(SessionInfo {
        path: path.to_string_lossy().to_string(),
        id: header.id,
        cwd: header.cwd,
        name: header.name,
        created: header.timestamp,
        modified: file_modified.max(header.timestamp),
        message_count: estimated_message_count,
        first_message: String::new(), // Will be filled on full scan
        user_messages_text: String::new(),
        assistant_messages_text: String::new(),
        last_message,
        last_message_role,
        parent_session_path: header.parent_session_path,
        model,
    })
}

const HEADER_ONLY_TAIL_PROBE_BYTES: u64 = 64 * 1024;

fn read_last_message_hint(path: &Path, file_size: u64) -> Option<(String, String, Option<String>)> {
    if file_size == 0 {
        return None;
    }

    let probe_len = file_size.min(HEADER_ONLY_TAIL_PROBE_BYTES) as usize;
    if probe_len == 0 {
        return None;
    }

    let mut file = File::open(path).ok()?;
    let start = file_size.saturating_sub(probe_len as u64);
    file.seek(SeekFrom::Start(start)).ok()?;

    let mut buffer = vec![0u8; probe_len];
    let bytes_read = file.read(&mut buffer).ok()?;
    buffer.truncate(bytes_read);

    let tail = String::from_utf8_lossy(&buffer);
    for line in tail.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(hint) = parse_message_hint(trimmed) {
            return Some(hint);
        }
    }

    None
}

fn parse_message_hint(line: &str) -> Option<(String, String, Option<String>)> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    let message = value.get("message")?;
    let role = message.get("role").and_then(Value::as_str)?.to_string();
    if !is_searchable_message_role(&role) {
        return None;
    }

    let text = message_text_hint(message)?;
    let model = message.get("model").and_then(Value::as_str).map(String::from);
    Some((truncate_text(&text, 150), role, model))
}

fn message_text_hint(message: &Value) -> Option<String> {
    match message.get("content") {
        Some(Value::String(text)) => Some(text.trim().to_string()).filter(|text| !text.is_empty()),
        Some(Value::Array(parts)) => parts.iter().filter_map(|part| part.get("text").and_then(Value::as_str)).map(str::trim).find(|text| !text.is_empty()).map(str::to_string),
        _ => None,
    }
}

fn parse_pi_session_reader<R: BufRead>(reader: R, path: &Path) -> Result<(PiSessionHeader, Vec<RawPiEntry>), String> {
    let mut lines = reader.lines();
    let header_line = lines.next().ok_or_else(|| format!("Pi session {} is empty", path.display()))?.map_err(|e| format!("Failed to read Pi session header {}: {e}", path.display()))?;

    let header = parse_header(&header_line, path)?;
    let mut entries = Vec::new();

    for (line_number, line_result) in lines.enumerate() {
        let line = match line_result {
            Ok(line) => line,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        let Some(entry) = parse_raw_entry(&value, header.timestamp, line_number + 2) else {
            continue;
        };
        entries.push(entry);
    }

    Ok((header, entries))
}

fn parse_header(line: &str, path: &Path) -> Result<PiSessionHeader, String> {
    let value = serde_json::from_str::<Value>(line).map_err(|e| format!("Invalid Pi session header in {}: {e}", path.display()))?;

    if value.get("type").and_then(Value::as_str) != Some("session") {
        return Err(format!("Invalid Pi session header in {}: expected type=session", path.display()));
    }

    let id = required_string_field(&value, "id").ok_or_else(|| format!("Invalid Pi session header in {}: missing id", path.display()))?;
    let cwd = required_string_field(&value, "cwd").ok_or_else(|| format!("Invalid Pi session header in {}: missing cwd", path.display()))?;
    let timestamp = value.get("timestamp").and_then(Value::as_str).and_then(parse_rfc3339_timestamp).ok_or_else(|| format!("Invalid Pi session header in {}: missing or invalid timestamp", path.display()))?;

    Ok(PiSessionHeader { id, cwd, timestamp, name: optional_trimmed_string(&value, "name"), parent_session_path: optional_trimmed_string(&value, "parentSession") })
}

fn parse_raw_entry(value: &Value, fallback_timestamp: DateTime<Utc>, synthetic_index: usize) -> Option<RawPiEntry> {
    let entry_type = value.get("type").and_then(Value::as_str)?.to_string();
    let base = parse_raw_entry_base(value, &entry_type, fallback_timestamp, synthetic_index)?;

    match entry_type.as_str() {
        "message" => parse_message_entry(value, base),
        "label" => parse_label_entry(value, base),
        "session_info" => Some(RawPiEntry::SessionInfo { base, name: optional_trimmed_string(value, "name") }),
        "model_change" | "thinking_level_change" => Some(RawPiEntry::Other { base }),
        _ => Some(RawPiEntry::Other { base }),
    }
}

fn parse_raw_entry_base(value: &Value, entry_type: &str, fallback_timestamp: DateTime<Utc>, synthetic_index: usize) -> Option<RawEntryBase> {
    let is_session_info = entry_type == "session_info";
    let id = required_string_field(value, "id").or_else(|| is_session_info.then(|| format!("session_info:{synthetic_index}")))?;
    let timestamp = value.get("timestamp").and_then(Value::as_str).and_then(parse_rfc3339_timestamp).or_else(|| is_session_info.then_some(fallback_timestamp))?;

    Some(RawEntryBase { entry_type: entry_type.to_string(), id, parent_id: optional_string_field(value, "parentId"), timestamp })
}

fn parse_message_entry(value: &Value, base: RawEntryBase) -> Option<RawPiEntry> {
    let message_value = value.get("message")?;
    let role = message_value.get("role").and_then(Value::as_str).unwrap_or("unknown").to_string();
    let content = parse_message_content(message_value.get("content"));
    let model = message_value.get("model").and_then(Value::as_str).map(String::from);
    let provider = message_value.get("provider").and_then(Value::as_str).map(String::from);
    let usage = message_value.get("usage").cloned();

    Some(RawPiEntry::Message {
        base,
        message: Message {
            role,
            content,
            tool_call_id: message_value.get("toolCallId").and_then(Value::as_str).map(String::from),
            tool_name: message_value.get("toolName").and_then(Value::as_str).map(String::from),
            is_error: message_value.get("isError").and_then(Value::as_bool),
            model,
            provider,
            usage,
        },
    })
}

fn parse_label_entry(value: &Value, base: RawEntryBase) -> Option<RawPiEntry> {
    Some(RawPiEntry::Label { base, target_id: required_string_field(value, "targetId")?, label: optional_string_field(value, "label") })
}

fn parse_message_content(content: Option<&Value>) -> Vec<Content> {
    match content {
        Some(Value::String(text)) => vec![Content { content_type: "text".to_string(), id: None, name: None, arguments: None, text: Some(text.clone()) }],
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                let item_type = item.get("type").and_then(Value::as_str)?;
                match item_type {
                    "text" => item.get("text").and_then(Value::as_str).map(|text| Content { content_type: "text".to_string(), id: None, name: None, arguments: None, text: Some(text.to_string()) }),
                    "thinking" => item.get("thinking").and_then(Value::as_str).map(|thinking| Content { content_type: "thinking".to_string(), id: None, name: None, arguments: None, text: Some(thinking.to_string()) }),
                    "toolCall" => Some(Content {
                        content_type: "toolCall".to_string(),
                        id: item.get("id").and_then(Value::as_str).map(String::from),
                        name: item.get("name").and_then(Value::as_str).map(String::from),
                        arguments: item.get("arguments").cloned(),
                        text: item.get("text").and_then(Value::as_str).map(String::from),
                    }),
                    _ => None,
                }
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn required_string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(str::trim).filter(|value| !value.is_empty()).map(ToString::to_string)
}

fn optional_string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(ToString::to_string)
}

fn optional_trimmed_string(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(str::trim).filter(|value| !value.is_empty()).map(ToString::to_string)
}

fn parse_rfc3339_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value).ok().map(|timestamp| timestamp.with_timezone(&Utc))
}

fn is_searchable_message_role(role: &str) -> bool {
    role == "user" || role == "assistant"
}

fn visible_message_text(message: &Message) -> String {
    message.content.iter().filter(|item| item.content_type != "thinking").filter_map(|item| item.text.as_deref()).map(str::trim).filter(|text| !text.is_empty()).collect::<Vec<_>>().join("\n")
}

fn resolve_session_name(header_name: Option<String>, entries: &[RawPiEntry]) -> Option<String> {
    let mut name = header_name;

    for entry in entries {
        let RawPiEntry::SessionInfo { name: next_name, .. } = entry else {
            continue;
        };
        name = next_name.clone();
    }

    name
}

fn truncate_text(text: &str, max_len: usize) -> String {
    let first_line = text.lines().next().unwrap_or("").trim();
    if first_line.chars().count() <= max_len {
        return first_line.to_string();
    }

    let mut truncated = String::new();
    for ch in first_line.chars().take(max_len.saturating_sub(3)) {
        truncated.push(ch);
    }
    truncated.push_str("...");
    truncated
}

#[cfg(test)]
mod tests {
    use super::{parse_pi_session_entries, parse_pi_session_header_only, parse_pi_session_info, resolve_labels};
    use chrono::{DateTime, Utc};
    use std::fs;
    use tempfile::tempdir;

    fn write_session_file(contents: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        fs::write(&path, contents).expect("write session");
        (temp_dir, path)
    }

    fn timestamp(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value).expect("valid timestamp").with_timezone(&Utc)
    }

    #[test]
    fn parses_valid_pi_header_and_derives_session_info() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello world\"}]}}\n",
            "{\"type\":\"message\",\"id\":\"m2\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"hi back\"}]}}\n"
        ));

        let (info, entries) = parse_pi_session_info(&path, timestamp("2026-04-09T10:05:00Z")).expect("parse pi session");

        assert_eq!(info.id, "sess-1");
        assert_eq!(info.cwd, "/workspace/project");
        assert_eq!(info.created, timestamp("2026-04-09T10:00:00Z"));
        assert_eq!(info.modified, timestamp("2026-04-09T10:05:00Z"));
        assert_eq!(info.message_count, 2);
        assert_eq!(info.first_message, "hello world");
        assert_eq!(info.last_message, "hi back");
        assert_eq!(info.last_message_role, "assistant");
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn header_only_parse_reads_tail_hint_without_full_parse() {
        let filler = "x".repeat(96 * 1024);
        let contents = format!(
            concat!(
                "{{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}}\n",
                "{{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{{\"role\":\"user\",\"content\":[{{\"type\":\"text\",\"text\":\"early\"}}]}}}}\n",
                "{{\"type\":\"label\",\"id\":\"l1\",\"targetId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"label\":\"{filler}\"}}\n",
                "{{\"type\":\"message\",\"id\":\"m2\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"message\":{{\"role\":\"assistant\",\"content\":[{{\"type\":\"text\",\"text\":\"tail hint\"}}]}}}}\n"
            ),
            filler = filler,
        );
        let (_temp_dir, path) = write_session_file(&contents);

        let info = parse_pi_session_header_only(&path, timestamp("2026-04-09T10:05:00Z")).expect("header-only parse");

        assert_eq!(info.id, "sess-1");
        assert_eq!(info.last_message, "tail hint");
        assert_eq!(info.last_message_role, "assistant");
        assert!(info.message_count > 0);
        assert!(info.first_message.is_empty());
    }

    #[test]
    fn uses_header_name_when_no_session_info_entries_exist() {
        let (_temp_dir, path) = write_session_file("{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\",\"name\":\"Header name\"}\n");

        let (info, _) = parse_pi_session_info(&path, timestamp("2026-04-09T10:00:00Z")).expect("parse pi session");
        assert_eq!(info.name.as_deref(), Some("Header name"));
    }

    #[test]
    fn parses_idless_session_info_entries_written_by_rename_flow() {
        let (_temp_dir, path) = write_session_file(concat!("{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n", "{\"type\":\"session_info\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"name\":\"Renamed session\"}\n"));

        let (info, entries) = parse_pi_session_info(&path, timestamp("2026-04-09T10:01:00Z")).expect("parse pi session");
        assert_eq!(info.name.as_deref(), Some("Renamed session"));
        assert_eq!(entries.len(), 1);
        assert!(entries[0].id.starts_with("session_info:"));
    }

    #[test]
    fn modified_reflects_latest_metadata_activity() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n",
            "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"targetId\":\"m1\",\"label\":\"bookmark\"}\n",
            "{\"type\":\"session_info\",\"timestamp\":\"2026-04-09T10:04:00Z\",\"name\":\"Renamed\"}\n"
        ));

        let (info, _) = parse_pi_session_info(&path, timestamp("2026-04-09T10:02:00Z")).expect("parse pi session");
        assert_eq!(info.modified, timestamp("2026-04-09T10:04:00Z"));
        assert_eq!(info.name.as_deref(), Some("Renamed"));
    }

    #[test]
    fn rejects_missing_or_invalid_header() {
        let (_temp_dir, path) = write_session_file("{\"type\":\"message\",\"id\":\"m1\",\"timestamp\":\"2026-04-09T10:01:00Z\"}\n");

        let error = parse_pi_session_entries(&path).expect_err("missing header should fail");
        assert!(error.contains("Invalid Pi session header"));
    }

    #[test]
    fn parses_string_form_message_content() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":\"plain string\"}}\n"
        ));

        let entries = parse_pi_session_entries(&path).expect("parse entries");
        let message = entries[0].message.as_ref().expect("message entry");
        assert_eq!(message.content.len(), 1);
        assert_eq!(message.content[0].content_type, "text");
        assert_eq!(message.content[0].text.as_deref(), Some("plain string"));
    }

    #[test]
    fn parses_array_form_text_and_thinking_content() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"visible\"},{\"type\":\"thinking\",\"thinking\":\"hidden\"},{\"type\":\"toolCall\",\"name\":\"ignored\"}]}}\n"
        ));

        let entries = parse_pi_session_entries(&path).expect("parse entries");
        let message = entries[0].message.as_ref().expect("message entry");
        assert_eq!(message.content.len(), 3);
        assert_eq!(message.content[0].content_type, "text");
        assert_eq!(message.content[0].text.as_deref(), Some("visible"));
        assert_eq!(message.content[1].content_type, "thinking");
        assert_eq!(message.content[1].text.as_deref(), Some("hidden"));
        assert_eq!(message.content[2].content_type, "toolCall");
        assert_eq!(message.content[2].name.as_deref(), Some("ignored"));
    }

    #[test]
    fn resolves_latest_label_by_file_order() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n",
            "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"targetId\":\"m1\",\"label\":\"first\"}\n",
            "{\"type\":\"label\",\"id\":\"l2\",\"parentId\":\"l1\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"targetId\":\"m1\",\"label\":\"second\"}\n"
        ));

        let entries = parse_pi_session_entries(&path).expect("parse entries");
        let labels = resolve_labels(&entries);
        let resolved = labels.get("m1").expect("resolved label");
        assert_eq!(resolved.text, "second");
        assert_eq!(resolved.labeled_at, timestamp("2026-04-09T10:03:00Z"));
    }

    #[test]
    fn clears_label_when_latest_assignment_is_empty() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n",
            "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"targetId\":\"m1\",\"label\":\"bookmark\"}\n",
            "{\"type\":\"label\",\"id\":\"l2\",\"parentId\":\"l1\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"targetId\":\"m1\",\"label\":\"   \"}\n"
        ));

        let entries = parse_pi_session_entries(&path).expect("parse entries");
        let labels = resolve_labels(&entries);
        assert!(!labels.contains_key("m1"));
    }

    #[test]
    fn resolves_latest_session_name_and_clears_empty_names() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"session_info\",\"id\":\"s1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"name\":\"First name\"}\n",
            "{\"type\":\"session_info\",\"id\":\"s2\",\"parentId\":\"s1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"name\":\"  \"}\n"
        ));

        let (info, _) = parse_pi_session_info(&path, timestamp("2026-04-09T10:05:00Z")).expect("parse pi session");
        assert_eq!(info.name, None);
    }

    #[test]
    fn label_resolution_is_whole_file_not_branch_local() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "{\"type\":\"message\",\"id\":\"root\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"root\"}]}}\n",
            "{\"type\":\"message\",\"id\":\"branch-a\",\"parentId\":\"root\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"a\"}]}}\n",
            "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"branch-a\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"targetId\":\"root\",\"label\":\"alpha\"}\n",
            "{\"type\":\"message\",\"id\":\"branch-b\",\"parentId\":\"root\",\"timestamp\":\"2026-04-09T10:04:00Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"b\"}]}}\n",
            "{\"type\":\"label\",\"id\":\"l2\",\"parentId\":\"branch-b\",\"timestamp\":\"2026-04-09T10:05:00Z\",\"targetId\":\"root\",\"label\":\"omega\"}\n"
        ));

        let entries = parse_pi_session_entries(&path).expect("parse entries");
        let labels = resolve_labels(&entries);
        assert_eq!(labels.get("root").map(|label| label.text.as_str()), Some("omega"));
    }

    #[test]
    fn skips_malformed_non_header_lines_without_aborting() {
        let (_temp_dir, path) = write_session_file(concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace/project\"}\n",
            "not-json\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"kept\"}]}}\n"
        ));

        let (info, entries) = parse_pi_session_info(&path, timestamp("2026-04-09T10:05:00Z")).expect("parse pi session");
        assert_eq!(entries.len(), 1);
        assert_eq!(info.message_count, 1);
        assert_eq!(info.first_message, "kept");
    }
}
