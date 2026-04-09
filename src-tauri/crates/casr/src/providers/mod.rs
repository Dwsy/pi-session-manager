//! Provider trait and concrete provider implementations.
//!
//! Each supported provider (Claude Code, Codex, Gemini CLI, Cursor, Cline,
//! Aider, Amp, OpenCode, ChatGPT, ClawdBot, Vibe, Factory, OpenClaw,
//! Pi-Agent) implements the [`Provider`] trait to read/write sessions in its
//! native format.

pub mod aider;
pub mod amp;
pub mod chatgpt;
pub mod claude_code;
pub mod clawdbot;
pub mod cline;
pub mod codex;
pub mod cursor;
pub mod factory;
pub mod gemini;
pub mod openclaw;
pub mod opencode;
pub mod pi_agent;
pub mod vibe;

use std::path::{Path, PathBuf};

use crate::discovery::DetectionResult;
use crate::model::CanonicalSession;

/// Options controlling how a session is written to disk.
#[derive(Debug, Clone)]
pub struct WriteOptions {
    /// Overwrite existing session file (creates `.bak` backup).
    pub force: bool,
}

/// Describes the files produced by a successful write operation.
#[derive(Debug, Clone)]
pub struct WrittenSession {
    /// Paths of files written.
    pub paths: Vec<PathBuf>,
    /// Session ID in the target provider's format.
    pub session_id: String,
    /// Ready-to-paste command to resume the session.
    pub resume_command: String,
    /// Path to the `.bak` backup, if an existing file was overwritten.
    pub backup_path: Option<PathBuf>,
}

/// The core abstraction each provider implements.
///
/// Object-safe so we can store `Box<dyn Provider>` in the registry.
pub trait Provider: Send + Sync {
    /// Human-readable name (e.g. `"Claude Code"`).
    fn name(&self) -> &str;

    /// Short slug used in session metadata (e.g. `"claude-code"`).
    fn slug(&self) -> &str;

    /// CLI alias used in `casr <alias> resume …` (e.g. `"cc"`).
    fn cli_alias(&self) -> &str;

    /// Probe whether this provider is installed on the machine.
    fn detect(&self) -> DetectionResult;

    /// Root directories where this provider stores sessions.
    fn session_roots(&self) -> Vec<PathBuf>;

    /// Check if `session_id` belongs to this provider; return the file path if so.
    fn owns_session(&self, session_id: &str) -> Option<PathBuf>;

    /// Read a session from its native format into canonical IR.
    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession>;

    /// Write a canonical session into this provider's native format.
    fn write_session(
        &self,
        session: &CanonicalSession,
        opts: &WriteOptions,
    ) -> anyhow::Result<WrittenSession>;

    /// Build the shell command to resume a session with this provider.
    fn resume_command(&self, session_id: &str) -> String;

    /// Enumerate all discoverable sessions for this provider.
    ///
    /// Returns `Some(vec)` of `(session_id, path)` pairs when the provider
    /// stores multiple sessions in a single file or database and directory
    /// walking alone would undercount.  The default returns `None`, which
    /// tells the caller to fall back to directory walking + `read_session`.
    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        None
    }
}
