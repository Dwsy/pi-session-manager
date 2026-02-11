use crate::app_state::WsEvent;
use portable_pty::{Child, CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

pub struct TerminalSession {
    child: Option<Box<dyn Child + Send + Sync>>,
    pty_pair: Option<PtyPair>,
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    reader_handle: Option<std::thread::JoinHandle<()>>,
}

impl Default for TerminalSession {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalSession {
    pub fn new() -> Self {
        Self {
            child: None,
            pty_pair: None,
            writer: Arc::new(Mutex::new(None)),
            reader_handle: None,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create(
        &mut self,
        id: String,
        app: AppHandle,
        event_tx: broadcast::Sender<WsEvent>,
        cwd: String,
        shell: String,
        rows: u16,
        cols: u16,
    ) -> Result<String, String> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd_builder = CommandBuilder::new(&shell);
        cmd_builder.cwd(&cwd);

        let child = pair
            .slave
            .spawn_command(cmd_builder)
            .map_err(|e| format!("Failed to spawn shell: {e}"))?;
        self.child = Some(child);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {e}"))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get reader: {e}"))?;

        *self.writer.lock().unwrap() = Some(writer);
        self.pty_pair = Some(pair);

        let session_id = id;
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
                            let text =
                                unsafe { std::str::from_utf8_unchecked(&pending[..valid_up_to]) };
                            let payload = serde_json::json!({ "id": &session_id, "data": text });
                            let _ = app.emit("terminal-output", &payload);
                            let _ = event_tx.send(WsEvent {
                                event_type: "event".to_string(),
                                event: "terminal-output".to_string(),
                                payload,
                            });
                            pending.drain(..valid_up_to);
                        }
                    }
                    Err(_) => break,
                }
            }
        }));

        Ok("Terminal created".to_string())
    }

    pub fn write(&self, data: String) -> Result<(), String> {
        if let Some(ref mut writer) = *self.writer.lock().unwrap() {
            writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Write error: {e}"))?;
            writer.flush().map_err(|e| format!("Flush error: {e}"))?;
            Ok(())
        } else {
            Err("Terminal not initialized".to_string())
        }
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        if let Some(ref pair) = self.pty_pair {
            pair.master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Resize error: {e}"))?;
            Ok(())
        } else {
            Err("Terminal not initialized".to_string())
        }
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        log::debug!("TerminalSession dropping, cleaning up...");
        // 1. Drop writer to close the master PTY write end → reader thread gets EOF
        *self.writer.lock().unwrap() = None;
        // 2. Kill child process
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // 3. Drop PTY pair (closes master fd, unblocks reader)
        self.pty_pair.take();
        // 4. Join reader thread with timeout
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
    }
}

pub struct TerminalManager {
    sessions: Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_session(
        &self,
        id: String,
        app: AppHandle,
        event_tx: broadcast::Sender<WsEvent>,
        cwd: String,
        shell: String,
        rows: u16,
        cols: u16,
    ) -> Result<String, String> {
        let mut session = TerminalSession::new();
        session.create(id.clone(), app, event_tx, cwd, shell, rows, cols)?;
        self.sessions.lock().unwrap().insert(id, session);
        Ok("Session created".to_string())
    }

    pub fn write_to_session(&self, id: &str, data: String) -> Result<(), String> {
        if let Some(session) = self.sessions.lock().unwrap().get(id) {
            session.write(data)
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn resize_session(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        if let Some(session) = self.sessions.lock().unwrap().get(id) {
            session.resize(rows, cols)
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn close_session(&self, id: &str) -> Result<(), String> {
        if self.sessions.lock().unwrap().remove(id).is_some() {
            Ok(())
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }
}
