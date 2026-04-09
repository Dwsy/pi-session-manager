# AGENTS.md — casr (Cross Agent Session Resumer)

> Guidelines for AI coding agents working in this Rust codebase.

---

## RULE 0 - THE FUNDAMENTAL OVERRIDE PREROGATIVE

If I tell you to do something, even if it goes against what follows below, YOU MUST LISTEN TO ME. I AM IN CHARGE, NOT YOU.

---

## RULE NUMBER 1: NO FILE DELETION

**YOU ARE NEVER ALLOWED TO DELETE A FILE WITHOUT EXPRESS PERMISSION.** Even a new file that you yourself created, such as a test code file. You have a horrible track record of deleting critically important files or otherwise throwing away tons of expensive work. As a result, you have permanently lost any and all rights to determine that a file or folder should be deleted.

**YOU MUST ALWAYS ASK AND RECEIVE CLEAR, WRITTEN PERMISSION BEFORE EVER DELETING A FILE OR FOLDER OF ANY KIND.**

---

## Irreversible Git & Filesystem Actions — DO NOT EVER BREAK GLASS

> **Note:** This project reads and writes real session artifacts across provider directories. Treat destructive commands as high-risk operations that can permanently wipe recoverable session history.

1. **Absolutely forbidden commands:** `git reset --hard`, `git clean -fd`, `rm -rf`, or any command that can delete or overwrite code/data must never be run unless the user explicitly provides the exact command and states, in the same message, that they understand and want the irreversible consequences.
2. **No guessing:** If there is any uncertainty about what a command might delete or overwrite, stop immediately and ask the user for specific approval. "I think it's safe" is never acceptable.
3. **Safer alternatives first:** When cleanup or rollbacks are needed, request permission to use non-destructive options (`git status`, `git diff`, `git stash`, copying to backups) before ever considering a destructive command.
4. **Mandatory explicit plan:** Even after explicit user authorization, restate the command verbatim, list exactly what will be affected, and wait for a confirmation that your understanding is correct. Only then may you execute it—if anything remains ambiguous, refuse and escalate.
5. **Document the confirmation:** When running any approved destructive command, record (in the session notes / final response) the exact user text that authorized it, the command actually run, and the execution time. If that record is absent, the operation did not happen.

---

## Git Branch: ONLY Use `main`, NEVER `master`

**The default branch is `main`. The `master` branch exists only for legacy URL compatibility.**

- **All work happens on `main`** — commits, PRs, feature branches all merge to `main`
- **Never reference `master` in code or docs** — if you see `master` anywhere, it's a bug that needs fixing
- **The `master` branch must stay synchronized with `main`** — after pushing to `main`, also push to `master`:
  ```bash
  git push origin main:master
  ```

**If you see `master` referenced anywhere:**
1. Update it to `main`
2. Ensure `master` is synchronized: `git push origin main:master`

---

## Toolchain: Rust & Cargo

We only use **Cargo** in this project, NEVER any other package manager.

- **Edition:** Rust 2024 (nightly required — see `rust-toolchain.toml`)
- **Dependency versions:** Explicit versions for stability
- **Configuration:** Cargo.toml only (single crate, not a workspace)
- **Unsafe code:** Forbidden (`#![forbid(unsafe_code)]`)

### Key Dependencies

| Crate | Purpose |
|-------|---------|
| `clap` + `clap_complete` | CLI argument parsing and shell completions (`casr <target> resume <session-id>`) |
| `serde` + `serde_json` | Canonical session model + provider format parsing/writing |
| `anyhow` + `thiserror` | Internal propagation + actionable user-facing errors |
| `chrono` | Timestamp normalization (ISO-8601, epoch seconds/millis) |
| `walkdir` + `dirs` + `which` | Provider detection and session discovery |
| `glob` | Pattern matching for file paths |
| `rusqlite` | SQLite session storage (bundled) |
| `uuid` | Target session ID generation |
| `sha2` | Content hashing for deduplication and integrity |
| `colored` | Terminal colors with TTY detection |
| `urlencoding` | URL encoding for provider path handling |
| `tracing` + `tracing-subscriber` | Structured debug/trace logging |
| `vergen-gix` | Build metadata embedding (build.rs) |

### Release Profile

The release build optimizes for binary size:

```toml
[profile.release]
opt-level = "z"     # Optimize for size (lean binary for distribution)
lto = true          # Link-time optimization
codegen-units = 1   # Single codegen unit for better optimization
panic = "abort"     # Smaller binary, no unwinding overhead
strip = true        # Remove debug symbols
```

---

## Code Editing Discipline

### No Script-Based Changes

**NEVER** run a script that processes/changes code files in this repo. Brittle regex-based transformations create far more problems than they solve.

- **Always make code changes manually**, even when there are many instances
- For many simple changes: use parallel subagents
- For subtle/complex changes: do them methodically yourself

### No File Proliferation

If you want to change something or add a feature, **revise existing code files in place**.

**NEVER** create variations like:
- `mainV2.rs`
- `main_improved.rs`
- `main_enhanced.rs`

New files are reserved for **genuinely new functionality** that makes zero sense to include in any existing file. The bar for creating new files is **incredibly high**.

---

## Backwards Compatibility

We do not care about backwards compatibility—we're in early development with no users. We want to do things the **RIGHT** way with **NO TECH DEBT**.

- Never create "compatibility shims"
- Never create wrapper functions for deprecated APIs
- Just fix the code directly

---

## Compiler Checks (CRITICAL)

**After any substantive code changes, you MUST verify no errors were introduced:**

```bash
# Check for compiler errors and warnings
cargo check --all-targets

# Check for clippy lints (pedantic + nursery are enabled)
cargo clippy --all-targets -- -D warnings

# Verify formatting
cargo fmt --check
```

If you see errors, **carefully understand and resolve each issue**. Read sufficient context to fix them the RIGHT way.

---

## Testing

### Testing Policy

Every module includes inline `#[cfg(test)]` unit tests alongside the implementation. Tests must cover:
- Happy path
- Edge cases (empty input, max values, boundary conditions)
- Error conditions

Integration tests live in the `tests/` directory.

### Unit Tests

```bash
# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test module
cargo test model
cargo test providers
cargo test pipeline
cargo test discovery
```

### End-to-End Testing

```bash
# Run the E2E test script
./scripts/e2e_test.sh

# Or test manually
cargo run --release -- providers
cargo run --release -- list --limit 10

cargo run --release -- cc resume <session-id> --dry-run
# Should show planned conversion without writing files
```

### Test Categories

| Module | Tests | Purpose |
|--------|-------|---------|
| `model_tests` | Canonical helpers + timestamp/content normalization | Core IR correctness |
| `provider_reader_tests` | Claude/Codex/Gemini/Aider/Amp/ChatGPT/Cline/Cursor/OpenCode/etc. parsing fixtures | Native-to-canonical fidelity |
| `provider_writer_tests` | Writer output + read-back compatibility | Canonical-to-native fidelity |
| `pipeline_tests` | Detection/read/validate/write/verify orchestration | End-to-end correctness |
| `discovery_tests` | Provider detection + session lookup | Fast and accurate ownership resolution |
| `round_trip_tests` | Cross-provider path matrix | Conversion invariants |
| `cli_integration_tests` | CLI UX + JSON output + error paths | User-facing behavior |
| `e2e_script_tests` | Shell-level workflow validation | Realistic full-flow coverage |
| `golden_output_tests` | Snapshot-based output comparison | Output format stability |
| `fixtures_tests` | Fixture-driven provider parsing | Provider format coverage |
| `scalability_tests` | Large session handling | Performance under load |
| `malformed_input_tests` | Corrupt/invalid data handling | Graceful degradation |
| `corrupted_sqlite_tests` | Broken SQLite recovery | Resilience |

### Test Fixtures

Test fixtures are stored in `tests/fixtures/` with per-provider format samples and expected canonical outputs.

---

## CI/CD Pipeline

### Jobs Overview

| Job | Trigger | Purpose | Blocking |
|-----|---------|---------|----------|
| `check` | PR, push | Format, clippy, UBS, unit tests | Yes |
| `coverage` | PR, push | Coverage thresholds | Yes |
| `roundtrip` | PR, push | Cross-provider fidelity matrix | Yes |
| `e2e` | PR, push | End-to-end shell conversion tests | Yes |
| `perf-regression` | PR, push | Discovery/parse/write perf budgets | Yes |
| `build` | PR, push | Release profile compile sanity | Yes |

### Check Job

Runs format, clippy, UBS static analysis, and unit tests. Includes:
- `cargo fmt --check` - Code formatting
- `cargo clippy --all-targets -- -D warnings` - Lints (pedantic + nursery enabled)
- UBS analysis on changed Rust files (warning-only, non-blocking)
- `cargo nextest run` - Full test suite with JUnit XML report

### Coverage Job

Runs `cargo llvm-cov` and enforces thresholds:
- **Overall:** >= 70%
- **src/model.rs:** >= 80%
- **src/pipeline.rs:** >= 80%

Coverage is uploaded to Codecov for trend tracking.

### Round-Trip Job

Runs the cross-provider matrix to enforce format fidelity:
- CC<->Cod
- CC<->Gmi
- Cod<->Gmi

Checks message count/role/content preservation and timestamp tolerance.

### E2E Job

Runs `./scripts/e2e_test.sh` with isolated provider homes (`CLAUDE_HOME`, `CODEX_HOME`, `GEMINI_HOME`) and validates:
- all conversion paths
- `--dry-run` and `--force`
- conflict handling + backup behavior
- JSON output mode
- verbose/trace diagnostics

### Perf Regression Job

Tracks critical hot paths:
- provider detection latency
- session ID lookup latency
- per-message parse throughput
- write+verify pipeline latency

### UBS Static Analysis

Ultimate Bug Scanner runs on changed Rust files. Currently warning-only (non-blocking) while tuning false positives. Configuration in `.ubsignore` excludes fixture-heavy and generated directories.

### Debugging CI Failures

#### Coverage Threshold Failure
1. Check which file(s) dropped below threshold in CI output
2. Run `cargo llvm-cov --html` locally to see uncovered lines
3. Add tests for uncovered code paths
4. Download `coverage-report` artifact for full details

#### Round-Trip Failure
1. Check failing provider path pair in CI summary
2. Run locally: `cargo test round_trip -- --nocapture`
3. Compare canonical session diffs (role/content/timestamp)
4. Fix reader/writer mismatch and re-run matrix

#### E2E Failure
1. Download `e2e-artifacts` artifact
2. Check `e2e_output.json` for failing test details
3. Run locally: `./scripts/e2e_test.sh --verbose`
4. The step summary shows the first failure with output

#### Benchmark Regression
1. Download `benchmark-results` artifact
2. Compare against budgets in `src/perf.rs`
3. Profile locally with targeted provider/pipeline benches
4. Check for algorithmic regressions in discovery and parsing hot paths

#### UBS Warnings
1. Check ubs-output.log in CI summary
2. Review flagged issues - may be false positives
3. If valid issues, fix them; if false positives, add to `.ubsignore`

---

## Release Process

When fixes are ready for release, follow this process:

### 1. Verify CI Passes Locally

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --lib
```

### 2. Commit Changes

```bash
git add -A
git commit -m "fix: description of fixes

- List specific fixes
- Include any breaking changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### 3. Bump Version (if needed)

The version in `Cargo.toml` determines the release tag. If the current version already has a failed release, you can reuse it. Otherwise bump appropriately:

- **Patch** (0.1.0 -> 0.1.1): Bug fixes, no new features
- **Minor** (0.1.x -> 0.2.0): New features, backward compatible
- **Major** (0.x -> 1.0): Breaking changes

### 4. Push and Trigger Release

```bash
git push origin main
git push origin main:master  # Keep master in sync
```

The `release-automation.yml` workflow will:
1. Detect version change in `Cargo.toml`
2. Create an annotated git tag (e.g., `v0.1.1`)
3. Push the tag, which triggers `dist.yml`

The `dist.yml` workflow will:
1. Run tests and clippy
2. Build binaries for all platforms (Linux x86/ARM, macOS Intel/Apple Silicon, Windows)
3. Create `.tar.xz` archives with SHA256 checksums
4. Sign artifacts with Sigstore (cosign) - creates `.sigstore.json` bundles
5. Upload everything to GitHub Releases

### 5. Verify Release

```bash
gh release list --limit 5
gh release view v0.1.1  # Check assets were uploaded
```

Expected assets per release:
- `casr-{target}.tar.xz` - Binary archive
- `casr-{target}.tar.xz.sha256` - Checksum
- `casr-{target}.tar.xz.sigstore.json` - Sigstore signature bundle
- `install.sh`, `install.ps1` - Install scripts

### Troubleshooting Failed Releases

If CI fails:
1. Check workflow run: `gh run list --workflow=dist.yml --limit=5`
2. View failed job: `gh run view <run-id>`
3. Fix issues locally, commit, and push again
4. The same version tag will be updated on successful build

Common failures:
- **Clippy errors**: Fix lints, ensure `cargo clippy -- -D warnings` passes
- **Test failures**: Run `cargo test --lib` to reproduce
- **Format errors**: Run `cargo fmt` to fix

---

## Third-Party Library Usage

If you aren't 100% sure how to use a third-party library, **SEARCH ONLINE** to find the latest documentation and current best practices.

---

## casr (Cross Agent Session Resumer) — This Project

**This is the project you're working on.** casr is a high-fidelity Rust CLI that lets users resume sessions across AI coding providers by converting through a canonical intermediate representation (IR).

### What It Does

Converts AI coding assistant sessions between providers (Claude Code, Codex, Gemini CLI, Aider, Amp, ChatGPT, Cline, Cursor, OpenCode, Clawdbot, Factory, OpenClaw, Pi Agent, Vibe) so you can resume work in a different tool without losing conversation context.

### Architecture

```
CLI Input
  -> Provider Detection + Session Discovery
  -> Read Native Session Format (source provider)
  -> CanonicalSession IR
  -> Validation + Warnings
  -> Write Native Session Format (target provider)
  -> Read-back Verification
  -> Print Target Resume Command
```

### Project Structure

```
cross_agent_session_resumer/
├── Cargo.toml                        # Single crate (not a workspace)
├── build.rs                          # vergen-gix build metadata
├── src/
│   ├── main.rs                       # Clap CLI and output rendering
│   ├── lib.rs                        # Public library entry points
│   ├── model.rs                      # Canonical session/message types + normalization helpers
│   ├── discovery.rs                  # Provider registry, detection, cross-provider session lookup
│   ├── pipeline.rs                   # Detect->read->validate->write->verify orchestration
│   ├── error.rs                      # Actionable typed errors (thiserror)
│   └── providers/
│       ├── mod.rs                    # Provider trait + provider wiring
│       ├── claude_code.rs            # Claude Code reader/writer
│       ├── codex.rs                  # Codex reader/writer
│       ├── gemini.rs                 # Gemini CLI reader/writer
│       ├── aider.rs                  # Aider reader/writer
│       ├── amp.rs                    # Amp reader/writer
│       ├── chatgpt.rs               # ChatGPT reader/writer
│       ├── cline.rs                  # Cline reader/writer
│       ├── cursor.rs                 # Cursor reader/writer
│       ├── opencode.rs              # OpenCode reader/writer
│       ├── clawdbot.rs              # Clawdbot reader/writer
│       ├── factory.rs               # Factory reader/writer
│       ├── openclaw.rs              # OpenClaw reader/writer
│       ├── pi_agent.rs             # Pi Agent reader/writer
│       └── vibe.rs                  # Vibe reader/writer
├── tests/                            # Integration tests
├── scripts/                          # E2E and smoke test scripts
└── docs/                             # Design docs and porting notes
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main.rs` | Clap CLI and output rendering |
| `src/lib.rs` | Public library entry points |
| `src/model.rs` | Canonical session/message types + normalization helpers |
| `src/discovery.rs` | Provider registry, detection, cross-provider session lookup |
| `src/pipeline.rs` | Detect->read->validate->write->verify orchestration |
| `src/error.rs` | Actionable typed errors (`thiserror`) |
| `src/providers/mod.rs` | `Provider` trait + provider wiring |
| `src/providers/claude_code.rs` | Claude Code reader/writer |
| `src/providers/codex.rs` | Codex reader/writer |
| `src/providers/gemini.rs` | Gemini reader/writer |
| `scripts/e2e_test.sh` | End-to-end conversion matrix tests |

### Provider System

- casr is built around a `Provider` trait (`detect`, `owns_session`, `read_session`, `write_session`, `resume_command`).
- Core aliases:
  - `cc` -> Claude Code
  - `cod` -> Codex
  - `gmi` -> Gemini CLI
- Provider home overrides:
  - `CLAUDE_HOME`
  - `CODEX_HOME`
  - `GEMINI_HOME`

### CLI Surface

- Primary flow: `casr <target-alias> resume <session-id>`
- Inspection flows:
  - `casr list`
  - `casr info <session-id>`
  - `casr providers`
- Power flags:
  - `--dry-run`
  - `--force`
  - `--json`
  - `--source <alias_or_path>`
  - `--verbose`
  - `--trace`
  - `--enrich`

### Output Modes

This tool has two output modes:

- **Human-readable CLI output:** Colorized progress, warnings, and next-step resume command
- **JSON output (`--json`):** Structured machine-readable output for automation

Output behavior:
- **Success:** Summary of source provider, conversion result, and exact resume command
- **Dry run:** What would be converted/written without filesystem changes
- **Error:** Actionable message with remediation hints
- **--version/-V:** Version info with build metadata
- **--help/-h:** Usage information

Colors are automatically disabled when stderr is not a TTY (e.g., piped to file).

### Adding New Providers

1. Implement `Provider` in `src/providers/<provider>.rs`
2. Add provider to the default registry wiring
3. Implement `detect()` and path probes with env override support
4. Implement `read_session()` into canonical IR
5. Implement `write_session()` back to provider-native format
6. Add fixtures + reader/writer tests + round-trip tests
7. Add e2e coverage for conversion paths involving the new provider
8. Update CLI docs and provider alias mapping

### Provider Format Notes (for contributors)

- **Round-trip fidelity first:** Preserve provider-specific fields in `session.metadata` and `message.extra` whenever they do not map cleanly to canonical fields.
- **Graceful parsing:** Malformed lines/events should be skipped with warnings when possible; only fail hard when the session is unusable.
- **Timestamp normalization:** Accept ISO-8601, epoch seconds, and epoch milliseconds; canonicalize to epoch millis internally.
- **Workspace handling:** Prefer explicit workspace fields, then heuristic extraction. Never invent ungrounded paths.
- **Tests:** Prefer targeted tests in `src/providers/*.rs`, `src/model.rs`, and `src/pipeline.rs`.
  - `cargo test providers`
  - `cargo test model`
  - `cargo test pipeline`
  - Add positive and negative fixtures for each provider format variation.

### Performance Requirements

casr runs in interactive CLI loops, so latency matters:

- Fast provider detection with minimal filesystem probes
- Early short-circuit session ID ownership checks
- Streaming-friendly JSONL parsing for large sessions
- No unnecessary allocations in hot discovery/parsing paths
- Conversion should remain responsive for long multi-hundred-message sessions

### Key Design Decisions

- **Canonical IR** as the central pivot format — all providers read into and write from `CanonicalSession`
- **Read-back verification** — after writing, re-read the output and compare to catch serialization bugs
- **Actionable errors** — every error type includes remediation hints for the user
- **Provider auto-detection** — probes filesystem in priority order, short-circuits on first match
- **Streaming JSONL** — large sessions parsed line-by-line, not loaded entirely into memory
- **Build metadata via vergen** — `--version` shows git SHA, build timestamp, rustc version
- **Sigstore-signed releases** — binary authenticity verification via cosign

---

<!-- casr-machine-readable-v1 -->

## CASR CLI Protocol (Machine-Readable Reference)

> This section provides structured documentation for agents integrating with casr.

### Command Input Format

casr is a command-line tool (not a hook protocol). Primary command shape:

```bash
casr <target> resume <session-id> [--source <alias_or_path>] [--dry-run] [--force] [--json] [--verbose|--trace] [--enrich]
```

Additional command shapes:

```bash
casr list [--provider <slug>] [--workspace <path>] [--limit <n>] [--sort <field>] [--json]
casr info <session-id> [--json]
casr providers [--json]
casr completions <bash|zsh|fish>
```

### JSON Output Format (`--json`)

Successful conversion (representative shape):

```json
{
  "ok": true,
  "source_provider": "codex",
  "target_provider": "claude-code",
  "source_session_id": "019c3eae-94c3-7d73-9b2a-9edb18f1563b",
  "target_session_id": "40f2cb68-fed7-4cee-83de-2b63ba9b7813",
  "written_paths": [
    "/home/user/.claude/projects/<hash>/40f2cb68-fed7-4cee-83de-2b63ba9b7813.jsonl"
  ],
  "resume_command": "claude --resume 40f2cb68-fed7-4cee-83de-2b63ba9b7813",
  "warnings": []
}
```

Error (representative shape):

```json
{
  "ok": false,
  "error_type": "SessionNotFound",
  "message": "Session abc123 not found. Run 'casr list' to discover available sessions.",
  "context": {
    "session_id": "abc123",
    "providers_checked": ["claude-code", "codex", "gemini"]
  }
}
```

### Exit Codes Reference

| Code | Meaning | Agent Action |
|------|---------|--------------|
| `0` | Success | Parse stdout (text or JSON) |
| `1` | Runtime/domain failure (not found, parse failure, validation failure, write failure) | Inspect error output and retry with corrected inputs |
| `2` | CLI usage error (invalid args/flags) | Re-run with valid command/flags |

### Error Types Reference

casr exposes actionable error classes (names may appear in JSON mode and logs):

- `SessionNotFound`
- `ProviderNotInstalled`
- `ProviderNotDetected`
- `SessionReadError`
- `SessionWriteError`
- `SessionConflict`
- `ValidationError`

### Canonical Session Format Reference

Core canonical types:

- `CanonicalSession`
  - `session_id`
  - `provider_slug`
  - `workspace`
  - `title`
  - `started_at` / `ended_at` (epoch millis)
  - `messages`
  - `metadata`
  - `source_path`
  - `model_name`
- `CanonicalMessage`
  - `idx`
  - `role` (`User|Assistant|Tool|System|Other`)
  - `content`
  - `timestamp` (epoch millis)
  - `author`
  - `tool_calls`
  - `tool_results`
  - `extra`

### Provider Format Specs (Core)

- Claude Code:
  - Reads/writes JSONL under `~/.claude/projects/<project-hash>/`
  - Session file naming follows provider-compatible session ID conventions
- Codex:
  - Reads/writes JSONL under `~/.codex/sessions/YYYY/MM/DD/rollout-N.jsonl`
  - Supports `session_meta`, `response_item`, and relevant `event_msg` variants
- Gemini CLI:
  - Reads/writes JSON under `~/.gemini/tmp/<hash>/chats/session-<id>.json`
  - Normalizes `type: model` as canonical assistant role

### Round-Trip Testing Invariants

Provider-local invariant:

```text
read_P(write_P(canonical)) ~ canonical
```

Cross-provider invariant:

```text
read_target(write_target(read_source(input))) preserves message order/roles/content
with expected, documented metadata loss where schemas differ.
```

### Agent Integration Checklist

When integrating with casr, ensure your agent:

- [ ] Runs `casr providers` before conversion attempts in unknown environments
- [ ] Uses `casr list` / `casr info` to disambiguate session IDs
- [ ] Uses `--source` when provider auto-detection is ambiguous
- [ ] Parses `--json` output for automation instead of scraping human text
- [ ] Treats `SessionConflict` as recoverable with explicit `--force`
- [ ] Surfaces warnings (workspace/timestamp/metadata-loss) to users
- [ ] Uses `--dry-run` before risky conversions in production environments

### JSON Schema Reference

Formal JSON schemas for CLI JSON output should live in `docs/json-schema/`:

| Schema | Purpose |
|--------|---------|
| `conversion-result.json` | `resume --json` success/failure envelope |
| `session-list.json` | `list --json` output |
| `session-info.json` | `info --json` output |
| `providers.json` | `providers --json` output |
| `error.json` | Shared actionable error envelope |

Use these schemas for:
- validating automation pipelines
- generating typed client bindings
- enforcing stable machine-readable contracts

<!-- end-casr-machine-readable -->

---

## MCP Agent Mail — Multi-Agent Coordination

A mail-like layer that lets coding agents coordinate asynchronously via MCP tools and resources. Provides identities, inbox/outbox, searchable threads, and advisory file reservations with human-auditable artifacts in Git.

### Why It's Useful

- **Prevents conflicts:** Explicit file reservations (leases) for files/globs
- **Token-efficient:** Messages stored in per-project archive, not in context
- **Quick reads:** `resource://inbox/...`, `resource://thread/...`

### Same Repository Workflow

1. **Register identity:**
   ```
   ensure_project(project_key=<abs-path>)
   register_agent(project_key, program, model)
   ```

2. **Reserve files before editing:**
   ```
   file_reservation_paths(project_key, agent_name, ["src/**"], ttl_seconds=3600, exclusive=true)
   ```

3. **Communicate with threads:**
   ```
   send_message(..., thread_id="FEAT-123")
   fetch_inbox(project_key, agent_name)
   acknowledge_message(project_key, agent_name, message_id)
   ```

4. **Quick reads:**
   ```
   resource://inbox/{Agent}?project=<abs-path>&limit=20
   resource://thread/{id}?project=<abs-path>&include_bodies=true
   ```

### Macros vs Granular Tools

- **Prefer macros for speed:** `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`, `macro_contact_handshake`
- **Use granular tools for control:** `register_agent`, `file_reservation_paths`, `send_message`, `fetch_inbox`, `acknowledge_message`

### Common Pitfalls

- `"from_agent not registered"`: Always `register_agent` in the correct `project_key` first
- `"FILE_RESERVATION_CONFLICT"`: Adjust patterns, wait for expiry, or use non-exclusive reservation
- **Auth errors:** If JWT+JWKS enabled, include bearer token with matching `kid`

---

## Beads (br) — Dependency-Aware Issue Tracking

Beads provides a lightweight, dependency-aware issue database and CLI (`br` - beads_rust) for selecting "ready work," setting priorities, and tracking status. It complements MCP Agent Mail's messaging and file reservations.

**Important:** `br` is non-invasive—it NEVER runs git commands automatically. You must manually commit changes after `br sync --flush-only`.

### Conventions

- **Single source of truth:** Beads for task status/priority/dependencies; Agent Mail for conversation and audit
- **Shared identifiers:** Use Beads issue ID (e.g., `br-123`) as Mail `thread_id` and prefix subjects with `[br-123]`
- **Reservations:** When starting a task, call `file_reservation_paths()` with the issue ID in `reason`

### Typical Agent Flow

1. **Pick ready work (Beads):**
   ```bash
   br ready --json  # Choose highest priority, no blockers
   ```

2. **Reserve edit surface (Mail):**
   ```
   file_reservation_paths(project_key, agent_name, ["src/**"], ttl_seconds=3600, exclusive=true, reason="br-123")
   ```

3. **Announce start (Mail):**
   ```
   send_message(..., thread_id="br-123", subject="[br-123] Start: <title>", ack_required=true)
   ```

4. **Work and update:** Reply in-thread with progress

5. **Complete and release:**
   ```bash
   br close 123 --reason "Completed"
   br sync --flush-only  # Export to JSONL (no git operations)
   ```
   ```
   release_file_reservations(project_key, agent_name, paths=["src/**"])
   ```
   Final Mail reply: `[br-123] Completed` with summary

### Mapping Cheat Sheet

| Concept | Value |
|---------|-------|
| Mail `thread_id` | `br-###` |
| Mail subject | `[br-###] ...` |
| File reservation `reason` | `br-###` |
| Commit messages | Include `br-###` for traceability |

---

## bv — Graph-Aware Triage Engine

bv is a graph-aware triage engine for Beads projects (`.beads/beads.jsonl`). It computes PageRank, betweenness, critical path, cycles, HITS, eigenvector, and k-core metrics deterministically.

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). For agent-to-agent coordination (messaging, work claiming, file reservations), use MCP Agent Mail.

**CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command
```

### Command Reference

**Planning:**
| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with `unblocks` lists |
| `--robot-priority` | Priority misalignment detection with confidence |

**Graph Analysis:**
| Command | Returns |
|---------|---------|
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles, k-core, articulation points, slack |
| `--robot-label-health` | Per-label health: `health_level`, `velocity_score`, `staleness`, `blocked_count` |
| `--robot-label-flow` | Cross-label dependency: `flow_matrix`, `dependencies`, `bottleneck_labels` |
| `--robot-label-attention [--attention-limit=N]` | Attention-ranked labels |

**History & Change Tracking:**
| Command | Returns |
|---------|---------|
| `--robot-history` | Bead-to-commit correlations |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues, cycles |

**Other:**
| Command | Returns |
|---------|---------|
| `--robot-burndown <sprint>` | Sprint burndown, scope changes, at-risk items |
| `--robot-forecast <id\|all>` | ETA predictions with dependency-aware scheduling |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |
| `--export-graph <file.html>` | Interactive HTML visualization |

### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank
bv --robot-triage --robot-triage-by-track    # Group by parallel work streams
bv --robot-triage --robot-triage-by-label    # Group by domain
```

### Understanding Robot Output

**All robot JSON includes:**
- `data_hash` — Fingerprint of source beads.jsonl
- `status` — Per-metric state: `computed|approx|timeout|skipped` + elapsed ms
- `as_of` / `as_of_commit` — Present when using `--as-of`

**Two-phase analysis:**
- **Phase 1 (instant):** degree, topo sort, density
- **Phase 2 (async, 500ms timeout):** PageRank, betweenness, HITS, eigenvector, cycles

### jq Quick Reference

```bash
bv --robot-triage | jq '.quick_ref'                        # At-a-glance summary
bv --robot-triage | jq '.recommendations[0]'               # Top recommendation
bv --robot-plan | jq '.plan.summary.highest_impact'        # Best unblock target
bv --robot-insights | jq '.status'                         # Check metric readiness
bv --robot-insights | jq '.Cycles'                         # Circular deps (must fix!)
```

---

## UBS — Ultimate Bug Scanner

**Golden Rule:** `ubs <changed-files>` before every commit. Exit 0 = safe. Exit >0 = fix & re-run.

### Commands

```bash
ubs file.rs file2.rs                    # Specific files (< 1s) — USE THIS
ubs $(git diff --name-only --cached)    # Staged files — before commit
ubs --only=rust,toml src/               # Language filter (3-5x faster)
ubs --ci --fail-on-warning .            # CI mode — before PR
ubs .                                   # Whole project (ignores target/, Cargo.lock)
```

### Output Format

```
Warning  Category (N errors)
    file.rs:42:5 - Issue description
    Suggested fix
Exit code: 1
```

Parse: `file:line:col` -> location | Suggested fix -> how to fix | Exit 0/1 -> pass/fail

### Fix Workflow

1. Read finding -> category + fix suggestion
2. Navigate `file:line:col` -> view context
3. Verify real issue (not false positive)
4. Fix root cause (not symptom)
5. Re-run `ubs <file>` -> exit 0
6. Commit

### Bug Severity

- **Critical (always fix):** Memory safety, use-after-free, data races, SQL injection
- **Important (production):** Unwrap panics, resource leaks, overflow checks
- **Contextual (judgment):** TODO/FIXME, println! debugging

---

## RCH — Remote Compilation Helper

RCH offloads `cargo build`, `cargo test`, `cargo clippy`, and other compilation commands to a fleet of 8 remote Contabo VPS workers instead of building locally. This prevents compilation storms from overwhelming csd when many agents run simultaneously.

**RCH is installed at `~/.local/bin/rch` and is hooked into Claude Code's PreToolUse automatically.** Most of the time you don't need to do anything if you are Claude Code — builds are intercepted and offloaded transparently.

To manually offload a build:
```bash
rch exec -- cargo build --release
rch exec -- cargo test
rch exec -- cargo clippy
```

Quick commands:
```bash
rch doctor                    # Health check
rch workers probe --all       # Test connectivity to all 8 workers
rch status                    # Overview of current state
rch queue                     # See active/waiting builds
```

If rch or its workers are unavailable, it fails open — builds run locally as normal.

**Note for Codex/GPT-5.2:** Codex does not have the automatic PreToolUse hook, but you can (and should) still manually offload compute-intensive compilation commands using `rch exec -- <command>`. This avoids local resource contention when multiple agents are building simultaneously.

---

## ast-grep vs ripgrep

**Use `ast-grep` when structure matters.** It parses code and matches AST nodes, ignoring comments/strings, and can **safely rewrite** code.

- Refactors/codemods: rename APIs, change import forms
- Policy checks: enforce patterns across a repo
- Editor/automation: LSP mode, `--json` output

**Use `ripgrep` when text is enough.** Fastest way to grep literals/regex.

- Recon: find strings, TODOs, log lines, config values
- Pre-filter: narrow candidate files before ast-grep

### Rule of Thumb

- Need correctness or **applying changes** -> `ast-grep`
- Need raw speed or **hunting text** -> `rg`
- Often combine: `rg` to shortlist files, then `ast-grep` to match/modify

### Rust Examples

```bash
# Find structured code (ignores comments)
ast-grep run -l Rust -p 'fn $NAME($$$ARGS) -> $RET { $$$BODY }'

# Find all unwrap() calls
ast-grep run -l Rust -p '$EXPR.unwrap()'

# Quick textual hunt
rg -n 'println!' -t rust

# Combine speed + precision
rg -l -t rust 'unwrap\(' | xargs ast-grep run -l Rust -p '$X.unwrap()' --json
```

---

## Morph Warp Grep — AI-Powered Code Search

**Use `mcp__morph-mcp__warp_grep` for exploratory "how does X work?" questions.** An AI agent expands your query, greps the codebase, reads relevant files, and returns precise line ranges with full context.

**Use `ripgrep` for targeted searches.** When you know exactly what you're looking for.

**Use `ast-grep` for structural patterns.** When you need AST precision for matching/rewriting.

### When to Use What

| Scenario | Tool | Why |
|----------|------|-----|
| "How is pattern matching implemented?" | `warp_grep` | Exploratory; don't know where to start |
| "Where is the quick reject filter?" | `warp_grep` | Need to understand architecture |
| "Find all uses of `Regex::new`" | `ripgrep` | Targeted literal search |
| "Find files with `println!`" | `ripgrep` | Simple pattern |
| "Replace all `unwrap()` with `expect()`" | `ast-grep` | Structural refactor |

### warp_grep Usage

```
mcp__morph-mcp__warp_grep(
  repoPath: "/dp/cross_agent_session_resumer",
  query: "How does provider detection and session lookup work?"
)
```

Returns structured results with file paths, line ranges, and extracted code snippets.

### Anti-Patterns

- **Don't** use `warp_grep` to find a specific function name -> use `ripgrep`
- **Don't** use `ripgrep` to understand "how does X work" -> wastes time with manual reads
- **Don't** use `ripgrep` for codemods -> risks collateral edits

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking. Issues are stored in `.beads/` and tracked in git.

**Important:** `br` is non-invasive—it NEVER executes git commands. After `br sync --flush-only`, you must manually run `git add .beads/ && git commit`.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
br ready              # Show issues ready to work (no blockers)
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br create --title="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason "Completed"
br close <id1> <id2>  # Close multiple issues at once
br sync --flush-only  # Export to JSONL (NO git operations)
```

### Workflow Pattern

1. **Start**: Run `br ready` to find actionable work
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Run `br sync --flush-only` then manually commit

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads to JSONL
git add .beads/         # Stage beads changes
git commit -m "..."     # Commit everything together
git push                # Push to remote
```

### Best Practices

- Check `br ready` at session start to find available work
- Update status as you work (in_progress -> closed)
- Create new issues with `br create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `br sync --flush-only && git add .beads/` before ending session

<!-- end-bv-agent-instructions -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Sync beads** - `br sync --flush-only` to export to JSONL
5. **Hand off** - Provide context for next session


---

## cass — Cross-Agent Session Search

`cass` indexes prior agent conversations (Claude Code, Codex, Cursor, Gemini, ChatGPT, etc.) so we can reuse solved problems.

**Rules:** Never run bare `cass` (TUI). Always use `--robot` or `--json`.

### Examples

```bash
cass health
cass search "async runtime" --robot --limit 5
cass view /path/to/session.jsonl -n 42 --json
cass expand /path/to/session.jsonl -n 42 -C 3 --json
cass capabilities --json
cass robot-docs guide
```

### Tips

- Use `--fields minimal` for lean output
- Filter by agent with `--agent`
- Use `--days N` to limit to recent history

stdout is data-only, stderr is diagnostics; exit code 0 means success.

Treat cass as a way to avoid re-solving problems other agents already handled.

---

Note for Codex/GPT-5.2:

You constantly bother me and stop working with concerned questions that look similar to this:

```
Unexpected changes (need guidance)

- Working tree still shows edits I did not make in Cargo.toml, Cargo.lock, src/cli/commands/upgrade.rs, src/storage/sqlite.rs, tests/conformance.rs, tests/storage_deps.rs. Please advise whether to keep/commit/revert these before any further work. I did not touch them.

Next steps (pick one)

1. Decide how to handle the unrelated modified files above so we can resume cleanly.
2. Triage beads_rust-orko (clippy/cargo warnings) and beads_rust-ydqr (rustfmt failures).
3. If you want a full suite run later, fix conformance/clippy blockers and re-run cargo test --all.
```

NEVER EVER DO THAT AGAIN. The answer is literally ALWAYS the same: those are changes created by the potentially dozen of other agents working on the project at the same time. This is not only a common occurence, it happens multiple times PER MINUTE. The way to deal with it is simple: you NEVER, under ANY CIRCUMSTANCE, stash, revert, overwrite, or otherwise disturb in ANY way the work of other agents. Just treat those changes identically to changes that you yourself made. Just fool yourself into thinking YOU made the changes and simply don't recall it for some reason.

---

## Note on Built-in TODO Functionality

Also, if I ask you to explicitly use your built-in TODO functionality, don't complain about this and say you need to use beads. You can use built-in TODOs if I tell you specifically to do so. Always comply with such orders.
