#![forbid(unsafe_code)]

//! casr — Cross Agent Session Resumer.
//!
//! CLI entry point: parses arguments, dispatches subcommands, renders output.

use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use chrono::{Local, Utc};
use clap::Parser;
use colored::Colorize;
use rayon::prelude::*;
use rich_rust::prelude::{Cell, Column, Console, JustifyMethod, Row, Style, Table};
use tracing_subscriber::EnvFilter;

use casr::discovery::ProviderRegistry;
use casr::pipeline::{ConversionPipeline, ConvertOptions};
use casr::responses::{
    self, ErrorEnvelope, InfoResponse, ListEnvelope, ListItem, ProviderInfo, ResumeSuccess,
};

/// Cross Agent Session Resumer — resume AI coding sessions across providers.
///
/// Convert sessions between Claude Code, Codex, Gemini CLI, Cursor, Cline, Aider, Amp, OpenCode, and ChatGPT so you can
/// pick up where you left off with a different agent.
#[derive(Parser, Debug)]
#[command(
    name = "casr",
    version = long_version(),
    about,
    long_about = None,
)]
struct Cli {
    /// Show detailed conversion progress.
    #[arg(long, global = true)]
    verbose: bool,

    /// Show everything including per-message parsing details.
    #[arg(long, global = true)]
    trace: bool,

    /// Output as JSON for machine consumption.
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(clap::Subcommand, Debug)]
enum Command {
    /// Convert and resume a session from another provider.
    Resume {
        /// Target provider alias (cc, cod, gmi, cur, cln, aid, amp, opc, gpt).
        target: String,
        /// Session ID to convert.
        session_id: String,

        /// Show what would happen without writing anything.
        #[arg(long)]
        dry_run: bool,

        /// Overwrite existing session in target if it exists.
        #[arg(long)]
        force: bool,

        /// Explicitly specify source provider alias or session file path.
        #[arg(long)]
        source: Option<String>,

        /// Add context messages to help the target agent understand the conversion.
        #[arg(long)]
        enrich: bool,
    },

    /// List all discoverable sessions across installed providers.
    List {
        /// Filter by provider slug.
        #[arg(long)]
        provider: Option<String>,

        /// Filter by workspace path.
        #[arg(long)]
        workspace: Option<String>,

        /// Maximum sessions to show per provider.
        #[arg(long, default_value = "10")]
        limit: usize,

        /// Sort field (date, messages, provider).
        #[arg(long, default_value = "date")]
        sort: String,

        /// Enrich output with filesystem-derived data (e.g. repo_name from git root).
        #[arg(long)]
        enrich_fs: bool,
    },

    /// Show details for a specific session.
    Info {
        /// Session ID to inspect.
        session_id: String,

        /// Enrich output with filesystem-derived data (e.g. repo_name from git root).
        #[arg(long)]
        enrich_fs: bool,
    },

    /// List detected providers and their installation status.
    Providers,

    /// Generate shell completions.
    Completions {
        /// Shell to generate completions for (bash, zsh, fish).
        shell: String,
    },
}

/// Build the long version string with embedded build metadata.
///
/// vergen-gix always emits these env vars (uses placeholders when values are
/// unavailable), so `env!()` is safe here.
fn long_version() -> &'static str {
    concat!(
        env!("CARGO_PKG_VERSION"),
        " (",
        env!("VERGEN_GIT_SHA"),
        " ",
        env!("VERGEN_BUILD_TIMESTAMP"),
        " ",
        env!("VERGEN_CARGO_TARGET_TRIPLE"),
        ")",
    )
}

/// Initialize the tracing subscriber based on CLI flags.
///
/// Priority: `--trace` > `--verbose` > `RUST_LOG` env var > default (warn).
fn init_tracing(cli: &Cli) {
    let filter = if cli.trace {
        EnvFilter::new("casr=trace")
    } else if cli.verbose {
        EnvFilter::new("casr=debug")
    } else {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("warn"))
    };

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_writer(std::io::stderr)
        .init();
}

/// Rewrite ergonomic shorthand target flags into canonical resume commands.
///
/// Supports:
/// - `casr -cc <session-id> ...`
/// - `casr -cod <session-id> ...`
/// - `casr -gmi <session-id> ...`
///
/// Rewritten form:
/// `casr [global-options] resume <target> <session-id> ...`
fn rewrite_shorthand_resume_args(args: Vec<OsString>) -> Vec<OsString> {
    if args.len() < 2 {
        return args;
    }

    let mut shorthand_idx: Option<usize> = None;
    let mut target_alias: Option<&'static str> = None;

    // Only scan option-like tokens before the first positional token.
    // This preserves regular subcommand behavior (e.g., `casr list`).
    for (idx, arg) in args.iter().enumerate().skip(1) {
        let raw = arg.to_string_lossy();
        if raw == "--" {
            break;
        }
        if !raw.starts_with('-') {
            break;
        }

        let alias = match raw.as_ref() {
            "-cc" => Some("cc"),
            "-cod" => Some("cod"),
            "-gmi" => Some("gmi"),
            _ => None,
        };

        if let Some(a) = alias {
            shorthand_idx = Some(idx);
            target_alias = Some(a);
            break;
        }
    }

    let (idx, alias) = match (shorthand_idx, target_alias) {
        (Some(i), Some(a)) => (i, a),
        _ => return args,
    };

    let mut rewritten = Vec::with_capacity(args.len() + 1);
    rewritten.push(args[0].clone());

    // Preserve any global options before the shorthand flag.
    rewritten.extend(args.iter().take(idx).skip(1).cloned());

    rewritten.push(OsString::from("resume"));
    rewritten.push(OsString::from(alias));

    // Preserve the remaining args after shorthand (session id + options).
    rewritten.extend(args.into_iter().skip(idx + 1));

    rewritten
}

fn main() -> ExitCode {
    let argv = rewrite_shorthand_resume_args(std::env::args_os().collect());
    let cli = Cli::parse_from(argv);
    init_tracing(&cli);

    let result = match cli.command {
        Command::Resume {
            target,
            session_id,
            dry_run,
            force,
            source,
            enrich,
        } => cmd_resume(
            &target,
            &session_id,
            dry_run,
            force,
            source,
            enrich,
            cli.json,
        ),
        Command::List {
            provider,
            workspace,
            limit,
            sort,
            enrich_fs,
        } => cmd_list(
            provider.as_deref(),
            workspace.as_deref(),
            limit,
            &sort,
            cli.json,
            enrich_fs,
        ),
        Command::Info {
            session_id,
            enrich_fs,
        } => cmd_info(&session_id, cli.json, enrich_fs),
        Command::Providers => cmd_providers(cli.json),
        Command::Completions { shell } => cmd_completions(&shell),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            if cli.json {
                let envelope = ErrorEnvelope::new(error_type_name(&e), format!("{e}"));
                eprintln!(
                    "{}",
                    serde_json::to_string_pretty(&envelope).unwrap_or_default()
                );
            } else {
                eprintln!("{} {e}", "Error:".red().bold());
            }
            ExitCode::FAILURE
        }
    }
}

/// Extract a short error type name for JSON output.
fn error_type_name(e: &anyhow::Error) -> &'static str {
    if let Some(casr_err) = e.downcast_ref::<casr::error::CasrError>() {
        match casr_err {
            casr::error::CasrError::SessionNotFound { .. } => "SessionNotFound",
            casr::error::CasrError::AmbiguousSessionId { .. } => "AmbiguousSessionId",
            casr::error::CasrError::UnknownProviderAlias { .. } => "UnknownProviderAlias",
            casr::error::CasrError::ProviderUnavailable { .. } => "ProviderUnavailable",
            casr::error::CasrError::SessionReadError { .. } => "SessionReadError",
            casr::error::CasrError::SessionWriteError { .. } => "SessionWriteError",
            casr::error::CasrError::SessionConflict { .. } => "SessionConflict",
            casr::error::CasrError::ValidationError { .. } => "ValidationError",
            casr::error::CasrError::VerifyFailed { .. } => "VerifyFailed",
        }
    } else {
        "InternalError"
    }
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

fn cmd_resume(
    target: &str,
    session_id: &str,
    dry_run: bool,
    force: bool,
    source: Option<String>,
    enrich: bool,
    json_mode: bool,
) -> anyhow::Result<()> {
    let registry = ProviderRegistry::default_registry();
    let pipeline = ConversionPipeline { registry };

    let opts = ConvertOptions {
        dry_run,
        force,
        verbose: false,
        enrich,
        source_hint: source,
    };

    let result = pipeline.convert(target, session_id, opts)?;

    if json_mode {
        let response = ResumeSuccess {
            ok: true,
            source_provider: result.source_provider.clone(),
            target_provider: result.target_provider.clone(),
            source_session_id: result.canonical_session.session_id.clone(),
            target_session_id: result.written.as_ref().map(|w| w.session_id.clone()),
            written_paths: result
                .written
                .as_ref()
                .map(|w| w.paths.iter().map(|p| p.display().to_string()).collect()),
            resume_command: result.written.as_ref().map(|w| w.resume_command.clone()),
            dry_run: result.written.is_none(),
            warnings: result.warnings.clone(),
        };
        println!("{}", serde_json::to_string_pretty(&response)?);
    } else if let Some(ref written) = result.written {
        println!(
            "{} Converted {} session to {}",
            "✓".green().bold(),
            result.source_provider.cyan(),
            result.target_provider.cyan()
        );
        println!(
            "  {} → {}",
            "Source".dimmed(),
            result.canonical_session.session_id
        );
        println!("  {} → {}", "Target".dimmed(), written.session_id);
        println!(
            "  {} → {}",
            "Messages".dimmed(),
            result.canonical_session.messages.len()
        );
        for path in &written.paths {
            println!("  {} → {}", "Written".dimmed(), path.display());
        }
        for warning in &result.warnings {
            println!("  {} {warning}", "⚠".yellow());
        }
        println!();
        println!(
            "  {} {}",
            "Resume:".green().bold(),
            written.resume_command.bold()
        );
    } else {
        // Dry run.
        println!(
            "{} Would convert {} session to {}",
            "⊘".cyan().bold(),
            result.source_provider.cyan(),
            result.target_provider.cyan()
        );
        println!(
            "  {} → {} messages",
            "Messages".dimmed(),
            result.canonical_session.messages.len()
        );
        for warning in &result.warnings {
            println!("  {} {warning}", "⚠".yellow());
        }
    }

    Ok(())
}

fn cmd_list(
    provider_filter: Option<&str>,
    workspace_filter: Option<&str>,
    limit: usize,
    sort: &str,
    json_mode: bool,
    enrich_fs: bool,
) -> anyhow::Result<()> {
    let registry = ProviderRegistry::default_registry();
    let installed = registry.installed_providers();
    let provider_filter_slug = provider_filter
        .and_then(|filter| registry.find_by_alias(filter).map(|p| p.slug().to_string()))
        .or_else(|| provider_filter.map(|filter| filter.to_ascii_lowercase()));

    #[derive(Debug)]
    struct SessionSummary {
        session_id: String,
        provider: String,
        title: Option<String>,
        messages: usize,
        workspace: Option<PathBuf>,
        started_at: Option<i64>,
        last_active_at: Option<i64>,
        file_size_bytes: u64,
        unique_user_messages: usize,
        avg_agent_response_chars: f64,
        tool_uses: usize,
        path: PathBuf,
    }

    impl SessionSummary {
        fn recency_value(&self) -> i64 {
            self.last_active_at.or(self.started_at).unwrap_or(0)
        }

        fn file_size_kb_rounded(&self) -> u64 {
            ((self.file_size_bytes as f64) / 1024.0).round() as u64
        }

        fn file_size_display(&self) -> String {
            format_with_commas(self.file_size_kb_rounded())
        }

        fn avg_agent_chars_rounded(&self) -> u64 {
            self.avg_agent_response_chars.round() as u64
        }

        fn avg_agent_chars_display(&self) -> String {
            format_with_commas(self.avg_agent_chars_rounded())
        }

        fn started_at_display(&self) -> String {
            self.started_at
                .and_then(chrono::DateTime::<Utc>::from_timestamp_millis)
                .map(|dt| {
                    dt.with_timezone(&Local)
                        .format("%Y-%m-%d %H:%M")
                        .to_string()
                })
                .unwrap_or_else(|| "-".to_string())
        }

        fn last_active_display(&self, now_millis: i64) -> String {
            self.last_active_at
                .map(|timestamp| format_relative_age(timestamp, now_millis))
                .unwrap_or_else(|| "-".to_string())
        }

        fn to_list_item(&self, enrich_fs: bool) -> ListItem {
            let (workspace_name, workspace_name_source) =
                responses::workspace_name_from_path(self.workspace.as_ref());
            let repo_name = if enrich_fs {
                self.workspace
                    .as_ref()
                    .and_then(|ws| casr::discovery::repo_name_from_path(ws))
            } else {
                None
            };
            ListItem {
                schema_version: responses::SCHEMA_VERSION,
                session_id: self.session_id.clone(),
                provider: self.provider.clone(),
                title: self.title.clone(),
                messages: self.messages,
                workspace: self.workspace.as_ref().map(|w| w.display().to_string()),
                started_at: self.started_at,
                last_active_at: self.last_active_at,
                file_size_bytes: self.file_size_bytes,
                file_size_kb: self.file_size_kb_rounded(),
                unique_user_messages: self.unique_user_messages,
                avg_agent_response_chars: self.avg_agent_response_chars,
                avg_agent_response_chars_rounded: self.avg_agent_chars_rounded(),
                tool_uses: self.tool_uses,
                path: self.path.display().to_string(),
                workspace_name,
                workspace_name_source,
                repo_name,
            }
        }
    }

    fn expand_tilde_path(value: &str) -> PathBuf {
        if let Some(rest) = value.strip_prefix("~/")
            && let Some(home) = dirs::home_dir()
        {
            home.join(rest)
        } else {
            PathBuf::from(value)
        }
    }

    fn system_time_to_epoch_millis(time: std::time::SystemTime) -> Option<i64> {
        time.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|dur| i64::try_from(dur.as_millis()).ok())
    }

    fn file_mtime_millis(path: &Path) -> i64 {
        path.metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(system_time_to_epoch_millis)
            .unwrap_or(0)
    }

    fn file_last_activity_millis(path: &Path) -> Option<i64> {
        path.metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(system_time_to_epoch_millis)
    }

    fn session_activity_millis(
        session: &casr::model::CanonicalSession,
        path: &Path,
    ) -> Option<i64> {
        let conversation_activity = session
            .ended_at
            .or_else(|| {
                session
                    .messages
                    .iter()
                    .filter_map(|msg| msg.timestamp)
                    .max()
            })
            .or(session.started_at);
        let file_activity = file_last_activity_millis(path);
        match (conversation_activity, file_activity) {
            (Some(conversation), Some(file)) => Some(conversation.max(file)),
            (Some(conversation), None) => Some(conversation),
            (None, Some(file)) => Some(file),
            (None, None) => None,
        }
    }

    fn format_relative_age(timestamp_millis: i64, now_millis: i64) -> String {
        let (delta_millis, suffix) = if now_millis >= timestamp_millis {
            (now_millis.saturating_sub(timestamp_millis), "ago")
        } else {
            (timestamp_millis.saturating_sub(now_millis), "from now")
        };
        let total_seconds = u64::try_from(delta_millis / 1000).unwrap_or(0);
        let days = total_seconds / 86_400;
        let hours = (total_seconds % 86_400) / 3_600;
        let minutes = (total_seconds % 3_600) / 60;
        let seconds = total_seconds % 60;
        format!("{days}d {hours:02}h {minutes:02}m {seconds:02}s {suffix}")
    }

    fn format_with_commas(value: u64) -> String {
        let s = value.to_string();
        let mut out = String::with_capacity(s.len() + (s.len() / 3));
        for (i, ch) in s.chars().rev().enumerate() {
            if i > 0 && i % 3 == 0 {
                out.push(',');
            }
            out.push(ch);
        }
        out.chars().rev().collect()
    }

    fn codex_tool_uses_from_file(path: &Path) -> usize {
        let Ok(file) = std::fs::File::open(path) else {
            return 0;
        };
        let reader = BufReader::new(file);
        let mut count: usize = 0;

        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(entry) = serde_json::from_str::<serde_json::Value>(trimmed) else {
                continue;
            };
            if entry.get("type").and_then(|v| v.as_str()) != Some("response_item") {
                continue;
            }
            let payload_type = entry
                .pointer("/payload/type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if matches!(payload_type, "function_call" | "custom_tool_call") {
                count = count.saturating_add(1);
            }
            if let Some(content) = entry.pointer("/payload/content").and_then(|v| v.as_array()) {
                count = count.saturating_add(
                    content
                        .iter()
                        .filter(|block| {
                            block.get("type").and_then(|v| v.as_str()) == Some("tool_use")
                        })
                        .count(),
                );
            }
        }

        count
    }

    fn gemini_tool_uses_from_file(path: &Path) -> usize {
        let Ok(content) = std::fs::read_to_string(path) else {
            return 0;
        };
        let Ok(root) = serde_json::from_str::<serde_json::Value>(&content) else {
            return 0;
        };
        let mut count: usize = 0;
        if let Some(messages) = root.get("messages").and_then(|v| v.as_array()) {
            for msg in messages {
                if let Some(parts) = msg.get("content").and_then(|v| v.as_array()) {
                    count = count.saturating_add(
                        parts
                            .iter()
                            .filter(|part| {
                                part.get("type").and_then(|v| v.as_str()) == Some("tool_use")
                            })
                            .count(),
                    );
                }
                if let Some(tool_calls) = msg.get("toolCalls").and_then(|v| v.as_array()) {
                    count = count.saturating_add(tool_calls.len());
                }
            }
        }
        count
    }

    fn claude_tool_uses_from_file(path: &Path) -> usize {
        let Ok(file) = std::fs::File::open(path) else {
            return 0;
        };
        let reader = BufReader::new(file);
        let mut count: usize = 0;

        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(entry) = serde_json::from_str::<serde_json::Value>(trimmed) else {
                continue;
            };
            if let Some(content) = entry.pointer("/message/content").and_then(|v| v.as_array()) {
                count = count.saturating_add(
                    content
                        .iter()
                        .filter(|block| {
                            block.get("type").and_then(|v| v.as_str()) == Some("tool_use")
                        })
                        .count(),
                );
            }
        }

        count
    }

    fn factory_tool_uses_from_file(path: &Path) -> usize {
        let Ok(file) = std::fs::File::open(path) else {
            return 0;
        };
        let reader = BufReader::new(file);
        let mut count: usize = 0;

        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(entry) = serde_json::from_str::<serde_json::Value>(trimmed) else {
                continue;
            };
            if entry.get("type").and_then(|v| v.as_str()) != Some("message") {
                continue;
            }
            if let Some(content) = entry.pointer("/message/content").and_then(|v| v.as_array()) {
                count = count.saturating_add(
                    content
                        .iter()
                        .filter(|block| {
                            matches!(
                                block.get("type").and_then(|v| v.as_str()),
                                Some("tool_use")
                                    | Some("tool_call")
                                    | Some("function_call")
                                    | Some("custom_tool_call")
                            )
                        })
                        .count(),
                );
            }
            if let Some(tool_calls) = entry
                .pointer("/message/toolCalls")
                .and_then(|v| v.as_array())
            {
                count = count.saturating_add(tool_calls.len());
            }
        }

        count
    }

    fn tool_uses_from_source_file(provider_slug: &str, path: &Path) -> usize {
        match provider_slug {
            "codex" => codex_tool_uses_from_file(path),
            "gemini" => gemini_tool_uses_from_file(path),
            "claude-code" => claude_tool_uses_from_file(path),
            "factory" => factory_tool_uses_from_file(path),
            _ => 0,
        }
    }

    fn message_count_style(message_count: usize) -> Style {
        let style_str = if message_count >= 200 {
            "bold bright_cyan"
        } else if message_count >= 50 {
            "bold cyan"
        } else if message_count >= 10 {
            "bold blue"
        } else {
            "bold dim"
        };
        Style::parse(style_str).unwrap_or_default()
    }

    fn last_active_style(last_active_at: Option<i64>, now_millis: i64) -> Style {
        let Some(last_active_at) = last_active_at else {
            return Style::parse("dim").unwrap_or_default();
        };
        let age_seconds =
            u64::try_from(now_millis.saturating_sub(last_active_at).max(0) / 1000).unwrap_or(0);
        let style_str = if age_seconds < 3_600 {
            "bold bright_green"
        } else if age_seconds < 86_400 {
            "bold green"
        } else if age_seconds < 604_800 {
            "bold yellow"
        } else if age_seconds < 2_592_000 {
            "bold magenta"
        } else {
            "bold dim"
        };
        Style::parse(style_str).unwrap_or_default()
    }

    fn provider_display(provider: &str) -> &str {
        match provider {
            "claude-code" => "Claude Code",
            "codex" => "Codex",
            "gemini" => "Gemini",
            "cursor" => "Cursor",
            "cline" => "Cline",
            "aider" => "Aider",
            "amp" => "Amp",
            "opencode" => "OpenCode",
            "chatgpt" => "ChatGPT",
            "clawdbot" => "ClawdBot",
            "vibe" => "Vibe",
            "factory" => "Factory",
            "openclaw" => "OpenClaw",
            "pi-agent" => "Pi-Agent",
            _ => provider,
        }
    }

    fn normalize_user_message_for_uniqueness(content: &str) -> Option<String> {
        let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    }

    fn session_metrics(
        provider_slug: &str,
        session: &casr::model::CanonicalSession,
        path: &Path,
    ) -> (u64, usize, f64, usize) {
        let file_size_bytes = path.metadata().map(|meta| meta.len()).unwrap_or(0);

        let mut unique_user_messages: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut assistant_chars_total: usize = 0;
        let mut assistant_responses: usize = 0;
        let mut canonical_tool_uses: usize = 0;

        for msg in &session.messages {
            canonical_tool_uses = canonical_tool_uses.saturating_add(msg.tool_calls.len());

            if msg.role == casr::model::MessageRole::User
                && let Some(normalized) = normalize_user_message_for_uniqueness(&msg.content)
            {
                unique_user_messages.insert(normalized);
            }

            if msg.role == casr::model::MessageRole::Assistant {
                let char_count = msg.content.chars().count().saturating_add(
                    msg.tool_results
                        .iter()
                        .map(|result| result.content.chars().count())
                        .sum::<usize>(),
                );
                if char_count > 0 {
                    assistant_chars_total = assistant_chars_total.saturating_add(char_count);
                    assistant_responses = assistant_responses.saturating_add(1);
                }
            }
        }

        let avg_agent_response_chars = if assistant_responses > 0 {
            assistant_chars_total as f64 / assistant_responses as f64
        } else {
            0.0
        };

        let tool_uses = if canonical_tool_uses > 0 {
            canonical_tool_uses
        } else {
            tool_uses_from_source_file(provider_slug, path)
        };

        (
            file_size_bytes,
            unique_user_messages.len(),
            avg_agent_response_chars,
            tool_uses,
        )
    }

    fn build_summary(
        provider_slug: &str,
        path: PathBuf,
        session: casr::model::CanonicalSession,
    ) -> SessionSummary {
        let last_active_at = session_activity_millis(&session, &path);
        let (file_size_bytes, unique_user_messages, avg_agent_response_chars, tool_uses) =
            session_metrics(provider_slug, &session, &path);

        SessionSummary {
            session_id: session.session_id,
            provider: provider_slug.to_string(),
            title: session.title,
            messages: session.messages.len(),
            workspace: session.workspace,
            started_at: session.started_at,
            last_active_at,
            file_size_bytes,
            unique_user_messages,
            avg_agent_response_chars,
            tool_uses,
            path,
        }
    }

    fn probe_limit_for_sort(limit: usize, sort: &str, workspace_scoped: bool) -> usize {
        if sort == "date" {
            // Cap expensive provider scans while preserving high confidence for
            // "most recent" results. Workspace-scoped lists can use a tighter cap.
            let multiplier = if workspace_scoped { 3 } else { 8 };
            std::cmp::max(limit.saturating_mul(multiplier), 30)
        } else {
            usize::MAX
        }
    }

    fn workspace_hint_matches(
        provider_slug: &str,
        path: &Path,
        workspace_filter: Option<&PathBuf>,
    ) -> bool {
        let Some(ws) = workspace_filter else {
            return true;
        };

        match provider_slug {
            "claude-code" => {
                let expected = casr::providers::claude_code::project_dir_key(ws.as_path());
                path.parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    == Some(expected.as_str())
            }
            "gemini" => {
                let expected_hash = casr::providers::gemini::project_hash(ws.as_path());
                let observed_hash = path
                    .parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str());
                match observed_hash {
                    Some(hash) if hash == expected_hash => true,
                    Some(hash)
                        if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) =>
                    {
                        false
                    }
                    // Keep fixture/legacy layouts permissive.
                    _ => true,
                }
            }
            _ => true,
        }
    }

    fn provider_has_workspace_path_hint(provider_slug: &str) -> bool {
        matches!(provider_slug, "claude-code" | "gemini")
    }

    fn workspace_scoped_listed_sessions(
        provider_slug: &str,
        workspace_filter: Option<&PathBuf>,
    ) -> Option<Vec<(String, PathBuf)>> {
        let ws = workspace_filter?;
        match provider_slug {
            "claude-code" => {
                let claude_home = std::env::var("CLAUDE_HOME")
                    .ok()
                    .map(PathBuf::from)
                    .or_else(|| dirs::home_dir().map(|h| h.join(".claude")))?;
                let expected_dir = claude_home
                    .join("projects")
                    .join(casr::providers::claude_code::project_dir_key(ws.as_path()));
                if !expected_dir.is_dir() {
                    return Some(vec![]);
                }

                let mut sessions: Vec<(String, PathBuf)> = Vec::new();
                let entries = match std::fs::read_dir(&expected_dir) {
                    Ok(entries) => entries,
                    Err(_) => return Some(vec![]),
                };
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("jsonl")
                    {
                        continue;
                    }
                    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    sessions.push((stem.to_string(), path));
                }
                Some(sessions)
            }
            "gemini" => {
                let gemini_home = std::env::var("GEMINI_HOME")
                    .ok()
                    .map(PathBuf::from)
                    .or_else(|| dirs::home_dir().map(|h| h.join(".gemini")))?;
                let tmp_root = gemini_home.join("tmp");
                let hash = casr::providers::gemini::project_hash(ws.as_path());
                let chats_dir = tmp_root.join(hash).join("chats");
                if !chats_dir.is_dir() {
                    // Fallback to generic provider enumeration when tmp/ has
                    // legacy/non-hash chat roots (fixtures or older layouts).
                    // Otherwise, return empty early to avoid an expensive scan.
                    let has_legacy_chat_roots =
                        std::fs::read_dir(&tmp_root).ok().is_some_and(|entries| {
                            entries.flatten().any(|entry| {
                                let path = entry.path();
                                if !path.is_dir() || !path.join("chats").is_dir() {
                                    return false;
                                }
                                let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                                    return true;
                                };
                                !(name.len() == 64 && name.chars().all(|c| c.is_ascii_hexdigit()))
                            })
                        });
                    return if has_legacy_chat_roots {
                        None
                    } else {
                        Some(vec![])
                    };
                }

                let mut sessions: Vec<(String, PathBuf)> = Vec::new();
                let entries = match std::fs::read_dir(&chats_dir) {
                    Ok(entries) => entries,
                    Err(_) => return Some(vec![]),
                };
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() {
                        continue;
                    }
                    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                        continue;
                    };
                    if !(name.starts_with("session-") && name.ends_with(".json")) {
                        continue;
                    }
                    let session_id = name
                        .strip_prefix("session-")
                        .and_then(|n| n.strip_suffix(".json"))
                        .unwrap_or(name)
                        .to_string();
                    sessions.push((session_id, path));
                }
                Some(sessions)
            }
            _ => None,
        }
    }

    let workspace_filter_explicit = workspace_filter.is_some();
    let workspace_filter = workspace_filter
        .map(expand_tilde_path)
        .or_else(|| std::env::current_dir().ok());
    let workspace_scope = workspace_filter
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "all workspaces".to_string());
    let workspace_scope_label = if workspace_filter_explicit {
        "workspace project (--workspace)"
    } else {
        "current working-directory project"
    };
    tracing::debug!(
        provider_filter = ?provider_filter_slug,
        workspace = %workspace_scope,
        scope = %workspace_scope_label,
        sort,
        limit,
        "listing sessions"
    );

    let mut sessions: Vec<SessionSummary> = Vec::new();

    const LIST_PARSE_PARALLEL_THRESHOLD: usize = 256;

    for provider in &installed {
        tracing::debug!(provider = provider.slug(), "scanning provider for sessions");
        if let Some(filter_slug) = provider_filter_slug.as_deref()
            && provider.slug() != filter_slug
            && provider.cli_alias() != filter_slug
        {
            continue;
        }

        // Prefer list_sessions() for providers that store multiple sessions
        // in a single file/DB (avoids undercounting).
        let scoped_listed =
            workspace_scoped_listed_sessions(provider.slug(), workspace_filter.as_ref());
        if let Some(listed) = scoped_listed.or_else(|| provider.list_sessions()) {
            let mut listed = listed;
            let probe_limit = probe_limit_for_sort(limit, sort, workspace_filter.is_some());
            if listed.len() > probe_limit {
                listed.sort_by_key(|(_, path)| std::cmp::Reverse(file_mtime_millis(path)));
                listed.truncate(probe_limit);
            }

            let provider_slug = provider.slug().to_string();
            let parsed: Vec<SessionSummary> = if listed.len() < LIST_PARSE_PARALLEL_THRESHOLD {
                listed
                    .into_iter()
                    .filter_map(|(_session_id, path)| {
                        if !workspace_hint_matches(&provider_slug, &path, workspace_filter.as_ref())
                        {
                            return None;
                        }
                        let session = provider.read_session(&path).ok()?;
                        Some(build_summary(&provider_slug, path, session))
                    })
                    .collect()
            } else {
                listed
                    .into_par_iter()
                    .filter_map(|(_session_id, path)| {
                        if !workspace_hint_matches(&provider_slug, &path, workspace_filter.as_ref())
                        {
                            return None;
                        }
                        let session = provider.read_session(&path).ok()?;
                        Some(build_summary(&provider_slug, path, session))
                    })
                    .collect()
            };
            sessions.extend(parsed);
            continue;
        }

        let mut candidate_paths: Vec<PathBuf> = Vec::new();

        for root in provider.session_roots() {
            let walker = walkdir::WalkDir::new(&root)
                .max_depth(4)
                .into_iter()
                .filter_map(Result::ok);

            for entry in walker {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str());
                if !matches!(
                    ext,
                    Some("jsonl")
                        | Some("json")
                        | Some("vscdb")
                        | Some("md")
                        | Some("db")
                        | Some("sqlite")
                ) {
                    continue;
                }

                if !workspace_hint_matches(provider.slug(), path, workspace_filter.as_ref()) {
                    continue;
                }

                candidate_paths.push(path.to_path_buf());
            }
        }

        let probe_limit = probe_limit_for_sort(limit, sort, workspace_filter.is_some());
        if candidate_paths.len() > probe_limit {
            candidate_paths.sort_by_key(|path| std::cmp::Reverse(file_mtime_millis(path)));
            candidate_paths.truncate(probe_limit);
        }

        let provider_slug = provider.slug().to_string();
        let parsed: Vec<SessionSummary> = if candidate_paths.len() < LIST_PARSE_PARALLEL_THRESHOLD {
            candidate_paths
                .into_iter()
                .filter_map(|path| {
                    let session = provider.read_session(&path).ok()?;
                    Some(build_summary(&provider_slug, path, session))
                })
                .collect()
        } else {
            candidate_paths
                .into_par_iter()
                .filter_map(|path| {
                    let session = provider.read_session(&path).ok()?;
                    Some(build_summary(&provider_slug, path, session))
                })
                .collect()
        };
        sessions.extend(parsed);
    }

    if let Some(filter) = workspace_filter.as_ref() {
        sessions.retain(|s| {
            s.workspace.as_ref().is_some_and(|w| w.starts_with(filter))
                || (provider_has_workspace_path_hint(&s.provider)
                    && workspace_hint_matches(&s.provider, &s.path, Some(filter)))
        });
    }

    let mut sessions_by_provider: std::collections::BTreeMap<String, Vec<SessionSummary>> =
        std::collections::BTreeMap::new();
    for session in sessions {
        sessions_by_provider
            .entry(session.provider.clone())
            .or_default()
            .push(session);
    }

    for provider_sessions in sessions_by_provider.values_mut() {
        match sort {
            "date" => provider_sessions.sort_by_key(|s| std::cmp::Reverse(s.recency_value())),
            "messages" => provider_sessions.sort_by(|a, b| {
                b.messages
                    .cmp(&a.messages)
                    .then_with(|| b.recency_value().cmp(&a.recency_value()))
            }),
            "provider" => provider_sessions.sort_by_key(|s| std::cmp::Reverse(s.recency_value())),
            other => {
                return Err(anyhow::anyhow!(
                    "Unknown sort field '{other}'. Expected one of: date, messages, provider."
                ));
            }
        }
        provider_sessions.truncate(limit);
    }

    let non_empty_group_count = sessions_by_provider
        .values()
        .filter(|sessions| !sessions.is_empty())
        .count();
    let total_sessions_kept: usize = sessions_by_provider.values().map(Vec::len).sum();
    tracing::debug!(
        providers = non_empty_group_count,
        sessions = total_sessions_kept,
        sort,
        limit,
        "list sessions complete"
    );

    if json_mode {
        let mut items: Vec<ListItem> = Vec::new();
        for sessions in sessions_by_provider.values() {
            for session in sessions {
                items.push(session.to_list_item(enrich_fs));
            }
        }
        let envelope = ListEnvelope::new(items);
        println!("{}", serde_json::to_string_pretty(&envelope)?);
    } else {
        if non_empty_group_count == 0 {
            println!(
                "No sessions found for {} {}. Run {} to check provider status.",
                workspace_scope_label.cyan(),
                workspace_scope.cyan(),
                "casr providers".cyan(),
            );
            return Ok(());
        }

        let console = Console::new();
        console.print(&format!(
            "[bold cyan]Project-scoped sessions[/] for [bold]{workspace_scope}[/]"
        ));
        console.print(&format!("[dim]Scope:[/] [bold]{workspace_scope_label}[/]"));
        console.print(&format!(
            "[dim]Showing up to[/] [bold]{limit}[/] [dim]most recent sessions per provider[/]"
        ));

        let now_millis = Utc::now().timestamp_millis();

        for (provider_slug, provider_sessions) in &sessions_by_provider {
            if provider_sessions.is_empty() {
                continue;
            }

            let provider = provider_display(provider_slug);
            console.print(&format!(
                "[bold]{}[/]: {} session(s)",
                provider,
                provider_sessions.len()
            ));

            let mut table = Table::new()
                .title(format!(
                    "Top {} Most Recently Active {} Sessions in This Project",
                    provider_sessions.len(),
                    provider
                ))
                .header_style(Style::parse("bold black on bright_white").unwrap_or_default())
                .border_style(Style::parse("cyan").unwrap_or_default())
                .with_column(Column::new("#").justify(JustifyMethod::Right).width(3))
                .with_column(Column::new("Session ID").min_width(36))
                .with_column(Column::new("Msgs").justify(JustifyMethod::Right).width(6))
                .with_column(
                    Column::new("Size KB")
                        .justify(JustifyMethod::Right)
                        .width(8),
                )
                .with_column(
                    Column::new("Unique Users")
                        .justify(JustifyMethod::Right)
                        .width(12),
                )
                .with_column(
                    Column::new("Agent Avg Chars")
                        .justify(JustifyMethod::Right)
                        .width(15),
                )
                .with_column(
                    Column::new("Tool Uses")
                        .justify(JustifyMethod::Right)
                        .width(10),
                )
                .with_column(
                    Column::new("Started")
                        .justify(JustifyMethod::Left)
                        .width(16),
                )
                .with_column(
                    Column::new("Last Active")
                        .justify(JustifyMethod::Left)
                        .min_width(22),
                );

            for (idx, s) in provider_sessions.iter().enumerate() {
                let rank = (idx + 1).to_string();
                let session_id = s.session_id.as_str();
                let messages = s.messages.to_string();
                let messages_cell_style = message_count_style(s.messages);
                let size_kb = s.file_size_display();
                let unique_users = format_with_commas(s.unique_user_messages as u64);
                let avg_agent = s.avg_agent_chars_display();
                let tool_uses = format_with_commas(s.tool_uses as u64);
                let started = s.started_at_display();
                let last_active = s.last_active_display(now_millis);
                let last_active_cell_style = last_active_style(s.last_active_at, now_millis);
                table.add_row(Row::new(vec![
                    Cell::new(rank.as_str()),
                    Cell::new(session_id),
                    Cell::new(messages.as_str()).style(messages_cell_style),
                    Cell::new(size_kb.as_str()),
                    Cell::new(unique_users.as_str()),
                    Cell::new(avg_agent.as_str()),
                    Cell::new(tool_uses.as_str()),
                    Cell::new(started.as_str()),
                    Cell::new(last_active.as_str()).style(last_active_cell_style),
                ]));
            }

            console.print_renderable(&table);
        }
        console.print("[dim]Tip:[/] run [bold]casr info <session-id>[/] for full metadata.");
    }

    Ok(())
}

fn cmd_info(session_id: &str, json_mode: bool, enrich_fs: bool) -> anyhow::Result<()> {
    let registry = ProviderRegistry::default_registry();
    let resolved = registry.resolve_session(session_id, None)?;
    let session = resolved.provider.read_session(&resolved.path)?;

    if json_mode {
        let (workspace_name, workspace_name_source) =
            responses::workspace_name_from_path(session.workspace.as_ref());
        let repo_name = if enrich_fs {
            session
                .workspace
                .as_ref()
                .and_then(|ws| casr::discovery::repo_name_from_path(ws))
        } else {
            None
        };
        let response = InfoResponse {
            schema_version: responses::SCHEMA_VERSION,
            session_id: session.session_id.clone(),
            provider: session.provider_slug.clone(),
            title: session.title.clone(),
            workspace: session.workspace.as_ref().map(|w| w.display().to_string()),
            messages: session.messages.len(),
            started_at: session.started_at,
            ended_at: session.ended_at,
            model_name: session.model_name.clone(),
            source_path: session.source_path.display().to_string(),
            metadata: session.metadata.clone(),
            workspace_name,
            workspace_name_source,
            repo_name,
        };
        println!("{}", serde_json::to_string_pretty(&response)?);
    } else {
        println!("{}\n", "Session Info".bold());
        println!("  {} {}", "ID:".dimmed(), session.session_id.cyan());
        println!("  {} {}", "Provider:".dimmed(), session.provider_slug);
        if let Some(ref title) = session.title {
            println!("  {} {title}", "Title:".dimmed());
        }
        if let Some(ref ws) = session.workspace {
            println!("  {} {}", "Workspace:".dimmed(), ws.display());
        }
        println!("  {} {}", "Messages:".dimmed(), session.messages.len());
        if let Some(ref model) = session.model_name {
            println!("  {} {model}", "Model:".dimmed());
        }
        println!("  {} {}", "Path:".dimmed(), session.source_path.display());

        // Show role breakdown.
        let user_count = session
            .messages
            .iter()
            .filter(|m| m.role == casr::model::MessageRole::User)
            .count();
        let asst_count = session
            .messages
            .iter()
            .filter(|m| m.role == casr::model::MessageRole::Assistant)
            .count();
        println!(
            "  {} {user_count} user, {asst_count} assistant",
            "Roles:".dimmed()
        );
    }

    Ok(())
}

fn cmd_providers(json_mode: bool) -> anyhow::Result<()> {
    let registry = ProviderRegistry::default_registry();
    let results = registry.detect_all();

    if json_mode {
        let providers: Vec<ProviderInfo> = results
            .iter()
            .map(|(p, det)| ProviderInfo {
                name: p.name().to_string(),
                slug: p.slug().to_string(),
                alias: p.cli_alias().to_string(),
                installed: det.installed,
                version: det.version.clone(),
                evidence: det.evidence.clone(),
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&providers)?);
    } else {
        println!("{}\n", "Detected Providers".bold());
        for (provider, detection) in &results {
            let status = if detection.installed {
                "✓".green().bold().to_string()
            } else {
                "✗".red().bold().to_string()
            };
            println!(
                "  {status} {} ({}) — alias: {}",
                provider.name(),
                provider.slug(),
                provider.cli_alias().cyan()
            );
            for ev in &detection.evidence {
                println!("    {ev}");
            }
        }
    }

    Ok(())
}

fn cmd_completions(shell: &str) -> anyhow::Result<()> {
    use clap::CommandFactory;
    use clap_complete::{Shell, generate};

    let parsed_shell: Shell = shell
        .parse()
        .map_err(|_| anyhow::anyhow!("Unknown shell '{shell}'. Use: bash, zsh, fish"))?;

    let mut cmd = Cli::command();
    generate(parsed_shell, &mut cmd, "casr", &mut std::io::stdout());

    Ok(())
}
