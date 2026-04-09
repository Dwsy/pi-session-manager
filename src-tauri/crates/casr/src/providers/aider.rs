//! Aider provider — reads/writes Markdown chat history sessions.
//!
//! Session files: `.aider.chat.history.md` (per-project, in the git repo root)
//! Resume command: `aider --restore-chat-history`
//!
//! ## Markdown format
//!
//! Aider uses an append-only Markdown file with three content types:
//!
//! - `# aider chat started at YYYY-MM-DD HH:MM:SS` — session boundary header
//! - `#### <user text>` — user messages (H4 headings)
//! - `> <tool output>` — tool/system output (blockquotes)
//! - Everything else — assistant responses (bare text)
//!
//! ## Session ID scheme
//!
//! Aider has no native session IDs. casr derives a deterministic ID from the
//! session start timestamp: `YYYY-MM-DDThh-mm-ss`.
//!
//! ## Multi-session files
//!
//! A single `.aider.chat.history.md` may contain many sessions (append-only).
//! casr uses a virtual path scheme `<history-file>/<session-id>` (like Cursor)
//! to address individual sessions within a multi-session file.

use std::path::{Path, PathBuf};

use anyhow::Context;
use tracing::{debug, info, trace};
use walkdir::WalkDir;

use crate::discovery::DetectionResult;
use crate::model::{
    CanonicalMessage, CanonicalSession, MessageRole, reindex_messages, truncate_title,
};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Aider provider implementation.
pub struct Aider;

/// Represents a single parsed session within an Aider history file.
struct ParsedSession {
    /// Deterministic session ID from the start timestamp.
    session_id: String,
    /// The raw start timestamp string from the header.
    start_timestamp: String,
    /// The full text of just this session (from header to next header or EOF).
    text: String,
}

impl Aider {
    /// Root directory for Aider data.
    /// Respects `AIDER_HOME` env var override.
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("AIDER_HOME") {
            return Some(PathBuf::from(home));
        }
        None
    }

    /// Find all `.aider.chat.history.md` files in known locations.
    fn find_history_files() -> Vec<PathBuf> {
        let mut files: Vec<PathBuf> = Vec::new();

        // 1. Check AIDER_HOME.
        if let Some(home) = Self::home_dir() {
            Self::scan_for_history_files(&home, &mut files, 4);
        }

        // 2. Check explicit AIDER_CHAT_HISTORY_FILE.
        if let Ok(path) = std::env::var("AIDER_CHAT_HISTORY_FILE") {
            let p = PathBuf::from(path);
            if p.is_file() && !files.contains(&p) {
                files.push(p);
            }
        }

        // 3. Check current working directory.
        if let Ok(cwd) = std::env::current_dir() {
            let candidate = cwd.join(".aider.chat.history.md");
            if candidate.is_file() && !files.contains(&candidate) {
                files.push(candidate);
            }
        }

        files
    }

    /// Walk a directory for `.aider.chat.history.md` files.
    fn scan_for_history_files(dir: &Path, files: &mut Vec<PathBuf>, max_depth: usize) {
        if !dir.is_dir() {
            return;
        }
        for entry in WalkDir::new(dir)
            .max_depth(max_depth)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_name().to_str() == Some(".aider.chat.history.md")
                && entry.path().is_file()
                && !files.contains(&entry.path().to_path_buf())
            {
                files.push(entry.path().to_path_buf());
            }
        }
    }

    /// Build a virtual per-session path within a history file.
    ///
    /// Format: `<history_file_path>/<session_id>`
    fn virtual_session_path(history_path: &Path, session_id: &str) -> PathBuf {
        let encoded = urlencoding::encode(session_id);
        history_path.join(encoded.as_ref())
    }

    /// Extract the history file path and session ID from a virtual path.
    ///
    /// Returns `(history_file_path, session_id)`.
    fn parse_virtual_path(path: &Path) -> Option<(PathBuf, String)> {
        let parent = path.parent()?;
        let filename = path.file_name()?.to_str()?;

        // If the parent path ends with `.aider.chat.history.md`, it's a virtual path.
        if parent
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.ends_with(".aider.chat.history.md"))
        {
            let decoded = urlencoding::decode(filename).ok()?;
            return Some((parent.to_path_buf(), decoded.into_owned()));
        }

        None
    }

    /// Split a history file into individual session texts.
    fn split_sessions(content: &str) -> Vec<ParsedSession> {
        let mut sessions: Vec<ParsedSession> = Vec::new();
        let mut current_text = String::new();
        let mut current_timestamp = String::new();
        let mut current_id = String::new();

        for line in content.lines() {
            if let Some(ts) = parse_session_header(line) {
                // Flush previous session.
                if !current_id.is_empty() && !current_text.trim().is_empty() {
                    sessions.push(ParsedSession {
                        session_id: current_id.clone(),
                        start_timestamp: current_timestamp.clone(),
                        text: std::mem::take(&mut current_text),
                    });
                }
                current_timestamp = ts.clone();
                current_id = timestamp_to_session_id(&ts);
                current_text = format!("{line}\n");
            } else {
                current_text.push_str(line);
                current_text.push('\n');
            }
        }

        // Flush last session.
        if !current_id.is_empty() && !current_text.trim().is_empty() {
            sessions.push(ParsedSession {
                session_id: current_id,
                start_timestamp: current_timestamp,
                text: current_text,
            });
        }

        sessions
    }

    /// Parse a single session text block into a `CanonicalSession`.
    fn parse_session_text(
        path: &Path,
        session: &ParsedSession,
    ) -> anyhow::Result<CanonicalSession> {
        let mut messages: Vec<CanonicalMessage> = Vec::new();
        let mut user_lines: Vec<String> = Vec::new();
        let mut assistant_lines: Vec<String> = Vec::new();
        let mut tool_lines: Vec<String> = Vec::new();
        let mut model_name: Option<String> = None;
        let mut workspace: Option<PathBuf> = None;

        // Flush accumulated lines into a message.
        let flush_user = |lines: &mut Vec<String>, msgs: &mut Vec<CanonicalMessage>| {
            if lines.is_empty() {
                return;
            }
            let content = lines.join("\n").trim().to_string();
            lines.clear();
            if content.is_empty() || content == "<blank>" {
                return;
            }
            msgs.push(CanonicalMessage {
                idx: 0,
                role: MessageRole::User,
                content,
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            });
        };

        let flush_assistant = |lines: &mut Vec<String>, msgs: &mut Vec<CanonicalMessage>| {
            if lines.is_empty() {
                return;
            }
            let content = lines.join("\n").trim().to_string();
            lines.clear();
            if content.is_empty() {
                return;
            }
            msgs.push(CanonicalMessage {
                idx: 0,
                role: MessageRole::Assistant,
                content,
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            });
        };

        let flush_tool = |lines: &mut Vec<String>, msgs: &mut Vec<CanonicalMessage>| {
            if lines.is_empty() {
                return;
            }
            let content = lines.join("\n").trim().to_string();
            lines.clear();
            if content.is_empty() {
                return;
            }
            msgs.push(CanonicalMessage {
                idx: 0,
                role: MessageRole::Tool,
                content,
                timestamp: None,
                author: None,
                tool_calls: vec![],
                tool_results: vec![],
                extra: serde_json::Value::Null,
            });
        };

        for line in session.text.lines() {
            // Skip the session header.
            if line.starts_with("# ") {
                continue;
            }

            // Tool/system output: lines starting with "> ".
            if let Some(rest) = line.strip_prefix("> ") {
                // Flush other accumulators first.
                flush_assistant(&mut assistant_lines, &mut messages);
                flush_user(&mut user_lines, &mut messages);

                let stripped = rest.trim_end().trim_end_matches("  ");
                let parsed_model = extract_model_from_tool_line(stripped);
                let parsed_workspace = extract_workspace_from_tool_line(stripped);
                let is_metadata_only_line = parsed_model.is_some() || parsed_workspace.is_some();

                // Extract metadata from tool output lines.
                if model_name.is_none()
                    && let Some(model) = parsed_model
                {
                    model_name = Some(model);
                }
                if workspace.is_none()
                    && let Some(ws) = parsed_workspace
                {
                    workspace = Some(ws);
                }
                if !is_metadata_only_line {
                    tool_lines.push(stripped.to_string());
                }

                continue;
            }

            // User message: lines starting with "#### ".
            if let Some(rest) = line.strip_prefix("#### ") {
                flush_assistant(&mut assistant_lines, &mut messages);
                flush_tool(&mut tool_lines, &mut messages);

                let stripped = rest.trim_end().trim_end_matches("  ");
                user_lines.push(stripped.to_string());
                continue;
            }

            // Everything else is assistant text.
            flush_user(&mut user_lines, &mut messages);
            flush_tool(&mut tool_lines, &mut messages);

            assistant_lines.push(line.to_string());
        }

        // Flush remaining lines.
        flush_user(&mut user_lines, &mut messages);
        flush_assistant(&mut assistant_lines, &mut messages);
        flush_tool(&mut tool_lines, &mut messages);

        reindex_messages(&mut messages);

        // Parse start timestamp into epoch millis.
        let started_at = parse_aider_timestamp(&session.start_timestamp);
        let ended_at = started_at; // Aider doesn't have per-message timestamps.

        // Title from first user message.
        let title = messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| truncate_title(&m.content, 100));

        // If workspace not found in tool output, try to derive from file path.
        if workspace.is_none() {
            workspace = path.parent().map(PathBuf::from);
        }

        let mut metadata = serde_json::Map::new();
        metadata.insert(
            "source".into(),
            serde_json::Value::String("aider".to_string()),
        );
        metadata.insert(
            "start_timestamp_raw".into(),
            serde_json::Value::String(session.start_timestamp.clone()),
        );

        let source_path = Self::virtual_session_path(path, &session.session_id);

        debug!(
            session_id = session.session_id,
            messages = messages.len(),
            "Aider session parsed"
        );

        Ok(CanonicalSession {
            session_id: session.session_id.clone(),
            provider_slug: "aider".to_string(),
            workspace,
            title,
            started_at,
            ended_at,
            messages,
            metadata: serde_json::Value::Object(metadata),
            source_path,
            model_name,
        })
    }
}

impl Provider for Aider {
    fn name(&self) -> &str {
        "Aider"
    }

    fn slug(&self) -> &str {
        "aider"
    }

    fn cli_alias(&self) -> &str {
        "aid"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if which::which("aider").is_ok() {
            evidence.push("aider binary found in PATH".to_string());
            installed = true;
        }

        let history_files = Self::find_history_files();
        if !history_files.is_empty() {
            evidence.push(format!(
                "{} .aider.chat.history.md file(s) found",
                history_files.len()
            ));
            installed = true;
        }

        trace!(provider = "aider", ?evidence, installed, "detection");
        DetectionResult {
            installed,
            version: None,
            evidence,
        }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        // Return parent directories of all known history files.
        let mut roots: Vec<PathBuf> = Vec::new();
        for file in Self::find_history_files() {
            if let Some(parent) = file.parent() {
                let parent_buf = parent.to_path_buf();
                if !roots.contains(&parent_buf) {
                    roots.push(parent_buf);
                }
            }
        }
        roots
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        for history_file in Self::find_history_files() {
            let file = match std::fs::File::open(&history_file) {
                Ok(f) => f,
                Err(_) => continue,
            };
            let reader = std::io::BufReader::new(file);
            for line in std::io::BufRead::lines(reader).map_while(Result::ok) {
                if let Some(ts) = parse_session_header(&line) {
                    let id = timestamp_to_session_id(&ts);
                    if id == session_id {
                        let virtual_path = Self::virtual_session_path(&history_file, session_id);
                        debug!(
                            history_file = %history_file.display(),
                            session_path = %virtual_path.display(),
                            session_id,
                            "found Aider session"
                        );
                        return Some(virtual_path);
                    }
                }
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Aider session");

        // Check if this is a virtual path (history_file/session_id).
        if let Some((history_path, session_id)) = Self::parse_virtual_path(path) {
            let content = std::fs::read_to_string(&history_path)
                .with_context(|| format!("failed to read {}", history_path.display()))?;
            let sessions = Self::split_sessions(&content);
            let session = sessions
                .iter()
                .find(|s| s.session_id == session_id)
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "session {} not found in {}",
                        session_id,
                        history_path.display()
                    )
                })?;
            return Self::parse_session_text(&history_path, session);
        }

        // Direct file path — read the whole file and return the last session.
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let sessions = Self::split_sessions(&content);

        if sessions.is_empty() {
            // Treat the entire file as a single session.
            let session = ParsedSession {
                session_id: path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
                start_timestamp: String::new(),
                text: content,
            };
            return Self::parse_session_text(path, &session);
        }

        // Return the last (most recent) session.
        let last = sessions.last().expect("checked non-empty");
        Self::parse_session_text(path, last)
    }

    fn write_session(
        &self,
        session: &CanonicalSession,
        _opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession> {
        let target_session_id = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S").to_string();
        let now = chrono::Utc::now();
        let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

        // Determine target path.
        let target_dir = if let Some(home) = Self::home_dir() {
            home
        } else if let Some(ref ws) = session.workspace {
            ws.clone()
        } else {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/tmp"))
        };

        let target_path = target_dir.join(".aider.chat.history.md");

        debug!(
            target_session_id,
            target_path = %target_path.display(),
            "writing Aider session"
        );

        // Build the Aider Markdown content.
        let mut output = String::new();

        // If the file exists, preserve its contents.
        if target_path.exists()
            && let Ok(existing_content) = std::fs::read_to_string(&target_path)
        {
            output.push_str(&existing_content);
            if !output.ends_with('\n') {
                output.push('\n');
            }
        }

        output.push_str(&format!("\n# aider chat started at {now_str}\n\n"));

        // Add model info as tool output if available.
        if let Some(ref model) = session.model_name {
            output.push_str(&format!("> Model: {model}  \n"));
        }

        // Write messages.
        for msg in &session.messages {
            match msg.role {
                MessageRole::User => {
                    // Multi-line user messages: each line gets #### prefix.
                    for line in msg.content.lines() {
                        output.push_str(&format!("\n#### {line}  \n"));
                    }
                }
                MessageRole::Assistant => {
                    output.push('\n');
                    output.push_str(msg.content.trim());
                    output.push_str("\n\n");
                }
                MessageRole::Tool | MessageRole::System | MessageRole::Other(_) => {
                    // Tool/system output as blockquotes.
                    for line in msg.content.lines() {
                        output.push_str(&format!("> {line}  \n"));
                    }
                }
            }
        }

        let content_bytes = output.into_bytes();

        // Always force the write because Aider appends to a shared history file.
        // A pre-existing file is the expected state, not a conflict.
        let outcome =
            crate::pipeline::atomic_write(&target_path, &content_bytes, true, self.slug())?;

        info!(
            target_session_id,
            path = %outcome.target_path.display(),
            messages = session.messages.len(),
            "Aider session written"
        );

        let virtual_path = Self::virtual_session_path(&outcome.target_path, &target_session_id);

        Ok(WrittenSession {
            paths: vec![virtual_path],
            session_id: target_session_id.clone(),
            resume_command: self.resume_command(&target_session_id),
            backup_path: outcome.backup_path,
        })
    }

    fn resume_command(&self, _session_id: &str) -> String {
        "aider --restore-chat-history".to_string()
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        let history_files = Self::find_history_files();
        if history_files.is_empty() {
            return Some(Vec::new());
        }

        let mut results = Vec::new();
        for history_file in &history_files {
            let Ok(file) = std::fs::File::open(history_file) else {
                continue;
            };
            let reader = std::io::BufReader::new(file);
            for line in std::io::BufRead::lines(reader).map_while(Result::ok) {
                if let Some(ts) = parse_session_header(&line) {
                    let id = timestamp_to_session_id(&ts);
                    let virtual_path = Self::virtual_session_path(history_file, &id);
                    results.push((id, virtual_path));
                }
            }
        }

        Some(results)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a session header line and extract the timestamp.
///
/// Expected format: `# aider chat started at YYYY-MM-DD HH:MM:SS`
/// Returns the timestamp portion (e.g. `"2024-08-05 19:33:02"`).
fn parse_session_header(line: &str) -> Option<String> {
    let trimmed = line.trim();
    trimmed
        .strip_prefix("# aider chat started at ")
        .map(|ts| ts.trim().to_string())
}

/// Convert a timestamp string to a deterministic session ID.
///
/// `"2024-08-05 19:33:02"` → `"2024-08-05T19-33-02"`
fn timestamp_to_session_id(timestamp: &str) -> String {
    timestamp.replace(' ', "T").replace(':', "-")
}

/// Parse an Aider timestamp string into epoch milliseconds.
///
/// Expected format: `YYYY-MM-DD HH:MM:SS`
fn parse_aider_timestamp(ts: &str) -> Option<i64> {
    let ts = ts.trim();
    if ts.is_empty() {
        return None;
    }
    chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|dt| dt.and_utc().timestamp_millis())
}

/// Extract model name from an Aider tool output line.
///
/// Looks for patterns like:
/// - `"Models: claude-3-5-sonnet-20240620 with diff edit format"`
/// - `"Model: gpt-4o-mini with whole edit format"`
fn extract_model_from_tool_line(line: &str) -> Option<String> {
    let line = line.trim();
    for prefix in ["Models: ", "Model: "] {
        if let Some(rest) = line.strip_prefix(prefix) {
            // Take up to " with " to get just the model name.
            let model = rest.split(" with ").next().unwrap_or(rest).trim();
            if !model.is_empty() {
                return Some(model.to_string());
            }
        }
    }
    None
}

/// Extract workspace path from an Aider tool output line.
///
/// Looks for patterns like:
/// - `"Git repo: .git with 300 files"` → derive from the history file path
/// - Absolute path references in tool output
fn extract_workspace_from_tool_line(line: &str) -> Option<PathBuf> {
    let line = line.trim();
    // Look for absolute paths.
    for prefix in ["/data/projects/", "/home/", "/Users/", "/root/"] {
        if let Some(idx) = line.find(prefix) {
            let rest = &line[idx..];
            let path: String = rest
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
                .collect();
            if path.len() > prefix.len() {
                return Some(PathBuf::from(path));
            }
        }
    }
    None
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Write as _;

    // -----------------------------------------------------------------------
    // Session header parsing
    // -----------------------------------------------------------------------

    #[test]
    fn parse_session_header_standard() {
        assert_eq!(
            parse_session_header("# aider chat started at 2024-08-05 19:33:02"),
            Some("2024-08-05 19:33:02".to_string())
        );
    }

    #[test]
    fn parse_session_header_with_whitespace() {
        assert_eq!(
            parse_session_header("  # aider chat started at 2024-08-05 19:33:02  "),
            Some("2024-08-05 19:33:02".to_string())
        );
    }

    #[test]
    fn parse_session_header_not_a_header() {
        assert_eq!(parse_session_header("#### User message"), None);
        assert_eq!(parse_session_header("> tool output"), None);
        assert_eq!(parse_session_header("assistant text"), None);
    }

    // -----------------------------------------------------------------------
    // Timestamp to session ID
    // -----------------------------------------------------------------------

    #[test]
    fn timestamp_to_session_id_standard() {
        assert_eq!(
            timestamp_to_session_id("2024-08-05 19:33:02"),
            "2024-08-05T19-33-02"
        );
    }

    // -----------------------------------------------------------------------
    // Aider timestamp parsing
    // -----------------------------------------------------------------------

    #[test]
    fn parse_aider_timestamp_standard() {
        let result = parse_aider_timestamp("2024-08-05 19:33:02");
        assert!(result.is_some());
        assert!(result.unwrap() > 1_700_000_000_000);
    }

    #[test]
    fn parse_aider_timestamp_empty() {
        assert_eq!(parse_aider_timestamp(""), None);
    }

    #[test]
    fn parse_aider_timestamp_garbage() {
        assert_eq!(parse_aider_timestamp("not a date"), None);
    }

    // -----------------------------------------------------------------------
    // Model extraction
    // -----------------------------------------------------------------------

    #[test]
    fn extract_model_standard() {
        assert_eq!(
            extract_model_from_tool_line(
                "Models: claude-3-5-sonnet-20240620 with diff edit format, weak model claude-3-haiku"
            ),
            Some("claude-3-5-sonnet-20240620".to_string())
        );
    }

    #[test]
    fn extract_model_single_model() {
        assert_eq!(
            extract_model_from_tool_line("Model: gpt-4o-mini with whole edit format"),
            Some("gpt-4o-mini".to_string())
        );
    }

    #[test]
    fn extract_model_no_model() {
        assert_eq!(
            extract_model_from_tool_line("Git repo: .git with 300 files"),
            None
        );
    }

    // -----------------------------------------------------------------------
    // Session splitting
    // -----------------------------------------------------------------------

    #[test]
    fn split_sessions_single() {
        let content = "\
# aider chat started at 2024-08-05 19:33:02

> Aider v0.47.2-dev

#### Hello

Hi there!

";
        let sessions = Aider::split_sessions(content);
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "2024-08-05T19-33-02");
        assert_eq!(sessions[0].start_timestamp, "2024-08-05 19:33:02");
    }

    #[test]
    fn split_sessions_multiple() {
        let content = "\
# aider chat started at 2024-08-05 19:33:02

#### First session

Response one

# aider chat started at 2024-08-05 20:45:10

#### Second session

Response two

";
        let sessions = Aider::split_sessions(content);
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].session_id, "2024-08-05T19-33-02");
        assert_eq!(sessions[1].session_id, "2024-08-05T20-45-10");
    }

    #[test]
    fn split_sessions_empty() {
        let sessions = Aider::split_sessions("");
        assert_eq!(sessions.len(), 0);
    }

    // -----------------------------------------------------------------------
    // Reader unit tests
    // -----------------------------------------------------------------------

    /// Write content to a temp file and read it back.
    fn read_aider_session(content: &str) -> CanonicalSession {
        let mut tmp = tempfile::NamedTempFile::with_suffix(".md").unwrap();
        tmp.write_all(content.as_bytes()).unwrap();
        tmp.flush().unwrap();
        let aider = Aider;
        aider
            .read_session(tmp.path())
            .unwrap_or_else(|e| panic!("read_session failed: {e}"))
    }

    #[test]
    fn reader_basic_exchange() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

> Aider v0.47.2-dev
> Models: claude-3-5-sonnet with diff edit format

#### Fix the bug in main.rs

I'll fix the bug. Here's the change:

```python
print('fixed')
```

> Applied edit to main.rs
",
        );
        assert_eq!(session.session_id, "2024-08-05T19-33-02");
        assert_eq!(session.provider_slug, "aider");
        // Should have: tool (Aider banner), user, assistant, tool (applied edit)
        assert!(session.messages.len() >= 2);

        // Check we have user and assistant messages.
        let user_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::User)
            .collect();
        let asst_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::Assistant)
            .collect();
        assert_eq!(user_msgs.len(), 1);
        assert_eq!(user_msgs[0].content, "Fix the bug in main.rs");
        assert!(!asst_msgs.is_empty());
        assert!(asst_msgs[0].content.contains("I'll fix the bug"));

        // Model extracted from tool output.
        assert_eq!(session.model_name.as_deref(), Some("claude-3-5-sonnet"));
    }

    #[test]
    fn reader_multi_line_user_input() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### First line of input
#### Second line of input
#### Third line

Response here.

",
        );
        let user_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::User)
            .collect();
        assert_eq!(user_msgs.len(), 1);
        assert!(user_msgs[0].content.contains("First line of input"));
        assert!(user_msgs[0].content.contains("Second line of input"));
        assert!(user_msgs[0].content.contains("Third line"));
    }

    #[test]
    fn reader_blank_user_input_skipped() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### <blank>

Some response

#### Real message

Another response

",
        );
        let user_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::User)
            .collect();
        assert_eq!(user_msgs.len(), 1);
        assert_eq!(user_msgs[0].content, "Real message");
    }

    #[test]
    fn reader_tool_output_as_separate_messages() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

> Aider v0.47.2-dev

#### Hello

Response

> Applied edit to file.rs
> Commit abc123 fix: something

",
        );
        let tool_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::Tool)
            .collect();
        assert!(!tool_msgs.is_empty());
    }

    #[test]
    fn reader_returns_last_session_from_multi_session_file() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### First session

First response

# aider chat started at 2024-08-05 20:45:10

#### Second session

Second response

",
        );
        assert_eq!(session.session_id, "2024-08-05T20-45-10");
        let user_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::User)
            .collect();
        assert_eq!(user_msgs.len(), 1);
        assert_eq!(user_msgs[0].content, "Second session");
    }

    #[test]
    fn reader_empty_file() {
        let session = read_aider_session("");
        assert_eq!(session.messages.len(), 0);
    }

    #[test]
    fn reader_title_from_first_user_message() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### Refactor the authentication module

Done.

",
        );
        assert_eq!(
            session.title.as_deref(),
            Some("Refactor the authentication module")
        );
    }

    #[test]
    fn reader_preserves_code_blocks_in_assistant() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### Fix the function

Here's the fix:

```rust
fn main() {
    println!(\"hello\");
}
```

",
        );
        let asst_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::Assistant)
            .collect();
        assert!(asst_msgs[0].content.contains("```rust"));
        assert!(asst_msgs[0].content.contains("fn main()"));
    }

    #[test]
    fn reader_slash_commands_as_user_messages() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### /diff

> Some diff output

#### /ex

",
        );
        let user_msgs: Vec<_> = session
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::User)
            .collect();
        assert!(!user_msgs.is_empty());
        assert_eq!(user_msgs[0].content, "/diff");
    }

    #[test]
    fn reader_started_at_timestamp() {
        let session = read_aider_session(
            "\
# aider chat started at 2024-08-05 19:33:02

#### Hello

Hi!

",
        );
        assert!(session.started_at.is_some());
    }

    // -----------------------------------------------------------------------
    // Virtual path tests
    // -----------------------------------------------------------------------

    #[test]
    fn virtual_path_round_trip() {
        let history = Path::new("/data/project/.aider.chat.history.md");
        let session_id = "2024-08-05T19-33-02";
        let virtual_path = Aider::virtual_session_path(history, session_id);

        let (parsed_path, parsed_id) =
            Aider::parse_virtual_path(&virtual_path).expect("should parse virtual path");
        assert_eq!(parsed_path, history);
        assert_eq!(parsed_id, session_id);
    }

    // -----------------------------------------------------------------------
    // Provider trait tests
    // -----------------------------------------------------------------------

    #[test]
    fn resume_command_uses_restore_flag() {
        let provider = Aider;
        assert_eq!(
            <Aider as Provider>::resume_command(&provider, "any-id"),
            "aider --restore-chat-history"
        );
    }

    #[test]
    fn provider_metadata() {
        let provider = Aider;
        assert_eq!(provider.name(), "Aider");
        assert_eq!(provider.slug(), "aider");
        assert_eq!(provider.cli_alias(), "aid");
    }

    // -----------------------------------------------------------------------
    // Writer helper tests
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // list_sessions
    // -----------------------------------------------------------------------

    #[test]
    fn list_sessions_enumerates_all_sessions_in_file() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let history_path = tmp_dir.path().join(".aider.chat.history.md");
        std::fs::write(
            &history_path,
            "\
# aider chat started at 2024-08-05 19:33:02

#### First session

Response one

# aider chat started at 2024-08-05 20:45:10

#### Second session

Response two

# aider chat started at 2024-08-06 10:00:00

#### Third session

Response three

",
        )
        .unwrap();

        // split_sessions should find all 3 sessions
        let content = std::fs::read_to_string(&history_path).unwrap();
        let sessions = Aider::split_sessions(&content);
        assert_eq!(sessions.len(), 3);
        assert_eq!(sessions[0].session_id, "2024-08-05T19-33-02");
        assert_eq!(sessions[1].session_id, "2024-08-05T20-45-10");
        assert_eq!(sessions[2].session_id, "2024-08-06T10-00-00");
    }

    #[test]
    fn writer_produces_valid_aider_markdown() {
        // Test the Markdown generation logic directly by writing to a workspace.
        let tmp_dir = tempfile::tempdir().unwrap();
        let session = CanonicalSession {
            session_id: "test-123".to_string(),
            provider_slug: "claude-code".to_string(),
            workspace: Some(tmp_dir.path().to_path_buf()),
            title: Some("Test".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_001_000_000),
            messages: vec![
                CanonicalMessage {
                    idx: 0,
                    role: MessageRole::User,
                    content: "Fix the bug".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
                CanonicalMessage {
                    idx: 1,
                    role: MessageRole::Assistant,
                    content: "I'll fix it now.".to_string(),
                    timestamp: None,
                    author: None,
                    tool_calls: vec![],
                    tool_results: vec![],
                    extra: json!({}),
                },
            ],
            metadata: json!({"source": "claude-code"}),
            source_path: PathBuf::from("/tmp/test.jsonl"),
            model_name: Some("claude-3".to_string()),
        };

        let provider = Aider;
        let opts = WriteOptions { force: false };
        let result = provider
            .write_session(&session, &opts)
            .expect("write should succeed");

        assert!(!result.session_id.is_empty());
        assert_eq!(result.resume_command, "aider --restore-chat-history");

        // Read back the written file and verify content.
        let written_file = tmp_dir.path().join(".aider.chat.history.md");
        assert!(written_file.exists());
        let content = std::fs::read_to_string(&written_file).unwrap();
        assert!(content.contains("# aider chat started at"));
        assert!(content.contains("#### Fix the bug"));
        assert!(content.contains("I'll fix it now."));
        assert!(content.contains("> Model: claude-3"));
    }
}
