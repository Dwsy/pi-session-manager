//! Terminal launching public API
use crate::domain::terminal::launch::try_launch_known_terminal;
use crate::domain::terminal::utils::*;
use crate::export;
use std::path::Path;
use std::process::Command;

/// Try to launch a custom terminal template
pub fn try_launch_custom_terminal(
    template: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
) -> Result<(), String> {
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
        Command::new("cmd")
            .args(["/C", &rendered])
            .spawn()
            .map_err(|e| format!("Failed to launch custom terminal command: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("sh")
            .args(["-lc", &rendered])
            .spawn()
            .map_err(|e| format!("Failed to launch custom terminal command: {e}"))?;
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
pub async fn open_session_in_terminal_impl(
    path: String,
    cwd: String,
    terminal: Option<String>,
    pi_path: Option<String>,
    resume_command: Option<String>,
) -> Result<(), String> {
    let has_explicit_resume_command = resume_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some();

    if !has_explicit_resume_command && !Path::new(&path).is_file() {
        return Err(format!("Session file does not exist: {path}"));
    }

    let resolved_cwd = resolve_launch_cwd(&cwd, &path);
    let requested_terminal = terminal
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("auto");
    let pi_cmd = pi_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("pi")
        .to_string();
    let resume_cmd = resume_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    log::info!("[Terminal] Terminal: {requested_terminal}");
    log::info!("[Terminal] CWD: {resolved_cwd}");
    log::info!("[Terminal] Path: {path}");
    log::info!("[Terminal] Pi: {pi_cmd}");
    log::info!("[Terminal] Resume command: {resume_cmd:?}");

    let mut attempts: Vec<String> = Vec::new();
    let try_custom_first =
        requested_terminal != "auto" && !is_known_external_terminal(requested_terminal);

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

    Err(format!(
        "Failed to open external terminal. requested='{requested_terminal}', cwd='{}'. attempts: {}",
        resolved_cwd,
        attempts.join(" | ")
    ))
}

/// Open session in browser
pub async fn open_session_in_browser_impl(path: String) -> Result<(), String> {
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

/// Open a file or directory in the system file manager.
pub async fn open_path_in_system_impl(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    let open_target = if target.is_file() {
        target
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| target.to_path_buf())
    } else {
        target.to_path_buf()
    };

    if !open_target.exists() {
        return Err(format!("Path does not exist: {}", open_target.display()));
    }

    let open_target_str = open_target.to_string_lossy().to_string();
    let result = if cfg!(target_os = "macos") {
        Command::new("open").arg(&open_target_str).spawn()
    } else if cfg!(target_os = "linux") {
        Command::new("xdg-open").arg(&open_target_str).spawn()
    } else if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "start", "", &open_target_str])
            .spawn()
    } else {
        return Err("Unsupported operating system".to_string());
    };

    result.map_err(|e| format!("Failed to open path in system file manager: {e}"))?;
    Ok(())
}
