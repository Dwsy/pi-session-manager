//! Cross-platform terminal launching implementations
use crate::domain::terminal::utils::{
    build_resume_command, escape_double_quoted, shell_single_quote, spawn_command,
};
use crate::utils::string::command_exists;
use std::process::Command;

#[cfg(target_os = "macos")]
use crate::domain::terminal::utils::{macos_app_exists, run_osascript};

#[cfg(target_os = "windows")]
use crate::domain::terminal::utils::{
    build_windows_cmd_resume_command, build_windows_powershell_resume_command,
};

#[cfg(target_os = "macos")]
pub fn try_launch_known_terminal_macos(
    terminal_id: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
    resume_command: Option<&str>,
) -> Result<bool, String> {
    let resume_cmd = build_resume_command(cwd, path, pi_cmd, resume_command);
    log::info!("[Terminal macOS] terminal_id: {terminal_id}");
    log::info!("[Terminal macOS] resume_command input: {resume_command:?}");
    log::info!("[Terminal macOS] resume_cmd built: {resume_cmd}");
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
            let tmux_session = "pi";
            let tmux_cmd = format!(
                "/opt/homebrew/bin/tmux has-session -t {tmux_session} 2>/dev/null || /opt/homebrew/bin/tmux new-session -d -s {tmux_session} -c '{}'; /opt/homebrew/bin/tmux send-keys -t {tmux_session} \"{}\" Enter; /opt/homebrew/bin/tmux attach -t {tmux_session}",
                escape_double_quoted(cwd),
                escape_double_quoted(&resume_cmd)
            );

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
pub fn try_launch_known_terminal_windows(
    terminal_id: &str,
    cwd: &str,
    path: &str,
    pi_cmd: &str,
    resume_command: Option<&str>,
) -> Result<bool, String> {
    let cmd_resume = match resume_command {
        Some(template) if !template.trim().is_empty() => template
            .replace("{cwd}", cwd)
            .replace("{path}", path)
            .replace("{pi}", pi_cmd),
        _ => build_windows_cmd_resume_command(cwd, path, pi_cmd),
    };
    let ps_resume = match resume_command {
        Some(template) if !template.trim().is_empty() => template
            .replace("{cwd}", cwd)
            .replace("{path}", path)
            .replace("{pi}", pi_cmd),
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
pub fn try_launch_known_terminal_linux(
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

/// Try to launch a known terminal (cross-platform dispatcher)
pub fn try_launch_known_terminal(
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
        try_launch_known_terminal_windows(terminal_id, cwd, path, pi_cmd, resume_command)
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        try_launch_known_terminal_linux(terminal_id, cwd, path, pi_cmd, resume_command)
    }
}
