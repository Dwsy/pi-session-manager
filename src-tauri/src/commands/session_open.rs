use crate::export;
use std::path::Path;
use std::process::Command;

fn spawn_command(command: &mut Command, error_context: &str) -> Result<(), String> {
    command
        .spawn()
        .map_err(|error| format!("Failed to launch {error_context}: {error}"))?;
    Ok(())
}

fn escape_double_quoted(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn cmd_double_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn powershell_single_quote(value: &str) -> String {
    value.replace('\'', "''")
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
fn build_resume_command(cwd: &str, path: &str, pi_cmd: &str, custom_template: Option<&str>) -> String {
    match custom_template {
        Some(template) if !template.trim().is_empty() => {
            template
                .replace("{cwd}", cwd)
                .replace("{path}", path)
                .replace("{pi}", pi_cmd)
        }
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

fn resolve_launch_cwd(cwd: &str, session_path: &str) -> String {
    if Path::new(cwd).is_dir() {
        return cwd.to_string();
    }

    if let Some(parent) = Path::new(session_path).parent() {
        if parent.is_dir() {
            return parent.to_string_lossy().to_string();
        }
    }

    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| {
            if cfg!(target_os = "windows") {
                "C:\\".to_string()
            } else {
                "/".to_string()
            }
        })
}

fn command_exists(executable: &str) -> bool {
    let executable = executable.trim();
    if executable.is_empty() {
        return false;
    }

    let explicit_path = executable.contains('/') || executable.contains('\\');
    if explicit_path || Path::new(executable).is_absolute() {
        return Path::new(executable).is_file();
    }

    let Some(path_var) = std::env::var_os("PATH") else {
        return false;
    };

    #[cfg(target_os = "windows")]
    {
        let has_ext = Path::new(executable).extension().is_some();
        let mut candidates = Vec::new();
        if has_ext {
            candidates.push(executable.to_string());
        } else {
            let path_ext =
                std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
            for ext in path_ext.split(';').filter(|ext| !ext.trim().is_empty()) {
                candidates.push(format!("{executable}{ext}"));
            }
            candidates.push(executable.to_string());
        }

        for dir in std::env::split_paths(&path_var) {
            for candidate in &candidates {
                if dir.join(candidate).is_file() {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::split_paths(&path_var).any(|dir| dir.join(executable).is_file())
    }
}

fn is_known_external_terminal(terminal_id: &str) -> bool {
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

fn build_terminal_attempt_order(requested_terminal: &str) -> Vec<String> {
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

fn has_custom_terminal_placeholder(template: &str) -> bool {
    template.contains("{command}")
        || template.contains("{cwd}")
        || template.contains("{path}")
        || template.contains("{pi}")
}

#[cfg(target_os = "windows")]
fn render_custom_terminal_command(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> String {
    let resume_cmd = build_windows_cmd_resume_command(cwd, path, pi_cmd);
    let has_any_placeholder = has_custom_terminal_placeholder(template);
    let mut rendered = template
        .replace("{command}", &resume_cmd)
        // Direct replacement, user controls quoting in their template
        .replace("{cwd}", cwd)
        .replace("{path}", path)
        .replace("{pi}", pi_cmd);

    // Only append resume command if user didn't use any placeholder
    // Using any placeholder means user has already embedded the command logic
    if !has_any_placeholder {
        rendered = format!("{rendered} cmd /K {}", cmd_double_quote(&resume_cmd));
    }

    rendered
}

#[cfg(not(target_os = "windows"))]
fn render_custom_terminal_command(template: &str, cwd: &str, path: &str, pi_cmd: &str) -> String {
    let resume_cmd = build_unix_resume_command(cwd, path, pi_cmd);
    let has_any_placeholder = has_custom_terminal_placeholder(template);
    let mut rendered = template
        .replace("{command}", &resume_cmd)
        // Direct replacement, user controls quoting in their template
        .replace("{cwd}", cwd)
        .replace("{path}", path)
        .replace("{pi}", pi_cmd);

    // Only append resume command if user didn't use any placeholder
    // Using any placeholder means user has already embedded the command logic
    if !has_any_placeholder {
        rendered = format!("{rendered} sh -lc {}", shell_single_quote(&resume_cmd));
    }

    rendered
}

#[cfg(target_os = "macos")]
fn launch_via_osascript(app_name: &str, command: &str, _cwd: &str) -> Result<(), String> {
    if !macos_app_exists(app_name) {
        return Err(format!("{} is not installed", app_name));
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

fn try_launch_custom_terminal(
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
    log::info!("[Terminal] Template: {}", template);
    log::info!("[Terminal] CWD: {}", cwd);
    log::info!("[Terminal] Path: {}", path);
    log::info!("[Terminal] Pi: {}", pi_cmd);
    log::info!("[Terminal] Rendered command: {}", rendered);

    // Check if it's a known terminal name - use osascript for PTY support
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
fn macos_app_exists(app_name: &str) -> bool {
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
fn run_osascript(script: &str) -> Result<(), String> {
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

#[cfg(target_os = "macos")]
fn try_launch_known_terminal_macos(
    terminal_id: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
    resume_command: Option<&str>,
) -> Result<bool, String> {
    let resume_cmd = build_resume_command(cwd, path, pi_cmd, resume_command);
    log::info!("[Terminal macOS] terminal_id: {}", terminal_id);
    log::info!("[Terminal macOS] resume_command input: {:?}", resume_command);
    log::info!("[Terminal macOS] resume_cmd built: {}", resume_cmd);
    match terminal_id {
        "iterm2" => {
            if !macos_app_exists("iTerm") {
                return Ok(false);
            }

            let script = format!(
                r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "{}"
    end tell
end tell"#,
                escape_double_quoted(&resume_cmd)
            );
            run_osascript(&script).map(|_| true)
        }
        "terminal" => {
            if !macos_app_exists("Terminal") {
                return Ok(false);
            }

            let script = format!(
                r#"tell application "Terminal"
    activate
    do script "{}"
end tell"#,
                escape_double_quoted(&resume_cmd)
            );
            run_osascript(&script).map(|_| true)
        }
        "wezterm" => {
            if !command_exists("wezterm") {
                return Ok(false);
            }

            let mut command = Command::new("wezterm");
            command
                .arg("start")
                .arg("--cwd")
                .arg(cwd)
                .arg("--")
                .arg("sh")
                .arg("-lc")
                .arg(&resume_cmd);
            spawn_command(&mut command, "wezterm")?;
            Ok(true)
        }
        "kitty" => {
            if !command_exists("kitty") {
                return Ok(false);
            }

            let mut command = Command::new("kitty");
            command
                .arg("--directory")
                .arg(cwd)
                .arg("sh")
                .arg("-lc")
                .arg(&resume_cmd);
            spawn_command(&mut command, "kitty")?;
            Ok(true)
        }
        "alacritty" => {
            if !command_exists("alacritty") {
                return Ok(false);
            }

            let mut command = Command::new("alacritty");
            command
                .arg("--working-directory")
                .arg(cwd)
                .arg("-e")
                .arg("sh")
                .arg("-lc")
                .arg(&resume_cmd);
            spawn_command(&mut command, "alacritty")?;
            Ok(true)
        }
        "vscode" => {
            if !command_exists("code") {
                return Ok(false);
            }

            let mut command = Command::new("code");
            command.arg("--new-window").arg(cwd);
            spawn_command(&mut command, "VS Code")?;
            Ok(true)
        }
        "tmux" => {
            // tmux needs a real terminal - use Terminal.app or iTerm2 via osascript
            let tmux_session = "pi";
            let tmux_cmd = format!(
                "/opt/homebrew/bin/tmux has-session -t {tmux_session} 2>/dev/null || /opt/homebrew/bin/tmux new-session -d -s {tmux_session} -c '{}'; /opt/homebrew/bin/tmux send-keys -t {tmux_session} \"{}\" Enter; /opt/homebrew/bin/tmux attach -t {tmux_session}",
                escape_double_quoted(cwd),
                escape_double_quoted(&resume_cmd)
            );

            // Try iTerm first, then Terminal.app
            if macos_app_exists("iTerm") {
                let script = format!(
                    r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "{}"
    end tell
end tell"#,
                    escape_double_quoted(&tmux_cmd)
                );
                run_osascript(&script).map(|_| true)
            } else if macos_app_exists("Terminal") {
                let script = format!(
                    r#"tell application "Terminal"
    activate
    do script "{}"
end tell"#,
                    escape_double_quoted(&tmux_cmd)
                );
                run_osascript(&script).map(|_| true)
            } else {
                Ok(false)
            }
        }
        _ => Ok(false),
    }
}

#[cfg(target_os = "windows")]
fn try_launch_known_terminal_windows(
    terminal_id: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
    resume_command: Option<&str>,
) -> Result<bool, String> {
    // For custom resume command, use it directly with cmd
    let cmd_resume = match resume_command {
        Some(template) if !template.trim().is_empty() => {
            template.replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd)
        }
        _ => build_windows_cmd_resume_command(cwd, path, pi_cmd),
    };
    let ps_resume = match resume_command {
        Some(template) if !template.trim().is_empty() => {
            template.replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd)
        }
        _ => build_windows_powershell_resume_command(cwd, path, pi_cmd),
    };
    match terminal_id {
        "windows-terminal" => {
            if !command_exists("wt") {
                return Ok(false);
            }

            Command::new("wt")
                .arg("-d")
                .arg(cwd)
                .arg("cmd")
                .arg("/K")
                .arg(&cmd_resume)
                .spawn()
                .map_err(|e| format!("Failed to launch Windows Terminal: {e}"))?;
            Ok(true)
        }
        "powershell" => {
            let shell_executable = if command_exists("pwsh") {
                "pwsh"
            } else if command_exists("powershell") {
                "powershell"
            } else {
                return Ok(false);
            };

            Command::new("cmd")
                .arg("/C")
                .arg("start")
                .arg("")
                .arg(shell_executable)
                .arg("-NoExit")
                .arg("-Command")
                .arg(&ps_resume)
                .spawn()
                .map_err(|e| format!("Failed to launch PowerShell: {e}"))?;
            Ok(true)
        }
        "cmd" => {
            if !command_exists("cmd") {
                return Ok(false);
            }

            Command::new("cmd")
                .arg("/C")
                .arg("start")
                .arg("")
                .arg("cmd")
                .arg("/K")
                .arg(&cmd_resume)
                .spawn()
                .map_err(|e| format!("Failed to launch cmd: {e}"))?;
            Ok(true)
        }
        "vscode" => {
            if !command_exists("code") {
                return Ok(false);
            }

            let mut command = Command::new("code");
            command.arg("--new-window").arg(cwd);
            spawn_command(&mut command, "VS Code")?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn try_launch_known_terminal_linux(
    terminal_id: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
    resume_command: Option<&str>,
) -> Result<bool, String> {
    let resume_cmd = build_resume_command(cwd, path, pi_cmd, resume_command);
    match terminal_id {
        "gnome-terminal" => {
            if !command_exists("gnome-terminal") {
                return Ok(false);
            }

            Command::new("gnome-terminal")
                .arg("--")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch gnome-terminal: {e}"))?;
            Ok(true)
        }
        "konsole" => {
            if !command_exists("konsole") {
                return Ok(false);
            }

            Command::new("konsole")
                .arg("--workdir")
                .arg(cwd)
                .arg("-e")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch konsole: {e}"))?;
            Ok(true)
        }
        "xfce4-terminal" => {
            if !command_exists("xfce4-terminal") {
                return Ok(false);
            }

            Command::new("xfce4-terminal")
                .arg("--working-directory")
                .arg(cwd)
                .arg("-x")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch xfce4-terminal: {e}"))?;
            Ok(true)
        }
        "tilix" => {
            if !command_exists("tilix") {
                return Ok(false);
            }

            Command::new("tilix")
                .arg("--working-directory")
                .arg(cwd)
                .arg("-e")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch tilix: {e}"))?;
            Ok(true)
        }
        "kitty" => {
            if !command_exists("kitty") {
                return Ok(false);
            }

            let mut command = Command::new("kitty");
            command
                .arg("--directory")
                .arg(cwd)
                .arg("sh")
                .arg("-lc")
                .arg(&resume_cmd);
            spawn_command(&mut command, "kitty")?;
            Ok(true)
        }
        "alacritty" => {
            if !command_exists("alacritty") {
                return Ok(false);
            }

            let mut command = Command::new("alacritty");
            command
                .arg("--working-directory")
                .arg(cwd)
                .arg("-e")
                .arg("sh")
                .arg("-lc")
                .arg(&resume_cmd);
            spawn_command(&mut command, "alacritty")?;
            Ok(true)
        }
        "wezterm" => {
            if !command_exists("wezterm") {
                return Ok(false);
            }

            let mut command = Command::new("wezterm");
            command
                .arg("start")
                .arg("--cwd")
                .arg(cwd)
                .arg("--")
                .arg("sh")
                .arg("-lc")
                .arg(&resume_cmd);
            spawn_command(&mut command, "wezterm")?;
            Ok(true)
        }
        "mate-terminal" => {
            if !command_exists("mate-terminal") {
                return Ok(false);
            }

            Command::new("mate-terminal")
                .arg("--working-directory")
                .arg(cwd)
                .arg("--")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch mate-terminal: {e}"))?;
            Ok(true)
        }
        "lxterminal" => {
            if !command_exists("lxterminal") {
                return Ok(false);
            }

            let command = format!("bash -lc {}", shell_single_quote(&resume_cmd));
            Command::new("lxterminal")
                .arg(format!("--working-directory={cwd}"))
                .arg("-e")
                .arg(&command)
                .spawn()
                .map_err(|e| format!("Failed to launch lxterminal: {e}"))?;
            Ok(true)
        }
        "xterm" => {
            if !command_exists("xterm") {
                return Ok(false);
            }

            Command::new("xterm")
                .arg("-e")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch xterm: {e}"))?;
            Ok(true)
        }
        "x-terminal-emulator" => {
            if !command_exists("x-terminal-emulator") {
                return Ok(false);
            }

            Command::new("x-terminal-emulator")
                .arg("-e")
                .arg("bash")
                .arg("-lc")
                .arg(&resume_cmd)
                .spawn()
                .map_err(|e| format!("Failed to launch x-terminal-emulator: {e}"))?;
            Ok(true)
        }
        "vscode" => {
            if !command_exists("code") {
                return Ok(false);
            }

            let mut command = Command::new("code");
            command.arg("--new-window").arg(cwd);
            spawn_command(&mut command, "VS Code")?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn try_launch_known_terminal(
    terminal_id: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
    resume_command: Option<&str>,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        try_launch_known_terminal_macos(terminal_id, cwd, path, pi_cmd, resume_command)
    }

    #[cfg(target_os = "windows")]
    {
        return try_launch_known_terminal_windows(terminal_id, cwd, path, pi_cmd, resume_command);
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        try_launch_known_terminal_linux(terminal_id, cwd, path, pi_cmd, resume_command)
    }
}

pub(super) async fn open_session_in_terminal_impl(
    path: String,
    cwd: String,
    terminal: Option<String>,
    pi_path: Option<String>,
    resume_command: Option<String>,
) -> Result<(), String> {
    if !Path::new(&path).is_file() {
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

    log::info!("[Terminal] Terminal: {}", requested_terminal);
    log::info!("[Terminal] CWD: {}", resolved_cwd);
    log::info!("[Terminal] Path: {}", path);
    log::info!("[Terminal] Pi: {}", pi_cmd);
    log::info!("[Terminal] Resume command: {:?}", resume_cmd);

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

pub(super) async fn open_session_in_browser_impl(path: String) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::{
        build_terminal_attempt_order, has_custom_terminal_placeholder,
        render_custom_terminal_command,
    };

    #[test]
    fn terminal_attempt_order_prioritizes_requested_terminal() {
        let requested = if cfg!(target_os = "windows") {
            "cmd"
        } else if cfg!(target_os = "macos") {
            "terminal"
        } else {
            "xterm"
        };
        let order = build_terminal_attempt_order(requested);
        assert_eq!(order.first().map(String::as_str), Some(requested));
    }

    #[test]
    fn terminal_attempt_order_auto_has_fallbacks() {
        let order = build_terminal_attempt_order("auto");
        assert!(!order.is_empty());
        assert!(!order.iter().any(|item| item == "auto"));
    }

    #[test]
    fn custom_placeholder_detection_recognizes_supported_tokens() {
        assert!(has_custom_terminal_placeholder("foo {command} bar"));
        assert!(has_custom_terminal_placeholder("foo {cwd} bar"));
        assert!(has_custom_terminal_placeholder("foo {path} bar"));
        assert!(has_custom_terminal_placeholder("foo {pi} bar"));
        assert!(!has_custom_terminal_placeholder("foo bar"));
    }

    #[test]
    fn custom_terminal_command_renders_all_placeholders() {
        let rendered = render_custom_terminal_command(
            "term {cwd} {path} {pi} {command}",
            "/tmp/cwd",
            "/tmp/session.jsonl",
            "pi",
        );
        assert!(!rendered.contains("{cwd}"));
        assert!(!rendered.contains("{path}"));
        assert!(!rendered.contains("{pi}"));
        assert!(!rendered.contains("{command}"));
    }

    #[test]
    fn custom_terminal_command_without_placeholder_appends_default_runner() {
        let rendered =
            render_custom_terminal_command("alacritty -e", "/tmp/cwd", "/tmp/session.jsonl", "pi");
        #[cfg(target_os = "windows")]
        assert!(rendered.contains("cmd /K"));
        #[cfg(not(target_os = "windows"))]
        assert!(rendered.contains("sh -lc"));
    }
}
