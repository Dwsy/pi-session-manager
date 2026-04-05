# Pi Live Architecture

## Overview

Pi Live enables real-time monitoring and control of Pi agent sessions via WebSocket bridge.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Pi (TypeScript)                                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ pi-session-bridge.ts - Listen to Pi events and forward      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│  PSM Frontend (TypeScript)                                       │
│  ├── usePiLive.ts              - Session state + event listening │
│  ├── types/pi-live.ts          - Unified type definitions         │
│  └── components/pi-live/       - UI components                  │
├─────────────────────────────────────────────────────────────────┤
│  PSM Backend (Rust - Lightweight Pass-through)                  │
│  ├── pi_agent_registry.rs     - In-memory table + RPC queue    │
│  ├── ws_adapter.rs           - WS protocol handling             │
│  └── commands/pi_live.rs     - Command handling                │
└─────────────────────────────────────────────────────────────────┘
```

## Settings

Pi Live is controlled via `settings.piLive`:

```typescript
interface PiLiveSettings {
  enabled: boolean           // Feature toggle, default false
  showInSidebar: boolean   // Show in sidebar
  autoReconnect: boolean  // Auto reconnect
  maxEntries: number      // Max entry cache
  showModelInfo: boolean  // Show model info
  showThinkingLevel: boolean // Show thinking level
}
```

## Events

| Event | Description |
|-------|-------------|
| `pi-agent:register` | New session registered |
| `pi-agent:disconnect` | Session disconnected |
| `pi-agent:entry` | New entry received |
| `pi-agent:session_state` | State updated |

## Commands

| Command | Description |
|--------|-------------|
| `get_pi_live_sessions` | Get session list |
| `pi_agent_steering` | Send steering message |
| `pi_agent_send_message` | Send regular message |
| `pi_agent_set_model` | Set model |
| `pi_agent_set_thinking` | Set thinking level |
| `pi_agent_abort` | Abort generation |

## File Structure

### Frontend

```
src/
├── types/pi-live.ts           # Unified type definitions
├── hooks/
│   ├── usePiLive.ts          # Main hook
│   └── usePiLiveSessions.ts  # Compatibility layer
└── components/
    ├── pi-live/               # Pi Live components
    │   ├── index.ts
    │   ├── PiLivePanel.tsx
    │   ├── PiLiveSessionCard.tsx
    │   ├── PiLiveStatusBar.tsx
    │   └── PiLiveChatInput.tsx
    └── settings/sections/
        └── PiLiveSettings.tsx
```

### Backend

```
src-tauri/src/
├── pi_agent_registry.rs     # In-memory session table
├── ws_adapter.rs           # WS protocol handling
└── commands/
    └── pi_live.rs          # Command handling
```

## Usage

1. Enable in Settings → Pi Live
2. Start a Pi session with `--rpc` flag
3. View live sessions in sidebar
4. Send steering messages via chat input
5. Control model/thinking level via session card
