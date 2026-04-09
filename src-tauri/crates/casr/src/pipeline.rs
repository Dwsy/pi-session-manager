//! Conversion pipeline orchestrator.
//!
//! Ties detection, reading, validation, writing, and verification into a
//! single `convert()` call. Generic over the [`Provider`](crate::providers::Provider)
//! trait — concrete providers are wired in via the registry.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use tracing::{debug, info, warn};

use crate::discovery::{ProviderRegistry, SourceHint};
use crate::error::CasrError;
use crate::model::{CanonicalMessage, CanonicalSession, MessageRole, reindex_messages};
use crate::providers::{WriteOptions, WrittenSession};

/// Top-level orchestrator for session conversion.
pub struct ConversionPipeline {
    pub registry: ProviderRegistry,
}

/// Options passed through the pipeline from CLI flags.
#[derive(Debug, Clone)]
pub struct ConvertOptions {
    pub dry_run: bool,
    pub force: bool,
    pub verbose: bool,
    pub enrich: bool,
    pub source_hint: Option<String>,
}

/// Outcome of a successful (or dry-run) conversion.
#[derive(Debug)]
pub struct ConversionResult {
    pub source_provider: String,
    pub target_provider: String,
    pub canonical_session: CanonicalSession,
    pub written: Option<WrittenSession>,
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

/// Result of validating a canonical session.
#[derive(Debug, Clone, Default)]
pub struct ValidationResult {
    /// Fatal issues — pipeline must stop.
    pub errors: Vec<String>,
    /// Non-fatal issues — surfaced in UX/JSON but conversion continues.
    pub warnings: Vec<String>,
    /// Informational notes — shown in verbose/trace mode.
    pub info: Vec<String>,
}

impl ValidationResult {
    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }
}

/// Validate a canonical session for completeness and quality.
///
/// Returns errors (fatal), warnings (non-fatal), and info notes.
pub fn validate_session(session: &CanonicalSession) -> ValidationResult {
    let mut result = ValidationResult::default();

    // ERRORS — pipeline stops.
    if session.messages.is_empty() {
        result.errors.push("Session has no messages.".to_string());
        return result; // No point checking further.
    }

    let has_user = session.messages.iter().any(|m| m.role == MessageRole::User);
    let has_assistant = session
        .messages
        .iter()
        .any(|m| m.role == MessageRole::Assistant);

    if !has_user || !has_assistant {
        result.errors.push(
            "Session must have at least one user message and one assistant message.".to_string(),
        );
    }

    // WARNINGS — conversion continues.
    if session.workspace.is_none() {
        result.warnings.push(
            "Session has no workspace. Target agent may not know which project to work in."
                .to_string(),
        );
    }

    let has_timestamps = session.messages.iter().any(|m| m.timestamp.is_some());
    if !has_timestamps {
        result
            .warnings
            .push("Session has no timestamps. Message ordering may be unreliable.".to_string());
    }

    if session.messages.len() < 3 {
        result.warnings.push(
            "Very short session (<3 messages). May not provide enough context for resumption."
                .to_string(),
        );
    }

    // INFO — verbose/trace only.
    let has_tool_calls = session.messages.iter().any(|m| !m.tool_calls.is_empty());
    if has_tool_calls {
        result.info.push(
            "Session contains tool calls. Tool semantics may not translate perfectly between providers."
                .to_string(),
        );
    }

    let mut known_tool_call_ids: HashSet<&str> = HashSet::new();
    for msg in &session.messages {
        for call in &msg.tool_calls {
            if let Some(call_id) = call.id.as_deref() {
                known_tool_call_ids.insert(call_id);
            }
        }
    }

    for msg in &session.messages {
        for tool_result in &msg.tool_results {
            if let Some(call_id) = tool_result.call_id.as_deref()
                && !known_tool_call_ids.contains(call_id)
            {
                result.info.push(format!(
                    "Tool result at message index {} references unknown tool call id '{call_id}'.",
                    msg.idx
                ));
                break;
            }
        }
    }

    result
}

fn prepend_enrichment_messages(
    session: &mut CanonicalSession,
    source_provider: &str,
    target_provider: &str,
    source_session_id: &str,
) -> usize {
    let first_timestamp = session.messages.iter().filter_map(|m| m.timestamp).min();
    let notice_timestamp = first_timestamp.map(|ts| ts.saturating_sub(2));
    let summary_timestamp = notice_timestamp.map(|ts| ts.saturating_add(1));

    let mut notice_lines = vec![
        "[casr synthetic context]".to_string(),
        format!(
            "This session was originally created in {source_provider} and converted to {target_provider} format by casr."
        ),
        format!("Original session ID: {source_session_id}."),
        "Some provider-specific context may have been lost in conversion.".to_string(),
        format!("Original message count: {}.", session.messages.len()),
    ];
    if let Some(workspace) = &session.workspace {
        notice_lines.push(format!("Workspace: {}", workspace.display()));
    }

    let (summary_count, summary_lines) = build_recent_summary(session, 4, 180);
    let summary_body = format!(
        "[casr synthetic context]\nRecent conversation snapshot (last {summary_count} message(s)):\n{summary_lines}"
    );

    let notice = CanonicalMessage {
        idx: 0,
        role: MessageRole::System,
        content: notice_lines.join("\n"),
        timestamp: notice_timestamp,
        author: Some("casr-enrichment".to_string()),
        tool_calls: Vec::new(),
        tool_results: Vec::new(),
        extra: serde_json::json!({
            "casr_enrichment": true,
            "synthetic": true,
            "enrichment_type": "conversion_notice",
            "source_provider": source_provider,
            "target_provider": target_provider,
            "source_session_id": source_session_id,
        }),
    };

    let summary = CanonicalMessage {
        idx: 1,
        role: MessageRole::System,
        content: summary_body,
        timestamp: summary_timestamp,
        author: Some("casr-enrichment".to_string()),
        tool_calls: Vec::new(),
        tool_results: Vec::new(),
        extra: serde_json::json!({
            "casr_enrichment": true,
            "synthetic": true,
            "enrichment_type": "recent_summary",
            "source_provider": source_provider,
            "target_provider": target_provider,
            "source_session_id": source_session_id,
            "summary_message_count": summary_count,
        }),
    };

    let inserted = 2;
    session.messages.insert(0, summary);
    session.messages.insert(0, notice);
    reindex_messages(&mut session.messages);
    inserted
}

fn build_recent_summary(
    session: &CanonicalSession,
    max_messages: usize,
    max_chars_per_message: usize,
) -> (usize, String) {
    let start = session.messages.len().saturating_sub(max_messages);
    let mut lines: Vec<String> = Vec::new();

    for msg in &session.messages[start..] {
        let role = message_role_label(&msg.role);
        let compact_content = compact_summary_text(&msg.content, max_chars_per_message);
        lines.push(format!("- {role}: {compact_content}"));
    }

    if lines.is_empty() {
        lines.push("- (no messages)".to_string());
    }

    (lines.len(), lines.join("\n"))
}

fn compact_summary_text(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return "[empty]".to_string();
    }

    let compact_len = compact.chars().count();
    if compact_len <= max_chars {
        return compact;
    }

    if max_chars <= 3 {
        return ".".repeat(max_chars);
    }

    let mut truncated = String::new();
    for ch in compact.chars().take(max_chars - 3) {
        truncated.push(ch);
    }
    truncated.push_str("...");
    truncated
}

fn message_role_label(role: &MessageRole) -> String {
    match role {
        MessageRole::User => "user".to_string(),
        MessageRole::Assistant => "assistant".to_string(),
        MessageRole::Tool => "tool".to_string(),
        MessageRole::System => "system".to_string(),
        MessageRole::Other(other) => other.clone(),
    }
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

impl ConversionPipeline {
    /// Run the full detect → read → validate → write → verify pipeline.
    pub fn convert(
        &self,
        target_alias: &str,
        session_id: &str,
        opts: ConvertOptions,
    ) -> anyhow::Result<ConversionResult> {
        // 1. Resolve target provider.
        let target_provider = self.registry.find_by_alias(target_alias).ok_or_else(|| {
            CasrError::UnknownProviderAlias {
                alias: target_alias.to_string(),
                known_aliases: self.registry.known_aliases(),
            }
        })?;

        info!(
            target = target_provider.name(),
            session_id, "starting conversion"
        );

        let target_detection = target_provider.detect();
        debug!(
            target = target_provider.name(),
            installed = target_detection.installed,
            "target provider detection"
        );
        let mut all_warnings: Vec<String> = Vec::new();
        if !target_detection.installed {
            warn!(
                target = target_provider.name(),
                "target provider CLI not detected; conversion will continue with filesystem-only checks"
            );
            all_warnings.push(format!(
                "Target provider '{}' is not detected as installed. Conversion can still write files, \
but resume may fail until the CLI is installed.",
                target_provider.name()
            ));
        }

        // 2. Resolve source session.
        let source_hint = opts.source_hint.as_deref().map(SourceHint::parse);
        let resolved = self
            .registry
            .resolve_session(session_id, source_hint.as_ref())?;

        debug!(
            source = resolved.provider.name(),
            path = %resolved.path.display(),
            "source session resolved"
        );

        // 3. Read source session into canonical IR.
        let mut canonical = resolved.provider.read_session(&resolved.path)?;
        debug!(
            messages = canonical.messages.len(),
            session_id = canonical.session_id,
            "source session read"
        );

        // 4. Validate.
        let validation = validate_session(&canonical);
        all_warnings.extend(validation.warnings.clone());

        if validation.has_errors() {
            return Err(CasrError::ValidationError {
                errors: validation.errors,
                warnings: validation.warnings,
                info: validation.info,
            }
            .into());
        }

        for note in &validation.info {
            debug!(note, "validation info");
        }

        // 5. Optional synthetic context enrichment.
        if opts.enrich {
            let source_session_id = canonical.session_id.clone();
            let inserted = prepend_enrichment_messages(
                &mut canonical,
                resolved.provider.slug(),
                target_provider.slug(),
                &source_session_id,
            );
            info!(inserted, "applied casr enrichment");
            all_warnings.push(format!(
                "Added {inserted} synthetic context message(s) via --enrich."
            ));
        }

        // 6. Dry-run short-circuit.
        if opts.dry_run {
            info!("dry run — skipping write and verify");
            return Ok(ConversionResult {
                source_provider: resolved.provider.slug().to_string(),
                target_provider: target_provider.slug().to_string(),
                canonical_session: canonical,
                written: None,
                warnings: all_warnings,
            });
        }

        // 7. Same-provider short-circuit.
        if !opts.enrich && resolved.provider.slug() == target_provider.slug() {
            info!("source and target provider are the same — skipping write and verify");
            all_warnings.push(
                "Source and target provider are the same. Skipping conversion write.".to_string(),
            );
            return Ok(ConversionResult {
                source_provider: resolved.provider.slug().to_string(),
                target_provider: target_provider.slug().to_string(),
                canonical_session: canonical.clone(),
                written: Some(WrittenSession {
                    paths: Vec::new(),
                    session_id: canonical.session_id.clone(),
                    resume_command: target_provider.resume_command(&canonical.session_id),
                    backup_path: None,
                }),
                warnings: all_warnings,
            });
        }

        // 7b. Normalize tool-only messages with empty content.
        //
        // Some source formats (notably Codex with `originator: codex_exec`)
        // produce canonical messages that have empty `content` but non-empty
        // `tool_calls` and/or `tool_results`.  Target writers (e.g. Pi-Agent)
        // either synthesize readable content from tool metadata or emit
        // toolCall blocks that the reader flattens into text on read-back.
        // Unless we mirror that synthesis here the read-back verification
        // will see a content mismatch ("wrote 0 bytes, read back N bytes").
        //
        // Fix: materialise the tool-call/result text into `content` on the
        // canonical message itself so that write ↔ readback is consistent.
        for msg in &mut canonical.messages {
            if !msg.content.trim().is_empty() {
                continue;
            }

            let has_tool_calls = !msg.tool_calls.is_empty();
            let has_tool_results = !msg.tool_results.is_empty();

            if !has_tool_calls && !has_tool_results {
                continue;
            }

            let mut parts: Vec<String> = Vec::new();

            // Synthesize text for tool calls (matches Pi reader's format).
            for tc in &msg.tool_calls {
                parts.push(format!("[Tool: {}]", tc.name));
            }

            // Synthesize text for tool results.
            for tr in &msg.tool_results {
                if tr.is_error {
                    parts.push(format!("[Tool Error] {}", tr.content));
                } else {
                    parts.push(format!("[Tool Output] {}", tr.content));
                }
            }

            if !parts.is_empty() {
                msg.content = parts.join("\n");
            }
        }

        // 8. Write to target provider.
        let write_opts = WriteOptions { force: opts.force };
        let written = target_provider.write_session(&canonical, &write_opts)?;
        info!(
            target_session_id = written.session_id,
            resume_command = written.resume_command,
            "session written"
        );

        // 9. Read-back verification.
        if let Some(first_path) = written.paths.first() {
            match target_provider.read_session(first_path) {
                Ok(readback) => {
                    debug!(
                        readback_messages = readback.messages.len(),
                        original_messages = canonical.messages.len(),
                        "read-back verification"
                    );
                    if let Some(detail) = readback_mismatch_detail(&canonical, &readback) {
                        warn!(detail, "read-back verification failed");
                        let rollback_detail =
                            match rollback_written_session(target_provider.slug(), &written) {
                                Ok(()) => "rollback succeeded".to_string(),
                                Err(rollback_error) => {
                                    format!("rollback failed: {rollback_error}")
                                }
                            };
                        return Err(CasrError::VerifyFailed {
                            provider: target_provider.slug().to_string(),
                            written_paths: written.paths.clone(),
                            detail: format!("{detail}; {rollback_detail}"),
                        }
                        .into());
                    }
                }
                Err(e) => {
                    warn!(error = %e, "read-back verification failed");
                    let rollback_detail =
                        match rollback_written_session(target_provider.slug(), &written) {
                            Ok(()) => "rollback succeeded".to_string(),
                            Err(rollback_error) => {
                                format!("rollback failed: {rollback_error}")
                            }
                        };
                    return Err(CasrError::VerifyFailed {
                        provider: target_provider.slug().to_string(),
                        written_paths: written.paths.clone(),
                        detail: format!("unable to read written session: {e}; {rollback_detail}"),
                    }
                    .into());
                }
            }
        }

        Ok(ConversionResult {
            source_provider: resolved.provider.slug().to_string(),
            target_provider: target_provider.slug().to_string(),
            canonical_session: canonical,
            written: Some(written),
            warnings: all_warnings,
        })
    }
}

/// Coarse role bucket used for read-back verification.
///
/// Some target formats (notably Claude Code JSONL) don't distinguish between
/// User, System, Tool, and Other roles — they all become `"user"` entries.
/// When we read back the written session the roles come back as `User`,
/// causing a spurious mismatch against the original `System`/`Tool`/`Other`.
///
/// This function maps every role to a small set of equivalence classes so the
/// verification comparison is tolerant of this expected lossy round-trip.
fn readback_role_bucket(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::Assistant => "assistant",
        // Everything else collapses into the "user" bucket because that is
        // the only non-assistant entry type Claude Code (and similar formats)
        // can represent.
        MessageRole::User | MessageRole::System | MessageRole::Tool | MessageRole::Other(_) => {
            "user"
        }
    }
}

fn readback_mismatch_detail(
    canonical: &CanonicalSession,
    readback: &CanonicalSession,
) -> Option<String> {
    if readback.messages.len() != canonical.messages.len() {
        return Some(format!(
            "message count mismatch: wrote {} messages, read back {}",
            canonical.messages.len(),
            readback.messages.len()
        ));
    }

    for (i, (orig, rb)) in canonical
        .messages
        .iter()
        .zip(readback.messages.iter())
        .enumerate()
    {
        if readback_role_bucket(&orig.role) != readback_role_bucket(&rb.role) {
            return Some(format!(
                "message role mismatch at idx {i}: wrote {:?}, read back {:?}",
                orig.role, rb.role
            ));
        }
        if orig.content != rb.content {
            return Some(format!(
                "message content mismatch at idx {i}: wrote {} bytes, read back {} bytes",
                orig.content.len(),
                rb.content.len()
            ));
        }
    }

    None
}

fn rollback_written_session(
    provider_slug: &str,
    written: &WrittenSession,
) -> Result<(), CasrError> {
    let target_path = written.paths.first().cloned();
    if let Some(path) = &target_path
        && let Some(backup_path) = &written.backup_path
    {
        warn!(
            backup = %backup_path.display(),
            target = %path.display(),
            "restoring backup after verification failure"
        );

        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(CasrError::SessionWriteError {
                    path: path.clone(),
                    provider: provider_slug.to_string(),
                    detail: format!("failed to remove unverified output before restore: {error}"),
                });
            }
        }

        std::fs::rename(backup_path, path).map_err(|error| CasrError::SessionWriteError {
            path: path.clone(),
            provider: provider_slug.to_string(),
            detail: format!("failed to restore backup: {error}"),
        })?;
    }

    for (index, path) in written.paths.iter().enumerate() {
        if index == 0 && written.backup_path.is_some() {
            continue;
        }
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(CasrError::SessionWriteError {
                    path: path.clone(),
                    provider: provider_slug.to_string(),
                    detail: format!("failed to remove unverified output: {error}"),
                });
            }
        }
    }

    if target_path.is_none() && written.backup_path.is_some() {
        return Err(CasrError::SessionWriteError {
            path: written
                .backup_path
                .clone()
                .expect("checked backup_path is_some"),
            provider: provider_slug.to_string(),
            detail: "backup path present but no written target path was recorded".to_string(),
        });
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Atomic file writing
// ---------------------------------------------------------------------------

/// Outcome of a successful atomic write operation.
#[derive(Debug, Clone)]
pub struct AtomicWriteOutcome {
    /// Final destination path.
    pub target_path: PathBuf,
    /// Temp file used during write (already renamed away).
    pub temp_path: PathBuf,
    /// Path to the `.bak` backup of a pre-existing file (if `--force` was used).
    pub backup_path: Option<PathBuf>,
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AtomicWriteFailStage {
    BackupRename,
    TempFileCreate,
    WriteAll,
    Flush,
    SyncAll,
    FinalRename,
}

#[cfg(test)]
thread_local! {
    static ATOMIC_WRITE_FAIL_STAGE: std::cell::Cell<Option<AtomicWriteFailStage>> = const {
        std::cell::Cell::new(None)
    };
}

#[cfg(test)]
fn set_atomic_write_fail_stage(stage: Option<AtomicWriteFailStage>) {
    ATOMIC_WRITE_FAIL_STAGE.with(|slot| slot.set(stage));
}

#[cfg(test)]
fn maybe_inject_atomic_write_failure(stage: AtomicWriteFailStage) -> std::io::Result<()> {
    let injected = ATOMIC_WRITE_FAIL_STAGE.with(|slot| slot.get() == Some(stage));
    if injected {
        return Err(std::io::Error::other(format!(
            "injected atomic_write failure at stage {stage:?}"
        )));
    }
    Ok(())
}

/// Write `content` atomically to `target_path` using temp-then-rename.
///
/// Guarantees: either the old target remains intact, or the new target is
/// fully written and fsynced. Never leaves partial writes.
///
/// Returns `AtomicWriteOutcome` on success, or:
/// - [`CasrError::SessionConflict`] if target exists and `force` is false.
/// - [`CasrError::SessionWriteError`] on I/O failures.
pub fn atomic_write(
    target_path: &Path,
    content: &[u8],
    force: bool,
    provider_slug: &str,
) -> Result<AtomicWriteOutcome, CasrError> {
    use std::io::Write;

    // 1. Create parent directories.
    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CasrError::SessionWriteError {
            path: target_path.to_path_buf(),
            provider: provider_slug.to_string(),
            detail: format!("failed to create parent directories: {e}"),
        })?;
    }

    // 2. Check for existing target.
    let backup_path = if target_path.exists() {
        if !force {
            return Err(CasrError::SessionConflict {
                session_id: String::new(),
                existing_path: target_path.to_path_buf(),
            });
        }
        // Create backup with deterministic de-dupe.
        let bak = find_backup_path(target_path);
        debug!(
            target = %target_path.display(),
            backup = %bak.display(),
            "backing up existing file"
        );
        #[cfg(test)]
        maybe_inject_atomic_write_failure(AtomicWriteFailStage::BackupRename).map_err(|e| {
            CasrError::SessionWriteError {
                path: target_path.to_path_buf(),
                provider: provider_slug.to_string(),
                detail: format!("failed to create backup: {e}"),
            }
        })?;
        std::fs::rename(target_path, &bak).map_err(|e| CasrError::SessionWriteError {
            path: target_path.to_path_buf(),
            provider: provider_slug.to_string(),
            detail: format!("failed to create backup: {e}"),
        })?;
        Some(bak)
    } else {
        None
    };

    // 3. Write to temp file in the same directory.
    let temp_name = format!(".casr-tmp-{}", uuid::Uuid::new_v4().as_hyphenated());
    let temp_path = target_path
        .parent()
        .unwrap_or(Path::new("."))
        .join(&temp_name);

    let write_result = (|| -> Result<(), std::io::Error> {
        #[cfg(test)]
        maybe_inject_atomic_write_failure(AtomicWriteFailStage::TempFileCreate)?;
        let mut file = std::fs::File::create(&temp_path)?;
        #[cfg(test)]
        maybe_inject_atomic_write_failure(AtomicWriteFailStage::WriteAll)?;
        file.write_all(content)?;
        #[cfg(test)]
        maybe_inject_atomic_write_failure(AtomicWriteFailStage::Flush)?;
        file.flush()?;
        #[cfg(test)]
        maybe_inject_atomic_write_failure(AtomicWriteFailStage::SyncAll)?;
        file.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_result {
        // Cleanup temp file on write failure.
        let _ = std::fs::remove_file(&temp_path);
        // Restore backup if we made one.
        if let Some(ref bak) = backup_path {
            warn!(
                backup = %bak.display(),
                target = %target_path.display(),
                "restoring backup after write failure"
            );
            let _ = std::fs::rename(bak, target_path);
        }
        return Err(CasrError::SessionWriteError {
            path: target_path.to_path_buf(),
            provider: provider_slug.to_string(),
            detail: format!("failed to write temp file: {e}"),
        });
    }

    // 4. Atomic rename temp -> target.
    #[cfg(test)]
    if let Err(e) = maybe_inject_atomic_write_failure(AtomicWriteFailStage::FinalRename) {
        let _ = std::fs::remove_file(&temp_path);
        if let Some(ref bak) = backup_path {
            warn!(
                backup = %bak.display(),
                target = %target_path.display(),
                "restoring backup after rename failure"
            );
            let _ = std::fs::rename(bak, target_path);
        }
        return Err(CasrError::SessionWriteError {
            path: target_path.to_path_buf(),
            provider: provider_slug.to_string(),
            detail: format!("failed to rename temp file to target: {e}"),
        });
    }

    if let Err(e) = std::fs::rename(&temp_path, target_path) {
        let _ = std::fs::remove_file(&temp_path);
        if let Some(ref bak) = backup_path {
            warn!(
                backup = %bak.display(),
                target = %target_path.display(),
                "restoring backup after rename failure"
            );
            let _ = std::fs::rename(bak, target_path);
        }
        return Err(CasrError::SessionWriteError {
            path: target_path.to_path_buf(),
            provider: provider_slug.to_string(),
            detail: format!("failed to rename temp file to target: {e}"),
        });
    }

    info!(target = %target_path.display(), "atomic write complete");

    Ok(AtomicWriteOutcome {
        target_path: target_path.to_path_buf(),
        temp_path,
        backup_path,
    })
}

/// Restore a backup after a verification failure.
///
/// Removes the broken target and renames the backup back into place.
pub fn restore_backup(outcome: &AtomicWriteOutcome, provider_slug: &str) -> Result<(), CasrError> {
    if let Some(ref bak) = outcome.backup_path {
        warn!(
            backup = %bak.display(),
            target = %outcome.target_path.display(),
            "restoring backup after verification failure"
        );
        let _ = std::fs::remove_file(&outcome.target_path);
        std::fs::rename(bak, &outcome.target_path).map_err(|e| CasrError::SessionWriteError {
            path: outcome.target_path.clone(),
            provider: provider_slug.to_string(),
            detail: format!("failed to restore backup: {e}"),
        })?;
    } else {
        // No backup: just remove the broken target.
        let _ = std::fs::remove_file(&outcome.target_path);
    }
    Ok(())
}

/// Find an available backup path, deduplicating with `.bak`, `.bak.1`, `.bak.2`, etc.
fn find_backup_path(target: &Path) -> PathBuf {
    let mut filename = target.file_name().unwrap_or_default().to_os_string();
    filename.push(".bak");
    let bak = target.with_file_name(&filename);
    if !bak.exists() {
        return bak;
    }
    for i in 1..100 {
        let mut numbered = filename.clone();
        numbered.push(format!(".{i}"));
        let numbered_path = target.with_file_name(numbered);
        if !numbered_path.exists() {
            return numbered_path;
        }
    }
    // Fallback: use random suffix.
    let mut random = filename;
    random.push(format!(".{}", uuid::Uuid::new_v4().as_hyphenated()));
    target.with_file_name(random)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::{Path, PathBuf},
    };

    fn sample_message(idx: usize, role: MessageRole, content: &str) -> CanonicalMessage {
        CanonicalMessage {
            idx,
            role,
            content: content.to_string(),
            timestamp: Some(1_700_000_000_000 + idx as i64),
            author: None,
            tool_calls: Vec::new(),
            tool_results: Vec::new(),
            extra: serde_json::Value::Null,
        }
    }

    fn sample_session() -> CanonicalSession {
        CanonicalSession {
            session_id: "src-123".to_string(),
            provider_slug: "codex".to_string(),
            workspace: Some(PathBuf::from("/tmp/workspace")),
            title: Some("Example".to_string()),
            started_at: Some(1_700_000_000_000),
            ended_at: Some(1_700_000_010_000),
            messages: vec![
                sample_message(
                    0,
                    MessageRole::User,
                    "Investigate parser behavior in providers/codex.rs",
                ),
                sample_message(
                    1,
                    MessageRole::Assistant,
                    "I found a mismatch in response_item handling; I will patch it.",
                ),
                sample_message(
                    2,
                    MessageRole::User,
                    "Please also verify resume command compatibility.",
                ),
            ],
            metadata: serde_json::Value::Null,
            source_path: PathBuf::from("/tmp/source.jsonl"),
            model_name: Some("gpt-5-codex".to_string()),
        }
    }

    #[test]
    fn enrich_prepends_marked_synthetic_messages() {
        let mut session = sample_session();
        let original_len = session.messages.len();

        let inserted = prepend_enrichment_messages(&mut session, "codex", "claude-code", "src-123");

        assert_eq!(inserted, 2);
        assert_eq!(session.messages.len(), original_len + 2);
        assert_eq!(session.messages[0].role, MessageRole::System);
        assert_eq!(session.messages[1].role, MessageRole::System);
        assert!(
            session.messages[0]
                .content
                .contains("[casr synthetic context]")
        );
        assert!(
            session.messages[1]
                .content
                .contains("Recent conversation snapshot")
        );
        assert_eq!(
            session.messages[0]
                .extra
                .get("casr_enrichment")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            session.messages[1]
                .extra
                .get("enrichment_type")
                .and_then(|v| v.as_str()),
            Some("recent_summary")
        );

        for (idx, msg) in session.messages.iter().enumerate() {
            assert_eq!(msg.idx, idx);
        }
    }

    #[test]
    fn recent_summary_is_deterministic_and_compact() {
        let mut session = sample_session();
        session.messages.push(sample_message(
            3,
            MessageRole::Assistant,
            "   This    has  extra   spacing\nand line breaks that should compact cleanly.   ",
        ));

        let (count, summary) = build_recent_summary(&session, 2, 40);
        assert_eq!(count, 2);
        assert!(summary.contains("- user: Please also verify resume command"));
        assert!(summary.contains("- assistant: This has extra spacing"));
        assert!(summary.contains("..."));
    }

    struct FailStageReset;

    impl Drop for FailStageReset {
        fn drop(&mut self) {
            set_atomic_write_fail_stage(None);
        }
    }

    fn with_fail_stage(stage: AtomicWriteFailStage) -> FailStageReset {
        set_atomic_write_fail_stage(Some(stage));
        FailStageReset
    }

    fn count_temp_artifacts(dir: &Path) -> usize {
        fs::read_dir(dir)
            .expect("read temp dir")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".casr-tmp-")
            })
            .count()
    }

    fn backup_artifacts_for(target: &Path) -> Vec<PathBuf> {
        let parent = target.parent().expect("target parent");
        let prefix = format!(
            "{}.bak",
            target
                .file_name()
                .expect("target file name")
                .to_string_lossy()
        );
        fs::read_dir(parent)
            .expect("read parent")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().starts_with(&prefix))
                    .unwrap_or(false)
            })
            .collect()
    }

    #[test]
    fn atomic_write_conflict_without_force_returns_session_conflict() {
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let target = tmp.path().join("session.jsonl");
        fs::write(&target, "existing").expect("seed target");

        let err =
            atomic_write(&target, b"new content", false, "test").expect_err("should conflict");
        assert!(matches!(err, CasrError::SessionConflict { .. }));
        assert_eq!(
            fs::read_to_string(&target).expect("target should remain"),
            "existing"
        );
    }

    #[test]
    fn atomic_write_failure_matrix_restores_backup_and_cleans_temp_files() {
        for stage in [
            AtomicWriteFailStage::TempFileCreate,
            AtomicWriteFailStage::WriteAll,
            AtomicWriteFailStage::Flush,
            AtomicWriteFailStage::SyncAll,
            AtomicWriteFailStage::FinalRename,
        ] {
            let tmp = tempfile::TempDir::new().expect("tempdir");
            let target = tmp.path().join("session.jsonl");
            fs::write(&target, "original").expect("seed target");

            let _reset = with_fail_stage(stage);
            let err =
                atomic_write(&target, b"new content", true, "test").expect_err("expected failure");
            assert!(
                matches!(err, CasrError::SessionWriteError { .. }),
                "expected SessionWriteError for stage {stage:?}, got {err:?}"
            );

            assert_eq!(
                fs::read_to_string(&target).expect("target should be restored"),
                "original",
                "original content should be restored for stage {stage:?}"
            );
            assert_eq!(
                count_temp_artifacts(tmp.path()),
                0,
                "no temp artifacts should remain for stage {stage:?}"
            );
            assert!(
                backup_artifacts_for(&target).is_empty(),
                "backup artifacts should not remain for stage {stage:?}"
            );
        }
    }

    #[test]
    fn atomic_write_backup_creation_failure_preserves_original_target() {
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let target = tmp.path().join("session.jsonl");
        fs::write(&target, "original").expect("seed target");

        let _reset = with_fail_stage(AtomicWriteFailStage::BackupRename);
        let err =
            atomic_write(&target, b"new content", true, "test").expect_err("expected failure");
        let CasrError::SessionWriteError { detail, .. } = err else {
            panic!("expected SessionWriteError, got {err:?}");
        };
        assert!(
            detail.contains("failed to create backup"),
            "unexpected detail: {detail}"
        );

        assert_eq!(
            fs::read_to_string(&target).expect("target should remain"),
            "original"
        );
        assert_eq!(count_temp_artifacts(tmp.path()), 0);
        assert!(backup_artifacts_for(&target).is_empty());
    }

    #[test]
    fn atomic_write_success_force_creates_backup_and_restore_backup_recovers_original() {
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let target = tmp.path().join("session.jsonl");
        fs::write(&target, "original").expect("seed target");

        let outcome = atomic_write(&target, b"new content", true, "test")
            .expect("force write should succeed");
        assert_eq!(
            fs::read_to_string(&target).expect("target should contain new content"),
            "new content"
        );
        assert!(
            !outcome.temp_path.exists(),
            "temp file should be renamed away"
        );

        let backup = outcome.backup_path.as_ref().expect("backup should exist");
        assert_eq!(
            fs::read_to_string(backup).expect("backup should contain original"),
            "original"
        );

        restore_backup(&outcome, "test").expect("restore should succeed");
        assert_eq!(
            fs::read_to_string(&target).expect("target should be restored"),
            "original"
        );
        assert!(!backup.exists(), "backup should be consumed during restore");
    }

    #[test]
    fn restore_backup_without_backup_removes_target() {
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let target = tmp.path().join("session.jsonl");

        let outcome = atomic_write(&target, b"fresh content", false, "test")
            .expect("initial write should succeed");
        assert!(target.exists(), "target should exist after write");
        assert!(outcome.backup_path.is_none(), "no backup expected");

        restore_backup(&outcome, "test").expect("restore should succeed without backup");
        assert!(
            !target.exists(),
            "target should be removed when no backup is available"
        );
    }
}
