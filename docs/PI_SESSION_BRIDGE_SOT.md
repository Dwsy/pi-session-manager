# Pi Session Bridge — Single Source of Truth

Live session integration between Pi coding agent and the psm desktop app.

## Architecture

```
┌──────────────────────┐         WebSocket (port 52131)          ┌──────────────────┐
│  Pi Extension        │ ───────────────────────────────────────► │  psm Rust Backend │
│  pi-session-bridge.ts│ │  register / pi-agent:entry /            │  http_adapter     │
│                      │ │  session_state / set_model / steer     │  dispatch.rs      │
│  Broadcasts:         │ ◄────────────────────────────────────── │  pi_agent_registry│
│  - message_update    │ │  pong / steer / set_model /           │                   │
│  - model_select      │ │  get_state / abort                    │                   │
│  - thinking changes  │                                          │                   │
└──────────────────────┘                                          └────────┬─────────┘
                                                                          │
┌──────────────────────┐                                    ┌─────────────▼─────────┐
│  SessionList.tsx     │                                    │  WebSocketTransport   │
│  liveSessionIds?     │◄───────────────────────────────────│  (Tauri / WS / HTTP)  │
│  🟢 pulse indicator  │   pi-agent:register / pi-agent:entry│                       │
└──────────────────────┘                                    └─────────────┬─────────┘
                                                                          │
┌──────────────────────┐                                    ┌─────────────▼─────────┐
│  SessionViewer       │                                    │  usePiLiveSessions    │
│  useSessionViewerData│◄───────────────────────────────────│  get_pi_live_sessions  │
│  pi-agent:entry      │   message entries, live merge       │  liveSessionIds Set   │
│  typing effect       │                                    │                       │
└──────────────────────┘                                    └───────────────────────┘
```

## Extension (`extensions/pi-session-bridge.ts`)

Single-file Pi extension. Connects to psm (`ws://127.0.0.1:52131/ws`) and bridges a running Pi session.

### Lifecycle

| Event | Action |
|-------|--------|
| `session_start` | Extract sessionId/sessionPath from `ctx.sessionManager.getSessionFile()`. Connect WS. Send `register`. Broadcast first 50 history entries. |
| `session_shutdown` | Disconnect, clean up. |

### Message Protocol

**→ Sends to psm:**

| Type | Payload | When |
|------|---------|------|
| `register` | `{ sessionId, sessionPath, pid, cwd }` | On connect / reconnect |
| `pi-agent:entry` | `{ sessionId, sessionPath, payload: { eventType, entry } }` | Every Pi event (message_, tool_execution_, model_select, turn_, etc.) |
| `session_state` | `{ model, thinkingLevel, contextUsage }` | On register, `model_select`, `turn_start`, `turn_end` |
| `{ "pong": true }` | — | Responds to psm heartbeat ping |

**← Receives from psm:**

| Type | Payload | Action |
|------|---------|--------|
| `steer` | `{ message: string }` | `pi.sendUserMessage(msg, { deliverAs: "steer" })` |
| `abort` | — | `latestCtx.abort()` |
| `set_model` | `{ provider, modelId }` | `pi.setModel(model)` via registry lookup |
| `set_thinking` | `{ level: string }` | `pi.setThinkingLevel(level)` |
| `get_state` | — | Triggers `broadcastSessionState()` |
| `ping` / `{ ping: true }` | — | Responds with `{ type: "pong" }` |

### Heartbeat

- Ping interval: `15_000ms` (every 15s)
- Timeout: `30_000ms` (no pong for 30s → dead)
- psm format: `{ ping: true }` → `{ pong: true }`

### Reconnect

- Base delay: `3000ms`, multiplier: `1.5`, max: `30_000ms`
- On reconnect: sends `register` then `session_state` automatically

### Commands

| Command | Args | Description |
|---------|------|-------------|
| `psm` | — | Show bridge status |
| `psm-connect` | — | Force reconnect |
| `psm-disconnect` | — | Disconnect |
| `steer` | text | Steer running agent |

## Rust Backend

### `pi_agent_registry.rs`

In-memory registry of live Pi sessions. Manages state for all connected Pi agents.

### `http_adapter/realtime.rs`

Handles WebSocket connections in dev mode. Intercepts:
- `pi-agent:register` → calls `registry.register()` + broadcasts `pi-agent:register` event
- `pi-agent:entry` → calls `registry.record_entry()` + broadcasts `pi-agent:entry` event
- All other commands → delegates to `ws_adapter::dispatch()`

### `ws_adapter.rs`

Handles WebSocket connections in standalone CLI mode. Same pi-agent string matching + dispatch.

### `dispatch.rs`

Shared command dispatch. `get_pi_live_sessions` uses `Option<SharedAppState>`:
- `Some(state)` → returns `state.pi_agent_registry.list()`
- `None` → returns error "requires GUI mode"

### `main.rs`

`get_pi_live_sessions` registered in `.invoke_handler(tauri::generate_handler![...])` for Tauri IPC.

## Frontend

### `usePiLiveSessions.ts`

Hook that queries `get_pi_live_sessions` via `invoke()` and auto-refreshes on `pi-agent:register`/`pi-agent:entry` events.

Returns: `{ sessions: LiveSessionInfo[], liveSessionIds: Set<string>, refresh }`

### `SessionList.tsx`

Accepts `liveSessionIds?: Set<string>` prop. Shows a green animated pulse (`w-2 h-2 rounded-full bg-green-500 animate-pulse`) next to the message count for sessions that are actively streaming.

### `useSessionViewerData.ts`

Listens to `pi-agent:entry` events. When sessionId matches the current session:
- Merges message/tool_execution entries in real time
- Deduplicates against existing entries by `entry.id`
- Updates active entry ID and scroll position
- Updates cache
- Triggers "new messages" indicator when not scrolled to bottom

### `App.tsx`

```
const { liveSessionIds } = usePiLiveSessions();
// passed to useSidebarSessions → sessionListCommonProps.liveSessionIds
```

## Data Flow

```
Pi Event (message_update)
  → Extension: forward("message_update", event)
  → psm: registry.record_entry(sessionId, "message_update")
  → psm: broadcast "pi-agent:entry" via event_tx
  → Frontend: WebSocket transport receives event
  → useSessionViewerData: listen('pi-agent:entry')
  → sessionId match → mergeEntries → setEntries()
  → SessionViewerMessages: re-renders with new entry (typing effect)
```

## Key Files

| File | Responsibility |
|------|---------------|
| `extensions/pi-session-bridge.ts` | Pi extension, WS client, event forwarding |
| `src-tauri/src/pi_agent_registry.rs` | Rust state manager for live sessions |
| `src-tauri/src/http_adapter/realtime.rs` | WS handler in dev mode, pi-agent protocol interception |
| `src-tauri/src/ws_adapter.rs` | WS handler in standalone CLI mode |
| `src-tauri/src/dispatch.rs` | Shared command dispatch |
| `src-tauri/src/main.rs` | Tauri IPC command registration |
| `src/hooks/usePiLiveSessions.ts` | Frontend live session query hook |
| `src/hooks/useSessionViewerData.ts` | Session data + pi-agent:entry listener |
| `src/components/SessionList.tsx` | Session list with live pulse indicator |
| `src/App.tsx` | Wires everything together |

## Tauri IPC Entry for Commands

All commands used by Tauri IPC must be listed in `main.rs`'s `.invoke_handler()`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... other commands ...
    pi_session_manager::get_pi_live_sessions,
    // ...
])
```

Commands not in this list return "Command X not found" in Tauri IPC mode even if they exist in `dispatch.rs`. This was the root cause of the initial debugging issue.

## Port Configuration

- Default: `52131`
- Single port: HTTP API (`/api`) + WebSocket (`/ws`) + static assets
- Bind: `127.0.0.1` (loopback, no auth required)
