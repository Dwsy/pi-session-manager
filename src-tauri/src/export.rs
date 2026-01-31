use serde_json::Value;
use std::fs;
use std::process::Command;

pub async fn export_session(
    session_path: &str,
    format: &str,
    output_path: &str,
) -> Result<(), String> {
    match format {
        "html" => export_using_pi_command(session_path, output_path),
        "json" => export_as_json(session_path, output_path),
        "md" | "markdown" => export_as_markdown(session_path, output_path),
        _ => Err(format!("Unsupported format: {}", format)),
    }
}

fn export_using_pi_command(session_path: &str, output_path: &str) -> Result<(), String> {
    // 使用 PI 的 export 命令生成 HTML
    let output = Command::new("pi")
        .arg("--export")
        .arg(session_path)
        .arg(output_path)
        .output()
        .map_err(|e| format!("Failed to execute pi command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pi export command failed: {}", stderr));
    }

    Ok(())
}

fn export_as_json(session_path: &str, output_path: &str) -> Result<(), String> {
    let content = fs::read_to_string(session_path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let entries: Vec<Value> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    let json_content = serde_json::to_string_pretty(&entries)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    fs::write(output_path, json_content)
        .map_err(|e| format!("Failed to write export file: {}", e))?;

    Ok(())
}

fn export_as_markdown(session_path: &str, output_path: &str) -> Result<(), String> {
    let content = fs::read_to_string(session_path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let mut md = String::new();
    let mut session_name = String::from("Session Export");
    let mut session_date = String::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<Value>(line) {
            let entry_type = entry["type"].as_str().unwrap_or("unknown");

            if entry_type == "session" {
                if let Some(name) = entry["name"].as_str() {
                    session_name = name.to_string();
                }
                if let Some(ts) = entry["timestamp"].as_str() {
                    session_date = ts.to_string();
                }
                md.push_str(&format!("# {}\n\n", session_name));
                md.push_str(&format!("**Date:** {}\n\n", session_date));
                md.push_str("---\n\n");
            }

            if entry_type == "message" {
                if let Some(message) = entry.get("message") {
                    let role = message["role"].as_str().unwrap_or("unknown");
                    let timestamp = entry["timestamp"].as_str().unwrap_or("");

                    let role_label = match role {
                        "user" => "**User**",
                        "assistant" => "**Assistant**",
                        _ => &format!("**{}**", role),
                    };

                    md.push_str(&format!("{} *{}*\n\n", role_label, timestamp));

                    if let Some(content_arr) = message["content"].as_array() {
                        for item in content_arr {
                            if let Some(text) = item["text"].as_str() {
                                md.push_str(text);
                                md.push_str("\n\n");
                            }
                        }
                    }

                    md.push_str("---\n\n");
                }
            }
        }
    }

    fs::write(output_path, md)
        .map_err(|e| format!("Failed to write export file: {}", e))?;

    Ok(())
}