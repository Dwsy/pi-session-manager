use crate::WsEvent;
use portable_pty::{Child, CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

pub struct TerminalSession {
    child: Option<Box<dyn Child + Send + Sync>>,
    pty_pair: Option<PtyPair>,
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    reader_handle: Option<std::thread::JoinHandle<()>>,
}

impl TerminalSession {
    pub fn new() -> Self {
        Self { child: None, pty_pair: None, writer: Arc::new(Mutex::new(None)), reader_handle: None }
    }

    pub fn create(&mut self, id: String, event_tx: broadcast::Sender<WsEvent>, cwd: String, shell: String, rows: u16, cols: u16) -> Result<(), String> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system.openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd_builder = CommandBuilder::new(&shell);
        cmd_builder.cwd(&cwd);

        let child = pair.slave.spawn_command(cmd_builder).map_err(|e| format!("Failed to spawn shell: {e}"))?;
        self.child = Some(child);

        let writer = pair.master.take_writer().map_err(|e| format!("Failed to get writer: {e}"))?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| format!("Failed to get reader: {e}"))?;

        *self.writer.lock().map_err(|e| format!("Failed to lock writer: {e}"))? = Some(writer);
        self.pty_pair = Some(pair);

        self.reader_handle = Some(std::thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            let mut pending = Vec::<u8>::new();
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => {
                        pending.extend_from_slice(&buffer[..n]);
                        let valid_up_to = match std::str::from_utf8(&pending) {
                            Ok(s) => s.len(),
                            Err(e) => e.valid_up_to(),
                        };
                        if valid_up_to > 0 {
                            let text = String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
                            let payload = serde_json::json!({ "id": &id, "data": text });
                            let _ = event_tx.send(WsEvent { event_type: "event".to_string(), event: "terminal-output".to_string(), payload });
                            pending.drain(..valid_up_to);
                        }
                    }
                    Err(_) => break,
                }
            }
        }));

        Ok(())
    }

    pub fn write(&self, data: String) -> Result<(), String> {
        let mut guard = self.writer.lock().map_err(|e| format!("Failed to lock writer: {e}"))?;
        if let Some(writer) = guard.as_mut() {
            writer.write_all(data.as_bytes()).map_err(|e| format!("Write error: {e}"))?;
            writer.flush().map_err(|e| format!("Flush error: {e}"))?;
            Ok(())
        } else {
            Err("Terminal not initialized".to_string())
        }
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        if let Some(ref pair) = self.pty_pair {
            pair.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| format!("Resize error: {e}"))?;
            Ok(())
        } else {
            Err("Terminal not initialized".to_string())
        }
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        if let Ok(mut writer) = self.writer.lock() {
            *writer = None;
        }

        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        self.pty_pair.take();

        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
    }
}

pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self { sessions: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub fn create_session(&self, id: String, event_tx: broadcast::Sender<WsEvent>, cwd: String, shell: String, rows: u16, cols: u16) -> Result<String, String> {
        let mut session = TerminalSession::new();
        session.create(id.clone(), event_tx, cwd, shell, rows, cols)?;
        self.sessions.lock().map_err(|e| format!("Failed to lock terminal sessions: {e}"))?.insert(id, session);
        Ok("Terminal created".to_string())
    }

    pub fn write_to_session(&self, id: &str, data: String) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| format!("Failed to lock terminal sessions: {e}"))?;
        if let Some(session) = sessions.get(id) {
            session.write(data)
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn resize_session(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| format!("Failed to lock terminal sessions: {e}"))?;
        if let Some(session) = sessions.get(id) {
            session.resize(rows, cols)
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let removed = self.sessions.lock().map_err(|e| format!("Failed to lock terminal sessions: {e}"))?.remove(id);
        if removed.is_some() {
            Ok(())
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }
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
    let candidates: &[(&str, &[&str])] = &[
        ("PowerShell", &[r"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell.exe"]),
        ("pwsh", &[r"C:\\Program Files\\PowerShell\\7\\pwsh.exe", "pwsh.exe"]),
        ("cmd", &[r"C:\\Windows\\System32\\cmd.exe", "cmd.exe"]),
        ("Git Bash", &[r"C:\\Program Files\\Git\\bin\\bash.exe", "bash.exe"]),
    ];

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
    shells
}
