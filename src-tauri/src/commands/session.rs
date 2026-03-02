use crate::models::{SessionEntry, SessionInfo};
use crate::{config, export, scanner, sqlite_cache, stats};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileStats {
    pub size: u64,
    pub modified_at: u64,
    pub is_file: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PaginatedSessionsResult {
    pub sessions: Vec<SessionInfo>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

fn session_matches_search_query(session: &SessionInfo, raw_query: &str) -> bool {
    let query = raw_query.trim().to_lowercase();
    if query.is_empty() {
        return true;
    }

    let name = session.name.as_deref().unwrap_or_default();
    let fields = [
        name,
        session.first_message.as_str(),
        session.last_message.as_str(),
        session.cwd.as_str(),
    ];

    fields
        .into_iter()
        .any(|field| field.to_lowercase().contains(&query))
}

fn normalize_path_for_match(path: &str) -> String {
    let unified = path.trim().replace('\\', "/");
    let trimmed = unified.trim_end_matches('/');

    if trimmed.is_empty() {
        "/".to_string()
    } else {
        trimmed.to_string()
    }
}

fn path_is_same_or_child(path: &str, root: &str) -> bool {
    if path == root {
        return true;
    }

    if root == "/" {
        return path.starts_with('/');
    }

    path.starts_with(root) && path.as_bytes().get(root.len()) == Some(&b'/')
}

fn session_matches_project_filter(session: &SessionInfo, raw_project: &str) -> bool {
    let project = normalize_path_for_match(raw_project);
    if project.is_empty() {
        return true;
    }

    let session_cwd = normalize_path_for_match(&session.cwd);
    if path_is_same_or_child(&session_cwd, &project) {
        return true;
    }

    let session_path = normalize_path_for_match(&session.path);
    path_is_same_or_child(&session_path, &project)
}

#[cfg(test)]
mod tests {
    use super::session_matches_project_filter;
    use crate::models::SessionInfo;
    use chrono::Utc;

    fn build_session(cwd: &str, path: &str) -> SessionInfo {
        SessionInfo {
            path: path.to_string(),
            id: "s1".to_string(),
            cwd: cwd.to_string(),
            name: Some("session".to_string()),
            created: Utc::now(),
            modified: Utc::now(),
            message_count: 1,
            first_message: "hello".to_string(),
            all_messages_text: String::new(),
            user_messages_text: String::new(),
            assistant_messages_text: String::new(),
            last_message: "world".to_string(),
            last_message_role: "assistant".to_string(),
        }
    }

    #[test]
    fn project_filter_matches_exact_cwd() {
        let session = build_session(
            "/Users/dengwenyu/Dev/code/company/Jly",
            "/Users/dengwenyu/.pi/agent/sessions/a/1.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_matches_child_cwd() {
        let session = build_session(
            "/Users/dengwenyu/Dev/code/company/Jly/sfm_web",
            "/Users/dengwenyu/.pi/agent/sessions/a/2.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_does_not_match_sibling_path() {
        let session = build_session(
            "/Users/dengwenyu/Dev/code/company/Jly2/sfm_web",
            "/Users/dengwenyu/.pi/agent/sessions/a/3.jsonl",
        );
        assert!(!session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }

    #[test]
    fn project_filter_falls_back_to_session_file_path() {
        let session = build_session(
            "Unknown",
            "/Users/dengwenyu/Dev/code/company/Jly/.pi/agent/sessions/a/4.jsonl",
        );
        assert!(session_matches_project_filter(
            &session,
            "/Users/dengwenyu/Dev/code/company/Jly"
        ));
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    scanner::scan_sessions().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_sessions_paginated(
    offset: Option<usize>,
    limit: Option<usize>,
    search_query: Option<String>,
    project_filter: Option<String>,
    filter_tag_ids: Option<Vec<String>>,
) -> Result<PaginatedSessionsResult, String> {
    const DEFAULT_LIMIT: usize = 100;
    const MAX_LIMIT: usize = 500;

    let normalized_limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let normalized_offset = offset.unwrap_or(0);
    let mut sessions = scanner::scan_sessions().await?;

    if let Some(project) = project_filter
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions.retain(|session| session_matches_project_filter(session, project));
    }

    if let Some(query) = search_query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions.retain(|session| session_matches_search_query(session, query));
    }

    if let Some(tag_ids) = filter_tag_ids.as_ref().filter(|ids| !ids.is_empty()) {
        let tag_filter: HashSet<&str> = tag_ids.iter().map(String::as_str).collect();
        let config = config::load_config()?;
        let conn = sqlite_cache::init_db_with_config(&config)?;
        let matched_session_ids: HashSet<String> = sqlite_cache::get_all_session_tags(&conn)?
            .into_iter()
            .filter(|item| tag_filter.contains(item.tag_id.as_str()))
            .map(|item| item.session_id)
            .collect();
        sessions.retain(|session| matched_session_ids.contains(session.id.as_str()));
    }

    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    let total = sessions.len();
    let start = normalized_offset.min(total);
    let end = start.saturating_add(normalized_limit).min(total);
    let page_sessions = sessions[start..end].to_vec();

    Ok(PaginatedSessionsResult {
        sessions: page_sessions,
        total,
        offset: start,
        limit: normalized_limit,
        has_more: end < total,
    })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_incremental(
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

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_session_file_incremental_offset(
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

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_file_stats(path: String) -> Result<FileStats, String> {
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

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_entries(path: String) -> Result<Vec<SessionEntry>, String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut entries = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(value) = serde_json::from_str::<Value>(line) {
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

            entries.push(SessionEntry {
                entry_type,
                id,
                parent_id,
                timestamp,
                message,
            });
        }
    }

    Ok(entries)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_session(path: String) -> Result<(), String> {
    crate::session_delete::delete_session_file_and_cache(&path)?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_session(
    path: String,
    format: String,
    output_path: String,
) -> Result<(), String> {
    export::export_session(&path, &format, &output_path).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn rename_session(path: String, new_name: String) -> Result<(), String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut name_updated = false;

    for line in &mut lines {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(mut value) = serde_json::from_str::<Value>(line) {
            if value["type"] == "session_info" || value["type"] == "session" {
                if let Some(obj) = value.as_object_mut() {
                    obj.insert(
                        "name".to_string(),
                        serde_json::Value::String(new_name.clone()),
                    );
                    *line = serde_json::to_string(&value)
                        .map_err(|e| format!("Failed to serialize: {e}"))?;
                    name_updated = true;
                    break;
                }
            }
        }
    }

    if !name_updated {
        let session_info = serde_json::json!({
            "type": "session_info",
            "name": new_name,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });
        lines.push(
            serde_json::to_string(&session_info)
                .map_err(|e| format!("Failed to serialize: {e}"))?,
        );
    }

    fs::write(&path, lines.join("\n")).map_err(|e| format!("Failed to write session file: {e}"))?;

    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_stats(sessions: Vec<SessionInfo>) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats(&sessions))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_stats_light(
    sessions: Vec<stats::SessionStatsInput>,
) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats_from_inputs(&sessions))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_day_stats(
    date: String,
    sessions: Vec<SessionInfo>,
) -> Result<stats::DayStats, String> {
    stats::get_day_stats(&date, &sessions)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_session_in_terminal(
    path: String,
    cwd: String,
    terminal: Option<String>,
    pi_path: Option<String>,
) -> Result<(), String> {
    let terminal = terminal.unwrap_or_else(|| "iterm2".to_string());
    let pi_cmd = pi_path.unwrap_or_else(|| "pi".to_string());

    let cwd_escaped = cwd.replace("\"", "\\\\\"").replace("\\", "\\\\");
    let path_escaped = path.replace("\"", "\\\\\"");

    let result = if cfg!(target_os = "macos") {
        match terminal.as_str() {
            "iterm2" => {
                let script = format!(
                    r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd \"{cwd_escaped}\" && {pi_cmd} --session \"{path_escaped}\""
    end tell
end tell"#
                );
                Command::new("osascript").arg("-e").arg(script).spawn()
            }
            "terminal" => {
                let script = format!(
                    r#"tell application "Terminal"
    activate
    do script "cd \"{cwd_escaped}\" && {pi_cmd} --session \"{path_escaped}\""
end tell"#
                );
                Command::new("osascript").arg("-e").arg(script).spawn()
            }
            "vscode" => Command::new("code").args(["--new-window", &cwd]).spawn(),
            _ => return Err(format!("Unsupported terminal on macOS: {terminal}")),
        }
    } else if cfg!(target_os = "windows") {
        let cmd_str = format!("cd /d \"{cwd}\" && {pi_cmd} --session \"{path}\"");
        match terminal.as_str() {
            "cmd" => Command::new("cmd")
                .args(["/C", "start", "cmd", "/K", &cmd_str])
                .spawn(),
            "powershell" => Command::new("cmd")
                .args([
                    "/C",
                    "start",
                    "powershell",
                    "-NoExit",
                    "-Command",
                    &format!("cd '{cwd}'; {pi_cmd} --session '{path}'"),
                ])
                .spawn(),
            "windows-terminal" => Command::new("wt").args(["cmd", "/K", &cmd_str]).spawn(),
            "vscode" => Command::new("code").args(["--new-window", &cwd]).spawn(),
            _ => return Err(format!("Unsupported terminal on Windows: {terminal}")),
        }
    } else {
        // Linux
        let cmd_str = format!("cd '{cwd}' && {pi_cmd} --session '{path}'");
        match terminal.as_str() {
            "gnome-terminal" => Command::new("gnome-terminal")
                .args(["--", "bash", "-c", &cmd_str])
                .spawn(),
            "konsole" => Command::new("konsole")
                .args(["-e", "bash", "-c", &cmd_str])
                .spawn(),
            "xfce4-terminal" => Command::new("xfce4-terminal")
                .args(["-e", &format!("bash -c '{cmd_str}'")])
                .spawn(),
            "xterm" => Command::new("xterm")
                .args(["-e", "bash", "-c", &cmd_str])
                .spawn(),
            "vscode" => Command::new("code").args(["--new-window", &cwd]).spawn(),
            _ => Command::new("x-terminal-emulator")
                .args(["-e", "bash", "-c", &cmd_str])
                .spawn(),
        }
    };

    result.map_err(|e| format!("Failed to open terminal: {e}"))?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn open_session_in_browser(path: String) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let session_id = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("session");
    let temp_html_path = temp_dir.join(format!("pi_session_{session_id}.html"));
    let temp_html_path_str = temp_html_path.to_string_lossy().to_string();

    export::export_session(&path, "html", &temp_html_path_str)
        .await
        .map_err(|e| format!("Failed to export session: {e}"))?;

    let result = if cfg!(target_os = "macos") {
        Command::new("open").arg(&temp_html_path_str).spawn()
    } else if cfg!(target_os = "linux") {
        Command::new("xdg-open").arg(&temp_html_path_str).spawn()
    } else if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "start", "", &temp_html_path_str])
            .spawn()
    } else {
        return Err("Unsupported operating system".to_string());
    };

    result.map_err(|e| format!("Failed to open browser: {e}"))?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_by_path(path: String) -> Result<Option<SessionInfo>, String> {
    let config = config::load_config()?;
    let conn = sqlite_cache::init_db_with_config(&config)?;
    sqlite_cache::get_session(&conn, &path)
}
