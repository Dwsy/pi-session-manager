use crate::types::SessionEntry;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{OnceLock, RwLock};
use tracing::info;

use crate::{config, sqlite_cache};

use super::session::{FileStats, SessionChunk};

fn utf8_safe_cut(buf: &[u8], mut end: usize) -> usize {
    end = end.min(buf.len());

    while end > 0 && std::str::from_utf8(&buf[..end]).is_err() {
        end -= 1;
    }

    end
}

#[derive(Clone)]
struct TransformedSessionCacheEntry {
    modified_at_ms: u128,
    content: String,
}

#[derive(Clone)]
struct SessionLabelsCacheEntry {
    modified_at_ms: u128,
    file_size: u64,
    tail_fingerprint: Option<u64>,
    labels: HashMap<String, String>,
}

const PROVIDER_DETECTION_PROBE_BYTES: usize = 64 * 1024;
const SESSION_LABELS_TAIL_FINGERPRINT_BYTES: u64 = 4 * 1024;

fn transformed_session_cache() -> &'static RwLock<HashMap<String, TransformedSessionCacheEntry>> {
    static CACHE: OnceLock<RwLock<HashMap<String, TransformedSessionCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn session_labels_cache() -> &'static RwLock<HashMap<String, SessionLabelsCacheEntry>> {
    static CACHE: OnceLock<RwLock<HashMap<String, SessionLabelsCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn file_modified_ms(path: &str) -> Result<u128, String> {
    let backing_path = crate::domain::session_bridge::backing_file_path(Path::new(path));
    let modified = fs::metadata(backing_path).map_err(|e| format!("Failed to get session file metadata: {e}"))?.modified().map_err(|e| format!("Failed to get modified time: {e}"))?;
    modified.duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_millis()).map_err(|e| format!("Failed to convert modified time: {e}"))
}

fn file_modified_ms_and_size(path: &str) -> Result<(u128, u64), String> {
    let backing_path = crate::domain::session_bridge::backing_file_path(Path::new(path));
    let metadata = fs::metadata(backing_path).map_err(|e| format!("Failed to get session file metadata: {e}"))?;
    let modified = metadata.modified().map_err(|e| format!("Failed to get modified time: {e}"))?;
    let modified_at_ms = modified.duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_millis()).map_err(|e| format!("Failed to convert modified time: {e}"))?;
    Ok((modified_at_ms, metadata.len()))
}

fn session_labels_tail_bytes(file: &mut fs::File, file_size: u64) -> Option<Vec<u8>> {
    let start = file_size.saturating_sub(SESSION_LABELS_TAIL_FINGERPRINT_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;

    let mut buffer = vec![0u8; (file_size - start) as usize];
    file.read_exact(&mut buffer).ok()?;
    Some(buffer)
}

fn session_labels_tail_fingerprint_bytes(buffer: &[u8]) -> u64 {
    // Compact FNV-1a hash avoids retaining a per-session byte buffer while
    // still rejecting changed old suffixes before the append fast path.
    let mut fingerprint = 0xcbf29ce484222325u64;
    for byte in buffer {
        fingerprint ^= u64::from(*byte);
        fingerprint = fingerprint.wrapping_mul(0x100000001b3);
    }
    fingerprint
}

fn session_labels_tail_fingerprint(path: &str, file_size: u64) -> Option<u64> {
    let backing_path = crate::domain::session_bridge::backing_file_path(Path::new(path));
    let mut file = fs::File::open(backing_path).ok()?;
    let tail = session_labels_tail_bytes(&mut file, file_size)?;
    Some(session_labels_tail_fingerprint_bytes(&tail))
}

fn label_free_append_tail_fingerprint(path: &str, from_size: u64, to_size: u64, expected_old_tail_fingerprint: u64) -> Option<u64> {
    const LABEL_APPEND_PROBE_BYTES: u64 = 64 * 1024;

    if to_size <= from_size {
        return None;
    }

    let appended_bytes = to_size - from_size;
    if appended_bytes > LABEL_APPEND_PROBE_BYTES {
        return None;
    }

    let backing_path = crate::domain::session_bridge::backing_file_path(Path::new(path));
    let mut file = fs::File::open(backing_path).ok()?;
    let old_tail = session_labels_tail_bytes(&mut file, from_size)?;
    if session_labels_tail_fingerprint_bytes(&old_tail) != expected_old_tail_fingerprint {
        return None;
    }

    // Only inspect a self-contained JSONL suffix. If the previous snapshot or
    // the current append ends mid-line, refresh conservatively so a label split
    // across writes cannot be skipped when the cache offset advances.
    if from_size > 0 && old_tail.last() != Some(&b'\n') {
        return None;
    }

    file.seek(SeekFrom::Start(from_size)).ok()?;
    let mut appended = vec![0u8; appended_bytes as usize];
    file.read_exact(&mut appended).ok()?;
    if appended.last() != Some(&b'\n') {
        return None;
    }

    let text = String::from_utf8_lossy(&appended);
    if text.lines().filter_map(|line| serde_json::from_str::<Value>(line.trim()).ok()).any(|value| value.get("type").and_then(Value::as_str) == Some("label")) {
        return None;
    }

    let tail_bytes = SESSION_LABELS_TAIL_FINGERPRINT_BYTES as usize;
    let appended_tail_start = appended.len().saturating_sub(tail_bytes);
    let old_tail_bytes_to_keep = tail_bytes.saturating_sub(appended.len()).min(old_tail.len());
    let mut new_tail = Vec::with_capacity(tail_bytes.min(old_tail_bytes_to_keep + appended.len()));
    new_tail.extend_from_slice(&old_tail[old_tail.len() - old_tail_bytes_to_keep..]);
    new_tail.extend_from_slice(&appended[appended_tail_start..]);

    Some(session_labels_tail_fingerprint_bytes(&new_tail))
}

fn get_cached_session_labels(path: &str, modified_at_ms: u128, file_size: u64) -> Option<HashMap<String, String>> {
    let entry = session_labels_cache().read().ok()?.get(path).cloned()?;

    if entry.modified_at_ms == modified_at_ms && entry.file_size == file_size {
        return Some(entry.labels);
    }

    // Active Pi sessions append ordinary message rows much more often than
    // labels. Verify the previous suffix, inspect the appended JSONL rows, and
    // derive the new suffix fingerprint with a single file open.
    let expected_old_tail_fingerprint = entry.tail_fingerprint?;
    if let Some(tail_fingerprint) = label_free_append_tail_fingerprint(path, entry.file_size, file_size, expected_old_tail_fingerprint) {
        if let Ok(mut guard) = session_labels_cache().write() {
            let still_current = guard.get(path).map(|current| current.modified_at_ms == entry.modified_at_ms && current.file_size == entry.file_size && current.tail_fingerprint == entry.tail_fingerprint).unwrap_or(false);
            if still_current {
                guard.insert(path.to_string(), SessionLabelsCacheEntry { modified_at_ms, file_size, tail_fingerprint: Some(tail_fingerprint), labels: entry.labels.clone() });
            }
        }
        return Some(entry.labels);
    }

    None
}

fn detect_session_provider(path: &Path) -> Result<Option<crate::domain::casr_min::providers::ProviderKind>, String> {
    if let Some(provider) = crate::domain::casr_min::providers::detect_provider(Some(path), "") {
        return Ok(Some(provider));
    }

    let backing_path = crate::domain::casr_min::bridge_ops::backing_file_path(path);
    let mut file = fs::File::open(&backing_path).map_err(|e| format!("Failed to read session file {}: {e}", backing_path.display()))?;
    let mut buffer = vec![0u8; PROVIDER_DETECTION_PROBE_BYTES];
    let bytes_read = file.read(&mut buffer).map_err(|e| format!("Failed to read session file {}: {e}", backing_path.display()))?;
    buffer.truncate(bytes_read);

    let probe = String::from_utf8_lossy(&buffer);
    if let Some(provider) = crate::domain::casr_min::providers::detect_provider(Some(path), &probe) {
        return Ok(Some(provider));
    }
    if bytes_read < PROVIDER_DETECTION_PROBE_BYTES {
        return Ok(None);
    }

    let content = fs::read_to_string(&backing_path).map_err(|e| format!("Failed to read session file {}: {e}", backing_path.display()))?;
    Ok(crate::domain::casr_min::providers::detect_provider(Some(path), &content))
}

fn resolve_pi_session_labels(path: &Path) -> Result<HashMap<String, String>, String> {
    let start = std::time::Instant::now();
    let labels = crate::domain::pi_session::parse_pi_session_labels(path)?;
    let elapsed = start.elapsed();
    info!("[IO] resolve_pi_session_labels path={} labels={} elapsed={:?}", path.display(), labels.len(), elapsed);
    Ok(labels)
}

fn get_session_labels_sync(path: &str) -> Result<HashMap<String, String>, String> {
    let session_path = Path::new(path);
    let provider = detect_session_provider(session_path)?;
    if !matches!(provider, Some(crate::domain::casr_min::providers::ProviderKind::Pi) | Some(crate::domain::casr_min::providers::ProviderKind::Omp)) {
        return Ok(HashMap::new());
    }

    let (modified_at_ms, file_size) = file_modified_ms_and_size(path)?;
    if let Some(labels) = get_cached_session_labels(path, modified_at_ms, file_size) {
        return Ok(labels);
    }

    let start = std::time::Instant::now();
    let labels = resolve_pi_session_labels(session_path)?;
    let elapsed = start.elapsed();
    info!("[IO] get_session_labels cache_miss path={} elapsed={:?}", path, elapsed);

    if let Ok(mut guard) = session_labels_cache().write() {
        let tail_fingerprint = session_labels_tail_fingerprint(path, file_size);
        guard.insert(path.to_string(), SessionLabelsCacheEntry { modified_at_ms, file_size, tail_fingerprint, labels: labels.clone() });
    }

    Ok(labels)
}

fn transformed_session_content(path: &str) -> Result<Option<String>, String> {
    let session_path = Path::new(path);

    // Fast path: detect provider without reading file content
    if let Some(provider) = crate::domain::casr_min::providers::detect_provider(Some(session_path), "") {
        if matches!(provider, crate::domain::casr_min::providers::ProviderKind::Pi | crate::domain::casr_min::providers::ProviderKind::Omp) {
            return Ok(None); // Pi/OMP sessions use native chunked reading
        }
    }

    let modified_at_ms = file_modified_ms(path)?;
    if let Ok(guard) = transformed_session_cache().read() {
        if let Some(entry) = guard.get(path) {
            if entry.modified_at_ms == modified_at_ms {
                return Ok(Some(entry.content.clone()));
            }
        }
    }

    let start = std::time::Instant::now();
    let Ok((source, canonical)) = crate::domain::session_bridge::read_canonical_session_from_path(session_path) else {
        return Ok(None);
    };
    let elapsed = start.elapsed();
    info!("[IO] transformed_session_content casr_parse path={} elapsed={:?}", path, elapsed);

    if matches!(source, crate::domain::session_bridge::SessionBridgeSource::Pi | crate::domain::session_bridge::SessionBridgeSource::Omp) {
        return Ok(None);
    }

    let content = crate::domain::session_bridge::preview_canonical_for_viewer(&canonical)?;

    if let Ok(mut guard) = transformed_session_cache().write() {
        guard.insert(path.to_string(), TransformedSessionCacheEntry { modified_at_ms, content: content.clone() });
    }

    Ok(Some(content))
}

fn chunk_string_content(content: &str, offset: Option<u64>, max_bytes: Option<usize>) -> Result<SessionChunk, String> {
    const DEFAULT_CHUNK_BYTES: usize = 256 * 1024;
    const MAX_CHUNK_BYTES: usize = 1024 * 1024;

    let bytes = content.as_bytes();
    let file_size = bytes.len() as u64;
    let start_offset = offset.unwrap_or(0).min(file_size) as usize;

    if start_offset >= bytes.len() {
        return Ok(SessionChunk { content: String::new(), next_offset: file_size, file_size, has_more: false });
    }

    let chunk_bytes = max_bytes.unwrap_or(DEFAULT_CHUNK_BYTES).clamp(1, MAX_CHUNK_BYTES);
    let end = (start_offset + chunk_bytes).min(bytes.len());
    let mut cut = utf8_safe_cut(bytes, end);
    let mut has_more = cut < bytes.len();

    if has_more {
        if let Some(last_newline_idx) = bytes[start_offset..cut].iter().rposition(|b| *b == b'\n') {
            cut = start_offset + last_newline_idx + 1;
        }

        if cut <= start_offset {
            let fallback_end = (start_offset + 8192).min(bytes.len());
            cut = utf8_safe_cut(bytes, fallback_end);
        }
    }

    let content = String::from_utf8(bytes[start_offset..cut].to_vec()).map_err(|e| format!("Failed to decode session content as UTF-8: {e}"))?;
    let next_offset = cut as u64;
    if next_offset >= file_size {
        has_more = false;
    }

    Ok(SessionChunk { content, next_offset, file_size, has_more })
}

pub(super) async fn read_session_file_chunk_impl(path: String, offset: Option<u64>, max_bytes: Option<usize>) -> Result<SessionChunk, String> {
    let start = std::time::Instant::now();
    if let Some(transformed) = transformed_session_content(&path)? {
        let elapsed = start.elapsed();
        info!("[IO] read_session_file_chunk transformed path={} bytes={} elapsed={:?}", path, transformed.len(), elapsed);
        return chunk_string_content(&transformed, offset, max_bytes);
    }

    const DEFAULT_CHUNK_BYTES: usize = 256 * 1024;
    const MAX_CHUNK_BYTES: usize = 1024 * 1024;
    const JSON_ARRAY_PROBE_BYTES: usize = 100;

    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let file_size = file.metadata().map_err(|e| format!("Failed to get session file metadata: {e}"))?.len();

    // Single file open: probe first bytes for JSON array detection
    let mut probe = [0u8; JSON_ARRAY_PROBE_BYTES];
    let probe_n = file.read(&mut probe).unwrap_or(0);
    let is_json_array = std::str::from_utf8(&probe[..probe_n]).map(|text| text.trim_start().starts_with('[')).unwrap_or(false);

    if is_json_array {
        // Read entire file content (JSON array files are typically small)
        let mut content = String::with_capacity(file_size as usize);
        // Reuse the probe bytes we already read
        if probe_n > 0 {
            content.push_str(std::str::from_utf8(&probe[..probe_n]).unwrap_or(""));
        }
        file.read_to_string(&mut content).map_err(|e| format!("Failed to read session file: {e}"))?;
        let elapsed = start.elapsed();
        info!("[IO] read_session_file_chunk json_array path={} bytes={} elapsed={:?}", path, content.len(), elapsed);
        let start_offset = offset.unwrap_or(0);
        if start_offset > 0 {
            return Ok(SessionChunk { content: String::new(), next_offset: file_size, file_size, has_more: false });
        }
        return Ok(SessionChunk { content, next_offset: file_size, file_size, has_more: false });
    }

    // Normal JSONL path: seek to start_offset and read chunk
    let start_offset = offset.unwrap_or(0).min(file_size);

    if start_offset >= file_size {
        return Ok(SessionChunk { content: String::new(), next_offset: file_size, file_size, has_more: false });
    }

    let chunk_bytes = max_bytes.unwrap_or(DEFAULT_CHUNK_BYTES).clamp(1, MAX_CHUNK_BYTES);

    file.seek(SeekFrom::Start(start_offset)).map_err(|e| format!("Failed to seek session file: {e}"))?;

    let mut buffer = vec![0u8; chunk_bytes];
    let bytes_read = file.read(&mut buffer).map_err(|e| format!("Failed to read session file chunk: {e}"))?;
    buffer.truncate(bytes_read);

    if buffer.is_empty() {
        return Ok(SessionChunk { content: String::new(), next_offset: start_offset, file_size, has_more: start_offset < file_size });
    }

    let mut cut = utf8_safe_cut(&buffer, buffer.len());
    if start_offset + (bytes_read as u64) < file_size {
        if let Some(last_newline_idx) = buffer[..cut].iter().rposition(|b| *b == b'\n') {
            cut = last_newline_idx + 1;
        } else {
            // JSONL entries are atomic: a base64 image or large tool payload may
            // exceed the nominal chunk size. Read through its terminating newline
            // instead of returning invalid line fragments that the viewer drops.
            loop {
                let buffered_len = buffer.len();
                let mut continuation = [0u8; 64 * 1024];
                let continuation_read = file.read(&mut continuation).map_err(|e| format!("Failed to continue oversized JSONL entry: {e}"))?;
                if continuation_read == 0 {
                    cut = buffer.len();
                    break;
                }

                buffer.extend_from_slice(&continuation[..continuation_read]);
                if let Some(newline_idx) = buffer[buffered_len..].iter().position(|byte| *byte == b'\n') {
                    cut = buffered_len + newline_idx + 1;
                    break;
                }
            }
        }
    }

    let content = String::from_utf8(buffer[..cut].to_vec()).map_err(|e| format!("Failed to decode session chunk as UTF-8: {e}"))?;
    let next_offset = start_offset + cut as u64;
    let has_more = next_offset < file_size;

    Ok(SessionChunk { content, next_offset, file_size, has_more })
}

pub(super) async fn read_session_file_impl(path: String) -> Result<String, String> {
    let start = std::time::Instant::now();
    if let Some(transformed) = transformed_session_content(&path)? {
        let elapsed = start.elapsed();
        info!("[IO] read_session_file transformed path={} bytes={} elapsed={:?}", path, transformed.len(), elapsed);
        return Ok(transformed);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;
    let elapsed = start.elapsed();
    info!("[IO] read_session_file direct path={} bytes={} elapsed={:?}", path, content.len(), elapsed);
    Ok(content)
}

pub(super) async fn read_session_file_incremental_impl(path: String, from_line: usize) -> Result<(usize, String), String> {
    let start = std::time::Instant::now();
    if let Some(transformed) = transformed_session_content(&path)? {
        let lines: Vec<&str> = transformed.lines().collect();
        let total_lines = lines.len();
        let elapsed = start.elapsed();
        info!("[IO] read_session_file_incremental transformed path={} bytes={} lines={} elapsed={:?}", path, transformed.len(), total_lines, elapsed);
        if from_line >= total_lines {
            return Ok((total_lines, String::new()));
        }
        return Ok((total_lines, lines[from_line..].join("\n")));
    }

    // Stream line-by-line with BufReader to avoid loading entire file into memory.
    // For a 10MB file this still reads all bytes but avoids a 10MB String allocation.
    use std::io::{BufRead, BufReader};
    let file = fs::File::open(&path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let reader = BufReader::with_capacity(256 * 1024, file);

    let mut total_lines = 0usize;
    let mut new_lines = Vec::new();
    for line_result in reader.lines() {
        let line = line_result.map_err(|e| format!("Failed to read line: {e}"))?;
        if total_lines >= from_line {
            new_lines.push(line);
        }
        total_lines += 1;
    }

    let elapsed = start.elapsed();
    info!("[IO] read_session_file_incremental path={} from_line={} total_lines={} elapsed={:?}", path, from_line, total_lines, elapsed);

    if from_line >= total_lines {
        return Ok((total_lines, String::new()));
    }

    Ok((total_lines, new_lines.join("\n")))
}

pub(super) async fn read_session_file_incremental_offset_impl(path: String, from_offset: u64) -> Result<(u64, String), String> {
    if let Some(transformed) = transformed_session_content(&path)? {
        let bytes = transformed.as_bytes();
        let file_size = bytes.len() as u64;
        if from_offset >= file_size {
            return Ok((file_size, String::new()));
        }
        let content = String::from_utf8(bytes[from_offset as usize..].to_vec()).map_err(|e| format!("Failed to decode session content as UTF-8: {e}"))?;
        return Ok((file_size, content));
    }

    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let file_size = file.metadata().map_err(|e| format!("Failed to get session file metadata: {e}"))?.len();

    if from_offset >= file_size {
        return Ok((file_size, String::new()));
    }

    file.seek(SeekFrom::Start(from_offset)).map_err(|e| format!("Failed to seek session file: {e}"))?;

    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| format!("Failed to read session file incrementally: {e}"))?;

    let new_offset = from_offset + buf.len() as u64;
    let content = String::from_utf8(buf).map_err(|e| format!("Failed to decode session content as UTF-8: {e}"))?;

    Ok((new_offset, content))
}

pub(super) async fn get_file_stats_impl(path: String) -> Result<FileStats, String> {
    let metadata = fs::metadata(crate::domain::session_bridge::backing_file_path(Path::new(&path))).map_err(|e| format!("Failed to get file metadata: {e}"))?;

    let modified = metadata.modified().map_err(|e| format!("Failed to get modified time: {e}"))?;

    let modified_at = modified.duration_since(std::time::UNIX_EPOCH).map_err(|e| format!("Failed to convert modified time: {e}"))?.as_millis() as u64;

    Ok(FileStats { size: metadata.len(), modified_at, is_file: metadata.is_file() })
}

fn parse_session_entry(line: &str) -> Option<SessionEntry> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    let entry_type = value["type"].as_str().unwrap_or("unknown").to_string();
    let id = value["id"].as_str().unwrap_or("").to_string();
    let parent_id = value["parentId"].as_str().map(|s| s.to_string());
    let timestamp_str = value["timestamp"].as_str().unwrap_or("");

    let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp_str).map(|dt| dt.with_timezone(&chrono::Utc)).unwrap_or_else(|_| chrono::Utc::now());

    let message = value.get("message").and_then(|m| serde_json::from_value(m.clone()).ok());

    Some(SessionEntry {
        entry_type,
        id,
        parent_id,
        timestamp,
        message,
        target_id: value.get("targetId").and_then(|field| field.as_str()).map(|field| field.to_string()),
        label: value.get("label").and_then(|field| field.as_str()).map(|field| field.to_string()),
        name: value.get("name").and_then(|field| field.as_str()).map(|field| field.to_string()),
        provider: None,
        model_id: None,
    })
}

pub(super) async fn get_session_entries_impl(path: String) -> Result<Vec<SessionEntry>, String> {
    let start = std::time::Instant::now();
    if let Some(transformed) = transformed_session_content(&path)? {
        let mut entries = Vec::new();
        for line in transformed.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Some(entry) = parse_session_entry(line) {
                entries.push(entry);
            }
        }
        let elapsed = start.elapsed();
        info!("[IO] get_session_entries transformed path={} entries={} elapsed={:?}", path, entries.len(), elapsed);
        return Ok(entries);
    }
    let result = crate::domain::session_bridge::parse_session_entries_from_path(Path::new(&path))?;
    let elapsed = start.elapsed();
    info!("[IO] get_session_entries direct path={} entries={} elapsed={:?}", path, result.len(), elapsed);
    Ok(result)
}

/// Read the first line of a JSONL file (session metadata).
fn read_first_jsonl_line(path: &str) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Failed to open {path}: {e}"))?;
    let mut buf = Vec::new();
    // Read until first newline or 64KB
    let mut tmp = [0u8; 4096];
    loop {
        let n = file.read(&mut tmp).map_err(|e| format!("Read error: {e}"))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            buf.truncate(pos);
            break;
        }
        if buf.len() > 65536 {
            break;
        }
    }
    String::from_utf8(buf).map_err(|e| format!("UTF-8 error: {e}"))
}

/// Read message entries from SQLite for preview mode.
/// Returns only user/assistant messages with text content, skipping tool calls/thinking.
pub(super) async fn get_session_preview_entries_impl(session_path: String) -> Result<Vec<SessionEntry>, String> {
    let start = std::time::Instant::now();
    let all_entries_result = tokio::task::spawn_blocking(move || -> Result<Vec<SessionEntry>, String> {
        let mut all_entries: Vec<SessionEntry> = Vec::new();

        // 1. Read first line of JSONL for session metadata (timestamp, model, provider)
        if let Ok(first_line) = read_first_jsonl_line(&session_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&first_line) {
                if val.get("type").and_then(|v| v.as_str()) == Some("session") {
                    let timestamp = val.get("timestamp").and_then(|v| v.as_str()).and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.with_timezone(&chrono::Utc)).unwrap_or_else(chrono::Utc::now);
                    let provider = val.get("provider").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let model_id = val.get("modelId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let session_id = val.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

                    all_entries.push(SessionEntry { entry_type: "session".to_string(), id: session_id.clone(), parent_id: None, timestamp, message: None, target_id: None, label: None, name: None, provider: Some(provider.clone()), model_id: Some(model_id.clone()) });

                    // Also emit a model_change entry so computeStats picks up the model
                    if !provider.is_empty() || !model_id.is_empty() {
                        all_entries.push(SessionEntry { entry_type: "model_change".to_string(), id: format!("{}-model", session_id.clone()), parent_id: None, timestamp, message: None, target_id: None, label: None, name: None, provider: Some(provider), model_id: Some(model_id) });
                    }
                }
            }
        }

        // 2. Query message entries from SQLite (user + assistant text only)
        let config = config::load_config()?;
        let conn = crate::data::sqlite::init_db_with_config(&config)?;
        let mut stmt = conn
            .prepare("SELECT entry_id, role, content, timestamp FROM message_entries WHERE session_path = ?1 AND role IN ('user', 'assistant') AND TRIM(content) != '' AND content NOT LIKE '[Tool:%' AND content NOT LIKE '[Tool Output]%' ORDER BY timestamp ASC")
            .map_err(|e| format!("Failed to prepare preview query: {e}"))?;

        let rows = stmt.query_map(rusqlite::params![session_path], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))).map_err(|e| format!("Failed to query preview entries: {e}"))?;

        for row in rows {
            let (entry_id, role, content_text, timestamp_str) = row.map_err(|e| format!("Failed to read preview row: {e}"))?;

            let timestamp: chrono::DateTime<chrono::Utc> = chrono::DateTime::parse_from_rfc3339(&timestamp_str).map(|dt| dt.with_timezone(&chrono::Utc)).unwrap_or_else(|_| chrono::Utc::now());

            let content = if content_text.trim().is_empty() { Vec::new() } else { vec![crate::types::Content { content_type: "text".to_string(), id: None, name: None, arguments: None, text: Some(content_text) }] };

            if content.is_empty() {
                continue;
            }

            all_entries.push(SessionEntry {
                entry_type: "message".to_string(),
                id: entry_id,
                parent_id: None,
                timestamp,
                message: Some(crate::types::Message { role, content, tool_call_id: None, tool_name: None, is_error: None, model: None, provider: None, usage: None }),
                target_id: None,
                label: None,
                name: None,
                provider: None,
                model_id: None,
            });
        }
        Ok(all_entries)
    })
    .await
    .map_err(|e| format!("Failed to join preview task: {e}"))??;

    let elapsed = start.elapsed();
    info!("[IO] get_session_preview_entries path={} entries={} elapsed={:?}", all_entries_result.first().map(|e| e.id.as_str()).unwrap_or(""), all_entries_result.len(), elapsed);
    Ok(all_entries_result)
}

pub(super) async fn get_session_labels_impl(path: String) -> Result<HashMap<String, String>, String> {
    tokio::task::spawn_blocking(move || get_session_labels_sync(&path)).await.map_err(|e| format!("Failed to join get_session_labels task: {e}"))?
}

pub(super) async fn get_session_by_path_impl(path: String) -> Result<Option<crate::types::SessionInfo>, String> {
    let config = config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    crate::data::sqlite::get_session(&conn, &path)
}

pub(super) async fn get_session_by_id_impl(id: String) -> Result<Option<crate::types::SessionInfo>, String> {
    let config = config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    crate::data::sqlite::get_session_by_id(&conn, &id)
}

pub(super) async fn delete_sessions_impl(paths: Vec<String>) -> Result<super::session::DeleteSessionsResult, String> {
    let mut deleted_count = 0usize;
    let mut failed = Vec::new();
    let mut seen_paths = HashSet::new();

    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !seen_paths.insert(trimmed.to_string()) {
            continue;
        }

        match crate::core::delete::delete_session_file_and_cache(trimmed) {
            Ok(_) => deleted_count += 1,
            Err(error) => failed.push(super::session::DeleteSessionFailure { path: trimmed.to_string(), error }),
        }
    }

    Ok(super::session::DeleteSessionsResult { deleted_count, failed })
}

fn update_session_name_lines(lines: &mut [String], new_name: &str) -> Result<bool, String> {
    let mut session_info_index = None;
    let mut header_index = None;

    for (index, line) in lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match value.get("type").and_then(Value::as_str) {
            Some("session_info") => session_info_index = Some(index),
            Some("session") if header_index.is_none() => header_index = Some(index),
            _ => {}
        }
    }

    let Some(target_index) = session_info_index.or(header_index) else {
        return Ok(false);
    };

    let mut value = serde_json::from_str::<Value>(&lines[target_index]).map_err(|e| format!("Failed to parse session metadata line: {e}"))?;
    let Some(obj) = value.as_object_mut() else {
        return Ok(false);
    };
    obj.insert("name".to_string(), serde_json::Value::String(new_name.to_string()));
    lines[target_index] = serde_json::to_string(&value).map_err(|e| format!("Failed to serialize: {e}"))?;
    Ok(true)
}

fn build_session_info_line(new_name: &str) -> Result<String, String> {
    let now = chrono::Utc::now();
    let session_info = serde_json::json!({
        "type": "session_info",
        "id": format!("session-info-{}", now.timestamp_millis()),
        "parentId": serde_json::Value::Null,
        "name": new_name,
        "timestamp": now.to_rfc3339()
    });
    serde_json::to_string(&session_info).map_err(|e| format!("Failed to serialize: {e}"))
}

async fn rename_session_impl_with_db_path(path: String, new_name: String, db_path: Option<&Path>) -> Result<(), String> {
    let line = build_session_info_line(&new_name)?;
    let mut file = std::fs::OpenOptions::new().append(true).open(&path).map_err(|e| format!("Failed to open session file for append: {e}"))?;
    std::io::Write::write_all(&mut file, format!("{line}\n").as_bytes()).map_err(|e| format!("Failed to append session info: {e}"))?;

    // Sync update to database cache to avoid waiting for file watcher
    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let conn = match db_path {
        Some(db_path) => crate::data::sqlite::init_db_with_path(db_path, &config)?,
        None => crate::data::sqlite::init_db_with_config(&config)?,
    };
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE sessions SET name = ?1, modified = ?2 WHERE path = ?3", rusqlite::params![&new_name, &now, &path]).map_err(|e| format!("Failed to update session name in cache: {e}"))?;

    Ok(())
}

pub(super) async fn rename_session_impl(path: String, new_name: String) -> Result<(), String> {
    rename_session_impl_with_db_path(path, new_name, None).await
}

pub async fn fork_session_impl(source_path: String, target_name: Option<String>) -> Result<crate::types::SessionInfo, String> {
    // Read source session file
    let content = fs::read_to_string(&source_path).map_err(|e| format!("Failed to read source session: {e}"))?;

    let mut lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Err("Source session is empty".to_string());
    }

    // Parse header to get source info
    let header: Value = serde_json::from_str(lines[0]).map_err(|e| format!("Failed to parse source session header: {e}"))?;

    if header["type"] != "session" {
        return Err("Invalid source session: missing session header".to_string());
    }

    let _source_id = header["id"].as_str().unwrap_or("unknown");
    let source_cwd = header["cwd"].as_str().unwrap_or("").to_string();

    // Generate new session ID and file name
    let new_id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).expect("system clock before Unix epoch").as_nanos());
    let now = chrono::Utc::now();
    let timestamp = now.format("%Y-%m-%dT%H-%M-%S%.3f").to_string();
    let filename = format!("{}_{}.jsonl", timestamp, &new_id[..8]);

    // Determine target directory (same as source)
    let source_path_buf = std::path::PathBuf::from(&source_path);
    let target_dir = source_path_buf.parent().ok_or("Failed to get parent directory of source session")?;
    let target_path = target_dir.join(&filename);

    // Build new header with parentSession
    let new_header = serde_json::json!({
        "type": "session",
        "version": 3,
        "id": new_id.clone(),
        "timestamp": now.to_rfc3339(),
        "cwd": source_cwd,
        "parentSession": source_path
    });

    // Write new session file
    let mut output_lines = vec![serde_json::to_string(&new_header).map_err(|e| format!("Failed to serialize new header: {e}"))?];

    // Copy all non-header entries
    for line in lines.iter().skip(1) {
        if !line.trim().is_empty() {
            output_lines.push(line.to_string());
        }
    }

    // Add session_info if target_name is provided
    if let Some(name) = &target_name {
        let entry_id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).expect("system clock before Unix epoch").as_nanos());
        let session_info = serde_json::json!({
            "type": "session_info",
            "id": &entry_id[..8],
            "parentId": null,
            "timestamp": now.to_rfc3339(),
            "name": name
        });
        output_lines.push(serde_json::to_string(&session_info).map_err(|e| format!("Failed to serialize session_info: {e}"))?);
    }

    // Write to file
    fs::write(&target_path, output_lines.join("\n")).map_err(|e| format!("Failed to write forked session: {e}"))?;

    // Parse the new session info
    let (session_info, _) = crate::core::scanner::parse_session_info(&target_path)?;

    // Update cache
    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let mut conn = crate::data::sqlite::init_db_with_config(&config)?;
    let file_modified = now;
    crate::data::sqlite::upsert_session(&mut conn, &session_info, file_modified, None)?;
    let _ = crate::data::sqlite::upsert_scan_state_for_session(&conn, &session_info, file_modified, "ok");

    // Update scanner cache in-place so next list/read path avoids full rescan
    crate::core::scanner::upsert_cached_session(session_info.clone());

    Ok(session_info)
}

#[cfg(test)]
mod tests {
    use super::{
        file_modified_ms, file_modified_ms_and_size, get_cached_session_labels, get_session_labels_impl, label_free_append_tail_fingerprint, read_session_file_chunk_impl, read_session_file_incremental_impl, read_session_file_incremental_offset_impl, rename_session_impl_with_db_path,
        session_labels_cache, session_labels_tail_fingerprint, utf8_safe_cut, SessionLabelsCacheEntry,
    };
    use std::collections::HashMap;
    use std::fs;
    use std::path::Path;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tempfile::tempdir;

    fn rewrite_until_modified(path: &Path, contents: &str, previous_modified_at_ms: u128) -> u128 {
        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(10));
            fs::write(path, contents).expect("rewrite session content");

            let modified_at_ms = file_modified_ms(path.to_str().expect("path utf8")).expect("read modified time");
            if modified_at_ms != previous_modified_at_ms {
                return modified_at_ms;
            }
        }

        panic!("session modified time did not change after rewrite")
    }

    #[test]
    fn utf8_safe_cut_trims_incomplete_multibyte_suffix() {
        let mut bytes = b"hello ".to_vec();
        bytes.extend_from_slice("你".as_bytes());
        bytes.pop();
        assert_eq!(utf8_safe_cut(&bytes, bytes.len()), b"hello ".len());
    }

    #[tokio::test]
    async fn read_session_file_chunk_keeps_oversized_jsonl_entry_intact() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        let payload = "x".repeat(12_000);
        let content = format!("{{\"id\":\"root\"}}\n{{\"id\":\"image-tool-result\",\"data\":\"{payload}\"}}\n{{\"id\":\"child\"}}\n");
        fs::write(&path, &content).expect("write session content");

        let first = read_session_file_chunk_impl(path.to_str().expect("path utf8").to_string(), Some(0), Some(64)).await.expect("read first chunk");
        assert_eq!(first.content, "{\"id\":\"root\"}\n");

        let oversized = read_session_file_chunk_impl(path.to_str().expect("path utf8").to_string(), Some(first.next_offset), Some(64)).await.expect("read oversized entry");
        assert_eq!(oversized.content.lines().count(), 1);
        assert!(oversized.content.contains("image-tool-result"));
        assert_eq!(serde_json::from_str::<serde_json::Value>(oversized.content.trim()).expect("oversized entry remains valid JSON")["data"].as_str().expect("payload string").len(), payload.len());

        let last = read_session_file_chunk_impl(path.to_str().expect("path utf8").to_string(), Some(oversized.next_offset), Some(64)).await.expect("read final chunk");
        assert_eq!(last.content, "{\"id\":\"child\"}\n");
        assert!(!last.has_more);
    }

    #[tokio::test]
    async fn read_session_file_chunk_handles_incomplete_utf8_at_chunk_end() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).expect("system time after epoch").as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-chunk-utf8-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        let mut content = b"abcd".to_vec();
        content.extend_from_slice("你".as_bytes());
        content.extend_from_slice(b"\n{\"id\":\"next\"}\n");
        fs::write(&path, &content).expect("write session content");

        let chunk = read_session_file_chunk_impl(path.to_str().expect("path utf8").to_string(), Some(0), Some(5)).await.expect("chunk should decode");

        assert_eq!(chunk.content, "abcd你\n");
        assert_eq!(chunk.next_offset, 8);
        assert!(chunk.has_more);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn read_session_file_incremental_returns_new_lines() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).expect("system time after epoch").as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-incremental-lines-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        fs::write(&path, "line-1\nline-2\nline-3\n").expect("write session content");

        let (total_lines, content) = read_session_file_incremental_impl(path.to_str().expect("path utf8").to_string(), 1).await.expect("incremental read should succeed");

        assert_eq!(total_lines, 3);
        assert_eq!(content, "line-2\nline-3");

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn read_session_file_incremental_offset_returns_tail_content() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).expect("system time after epoch").as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-incremental-offset-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        fs::write(&path, "alpha\nbeta\n").expect("write session content");

        let (offset, content) = read_session_file_incremental_offset_impl(path.to_str().expect("path utf8").to_string(), 6).await.expect("offset read should succeed");

        assert_eq!(content, "beta\n");
        assert_eq!(offset, 11);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[test]
    fn cached_session_labels_reuses_and_advances_stale_label_free_append() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        let initial = concat!("{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\"}\n", "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"targetId\":\"m1\",\"label\":\"cached\"}\n");
        fs::write(&path, initial).expect("write initial session");

        let path_str = path.to_str().expect("path utf8").to_string();
        let (initial_modified_at_ms, initial_file_size) = file_modified_ms_and_size(&path_str).expect("initial metadata");
        let labels = HashMap::from([("m1".to_string(), "cached".to_string())]);
        session_labels_cache()
            .write()
            .expect("cache lock")
            .insert(path_str.clone(), SessionLabelsCacheEntry { modified_at_ms: initial_modified_at_ms.saturating_sub(20_000), file_size: initial_file_size, tail_fingerprint: session_labels_tail_fingerprint(&path_str, initial_file_size), labels: labels.clone() });

        let appended = format!("{initial}{}", "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:02:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n");
        let updated_modified_at_ms = rewrite_until_modified(&path, &appended, initial_modified_at_ms);
        let (_, updated_file_size) = file_modified_ms_and_size(&path_str).expect("updated metadata");

        let cached = get_cached_session_labels(&path_str, updated_modified_at_ms, updated_file_size).expect("label-free append should reuse cache");
        assert_eq!(cached, labels);

        let cache = session_labels_cache().read().expect("cache lock");
        let cache_entry = cache.get(&path_str).expect("cache entry");
        assert_eq!(cache_entry.modified_at_ms, updated_modified_at_ms);
        assert_eq!(cache_entry.file_size, updated_file_size);
        assert_eq!(cache_entry.tail_fingerprint, session_labels_tail_fingerprint(&path_str, updated_file_size));
    }

    #[test]
    fn label_free_append_tail_fingerprint_matches_full_tail_after_large_append() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        let initial = "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\"}\n";
        fs::write(&path, initial).expect("write initial session");

        let path_str = path.to_str().expect("path utf8").to_string();
        let initial_size = fs::metadata(&path).expect("initial metadata").len();
        let initial_fingerprint = session_labels_tail_fingerprint(&path_str, initial_size).expect("initial fingerprint");
        let payload = "x".repeat(8 * 1024);
        let appended = format!("{{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:02:00Z\",\"message\":{{\"role\":\"user\",\"content\":[{{\"type\":\"text\",\"text\":\"{payload}\"}}]}}}}\n");
        fs::write(&path, format!("{initial}{appended}")).expect("append large message");
        let updated_size = fs::metadata(&path).expect("updated metadata").len();

        let incremental = label_free_append_tail_fingerprint(&path_str, initial_size, updated_size, initial_fingerprint).expect("label-free append should produce fingerprint");
        let full = session_labels_tail_fingerprint(&path_str, updated_size).expect("full fingerprint");
        assert_eq!(incremental, full);
    }

    #[tokio::test]
    async fn get_session_labels_rejects_growth_after_in_place_tail_rewrite() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        let initial = concat!("{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\"}\n", "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"targetId\":\"m1\",\"label\":\"cached\"}\n",);
        fs::write(&path, initial).expect("write initial session");

        let path_str = path.to_str().expect("path utf8").to_string();
        let initial_labels = get_session_labels_impl(path_str.clone()).await.expect("initial labels should succeed");
        assert_eq!(initial_labels.get("m1").map(String::as_str), Some("cached"));

        let (initial_modified_at_ms, initial_file_size) = file_modified_ms_and_size(&path_str).expect("initial metadata");
        let rewritten = initial.replace("\"cached\"", "\"edited\"");
        let grown = format!("{rewritten}{}", "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:02:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n");
        rewrite_until_modified(&path, &grown, initial_modified_at_ms);
        let (_, updated_file_size) = file_modified_ms_and_size(&path_str).expect("updated metadata");
        assert!(updated_file_size > initial_file_size);

        let refreshed = get_session_labels_impl(path_str).await.expect("rewritten labels should refresh");
        assert_eq!(refreshed.get("m1").map(String::as_str), Some("edited"));
    }

    #[tokio::test]
    async fn get_session_labels_returns_empty_for_non_pi_sessions() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        fs::write(&path, "[]").expect("write session content");

        let labels = get_session_labels_impl(path.to_str().expect("path utf8").to_string()).await.expect("non-pi labels should succeed");

        assert!(labels.is_empty());
    }

    #[tokio::test]
    async fn get_session_labels_returns_latest_wins_labels_for_all_targets() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\"}\n",
                "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n",
                "{\"type\":\"session_info\",\"id\":\"info-1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:01:30Z\",\"name\":\"Tree node\"}\n",
                "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"targetId\":\"m1\",\"label\":\"first\"}\n",
                "{\"type\":\"label\",\"id\":\"l2\",\"parentId\":\"l1\",\"timestamp\":\"2026-04-09T10:03:00Z\",\"targetId\":\"m1\",\"label\":\"second\"}\n",
                "{\"type\":\"label\",\"id\":\"l3\",\"parentId\":\"info-1\",\"timestamp\":\"2026-04-09T10:04:00Z\",\"targetId\":\"info-1\",\"label\":\"sidebar marker\"}\n"
            ),
        )
        .expect("write session content");

        let labels = get_session_labels_impl(path.to_str().expect("path utf8").to_string()).await.expect("pi labels should succeed");

        let expected = HashMap::from([("info-1".to_string(), "sidebar marker".to_string()), ("m1".to_string(), "second".to_string())]);
        assert_eq!(labels, expected);
    }

    #[tokio::test]
    async fn get_session_labels_refreshes_cache_when_modified_time_changes() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\"}\n",
                "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n",
                "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"targetId\":\"m1\",\"label\":\"before\"}\n"
            ),
        )
        .expect("write session content");

        let path_str = path.to_str().expect("path utf8").to_string();
        let initial = get_session_labels_impl(path_str.clone()).await.expect("initial labels should succeed");
        assert_eq!(initial.get("m1").map(String::as_str), Some("before"));

        let previous_modified_at_ms = file_modified_ms(&path_str).expect("read modified time");
        let updated_modified_at_ms = rewrite_until_modified(
            &path,
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\"}\n",
                "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"2026-04-09T10:01:00Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}\n",
                "{\"type\":\"label\",\"id\":\"l1\",\"parentId\":\"m1\",\"timestamp\":\"2026-04-09T10:02:00Z\",\"targetId\":\"m1\",\"label\":\"after\"}\n"
            ),
            previous_modified_at_ms,
        );

        let refreshed = get_session_labels_impl(path_str.clone()).await.expect("refreshed labels should succeed");
        assert_eq!(refreshed.get("m1").map(String::as_str), Some("after"));

        let cache = session_labels_cache().read().expect("cache lock");
        let cache_entry = cache.get(&path_str).expect("cache entry");
        assert_eq!(cache_entry.modified_at_ms, updated_modified_at_ms);
        assert_eq!(cache_entry.labels.get("m1").map(String::as_str), Some("after"));
    }

    #[tokio::test]
    async fn rename_session_updates_latest_session_info_line() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).expect("system time after epoch").as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-rename-existing-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        let db_path = base_dir.join("test.db");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"session\",\"id\":\"sess-1\",\"timestamp\":\"2026-04-09T10:00:00Z\",\"cwd\":\"/workspace\",\"name\":\"header-name\"}\n",
                "{\"type\":\"session_info\",\"id\":\"info-1\",\"timestamp\":\"2026-04-09T10:01:00Z\",\"name\":\"old\"}\n",
                "{\"type\":\"message\",\"id\":\"m1\"}\n"
            ),
        )
        .expect("write session content");

        rename_session_impl_with_db_path(path.to_str().expect("path utf8").to_string(), "new-name".to_string(), Some(&db_path)).await.expect("rename should succeed");

        let content = fs::read_to_string(&path).expect("read updated session");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 4);
        assert!(lines[0].contains("\"name\":\"header-name\""));
        assert!(lines[1].contains("\"type\":\"session_info\""));
        assert!(lines[1].contains("\"name\":\"old\""));
        assert!(lines[1].contains("\"id\":\"info-1\""));
        assert!(lines[2].contains("\"id\":\"m1\""));
        assert!(lines[3].contains("\"type\":\"session_info\""));
        assert!(lines[3].contains("\"name\":\"new-name\""));

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn rename_session_appends_session_info_when_missing() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).expect("system time after epoch").as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-rename-append-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        let db_path = base_dir.join("test.db");
        fs::write(&path, "{\"type\":\"message\",\"id\":\"m1\"}\n").expect("write session content");

        rename_session_impl_with_db_path(path.to_str().expect("path utf8").to_string(), "added-name".to_string(), Some(&db_path)).await.expect("rename should succeed");

        let content = fs::read_to_string(&path).expect("read updated session");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\"id\":\"m1\""));
        assert!(lines[1].contains("\"type\":\"session_info\""));
        assert!(lines[1].contains("\"name\":\"added-name\""));
        assert!(lines[1].contains("\"id\":\"session-info-"));
        assert!(lines[1].contains("\"parentId\":null"));

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }
}
