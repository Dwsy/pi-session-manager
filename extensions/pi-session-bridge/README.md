# psm-bridge

Bridge Pi agent sessions to Pi Session Manager.

## Features

### Live Mode
Real-time session sync via WebSocket. Events (messages, tool calls, agent turns) are forwarded to PSM as they happen.

```bash
/psm-live on     # Enable live mode
/psm-live off    # Disable live mode
/psm-status      # Check connection status
```

### Search
Full-text search across indexed sessions via PSM's HTTP API.

```
/session_search query="rust async traits"
```

### Tags
SQLite-backed session tagging with built-in and custom tags.

```
/state          # Show current session tags
/state-set wip  # Set tag
/flow start     # Quick transition: todo -> wip
```

### Context Recall
Retrieve surrounding dialogue context from past sessions.

```
/session_recall query="how to fix the bug"
```

### Session Rename
Rename sessions using Pi's native API.

```
/session_rename name="Fix auth bug"
```

## Installation

```bash
pi install npm:Dwsy/psm-bridge
```

## Configuration

```bash
# PSM WebSocket URL (default: ws://127.0.0.1:52131/ws)
export PSM_URL=ws://127.0.0.1:52131/ws

# Optional auth token
export PSM_TOKEN=your-token
```

## Requirements

- Node.js >= 21.0.0
- Pi Session Manager running (for Live mode and search)
- PSM server mode enabled for search functionality

## Available Tools

| Tool | Description |
|------|-------------|
| `session_search` | Full-text search across indexed sessions |
| `session_recall` | Search + retrieve surrounding dialogue context |
| `session_context` | Fetch messages from a specific session |
| `session_tag` | List/set/remove session tags |
| `session_rename` | Rename the current session |

## Available Commands

| Command | Description |
|---------|-------------|
| `/psm` | Show bridge status |
| `/psm-live on/off` | Toggle live mode |
| `/psm-connect` | Manual connect |
| `/psm-disconnect` | Manual disconnect |
| `/steer` | Steer running agent |
| `/state` | Show session tags |
| `/state-set <tag>` | Set tag |
| `/state-list` | List available tags |
| `/state-clear` | Clear all tags |
| `/flow <action>` | Quick transitions |

## Status Indicators

```
[psm]         - Connected
[retry N]     - Reconnecting (attempt N)
[timeout]     - Connection lost
[psm: off]    - Live mode disabled
```

## License

MIT
