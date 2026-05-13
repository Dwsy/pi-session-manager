//! Shell detection utilities
//!
//! Pure filesystem queries — no GUI or PTY dependency.

use std::path::Path;

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
            let path_ext = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
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

fn shell_candidate_exists(candidate: &str) -> bool {
    let is_explicit = candidate.contains('/') || candidate.contains('\\');
    if is_explicit || Path::new(candidate).is_absolute() {
        Path::new(candidate).exists()
    } else {
        command_exists(candidate)
    }
}

pub fn scan_shells() -> Vec<(String, String)> {
    #[cfg(target_os = "windows")]
    let candidates: &[(&str, &[&str])] =
        &[("PowerShell", &[r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe", "powershell.exe"]), ("pwsh", &[r"C:\Program Files\PowerShell\7\pwsh.exe", "pwsh.exe"]), ("cmd", &[r"C:\Windows\System32\cmd.exe", "cmd.exe"]), ("Git Bash", &[r"C:\Program Files\Git\bin\bash.exe", "bash.exe"])];

    #[cfg(not(target_os = "windows"))]
    let candidates: &[(&str, &[&str])] = &[
        ("zsh", &["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"]),
        ("bash", &["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/opt/homebrew/bin/bash"]),
        ("sh", &["/bin/sh", "/usr/bin/sh"]),
        ("fish", &["/usr/local/bin/fish", "/opt/homebrew/bin/fish", "/usr/bin/fish"]),
        ("nu", &["/usr/local/bin/nu", "/opt/homebrew/bin/nu", "/usr/bin/nu"]),
    ];

    let mut shells = Vec::new();
    for (label, paths) in candidates {
        for path in *paths {
            if shell_candidate_exists(path) {
                shells.push((label.to_string(), path.to_string()));
                break;
            }
        }
    }

    // Supplement with /etc/shells (catches Nix, Homebrew Linux, distro-specific paths)
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(content) = std::fs::read_to_string("/etc/shells") {
            for line in content.lines() {
                let path = line.trim();
                if path.is_empty() || path.starts_with('#') {
                    continue;
                }
                // Skip if already found
                if shells.iter().any(|(_, p)| p == path) {
                    continue;
                }
                if Path::new(path).is_file() {
                    let name = Path::new(path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown");
                    shells.push((name.to_string(), path.to_string()));
                }
            }
        }
    }

    // Also check $SHELL (current login shell, may not be in static list)
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(current) = std::env::var("SHELL") {
            if !current.is_empty() && !shells.iter().any(|(_, p)| p == &current) && Path::new(&current).is_file() {
                let name = Path::new(&current)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("shell");
                shells.insert(0, (name.to_string(), current));
            }
        }
    }

    shells
}
