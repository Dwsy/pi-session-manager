//! Session open commands - delegates to domain/terminal
//!
//! Note: The actual commands are defined in session.rs to avoid duplication.
//! This module exists for internal organization only.

use crate::domain::terminal;

pub async fn open_session_in_terminal_impl(
    path: String,
    cwd: String,
    terminal: Option<String>,
    pi_path: Option<String>,
    resume_command: Option<String>,
) -> Result<(), String> {
    terminal::open_session_in_terminal_impl(path, cwd, terminal, pi_path, resume_command).await
}

pub async fn open_session_in_browser_impl(path: String) -> Result<(), String> {
    terminal::open_session_in_browser_impl(path).await
}
