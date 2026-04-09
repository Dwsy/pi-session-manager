# Pi Live vs Pi RPC — Single Source of Truth (Research Report)

> Status: research snapshot based on local repository state and the locally installed `@mariozechner/pi-coding-agent` package.
>
> Purpose: capture the current Pi Live bridge architecture, compare it with real Pi RPC / JSON event stream semantics, document known gaps, and provide a migration reference for future work.

---

## 1. Executive Summary

Pi Session Manager currently implements **Pi Live** through a **bridge extension** running inside Pi, not through Pi's native RPC mode.

That bridge is already fairly close to Pi RPC for the core live control surface:

- `prompt`
- `steer`
- `follow_up`
- `abort`
- `get_state`
- `get_commands`
- `get_available_models`
- `set_model`
- `set_thinking_level`

However, it is **not lossless-equivalent** to native Pi RPC. The largest mismatch is **slash command behavior**:

- native `AgentSession.prompt("/cmd")` goes through extension command handling, skill expansion, and prompt template expansion
- extension-side `pi.sendUserMessage("/cmd")` intentionally does **not**
- therefore a bridge built on extension APIs must emulate slash behavior explicitly if it wants to behave like TUI / RPC

The bridge is best understood as:

> a **TUI-compatible live companion layer** that tries to align with Pi RPC semantics where possible, while still providing PSM-specific session intelligence features (search, recall, rename, tags, etc.).

---

## 2. Terms and Modes

### Pi TUI

Interactive terminal UI running directly on top of `AgentSession`.

Characteristics:

- native editor/input UX
- full interactive slash-command behavior
- direct access to queue/model/thinking state
- extension UI available (`ctx.hasUI = true`)

### Pi RPC mode

Structured JSON-RPC over stdin/stdout.

Characteristics:

- no terminal UI
- machine-oriented protocol
- direct `AgentSession` command surface
- extension UI available through the RPC extension UI sub-protocol (`ctx.hasUI = true`)

### Pi JSON event stream mode

`pi --mode json "prompt"`

Characteristics:

- stdout-only event stream
- no interactive control channel
- no TUI
- extension UI unavailable (`ctx.hasUI = false`)

### Pi Live bridge (current PSM implementation)

Extension + WebSocket bridge between Pi and PSM.

Characteristics:

- Pi continues to run normally (typically with TUI)
- extension forwards live events to PSM
- PSM sends commands back over WebSocket
- bridge translates between PSM live UI and extension APIs
- enables live monitoring plus PSM-only features

---

## 3. Current PSM Pi Live Architecture

### Pi side

- `extensions/pi-session-bridge/src/index.ts`
- `extensions/pi-session-bridge/src/ws-bridge.ts`

Responsibilities:

- connect to PSM over WebSocket
- forward Pi events
- respond to bridge commands
- provide extra PSM-only tools:
  - `session_search`
  - `session_context`
  - `session_recall`
  - `session_rename`
  - `session_tag`

### PSM backend side

- `src-tauri/src/pi_agent_registry.rs`
- `src-tauri/src/server/ws.rs`
- `src-tauri/src/server/http/realtime.rs`
- `src-tauri/src/commands/pi_live.rs`
- `src-tauri/src/dispatch.rs`

Responsibilities:

- maintain connected live sessions
- route live commands to the corresponding Pi extension connection
- forward bridge events to frontend
- expose Tauri/WS/HTTP commands for live UI

### PSM frontend side

- `src/hooks/usePiLive.ts`
- `src/hooks/useSessionViewerData.ts`
- `src/components/pi-live/PiLiveChatInput.tsx`
- `src/components/session-viewer/SessionViewerModelControls.tsx`
- `src/components/session-viewer/SessionViewerOnlineStatusBar.tsx`

Responsibilities:

- display connected live sessions
- render streaming message/tool/queue state
- provide prompt / steer / follow-up / abort controls
- provide model / thinking controls

---

## 4. Native Pi RPC Surface vs Current Bridge Surface

### 4.1 Native Pi RPC commands (relevant subset)

From local `docs/rpc.md`, Pi RPC provides at least:

- `prompt`
- `steer`
- `follow_up`
- `abort`
- `new_session`
- `get_state`
- `get_messages`
- `set_model`
- `cycle_model`
- `get_available_models`
- `set_thinking_level`
- `cycle_thinking_level`
- `set_steering_mode`
- `set_follow_up_mode`
- `compact`
- `set_auto_compaction`
- `set_auto_retry`
- `abort_retry`
- `bash`
- `abort_bash`
- `get_session_stats`
- `export_html`
- `switch_session`
- `fork`
- `get_fork_messages`
- `get_last_assistant_text`
- `set_session_name`
- `get_commands`

### 4.2 Current bridge/live commands exposed by PSM

Current PSM live command surface:

- `pi_agent_prompt`
- `pi_agent_steer`
- `pi_agent_follow_up`
- `pi_agent_abort`
- `pi_agent_get_state`
- `pi_agent_get_commands`
- `pi_agent_get_available_models`
- `pi_agent_set_model`
- `pi_agent_set_thinking_level`

### 4.3 Overlap assessment

#### High-overlap / migration-friendly

- `prompt`
- `steer`
- `follow_up`
- `abort`
- `get_state`
- `get_commands`
- `get_available_models`
- `set_model`
- `set_thinking_level`

#### RPC commands not yet adopted by the current PSM live UX

- `get_messages`
- `cycle_model`
- `cycle_thinking_level`
- `set_steering_mode`
- `set_follow_up_mode`
- `new_session`
- `switch_session`
- `fork`
- `set_session_name`
- `get_last_assistant_text`
- `compact`
- `bash`
- `abort_bash`
- `get_session_stats`
- `export_html`

#### Bridge-only / PSM-only enhancements (not RPC responsibilities)

- `session_search`
- `session_context`
- `session_recall`
- `session_rename`
- `session_tag`
- `/psm`, `/psm-live`, `/psm-connect`, `/psm-disconnect`
- workflow/tag commands such as `/state-*`, `/flow`

### 4.4 Practical conclusion

For the **Live control plane**, overlap is already high enough to support a future migration to a true RPC-backed adapter.

For the **PSM session intelligence layer**, bridge-specific features must remain outside RPC.

---

## 5. Native Pi Event Model vs Current Bridge Event Model

### 5.1 Native AgentSession / JSON stream event model

From local `docs/json.md`, `docs/rpc.md`, and `dist/core/agent-session.js`, the key event types are:

- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `queue_update`
- `compaction_*`
- retry-related events

### 5.2 Current bridge event forwarding

Current bridge forwards:

- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `model_select`
- `auto_compaction_start`
- `auto_compaction_end`
- `queue_update`

Bridge session lifecycle / state events:

- `pi-live:session_registered`
- `pi-live:session_disconnected`
- `pi-live:state_updated`

### 5.3 Event overlap assessment

For live rendering, event overlap is **good**. The bridge is now forwarding the actual event names rather than wrapping them under `pi-agent:entry + eventType`, which is a substantial improvement toward RPC parity.

### 5.4 Remaining difference

Even though the event names align, the bridge still sits **outside** native RPC mode and therefore:

- is susceptible to extension/runtime timing differences
- may need to derive or patch some state locally
- may still diverge on edge cases (especially queue/streaming/slash behavior)

---

## 6. The Slash Command Problem

This is the single biggest semantic mismatch between the bridge and true RPC / TUI behavior.

### 6.1 What native Pi does

From local `dist/core/agent-session.js`:

`AgentSession.prompt(text, options)`:

1. checks extension commands first
2. emits the `input` event
3. expands `/skill:name ...`
4. expands prompt templates
5. then continues into agent processing or queueing

### 6.2 What `sendUserMessage()` does

Also from local `dist/core/agent-session.js`:

`sendUserMessage(content, options)` internally calls:

```ts
prompt(text, {
  expandPromptTemplates: false,
  streamingBehavior: options?.deliverAs,
  source: "extension",
})
```

This means:

- extension command handling is skipped
- skill expansion is skipped
- prompt template expansion is skipped

Therefore:

> `pi.sendUserMessage("/cmd")` does **not** behave like typing `/cmd` in TUI.

### 6.3 What PSM currently does to compensate

Current bridge strategy:

#### Supported directly

- bridge-owned extension commands are intercepted and executed directly from the extension-side `input` event

Examples:

- `/psm`
- `/psm-connect`
- `/psm-disconnect`
- `/psm-live`
- `/steer`
- `/state`
- `/state-set`
- `/state-list`
- `/state-clear`
- `/flow`

#### Prompt templates

The bridge now expands prompt templates by reading template files and applying argument substitution.

#### Skills

The bridge now expands `/skill:name args` into a skill block and appends user args.

#### Unsupported extension commands

Commands owned by other extensions are currently not losslessly executable through the bridge. They are now marked unsupported in the command list instead of being silently mis-sent as ordinary user messages.

### 6.4 Practical conclusion

Slash commands are **not yet lossless-equivalent** to native Pi prompt handling. The bridge now has a practical emulation layer, but not a full native equivalent.

---

## 7. Model List and Model Selection Research

### 7.1 What native RPC does

Pi RPC exposes:

- `get_state`
- `get_available_models`
- `set_model`

From local `docs/rpc.md`, `get_available_models` returns full model objects via:

```json
{
  "type": "response",
  "command": "get_available_models",
  "success": true,
  "data": { "models": [...] }
}
```

### 7.2 Tau-mirror reference

From local `npm pack tau-mirror` inspection:

- Tau explicitly uses **both**
  - `get_state`
  - `get_available_models`
- It does not rely only on a passive state snapshot for model list population

This is important and matches practical behavior observed during debugging.

### 7.3 Current bridge behavior

Current bridge now supports:

- `availableModels` attached to `session_state`
- explicit `get_available_models`

Current PSM model selector uses:

1. `liveSession.availableModels` from live state
2. fallback call to `pi_agent_get_available_models`

### 7.4 Why this matters

Using only UI-local sources such as shelling out to `pi --list-models` is incorrect for Pi Live.

The authoritative source for live model availability should be:

- extension-side `ctx.modelRegistry.getAvailable()`
- exposed over the bridge

This has now been aligned.

---

## 8. Streaming State / `isStreaming`

### 8.1 Native expectation

In native RPC mode, `get_state.isStreaming` comes directly from the session runtime.

### 8.2 Why the bridge initially drifted

Earlier bridge logic attempted to derive streaming state using transient values such as:

- `ctx.isIdle()`
- `turn_end`

This caused visible flapping:

- session still effectively active
- UI toggles between `Live` and `Streaming`

### 8.3 Current bridge approach

The bridge now maintains a more stable runtime signal:

- `agent_start` => streaming true
- `agent_end` => streaming false
- pending queue contributes to perceived liveness

This is closer to native agent lifecycle behavior and should reduce visible state thrashing.

### 8.4 Remaining caveat

The bridge still derives state through extension events rather than reading native RPC session state directly, so this is **better**, but still not identical to a real RPC-backed implementation.

---

## 9. What the Extension API Can Actually Intercept

Based on local `docs/extensions.md` and `dist/core/extensions/types.d.ts`, a Pi extension can intercept / observe:

### Session lifecycle

- `session_start`
- `session_before_switch`
- `session_before_fork`
- `session_before_compact`
- `session_before_tree`
- `session_shutdown`
- `resources_discover`

### Input pipeline

- `input`

### Agent lifecycle

- `before_agent_start`
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `message_start`
- `message_update`
- `message_end`
- `model_select`

### Tool lifecycle

- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `tool_call`
- `tool_result`

### Other

- `user_bash`
- `before_provider_request`
- `context`

### Available control/actions

- `ctx.abort()`
- `ctx.isIdle()`
- `ctx.hasPendingMessages()`
- `ctx.getContextUsage()`
- `pi.getCommands()`
- `pi.setModel()`
- `pi.setThinkingLevel()`
- `pi.sendUserMessage()`
- `pi.sendMessage()`

Notably absent from general event context:

- no direct public `ctx.prompt()` or `session.prompt()` equivalent
- no general direct execution path for arbitrary extension commands belonging to other extensions

This is the main reason bridge-side slash emulation remains incomplete.

---

## 10. Migration Potential: Can PSM Move Toward True RPC?

### 10.1 Short answer

For the **live control plane**, yes — migration potential is high.

For the **full bridge feature set**, no — not everything belongs in RPC.

### 10.2 High-overlap areas (migration-friendly)

- live chat display
- prompt / steer / follow-up
- abort
- queue state
- model selection
- thinking selection
- command listing
- available model listing
- state querying

### 10.3 Low-overlap / bridge-specific areas

- session search / recall / context
- session rename
- tags / workflow state
- PSM session browser / dashboard / analytics
- TUI coexistence / sidecar mirror UX

### 10.4 Realistic migration model

The best future architecture is likely:

#### Layer A — RPC-compatible live runtime adapter

For:

- prompt
- steer
- follow_up
- abort
- get_state
- get_commands
- get_available_models
- set_model
- set_thinking_level
- live event stream

#### Layer B — PSM intelligence layer

For:

- recall/search/context tools
- rename/tags/session workflow
- session management UI
- analytics/dashboard

This would avoid forcing PSM-specific capabilities into native RPC.

---

## 11. Current Recommendation

### 11.1 Near-term

Continue improving the bridge, but only in ways that make later RPC migration easier:

- keep live command names aligned with RPC
- keep event names aligned with AgentSession events
- use bridge state only where extension APIs force it
- avoid inventing new semantics unless absolutely necessary

### 11.2 Medium-term

Introduce an internal abstraction such as:

- `LiveRuntimeAdapter`
- `LiveEventAdapter`

Then provide implementations for:

- current extension bridge
- future native RPC transport

### 11.3 Do not attempt

Do not try to force everything into RPC:

- search / recall / rename / tags belong in the PSM intelligence layer

---

## 12. Final Assessment

### Can current Pi Live migrate to true RPC later?

**Yes, for the live runtime/control plane.**

### Can it be migrated losslessly right now?

**No.**

### Biggest blockers

1. slash command semantics
2. extension-owned command execution outside the bridge's own extension
3. bridge-derived state vs native session state

### Overall judgement

The current bridge is not native RPC, but it is now close enough in the **right places** that future migration is practical — as long as PSM keeps the live runtime layer separate from its session intelligence layer.

---

## 13. Primary Local Sources Used

### Pi docs

- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/rpc.md`
- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`
- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/json.md`
- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/prompt-templates.md`
- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`

### Pi runtime implementation

- `dist/core/agent-session.js`
- `dist/modes/rpc/rpc-mode.js`
- `dist/core/extensions/loader.js`
- `dist/core/extensions/runner.js`
- `dist/core/prompt-templates.js`
- `dist/core/model-registry.d.ts`

### Reference package

- `npm:tau-mirror` (`extensions/mirror-server.ts`, `public/app.js`)

### Current PSM implementation

- `extensions/pi-session-bridge/src/index.ts`
- `extensions/pi-session-bridge/src/ws-bridge.ts`
- `src-tauri/src/pi_agent_registry.rs`
- `src-tauri/src/server/ws.rs`
- `src-tauri/src/server/http/realtime.rs`
- `src-tauri/src/commands/pi_live.rs`
- `src-tauri/src/dispatch.rs`
- `src/hooks/usePiLive.ts`
- `src/hooks/useSessionViewerData.ts`
- `src/components/pi-live/PiLiveChatInput.tsx`
- `src/components/session-viewer/SessionViewerModelControls.tsx`
