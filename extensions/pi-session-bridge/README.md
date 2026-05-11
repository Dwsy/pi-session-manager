# psm-bridge

Bridge Pi agent sessions to Pi Session Manager — live sync, search, tags, and context recall.

## Architecture

```
src/
├── config.ts               # Env vars + constants (port, WS URL, heartbeat)
├── types.ts                # Shared interfaces (aligned with PSM backend)
├── psm-client.ts           # HTTP client for PSM's POST /api dispatch
├── bridge-connection.ts    # WebSocket connection + heartbeat + RPC
├── connection-manager.ts   # Live mode lifecycle, event forwarding, RPC handling
├── tools.ts                # LLM-callable tools (search, context, recall, tag)
├── commands.ts             # Single /psm interactive panel
├── env.d.ts                # Pi runtime type declarations
└── index.ts                # Extension entry point
```

## Features

### /psm — Interactive Panel

Single entry point for all bridge operations:

```
 PSM Bridge
   Status:    ● connected
   Live Mode: OFF
   Session:   abc123...
 → ● Connect / ○ Disconnect
   ○ Live: OFF (toggle on)
   ─── Tags ───
     Manage Tags...    ← select picker (●/○ toggle)
     Clear All Tags
   ───
     Close
```

### Live Mode

Real-time session sync via WebSocket. When connected:

- **Event forwarding**: agent_start/end, turn_start/end, message_start/update/end, tool_execution_start/update/end, tool_call/result, model_select
- **RPC handling**: PSM can send prompt, steer, follow_up, set_model, set_thinking_level, get_state, abort
- **Session state sync**: model, thinking level, streaming state

### LLM Tools

| Tool | Description |
|------|-------------|
| `session_search` | Full-text search across indexed sessions |
| `session_recall` | Search + retrieve surrounding dialogue context |
| `session_context` | Fetch messages from a specific session |
| `session_tag` | List/set/remove session tags |

### Tags

All tag operations use PSM's backend API (no local SQLite). Tags are managed via the `/psm` panel's "Manage Tags..." picker or the `session_tag` LLM tool.

## Configuration

```bash
# PSM port (auto-read from ~/.pi/pi-session-manager/config.json)
# Fallback: 52131
export PSM_URL=ws://127.0.0.1:5002/ws

# Optional auth token
export PSM_TOKEN=your-token
```

## Requirements

- Node.js >= 21.0.0
- Pi Session Manager running (for live mode and search)

## Status Indicators

```
[psm]         - Connected
[retry N]     - Reconnecting (attempt N)
[timeout]     - Connection lost
(no indicator) - Live mode off
```
