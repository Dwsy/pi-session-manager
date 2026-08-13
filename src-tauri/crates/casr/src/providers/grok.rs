//! Grok Build provider — reads xAI's official `grok` CLI sessions under
//! `$GROK_HOME/sessions/` (default `~/.grok/sessions/`).
//!
//! Grok Build is xAI's official terminal coding agent (installed from
//! `x.ai/cli` to `~/.grok/bin/grok`). It stores each session in its own
//! directory, grouped by percent-encoded working directory:
//!
//! ```text
//! $GROK_HOME/sessions/<percent-encoded-cwd>/<session-uuid>/
//!   summary.json       ← metadata: id, cwd, title, timestamps, model, counts
//!   updates.jsonl      ← ACP session-update stream (authoritative log)
//!   chat_history.jsonl ← raw chat messages sent to the model
//!   plan.json, events.jsonl, rewind_points.jsonl, …  (ignored)
//! $GROK_HOME/sessions/<percent-encoded-cwd>/prompt_history.jsonl  (ignored)
//! $GROK_HOME/sessions/session_search.sqlite                       (ignored)
//! ```
//!
//! The CLI's bundled docs (`~/.grok/docs/user-guide/17-sessions.md`) state
//! that `updates.jsonl` "is the authoritative conversation log that drives
//! `/resume` and session restore", so it is the read source here;
//! `summary.json` supplies metadata.
//!
//! ## `updates.jsonl` line envelope (empirical, grok 0.2.103 + 0.2.118)
//!
//! ```json
//! {"timestamp": 1784388059,
//!  "method": "session/update",             // or "_x.ai/session/update"
//!  "params": {
//!    "sessionId": "<uuid>",
//!    "update": {"sessionUpdate": "<kind>", …},
//!    "_meta": {"eventId": "…", "agentTimestampMs": 1784388056266,
//!              "promptId": "…", …}}}
//! ```
//!
//! Some lines carry `_meta` inside `update` instead (observed:
//! `user_message_chunk` had `update._meta.modelId` / `promptIndex`), so both
//! locations are consulted. `sessionUpdate` kinds are the Agent Client
//! Protocol standard set (`user_message_chunk`, `agent_message_chunk`,
//! `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`) plus x.ai
//! extensions observed empirically (`hook_execution`, `retry_state`,
//! `task_backgrounded`, `task_completed`, `turn_completed`, `session_recap`).
//! Unknown kinds are skipped tolerantly. Chunk kinds are streaming fragments;
//! consecutive same-kind chunks are coalesced into a single message, with a
//! coalescing break whenever the line's prompt marker changes
//! (`params._meta.promptId`, or `update._meta.promptIndex` for user chunks) —
//! chunks of one streamed message always share their prompt marker in real
//! sessions, so a marker change means a new message even without an
//! intervening kind change.
//!
//! All shapes above — including `agent_message_chunk`, `agent_thought_chunk`,
//! `tool_call` (with `rawInput` and `_meta["x.ai/tool"]`), and
//! `tool_call_update` (with `status`, `content`, `rawOutput`) — were captured
//! verbatim from real grok 0.2.103/0.2.118 sessions on disk.
//!
//! ## Write support
//!
//! [`Provider::write_session`] synthesizes a native session tree —
//! `updates.jsonl` (the authoritative log) plus `summary.json` (the index
//! entry) under a fresh UUIDv7 in the percent-encoded-cwd group — and was
//! round-trip verified against a live `grok --resume` (grok 0.2.118): the CLI
//! lists the synthesized session (`grok sessions list`), renders its full
//! transcript (`grok export <id>`), and restores its conversation context on
//! `grok -p … -r <id>` (the model answered from facts present only in the
//! synthesized history). `chat_history.jsonl` is intentionally NOT written:
//! resume was verified to rebuild model context from `updates.jsonl` alone,
//! and real `chat_history.jsonl` entries contain provider-encrypted reasoning
//! blobs casr cannot synthesize.
//!
//! Lossiness on write: Grok's update stream has no system/tool message kind,
//! so non-user, non-assistant roles are written as `user_message_chunk` lines
//! (content preserved; role collapses to "user" on read-back, matching the
//! pipeline's role-bucket verification).
//!
//! ## Resume
//!
//! ```bash
//! grok --resume <session-id>
//! ```

use std::path::{Path, PathBuf};

use tracing::{debug, info, trace};

use crate::discovery::DetectionResult;
use crate::model::{CanonicalMessage, CanonicalSession, MessageRole, ToolCall, ToolResult, flatten_content, parse_timestamp, reindex_messages, truncate_title};
use crate::providers::{Provider, WriteOptions, WrittenSession};

/// Provider slug used in canonical metadata.
const SLUG: &str = "grok";

/// Model id stamped into written sessions when the source model is not a
/// Grok model. `summary.json.current_model_id` is REQUIRED for
/// `grok --resume <id>` to load a session (live-bisected on grok 0.2.118:
/// without it the CLI reports "Session does not exist"), and a foreign model
/// id would confuse resume-time model selection. The CLI tolerates historical
/// model ids in old sessions, so a point-in-time default is safe.
const DEFAULT_MODEL_ID: &str = "grok-4.5";

/// Grok Build provider implementation.
pub struct Grok;

impl Grok {
    /// Root directory for Grok Build data. Respects the `GROK_HOME` env
    /// override (documented by the CLI), otherwise defaults to `~/.grok`.
    fn home_dir() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("GROK_HOME") {
            let trimmed = home.trim();
            if !trimmed.is_empty() {
                return Some(PathBuf::from(trimmed));
            }
        }
        dirs::home_dir().map(|h| h.join(".grok"))
    }

    /// The sessions root: `<home>/sessions`.
    fn sessions_root() -> Option<PathBuf> {
        Self::home_dir().map(|h| h.join("sessions"))
    }

    /// Enumerate `(session_id, updates.jsonl path)` for every session
    /// directory under the configured sessions root.
    fn list_all_sessions() -> Vec<(String, PathBuf)> {
        let Some(root) = Self::sessions_root() else {
            return vec![];
        };
        list_sessions_in(&root)
    }
}

/// Enumerate `(session_id, updates.jsonl path)` under a sessions root.
///
/// Layout: `<root>/<percent-encoded-cwd>/<session-uuid>/updates.jsonl`.
/// Group-level files (`prompt_history.jsonl`) and root-level files
/// (`session_search.sqlite`) are ignored because only directories two levels
/// deep containing an `updates.jsonl` qualify.
fn list_sessions_in(root: &Path) -> Vec<(String, PathBuf)> {
    if !root.is_dir() {
        return vec![];
    }
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    for group in std::fs::read_dir(root).into_iter().flatten().flatten() {
        let group_path = group.path();
        if !group_path.is_dir() {
            continue; // e.g. session_search.sqlite
        }
        for session in std::fs::read_dir(&group_path).into_iter().flatten().flatten() {
            let session_dir = session.path();
            if !session_dir.is_dir() {
                continue; // e.g. prompt_history.jsonl
            }
            let updates = session_dir.join("updates.jsonl");
            if !updates.is_file() {
                continue;
            }
            let Some(id) = session_dir.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if id.is_empty() {
                continue;
            }
            out.push((id.to_string(), updates));
        }
    }
    out
}

/// Decode a percent-encoded cwd group directory name back to a path.
///
/// Prefers a `.cwd` file inside the group directory (written by the CLI when
/// the encoded name would exceed 255 bytes), then percent-decoding the name.
fn decode_group_cwd(group_dir: &Path) -> Option<PathBuf> {
    let cwd_file = group_dir.join(".cwd");
    if cwd_file.is_file()
        && let Ok(content) = std::fs::read_to_string(&cwd_file)
    {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    let name = group_dir.file_name()?.to_str()?;
    let decoded = urlencoding::decode(name).ok()?;
    if decoded.is_empty() {
        return None;
    }
    Some(PathBuf::from(decoded.into_owned()))
}

/// The kind of streaming message currently being accumulated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChunkKind {
    User,
    Thought,
    Agent,
}

/// Extract the best-precision timestamp (epoch millis) from an update line.
///
/// Prefers `_meta.agentTimestampMs` (params-level, then update-level), then
/// the outer envelope `timestamp` (epoch seconds).
fn line_timestamp(line: &serde_json::Value, update: &serde_json::Value) -> Option<i64> {
    line.pointer("/params/_meta/agentTimestampMs").and_then(parse_timestamp).or_else(|| update.pointer("/_meta/agentTimestampMs").and_then(parse_timestamp)).or_else(|| line.get("timestamp").and_then(parse_timestamp))
}

/// Extract the prompt marker used to detect message boundaries between
/// consecutive same-kind chunks.
///
/// Agent-side lines carry `params._meta.promptId` (one UUID per user prompt /
/// streamed reply); user chunks carry `update._meta.promptIndex` instead.
/// Chunks of one streamed message always share their marker, so a marker
/// change between consecutive message-bearing lines means a new message.
/// Lines without either marker return `None` (no boundary inferred).
fn boundary_key(line: &serde_json::Value, update: &serde_json::Value) -> Option<String> {
    if let Some(id) = line.pointer("/params/_meta/promptId").and_then(|v| v.as_str()) {
        return Some(format!("pid:{id}"));
    }
    if let Some(idx) = update.pointer("/_meta/promptIndex") {
        if let Some(n) = idx.as_i64() {
            return Some(format!("pi:{n}"));
        }
        if let Some(s) = idx.as_str() {
            return Some(format!("pi:{s}"));
        }
    }
    None
}

/// Flatten an ACP `ToolCallContent` array (from `tool_call` /
/// `tool_call_update` `content`) into a display string.
///
/// Variants per the ACP schema: `{"type":"content","content":<ContentBlock>}`,
/// `{"type":"diff","path":…,…}`, `{"type":"terminal",…}`.
fn flatten_tool_content(value: &serde_json::Value) -> String {
    let Some(items) = value.as_array() else {
        return flatten_content(value);
    };
    let mut parts: Vec<String> = Vec::new();
    for item in items {
        match item.get("type").and_then(|v| v.as_str()) {
            Some("content") => {
                if let Some(block) = item.get("content") {
                    let text = flatten_content(block);
                    if !text.is_empty() {
                        parts.push(text);
                    }
                }
            }
            Some("diff") => {
                let path = item.get("path").and_then(|v| v.as_str()).unwrap_or("file");
                parts.push(format!("[Diff: {path}]"));
            }
            Some("terminal") => parts.push("[Terminal output]".to_string()),
            _ => {
                let text = flatten_content(item);
                if !text.is_empty() {
                    parts.push(text);
                }
            }
        }
    }
    parts.join("\n")
}

/// Render a tool result string from a `tool_call` / `tool_call_update` event:
/// prefer `content`, fall back to `rawOutput`.
fn tool_output_text(update: &serde_json::Value) -> Option<String> {
    if let Some(content) = update.get("content") {
        let text = flatten_tool_content(content);
        if !text.trim().is_empty() {
            return Some(text);
        }
    }
    match update.get("rawOutput") {
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
        Some(serde_json::Value::Null) | None => None,
        Some(other) => {
            let text = flatten_content(other);
            if !text.trim().is_empty() { Some(text) } else { serde_json::to_string(other).ok() }
        }
    }
}

/// Streaming parser state that folds ACP session-update events into
/// canonical messages, coalescing consecutive same-kind chunks.
#[derive(Default)]
struct MessageBuilder {
    messages: Vec<CanonicalMessage>,
    /// Kind of the message currently being extended (None after a break).
    last_kind: Option<ChunkKind>,
    /// `toolCallId` → index into `messages` holding that tool call.
    tool_call_owner: std::collections::HashMap<String, usize>,
}

impl MessageBuilder {
    fn push_new(&mut self, kind: ChunkKind, msg: CanonicalMessage) {
        self.messages.push(msg);
        self.last_kind = Some(kind);
    }

    /// Append a streaming chunk, coalescing with the previous message when it
    /// has the same kind.
    fn push_chunk(&mut self, kind: ChunkKind, text: &str, ts: Option<i64>, author: Option<String>) {
        if self.last_kind == Some(kind)
            && let Some(last) = self.messages.last_mut()
        {
            last.content.push_str(text);
            if last.timestamp.is_none() {
                last.timestamp = ts;
            }
            if last.author.is_none() {
                last.author = author;
            }
            return;
        }
        let role = match kind {
            ChunkKind::User => MessageRole::User,
            ChunkKind::Thought | ChunkKind::Agent => MessageRole::Assistant,
        };
        let author = match kind {
            ChunkKind::Thought => author.or_else(|| Some("reasoning".to_string())),
            _ => author,
        };
        let extra = serde_json::json!({ "sessionUpdate": chunk_kind_label(kind) });
        self.push_new(kind, CanonicalMessage { idx: 0, role, content: text.to_string(), timestamp: ts, author, tool_calls: Vec::new(), tool_results: Vec::new(), extra });
    }

    /// Record a `tool_call` event. Attaches to the in-progress assistant
    /// message when one is open, otherwise starts a new assistant message.
    fn push_tool_call(&mut self, update: &serde_json::Value, ts: Option<i64>) {
        let call = ToolCall {
            id: update.get("toolCallId").and_then(|v| v.as_str()).map(String::from),
            name: update.get("title").and_then(|v| v.as_str()).or_else(|| update.get("kind").and_then(|v| v.as_str())).unwrap_or("unknown").to_string(),
            arguments: update.get("rawInput").cloned().unwrap_or(serde_json::Value::Null),
        };
        let call_id = call.id.clone();

        let target_idx = if self.last_kind == Some(ChunkKind::Agent) && !self.messages.is_empty() {
            self.messages.len() - 1
        } else {
            self.push_new(ChunkKind::Agent, CanonicalMessage { idx: 0, role: MessageRole::Assistant, content: String::new(), timestamp: ts, author: None, tool_calls: Vec::new(), tool_results: Vec::new(), extra: serde_json::json!({ "sessionUpdate": "tool_call" }) });
            self.messages.len() - 1
        };

        self.messages[target_idx].tool_calls.push(call);
        if let Some(id) = call_id {
            self.tool_call_owner.insert(id, target_idx);
        }

        // A completed tool_call event may already carry output.
        self.apply_tool_outcome(target_idx, update);
    }

    /// Record a `tool_call_update` event: merge into the owning message's tool
    /// call, and surface output as a tool result when present. Updates for
    /// unknown call ids (e.g. a truncated log) create a fresh tool call so the
    /// activity is not silently dropped.
    fn push_tool_call_update(&mut self, update: &serde_json::Value, ts: Option<i64>) {
        let call_id = update.get("toolCallId").and_then(|v| v.as_str());
        let owner = call_id.and_then(|id| self.tool_call_owner.get(id).copied());
        match owner {
            Some(idx) => {
                // Merge late-arriving fields into the recorded call.
                if let Some(id) = call_id
                    && let Some(call) = self.messages[idx].tool_calls.iter_mut().find(|c| c.id.as_deref() == Some(id))
                {
                    if let Some(title) = update.get("title").and_then(|v| v.as_str())
                        && !title.is_empty()
                    {
                        call.name = title.to_string();
                    }
                    if let Some(raw_input) = update.get("rawInput")
                        && !raw_input.is_null()
                    {
                        call.arguments = raw_input.clone();
                    }
                }
                self.apply_tool_outcome(idx, update);
            }
            None => self.push_tool_call(update, ts),
        }
    }

    /// If the event carries output (or a failed status), attach a tool result
    /// to the message at `idx`.
    fn apply_tool_outcome(&mut self, idx: usize, update: &serde_json::Value) {
        let status = update.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let is_error = status == "failed";
        let output = tool_output_text(update);
        if output.is_none() && !is_error {
            return;
        }
        let call_id = update.get("toolCallId").and_then(|v| v.as_str()).map(String::from);
        let msg = &mut self.messages[idx];
        // Replace an earlier partial result for the same call (streamed
        // tool_call_update events supersede one another).
        msg.tool_results.retain(|r| r.call_id.is_none() || r.call_id != call_id);
        msg.tool_results.push(ToolResult { call_id, content: output.unwrap_or_default(), is_error });
    }

    /// Finish: drop messages that carry no content and no tool activity.
    fn finish(mut self) -> Vec<CanonicalMessage> {
        self.messages.retain(|m| !m.content.trim().is_empty() || !m.tool_calls.is_empty() || !m.tool_results.is_empty());
        reindex_messages(&mut self.messages);
        self.messages
    }
}

fn chunk_kind_label(kind: ChunkKind) -> &'static str {
    match kind {
        ChunkKind::User => "user_message_chunk",
        ChunkKind::Thought => "agent_thought_chunk",
        ChunkKind::Agent => "agent_message_chunk",
    }
}

/// Resolve the path casr was handed to the session's `updates.jsonl`.
///
/// Accepts the `updates.jsonl` itself, a sibling session file
/// (`summary.json`, `chat_history.jsonl`, …), or the session directory.
fn resolve_updates_path(path: &Path) -> PathBuf {
    if path.is_dir() {
        return path.join("updates.jsonl");
    }
    match path.file_name().and_then(|n| n.to_str()) {
        Some("updates.jsonl") => path.to_path_buf(),
        Some(_) => path.parent().map(|p| p.join("updates.jsonl")).unwrap_or_else(|| path.to_path_buf()),
        None => path.to_path_buf(),
    }
}

impl Provider for Grok {
    fn name(&self) -> &str {
        "Grok Build"
    }

    fn slug(&self) -> &str {
        SLUG
    }

    fn cli_alias(&self) -> &str {
        "grk"
    }

    fn detect(&self) -> DetectionResult {
        let mut evidence = Vec::new();
        let mut installed = false;

        if which::which("grok").is_ok() {
            evidence.push("grok binary found in PATH".to_string());
            installed = true;
        }

        if let Some(home) = Self::home_dir() {
            // The official installer places the binary at ~/.grok/bin/grok.
            let bin = home.join("bin").join("grok");
            if bin.is_file() {
                evidence.push(format!("{} exists", bin.display()));
                installed = true;
            }
            let sessions = home.join("sessions");
            if sessions.is_dir() {
                evidence.push(format!("sessions directory found: {}", sessions.display()));
                installed = true;
            }
        }

        trace!(provider = SLUG, ?evidence, installed, "detection");
        DetectionResult { installed, version: None, evidence }
    }

    fn session_roots(&self) -> Vec<PathBuf> {
        let Some(root) = Self::sessions_root() else {
            return vec![];
        };
        if root.is_dir() { vec![root] } else { vec![] }
    }

    fn list_sessions(&self) -> Option<Vec<(String, PathBuf)>> {
        Some(Self::list_all_sessions())
    }

    fn owns_session(&self, session_id: &str) -> Option<PathBuf> {
        let root = Self::sessions_root()?;
        if !root.is_dir() {
            return None;
        }

        // Fast path: direct `<group>/<session_id>/updates.jsonl` probe.
        for group in std::fs::read_dir(&root).into_iter().flatten().flatten() {
            let group_path = group.path();
            if !group_path.is_dir() {
                continue;
            }
            let candidate = group_path.join(session_id).join("updates.jsonl");
            if candidate.is_file() {
                debug!(path = %candidate.display(), session_id, "found Grok session");
                return Some(candidate);
            }
        }

        // Case-insensitive fallback (UUIDs are conventionally lowercase).
        let lc = session_id.to_ascii_lowercase();
        for (id, path) in Self::list_all_sessions() {
            if id.to_ascii_lowercase() == lc {
                debug!(path = %path.display(), session_id, "found Grok session (case-insensitive)");
                return Some(path);
            }
        }
        None
    }

    fn read_session(&self, path: &Path) -> anyhow::Result<CanonicalSession> {
        debug!(path = %path.display(), "reading Grok session");

        let updates_path = resolve_updates_path(path);
        let session_dir = updates_path.parent().map(Path::to_path_buf).ok_or_else(|| anyhow::anyhow!("cannot determine Grok session directory"))?;

        // ------------------------------------------------------------------
        // summary.json → metadata
        // ------------------------------------------------------------------
        let summary: Option<serde_json::Value> = std::fs::read_to_string(session_dir.join("summary.json")).ok().and_then(|c| serde_json::from_str(&c).ok());

        let session_id = summary.as_ref().and_then(|s| s.pointer("/info/id")).and_then(|v| v.as_str()).map(String::from).or_else(|| session_dir.file_name().and_then(|n| n.to_str()).map(String::from)).unwrap_or_else(|| "unknown".to_string());

        let workspace = summary.as_ref().and_then(|s| s.pointer("/info/cwd")).and_then(|v| v.as_str()).map(PathBuf::from).or_else(|| session_dir.parent().and_then(decode_group_cwd));

        let model_name = summary.as_ref().and_then(|s| s.get("current_model_id")).and_then(|v| v.as_str()).map(String::from);

        // ------------------------------------------------------------------
        // updates.jsonl → messages
        // ------------------------------------------------------------------
        let mut builder = MessageBuilder::default();
        let mut started_at: Option<i64> = None;
        let mut ended_at: Option<i64> = None;
        // Prompt marker of the previous message-bearing line (see
        // `boundary_key`); a change breaks chunk coalescing.
        let mut last_boundary: Option<String> = None;

        if updates_path.is_file() {
            let content = std::fs::read_to_string(&updates_path).map_err(|e| anyhow::anyhow!("failed to read {}: {e}", updates_path.display()))?;

            for (i, line) in content.lines().enumerate() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let Ok(val): Result<serde_json::Value, _> = serde_json::from_str(line) else {
                    trace!(line = i, "skipping malformed Grok updates line");
                    continue;
                };

                // Envelope: {"params":{"update":{…}}}; tolerate a bare
                // {"update":{…}} or a naked SessionUpdate object.
                let update = val.pointer("/params/update").or_else(|| val.get("update")).unwrap_or(&val);
                let Some(kind) = update.get("sessionUpdate").and_then(|v| v.as_str()) else {
                    continue;
                };

                let ts = line_timestamp(&val, update);
                if let Some(t) = ts {
                    started_at = Some(started_at.map_or(t, |s: i64| s.min(t)));
                    ended_at = Some(ended_at.map_or(t, |e: i64| e.max(t)));
                }

                // Message-bearing kinds participate in boundary tracking:
                // a prompt-marker change starts a new message even when the
                // chunk kind stays the same (e.g. two consecutive prompts).
                if matches!(kind, "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk" | "tool_call") {
                    let key = boundary_key(&val, update);
                    if key != last_boundary {
                        builder.last_kind = None;
                    }
                    last_boundary = key;
                }

                match kind {
                    "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk" => {
                        let chunk_kind = match kind {
                            "user_message_chunk" => ChunkKind::User,
                            "agent_thought_chunk" => ChunkKind::Thought,
                            _ => ChunkKind::Agent,
                        };
                        let text = update.get("content").map(flatten_content).unwrap_or_default();
                        // Model id may ride in update-level _meta.
                        let author = if chunk_kind == ChunkKind::Agent { update.pointer("/_meta/modelId").and_then(|v| v.as_str()).map(String::from).or_else(|| model_name.clone()) } else { None };
                        if text.is_empty() {
                            continue;
                        }
                        builder.push_chunk(chunk_kind, &text, ts, author);
                    }
                    "tool_call" => builder.push_tool_call(update, ts),
                    "tool_call_update" => builder.push_tool_call_update(update, ts),
                    // Known non-conversation kinds (plan/TODO state, hook runs,
                    // retry telemetry) and any future/unknown kinds are skipped.
                    _ => {
                        trace!(kind, line = i, "skipping non-conversation Grok update");
                    }
                }
            }
        } else {
            debug!(
                updates = %updates_path.display(),
                "no updates.jsonl found; Grok session has no readable transcript"
            );
        }

        let messages = builder.finish();

        // ------------------------------------------------------------------
        // Metadata assembly
        // ------------------------------------------------------------------
        let title = summary
            .as_ref()
            .and_then(|s| s.get("generated_title"))
            .and_then(|v| v.as_str())
            .filter(|t| !t.trim().is_empty())
            .map(String::from)
            .or_else(|| summary.as_ref().and_then(|s| s.get("session_summary")).and_then(|v| v.as_str()).filter(|t| !t.trim().is_empty()).map(String::from))
            .or_else(|| messages.iter().find(|m| m.role == MessageRole::User).map(|m| truncate_title(&m.content, 100)));

        // Summary timestamps take precedence over message-derived bounds.
        if let Some(s) = summary.as_ref() {
            if let Some(t) = s.get("created_at").and_then(parse_timestamp) {
                started_at = Some(t);
            }
            if let Some(t) = s.get("last_active_at").and_then(parse_timestamp).or_else(|| s.get("updated_at").and_then(parse_timestamp)) {
                ended_at = Some(t);
            }
        }

        let mut metadata = serde_json::Map::new();
        metadata.insert("source".into(), serde_json::Value::String(SLUG.into()));
        metadata.insert("sessionId".into(), serde_json::Value::String(session_id.clone()));
        if let Some(s) = summary.as_ref() {
            if let Some(t) = s.get("generated_title").and_then(|v| v.as_str())
                && !t.trim().is_empty()
            {
                metadata.insert(crate::model::NATIVE_NAME_META_KEY.into(), serde_json::Value::String(t.to_string()));
            }
            for key in ["agent_name", "sandbox_profile", "parent_session_id"] {
                if let Some(v) = s.get(key)
                    && !v.is_null()
                {
                    metadata.insert(key.into(), v.clone());
                }
            }
            // Preserve the full summary for round-trip fidelity.
            metadata.insert("summary".into(), s.clone());
        }
        if let Some(m) = model_name.as_ref() {
            metadata.insert("model".into(), serde_json::Value::String(m.clone()));
        }

        info!(session_id, messages = messages.len(), "Grok session parsed");

        Ok(CanonicalSession { session_id, provider_slug: SLUG.to_string(), workspace, title, started_at, ended_at, messages, metadata: serde_json::Value::Object(metadata), source_path: path.to_path_buf(), model_name })
    }

    fn write_session(&self, session: &CanonicalSession, opts: &WriteOptions) -> anyhow::Result<WrittenSession> {
        let home = Self::home_dir().ok_or_else(|| anyhow::anyhow!("cannot determine Grok home directory"))?;

        // Grok generates UUIDv7 session ids; a new id avoids clobbering the
        // source session on same-machine conversions.
        let session_id = uuid::Uuid::now_v7().to_string();

        let workspace = crate::model::effective_workspace(session);
        let workspace_str = workspace.to_string_lossy().to_string();

        // Group directory: URL-encoded cwd; slug+hash with a `.cwd` marker
        // when the encoded name would exceed 255 bytes (matching the CLI's
        // documented long-path escape hatch; its exact slug scheme is not
        // observable, so `grok sessions list` may not associate the group
        // with the workspace — resume-by-id is unaffected).
        let mut warnings: Vec<String> = Vec::new();
        let encoded = urlencoding::encode(&workspace_str).into_owned();
        let (group_name, needs_cwd_marker) = if encoded.len() > 255 {
            use sha2::{Digest, Sha256};
            let digest = Sha256::digest(workspace_str.as_bytes());
            let hash_hex: String = digest[..8].iter().map(|b| format!("{b:02x}")).collect();
            // `encoded` is pure ASCII, so byte truncation is char-safe.
            let prefix = &encoded[..encoded.len().min(200)];
            warnings.push(format!(
                "encoded workspace path exceeds 255 bytes; wrote hashed group \
                 directory '{prefix}-{hash_hex}' with a .cwd marker — \
                 `grok sessions list` may not associate it with the workspace, \
                 but `grok --resume {session_id}` still works"
            ));
            (format!("{prefix}-{hash_hex}"), true)
        } else {
            (encoded, false)
        };

        let group_dir = home.join("sessions").join(&group_name);
        let session_dir = group_dir.join(&session_id);
        let updates_path = session_dir.join("updates.jsonl");
        let summary_path = session_dir.join("summary.json");

        debug!(
            session_id,
            path = %updates_path.display(),
            messages = session.messages.len(),
            "writing Grok session"
        );

        // ------------------------------------------------------------------
        // updates.jsonl — one ACP session-update event per line.
        // ------------------------------------------------------------------
        let now_ms = chrono::Utc::now().timestamp_millis();
        let fallback_ms = session.started_at.unwrap_or(now_ms);
        let mut lines: Vec<String> = Vec::new();
        let mut event_seq: u64 = 0;
        let mut prompt_index: i64 = 0;

        let mut push_line = |update: serde_json::Value, ts_ms: i64, prompt_id: Option<&str>, lines: &mut Vec<String>| -> anyhow::Result<()> {
            event_seq += 1;
            let mut params_meta = serde_json::Map::new();
            params_meta.insert("eventId".into(), serde_json::Value::String(format!("{session_id}-{event_seq}")));
            params_meta.insert("agentTimestampMs".into(), serde_json::json!(ts_ms));
            if let Some(pid) = prompt_id {
                params_meta.insert("promptId".into(), serde_json::Value::String(pid.into()));
            }
            let line = serde_json::json!({
                "timestamp": ts_ms.div_euclid(1000),
                "method": "session/update",
                "params": {
                    "sessionId": session_id,
                    "update": update,
                    "_meta": serde_json::Value::Object(params_meta),
                }
            });
            lines.push(serde_json::to_string(&line)?);
            Ok(())
        };

        for (i, msg) in session.messages.iter().enumerate() {
            let ts_ms = msg.timestamp.unwrap_or(fallback_ms + i as i64);
            if msg.role == crate::model::MessageRole::Assistant {
                // One promptId per canonical assistant message: chunks of one
                // streamed message share their marker, so distinct markers
                // keep distinct messages apart on read-back.
                let prompt_id = uuid::Uuid::new_v4().to_string();
                let is_thought = msg.author.as_deref() == Some("reasoning") && msg.tool_calls.is_empty() && msg.tool_results.is_empty();
                let kind = if is_thought { "agent_thought_chunk" } else { "agent_message_chunk" };
                if !msg.content.is_empty() {
                    push_line(
                        serde_json::json!({
                            "sessionUpdate": kind,
                            "content": {"type": "text", "text": msg.content},
                        }),
                        ts_ms,
                        Some(&prompt_id),
                        &mut lines,
                    )?;
                }
                // Tool calls, then their results, in canonical order.
                let mut call_ids: Vec<String> = Vec::with_capacity(msg.tool_calls.len());
                for (n, call) in msg.tool_calls.iter().enumerate() {
                    let call_id = call.id.clone().unwrap_or_else(|| format!("call-casr-{i}-{n}"));
                    call_ids.push(call_id.clone());
                    push_line(
                        serde_json::json!({
                            "sessionUpdate": "tool_call",
                            "toolCallId": call_id,
                            "title": call.name,
                            "status": "pending",
                            "rawInput": call.arguments,
                        }),
                        ts_ms,
                        Some(&prompt_id),
                        &mut lines,
                    )?;
                }
                for (n, result) in msg.tool_results.iter().enumerate() {
                    let call_id = result.call_id.clone().or_else(|| call_ids.get(n).cloned()).unwrap_or_else(|| format!("call-casr-{i}-r{n}"));
                    let status = if result.is_error { "failed" } else { "completed" };
                    push_line(
                        serde_json::json!({
                            "sessionUpdate": "tool_call_update",
                            "toolCallId": call_id,
                            "status": status,
                            "content": [
                                {"type": "content",
                                 "content": {"type": "text", "text": result.content}}
                            ],
                        }),
                        ts_ms,
                        Some(&prompt_id),
                        &mut lines,
                    )?;
                }
            } else {
                // Grok's update stream has no system/tool kind: non-assistant
                // roles are preserved as user chunks (content intact, role
                // collapsing to the "user" bucket on read-back).
                push_line(
                    serde_json::json!({
                        "sessionUpdate": "user_message_chunk",
                        "content": {"type": "text", "text": msg.content},
                        "_meta": {"promptIndex": prompt_index},
                    }),
                    ts_ms,
                    None,
                    &mut lines,
                )?;
                prompt_index += 1;
            }
        }

        // ------------------------------------------------------------------
        // summary.json — the index entry (shape captured from real sessions).
        // ------------------------------------------------------------------
        let iso = |ms: i64| -> String { chrono::DateTime::from_timestamp_millis(ms).unwrap_or_else(chrono::Utc::now).to_rfc3339_opts(chrono::SecondsFormat::Nanos, true) };
        let created_ms = session.started_at.unwrap_or(now_ms);
        let updated_ms = session.ended_at.unwrap_or(created_ms);
        let title = session.title.clone().or_else(|| session.messages.iter().find(|m| m.role == crate::model::MessageRole::User).map(|m| crate::model::truncate_title(&m.content, 100)));
        let mut summary = serde_json::Map::new();
        summary.insert("info".into(), serde_json::json!({"id": session_id, "cwd": workspace_str}));
        if let Some(t) = title.as_ref() {
            summary.insert("session_summary".into(), serde_json::json!(t));
            summary.insert("generated_title".into(), serde_json::json!(t));
        }
        summary.insert("created_at".into(), serde_json::json!(iso(created_ms)));
        summary.insert("updated_at".into(), serde_json::json!(iso(updated_ms)));
        summary.insert("last_active_at".into(), serde_json::json!(iso(updated_ms)));
        summary.insert("num_messages".into(), serde_json::json!(lines.len()));
        summary.insert("num_chat_messages".into(), serde_json::json!(session.messages.len()));
        // `current_model_id` is REQUIRED: live bisection against grok 0.2.118
        // showed `grok --resume <id>` fails with "Session does not exist"
        // when summary.json lacks it (all other optional fields — agent_name,
        // sandbox_profile, next_trace_turn — proved unnecessary). Keep the
        // source model only when it is a Grok model; a foreign id (e.g. a
        // Claude model) would confuse resume-time model selection, so fall
        // back to the current default coding model.
        let model_id = session.model_name.as_deref().filter(|m| m.to_ascii_lowercase().starts_with("grok")).unwrap_or(DEFAULT_MODEL_ID);
        summary.insert("current_model_id".into(), serde_json::json!(model_id));
        summary.insert("chat_format_version".into(), serde_json::json!(1));
        summary.insert("grok_home".into(), serde_json::json!(home.to_string_lossy()));

        // ------------------------------------------------------------------
        // Write (atomic, honoring --force semantics per file).
        // ------------------------------------------------------------------
        let updates_content = if lines.is_empty() { String::new() } else { lines.join("\n") + "\n" };
        let updates_outcome = crate::pipeline::atomic_write(&updates_path, updates_content.as_bytes(), opts.force, self.slug())?;
        let summary_content = serde_json::to_string_pretty(&serde_json::Value::Object(summary))? + "\n";
        let summary_outcome = crate::pipeline::atomic_write(&summary_path, summary_content.as_bytes(), opts.force, self.slug())?;
        if needs_cwd_marker {
            let cwd_marker = group_dir.join(".cwd");
            if !cwd_marker.exists() {
                std::fs::write(&cwd_marker, format!("{workspace_str}\n")).map_err(|e| anyhow::anyhow!("failed to write {}: {e}", cwd_marker.display()))?;
            }
        }

        info!(
            session_id,
            path = %updates_outcome.target_path.display(),
            messages = session.messages.len(),
            "Grok session written"
        );

        Ok(WrittenSession { paths: vec![updates_outcome.target_path, summary_outcome.target_path], session_id: session_id.clone(), resume_command: self.resume_command(&session_id), backup_path: updates_outcome.backup_path, warnings })
    }

    fn resume_command(&self, session_id: &str) -> String {
        format!("grok --resume {session_id}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    const SESSION_ID: &str = "019f75d0-ebe1-7db0-a59a-60af9ffa9e71";
    const ENCODED_CWD: &str = "%2Fdata%2Fprojects%2Fdemo";

    /// Wrap a `SessionUpdate` object in the empirical line envelope.
    fn envelope(update: serde_json::Value, ts_secs: i64) -> String {
        serde_json::to_string(&json!({
            "timestamp": ts_secs,
            "method": "session/update",
            "params": {
                "sessionId": SESSION_ID,
                "update": update,
                "_meta": {"eventId": format!("{SESSION_ID}-1"), "agentTimestampMs": ts_secs * 1000}
            }
        }))
        .unwrap()
    }

    /// Build `<root>/sessions/<encoded-cwd>/<uuid>/` with updates + summary.
    fn make_grok_tree(lines: &[String], summary: Option<serde_json::Value>) -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().expect("tmpdir");
        let session_dir = tmp.path().join("sessions").join(ENCODED_CWD).join(SESSION_ID);
        std::fs::create_dir_all(&session_dir).expect("mkdirs");
        let updates = session_dir.join("updates.jsonl");
        std::fs::write(&updates, lines.join("\n")).expect("write updates");
        if let Some(s) = summary {
            std::fs::write(session_dir.join("summary.json"), serde_json::to_string_pretty(&s).unwrap()).expect("write summary");
        }
        (tmp, updates)
    }

    fn default_summary() -> serde_json::Value {
        json!({
            "info": {"id": SESSION_ID, "cwd": "/data/projects/demo"},
            "session_summary": "Run echo hi please",
            "created_at": "2026-07-18T15:20:54.103795421Z",
            "updated_at": "2026-07-18T15:20:59.770364197Z",
            "num_messages": 4,
            "num_chat_messages": 5,
            "current_model_id": "grok-build",
            "chat_format_version": 1,
            "grok_home": "/home/user/.grok",
            "last_active_at": "2026-07-18T15:20:59.770364197Z",
            "generated_title": "Echo test session",
            "agent_name": "grok-build-plan",
            "sandbox_profile": "off"
        })
    }

    // -----------------------------------------------------------------------
    // Reader tests
    // -----------------------------------------------------------------------

    #[test]
    fn reader_parses_real_user_message_chunk_shape() {
        // Verbatim structure captured from a real grok 0.2.103 session
        // (update-level _meta with modelId/promptIndex).
        let lines = vec![envelope(
            json!({
                "sessionUpdate": "user_message_chunk",
                "content": {"type": "text", "text": "Run the shell command: echo hi"},
                "_meta": {"modelId": "grok-build", "promptIndex": 0}
            }),
            1_784_388_059,
        )];
        let (_guard, updates) = make_grok_tree(&lines, Some(default_summary()));
        let session = Grok.read_session(&updates).expect("read");

        assert_eq!(session.provider_slug, "grok");
        assert_eq!(session.session_id, SESSION_ID);
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Run the shell command: echo hi");
        assert!(session.messages[0].timestamp.is_some());
    }

    #[test]
    fn reader_coalesces_consecutive_same_kind_chunks() {
        let lines = vec![
            envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "Run echo hi"}}), 100),
            envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": " please"}}), 101),
            envelope(json!({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "Running"}}), 102),
            envelope(json!({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": " it now."}}), 103),
        ];
        let (_guard, updates) = make_grok_tree(&lines, None);
        let session = Grok.read_session(&updates).expect("read");

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::User);
        assert_eq!(session.messages[0].content, "Run echo hi please");
        assert_eq!(session.messages[1].role, MessageRole::Assistant);
        assert_eq!(session.messages[1].content, "Running it now.");
    }

    #[test]
    fn reader_thought_chunks_become_reasoning_messages() {
        let lines = vec![envelope(json!({"sessionUpdate": "agent_thought_chunk", "content": {"type": "text", "text": "The user wants echo."}}), 100), envelope(json!({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "On it."}}), 101)];
        let (_guard, updates) = make_grok_tree(&lines, None);
        let session = Grok.read_session(&updates).expect("read");

        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, MessageRole::Assistant);
        assert_eq!(session.messages[0].author.as_deref(), Some("reasoning"));
        assert_eq!(session.messages[0].content, "The user wants echo.");
        assert_eq!(session.messages[1].content, "On it.");
        assert_ne!(session.messages[1].author.as_deref(), Some("reasoning"));
    }

    #[test]
    fn reader_merges_tool_call_and_update_into_one_message() {
        let lines = vec![
            envelope(json!({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "Running echo."}}), 100),
            envelope(
                json!({
                    "sessionUpdate": "tool_call",
                    "toolCallId": "call_1",
                    "title": "Run echo hi",
                    "kind": "execute",
                    "status": "pending",
                    "rawInput": {"command": "echo hi"}
                }),
                101,
            ),
            envelope(
                json!({
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call_1",
                    "status": "completed",
                    "content": [
                        {"type": "content", "content": {"type": "text", "text": "hi\n"}}
                    ],
                    "rawOutput": {"output": "hi\n"}
                }),
                102,
            ),
            envelope(json!({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": " Done: hi."}}), 103),
        ];
        let (_guard, updates) = make_grok_tree(&lines, None);
        let session = Grok.read_session(&updates).expect("read");

        // Tool activity does not break the assistant turn.
        assert_eq!(session.messages.len(), 1);
        let msg = &session.messages[0];
        assert_eq!(msg.role, MessageRole::Assistant);
        assert_eq!(msg.content, "Running echo. Done: hi.");
        assert_eq!(msg.tool_calls.len(), 1);
        assert_eq!(msg.tool_calls[0].id.as_deref(), Some("call_1"));
        assert_eq!(msg.tool_calls[0].name, "Run echo hi");
        assert_eq!(msg.tool_calls[0].arguments["command"], "echo hi");
        assert_eq!(msg.tool_results.len(), 1);
        assert_eq!(msg.tool_results[0].call_id.as_deref(), Some("call_1"));
        assert_eq!(msg.tool_results[0].content, "hi\n");
        assert!(!msg.tool_results[0].is_error);
    }

    #[test]
    fn reader_marks_failed_tool_calls_as_errors() {
        let lines = vec![
            envelope(
                json!({
                    "sessionUpdate": "tool_call",
                    "toolCallId": "call_9",
                    "title": "Read file",
                    "kind": "read",
                    "status": "pending"
                }),
                100,
            ),
            envelope(
                json!({
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call_9",
                    "status": "failed",
                    "rawOutput": "no such file"
                }),
                101,
            ),
        ];
        let (_guard, updates) = make_grok_tree(&lines, None);
        let session = Grok.read_session(&updates).expect("read");

        assert_eq!(session.messages.len(), 1);
        let msg = &session.messages[0];
        assert_eq!(msg.tool_calls.len(), 1);
        assert_eq!(msg.tool_results.len(), 1);
        assert!(msg.tool_results[0].is_error);
        assert_eq!(msg.tool_results[0].content, "no such file");
    }

    #[test]
    fn reader_skips_extension_and_unknown_kinds_tolerantly() {
        // hook_execution and retry_state lines below are structurally verbatim
        // from a real 0.2.103 session (content sanitized).
        let lines = vec![
            envelope(
                json!({
                    "sessionUpdate": "hook_execution",
                    "event_name": "user_prompt_submit",
                    "prompt_id": "a23b02fe-95e5-46e4-93c0-c51b0400b88a",
                    "runs": [{"name": "global/settings:user_prompt_submit[0].hooks[0]",
                              "status": {"status": "success", "elapsed_ms": 388}}]
                }),
                100,
            ),
            envelope(
                json!({
                    "sessionUpdate": "retry_state",
                    "type": "failed",
                    "error_type": "api",
                    "message": "API error (status 404 Not Found)"
                }),
                101,
            ),
            envelope(json!({"sessionUpdate": "plan", "entries": []}), 102),
            envelope(json!({"sessionUpdate": "some_future_kind", "payload": {"x": 1}}), 103),
            "not valid json {{{".to_string(),
            envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "Real message"}}), 104),
        ];
        let (_guard, updates) = make_grok_tree(&lines, None);
        let session = Grok.read_session(&updates).expect("read");

        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].content, "Real message");
    }

    #[test]
    fn reader_summary_metadata_wins() {
        let lines = vec![envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "hello"}}), 1_784_388_059)];
        let (_guard, updates) = make_grok_tree(&lines, Some(default_summary()));
        let session = Grok.read_session(&updates).expect("read");

        assert_eq!(session.title.as_deref(), Some("Echo test session"));
        assert_eq!(session.model_name.as_deref(), Some("grok-build"));
        assert_eq!(session.workspace, Some(PathBuf::from("/data/projects/demo")));
        assert_eq!(session.metadata["source"], "grok");
        assert_eq!(session.metadata["agent_name"], "grok-build-plan");
        assert_eq!(crate::model::native_name_from_metadata(&session.metadata).as_deref(), Some("Echo test session"));
        // created_at 2026-07-18T15:20:54Z / last_active_at 15:20:59Z.
        assert!(session.started_at.is_some());
        assert!(session.ended_at.unwrap() > session.started_at.unwrap());
    }

    #[test]
    fn reader_title_falls_back_to_session_summary_then_user_message() {
        let lines = vec![envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "first user words"}}), 100)];

        // No generated_title → session_summary.
        let mut summary = default_summary();
        summary["generated_title"] = json!("");
        let (_guard, updates) = make_grok_tree(&lines, Some(summary));
        let session = Grok.read_session(&updates).expect("read");
        assert_eq!(session.title.as_deref(), Some("Run echo hi please"));

        // No summary.json at all → first user message.
        let (_guard2, updates2) = make_grok_tree(&lines, None);
        let session2 = Grok.read_session(&updates2).expect("read");
        assert_eq!(session2.title.as_deref(), Some("first user words"));
        // Without summary, the session id comes from the directory name.
        assert_eq!(session2.session_id, SESSION_ID);
    }

    #[test]
    fn reader_workspace_falls_back_to_percent_decoded_group_dir() {
        let lines = vec![envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "hi"}}), 100)];
        let (_guard, updates) = make_grok_tree(&lines, None);
        let session = Grok.read_session(&updates).expect("read");
        assert_eq!(session.workspace, Some(PathBuf::from("/data/projects/demo")));
    }

    #[test]
    fn reader_accepts_summary_json_or_session_dir_path() {
        let lines = vec![envelope(json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "hi"}}), 100)];
        let (_guard, updates) = make_grok_tree(&lines, Some(default_summary()));
        let session_dir = updates.parent().unwrap().to_path_buf();

        let via_summary = Grok.read_session(&session_dir.join("summary.json")).expect("read via summary.json");
        assert_eq!(via_summary.messages.len(), 1);

        let via_dir = Grok.read_session(&session_dir).expect("read via dir");
        assert_eq!(via_dir.messages.len(), 1);
    }

    #[test]
    fn reader_empty_updates_file() {
        let (_guard, updates) = make_grok_tree(&[String::new()], Some(default_summary()));
        let session = Grok.read_session(&updates).expect("read");
        assert_eq!(session.messages.len(), 0);
        // Metadata still available from summary.json.
        assert_eq!(session.session_id, SESSION_ID);
        assert_eq!(session.title.as_deref(), Some("Echo test session"));
    }

    // -----------------------------------------------------------------------
    // Enumeration
    // -----------------------------------------------------------------------

    #[test]
    fn list_sessions_in_enumerates_session_dirs_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("sessions");
        let group = root.join(ENCODED_CWD);
        let session_dir = group.join(SESSION_ID);
        std::fs::create_dir_all(&session_dir).unwrap();
        std::fs::write(session_dir.join("updates.jsonl"), "").unwrap();
        std::fs::write(session_dir.join("summary.json"), "{}").unwrap();
        // Non-session artifacts that must be ignored.
        std::fs::write(root.join("session_search.sqlite"), b"SQLite format 3\x00").unwrap();
        std::fs::write(group.join("prompt_history.jsonl"), "{}").unwrap();
        // A session dir without updates.jsonl is skipped.
        std::fs::create_dir_all(group.join("no-updates-session")).unwrap();

        let listed = list_sessions_in(&root);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].0, SESSION_ID);
        assert!(listed[0].1.ends_with("updates.jsonl"));
    }

    #[test]
    fn decode_group_cwd_percent_decodes_and_prefers_cwd_file() {
        let tmp = tempfile::tempdir().unwrap();
        let group = tmp.path().join(ENCODED_CWD);
        std::fs::create_dir_all(&group).unwrap();
        assert_eq!(decode_group_cwd(&group), Some(PathBuf::from("/data/projects/demo")));

        // A `.cwd` file (long-path escape hatch) wins over the dir name.
        let hashed = tmp.path().join("some-slug-abc123");
        std::fs::create_dir_all(&hashed).unwrap();
        std::fs::write(hashed.join(".cwd"), "/very/long/original/path\n").unwrap();
        assert_eq!(decode_group_cwd(&hashed), Some(PathBuf::from("/very/long/original/path")));
    }

    // -----------------------------------------------------------------------
    // Provider metadata / writer refusal / resume
    // -----------------------------------------------------------------------

    #[test]
    fn provider_identity() {
        let p = Grok;
        assert_eq!(p.name(), "Grok Build");
        assert_eq!(p.slug(), "grok");
        assert_eq!(p.cli_alias(), "grk");
    }

    #[test]
    fn resume_command_uses_documented_flag() {
        assert_eq!(Grok.resume_command(SESSION_ID), format!("grok --resume {SESSION_ID}"));
    }
}
