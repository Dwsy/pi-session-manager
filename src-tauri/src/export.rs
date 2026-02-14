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
        _ => Err(format!("Unsupported format: {format}")),
    }
}

fn export_using_pi_command(session_path: &str, output_path: &str) -> Result<(), String> {
    // 使用 PI 的 export 命令生成 HTML
    let output = Command::new("pi")
        .arg("--export")
        .arg(session_path)
        .arg(output_path)
        .output()
        .map_err(|e| format!("Failed to execute pi command: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pi export command failed: {stderr}"));
    }

    Ok(())
}

/// Build the system prompt for a session by calling pi's buildSystemPrompt via node.
/// Falls back to reading APPEND_SYSTEM.md if the node call fails.
pub fn extract_system_prompt(session_path: &str) -> Result<String, String> {
    // Read session header to get cwd
    let content =
        fs::read_to_string(session_path).map_err(|e| format!("Failed to read session: {e}"))?;
    let cwd = content
        .lines()
        .next()
        .and_then(|line| serde_json::from_str::<Value>(line).ok())
        .and_then(|v| v.get("cwd").and_then(|c| c.as_str()).map(String::from))
        .unwrap_or_default();

    // Try calling pi's buildSystemPrompt via node
    let pi_pkg = which_pi_module();
    if let Some(pkg_path) = pi_pkg {
        let script = format!(
            r#"
import {{ buildSystemPrompt }} from '{pkg_path}/dist/core/system-prompt.js';
import {{ readFileSync, existsSync }} from 'fs';
import {{ join }} from 'path';

const cwd = {cwd_json};
const home = process.env.HOME || '';
const piDir = join(home, '.pi', 'agent');

// Read APPEND_SYSTEM.md
let appendPrompt = '';
const appendPath = join(piDir, 'APPEND_SYSTEM.md');
if (existsSync(appendPath)) appendPrompt = readFileSync(appendPath, 'utf-8');

// Read AGENTS.md from cwd
const contextFiles = [];
if (cwd) {{
  const agentsPath = join(cwd, 'AGENTS.md');
  if (existsSync(agentsPath)) {{
    contextFiles.push({{ path: agentsPath, content: readFileSync(agentsPath, 'utf-8') }});
  }}
}}

const prompt = buildSystemPrompt({{
  cwd,
  appendSystemPrompt: appendPrompt || undefined,
  contextFiles,
}});
process.stdout.write(prompt);
"#,
            pkg_path = pkg_path.replace('\\', "\\\\").replace('\'', "\\'"),
            cwd_json = serde_json::to_string(&cwd).unwrap_or_else(|_| "\"\"".to_string()),
        );

        let output = Command::new("node")
            .arg("--input-type=module")
            .arg("-e")
            .arg(&script)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let prompt = String::from_utf8_lossy(&out.stdout).to_string();
                if !prompt.is_empty() {
                    return Ok(prompt);
                }
            }
        }
    }

    // Fallback: read APPEND_SYSTEM.md
    let home = dirs::home_dir().ok_or("No home dir")?;
    let append_path = home.join(".pi/agent/APPEND_SYSTEM.md");
    if append_path.exists() {
        return fs::read_to_string(&append_path)
            .map_err(|e| format!("Failed to read APPEND_SYSTEM.md: {e}"));
    }
    Ok(String::new())
}

/// Find the pi-coding-agent module path
fn which_pi_module() -> Option<String> {
    // Try `which pi` to find the binary, then resolve the package
    let output = Command::new("which").arg("pi").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let pi_bin = String::from_utf8_lossy(&output.stdout).trim().to_string();
    // pi binary is typically a symlink: .../bin/pi -> ../lib/node_modules/@mariozechner/pi-coding-agent/dist/cli.js
    let resolved = fs::read_link(&pi_bin)
        .map(|p| {
            if p.is_relative() {
                std::path::Path::new(&pi_bin)
                    .parent()
                    .unwrap_or(std::path::Path::new(""))
                    .join(&p)
            } else {
                p
            }
        })
        .unwrap_or_else(|_| std::path::PathBuf::from(&pi_bin));

    // Walk up to find the package root (contains package.json)
    let mut dir = resolved.parent()?;
    for _ in 0..5 {
        if dir.join("package.json").exists() {
            return Some(dir.to_string_lossy().to_string());
        }
        dir = dir.parent()?;
    }
    None
}

fn export_as_json(session_path: &str, output_path: &str) -> Result<(), String> {
    let content = fs::read_to_string(session_path)
        .map_err(|e| format!("Failed to read session file: {e}"))?;

    let entries: Vec<Value> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    let json_content = serde_json::to_string_pretty(&entries)
        .map_err(|e| format!("Failed to serialize JSON: {e}"))?;

    fs::write(output_path, json_content)
        .map_err(|e| format!("Failed to write export file: {e}"))?;

    Ok(())
}

fn export_as_markdown(session_path: &str, output_path: &str) -> Result<(), String> {
    let content = fs::read_to_string(session_path)
        .map_err(|e| format!("Failed to read session file: {e}"))?;

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
                md.push_str(&format!("# {session_name}\n\n"));
                md.push_str(&format!("**Date:** {session_date}\n\n"));
                md.push_str("---\n\n");
            }

            if entry_type == "message" {
                if let Some(message) = entry.get("message") {
                    let role = message["role"].as_str().unwrap_or("unknown");
                    let timestamp = entry["timestamp"].as_str().unwrap_or("");

                    let role_label = match role {
                        "user" => "**User**",
                        "assistant" => "**Assistant**",
                        _ => &format!("**{role}**"),
                    };

                    md.push_str(&format!("{role_label} *{timestamp}*\n\n"));

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

    fs::write(output_path, md).map_err(|e| format!("Failed to write export file: {e}"))?;

    Ok(())
}
