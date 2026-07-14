//! Terminal launching utilities
pub use crate::utils::string::{cmd_double_quote, command_exists, escape_double_quoted, powershell_single_quote, resolve_launch_cwd, shell_escape_single_quotes, shell_single_quote};
use std::process::Command;

pub fn shell_command_args(shell: &str, command: &str) -> (&'static str, Vec<String>) {
    let normalized = shell.trim().to_ascii_lowercase();
    if normalized.ends_with("/fish") || normalized == "fish" {
        return ("-c", vec![command.to_string()]);
    }
    if normalized.ends_with("/nu") || normalized == "nu" {
        return ("-c", vec![command.to_string()]);
    }
    ("-lc", vec![command.to_string()])
}
#[cfg(test)]
mod tests {
    use super::shell_command_args;

    #[test]
    fn shell_command_args_use_command_mode_for_non_posix_shells() {
        assert_eq!(shell_command_args("/bin/fish", "echo hi"), ("-c", vec!["echo hi".to_string()]));
        assert_eq!(shell_command_args("/bin/nu", "echo hi"), ("-c", vec!["echo hi".to_string()]));
        assert_eq!(shell_command_args("/bin/zsh", "echo hi"), ("-lc", vec!["echo hi".to_string()]));
    }
}
pub fn spawn_command(command: &mut Command, error_context: &str) -> Result<(), String> {
    command.spawn().map_err(|error| format!("Failed to launch {error_context}: {error}"))?;
    Ok(())
}

fn build_unix_resume_command(cwd: &str, path: &str, pi_cmd: &str) -> String {
    format!("cd {} && {} --session {}", shell_single_quote(cwd), shell_single_quote(pi_cmd), shell_single_quote(path))
}

/// Build resume command, using custom template if provided
pub fn build_resume_command(cwd: &str, path: &str, pi_cmd: &str, custom_template: Option<&str>) -> String {
    match custom_template {
        Some(template) if !template.trim().is_empty() => {
            let rendered = template.replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd);
            if template_contains_cwd_handling(template) {
                rendered
            } else {
                format!("cd {} && {}", shell_single_quote(cwd), rendered)
            }
        }
        _ => build_unix_resume_command(cwd, path, pi_cmd),
    }
}

fn template_contains_cwd_handling(template: &str) -> bool {
    let normalized = template.trim().to_ascii_lowercase();
    normalized.contains("{cwd}") || normalized.contains("cd ") || normalized.contains("pushd ") || normalized.contains("--cwd") || normalized.contains("workdir")
}

#[cfg(target_os = "windows")]
pub fn build_windows_cmd_resume_command(cwd: &str, path: &str, pi_cmd: &str) -> String {
    format!("cd /d {} && {} --session {}", cmd_double_quote(cwd), cmd_double_quote(pi_cmd), cmd_double_quote(path))
}

#[cfg(target_os = "windows")]
pub fn build_windows_powershell_resume_command(cwd: &str, path: &str, pi_cmd: &str) -> String {
    format!("Set-Location -LiteralPath '{}'; & '{}' --session '{}'", powershell_single_quote(cwd), powershell_single_quote(pi_cmd), powershell_single_quote(path))
}

/// Scan the system for installed terminal emulators.
/// Returns a list of terminal IDs that are available on this machine.
pub fn scan_available_terminals() -> Vec<&'static str> {
    let mut available = Vec::new();

    for &id in fallback_external_terminals() {
        if id == "auto" {
            continue;
        }
        let installed = match id {
            // macOS: check .app bundle first, then CLI
            "iterm2" => {
                #[cfg(target_os = "macos")]
                {
                    macos_app_exists("iTerm")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    false
                }
            }
            "terminal" => {
                #[cfg(target_os = "macos")]
                {
                    macos_app_exists("Terminal")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    false
                }
            }
            "warp" => {
                #[cfg(target_os = "macos")]
                {
                    macos_app_exists("Warp")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    false
                }
            }
            "zed" => {
                #[cfg(target_os = "macos")]
                {
                    macos_app_exists("Zed")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    command_exists("zed")
                }
            }
            "hyper" => {
                #[cfg(target_os = "macos")]
                {
                    macos_app_exists("Hyper")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    false
                }
            }
            "tabby" => {
                #[cfg(target_os = "macos")]
                {
                    macos_app_exists("Tabby")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    command_exists("tabby")
                }
            }
            "tmux" => command_exists("tmux"),
            // CLI-based terminals
            "ghostty" => command_exists("ghostty"),
            "kitty" => command_exists("kitty"),
            "alacritty" => command_exists("alacritty"),
            "wezterm" => command_exists("wezterm"),
            "foot" => command_exists("foot") || command_exists("footclient"),
            "xdg-terminal-exec" => command_exists("xdg-terminal-exec"),
            "gnome-terminal" => command_exists("gnome-terminal"),
            "konsole" => command_exists("konsole"),
            "xfce4-terminal" => command_exists("xfce4-terminal"),
            "tilix" => command_exists("tilix"),
            "mate-terminal" => command_exists("mate-terminal"),
            "lxterminal" => command_exists("lxterminal"),
            "xterm" => command_exists("xterm"),
            "x-terminal-emulator" => command_exists("x-terminal-emulator"),
            "powershell" => command_exists("powershell") || command_exists("pwsh"),
            "cmd" => command_exists("cmd"),
            "windows-terminal" => command_exists("wt"),
            _ => false,
        };
        if installed {
            available.push(id);
        }
    }

    available
}

pub fn is_known_external_terminal(terminal_id: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        matches!(terminal_id, "iterm2" | "terminal" | "zed" | "wezterm" | "ghostty" | "kitty" | "alacritty" | "tmux" | "warp" | "hyper" | "tabby")
    }

    #[cfg(target_os = "windows")]
    {
        matches!(terminal_id, "powershell" | "cmd" | "windows-terminal")
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        matches!(terminal_id, "gnome-terminal" | "konsole" | "xfce4-terminal" | "xterm" | "x-terminal-emulator" | "xdg-terminal-exec" | "tilix" | "mate-terminal" | "lxterminal" | "kitty" | "alacritty" | "wezterm" | "ghostty" | "foot")
    }
}

fn fallback_external_terminals() -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        &["ghostty", "terminal", "iterm2", "wezterm", "kitty", "alacritty", "warp", "zed", "hyper", "tabby"]
    }

    #[cfg(target_os = "windows")]
    {
        &["windows-terminal", "powershell", "cmd"]
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        &["ghostty", "gnome-terminal", "konsole", "xfce4-terminal", "tilix", "kitty", "alacritty", "wezterm", "foot", "mate-terminal", "lxterminal", "xterm", "x-terminal-emulator", "xdg-terminal-exec"]
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
    template.contains("{command}") || template.contains("{cwd}") || template.contains("{path}") || template.contains("{pi}")
}

#[cfg(target_os = "windows")]
pub fn render_custom_terminal_command(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> String {
    let resume_cmd = build_windows_cmd_resume_command(cwd, path, pi_cmd);
    let has_any_placeholder = has_custom_terminal_placeholder(template);
    let mut rendered = template.replace("{command}", &resume_cmd).replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd);

    if !has_any_placeholder {
        rendered = format!("{rendered} cmd /K {}", cmd_double_quote(&resume_cmd));
    }

    rendered
}

#[cfg(not(target_os = "windows"))]
pub fn render_custom_terminal_command(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> String {
    let resume_cmd = build_unix_resume_command(cwd, path, pi_cmd);
    let has_any_placeholder = has_custom_terminal_placeholder(template);
    let mut rendered = template.replace("{command}", &resume_cmd).replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd);

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
    Command::new("osascript").arg("-e").arg(script).output().map(|output| output.status.success()).unwrap_or(false)
}

#[cfg(target_os = "macos")]
pub fn run_osascript(script: &str) -> Result<(), String> {
    let output = Command::new("osascript").arg("-e").arg(script).output().map_err(|e| format!("Failed to execute osascript: {e}"))?;

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
