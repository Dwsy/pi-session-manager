use crate::models::SessionEntry;
use serde_json::Value;
use std::cmp;
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom};

use crate::{config, sqlite_cache};

use super::session::{FileStats, SessionChunk};

fn utf8_safe_cut(buf: &[u8], mut end: usize) -> usize {
    end = end.min(buf.len());

    while end > 0 && std::str::from_utf8(&buf[..end]).is_err() {
        end -= 1;
    }

    end
}

pub(super) async fn read_session_file_chunk_impl(
    path: String,
    offset: Option<u64>,
    max_bytes: Option<usize>,
) -> Result<SessionChunk, String> {
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
    fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))
}

pub(super) async fn read_session_file_incremental_impl(
    path: String,
    from_line: usize,
) -> Result<(usize, String), String> {
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
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file metadata: {e}"))?;

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
    })
}

pub(super) async fn get_session_entries_impl(path: String) -> Result<Vec<SessionEntry>, String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut entries = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Some(entry) = parse_session_entry(line) {
            entries.push(entry);
        }
    }

    Ok(entries)
}

pub(super) async fn get_session_by_path_impl(
    path: String,
) -> Result<Option<crate::models::SessionInfo>, String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    sqlite_cache::get_session(&conn, &path)
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

        match crate::session_delete::delete_session_file_and_cache(trimmed) {
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
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(mut value) = serde_json::from_str::<Value>(line) {
            if value["type"] == "session_info" || value["type"] == "session" {
                if let Some(obj) = value.as_object_mut() {
                    obj.insert(
                        "name".to_string(),
                        serde_json::Value::String(new_name.to_string()),
                    );
                    *line = serde_json::to_string(&value)
                        .map_err(|e| format!("Failed to serialize: {e}"))?;
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
}

fn build_session_info_line(new_name: &str) -> Result<String, String> {
    let session_info = serde_json::json!({
        "type": "session_info",
        "name": new_name,
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    serde_json::to_string(&session_info).map_err(|e| format!("Failed to serialize: {e}"))
}

pub(super) async fn rename_session_impl(path: String, new_name: String) -> Result<(), String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut lines: Vec<String> = content.lines().map(|line| line.to_string()).collect();
    if !update_session_name_lines(&mut lines, &new_name)? {
        lines.push(build_session_info_line(&new_name)?);
    }

    fs::write(&path, lines.join("\n")).map_err(|e| format!("Failed to write session file: {e}"))?;

    // Sync update to database cache to avoid waiting for file watcher
    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET name = ?1, modified = ?2 WHERE path = ?3",
        rusqlite::params![&new_name, &now, &path],
    )
    .map_err(|e| format!("Failed to update session name in cache: {e}"))?;

    Ok(())
}

pub async fn fork_session_impl(
    source_path: String,
    target_name: Option<String>,
) -> Result<crate::models::SessionInfo, String> {
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
            .unwrap()
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
                .unwrap()
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
    let (session_info, _) = crate::scanner::parse_session_info(&target_path)?;

    // Update cache
    let config = config::load_config().map_err(|e| format!("Failed to load config: {e}"))?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    let file_modified = now;
    sqlite_cache::upsert_session(&conn, &session_info, file_modified, None)?;

    // Invalidate scanner cache so next scan picks up the new session
    crate::scanner::invalidate_cache();

    Ok(session_info)
}

#[cfg(test)]
mod tests {
    use super::{
        read_session_file_chunk_impl, read_session_file_incremental_impl,
        read_session_file_incremental_offset_impl, rename_session_impl, utf8_safe_cut,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

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
    async fn rename_session_updates_existing_session_info_line() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after epoch")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("psm-rename-existing-{unique}"));
        fs::create_dir_all(&base_dir).expect("create temp dir");

        let path = base_dir.join("session.jsonl");
        fs::write(
            &path,
            "{\"type\":\"session_info\",\"name\":\"old\"}\n{\"type\":\"message\",\"id\":\"m1\"}\n",
        )
        .expect("write session content");

        rename_session_impl(
            path.to_str().expect("path utf8").to_string(),
            "new-name".to_string(),
        )
        .await
        .expect("rename should succeed");

        let content = fs::read_to_string(&path).expect("read updated session");
        assert!(content.contains("\"type\":\"session_info\""));
        assert!(content.contains("\"name\":\"new-name\""));
        assert!(content.contains("\"id\":\"m1\""));

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
        fs::write(&path, "{\"type\":\"message\",\"id\":\"m1\"}\n").expect("write session content");

        rename_session_impl(
            path.to_str().expect("path utf8").to_string(),
            "added-name".to_string(),
        )
        .await
        .expect("rename should succeed");

        let content = fs::read_to_string(&path).expect("read updated session");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\"id\":\"m1\""));
        assert!(lines[1].contains("\"type\":\"session_info\""));
        assert!(lines[1].contains("\"name\":\"added-name\""));

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(&base_dir);
    }
}
