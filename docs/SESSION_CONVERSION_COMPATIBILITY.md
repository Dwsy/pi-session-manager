# Session Conversion Compatibility Notes

This document records the compatibility fixes made for external agent session formats that are rendered inside Pi Session Manager (PSM). It is intended as a future reference for debugging or extending session conversion.

## Scope

The fixes cover three external formats:

1. Codex session JSONL, usually stored under `~/.codex/sessions/`.
2. Claude Code session JSONL, usually stored under `~/.claude/projects/`.
3. OpenCode SQLite sessions, usually stored in `~/.local/share/opencode/opencode.db`.

Both formats are normalized into PSM viewer-compatible entries before being rendered by the session viewer.

## Main Rendering Path

For external session files, PSM should prefer the Rust conversion path:

```text
external JSONL
  -> session_bridge::read_canonical_session_from_path
  -> CanonicalSession
  -> session_bridge::preview_canonical_for_viewer
  -> Pi-style viewer JSONL
  -> frontend parseSessionEntriesWithLineCount
  -> SessionEntryRenderer
```

The TypeScript parser in `src/utils/session.ts` still contains fallback parsing for raw external JSONL. That fallback is important for plugins, browser dataset paths, tests, and any case where raw content reaches the frontend without first being converted by Rust.

## Codex JSONL Compatibility

### Reference Shape

Codex session files use JSONL envelope records. Common record forms include:

```json
{"type":"session_meta","timestamp":1737300000.0,"payload":{"id":"...","cwd":"..."}}
{"type":"event_msg","timestamp":1737300001.0,"payload":{"type":"user_message","message":"..."}}
{"type":"event_msg","timestamp":1737300002.0,"payload":{"type":"agent_reasoning","text":"..."}}
{"type":"response_item","timestamp":1737300003.0,"payload":{"role":"assistant","content":[{"type":"output_text","text":"..."}]}}
{"type":"response_item","timestamp":1737300004.0,"payload":{"type":"function_call","call_id":"call_1","name":"shell","arguments":"{...}"}}
{"type":"response_item","timestamp":1737300005.0,"payload":{"type":"function_call_output","call_id":"call_1","output":"..."}}
```

Important details:

- User messages may be stored as `event_msg` with `payload.type = "user_message"`.
- Reasoning may be stored as `event_msg` with `payload.type = "agent_reasoning"`.
- Assistant messages may have no `payload.type`; they may only contain `role` and `content`.
- Tool calls may appear as payload-level `function_call` / `function_call_output` records.
- Tool calls may also appear as content blocks such as `tool_use` and `tool_result`.
- Numeric timestamps are usually seconds and must be converted to milliseconds before producing ISO strings.
- `token_count` events are non-conversational in the current conversion model.

### Fixed Behavior

The frontend raw Codex fallback now:

- Parses `event_msg.user_message` as a user message.
- Parses `event_msg.agent_reasoning` as an assistant `thinking` block.
- Parses `response_item` messages even when `payload.type` is absent.
- Preserves envelope-level timestamps.
- Parses `function_call`, `custom_tool_call`, `function_call_output`, and `custom_tool_call_output`.
- Parses `tool_use` blocks inside `payload.content`.
- Parses stringified tool arguments into structured objects when possible.

The Rust viewer preview now:

- Renders Codex reasoning as a PSM `thinking` block.
- Avoids presenting `reasoning` as a model name.

### Key Files

```text
src/utils/session.ts
src/utils/session.test.ts
src-tauri/src/domain/casr_min/providers/codex.rs
src-tauri/src/domain/casr_min/providers/pi_agent.rs
src-tauri/src/domain/session_bridge/tests.rs
src-tauri/crates/casr/src/providers/codex.rs
```

### Regression Coverage

Relevant tests:

```bash
cargo test -p pi-session-manager --lib codex -- --nocapture
pnpm exec vitest run src/utils/session.test.ts
```

Specific behaviors covered:

- Codex reasoning renders as `thinking`, not as model text.
- Raw Codex `event_msg` records produce viewer entries.
- Raw Codex assistant messages without `payload.type` are preserved.
- Codex timestamps are normalized from seconds to ISO strings.

## Claude Code JSONL Compatibility

### Reference Shape

DeepWiki reference: https://deepwiki.com/claude-code-best/claude-code

Claude Code session files are JSONL records under `~/.claude/projects/`. They use a transcript chain built from `uuid` and `parentUuid`.

Common records look like:

```json
{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"...","cwd":"...","timestamp":"2026-04-08T10:00:01.000Z","message":{"role":"user","content":"..."}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"...","cwd":"...","timestamp":"2026-04-08T10:00:02.000Z","message":{"role":"assistant","model":"claude-opus-4-6","content":[{"type":"thinking","thinking":"..."}]}}
{"type":"assistant","uuid":"a2","parentUuid":"a1","sessionId":"...","cwd":"...","timestamp":"2026-04-08T10:00:03.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"src/auth.ts"}}]}}
{"type":"user","uuid":"u2","parentUuid":"a2","sessionId":"...","cwd":"...","timestamp":"2026-04-08T10:00:04.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file contents","is_error":false}]}}
```

Other record types may appear, including:

- `summary`
- `system`
- `custom-title`
- `tag`
- `file-history-snapshot`
- `attribution-snapshot`
- `content-replacement`
- `queue-operation`

The current canonical conversation conversion treats most of these as non-conversational metadata and skips them.

### Fixed Behavior

The Claude Code conversion now:

- Preserves `thinking`-only assistant content as PSM `thinking` when rendering through the Pi viewer format.
- Preserves `tool_result.content` when it is a string, object, or array of text blocks.
- Applies the same tool-result content handling in both:
  - the lightweight PSM provider: `src-tauri/src/domain/casr_min/providers/claude_code.rs`
  - the vendored CASR provider: `src-tauri/crates/casr/src/providers/claude_code.rs`

This matters because real `~/.claude/projects/` paths may be resolved through the vendored CASR provider first.

### Key Files

```text
src-tauri/src/domain/casr_min/providers/claude_code.rs
src-tauri/crates/casr/src/providers/claude_code.rs
src-tauri/src/domain/casr_min/providers/pi_agent.rs
src-tauri/src/domain/session_bridge/tests.rs
src/utils/session.ts
```

### Regression Coverage

Relevant tests:

```bash
cargo test -p pi-session-manager --lib session_bridge -- --nocapture
cargo test --manifest-path src-tauri/crates/casr/Cargo.toml claude -- --nocapture
```

Specific behaviors covered:

- Claude Code `thinking` blocks survive PSM viewer preview as `thinking` content.
- Claude Code `tool_result.content` arrays are preserved as joined text.
- Claude Code tool calls remain linked to tool results by tool call id.
- The viewer chain keeps parent-child ordering after conversion.

## OpenCode SQLite Compatibility

### Upstream Reference

Repository search confirmed that the active OpenCode repository is:

```text
https://github.com/anomalyco/opencode
```

The older `sst/opencode` path currently resolves to the same repository metadata, but new references should use `anomalyco/opencode`. DeepWiki reference used during the fix:

```text
https://deepwiki.com/anomalyco/opencode
```

Relevant upstream files:

```text
packages/core/src/global.ts
packages/opencode/src/storage/db.ts
packages/opencode/src/session/session.sql.ts
packages/opencode/src/session/message-v2.ts
packages/opencode/migration/20260127222353_familiar_lady_ursula/migration.sql
```

### Reference Shape

Current OpenCode stores local data in a SQLite database named `opencode.db`. The default data directory comes from XDG data paths, commonly:

```text
~/.local/share/opencode/opencode.db
```

The current session schema is table-based:

```text
session(id, project_id, parent_id, slug, directory, title, version, time_created, time_updated, ...)
message(id, session_id, time_created, time_updated, data)
part(id, message_id, session_id, time_created, time_updated, data)
```

`message.data` contains message metadata such as `role`, `modelID`, `providerID`, and timing fields. `part.data` contains independent message parts. Common part shapes include:

```json
{"type":"text","text":"..."}
{"type":"reasoning","text":"...","time":{"start":1700000000000}}
{"type":"tool","callID":"call_1","tool":"read","state":{"status":"completed","input":{"file":"src/main.rs"},"output":"file contents"}}
```

Older compatibility code in PSM assumed a legacy schema:

```text
sessions(id, parent_session_id, title, created_at, updated_at, ...)
messages(id, session_id, role, parts, model, created_at, updated_at, finished_at)
```

In that legacy layout, all parts were stored as a JSON array on `messages.parts`. The current layout stores parts as separate rows in `part`.

### Fixed Behavior

The OpenCode conversion now:

- Discovers the current XDG data path `~/.local/share/opencode/opencode.db` in addition to legacy `.opencode/opencode.db` paths.
- Lists sessions from either current `session` or legacy `sessions` tables.
- Reads current `message` rows and hydrates their `part` rows before building canonical messages.
- Converts `reasoning` parts to PSM `thinking` blocks during viewer preview.
- Converts current `tool` parts into PSM `toolCall` blocks.
- Splits completed/error `tool` states into separate PSM `toolResult` entries so tool output remains visible in the viewer.
- Keeps legacy `sessions/messages` parsing behavior for older synthetic or migrated databases.
- Applies the same current-schema parsing in both the lightweight PSM provider and the vendored CASR provider.

### Key Files

```text
src-tauri/src/domain/casr_min/providers/opencode.rs
src-tauri/crates/casr/src/providers/opencode.rs
src-tauri/src/domain/session_bridge/tests.rs
```

### Regression Coverage

Relevant tests:

```bash
cargo test -p pi-session-manager --lib opencode_current_sqlite_schema_previews_parts_as_pi -- --nocapture
cargo test -p pi-session-manager --lib session_bridge -- --nocapture
cargo test --manifest-path src-tauri/crates/casr/Cargo.toml opencode -- --nocapture
```

Specific behaviors covered:

- Current `session/message/part` schema is accepted.
- Reasoning parts render as `thinking` content.
- Tool calls preserve `callID`, tool name, and structured input.
- Completed tool output renders as a linked `toolResult` entry.

## Verification Commands Used

After the compatibility fixes, these commands passed:

```bash
cargo test -p pi-session-manager --lib session_bridge -- --nocapture
cargo test --manifest-path src-tauri/crates/casr/Cargo.toml claude -- --nocapture
cargo test --manifest-path src-tauri/crates/casr/Cargo.toml opencode -- --nocapture
cargo test -p pi-session-manager --lib codex -- --nocapture
pnpm exec vitest run src/utils/session.test.ts
pnpm exec tsc --noEmit
```

## Known Boundaries

- Codex `token_count` events are still treated as non-conversational and are not currently attached to assistant usage stats in the viewer path.
- Claude Code metadata records such as `summary`, `custom-title`, and `tag` are recognized as part of the upstream format but are not yet promoted to PSM viewer entries by the canonical conversion path.
- The initial external-session viewer path still performs whole-file canonicalization before chunking the converted output. That is correct after these fixes, but large sessions may still need a future streaming conversion path for faster first paint.
