# Handoff: Codex / Claude Code Converted Session Rendering

## Current Goal

Make converted Codex and Claude Code sessions render correctly in Pi Session Manager, especially tool calls and tool results.

The latest user clarification is important:

> Tool rendering adaptation should use plugins under `extensions/`, not hard-bind provider-specific rendering into the main app.

So the implementation direction should avoid adding Codex/Claude-specific aliases as core built-in renderers in `src/plugins/tools-render/builtins/*`. Instead, add or update extension-based tool renderers under `extensions/` and load them through the existing plugin runtime.

## Important Context

The project already has two relevant systems:

1. Backend/session conversion:
   - `src-tauri/src/domain/session_bridge/preview.rs`
   - `src-tauri/src/domain/session_bridge/vendor.rs`
   - `src-tauri/src/domain/casr_min/providers/pi_agent.rs`
   - `src-tauri/src/domain/casr_min/adapters.rs`
   - `src-tauri/src/commands/session_file.rs`

2. Frontend tool rendering plugin system:
   - `src/plugins/tools-render/registry.ts`
   - `src/plugins/tools-render/types.ts`
   - `src/plugins/tools-render/utils/resolveData.ts`
   - `src/plugins/runtime-host/builtins.ts`
   - `extensions/psm-ask-user-question-renderer/index.tsx`
   - `extensions/psm-loop-renderer/index.tsx`
   - `extensions/psm-subagent-renderer/index.ts`

Existing extension renderers register through:

```ts
ctx.ui.registerToolRenderer(renderer)
```

Examples:

- `extensions/psm-subagent-renderer/index.ts`
- `extensions/psm-loop-renderer/index.tsx`
- `extensions/psm-ask-user-question-renderer/index.tsx`

These are loaded as built-in plugin entries from:

- `src/plugins/runtime-host/builtins.ts`

## Current Work State

No successful implementation patch was applied for this rendering adaptation before the handoff request.

A failed `apply_patch` attempt happened against `src-tauri/src/types/mod.rs`; it exited with an error and did not modify the file. Do not assume Rust `Content` / `Message` structs have been changed.

Task tracker state may be misleading:

- Task #8 was marked completed, but that was premature. Backend contract work was analyzed, not implemented.
- Task #10 was updated to reflect the corrected user requirement: use `extensions/` plugins, not main-program hard binding.

## Prior Completed Work In This Session

CASR was upgraded earlier:

- `src-tauri/crates/casr` synced to upstream `v0.2.2`
- `src-tauri/Cargo.toml` changed to use:
  - `casr = { package = "cross_agent_session_resumer", path = "crates/casr" }`
  - `rusqlite = "0.33"`
- Verified at that point with:
  - `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
  - `cargo fmt --manifest-path src-tauri/crates/casr/Cargo.toml --check`
  - `cargo clippy --manifest-path src-tauri/Cargo.toml -p cross_agent_session_resumer --all-targets -- -D warnings`
  - `cargo test --manifest-path src-tauri/Cargo.toml -p cross_agent_session_resumer --test roundtrip_test`
  - `cargo test --manifest-path src-tauri/Cargo.toml -p pi-session-manager session_bridge`

There is an accidental untracked temp directory from a clone attempt:

- `mktemp -d/`

Do not delete it without explicit permission, because project instructions forbid deletion without user approval.

## Findings About Rendering Flow

### Backend path

For non-Pi sessions, `src-tauri/src/commands/session_file.rs` calls `transformed_session_content`, which uses `session_bridge` to parse source sessions and produce Pi-preview JSONL.

Relevant flow:

1. `read_canonical_session_from_path`
2. `preview_canonical_for_viewer`
3. Pi-style JSONL preview
4. frontend parses with `parseSessionEntriesWithLineCount`
5. viewer renders ordinary `SessionEntry[]`

### Frontend path

Tool calls render through `AssistantMessage`:

- `src/components/messages/AssistantMessage.tsx`

It finds `content` blocks where `type === 'toolCall'`, then calls:

- `toolRenderRegistry.findPlugin(toolCall)`
- `plugin.resolveData?.(...) ?? defaultResolveData(...)`

Tool results are linked by:

- `src/hooks/useSessionViewerDerivedData.ts`

The key contract is:

```ts
entry.message.role === 'toolResult'
entry.message.toolCallId === toolCall.id
```

If `message.toolCallId` is missing, `toolResultByCallId` will not contain the result, so tool cards will render without output.

## Known Risks / Gaps

### 1. Frontend raw Codex fallback parser does not link tool results

In `src/utils/session.ts`, Codex `function_call_output` currently becomes a `toolResult` message with `id = payload.call_id`, but it does not set `message.toolCallId`.

This breaks tool-result lookup if raw Codex is parsed directly instead of going through backend transformed preview.

Recommended fix:

```ts
message: {
  role: 'toolResult',
  toolCallId: payload.call_id,
  content: [...]
}
```

### 2. Frontend raw Claude Code fallback parser flattens tool_result to text

In `src/utils/session.ts`, `convertClaudeContentItem` converts `tool_result` blocks to plain text content. If a raw Claude Code line is parsed directly, the tool result is not represented as `role: 'toolResult'` with `message.toolCallId`.

Recommended fix needs care because Claude Code represents tool results as a user line containing `tool_result` content. The parser should detect that shape and emit a `toolResult` message when appropriate.

### 3. Rust `Content` type may not carry tool metadata in adapter path

`src-tauri/src/domain/casr_min/adapters.rs` currently creates tool calls like:

```rust
Content { content_type: "toolCall".to_string(), text: Some(tool_call.name.clone()) }
```

But frontend expects tool call blocks to have `id`, `name`, and `arguments`.

If `canonical_to_session_entries` is used for viewer or DB return paths, Rust structs may need optional fields added:

- `Content.id`
- `Content.name`
- `Content.arguments`
- `Message.toolCallId`
- `Message.toolName`
- `Message.isError`

However, avoid backend UI-specific name aliasing. Backend should preserve semantic fields only.

## Corrected Implementation Direction

Do not implement Codex / Claude Code renderer adaptation as hard-coded core builtins.

Instead:

1. Ensure converted data has a stable generic tool contract.
2. Add an extension under `extensions/`, for example:
   - `extensions/psm-cross-agent-tool-renderer/`
3. Register one or more tool renderers through `ctx.ui.registerToolRenderer`.
4. Add this extension to `src/plugins/runtime-host/builtins.ts` if it should ship as a built-in extension.
5. Keep unknown tools on generic fallback.

## Suggested Extension Design

Create a built-in extension, tentatively:

- `extensions/psm-cross-agent-tool-renderer/index.tsx`
- `extensions/psm-cross-agent-tool-renderer/manifest.ts`

It should register renderers for cross-agent aliases.

Possible matcher groups:

- Claude Code:
  - `Read`
  - `Write`
  - `Edit`
  - `MultiEdit`
  - `Bash`
- Codex / generic function tools:
  - `read_file`
  - `write_file`
  - `edit_file`
  - `apply_patch`
  - `shell`
  - `exec`
  - `bash`

But keep phase 1 conservative. Do not force tools into specialized cards if the argument/output shape does not fit. For uncertain tools, let generic fallback render the args/output.

Best first phase:

- Add shell aliases -> shell-style card, if SDK can reuse or mirror core card behavior.
- Add read/write/edit aliases only when arguments clearly contain file path fields.
- Otherwise use a generic cross-agent tool card with better title normalization.

## Important Plugin API Types

Use types from `@pi-session-manager/plugin-sdk` as shown in existing extensions:

```ts
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
} from '@pi-session-manager/plugin-sdk'
```

Renderer registration shape examples exist in:

- `extensions/psm-loop-renderer/index.tsx`
- `extensions/psm-ask-user-question-renderer/index.tsx`
- `extensions/psm-subagent-renderer/index.ts`

## Recommended Execution Plan

### Step 1: Data contract tests first

Add tests before implementation to lock shape.

Backend:

- `src-tauri/src/domain/session_bridge/tests.rs`

Extend existing tests:

- `codex_mixed_event_array_discards_bootstrap_and_keeps_conversation_chain`
- `claude_tool_result_chain_survives_pi_preview`
- `canonical_entries_form_single_chain_for_viewer`

Assert:

- assistant tool call content has `id`, `name`, `arguments`
- tool result message has `toolCallId`
- `toolCallId` equals the tool call id

Frontend:

- `src/utils/session.test.ts`
- `src/hooks/useSessionViewerDerivedData.test.ts`
- `src/components/session-viewer/ConversationPreviewMessages.test.tsx`

Assert:

- Codex fallback maps `function_call_output.call_id` to `message.toolCallId`
- Claude fallback maps `tool_result.tool_use_id` to `message.toolCallId`
- `useSessionViewerDerivedData` builds `toolResultByCallId`
- conversation preview expands and shows tool output

### Step 2: Minimal backend semantic fields only if tests show missing fields

If `session_bridge` preview already emits correct `toolCall.id/name/arguments` and `toolResult.message.toolCallId`, do not change backend.

If not, update:

- `src-tauri/src/types/mod.rs`
- `src-tauri/src/domain/casr_min/adapters.rs`
- possibly `src-tauri/src/commands/session_file.rs` parser if deserialization drops fields

Use optional serde fields so existing Pi sessions remain compatible.

### Step 3: Fix frontend raw fallback parser

Update:

- `src/utils/session.ts`

Target only raw fallback compatibility:

- Codex `function_call_output` sets `message.toolCallId`
- Claude `tool_result` emits a `toolResult` entry or a message with enough shape for result linking

Avoid adding renderer decisions here.

### Step 4: Add extension plugin under `extensions/`

Create extension folder if needed:

- `extensions/psm-cross-agent-tool-renderer/`

Register with runtime in:

- `src/plugins/runtime-host/builtins.ts`

Keep the extension self-contained.

It should adapt display, not source parsing.

### Step 5: Verification

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p pi-session-manager session_bridge
pnpm vitest run src/utils/session.test.ts src/hooks/useSessionViewerDerivedData.test.ts src/components/session-viewer/ConversationPreviewMessages.test.tsx src/components/session-viewer/ToolCallReviewModal.test.ts
```

If UI changed, run app and manually inspect:

```bash
pnpm dev
```

Manual checks:

- Converted Codex session with `function_call` and `function_call_output`
- Converted Claude Code session with `tool_use` and `tool_result`
- Assistant text renders
- Tool process summary renders
- Expanded tool shows name, args, output, error state
- Search can find tool output
- Tool Review modal sees converted tool operation

## Files Likely To Touch

Most likely:

- `extensions/psm-cross-agent-tool-renderer/index.tsx`
- `extensions/psm-cross-agent-tool-renderer/manifest.ts`
- `src/plugins/runtime-host/builtins.ts`
- `src/utils/session.ts`
- `src/utils/session.test.ts`
- `src/hooks/useSessionViewerDerivedData.test.ts`
- `src/components/session-viewer/ConversationPreviewMessages.test.tsx`

Only if data contract is missing:

- `src-tauri/src/types/mod.rs`
- `src-tauri/src/domain/casr_min/adapters.rs`
- `src-tauri/src/domain/session_bridge/tests.rs`

## Current Dirty Worktree Notes

The repository already has many unrelated modified files. Do not revert or clean them.

Relevant current pending changes from earlier CASR upgrade include:

- `src-tauri/Cargo.toml`
- `src-tauri/crates/casr/*`

Untracked accidental directory:

- `mktemp -d/`

Do not delete without user permission.

## Caution For Next Agent

The user explicitly corrected the approach: renderer adaptation must be plugin-based under `extensions/`, not bound into the main program. If you continue implementation, revise the approved plan mentally around that constraint.

The previous approved plan file is:

- `/Users/dengwenyu/.claude/plans/silly-drifting-kitten.md`

It is useful for background, but it contains a now-superseded suggestion about built-in matcher aliases. The correct current approach is extension-based renderer adaptation.
