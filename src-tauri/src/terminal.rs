use crate::app_state::WsEvent;
use chrono::{DateTime, Utc};
use portable_pty::{Child, CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt::Write as FmtWrite;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

const DEFAULT_TRANSCRIPT_CHUNK_BYTES: u64 = 256 * 1024;
const MAX_TRANSCRIPT_CHUNK_BYTES: u64 = 1024 * 1024;
static TRANSCRIPT_COUNTER: AtomicU64 = AtomicU64::new(1);

fn new_transcript_id(terminal_id: &str) -> String {
    let sequence = TRANSCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{terminal_id}@{}-{}-{sequence}", Utc::now().timestamp_millis(), std::process::id())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalTranscriptSummary {
    pub id: String,
    pub cwd: String,
    pub shell: String,
    pub started_at: String,
    pub updated_at: String,
    pub bytes: u64,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalTranscriptChunk {
    pub id: String,
    pub entries: Vec<Value>,
    pub next_offset: u64,
    pub file_size: u64,
    pub has_more: bool,
}

fn transcript_dir() -> Result<PathBuf, String> {
    let dir = crate::paths::psm_root_dir()?.join("terminal-history");
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create terminal history directory: {error}"))?;
    Ok(dir)
}

fn transcript_file_name(id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(id.as_bytes());
    let digest = hasher.finalize();
    let mut hash = String::with_capacity(24);
    for byte in digest.iter().take(12) {
        let _ = write!(&mut hash, "{byte:02x}");
    }
    format!("{hash}.jsonl")
}

fn transcript_path(id: &str) -> Result<PathBuf, String> {
    Ok(transcript_dir()?.join(transcript_file_name(id)))
}

fn append_transcript_value(path: &Path, value: &Value) -> Result<(), String> {
    let mut file = OpenOptions::new().create(true).append(true).open(path).map_err(|error| format!("Failed to open terminal transcript: {error}"))?;
    serde_json::to_writer(&mut file, value).map_err(|error| format!("Failed to serialize terminal transcript: {error}"))?;
    file.write_all(b"\n").map_err(|error| format!("Failed to append terminal transcript: {error}"))?;
    file.flush().map_err(|error| format!("Failed to flush terminal transcript: {error}"))
}

fn modified_at(metadata: &fs::Metadata) -> String {
    metadata.modified().ok().map(DateTime::<Utc>::from).unwrap_or_else(Utc::now).to_rfc3339()
}

fn read_transcript_meta(path: &Path) -> Option<(String, String, String, String)> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    if reader.read_line(&mut line).ok()? == 0 {
        return None;
    }
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    if value.get("type").and_then(Value::as_str) != Some("meta") {
        return None;
    }
    Some((value.get("id")?.as_str()?.to_string(), value.get("cwd").and_then(Value::as_str).unwrap_or_default().to_string(), value.get("shell").and_then(Value::as_str).unwrap_or_default().to_string(), value.get("startedAt").and_then(Value::as_str).unwrap_or_default().to_string()))
}

pub struct TerminalSession {
    child: Option<Box<dyn Child + Send + Sync>>,
    pty_pair: Option<PtyPair>,
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    reader_handle: Option<std::thread::JoinHandle<()>>,
    transcript_path: Option<PathBuf>,
}

impl Default for TerminalSession {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalSession {
    pub fn new() -> Self {
        Self { child: None, pty_pair: None, writer: Arc::new(Mutex::new(None)), reader_handle: None, transcript_path: None }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create(&mut self, id: String, app: AppHandle, event_tx: broadcast::Sender<WsEvent>, cwd: String, shell: String, rows: u16, cols: u16) -> Result<String, String> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system.openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd_builder = CommandBuilder::new(&shell);
        cmd_builder.cwd(&cwd);

        let child = pair.slave.spawn_command(cmd_builder).map_err(|e| format!("Failed to spawn shell: {e}"))?;
        self.child = Some(child);

        let writer = pair.master.take_writer().map_err(|e| format!("Failed to get writer: {e}"))?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| format!("Failed to get reader: {e}"))?;

        *self.writer.lock().expect("mutex poisoned") = Some(writer);
        self.pty_pair = Some(pair);

        let transcript_id = new_transcript_id(&id);
        let transcript_path = transcript_path(&transcript_id).ok().and_then(|path| {
            let started_at = Utc::now().to_rfc3339();
            match append_transcript_value(
                &path,
                &json!({
                    "type": "meta",
                    "id": transcript_id,
                    "terminalId": id,
                    "cwd": cwd,
                    "shell": shell,
                    "startedAt": started_at,
                }),
            ) {
                Ok(()) => Some(path),
                Err(error) => {
                    log::warn!("Failed to initialize terminal transcript: {error}");
                    None
                }
            }
        });
        self.transcript_path = transcript_path.clone();

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
                            let text = unsafe { std::str::from_utf8_unchecked(&pending[..valid_up_to]) };
                            let payload = json!({ "id": &session_id, "data": text });
                            if let Some(path) = &transcript_path {
                                let _ = append_transcript_value(path, &json!({ "type": "output", "ts": Utc::now().to_rfc3339(), "data": text }));
                            }
                            let _ = app.emit("terminal-output", &payload);
                            let _ = event_tx.send(WsEvent { event_type: "event".to_string(), event: "terminal-output".to_string(), payload });
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
        if let Some(ref mut writer) = *self.writer.lock().expect("mutex poisoned") {
            writer.write_all(data.as_bytes()).map_err(|e| format!("Write error: {e}"))?;
            writer.flush().map_err(|e| format!("Flush error: {e}"))?;
            if let Some(path) = &self.transcript_path {
                if let Err(error) = append_transcript_value(path, &json!({ "type": "input", "ts": Utc::now().to_rfc3339(), "data": data })) {
                    log::warn!("Failed to append terminal transcript input: {error}");
                }
            }
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

    fn mark_closed(&self) {
        if let Some(path) = &self.transcript_path {
            let _ = append_transcript_value(path, &json!({ "type": "closed", "ts": Utc::now().to_rfc3339() }));
        }
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        log::debug!("TerminalSession dropping, cleaning up...");
        *self.writer.lock().expect("mutex poisoned") = None;
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

    #[allow(clippy::too_many_arguments)]
    pub fn create_session(&self, id: String, app: AppHandle, event_tx: broadcast::Sender<WsEvent>, cwd: String, shell: String, rows: u16, cols: u16) -> Result<String, String> {
        let mut session = TerminalSession::new();
        session.create(id.clone(), app, event_tx, cwd, shell, rows, cols)?;
        self.sessions.lock().expect("mutex poisoned").insert(id, session);
        Ok("Session created".to_string())
    }

    pub fn write_to_session(&self, id: &str, data: String) -> Result<(), String> {
        if let Some(session) = self.sessions.lock().expect("mutex poisoned").get(id) {
            session.write(data)
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn resize_session(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        if let Some(session) = self.sessions.lock().expect("mutex poisoned").get(id) {
            session.resize(rows, cols)
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().expect("mutex poisoned");
        if let Some(session) = sessions.remove(id) {
            session.mark_closed();
            drop(session);
            Ok(())
        } else {
            Err(format!("Session '{id}' not found"))
        }
    }

    pub fn list_transcripts(&self) -> Result<Vec<TerminalTranscriptSummary>, String> {
        let active_ids = self.sessions.lock().expect("mutex poisoned").keys().cloned().collect::<HashSet<_>>();
        let mut summaries = Vec::new();
        for entry in fs::read_dir(transcript_dir()?).map_err(|error| format!("Failed to list terminal history: {error}"))? {
            let entry = entry.map_err(|error| format!("Failed to read terminal history entry: {error}"))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
                continue;
            }
            let Some((id, cwd, shell, started_at)) = read_transcript_meta(&path) else {
                continue;
            };
            let metadata = entry.metadata().map_err(|error| format!("Failed to stat terminal transcript: {error}"))?;
            summaries.push(TerminalTranscriptSummary { active: active_ids.contains(&id), id, cwd, shell, started_at, updated_at: modified_at(&metadata), bytes: metadata.len() });
        }
        summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(summaries)
    }

    pub fn read_transcript(&self, id: &str, offset: u64, max_bytes: Option<u64>) -> Result<TerminalTranscriptChunk, String> {
        let path = transcript_path(id)?;
        let file = File::open(&path).map_err(|error| format!("Terminal transcript '{id}' not found: {error}"))?;
        let file_size = file.metadata().map_err(|error| format!("Failed to stat terminal transcript: {error}"))?.len();
        let start = offset.min(file_size);
        let limit = max_bytes.unwrap_or(DEFAULT_TRANSCRIPT_CHUNK_BYTES).clamp(1, MAX_TRANSCRIPT_CHUNK_BYTES);
        let mut reader = BufReader::new(file);
        reader.seek(SeekFrom::Start(start)).map_err(|error| format!("Failed to seek terminal transcript: {error}"))?;

        let mut entries = Vec::new();
        let mut consumed = 0u64;
        let mut next_offset = start;
        let mut line = String::new();
        loop {
            let line_start = reader.stream_position().map_err(|error| format!("Failed to read terminal transcript offset: {error}"))?;
            line.clear();
            let bytes = reader.read_line(&mut line).map_err(|error| format!("Failed to read terminal transcript: {error}"))? as u64;
            if bytes == 0 {
                break;
            }
            if consumed > 0 && consumed + bytes > limit {
                reader.seek(SeekFrom::Start(line_start)).map_err(|error| format!("Failed to restore terminal transcript offset: {error}"))?;
                break;
            }
            consumed += bytes;
            next_offset = reader.stream_position().map_err(|error| format!("Failed to read terminal transcript offset: {error}"))?;
            if let Ok(value) = serde_json::from_str::<Value>(line.trim()) {
                entries.push(value);
            }
            if consumed >= limit {
                break;
            }
        }

        Ok(TerminalTranscriptChunk { id: id.to_string(), entries, next_offset, file_size, has_more: next_offset < file_size })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_lists_and_pages_terminal_transcripts() {
        let _env_lock = crate::paths::acquire_test_env_lock();
        let temp = tempfile::tempdir().expect("tempdir");
        let _home = crate::paths::TestHomeGuard::set(temp.path());
        let id = "session:/tmp/demo.jsonl:term-1";
        let path = transcript_path(id).expect("transcript path");

        append_transcript_value(
            &path,
            &json!({
                "type": "meta",
                "id": id,
                "cwd": "/tmp/demo",
                "shell": "/bin/zsh",
                "startedAt": "2026-09-01T10:00:00Z"
            }),
        )
        .expect("append meta");
        append_transcript_value(&path, &json!({ "type": "input", "ts": "2026-09-01T10:00:01Z", "data": "pwd\n" })).expect("append input");
        append_transcript_value(&path, &json!({ "type": "output", "ts": "2026-09-01T10:00:02Z", "data": "/tmp/demo\n" })).expect("append output");

        let manager = TerminalManager::new();
        let summaries = manager.list_transcripts().expect("list transcripts");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, id);
        assert_eq!(summaries[0].cwd, "/tmp/demo");
        assert!(!summaries[0].active);

        let first = manager.read_transcript(id, 0, Some(32)).expect("first page");
        assert_eq!(first.entries.len(), 1);
        assert_eq!(first.entries[0]["type"], "meta");
        assert!(first.has_more);
        assert!(first.next_offset > 0);

        let second = manager.read_transcript(id, first.next_offset, Some(MAX_TRANSCRIPT_CHUNK_BYTES)).expect("remaining page");
        assert_eq!(second.entries.iter().map(|entry| entry["type"].as_str()).collect::<Vec<_>>(), vec![Some("input"), Some("output")]);
        assert!(!second.has_more);
        assert_eq!(second.next_offset, second.file_size);
    }
}
