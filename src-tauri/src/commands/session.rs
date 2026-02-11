use crate::models::{SessionEntry, SessionInfo};
use crate::{export, scanner, stats};
use serde_json::Value;
use std::fs;
use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileStats {
    pub size: u64,
    pub modified_at: u64,
    pub is_file: bool,
}

#[tauri::command]
pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    scanner::scan_sessions().await
}

#[tauri::command]
pub async fn read_session_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {}", e))
}

#[tauri::command]
pub async fn read_session_file_incremental(
    path: String,
    from_line: usize,
) -> Result<(usize, String), String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    if from_line >= total_lines {
        return Ok((total_lines, String::new()));
    }

    let new_lines: Vec<&str> = lines[from_line..].to_vec();
    let new_content = new_lines.join("\n");

    Ok((total_lines, new_content))
}

#[tauri::command]
pub async fn get_file_stats(path: String) -> Result<FileStats, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let modified = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time: {}", e))?;

    let modified_at = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to convert modified time: {}", e))?
        .as_millis() as u64;

    Ok(FileStats {
        size: metadata.len(),
        modified_at,
        is_file: metadata.is_file(),
    })
}

#[tauri::command]
pub async fn get_session_entries(path: String) -> Result<Vec<SessionEntry>, String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {}", e))?;

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

#[tauri::command]
pub async fn delete_session(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to delete session: {}", e))
}

#[tauri::command]
pub async fn export_session(path: String, format: String, output_path: String) -> Result<(), String> {
    export::export_session(&path, &format, &output_path).await
}

#[tauri::command]
pub async fn rename_session(path: String, new_name: String) -> Result<(), String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {}", e))?;

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
                        .map_err(|e| format!("Failed to serialize: {}", e))?;
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
            serde_json::to_string(&session_info).map_err(|e| format!("Failed to serialize: {}", e))?,
        );
    }

    fs::write(&path, lines.join("\n"))
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_session_stats(
    sessions: Vec<SessionInfo>,
) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats(&sessions))
}

#[tauri::command]
pub async fn get_session_stats_light(
    sessions: Vec<stats::SessionStatsInput>,
) -> Result<stats::SessionStats, String> {
    Ok(stats::calculate_stats_from_inputs(&sessions))
}

#[tauri::command]
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
        write text "cd \"{}\" && {} --session \"{}\""
    end tell
end tell"#,
                    cwd_escaped, pi_cmd, path_escaped
                );
                Command::new("osascript").arg("-e").arg(script).spawn()
            }
            "terminal" => {
                let script = format!(
                    r#"tell application "Terminal"
    activate
    do script "cd \"{}\" && {} --session \"{}\""
end tell"#,
                    cwd_escaped, pi_cmd, path_escaped
                );
                Command::new("osascript").arg("-e").arg(script).spawn()
            }
            "vscode" => Command::new("code").args(["--new-window", &cwd]).spawn(),
            _ => return Err(format!("Unsupported terminal on macOS: {}", terminal)),
        }
    } else if cfg!(target_os = "windows") {
        let cmd_str = format!("cd /d \"{}\" && {} --session \"{}\"", cwd, pi_cmd, path);
        match terminal.as_str() {
            "cmd" => Command::new("cmd").args(["/C", "start", "cmd", "/K", &cmd_str]).spawn(),
            "powershell" => Command::new("cmd")
                .args(["/C", "start", "powershell", "-NoExit", "-Command", &format!("cd '{}'; {} --session '{}'", cwd, pi_cmd, path)])
                .spawn(),
            "windows-terminal" => Command::new("wt").args(["cmd", "/K", &cmd_str]).spawn(),
            "vscode" => Command::new("code").args(["--new-window", &cwd]).spawn(),
            _ => return Err(format!("Unsupported terminal on Windows: {}", terminal)),
        }
    } else {
        // Linux
        let cmd_str = format!("cd '{}' && {} --session '{}'", cwd, pi_cmd, path);
        match terminal.as_str() {
            "gnome-terminal" => Command::new("gnome-terminal").args(["--", "bash", "-c", &cmd_str]).spawn(),
            "konsole" => Command::new("konsole").args(["-e", "bash", "-c", &cmd_str]).spawn(),
            "xfce4-terminal" => Command::new("xfce4-terminal").args(["-e", &format!("bash -c '{}'", cmd_str)]).spawn(),
            "xterm" => Command::new("xterm").args(["-e", "bash", "-c", &cmd_str]).spawn(),
            "vscode" => Command::new("code").args(["--new-window", &cwd]).spawn(),
            _ => Command::new("x-terminal-emulator").args(["-e", "bash", "-c", &cmd_str]).spawn(),
        }
    };

    result.map_err(|e| format!("Failed to open terminal: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn open_session_in_browser(path: String) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let session_id = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("session");
    let temp_html_path = temp_dir.join(format!("pi_session_{}.html", session_id));
    let temp_html_path_str = temp_html_path.to_string_lossy().to_string();

    export::export_session(&path, "html", &temp_html_path_str)
        .await
        .map_err(|e| format!("Failed to export session: {}", e))?;

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

    result.map_err(|e| format!("Failed to open browser: {}", e))?;
    Ok(())
}
