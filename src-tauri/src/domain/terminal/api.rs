//! Terminal launching public API
use crate::domain::terminal::launch::try_launch_known_terminal;
use crate::domain::terminal::utils::*;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Try to launch a custom terminal template
pub fn try_launch_custom_terminal(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> Result<(), String> {
    let template = template.trim();
    if template.is_empty() {
        return Err("Custom terminal command is empty".to_string());
    }

    let rendered = render_custom_terminal_command(template, cwd, path, pi_cmd);
    log::info!("[Terminal] Template: {template}");
    log::info!("[Terminal] CWD: {cwd}");
    log::info!("[Terminal] Path: {path}");
    log::info!("[Terminal] Pi: {pi_cmd}");
    log::info!("[Terminal] Rendered command: {rendered}");

    #[cfg(target_os = "macos")]
    {
        let template_lower = template.to_lowercase();
        if template_lower == "iterm2" || template_lower == "iterm" {
            return launch_via_osascript("iTerm", &rendered, cwd);
        }
        if template_lower == "terminal" || template_lower == "terminal.app" {
            return launch_via_osascript("Terminal", &rendered, cwd);
        }
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", &rendered]).spawn().map_err(|e| format!("Failed to launch custom terminal command: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("sh").args(["-lc", &rendered]).spawn().map_err(|e| format!("Failed to launch custom terminal command: {e}"))?;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn launch_via_osascript(app_name: &str, command: &str, _cwd: &str) -> Result<(), String> {
    use crate::domain::terminal::utils::{escape_double_quoted, macos_app_exists, run_osascript};

    if !macos_app_exists(app_name) {
        return Err(format!("{app_name} is not installed"));
    }

    let script = if app_name == "iTerm" {
        format!(
            r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "{}"
    end tell
end tell"#,
            escape_double_quoted(command)
        )
    } else {
        format!(
            r#"tell application "Terminal"
    activate
    do script "{}"
end tell"#,
            escape_double_quoted(command)
        )
    };

    run_osascript(&script)
}

/// Open session in external terminal
pub async fn open_session_in_terminal_impl(path: String, cwd: String, terminal: Option<String>, pi_path: Option<String>, resume_command: Option<String>) -> Result<(), String> {
    let has_explicit_resume_command = resume_command.as_deref().map(str::trim).filter(|value| !value.is_empty()).is_some();

    if !has_explicit_resume_command && !Path::new(&path).is_file() {
        return Err(format!("Session file does not exist: {path}"));
    }

    let resolved_cwd = resolve_launch_cwd(&cwd, &path);
    let requested_terminal = terminal.as_deref().map(str::trim).filter(|value| !value.is_empty()).unwrap_or("auto");
    let pi_cmd = pi_path.as_deref().map(str::trim).filter(|value| !value.is_empty()).unwrap_or("pi").to_string();
    let resume_cmd = resume_command.as_deref().map(str::trim).filter(|value| !value.is_empty());

    log::info!("[Terminal] Terminal: {requested_terminal}");
    log::info!("[Terminal] CWD: {resolved_cwd}");
    log::info!("[Terminal] Path: {path}");
    log::info!("[Terminal] Pi: {pi_cmd}");
    log::info!("[Terminal] Resume command: {resume_cmd:?}");

    let mut attempts: Vec<String> = Vec::new();
    let try_custom_first = requested_terminal != "auto" && !is_known_external_terminal(requested_terminal);

    if try_custom_first {
        match try_launch_custom_terminal(requested_terminal, &resolved_cwd, &path, &pi_cmd) {
            Ok(()) => return Ok(()),
            Err(error) => attempts.push(format!("custom({requested_terminal}): {error}")),
        }
    }

    for terminal_id in build_terminal_attempt_order(requested_terminal) {
        match try_launch_known_terminal(&terminal_id, &resolved_cwd, &path, &pi_cmd, resume_cmd) {
            Ok(true) => return Ok(()),
            Ok(false) => attempts.push(format!("{terminal_id}: not installed")),
            Err(error) => attempts.push(format!("{terminal_id}: {error}")),
        }
    }

    Err(format!("Failed to open external terminal. requested='{requested_terminal}', cwd='{}'. attempts: {}", resolved_cwd, attempts.join(" | ")))
}

pub async fn open_url_in_system_impl(url: String) -> Result<(), String> {
    let normalized_url = url.trim().to_string();
    let normalized_url_lower = normalized_url.to_lowercase();
    if !normalized_url_lower.starts_with("http://") && !normalized_url_lower.starts_with("https://") {
        return Err("Only http and https URLs can be opened".to_string());
    }

    open_system_target(&normalized_url).map(|_| ()).map_err(|e| format!("Failed to open URL in system browser: {e}"))
}

pub async fn open_path_with_default_app_impl(path: String) -> Result<(), String> {
    let target = resolve_existing_open_target(&path)?;
    let target_str = target.to_string_lossy().to_string();
    open_system_target(&target_str).map(|_| ()).map_err(|e| format!("Failed to open path with default app: {e}"))
}

fn strip_editor_position_suffix(path: &str) -> Option<&str> {
    let (without_last_suffix, last_suffix) = path.rsplit_once(':')?;
    if last_suffix.is_empty() || !last_suffix.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let candidate = without_last_suffix.rsplit_once(':').filter(|(_, suffix)| !suffix.is_empty() && suffix.chars().all(|ch| ch.is_ascii_digit())).map(|(prefix, _)| prefix).unwrap_or(without_last_suffix);

    (!candidate.is_empty()).then_some(candidate)
}

fn resolve_existing_open_target(path: &str) -> Result<PathBuf, String> {
    let target = Path::new(path);
    if target.exists() {
        return Ok(target.to_path_buf());
    }

    if let Some(candidate) = strip_editor_position_suffix(path) {
        let target = Path::new(candidate);
        if target.exists() {
            return Ok(target.to_path_buf());
        }
    }

    Err(format!("Path does not exist: {}", target.display()))
}

fn open_system_target(target: &str) -> std::io::Result<std::process::Child> {
    if cfg!(target_os = "macos") {
        Command::new("open").arg(target).spawn()
    } else if cfg!(target_os = "linux") {
        Command::new("xdg-open").arg(target).spawn()
    } else if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", "start", "", target]).spawn()
    } else {
        Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "unsupported operating system"))
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_existing_open_target;
    use std::fs;

    #[test]
    fn resolves_existing_path_with_editor_line_suffix() {
        let path = std::env::temp_dir().join(format!("psm-open-path-line-{}.java", std::process::id()));
        fs::write(&path, "class Example {}\n").expect("write temp source file");

        let with_line = format!("{}:409", path.display());
        let resolved = resolve_existing_open_target(&with_line).expect("line suffix should resolve to existing file");

        fs::remove_file(&path).expect("remove temp source file");
        assert_eq!(resolved, path);
    }
}

/// Open session in browser via the built-in web server.
///
/// Reads the session ID from the JSONL header and the HTTP port from config,
/// then opens `http://localhost:{port}/session/{id}` in the system browser.
pub async fn open_session_in_browser_impl(path: String) -> Result<(), String> {
    // 1. Extract session ID from JSONL header (first line)
    let session_id = extract_session_id_from_file(&path)?;

    // 2. Read HTTP port from config (default 52131)
    let http_port = read_http_port();

    // 3. Build the URL (hash route: /#/sessions/{id})
    let url = format!("http://localhost:{http_port}/#/sessions/{session_id}");
    log::info!("[Browser] Opening session in browser: {url}");

    // 4. Open in system browser
    open_system_target(&url).map_err(|e| format!("Failed to open browser: {e}"))?;
    Ok(())
}

/// Extract session ID from the first line of a JSONL session file.
fn extract_session_id_from_file(path: &str) -> Result<String, String> {
    use std::io::{BufRead, BufReader};

    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    reader.read_line(&mut first_line).map_err(|e| format!("Failed to read session header: {e}"))?;

    let value: serde_json::Value = serde_json::from_str(first_line.trim()).map_err(|e| format!("Invalid session header JSON: {e}"))?;

    value.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from).ok_or_else(|| "Session header missing 'id' field".to_string())
}

/// Read the HTTP port from unified config, defaulting to 52131.
fn read_http_port() -> u16 {
    crate::unified_config::read_section("server").ok().and_then(|v| v.get("http_port").and_then(|p| p.as_u64())).unwrap_or(52131) as u16
}

/// Open a file or directory in the system file manager.
pub async fn open_path_in_system_impl(path: String) -> Result<(), String> {
    let target = resolve_existing_open_target(&path)?;
    let open_target = if target.is_file() { target.parent().map(Path::to_path_buf).unwrap_or_else(|| target.to_path_buf()) } else { target.to_path_buf() };

    if !open_target.exists() {
        return Err(format!("Path does not exist: {}", open_target.display()));
    }

    let open_target_str = open_target.to_string_lossy().to_string();
    open_system_target(&open_target_str).map_err(|e| format!("Failed to open path in system file manager: {e}"))?;
    Ok(())
}
