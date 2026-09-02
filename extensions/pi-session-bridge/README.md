# psm-bridge

Bridge Pi agent sessions to Pi Session Manager — live sync, search, Kanban Status/Labels, and context recall.

## Architecture

```
src/
├── config.ts               # Env vars + constants (port, WS URL, heartbeat)
├── types.ts                # Shared interfaces (aligned with PSM backend)
├── psm-client.ts           # HTTP client for PSM's POST /api dispatch
├── bridge-connection.ts    # WebSocket connection + heartbeat + RPC
├── connection-manager.ts   # Live mode lifecycle, event forwarding, RPC handling
├── tools.ts                # LLM-callable tools (search, context, recall, status, labels)
├── commands.ts             # /psm bridge panel + /kanban custom TUI popup
├── env.d.ts                # Pi runtime type declarations
└── index.ts                # Extension entry point
```

## Features

### /psm — Bridge Panel

Bridge connection controls only:

```
 PSM Bridge
   Status:    ● connected
   Live Mode: OFF
   Session:   abc123...
 → ● Connect / ○ Disconnect
   ○ Live: OFF (toggle on)
   Close
```

### /kanban — Custom TUI Popup

Kanban workflow metadata opens as a centered TUI overlay instead of being buried inside `/psm`. Status is single-value; Labels are independent and multi-value:

```
 Kanban — session abc123...
 Status: in-progress
 Labels: backend, urgent

 Status
 > ( ) todo
   (●) in-progress

 Labels
   [x] backend #0969da — Backend work
   [x] urgent  #d1242f

 Enter/Space set/toggle · c clear status · s new status · l new label · r refresh · q close
```

### Live Mode

Real-time session sync via WebSocket. When connected:

- **Event forwarding**: agent_start/end, turn_start/end, message_start/update/end, tool_execution_start/update/end, tool_call/result, model_select, thinking_level_select
- **RPC handling**: PSM can send prompt, steer, follow_up, abort, set_model, set_thinking_level, get_state, get_commands, get_available_models
- **Session state sync**: current model, available models, thinking level, context usage, and agent streaming state
- **Remote command parity**: slash commands are discovered from Pi at runtime; remote prompts expand extension commands, skills, and prompt templates just like local Pi input; prompt/steer/follow-up preserve Pi-compatible image payloads and streaming delivery behavior
- **Model control**: model changes resolve against Pi's live ModelRegistry and report unavailable/unauthenticated models instead of silently accepting invalid IDs
- **Abort semantics**: remote abort calls Pi's real abort API instead of injecting a synthetic steer message

### LLM Tools

| Tool | Description |
|------|-------------|
| `session_search` | Full-text search across indexed sessions |
| `session_recall` | Search + retrieve surrounding dialogue context |
| `session_context` | Fetch messages from a specific session |
| `session_status` | List/set/clear the single workflow Status |
| `session_label` | List/add/remove GitHub-style multi Labels |

`session_search` 可选参数：

- `query`：搜索文本（必填）
- `roleFilter`：`all | user | assistant`，默认 `all`
- `matchMode`：`any | all | phrase`，默认 `any`
- `pageSize`：返回数量，1~20，默认 `8`
- `sortOrder`：`relevance | newest | oldest`，默认 `relevance`
- `from`：开始时间（RFC3339，可选）
- `to`：结束时间（RFC3339，可选）
- `projectPath`：按会话 `cwd` 精确匹配项目路径（可选）

### Kanban Status & Labels

The bridge shares the same file-backed Kanban SSOT as Pi Session Manager. Legacy `tags_config.json` + `session_mark.json` remain the persistence compatibility layer for Status, so existing Tag data is preserved and interpreted deterministically as one current Status per session. Setting a Status rewrites only that session's legacy assignments to a single assignment.

GitHub-style Labels are stored independently in `~/.pi/pi-session-manager/plugin-config/builtin.kanban-board/labels.json`; they support multiple assignments plus name, `#RRGGBB` color, and description. `/kanban`, `session_status`, and `session_label` all read and write these same files.

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
