use crate::types::SessionEntry;
use serde_json::Value;
use std::cmp;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{OnceLock, RwLock};

use crate::{config, sqlite_cache};

use super::session::{FileStats, SessionChunk};

fn utf8_safe_cut(buf: &[u8], mut end: usize) -> usize {
    end = end.min(buf.len());

    while end > 0 && std::str::from_utf8(&buf[..end]).is_err() {
        end -= 1;
    }

    end
}

fn looks_like_json_array_file(path: &str) -> bool {
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };
    content.trim_start().starts_with('[')
}

#[derive(Clone)]
struct TransformedSessionCacheEntry {
    modified_at_ms: u128,
    content: String,
}

#[derive(Clone)]
struct SessionLabelsCacheEntry {
    modified_at_ms: u128,
    labels: HashMap<String, String>,
}

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
    let modified = fs::metadata(backing_path)
        .map_err(|e| format!("Failed to get session file metadata: {e}"))?
        .modified()
        .map_err(|e| format!("Failed to get modified time: {e}"))?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|e| format!("Failed to convert modified time: {e}"))
}

fn detect_session_provider(
    path: &Path,
) -> Result<Option<crate::domain::casr_min::providers::ProviderKind>, String> {
    if let Some(provider) = crate::domain::casr_min::providers::detect_provider(Some(path), "") {
        return Ok(Some(provider));
    }

    let backing_path = crate::domain::casr_min::bridge_ops::backing_file_path(path);
    let content = fs::read_to_string(&backing_path).map_err(|e| {
        format!(
            "Failed to read session file {}: {e}",
            backing_path.display()
        )
    })?;
    Ok(crate::domain::casr_min::providers::detect_provider(
        Some(path),
        &content,
    ))
}

fn resolve_pi_session_labels(path: &Path) -> Result<HashMap<String, String>, String> {
    let entries = crate::domain::pi_session::parse_pi_session_entries(path)?;
    Ok(crate::domain::pi_session::resolve_labels(&entries)
        .into_iter()
        .map(|(target_id, resolved)| (target_id, resolved.text))
        .collect())
}

fn get_session_labels_sync(path: &str) -> Result<HashMap<String, String>, String> {
    let session_path = Path::new(path);
    if detect_session_provider(session_path)?
        != Some(crate::domain::casr_min::providers::ProviderKind::Pi)
    {
        return Ok(HashMap::new());
    }

    let modified_at_ms = file_modified_ms(path)?;
    if let Ok(guard) = session_labels_cache().read() {
        if let Some(entry) = guard.get(path) {
            if entry.modified_at_ms == modified_at_ms {
                return Ok(entry.labels.clone());
            }
        }
    }

    let labels = resolve_pi_session_labels(session_path)?;

    if let Ok(mut guard) = session_labels_cache().write() {
        guard.insert(
            path.to_string(),
            SessionLabelsCacheEntry {
                modified_at_ms,
                labels: labels.clone(),
            },
        );
    }

    Ok(labels)
}

fn transformed_session_content(path: &str) -> Result<Option<String>, String> {
    let session_path = Path::new(path);
    let Ok((source, canonical)) =
        crate::domain::session_bridge::read_canonical_session_from_path(session_path)
    else {
        return Ok(None);
    };

    if source == crate::domain::session_bridge::SessionBridgeSource::Pi {
        return Ok(None);
    }

    let modified_at_ms = file_modified_ms(path)?;
    if let Ok(guard) = transformed_session_cache().read() {
        if let Some(entry) = guard.get(path) {
            if entry.modified_at_ms == modified_at_ms {
                return Ok(Some(entry.content.clone()));
            }
        }
    }

    let content = crate::domain::session_bridge::preview_canonical_for_viewer(&canonical)?;

    if let Ok(mut guard) = transformed_session_cache().write() {
        guard.insert(
            path.to_string(),
            TransformedSessionCacheEntry {
                modified_at_ms,
                content: content.clone(),
            },
        );
    }

    Ok(Some(content))
}

fn chunk_string_content(
    content: &str,
    offset: Option<u64>,
    max_bytes: Option<usize>,
) -> Result<SessionChunk, String> {
    const DEFAULT_CHUNK_BYTES: usize = 256 * 1024;
    const MAX_CHUNK_BYTES: usize = 1024 * 1024;

    let bytes = content.as_bytes();
    let file_size = bytes.len() as u64;
    let start_offset = offset.unwrap_or(0).min(file_size) as usize;

    if start_offset >= bytes.len() {
        return Ok(SessionChunk {
            content: String::new(),
            next_offset: file_size,
            file_size,
            has_more: false,
        });
    }

    let chunk_bytes = max_bytes
        .unwrap_or(DEFAULT_CHUNK_BYTES)
        .clamp(1, MAX_CHUNK_BYTES);
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

    let content = String::from_utf8(bytes[start_offset..cut].to_vec())
        .map_err(|e| format!("Failed to decode session content as UTF-8: {e}"))?;
    let next_offset = cut as u64;
    if next_offset >= file_size {
        has_more = false;
    }

    Ok(SessionChunk {
        content,
        next_offset,
        file_size,
        has_more,
    })
}

pub(super) async fn read_session_file_chunk_impl(
    path: String,
    offset: Option<u64>,
    max_bytes: Option<usize>,
) -> Result<SessionChunk, String> {
    if let Some(transformed) = transformed_session_content(&path)? {
        return chunk_string_content(&transformed, offset, max_bytes);
    }

    if looks_like_json_array_file(&path) {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;
        let file_size = content.len() as u64;
        let start_offset = offset.unwrap_or(0);
        if start_offset > 0 {
            return Ok(SessionChunk {
                content: String::new(),
                next_offset: file_size,
                file_size,
                has_more: false,
            });
        }
        return Ok(SessionChunk {
            content,
            next_offset: file_size,
            file_size,
            has_more: false,
        });
    }

    const DEFAULT_CHUNK_BYTES: usize = 256 * 1024;
    const MAX_CHUNK_BYTES: usize = 1024 * 1024;

    let mut file =
        fs::File::open(&path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let file_size = file
        .metadata()
        .map_err(|e| format!("Failed to get session file metadata: {e}"))?
        .len();

    let start_offset = offset.unwrap_or(0).min(file_size);

    if start_offset >= file_size {
        return Ok(SessionChunk {
            content: String::new(),
            next_offset: file_size,
            file_size,
            has_more: false,
        });
    }

    let chunk_bytes = max_bytes
        .unwrap_or(DEFAULT_CHUNK_BYTES)
        .clamp(1, MAX_CHUNK_BYTES);

    file.seek(SeekFrom::Start(start_offset))
        .map_err(|e| format!("Failed to seek session file: {e}"))?;

    let mut buffer = vec![0u8; chunk_bytes];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read session file chunk: {e}"))?;
    buffer.truncate(bytes_read);

    if buffer.is_empty() {
        return Ok(SessionChunk {
            content: String::new(),
            next_offset: start_offset,
            file_size,
            has_more: start_offset < file_size,
        });
    }

    let base_next_offset = start_offset + bytes_read as u64;

    let mut cut = utf8_safe_cut(&buffer, buffer.len());
    let mut has_more = base_next_offset < file_size;

    if has_more {
        if let Some(last_newline_idx) = buffer[..cut].iter().rposition(|b| *b == b'\n') {
            cut = last_newline_idx + 1;
        }

        if cut == 0 {
            let fallback_len = cmp::min(buffer.len(), 8192);
            cut = utf8_safe_cut(&buffer, fallback_len);
        }

        if cut == 0 {
            let next_offset = (start_offset + 1).min(file_size);
            return Ok(SessionChunk {
                content: String::new(),
                next_offset,
                file_size,
                has_more: next_offset < file_size,
            });
        }
    }

    let content_bytes = &buffer[..cut];
    let content = String::from_utf8(content_bytes.to_vec())
        .map_err(|e| format!("Failed to decode session chunk as UTF-8: {e}"))?;

    let next_offset = start_offset + cut as u64;
    if next_offset >= file_size {
        has_more = false;
    }

    Ok(SessionChunk {
        content,
        next_offset,
        file_size,
        has_more,
    })
}

pub(super) async fn read_session_file_impl(path: String) -> Result<String, String> {
    if let Some(transformed) = transformed_session_content(&path)? {
        return Ok(transformed);
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))
}

pub(super) async fn read_session_file_incremental_impl(
    path: String,
    from_line: usize,
) -> Result<(usize, String), String> {
    if let Some(transformed) = transformed_session_content(&path)? {
        let lines: Vec<&str> = transformed.lines().collect();
        let total_lines = lines.len();
        if from_line >= total_lines {
            return Ok((total_lines, String::new()));
        }
        return Ok((total_lines, lines[from_line..].join("\n")));
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    if from_line >= total_lines {
        return Ok((total_lines, String::new()));
    }

    let new_lines: Vec<&str> = lines[from_line..].to_vec();
    let new_content = new_lines.join("\n");

    Ok((total_lines, new_content))
}

pub(super) async fn read_session_file_incremental_offset_impl(
    path: String,
    from_offset: u64,
) -> Result<(u64, String), String> {
    if let Some(transformed) = transformed_session_content(&path)? {
        let bytes = transformed.as_bytes();
        let file_size = bytes.len() as u64;
        if from_offset >= file_size {
            return Ok((file_size, String::new()));
        }
        let content = String::from_utf8(bytes[from_offset as usize..].to_vec())
            .map_err(|e| format!("Failed to decode session content as UTF-8: {e}"))?;
        return Ok((file_size, content));
    }

    let mut file =
        fs::File::open(&path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let file_size = file
        .metadata()
        .map_err(|e| format!("Failed to get session file metadata: {e}"))?
        .len();

    if from_offset >= file_size {
        return Ok((file_size, String::new()));
    }

    file.seek(SeekFrom::Start(from_offset))
        .map_err(|e| format!("Failed to seek session file: {e}"))?;

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read session file incrementally: {e}"))?;

    let new_offset = from_offset + buf.len() as u64;
    let content = String::from_utf8(buf)
        .map_err(|e| format!("Failed to decode session content as UTF-8: {e}"))?;

    Ok((new_offset, content))
}

pub(super) async fn get_file_stats_impl(path: String) -> Result<FileStats, String> {
    let metadata = fs::metadata(crate::domain::session_bridge::backing_file_path(Path::new(
        &path,
    )))
    .map_err(|e| format!("Failed to get file metadata: {e}"))?;

    let modified = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time: {e}"))?;

    let modified_at = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to convert modified time: {e}"))?
        .as_millis() as u64;

    Ok(FileStats {
        size: metadata.len(),
        modified_at,
        is_file: metadata.is_file(),
    })
}

fn parse_session_entry(line: &str) -> Option<SessionEntry> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    let entry_type = value["type"].as_str().unwrap_or("unknown").to_string();
    let id = value["id"].as_str().unwrap_or("").to_string();
    let parent_id = value["parentId"].as_str().map(|s| s.to_string());
    let timestamp_str = value["timestamp"].as_str().unwrap_or("");

    let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp_str)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    let message = value
        .get("message")
        .and_then(|m| serde_json::from_value(m.clone()).ok());

    Some(SessionEntry {
        entry_type,
        id,
        parent_id,
        timestamp,
        message,
        target_id: value
            .get("targetId")
            .and_then(|field| field.as_str())
            .map(|field| field.to_string()),
        label: value
            .get("label")
            .and_then(|field| field.as_str())
            .map(|field| field.to_string()),
    })
}

pub(super) async fn get_session_entries_impl(path: String) -> Result<Vec<SessionEntry>, String> {
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
        return Ok(entries);
    }
    crate::domain::session_bridge::parse_session_entries_from_path(Path::new(&path))
}

pub(super) async fn get_session_labels_impl(
    path: String,
) -> Result<HashMap<String, String>, String> {
    tokio::task::spawn_blocking(move || get_session_labels_sync(&path))
        .await
        .map_err(|e| format!("Failed to join get_session_labels task: {e}"))?
}

pub(super) async fn get_session_by_path_impl(
    path: String,
) -> Result<Option<crate::types::SessionInfo>, String> {
    let config = config::load_config()?;
    let conn = crate::data::sqlite::init_db_with_config(&config)?;
    crate::data::sqlite::get_session(&conn, &path)
}

pub(super) async fn delete_sessions_impl(
    paths: Vec<String>,
) -> Result<super::session::DeleteSessionsResult, String> {
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
            Err(error) => failed.push(super::session::DeleteSessionFailure {
                path: trimmed.to_string(),
                error,
            }),
        }
    }

    Ok(super::session::DeleteSessionsResult {
        deleted_count,
        failed,
    })
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

    let mut value = serde_json::from_str::<Value>(&lines[target_index])
        .map_err(|e| format!("Failed to parse session metadata line: {e}"))?;
    let Some(obj) = value.as_object_mut() else {
        return Ok(false);
    };
    obj.insert(
        "name".to_string(),
        serde_json::Value::String(new_name.to_string()),
    );
    lines[target_index] =
        serde_json::to_string(&value).map_err(|e| format!("Failed to serialize: {e}"))?;
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

async fn rename_session_impl_with_db_path(
    path: String,
    new_name: String,
    db_path: Option<&Path>,
) -> Result<(), String> {
    let line = build_session_info_line(&new_name)?;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open session file for append: {e}"))?;
    std::io::Write::write_all(&mut file, format!("{line}\n").as_bytes())
        .map_err(|e| format!("Failed to append session info: {e}"))?;

    // Sync update to database cache to avoid waiting for file watcher
    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let conn = match db_path {
        Some(db_path) => crate::data::sqlite::init_db_with_path(db_path, &config)?,
        None => crate::data::sqlite::init_db_with_config(&config)?,
    };
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET name = ?1, modified = ?2 WHERE path = ?3",
        rusqlite::params![&new_name, &now, &path],
    )
    .map_err(|e| format!("Failed to update session name in cache: {e}"))?;

    Ok(())
}

pub(super) async fn rename_session_impl(path: String, new_name: String) -> Result<(), String> {
    rename_session_impl_with_db_path(path, new_name, None).await
}

pub async fn fork_session_impl(
    source_path: String,
    target_name: Option<String>,
) -> Result<crate::types::SessionInfo, String> {
    // Read source session file
    let content = fs::read_to_string(&source_path)
        .map_err(|e| format!("Failed to read source session: {e}"))?;

    let mut lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Err("Source session is empty".to_string());
    }

    // Parse header to get source info
    let header: Value = serde_json::from_str(lines[0])
        .map_err(|e| format!("Failed to parse source session header: {e}"))?;

    if header["type"] != "session" {
        return Err("Invalid source session: missing session header".to_string());
    }

    let _source_id = header["id"].as_str().unwrap_or("unknown");
    let source_cwd = header["cwd"].as_str().unwrap_or("").to_string();

    // Generate new session ID and file name
    let new_id = format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock before Unix epoch")
            .as_nanos()
    );
    let now = chrono::Utc::now();
    let timestamp = now.format("%Y-%m-%dT%H-%M-%S%.3f").to_string();
    let filename = format!("{}_{}.jsonl", timestamp, &new_id[..8]);

    // Determine target directory (same as source)
    let source_path_buf = std::path::PathBuf::from(&source_path);
    let target_dir = source_path_buf
        .parent()
        .ok_or("Failed to get parent directory of source session")?;
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
    let mut output_lines = vec![serde_json::to_string(&new_header)
        .map_err(|e| format!("Failed to serialize new header: {e}"))?];

    // Copy all non-header entries
    for line in lines.iter().skip(1) {
        if !line.trim().is_empty() {
            output_lines.push(line.to_string());
        }
    }

    // Add session_info if target_name is provided
    if let Some(name) = &target_name {
        let entry_id = format!(
            "{:x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let session_info = serde_json::json!({
            "type": "session_info",
            "id": &entry_id[..8],
            "parentId": null,
            "timestamp": now.to_rfc3339(),
            "name": name
        });
        output_lines.push(
            serde_json::to_string(&session_info)
                .map_err(|e| format!("Failed to serialize session_info: {e}"))?,
        );
    }

    // Write to file
    fs::write(&target_path, output_lines.join("\n"))
        .map_err(|e| format!("Failed to write forked session: {e}"))?;

    // Parse the new session info
    let (session_info, _) = crate::core::scanner::parse_session_info(&target_path)?;

    // Update cache
    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let mut conn = crate::data::sqlite::init_db_with_config(&config)?;
    let file_modified = now;
    crate::data::sqlite::upsert_session(&mut conn, &session_info, file_modified, None)?;
    let _ = crate::data::sqlite::upsert_scan_state_for_session(
        &conn,
        &session_info,
        file_modified,
        "ok",
    );

    // Update scanner cache in-place so next list/read path avoids full rescan
    crate::core::scanner::upsert_cached_session(session_info.clone());

    Ok(session_info)
}

#[cfg(test)]
mod tests {
    use super::{
        file_modified_ms, get_session_labels_impl, read_session_file_chunk_impl,
        read_session_file_incremental_impl, read_session_file_incremental_offset_impl,
        rename_session_impl_with_db_path, session_labels_cache, utf8_safe_cut,
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

            let modified_at_ms =
                file_modified_ms(path.to_str().expect("path utf8")).expect("read modified time");
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
    async fn read_session_file_chunk_handles_incomplete_utf8_at_chunk_end() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-chunk-utf8-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        let mut content = b"abcd".to_vec();
        content.extend_from_slice("你".as_bytes());
        content.extend_from_slice(b"\n{\"id\":\"next\"}\n");
        fs::write(&path, &content).expect("write session content");

        let chunk = read_session_file_chunk_impl(
            path.to_str().expect("path utf8").to_string(),
            Some(0),
            Some(5),
        )
        .await
        .expect("chunk should decode");

        assert_eq!(chunk.content, "abcd");
        assert_eq!(chunk.next_offset, 4);
        assert!(chunk.has_more);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn read_session_file_incremental_returns_new_lines() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-incremental-lines-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        fs::write(&path, "line-1\nline-2\nline-3\n").expect("write session content");

        let (total_lines, content) =
            read_session_file_incremental_impl(path.to_str().expect("path utf8").to_string(), 1)
                .await
                .expect("incremental read should succeed");

        assert_eq!(total_lines, 3);
        assert_eq!(content, "line-2\nline-3");

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn read_session_file_incremental_offset_returns_tail_content() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-incremental-offset-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        fs::write(&path, "alpha\nbeta\n").expect("write session content");

        let (offset, content) = read_session_file_incremental_offset_impl(
            path.to_str().expect("path utf8").to_string(),
            6,
        )
        .await
        .expect("offset read should succeed");

        assert_eq!(content, "beta\n");
        assert_eq!(offset, 11);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn get_session_labels_returns_empty_for_non_pi_sessions() {
        let temp_dir = tempdir().expect("tempdir");
        let path = temp_dir.path().join("session.jsonl");
        fs::write(&path, "[]").expect("write session content");

        let labels = get_session_labels_impl(path.to_str().expect("path utf8").to_string())
            .await
            .expect("non-pi labels should succeed");

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

        let labels = get_session_labels_impl(path.to_str().expect("path utf8").to_string())
            .await
            .expect("pi labels should succeed");

        let expected = HashMap::from([
            ("info-1".to_string(), "sidebar marker".to_string()),
            ("m1".to_string(), "second".to_string()),
        ]);
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
        let initial = get_session_labels_impl(path_str.clone())
            .await
            .expect("initial labels should succeed");
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

        let refreshed = get_session_labels_impl(path_str.clone())
            .await
            .expect("refreshed labels should succeed");
        assert_eq!(refreshed.get("m1").map(String::as_str), Some("after"));

        let cache = session_labels_cache().read().expect("cache lock");
        let cache_entry = cache.get(&path_str).expect("cache entry");
        assert_eq!(cache_entry.modified_at_ms, updated_modified_at_ms);
        assert_eq!(
            cache_entry.labels.get("m1").map(String::as_str),
            Some("after")
        );
    }

    #[tokio::test]
    async fn rename_session_updates_latest_session_info_line() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
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

        rename_session_impl_with_db_path(
            path.to_str().expect("path utf8").to_string(),
            "new-name".to_string(),
            Some(&db_path),
        )
        .await
        .expect("rename should succeed");

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
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-rename-append-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        let db_path = base_dir.join("test.db");
        fs::write(&path, "{\"type\":\"message\",\"id\":\"m1\"}\n").expect("write session content");

        rename_session_impl_with_db_path(
            path.to_str().expect("path utf8").to_string(),
            "added-name".to_string(),
            Some(&db_path),
        )
        .await
        .expect("rename should succeed");

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
