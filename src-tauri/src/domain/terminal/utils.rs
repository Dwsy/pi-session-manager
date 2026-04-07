//! Terminal launching utilities
pub use crate::utils::string::{
    cmd_double_quote, command_exists, escape_double_quoted, powershell_single_quote,
    resolve_launch_cwd, shell_escape_single_quotes, shell_single_quote,
};
use std::process::Command;

pub fn spawn_command(command: &mut Command, error_context: &str) -> Result<(), String> {
    command
        .spawn()
        .map_err(|error| format!("Failed to launch {error_context}: {error}"))?;
    Ok(())
}

fn build_unix_resume_command(cwd: &str, path: &str, pi_cmd: &str) -> String {
    format!(
        "cd {} && {} --session {}",
        shell_single_quote(cwd),
        shell_single_quote(pi_cmd),
        shell_single_quote(path)
    )
}

/// Build resume command, using custom template if provided
pub fn build_resume_command(cwd: &str, path: &str, pi_cmd: &str, custom_template: Option<&str>) -> String {
    match custom_template {
        Some(template) if !template.trim().is_empty() => template
            .replace("{cwd}", cwd)
            .replace("{path}", path)
            .replace("{pi}", pi_cmd),
        _ => build_unix_resume_command(cwd, path, pi_cmd),
    }
}

fn build_windows_cmd_resume_command(cwd: &str, path: &str, pi_cmd: &str) -> String {
    format!(
        "cd /d {} && {} --session {}",
        cmd_double_quote(cwd),
        cmd_double_quote(pi_cmd),
        cmd_double_quote(path)
    )
}

fn build_windows_powershell_resume_command(cwd: &str, path: &str, pi_cmd: &str) -> String {
    format!(
        "Set-Location -LiteralPath '{}'; & '{}' --session '{}'",
        powershell_single_quote(cwd),
        powershell_single_quote(pi_cmd),
        powershell_single_quote(path)
    )
}

pub fn is_known_external_terminal(terminal_id: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        matches!(
            terminal_id,
            "iterm2" | "terminal" | "vscode" | "wezterm" | "kitty" | "alacritty" | "tmux"
        )
    }

    #[cfg(target_os = "windows")]
    {
        matches!(
            terminal_id,
            "powershell" | "cmd" | "windows-terminal" | "vscode"
        )
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        matches!(
            terminal_id,
            "gnome-terminal"
                | "konsole"
                | "xfce4-terminal"
                | "xterm"
                | "x-terminal-emulator"
                | "tilix"
                | "mate-terminal"
                | "lxterminal"
                | "vscode"
                | "kitty"
                | "alacritty"
                | "wezterm"
        )
    }
}

fn fallback_external_terminals() -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        &[
            "terminal",
            "iterm2",
            "wezterm",
            "kitty",
            "alacritty",
            "vscode",
        ]
    }

    #[cfg(target_os = "windows")]
    {
        &["windows-terminal", "powershell", "cmd", "vscode"]
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        &[
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "tilix",
            "kitty",
            "alacritty",
            "wezterm",
            "mate-terminal",
            "lxterminal",
            "xterm",
            "x-terminal-emulator",
            "vscode",
        ]
    }
}

pub fn build_terminal_attempt_order(requested_terminal: &str) -> Vec<String> {
    let mut order = Vec::new();
    if requested_terminal != "auto" && is_known_external_terminal(requested_terminal) {
        order.push(requested_terminal.to_string());
    }
    for fallback in fallback_external_terminals() {
        if !order.iter().any(|item| item == fallback) {
            order.push((*fallback).to_string());
        }
    }
    order
}

pub fn has_custom_terminal_placeholder(template: &str) -> bool {
    template.contains("{command}")
        || template.contains("{cwd}")
        || template.contains("{path}")
        || template.contains("{pi}")
}

#[cfg(target_os = "windows")]
pub fn render_custom_terminal_command(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> String {
    let resume_cmd = build_windows_cmd_resume_command(cwd, path, pi_cmd);
    let has_any_placeholder = has_custom_terminal_placeholder(template);
    let mut rendered = template
        .replace("{command}", &resume_cmd)
        .replace("{cwd}", cwd)
        .replace("{path}", path)
        .replace("{pi}", pi_cmd);

    if !has_any_placeholder {
        rendered = format!("{rendered} cmd /K {}", cmd_double_quote(&resume_cmd));
    }

    rendered
}

#[cfg(not(target_os = "windows"))]
pub fn render_custom_terminal_command(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> String {
    let resume_cmd = build_unix_resume_command(cwd, path, pi_cmd);
    let has_any_placeholder = has_custom_terminal_placeholder(template);
    let mut rendered = template
        .replace("{command}", &resume_cmd)
        .replace("{cwd}", cwd)
        .replace("{path}", path)
        .replace("{pi}", pi_cmd);

    if !has_any_placeholder {
        rendered = format!("{rendered} sh -lc {}", shell_single_quote(&resume_cmd));
    }

    rendered
}

#[cfg(target_os = "macos")]
pub fn macos_app_exists(app_name: &str) -> bool {
    if !command_exists("osascript") {
        return false;
    }

    let script = format!(r#"id of app "{}""#, escape_double_quoted(app_name));
    Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
pub fn run_osascript(script: &str) -> Result<(), String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to execute osascript: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "Unknown AppleScript error".to_string()
    };
    Err(detail)
}
