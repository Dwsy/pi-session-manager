//! String utilities
use std::path::Path;

pub fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub fn shell_escape_single_quotes(input: &str) -> String {
    input.replace('\'', "'\''")
}

pub fn escape_double_quoted(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

pub fn cmd_double_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

pub fn powershell_single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

pub fn join_url(base: &str, suffix: &str) -> String {
    let trimmed_base = base.trim_end_matches('/');
    let trimmed_suffix = suffix.trim_start_matches('/');
    format!("{trimmed_base}/{trimmed_suffix}")
}

/// Resolve launch cwd: prefer explicit cwd, fallback to session parent dir
pub fn resolve_launch_cwd(cwd: &str, session_path: &str) -> String {
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

/// Check if a command exists in PATH
pub fn command_exists(executable: &str) -> bool {
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
