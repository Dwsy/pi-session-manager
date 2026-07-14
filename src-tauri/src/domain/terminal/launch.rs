//! Cross-platform terminal launching implementations
use crate::domain::terminal::utils::{build_resume_command, escape_double_quoted, shell_command_args, shell_single_quote, spawn_command};
use crate::utils::string::command_exists;
use std::process::Command;

#[cfg(target_os = "macos")]
use crate::domain::terminal::utils::{macos_app_exists, run_osascript};

#[cfg(target_os = "windows")]
use crate::domain::terminal::utils::{build_windows_cmd_resume_command, build_windows_powershell_resume_command};

#[cfg(target_os = "macos")]
pub fn try_launch_known_terminal_macos(terminal_id: &str, cwd: &str, path: &str, pi_cmd: &str, resume_command: Option<&str>) -> Result<bool, String> {
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
    tell current window
        create tab with default profile
        tell current session
            write text "{}"
        end tell
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
    tell application "System Events"
        keystroke "t" using command down
    end tell
    delay 0.3
    do script "{}" in front window
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
            command.arg("--new-tab").arg("--cwd").arg(cwd).arg("-e").arg("sh").arg("-lc").arg(&resume_cmd);
            spawn_command(&mut command, "wezterm")?;
            Ok(true)
        }
        "ghostty" => {
            if !command_exists("ghostty") {
                return Ok(false);
            }

            let mut command = Command::new("ghostty");
            command.arg("--cwd").arg(cwd).arg("-e").arg("sh").arg("-lc").arg(&resume_cmd);
            spawn_command(&mut command, "ghostty")?;
            Ok(true)
        }
        "kitty" => {
            if !command_exists("kitty") {
                return Ok(false);
            }

            let mut command = Command::new("kitty");
            command.arg("--directory").arg(cwd).arg("sh").arg("-lc").arg(&resume_cmd);
            spawn_command(&mut command, "kitty")?;
            Ok(true)
        }
        "alacritty" => {
            if !command_exists("alacritty") {
                return Ok(false);
            }

            let mut command = Command::new("alacritty");
            command.arg("--working-directory").arg(cwd).arg("-e").arg("sh").arg("-lc").arg(&resume_cmd);
            spawn_command(&mut command, "alacritty")?;
            Ok(true)
        }
        "warp" => {
            if !macos_app_exists("Warp") {
                return Ok(false);
            }

            // Warp CLI supports --cwd
            if command_exists("warp") {
                let mut command = Command::new("warp");
                command.arg("--cwd").arg(cwd).arg("-e").arg("sh").arg("-lc").arg(&resume_cmd);
                spawn_command(&mut command, "Warp")?;
                return Ok(true);
            }

            // Fallback: open via macOS `open` command
            let mut command = Command::new("open");
            command.arg("-a").arg("Warp").arg("--args").arg("--cwd").arg(cwd);
            spawn_command(&mut command, "Warp")?;
            Ok(true)
        }
        "zed" => {
            if !macos_app_exists("Zed") {
                return Ok(false);
            }

            // Zed CLI can open directories directly
            if command_exists("zed") {
                let mut command = Command::new("zed");
                command.arg("--new").arg(cwd);
                spawn_command(&mut command, "Zed")?;
                return Ok(true);
            }

            // Fallback: open via macOS `open` command
            let mut command = Command::new("open");
            command.arg("-a").arg("Zed").arg(cwd);
            spawn_command(&mut command, "Zed")?;
            Ok(true)
        }
        "hyper" => {
            // Hyper uses `open -a` (no reliable CLI for command injection)
            if !macos_app_exists("Hyper") {
                return Ok(false);
            }

            let mut command = Command::new("open");
            command.arg("-a").arg("Hyper").arg("--args").arg(cwd);
            spawn_command(&mut command, "Hyper")?;
            Ok(true)
        }
        "tabby" => {
            if !macos_app_exists("Tabby") {
                return Ok(false);
            }

            // Tabby has a CLI in some installations
            if command_exists("tabby") {
                let mut command = Command::new("tabby");
                command.arg("--cwd").arg(cwd).arg("-e").arg("sh").arg("-lc").arg(&resume_cmd);
                spawn_command(&mut command, "Tabby")?;
                return Ok(true);
            }

            // Fallback: open via macOS `open` command
            let mut command = Command::new("open");
            command.arg("-a").arg("Tabby").arg("--args").arg(cwd);
            spawn_command(&mut command, "Tabby")?;
            Ok(true)
        }
        "tmux" => {
            // Extract session id prefix from path for unique session name
            // e.g. /path/.../2026-04-07T09-50-16-218Z_5ec96bf4-xxx.jsonl → "5ec9"
            let session_suffix = std::path::Path::new(&path)
                .file_stem()
                .and_then(|s| s.to_str())
                .and_then(|stem| {
                    // Try to find UUID after underscore: timestamp_UUID
                    stem.split('_')
                        .next_back()
                        .filter(|s| s.len() >= 4)
                        .map(|uuid| &uuid[..4])
                        // Fallback: first 4 chars of filename
                        .or_else(|| stem.get(..4))
                })
                .unwrap_or("pi");

            let tmux_session = format!("pi-{session_suffix}");

            // tmux format: new-session -A -s pi-xxxx '<command>'
            let inner_cmd = build_resume_command(cwd, path, pi_cmd, resume_command);

            log::info!("[Terminal macOS tmux] session: {tmux_session}");
            log::info!("[Terminal macOS tmux] inner_cmd: {inner_cmd}");

            let tmux_cmd = format!("/opt/homebrew/bin/tmux new-session -A -s {tmux_session} {}", shell_single_quote(&inner_cmd));

            log::info!("[Terminal macOS tmux] full_cmd: {tmux_cmd}");

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
pub fn try_launch_known_terminal_windows(terminal_id: &str, cwd: &str, path: &str, pi_cmd: &str, resume_command: Option<&str>, shell: Option<&str>) -> Result<bool, String> {
    let cmd_resume = match resume_command {
        Some(template) if !template.trim().is_empty() => template.replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd),
        _ => build_windows_cmd_resume_command(cwd, path, pi_cmd),
    };
    let ps_resume = match resume_command {
        Some(template) if !template.trim().is_empty() => template.replace("{cwd}", cwd).replace("{path}", path).replace("{pi}", pi_cmd),
        _ => build_windows_powershell_resume_command(cwd, path, pi_cmd),
    };
    match terminal_id {
        "windows-terminal" => {
            if !command_exists("wt") {
                return Ok(false);
            }

            let shell_executable = shell.filter(|value| !value.trim().is_empty()).unwrap_or("powershell");
            Command::new("wt").arg("-d").arg(cwd).arg(shell_executable).arg("-NoExit").arg("-Command").arg(&ps_resume).spawn().map_err(|e| format!("Failed to launch Windows Terminal: {e}"))?;
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

            Command::new(shell_executable).arg("-NoExit").arg("-Command").arg(&ps_resume).spawn().map_err(|e| format!("Failed to launch PowerShell: {e}"))?;
            Ok(true)
        }
        "cmd" => {
            if !command_exists("cmd") {
                return Ok(false);
            }

            Command::new("cmd").arg("/K").arg(&cmd_resume).spawn().map_err(|e| format!("Failed to launch cmd: {e}"))?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
pub fn try_launch_known_terminal_linux(terminal_id: &str, cwd: &str, path: &str, pi_cmd: &str, resume_command: Option<&str>, shell: Option<&str>) -> Result<bool, String> {
    let resume_cmd = build_resume_command(cwd, path, pi_cmd, resume_command);
    let shell = shell.filter(|value| !value.trim().is_empty()).map(str::to_string).or_else(|| std::env::var("SHELL").ok()).unwrap_or_else(|| "/bin/sh".to_string());
    let (shell_flag, shell_args) = shell_command_args(&shell, &resume_cmd);
    match terminal_id {
        "ghostty" => {
            if !command_exists("ghostty") {
                return Ok(false);
            }
            let mut command = Command::new("ghostty");
            command.arg("--cwd").arg(cwd).arg("-e").arg(&shell).arg(shell_flag).args(&shell_args);
            spawn_command(&mut command, "ghostty")?;
            Ok(true)
        }
        "gnome-terminal" => {
            if !command_exists("gnome-terminal") {
                return Ok(false);
            }
            Command::new("gnome-terminal").arg("--").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch gnome-terminal: {e}"))?;
            Ok(true)
        }
        "konsole" => {
            if !command_exists("konsole") {
                return Ok(false);
            }
            Command::new("konsole").arg("--workdir").arg(cwd).arg("-e").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch konsole: {e}"))?;
            Ok(true)
        }
        "xfce4-terminal" => {
            if !command_exists("xfce4-terminal") {
                return Ok(false);
            }
            Command::new("xfce4-terminal").arg("--working-directory").arg(cwd).arg("-x").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch xfce4-terminal: {e}"))?;
            Ok(true)
        }
        "tilix" => {
            if !command_exists("tilix") {
                return Ok(false);
            }
            Command::new("tilix").arg("--working-directory").arg(cwd).arg("-e").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch tilix: {e}"))?;
            Ok(true)
        }
        "kitty" => {
            if !command_exists("kitty") {
                return Ok(false);
            }
            let mut command = Command::new("kitty");
            command.arg("--directory").arg(cwd).arg(&shell).arg(shell_flag).args(&shell_args);
            spawn_command(&mut command, "kitty")?;
            Ok(true)
        }
        "alacritty" => {
            if !command_exists("alacritty") {
                return Ok(false);
            }
            let mut command = Command::new("alacritty");
            command.arg("--working-directory").arg(cwd).arg("-e").arg(&shell).arg(shell_flag).args(&shell_args);
            spawn_command(&mut command, "alacritty")?;
            Ok(true)
        }
        "wezterm" => {
            if !command_exists("wezterm") {
                return Ok(false);
            }
            let mut command = Command::new("wezterm");
            command.arg("start").arg("--cwd").arg(cwd).arg("--").arg(&shell).arg(shell_flag).args(&shell_args);
            spawn_command(&mut command, "wezterm")?;
            Ok(true)
        }
        "mate-terminal" => {
            if !command_exists("mate-terminal") {
                return Ok(false);
            }
            Command::new("mate-terminal").arg("--working-directory").arg(cwd).arg("--").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch mate-terminal: {e}"))?;
            Ok(true)
        }
        "lxterminal" => {
            if !command_exists("lxterminal") {
                return Ok(false);
            }
            let command = format!("{} {} {}", shell, shell_flag, shell_single_quote(&resume_cmd));
            Command::new("lxterminal").arg(format!("--working-directory={cwd}")).arg("-e").arg(&command).spawn().map_err(|e| format!("Failed to launch lxterminal: {e}"))?;
            Ok(true)
        }
        "xterm" => {
            if !command_exists("xterm") {
                return Ok(false);
            }
            Command::new("xterm").arg("-e").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch xterm: {e}"))?;
            Ok(true)
        }
        "x-terminal-emulator" => {
            if !command_exists("x-terminal-emulator") {
                return Ok(false);
            }
            Command::new("x-terminal-emulator").arg("-e").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch x-terminal-emulator: {e}"))?;
            Ok(true)
        }
        "xdg-terminal-exec" => {
            if !command_exists("xdg-terminal-exec") {
                return Ok(false);
            }
            Command::new("xdg-terminal-exec").arg("-e").arg(&shell).arg(shell_flag).args(&shell_args).spawn().map_err(|e| format!("Failed to launch xdg-terminal-exec: {e}"))?;
            Ok(true)
        }
        "foot" => {
            if !command_exists("foot") && !command_exists("footclient") {
                return Ok(false);
            }
            let foot_bin = if command_exists("footclient") { "footclient" } else { "foot" };
            let mut command = Command::new(foot_bin);
            command.arg("--working-directory").arg(cwd).arg(&shell).arg(shell_flag).args(&shell_args);
            spawn_command(&mut command, "foot")?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// Try to launch a known terminal (cross-platform dispatcher)
pub fn try_launch_known_terminal(terminal_id: &str, cwd: &str, path: &str, pi_cmd: &str, resume_command: Option<&str>, shell: Option<&str>) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        try_launch_known_terminal_macos(terminal_id, cwd, path, pi_cmd, resume_command)
    }

    #[cfg(target_os = "windows")]
    {
        try_launch_known_terminal_windows(terminal_id, cwd, path, pi_cmd, resume_command, shell)
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        try_launch_known_terminal_linux(terminal_id, cwd, path, pi_cmd, resume_command, shell)
    }
}
