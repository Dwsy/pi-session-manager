# casr

<div align="center">
  <img src="casr_illustration.webp" alt="casr - Cross Agent Session Resumer">
</div>

Cross Agent Session Resumer for coding agents: resume a session created in one provider (Claude Code, Codex, Gemini, and more) using a different provider by converting through a canonical session model.

![Rust](https://img.shields.io/badge/Rust-2024%20nightly-orange)
![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)

## Quick Install (Recommended)

```bash
curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/cross_agent_session_resumer/main/install.sh?$(date +%s)" | bash
```

That installer is the primary distribution path. It handles platform detection, secure artifact verification, fallback source builds, shell completions, and agent-oriented local setup in one step.

## TL;DR

**The Problem**: AI coding sessions are siloed by provider. A useful Codex session cannot be resumed directly in Claude Code, and vice versa.

**The Solution**: `casr` discovers a session across installed providers, reads it into a canonical IR, writes a native session file for your target provider, verifies read-back fidelity, and prints the exact resume command.

### Why Use casr?

| Feature | What It Does |
|---|---|
| Cross-provider resume | `casr cc resume <codex-session-id>` and similar conversions in one command |
| Canonical IR | Normalizes provider formats into a common model, then exports back to native format |
| Native-format writers | Produces plausible provider-native session files, not intermediate-only exports |
| Safety-first writes | Atomic temp-then-rename writes, conflict detection, optional `.bak` backup with `--force` |
| Provider auto-detection | Finds which provider owns a session ID without user guesswork |
| Verification step | Re-reads written output to catch writer bugs before you try to resume |
| Machine-friendly output | `--json` mode for scripts and automation |
| Debuggability | `--verbose`, `--trace`, and structured tracing with `RUST_LOG` |

## Quick Example

```bash
# 1) See what providers are available
casr providers

# 2) Find a session from any provider
casr list --limit 20 --sort date

# 3) Inspect a single session
casr info 019c3eae-94c3-7d73-9b2a-9edb18f1563b

# 4) Convert that session to Claude Code format
casr cc resume 019c3eae-94c3-7d73-9b2a-9edb18f1563b

# ergonomic shorthand (auto-detects source provider from the session ID)
casr -cc 019c3eae-94c3-7d73-9b2a-9edb18f1563b   # open in Claude Code
casr -cod 019c3eae-94c3-7d73-9b2a-9edb18f1563b  # open in Codex
casr -gmi 019c3eae-94c3-7d73-9b2a-9edb18f1563b  # open in Gemini CLI

# 5) Resume in Claude Code using the generated ID
claude --resume <new-session-id>
```

## Design Philosophy

1. **Provider fungibility over lock-in**: sessions are portable assets.
2. **Native fidelity over lossy export**: writers target real provider session formats.
3. **Safety over convenience**: atomic writes, conflict checks, read-back verification.
4. **Permissive conversion over brittle strictness**: warnings for imperfect input when conversion is still useful.
5. **Observability by default**: rich logs and actionable errors for every pipeline stage.

## How casr Compares

| Capability | casr | Manual copy/paste | Read-only session search tools | Ad-hoc one-off scripts |
|---|---|---|---|---|
| Convert sessions between providers | Yes | No | No | Partial |
| Provider-native output files | Yes | No | No | Usually brittle |
| Auto-detect source provider by session ID | Yes | No | Sometimes | Rare |
| Atomic writes and conflict handling | Yes | No | N/A | Rare |
| Round-trip testable architecture | Yes | No | N/A | Rare |
| Structured JSON mode for automation | Yes | No | Sometimes | Depends |

## Supported Providers

| Provider | Alias | Read | Write | Resume command |
|---|---|---|---|---|
| Claude Code | `cc` | Yes | Yes | `claude --resume <session-id>` |
| Codex | `cod` | Yes | Yes | `codex resume <session-id>` |
| Gemini CLI | `gmi` | Yes | Yes | `gemini --resume <session-id>` |
| Cursor | `cur` | Yes | Yes | `cursor .` |
| Cline | `cln` | Yes | Yes | `code .` |
| Aider | `aid` | Yes | Yes | `aider --restore-chat-history` |
| Amp | `amp` | Yes | Yes | `amp threads continue --execute "Continue from @<session-id>"` |
| OpenCode | `opc` | Yes | Yes | `opencode` |
| ChatGPT | `gpt` | Yes | Yes | `open "https://chatgpt.com/c/<session-id>"` |
| ClawdBot | `cwb` | Yes | Yes | `clawdbot --resume <session-id>` |
| Vibe | `vib` | Yes | Yes | `vibe --resume <session-id>` |
| Factory | `fac` | Yes | Yes | `factory --resume <session-id>` |
| OpenClaw | `ocl` | Yes | Yes | `openclaw --resume <session-id>` |
| Pi-Agent | `pi` | Yes | Yes | `pi --session <path-to-session.jsonl>` |

Notes:
- Initial core focus is Claude Code, Codex, and Gemini CLI.
- Additional providers are implemented through the same `Provider` trait model.

## Installation

### Primary Path: Hardened `curl | bash` Installer

```bash
curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/cross_agent_session_resumer/main/install.sh?$(date +%s)" | bash
```

What this installer does for you:

| Capability | Behavior |
|---|---|
| Platform targeting | Detects Linux/macOS + x86_64/aarch64 and picks the right artifact |
| Supply-chain checks | Verifies SHA256 and Sigstore/cosign when available |
| Download fallback chain | Versioned release -> latest release naming variants -> source build |
| Airgap install | `--offline <tarball>` installs from local artifacts |
| Proxy-aware networking | Uses `HTTPS_PROXY` / `HTTP_PROXY` automatically |
| Shell UX | Installs completions for bash/zsh/fish |
| Agent setup | Installs `casr` skill for Claude/Codex and optional `cc`/`cod`/`gmi` wrappers |

High-value installer flags:

| Flag | Purpose |
|---|---|
| `--verify` | Runs post-install self-test |
| `--force` | Reinstall even if same version is already present |
| `--offline <tarball>` | Airgapped local install |
| `--from-source` | Build from source directly |
| `--easy-mode` | Auto-update PATH in shell rc files |
| `--yes` | Non-interactive prompt acceptance |
| `--no-configure` | Skip agent skill/wrapper setup |
| `--no-skill` | Skip Claude/Codex skill installation |

```bash
# Examples
bash install.sh --verify
bash install.sh --system --easy-mode --yes
bash install.sh --offline ./casr-x86_64-unknown-linux-musl.tar.xz
bash install.sh --no-configure --no-skill
```

Run `bash install.sh --help` for the full option set.

### Alternative: From Source

```bash
git clone https://github.com/Dicklesworthstone/cross_agent_session_resumer
cd cross_agent_session_resumer
cargo build --release
./target/release/casr --help
```

### Alternative: Cargo Local Install

```bash
cargo install --path .
casr --help
```

### Alternative: Development Mode

```bash
cargo run -- --help
```

## Quick Start

1. Confirm provider detection.
```bash
casr providers
```

2. List discoverable sessions.
```bash
casr list --sort date --limit 50
```

3. Inspect the source session.
```bash
casr info <session-id>
```

4. Convert to your target provider.
```bash
casr <target-alias> resume <session-id>
```

5. Resume in target provider.
```bash
# Examples
claude --resume <new-session-id>
codex resume <new-session-id>
gemini --resume <new-session-id>
```

## Commands

Global flags:

```bash
--dry-run                 # Show what would happen without writing
--force                   # Overwrite existing target session (creates .bak backup)
--json                    # Structured JSON output
--verbose                 # Debug-level logging (casr=debug)
--trace                   # Trace-level logging (casr=trace)
--source <alias_or_path>  # Explicit source provider alias or direct session path
--enrich                  # Add optional synthetic context/orientation messages
```

### `casr <target> resume <session-id>`

Convert a source session into target provider format and print the target resume command.

```bash
casr cc resume 019c3eae-94c3-7d73-9b2a-9edb18f1563b
casr claude resume 019c3eae-94c3-7d73-9b2a-9edb18f1563b   # standard name fallback
casr cod resume 40f2cb68-fed7-4cee-83de-2b63ba9b7813 --dry-run
casr codex resume 40f2cb68-fed7-4cee-83de-2b63ba9b7813 --dry-run
casr gmi resume 40f2cb68-fed7-4cee-83de-2b63ba9b7813 --source cc
casr gemini resume 40f2cb68-fed7-4cee-83de-2b63ba9b7813 --source claude
casr cc resume <session-id> --force
casr cc resume <session-id> --json
```

### `casr list`

List sessions across installed providers.

```bash
casr list
casr list --provider codex
casr list --workspace /data/projects/myapp
casr list --limit 100 --sort messages

# default behavior (no args): current workspace only, top 10, styled table output
casr list
```

### `casr info <session-id>`

Show non-converting session details.

```bash
casr info 019c3eae-94c3-7d73-9b2a-9edb18f1563b
casr info 019c3eae-94c3-7d73-9b2a-9edb18f1563b --json
```

### `casr providers`

Show provider detection and installation evidence.

```bash
casr providers
```

### `casr completions <shell>`

Generate shell completions.

```bash
casr completions bash > /tmp/casr.bash
casr completions zsh > "${fpath[1]}/_casr"
casr completions fish > ~/.config/fish/completions/casr.fish
```

## Configuration

`casr` is primarily configured by environment variables.

```bash
# Optional provider home overrides for non-standard locations
export CLAUDE_HOME="$HOME/.claude"
export CODEX_HOME="$HOME/.codex"
export GEMINI_HOME="$HOME/.gemini"
export CURSOR_HOME="$HOME/.config/Cursor"
export CLINE_HOME="$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev"
export AIDER_HOME="$HOME/.aider"
export AMP_HOME="$HOME/.local/share/amp"
export OPENCODE_HOME="$HOME/.opencode"

# Logging verbosity (alternative to --verbose / --trace)
export RUST_LOG="casr=debug"
# or:
export RUST_LOG="casr=trace"
```

## Canonical Session Model

Core model (conceptual):

```text
CanonicalSession
  - session_id: String
  - provider_slug: String
  - workspace: Option<PathBuf>
  - title: Option<String>
  - started_at: Option<epoch_millis>
  - ended_at: Option<epoch_millis>
  - messages: Vec<CanonicalMessage>
  - metadata: serde_json::Value
  - source_path: PathBuf
  - model_name: Option<String>

CanonicalMessage
  - idx: usize
  - role: User | Assistant | Tool | System | Other(String)
  - content: String
  - timestamp: Option<epoch_millis>
  - author: Option<String>
  - tool_calls: Vec<ToolCall>
  - tool_results: Vec<ToolResult>
  - extra: serde_json::Value
```

Important helpers:
- `flatten_content`: normalizes mixed string/block content representations.
- `parse_timestamp`: normalizes ISO strings, epoch seconds, and epoch millis.
- `normalize_role`: maps provider-specific roles to canonical roles.
- `reindex_messages`: keeps message indices contiguous after filtering.

## Architecture

```text
Input CLI
  casr <target> resume <session-id>
          |
          v
Provider Registry + Detection
  - discover installed providers
  - optional --source narrowing
          |
          v
Session Discovery
  - find owning provider + source path
          |
          v
Reader (Provider-specific native format -> CanonicalSession)
  Claude/Codex/Gemini/etc.
          |
          v
Validation
  - hard errors: empty / one-sided sessions
  - warnings/info: missing workspace, timestamp gaps, metadata loss
          |
          v
Writer (CanonicalSession -> target native format)
  - generate target session id
  - preserve provider-specific extras when possible
          |
          v
Atomic Write + Conflict Handling
  - temp file -> fsync -> rename
  - optional --force backup (.bak)
          |
          v
Read-Back Verification
  - re-read written session via target reader
  - compare structural fidelity
          |
          v
Output
  - human output with actionable steps
  - optional JSON output for automation
```

## Why This Is Useful in Day-to-Day Work

`casr` is built for practical agent handoff problems, not only format conversion demos.

- You can switch models mid-task without rebuilding context from scratch.
- You can recover from provider outages or rate limits by moving the same session to another CLI.
- You can keep one durable transcript while changing agent personas and tool stacks.
- You can move a session into the provider that has the strongest tooling for the next step, then move back.

Common examples:
- Start in Codex for rapid code edits, then resume in Claude Code for architecture review.
- Start in Gemini for long context analysis, then resume in Codex for implementation.
- Recover old sessions from one provider and continue them in another after a tooling migration.

## CLI Ergonomics and Alias Normalization

`casr` supports two equivalent resume styles:

- Canonical subcommand form: `casr <target> resume <session-id>`
- Shorthand form: `casr -cc <session-id>`, `casr -cod <session-id>`, `casr -gmi <session-id>`

Shorthand flags are rewritten internally before clap parsing, so logging, JSON output, and error handling stay identical across both forms.

Alias normalization also accepts common provider tokens:

- `claude` maps to `claude-code`
- `codex-cli` maps to `codex`
- `gemini-cli` maps to `gemini`

## Deterministic Resolution Algorithm

The resolver is intentionally strict and deterministic.

1. If `--source` parses as a path, `casr` bypasses provider scanning and resolves from that path.
2. If `--source` parses as an alias, `casr` searches only that provider.
3. If no source hint is provided, `casr` scans installed providers and collects all matches.
4. Zero matches returns `SessionNotFound`.
5. One match proceeds.
6. Multiple matches returns `AmbiguousSessionId` and includes candidates.

Path mode has additional fallback logic when a file is outside known provider roots:

1. Try extension and file-signature heuristics.
2. If heuristics fail, ask each provider parser to read the file.
3. Rank successful parses by plausibility and message count.

Plausibility currently requires at least one user message and one assistant message.

## Detailed Pipeline Contract

The conversion pipeline in `src/pipeline.rs` has a fixed stage order:

1. Resolve target provider from alias.
2. Resolve source session.
3. Read source into canonical IR.
4. Validate canonical session.
5. Optionally prepend synthetic enrichment context (`--enrich`).
6. Short-circuit on `--dry-run`.
7. Short-circuit same-provider conversion when enrichment is not requested.
8. Write target-native session.
9. Re-read written output and verify structural fidelity.

If read-back verification fails, `casr` rolls back written files and restores backups when available. This keeps failed conversions from leaving unverified artifacts in target storage.

## Core Normalization Algorithms

### Content normalization (`flatten_content`)

`casr` accepts several message content shapes and normalizes them into canonical text:

- Plain strings.
- Arrays of text blocks.
- Arrays of Codex-style `input_text` blocks.
- Tool-use blocks with fallback textual descriptions.
- Objects containing `text` or ChatGPT-style `parts`.

This allows each provider adapter to keep format-specific parsing small while still converging on one canonical message representation.

### Timestamp normalization (`parse_timestamp`)

The parser accepts:

- Integer epoch seconds and epoch milliseconds.
- Floating-point seconds.
- Numeric strings.
- RFC3339 and common ISO-8601 formats.

Heuristic detail: values below `100_000_000_000` are treated as seconds; larger values are treated as milliseconds.

### Role normalization and verification buckets

Roles are normalized to `User`, `Assistant`, `Tool`, `System`, or `Other(String)`.
Read-back verification compares role buckets rather than raw role enums for known lossy formats. For example, providers that collapse non-assistant roles into a single user-like entry type still pass verification when semantic intent is preserved.

## Atomic Write and Recovery Semantics

`casr` write operations are temp-then-rename and include rollback behavior:

1. Create parent directories if needed.
2. If target exists and `--force` is not set, return conflict.
3. If target exists and `--force` is set, rename target to a deduplicated backup (`.bak`, `.bak.1`, and so on).
4. Write full content to temp file in the same directory.
5. Flush and `sync_all` temp file.
6. Rename temp file to target path.

If any step fails:

- Temp files are cleaned up.
- Existing backups are restored to original target paths.
- Errors include provider and path context for debugging.

## `casr list` Selection and Ranking Internals

The `list` command is optimized for project-local triage first.

- Default scope is the current working directory project.
- `--workspace` can override scope explicitly.
- Provider-specific path hints are used for fast filtering (`claude-code`, `gemini`).
- Providers that support `list_sessions()` can bypass expensive filesystem walks.
- Fallback directory scans are capped by depth and extension filters.

When sorting by date, probe size is capped to avoid slow scans:

- Workspace-scoped mode uses `max(limit * 3, 30)`.
- Global mode uses `max(limit * 8, 30)`.

`Last Active` is computed from canonical conversation activity and file modification time, then rendered as relative age.

## Performance and Scaling Notes

- Resolution without a source hint is `O(number_of_installed_providers)` for ownership checks.
- Path fallback parsing runs only when root-based ownership and signatures are inconclusive.
- Listing can still be I/O-heavy on very large session trees, but probe caps and provider-native listing APIs keep it bounded in normal use.
- Providers that store many sessions inside one DB/file can implement `list_sessions()` for efficient enumeration and better counts.

## Design Principles Behind the Implementation

- Deterministic behavior over clever heuristics.
- Fail safely with explicit errors and rollback.
- Preserve session content first; preserve provider metadata when practical.
- Prefer additive warnings over hard failure when a conversion is still useful.
- Keep provider adapters independent behind one trait so new providers do not require pipeline rewrites.

## Adding a New Provider

To add a provider, implement the `Provider` trait in `src/providers/<provider>.rs`:

- `detect()`: installation probe with useful evidence strings.
- `session_roots()` and `owns_session()`: discovery hooks.
- `read_session()`: native format to canonical model.
- `write_session()`: canonical model to native format.
- `resume_command()`: exact command users should run after conversion.
- `list_sessions()` (optional): optimized multi-session enumeration for DB-backed providers.

Recommended test set for new providers:

- Reader and writer unit tests for native fixtures.
- Round-trip tests (`read(write(read(...)))`).
- CLI integration test path through `casr list`, `casr info`, and `casr <target> resume`.
- Error-path tests for malformed input and file I/O failures.

## Provider Format Notes

### Claude Code
- Source path pattern: `~/.claude/projects/<project-hash>/<session-id>.jsonl`
- JSONL events: `user`, `assistant`, and other event types (skipped when non-message)
- Writer emits provider-plausible JSONL with expected fields and timestamps.

### Codex
- Source path pattern: `~/.codex/sessions/YYYY/MM/DD/rollout-N.jsonl`
- JSONL events include `session_meta`, `response_item`, and `event_msg` variants.
- Writer emits `session_meta` and response events plus token-count events when available.

### Gemini CLI
- Source path pattern: `~/.gemini/tmp/<hash>/chats/session-<id>.json`
- JSON includes `sessionId`, `projectHash`, `messages`, and temporal fields.
- Writer emits `user` and `model` message types with provider-compatible structure.

### Cursor
- Source path pattern: `~/.config/Cursor/User/globalStorage/state.vscdb`
- SQLite `cursorDiskKV` keys: `composerData:<id>` and `bubbleId:<composerId>:<bubbleId>`.
- `casr` uses a virtual per-session path (`state.vscdb/<encoded-session-id>`) for deterministic lookup and verification.

## Validation Rules

Hard-stop errors:
- No messages.
- Missing either user or assistant messages.

Warnings (conversion continues):
- Missing workspace.
- Missing timestamps.
- Unusual role ordering.
- Very short sessions.
- High malformed-line skip ratio.

Verbose info:
- Tool-call/result mismatch notes.
- Metadata-loss notes.

## Round-Trip and Fidelity Guarantees

Core invariant for each provider `P`:

```text
read_P(write_P(canonical)) ~= canonical
```

Cross-provider invariant:

```text
read_target(write_target(read_source(input))) preserves
  - message order
  - message role intent
  - message text content
  - timestamps (within normalization tolerance)
```

Known expected differences:
- New target session ID is generated.
- Some provider-specific metadata may not map one-to-one.
- Workspace extraction for some providers may be best-effort.

## Testing

### Unit and Integration

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

### End-to-End

```bash
bash scripts/e2e_test.sh
```

### Opt-In Real-Provider Smoke Harness

```bash
bash scripts/real_provider_smoke.sh
```

Notes:
- Uses real provider CLIs and real provider homes (`CLAUDE_HOME`, `CODEX_HOME`, `GEMINI_HOME`, `CURSOR_HOME`).
- Explicitly reports `PASS`/`FAIL`/`SKIP` for each core path: `CC<->Codex`, `CC<->Gemini`, `Codex<->Gemini`.
- Writes detailed artifacts (command transcript, per-path stdout/stderr, matrix) under `artifacts/real-smoke/<timestamp>/`.

Test suite coverage includes:
- Reader and writer tests for all provider adapters.
- Canonical model helper tests (`flatten_content`, `parse_timestamp`, etc.).
- Conversion pipeline tests with mock providers.
- Cross-provider round-trip fidelity matrix tests.
- CLI integration tests with fixture-backed temp directories.
- Full shell-level e2e conversion paths and error scenarios.

## Troubleshooting

### "Session not found"

```bash
casr list
casr info <session-id>
casr cc resume <session-id> --source cod
```

### "Target provider not installed"

Check provider availability:

```bash
casr providers
```

Install the missing provider, then retry.

### "Session already exists in target"

Use force mode to back up and overwrite:

```bash
casr cc resume <session-id> --force
```

### "Write verification failed"

Run in trace mode and inspect JSON diagnostics:

```bash
casr cc resume <session-id> --trace --json
```

### "Wrong source provider was detected"

Pin source provider or session path explicitly:

```bash
casr cc resume <session-id> --source cod
casr cc resume <session-id> --source ~/.codex/sessions/2026/02/06/rollout-1.jsonl
```

## Limitations

- Provider-specific metadata cannot always be preserved perfectly across all provider pairs.
- Provider internal format changes can require reader/writer updates.
- Some workspace extraction paths are heuristic-based (especially when source format lacks explicit workspace).
- Resume acceptance depends on external provider behavior and may vary by provider version.

## FAQ

### Is casr only for one-way migration?

No. It supports bidirectional conversion across supported providers.

### Does casr modify my source session?

No. It reads source sessions and writes to target provider storage.

### What happens when target session file already exists?

By default it stops with a conflict error. With `--force`, it creates a `.bak` backup and overwrites.

### Can I script casr in CI or automation?

Yes. Use `--json` output and non-interactive command patterns.

### How do I debug a failed conversion?

Use `--verbose` or `--trace`, optionally with `RUST_LOG=casr=trace`.

### Can I convert within the same provider?

Yes. Same-provider conversion is handled gracefully and may return a direct resume path/no-op behavior when appropriate.

## About Contributions

*About Contributions:* Please don't take this the wrong way, but I do not accept outside contributions for any of my projects. I simply don't have the mental bandwidth to review anything, and it's my name on the thing, so I'm responsible for any problems it causes; thus, the risk-reward is highly asymmetric from my perspective. I'd also have to worry about other "stakeholders," which seems unwise for tools I mostly make for myself for free. Feel free to submit issues, and even PRs if you want to illustrate a proposed fix, but know I won't merge them directly. Instead, I'll have Claude or Codex review submissions via `gh` and independently decide whether and how to address them. Bug reports in particular are welcome. Sorry if this offends, but I want to avoid wasted time and hurt feelings. I understand this isn't in sync with the prevailing open-source ethos that seeks community contributions, but it's the only way I can move at this velocity and keep my sanity.

## License

MIT License (with OpenAI/Anthropic Rider). See [LICENSE](LICENSE).
