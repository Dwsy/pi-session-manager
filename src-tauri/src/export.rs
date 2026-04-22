use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub async fn export_session(session_path: &str, format: &str, output_path: &str) -> Result<(), String> {
    match format {
        "html" => export_using_pi_command(session_path, output_path),
        "json" => export_as_json(session_path, output_path),
        "md" | "markdown" => export_as_markdown(session_path, output_path),
        _ => Err(format!("Unsupported format: {format}")),
    }
}

fn export_using_pi_command(session_path: &str, output_path: &str) -> Result<(), String> {
    let mut attempts = Vec::new();
    let mut tried = std::collections::HashSet::new();

    for command in pi_command_candidates() {
        if !tried.insert(command.clone()) {
            continue;
        }

        match Command::new(&command).arg("--export").arg(session_path).arg(output_path).output() {
            Ok(output) if output.status.success() => return Ok(()),
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let detail = if stderr.is_empty() { "unknown error".to_string() } else { stderr };
                attempts.push(format!("{command}: {detail}"));
            }
            Err(e) => attempts.push(format!("{command}: {e}")),
        }
    }

    Err(format!("Pi export command failed. attempts: {}", attempts.join(" | ")))
}

/// Build the system prompt for a session by calling pi's buildSystemPrompt via node.
/// Falls back to reading APPEND_SYSTEM.md if the node call fails.
pub fn extract_system_prompt(session_path: &str) -> Result<String, String> {
    // Read session header to get cwd
    let content = fs::read_to_string(session_path).map_err(|e| format!("Failed to read session: {e}"))?;
    let cwd = content.lines().next().and_then(|line| serde_json::from_str::<Value>(line).ok()).and_then(|v| v.get("cwd").and_then(|c| c.as_str()).map(String::from)).unwrap_or_default();

    // Try calling pi's buildSystemPrompt via node
    let pi_pkg = which_pi_module();
    if let Some(pkg_path) = pi_pkg {
        let script = format!(
            r#"
import {{ buildSystemPrompt }} from '{pkg_path}/dist/core/system-prompt.js';
import {{ readFileSync, existsSync }} from 'fs';
import {{ join }} from 'path';
import {{ homedir }} from 'os';

const cwd = {cwd_json};
const home = process.env.HOME || process.env.USERPROFILE || homedir() || '';
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

        let output = Command::new("node").arg("--input-type=module").arg("-e").arg(&script).output();

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
    let append_path = crate::paths::pi_agent_root_dir()?.join("APPEND_SYSTEM.md");
    if append_path.exists() {
        return fs::read_to_string(&append_path).map_err(|e| format!("Failed to read APPEND_SYSTEM.md: {e}"));
    }
    Ok(String::new())
}

/// Find the pi-coding-agent module path
fn which_pi_module() -> Option<String> {
    let pi_bin = find_pi_executable()?;
    let resolved = fs::canonicalize(&pi_bin).unwrap_or(pi_bin.clone());

    find_pi_package_root(&resolved).or_else(|| find_pi_package_root(&pi_bin)).map(|dir| dir.to_string_lossy().to_string())
}

fn pi_command_candidates() -> Vec<String> {
    let mut candidates = Vec::new();

    if let Some(path) = find_pi_executable() {
        candidates.push(path.to_string_lossy().to_string());
    }

    candidates.push("pi".to_string());

    #[cfg(target_os = "windows")]
    {
        candidates.push("pi.cmd".to_string());
        candidates.push("pi.exe".to_string());
    }

    candidates
}

fn find_pi_executable() -> Option<PathBuf> {
    find_executable_in_path("pi").or_else(|| find_executable_in_path("pi.cmd")).or_else(|| find_executable_in_path("pi.exe"))
}

fn find_executable_in_path(executable: &str) -> Option<PathBuf> {
    let direct = Path::new(executable);
    if (direct.is_absolute() || executable.contains('/') || executable.contains('\\')) && direct.is_file() {
        return Some(direct.to_path_buf());
    }

    let path_var = std::env::var_os("PATH")?;
    let candidates = command_name_candidates(executable);

    for dir in std::env::split_paths(&path_var) {
        for candidate in &candidates {
            let full = dir.join(candidate);
            if full.is_file() {
                return Some(full);
            }
        }
    }

    None
}

fn command_name_candidates(executable: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        if Path::new(executable).extension().is_some() {
            return vec![executable.to_string()];
        }

        let mut out = Vec::new();
        let path_ext = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
        for ext in path_ext.split(';').filter(|ext| !ext.trim().is_empty()) {
            out.push(format!("{executable}{ext}"));
        }
        out.push(executable.to_string());
        out
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec![executable.to_string()]
    }
}

fn find_pi_package_root(binary_path: &Path) -> Option<PathBuf> {
    // npm/pnpm global installs may place wrappers in bin directories.
    let wrapper_dir = binary_path.parent()?;
    let package_candidates = [wrapper_dir.join("node_modules/@mariozechner/pi-coding-agent"), wrapper_dir.join("../node_modules/@mariozechner/pi-coding-agent"), wrapper_dir.join("../lib/node_modules/@mariozechner/pi-coding-agent")];

    for candidate in package_candidates {
        if is_pi_package_root(&candidate) {
            return Some(candidate);
        }
    }

    let mut dir = wrapper_dir;
    for _ in 0..8 {
        if is_pi_package_root(dir) {
            return Some(dir.to_path_buf());
        }
        dir = dir.parent()?;
    }

    None
}

fn is_pi_package_root(path: &Path) -> bool {
    path.join("package.json").is_file() && path.join("dist/core/system-prompt.js").is_file()
}

fn export_as_json(session_path: &str, output_path: &str) -> Result<(), String> {
    let content = fs::read_to_string(session_path).map_err(|e| format!("Failed to read session file: {e}"))?;

    let entries: Vec<Value> = content.lines().filter(|line| !line.trim().is_empty()).filter_map(|line| serde_json::from_str(line).ok()).collect();

    let json_content = serde_json::to_string_pretty(&entries).map_err(|e| format!("Failed to serialize JSON: {e}"))?;

    fs::write(output_path, json_content).map_err(|e| format!("Failed to write export file: {e}"))?;

    Ok(())
}

fn export_as_markdown(session_path: &str, output_path: &str) -> Result<(), String> {
    let content = fs::read_to_string(session_path).map_err(|e| format!("Failed to read session file: {e}"))?;

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
