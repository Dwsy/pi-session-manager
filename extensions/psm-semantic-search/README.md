# psm-semantic-search

Built-in PSM plugin for host-managed Pi Agent ReAct session search.

## Features

- **Host-managed Pi Agent workflow** via `ctx.psm.agent`
- **Controlled ReAct tools** for session search, session reading, and opening sessions
- **Project/Global scope** in the prompt contract
- **Role and time hints** passed to the agent workflow
- **Keyboard navigation** in the AppView UI
- **Tool trace ready output** through `toolResults`

## Architecture

```
User Query
    │
    ▼
Semantic Search Plugin
    │
    ▼
ctx.psm.agent.createSession()
    │
    ▼
Host-managed Pi SDK AgentSession
    │
    ├─ psm.search.fulltext
    ├─ psm.sessions.readEntries
    └─ psm.sessions.open
    │
    ▼
Ranked answer + tool trace
```

The plugin does not own model credentials or Pi session persistence. PSM resolves the model from host settings and stores agent sessions through plugin-scoped storage.
It does not use legacy `ctx.psm.ai` or `ctx.psm.sidechat` helpers.

## Permissions

- `agent:invoke` — create and run host-managed Pi SDK agent sessions
- `model:invoke` — allow PSM to resolve and invoke the selected model
- `sessions:read` — read and open session data
- `search:read` — run full-text session search

## Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultScope` | select | `project` | Default search scope |
| `maxResults` | number | `20` | Max results to display |
| `enableAiExpansion` | boolean | `true` | Legacy UI setting; ReAct search now lets the agent decide expansion |

## Tool Contract

Tool name: `semantic_search`

Input:

```json
{
  "query": "auth bug",
  "scope": "project",
  "roleFilter": "all",
  "timeRange": "7d",
  "maxResults": 10
}
```

Output:

```json
{
  "success": true,
  "sessionId": "agent-1",
  "storageKey": "builtin.semantic-search:semantic-search",
  "answer": "ranked result summary",
  "toolResults": []
}
```

## Keyboard Shortcuts

- `Cmd+Shift+F` — Open semantic search
- `↑/↓` — Navigate results
- `Enter` — Open selected session
- `Escape` — Clear search

## Build

```bash
cd extensions/psm-semantic-search
pnpm build
```

Output: `dist/index.mjs`
